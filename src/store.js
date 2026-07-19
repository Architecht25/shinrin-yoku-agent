import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Clé de dédoublonnage : DOI normalisé si disponible, sinon titre normalisé.
 * Le DOI est la clé la plus fiable ; le titre est un fallback pour les essais
 * en cours ou les sources qui n'exposent pas de DOI.
 */
export function dedupKey(fiche) {
  if (fiche.doi) return `doi:${fiche.doi.toLowerCase().trim()}`;
  return `title:${normalizeTitle(fiche.titre)}`;
}

export async function loadStore() {
  try {
    const raw = await readFile(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { fiches: [] };
    throw err;
  }
}

export async function saveStore(store) {
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Sépare les articles bruts déjà connus (par DOI/titre) de ceux réellement nouveaux.
 */
export function partitionNewArticles(store, articles) {
  const knownKeys = new Set(
    store.fiches.map((f) => dedupKey({ doi: f.doi, titre: f.titre }))
  );
  const seenInBatch = new Set();
  const nouveaux = [];

  for (const article of articles) {
    const key = dedupKey({ doi: article.doi, titre: article.title });
    if (knownKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    nouveaux.push(article);
  }

  return nouveaux;
}
