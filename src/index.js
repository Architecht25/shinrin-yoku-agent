import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { THEMES } from './themes.js';
import { fetchRecentPubmedArticles, fetchReferenceAuthorArticles } from './sources/pubmed.js';
import { loadStore, saveStore, partitionNewArticles } from './store.js';
import { createAnthropicClient, extractFiche } from './extract.js';
import { buildRunMarkdown } from './markdown.js';
import { createTransport, sendVeilleReport } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'veille-la-borbolla');

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

  const articles = [];
  for (const theme of THEMES) {
    articles.push(...(await fetchThemeArticles(theme)));
  }

  const store = await loadStore();
  // Déduplication tous thèmes confondus : une même étude ne doit être réintégrée qu'une
  // fois, même si elle correspond aux mots-clés de plusieurs thématiques à la fois.
  const nouveauxArticles = partitionNewArticles(store, articles);
  console.log(`[veille] ${nouveauxArticles.length} article(s) réellement nouveau(x) après déduplication (${THEMES.length} thématiques confondues).`);

  if (nouveauxArticles.length === 0) {
    console.log('[veille] Rien de nouveau — pas de fiche à créer, pas d’email envoyé.');
    return;
  }

  const client = createAnthropicClient();
  const nouvellesFiches = [];

  for (const article of nouveauxArticles) {
    console.log(`[veille] Extraction Claude : ${article.title.slice(0, 80)}...`);
    article._runDate = runDate;
    try {
      const fiche = await extractFiche(client, article);
      if (fiche) nouvellesFiches.push(fiche);
    } catch (err) {
      console.error(`[veille] Échec d'extraction pour "${article.title}" : ${err.message}`);
    }
  }

  if (nouvellesFiches.length === 0) {
    console.log('[veille] Aucune fiche exploitable produite — pas d’email envoyé.');
    return;
  }

  store.fiches.push(...nouvellesFiches);
  await saveStore(store);

  const markdown = buildRunMarkdown(nouvellesFiches, { runDate });

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${runDate}.md`);
  await writeFile(outputPath, markdown, 'utf-8');
  console.log(`[veille] Fiches enregistrées dans ${outputPath}`);

  if (config.recipients.length === 0) {
    console.log('[veille] Aucun destinataire configuré (RECIPIENT_EMAIL_1/2) — email non envoyé.');
    return;
  }

  const transport = createTransport();
  await sendVeilleReport({
    transport,
    subject: `Veille La Borbolla / Braña Sana — ${nouvellesFiches.length} nouvelle(s) étude(s) — ${runDate}`,
    markdown,
    attachmentName: `veille-la-borbolla-${runDate}.md`,
  });
  console.log(`[veille] Email envoyé à ${config.recipients.join(', ')}`);
}

main().catch((err) => {
  console.error('[veille] Erreur fatale :', err);
  process.exitCode = 1;
});
