import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { THEMES } from './themes.js';
import { fetchRecentPubmedArticles, fetchReferenceAuthorArticles } from './sources/pubmed.js';
import { loadStore, saveStore, partitionNewArticles } from './store.js';
import { createAnthropicClient, extractFiche, estExploitable } from './extract.js';
import { redigerJournal, journalToMarkdown, decrireFiches } from './digest.js';
import { verifierFiche } from './verification.js';
import { verifierJournal } from './verification-journal.js';
import { buildRunMarkdown } from './markdown.js';
import { createTransport, sendVeilleReport } from './email.js';
import { writeDashboard } from './exportHtml.js';
import { separerPreuve, enregistrerPreuves } from './preuves.js';
import { buildHubPayload, sendToHub } from './hub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'veille-la-borbolla');
const PREUVES_DIR = path.join(__dirname, '..', 'data', 'abstracts');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Récupère les articles bruts (mots-clés + chercheurs de référence) pour une thématique,
 * et les étiquette avec cette thématique pour le reste du pipeline.
 */
async function fetchThemeArticles(theme) {
  const motCleArticles = await fetchRecentPubmedArticles({ query: theme.pubmedQuery });
  console.log(`[veille] ${theme.label} : ${motCleArticles.length} article(s) via recherche par mots-clés.`);

  let referenceArticles = [];
  if (theme.referenceAuthors.length > 0) {
    referenceArticles = await fetchReferenceAuthorArticles({
      query: theme.pubmedQuery,
      authors: theme.referenceAuthors,
    });
    const noms = theme.referenceAuthors.map((a) => a.nom).join(', ');
    console.log(`[veille] ${theme.label} : ${referenceArticles.length} article(s) via recherche prioritaire par auteur (${noms}).`);
  }

  return [...motCleArticles, ...referenceArticles].map((article) => ({
    ...article,
    thematiqueId: theme.id,
    thematiqueLabel: theme.label,
  }));
}

async function main() {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY manquant — copie .env.example en .env et renseigne la clé.');
  }

  const runDate = todayIso();

  const themes = config.themeIds.length > 0 ? THEMES.filter((t) => config.themeIds.includes(t.id)) : THEMES;
  if (themes.length === 0) {
    throw new Error(`VEILLE_THEMES ne correspond à aucune thématique connue (${THEMES.map((t) => t.id).join(', ')}).`);
  }

  const articles = [];
  for (const theme of themes) {
    articles.push(...(await fetchThemeArticles(theme)));
  }

  const store = await loadStore();
  // Déduplication tous thèmes confondus : une même étude ne doit être réintégrée qu'une
  // fois, même si elle correspond aux mots-clés de plusieurs thématiques à la fois.
  const nouveauxArticles = partitionNewArticles(store, articles);
  console.log(`[veille] ${nouveauxArticles.length} article(s) réellement nouveau(x) après déduplication (${themes.length} thématique(s) confondue(s)).`);

  if (nouveauxArticles.length === 0) {
    console.log('[veille] Rien de nouveau — pas de fiche à créer, pas d’email envoyé.');
    return;
  }

  const client = createAnthropicClient();
  const nouvellesFiches = [];
  const echecs = [];
  const preuves = [];

  for (const article of nouveauxArticles) {
    console.log(`[veille] Extraction Claude : ${article.title.slice(0, 80)}...`);
    article._runDate = runDate;
    let { fiche, preuve } = separerPreuve(await extractFiche(client, article), article);
    if (estExploitable(fiche)) {
      ({ fiche, preuve } = await verifierFiche(client, fiche, preuve));
      const { statut, raison } = fiche.verification;
      console.log(`[veille] Vérification : ${statut}${raison ? ` — ${raison}` : ''}`);
    }
    preuves.push(preuve);
    if (estExploitable(fiche)) nouvellesFiches.push(fiche);
    else {
      echecs.push(fiche);
      console.error(`[veille] Extraction échouée pour "${article.title}" : ${fiche.raison_echec}`);
    }
  }

  if (nouvellesFiches.length === 0) {
    console.log('[veille] Aucune fiche exploitable produite — pas d’email envoyé.');
    return;
  }

  store.fiches.push(...nouvellesFiches, ...echecs);
  await enregistrerPreuves(PREUVES_DIR, preuves);
  await saveStore(store);

  // Publication hebdomadaire : uniquement les fiches nouvelles de ce run (la base complète
  // reste dans data/db.json ; `npm run dashboard` régénère un tableau de bord complet en local).
  const dashboardPath = await writeDashboard({ fiches: nouvellesFiches });
  console.log(`[veille] Tableau de bord régénéré dans ${dashboardPath}`);

  const fichesMarkdown = buildRunMarkdown(nouvellesFiches, { runDate, dashboardUrl: config.dashboardUrl });

  // Journal lisible (priorité à ce qui est applicable à La Borbolla) ; si la rédaction
  // échoue, on retombe sur le rapport détaillé plutôt que de ne rien envoyer.
  let journalMarkdown = null;
  let journal = null;
  const fichesJournal = nouvellesFiches.filter((f) => f.verification.journal !== 'exclue');
  try {
    if (fichesJournal.length === 0) throw new Error('aucune fiche retenue après vérification');
    const brouillon = await redigerJournal(client, fichesJournal);
    const controle = await verifierJournal(client, brouillon, fichesJournal, decrireFiches(fichesJournal));
    journal = controle.journal;
    for (const { phrase, raison } of controle.suppressions) {
      console.log(`[veille] Journal, phrase supprimée : « ${phrase} » (${raison})`);
    }
    journalMarkdown = journalToMarkdown(journal, fichesJournal, {
      runDate,
      dashboardUrl: config.dashboardUrl,
      total: nouvellesFiches.length,
    });
  } catch (err) {
    journal = null;
    console.error(`[veille] Échec de la rédaction ou du contrôle du journal, repli sur le rapport détaillé : ${err.message}`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const fichesPath = path.join(OUTPUT_DIR, `${runDate}${journalMarkdown ? '-fiches' : ''}.md`);
  await writeFile(fichesPath, fichesMarkdown, 'utf-8');
  if (journalMarkdown) await writeFile(path.join(OUTPUT_DIR, `${runDate}.md`), journalMarkdown, 'utf-8');
  console.log(`[veille] Sorties écrites dans ${OUTPUT_DIR} (${runDate})`);

  // Hub d'agents (en plus de l'email) : placé avant l'email pour être livré même si l'envoi
  // SMTP échoue ; ne lève jamais.
  await sendToHub(
    buildHubPayload({
      journal: journalMarkdown ? journal : null,
      body: journalMarkdown || fichesMarkdown,
      fiches: journal ? fichesJournal : nouvellesFiches,
      runDate,
      runId: process.env.GITHUB_RUN_ID || `local-${new Date().toISOString()}`,
    })
  );

  if (config.recipients.length === 0) {
    console.log('[veille] Aucun destinataire configuré (RECIPIENT_EMAIL_1/2) — email non envoyé.');
    return;
  }

  const transport = createTransport();
  await sendVeilleReport({
    transport,
    subject: `Veille La Borbolla / Braña Sana — ${journalMarkdown ? 'Le journal de la semaine' : `${nouvellesFiches.length} nouvelle(s) étude(s)`} — ${runDate}`,
    markdown: journalMarkdown || fichesMarkdown,
    attachmentName: `veille-la-borbolla-${runDate}-fiches.md`,
    attachmentContent: fichesMarkdown,
  });
  console.log(`[veille] Email envoyé à ${config.recipients.join(', ')}`);
}

main().catch((err) => {
  console.error('[veille] Erreur fatale :', err);
  process.exitCode = 1;
});
