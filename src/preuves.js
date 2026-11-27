/**
 * Données de vérification de chaque fiche, hors de data/db.json pour ne pas l'alourdir :
 * data/abstracts/<année du run>.json, indexé par PMID.
 *
 * Le texte des résumés n'est jamais écrit : le dépôt est public et ils peuvent être protégés
 * par le droit d'auteur. Il sert en mémoire pendant le run ; seule son empreinte est gardée,
 * pour savoir si le texte redemandé à PubMed par le PMID est celui qui a été vérifié.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { lireJson, ecrireJson } from './store.js';

/** SHA-256 du résumé tel que le parseur le produit ; null sans résumé. */
export function empreinteResume(resume) {
  return resume ? createHash('sha256').update(resume, 'utf-8').digest('hex') : null;
}

export function clePreuve(article) {
  return article.pmid || article.doi || article.title;
}

/**
 * Sépare les origines (rangées avec les preuves) du reste de la fiche (rangé dans db.json).
 */
export function separerPreuve(fiche, article) {
  const { origines = {}, ...sansOrigines } = fiche;
  return {
    fiche: sansOrigines,
    preuve: {
      cle: clePreuve(article),
      pmid: article.pmid || null,
      doi: article.doi || null,
      titre_pubmed: article.title,
      resume: article.abstract || '',
      publication_types: article.publicationTypes || [],
      ajoute_le: article._runDate,
      sources_champs: origines,
    },
  };
}

export async function enregistrerPreuves(dossier, preuves) {
  const parAnnee = new Map();
  for (const preuve of preuves) {
    const annee = preuve.ajoute_le.slice(0, 4);
    if (!parAnnee.has(annee)) parAnnee.set(annee, []);
    parAnnee.get(annee).push(preuve);
  }
  for (const [annee, liste] of parAnnee) {
    const chemin = path.join(dossier, `${annee}.json`);
    const contenu = await lireJson(chemin, {});
    for (const { cle, resume, ...donnees } of liste) {
      contenu[cle] = { ...donnees, resume_sha256: empreinteResume(resume) };
    }
    await ecrireJson(chemin, contenu);
  }
}
