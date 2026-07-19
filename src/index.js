import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { fetchRecentPubmedArticles, fetchReferenceAuthorArticles } from './sources/pubmed.js';
import { loadStore, saveStore, partitionNewArticles } from './store.js';
import { createAnthropicClient, extractFiche } from './extract.js';
import { buildRunMarkdown } from './markdown.js';
import { createTransport, sendVeilleReport } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'veille-shinrin-yoku');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY manquant — copie .env.example en .env et renseigne la clé.');
  }

  const runDate = todayIso();
  console.log(`[veille] Requête PubMed : ${config.pubmed.query} (max ${config.pubmed.maxResults} résultats)`);

  const motCleArticles = await fetchRecentPubmedArticles();
  console.log(`[veille] ${motCleArticles.length} article(s) récupéré(s) via recherche par mots-clés.`);

  const referenceArticles = await fetchReferenceAuthorArticles();
  console.log(`[veille] ${referenceArticles.length} article(s) récupéré(s) via recherche prioritaire par auteur (Qing Li, Yoshifumi Miyazaki).`);

  const articles = [...motCleArticles, ...referenceArticles];

  const store = await loadStore();
  const nouveauxArticles = partitionNewArticles(store, articles);
  console.log(`[veille] ${nouveauxArticles.length} article(s) réellement nouveau(x) après déduplication.`);

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

  const markdown = buildRunMarkdown(nouvellesFiches, { runDate, query: config.pubmed.query });

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
    subject: `Veille shinrin-yoku — ${nouvellesFiches.length} nouvelle(s) étude(s) — ${runDate}`,
    markdown,
    attachmentName: `veille-shinrin-yoku-${runDate}.md`,
  });
  console.log(`[veille] Email envoyé à ${config.recipients.join(', ')}`);
}

main().catch((err) => {
  console.error('[veille] Erreur fatale :', err);
  process.exitCode = 1;
});
