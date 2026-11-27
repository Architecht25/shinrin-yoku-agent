import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
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

export function normaliserDoi(doi) {
  return String(doi || '')
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, '');
}

/**
 * Clé de dédoublonnage historique : DOI normalisé si disponible, sinon titre normalisé.
 */
export function dedupKey(fiche) {
  const doi = normaliserDoi(fiche.doi);
  if (doi) return `doi:${doi}`;
  return `title:${normalizeTitle(fiche.titre)}`;
}

/** Toutes les clés d'une étude : le PMID et le DOI (le titre si le DOI manque). */
export function dedupKeys({ pmid, doi, titre }) {
  const cles = [dedupKey({ doi, titre })];
  if (pmid) cles.push(`pmid:${String(pmid).trim()}`);
  return cles.filter((c) => c !== 'title:');
}

export async function loadStore(dbPath = DB_PATH) {
  try {
    const raw = await readFile(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { fiches: [] };
    throw err;
  }
}

/** Écriture atomique : un fichier interrompu en cours d'écriture ne remplace pas l'ancien. */
export async function ecrireJson(chemin, valeur) {
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(`${chemin}.tmp`, JSON.stringify(valeur, null, 2), 'utf-8');
  await rename(`${chemin}.tmp`, chemin);
}

export async function lireJson(chemin, defaut) {
  try {
    return JSON.parse(await readFile(chemin, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return defaut;
    throw err;
  }
}

export async function saveStore(store, dbPath = DB_PATH) {
  await ecrireJson(dbPath, store);
}

/**
 * Sépare les articles bruts déjà connus (par PMID, DOI ou titre) de ceux réellement nouveaux.
 */
export function partitionNewArticles(store, articles) {
  // Une fiche « extraction échouée » ne bloque pas une nouvelle tentative.
  const connues = new Set(
    store.fiches.filter((f) => f.statut !== 'extraction échouée').flatMap((f) => dedupKeys(f))
  );
  const nouveaux = [];

  for (const article of articles) {
    const cles = dedupKeys({ pmid: article.pmid, doi: article.doi, titre: article.title });
    if (cles.some((c) => connues.has(c))) continue;
    cles.forEach((c) => connues.add(c));
    nouveaux.push(article);
  }

  return nouveaux;
}
