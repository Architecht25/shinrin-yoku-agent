/** Fenêtre de collecte PubMed : depuis la dernière collecte réussie, avec une marge. */
export const MARGE_JOURS = 3;
export const FENETRE_MIN = 10;
export const FENETRE_MAX = 90;

export function fenetreCollecte(etat, store, aujourdhui) {
  const derniere = etat?.derniere_collecte || store.fiches.map((f) => f.ajoute_le).filter(Boolean).sort().at(-1);
  if (!derniere) return { jours: FENETRE_MIN, tronquee: false };
  const ecart = Math.round((Date.parse(aujourdhui) - Date.parse(derniere)) / 86400000) + MARGE_JOURS;
  return { jours: Math.min(FENETRE_MAX, Math.max(FENETRE_MIN, ecart)), tronquee: ecart > FENETRE_MAX };
}
