/**
 * Types d'étude, et déduction par le code à partir des « Publication Types » PubMed.
 * Règle : quand PubMed est explicite, le code prime sur le modèle.
 */
export const INDETERMINE = 'indéterminé';

export const TYPES_ETUDE = [
  'revue systématique',
  'méta-analyse',
  'revue de portée',
  'revue narrative',
  'essai contrôlé randomisé',
  'étude observationnelle',
  'étude pilote',
  'étude qualitative',
  'article théorique ou perspective',
  INDETERMINE,
];

// Familles compatibles avec un « Review » seul : PubMed dit que c'est une revue, pas laquelle.
const FAMILLE_REVUE = ['revue narrative', 'revue systématique', 'revue de portée', 'méta-analyse', INDETERMINE];

/**
 * Renvoie { impose, permis } :
 *   impose : type fixé par le code (null sinon) ;
 *   permis : types que le modèle a le droit de choisir (null = toute la liste).
 */
export function contrainteType(publicationTypes = []) {
  const pt = new Set(publicationTypes.map((t) => t.toLowerCase().trim()));
  const a = (nom) => pt.has(nom);
  const impose = (type) => ({ impose: type, permis: [type] });

  // Un protocole n'a pas de résultats, même s'il décrit un essai randomisé.
  if (a('clinical trial protocol')) return impose(INDETERMINE);
  if (a('meta-analysis')) return impose('méta-analyse');
  if (a('scoping review')) return impose('revue de portée');
  if (a('systematic review')) return impose('revue systématique');

  const rct = a('randomized controlled trial');
  const observationnelle = a('observational study');
  if (rct && observationnelle) {
    return { impose: null, permis: ['essai contrôlé randomisé', 'étude observationnelle', INDETERMINE] };
  }
  if (rct) return impose('essai contrôlé randomisé');
  if (observationnelle) return impose('étude observationnelle');

  if (a('review')) return { impose: null, permis: FAMILLE_REVUE };
  if (a('editorial') || a('comment')) return impose('article théorique ou perspective');

  return { impose: null, permis: null };
}

/** Applique la contrainte PubMed au choix du modèle. */
export function resoudreType(publicationTypes, typeModele) {
  const { impose, permis } = contrainteType(publicationTypes);
  if (impose) return { type: impose, origine: 'code' };
  if (permis && !permis.includes(typeModele)) return { type: INDETERMINE, origine: 'code' };
  return { type: typeModele, origine: 'modèle' };
}
