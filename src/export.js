import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadStore } from './store.js';
import { buildFullExportMarkdown } from './markdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'veille-la-borbolla');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'base-de-connaissances.md');

async function main() {
  const store = await loadStore();
  const markdown = buildFullExportMarkdown(store.fiches);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, markdown, 'utf-8');
  console.log(`[export] ${store.fiches.length} fiche(s) exportée(s) vers ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[export] Erreur :', err);
  process.exitCode = 1;
});
