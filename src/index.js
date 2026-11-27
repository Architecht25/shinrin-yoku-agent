/**
 * Point d'entrée d'un run.
 *   node src/index.js             préparation puis envoi (usage local)
 *   node src/index.js --preparer  collecte, fiches, journal, base et file des envois
 *   node src/index.js --envoyer   envoi de ce qui est en file (e-mail, puis hub)
 *   node src/index.js --dry-run   run complet écrit dans tmp/replay/, sans aucun envoi
 * En CI, la base est commitée et poussée entre --preparer et --envoyer.
 */
import path from 'node:path';
import { mkdir, rm, copyFile } from 'node:fs/promises';

import { config } from './config.js';
import { THEMES } from './themes.js';
import { chemins, RACINE_REPLAY } from './chemins.js';
import { preparer } from './preparation.js';
import { envoyer, simulerEnvoi } from './envoi.js';

const OPTIONS = ['--preparer', '--envoyer', '--dry-run'];

/** Repart d'une copie de la base et de l'état réels, avec une file vide. */
async function initialiserReplay() {
  const reel = chemins();
  const essai = chemins(RACINE_REPLAY);
  await rm(RACINE_REPLAY, { recursive: true, force: true });
  await mkdir(path.dirname(essai.db), { recursive: true });
  for (const cle of ['db', 'etat']) {
    await copyFile(reel[cle], essai[cle]).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
  return essai;
}

async function main() {
  const args = process.argv.slice(2);
  const inconnue = args.find((a) => !OPTIONS.includes(a));
  // Une option mal tapée ne doit pas lancer un vrai run.
  if (inconnue || args.length > 1) throw new Error(`Options acceptées, une seule à la fois : ${OPTIONS.join(', ')}.`);
  const mode = args[0] || 'complet';
  const dryRun = mode === '--dry-run';
  const emplacements = dryRun ? await initialiserReplay() : chemins();

  if (mode !== '--envoyer') {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY manquant — copie .env.example en .env et renseigne la clé.');
    }
    const themes = config.themeIds.length > 0 ? THEMES.filter((t) => config.themeIds.includes(t.id)) : THEMES;
    if (themes.length === 0) {
      throw new Error(`VEILLE_THEMES ne correspond à aucune thématique connue (${THEMES.map((t) => t.id).join(', ')}).`);
    }
    await preparer({
      themes,
      toutes: themes.length === THEMES.length,
      emplacements,
      runDate: new Date().toISOString().slice(0, 10),
      runId: process.env.GITHUB_RUN_ID || `local-${new Date().toISOString()}`,
      dashboardUrl: config.dashboardUrl,
    });
  }

  if (mode === '--preparer') return;

  const echecs = dryRun
    ? await simulerEnvoi(emplacements, path.join(RACINE_REPLAY, 'envois'))
    : await envoyer(emplacements);
  if (dryRun) console.log(`[veille] Essai à blanc terminé, rien n'a été envoyé : ${RACINE_REPLAY}`);
  // L'e-mail en échec signale le run en erreur ; le hub est seulement repris plus tard.
  if (echecs.email > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[veille] Erreur fatale :', err);
  process.exitCode = 1;
});
