/**
 * Niveau de preuve : valeurs, attribution par le code et règles de prudence.
 * Quatre notions distinctes sur chaque fiche : type_etude, niveau_de_preuve,
 * confiance_extraction et pertinence_centre (qui ne dit rien de la force de la preuve).
 */
export const NIVEAUX = {
  CONTROLE: 'essai contrôlé',
  SYNTHESE: "synthèse d'études",
  OBSERVATIONNELLE: 'observationnelle',
  EXPLORATOIRE: 'exploratoire',
  OPINION: 'opinion ou revue narrative',
  INDETERMINE: 'indéterminé',
};
export const LISTE_NIVEAUX = Object.values(NIVEAUX);
export const NIVEAU_NON_EVALUE = 'non évalué';

export const CONFIANCE = { VERIFIE: 'vérifié', A_CONFIRMER: 'à confirmer' };

/** Étiquettes des sources hors PubMed (sessions du parcours d'étude). */
export const NIVEAUX_HORS_PUBMED = [
  'recherche contrôlée', "synthèse d'études", 'observationnelle', 'tradition ou pratique', 'cadre populaire',
];

/** Ces niveaux ne vont à la une qu'avec un avertissement explicite (voir digest.js). */
export const NIVEAUX_A_SIGNALER = [NIVEAUX.OPINION, NIVEAUX.INDETERMINE];

/**
 * Ce que les Publication Types PubMed disent clairement.
 * Renvoie { impose, permis, motif } (même contrat que contrainteType).
 */
export function niveauParPubmed(publicationTypes = []) {
  const declares = new Map(publicationTypes.map((t) => [t.toLowerCase().trim(), t]));
  const premier = (...noms) => noms.map((n) => declares.get(n)).find(Boolean);
  const fixe = (niveau, motif) => ({ impose: niveau, permis: [niveau], motif });

  let motif;
  if ((motif = premier('clinical trial protocol'))) return fixe(NIVEAUX.INDETERMINE, motif);
  if ((motif = premier('meta-analysis', 'systematic review', 'scoping review'))) return fixe(NIVEAUX.SYNTHESE, motif);

  const essai = premier('randomized controlled trial', 'controlled clinical trial');
  const observation = premier('observational study', 'cohort', 'cohort studies', 'case-control', 'case-control studies');
  if (essai && observation) {
    return { impose: null, permis: [NIVEAUX.CONTROLE, NIVEAUX.OBSERVATIONNELLE, NIVEAUX.EXPLORATOIRE, NIVEAUX.INDETERMINE] };
  }
  if (essai) return fixe(NIVEAUX.CONTROLE, essai);
  if (observation) return fixe(NIVEAUX.OBSERVATIONNELLE, observation);

  // « Review » seul ne dit pas si la recherche des études était systématique.
  if (premier('review')) return { impose: null, permis: [NIVEAUX.OPINION, NIVEAUX.SYNTHESE, NIVEAUX.INDETERMINE] };
  if ((motif = premier('editorial', 'comment'))) return fixe(NIVEAUX.OPINION, motif);

  return { impose: null, permis: null };
}

const aplatir = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** L'extrait avancé par le modèle doit se retrouver tel quel dans le résumé. */
export function extraitPresent(extrait, resume) {
  const e = aplatir(extrait).replace(/[.…"«»]+$/g, '').replace(/^["«»]+/, '');
  return e.length >= 15 && aplatir(resume).includes(e);
}

/** Niveau avant vérification : le code d'abord, sinon la proposition justifiée du modèle. */
export function resoudreNiveau(article, { niveau_propose: propose, extrait_justification: extrait, justification_niveau: justification }) {
  const { impose, permis, motif } = niveauParPubmed(article.publicationTypes);
  if (impose) return { niveau: impose, justification: `Publication Type PubMed : ${motif}.`, origine: 'code' };
  const recevable =
    propose !== NIVEAUX.INDETERMINE &&
    (!permis || permis.includes(propose)) &&
    justification?.trim() &&
    extraitPresent(extrait, article.abstract);
  if (recevable) return { niveau: propose, justification: justification.trim(), origine: 'modèle' };
  return {
    niveau: NIVEAUX.INDETERMINE,
    justification: 'Métadonnées PubMed non concluantes, sans justification tirée du résumé.',
    origine: 'code',
  };
}

/**
 * Règles de prudence, appliquées en dernier : elles priment sur PubMed, le modèle et la
 * vérification, et ne font jamais monter un niveau.
 */
export function appliquerPrudence({ type, niveau, effectif, titre }, seuilEchantillon) {
  const regle = (n, motif) => ({ niveau: n, motif: n === niveau ? null : motif });
  if (niveau === NIVEAUX.INDETERMINE && !['revue narrative', 'article théorique ou perspective', 'étude pilote'].includes(type)) {
    return { niveau, motif: null };
  }
  if (type === 'revue narrative' || type === 'article théorique ou perspective' || niveau === NIVEAUX.OPINION) {
    return regle(NIVEAUX.OPINION, `Règle de prudence : ${type} limité à « ${NIVEAUX.OPINION} ».`);
  }
  if (type === 'étude pilote' || /\b(pilot|feasibility)\b/i.test(titre || '')) {
    return regle(NIVEAUX.EXPLORATOIRE, 'Règle de prudence : étude pilote ou de faisabilité.');
  }
  if (type === 'étude qualitative') return regle(NIVEAUX.EXPLORATOIRE, 'Règle de prudence : étude qualitative.');
  // La taille d'échantillon ne s'applique pas aux synthèses (qui comptent des études).
  if (niveau !== NIVEAUX.SYNTHESE && effectif > 0 && effectif < seuilEchantillon) {
    return regle(NIVEAUX.EXPLORATOIRE, `Règle de prudence : échantillon de moins de ${seuilEchantillon} personnes.`);
  }
  return { niveau, motif: null };
}

/** Étiquettes affichées : toujours lues sur la fiche, jamais dans un texte généré. */
export function etiquettes(fiche) {
  return {
    type: fiche.type_etude || 'indéterminé',
    niveau: fiche.niveau_de_preuve || NIVEAU_NON_EVALUE,
    confiance: fiche.confiance_extraction || NIVEAU_NON_EVALUE,
  };
}

export function ligneEtiquettes(fiche, separateur = ' — ') {
  const e = etiquettes(fiche);
  return [e.type, `niveau de preuve : ${e.niveau}`, `extraction : ${e.confiance}`].join(separateur);
}

export const estObservationnelle = (fiche) =>
  fiche.niveau_de_preuve === NIVEAUX.OBSERVATIONNELLE || fiche.type_etude === 'étude observationnelle';

const CONJUGUES = [
  'réduisent', 'réduirait', 'réduiraient', 'réduit', 'diminue', 'diminuent', 'diminuerait',
  'augmente', 'augmentent', 'augmenterait', 'améliore', 'améliorent', 'améliorerait', 'amélioreraient',
  'entraîne', 'entraînent', 'entraînerait', 'provoque', 'provoquent', 'cause', 'causent',
  'protège', 'protègent', 'protégerait', 'favorise', 'favorisent', 'favoriserait',
  'prévient', 'préviennent', 'aggrave', 'aggravent', 'induit', 'induisent', 'génère', 'génèrent',
];
const INFINITIFS = ['réduire', 'diminuer', 'augmenter', 'améliorer', 'entraîner', 'provoquer', 'causer', 'protéger', 'favoriser', 'prévenir', 'aggraver', 'induire'];
const PARTICIPES = ['diminué', 'augmenté', 'amélioré', 'entraîné', 'provoqué', 'causé', 'protégé', 'favorisé', 'prévenu', 'aggravé'];
const BORD = '(?<![\\p{L}-])';
const FIN = '(?![\\p{L}-])';
const VERBE = new RegExp(
  `${BORD}(?:${[...CONJUGUES, ...INFINITIFS].join('|')}|(?:a|ont|avait|aurait|auraient) (?:\\p{L}+ment )?(?:${PARTICIPES.join('|')})|perme(?:t|ttent|ttrait) (?:de|d['’])|condui(?:t|sent) à)${FIN}`,
  'giu'
);
// Emplois qui n'affirment rien : adjectif ou nom, but poursuivi, question ou négation.
const ADJECTIF_OU_NOM = /(?:risque|score|niveau|taux|temps|nombre|volume|échantillon|effectif|durée|qualité|groupe|plus|moins|très|de|la|une|sa|leur)\s+$/iu;
const BUT = /(?:pour|visant à|vise à|afin de|afin d['’]|chercher? à)\s+(?:\p{L}+ment\s+)?$/iu;
const NON_AFFIRME = /(?<![\p{L}])(?:pas|aucun|aucune|sans|ni|si)(?![\p{L}])|(?<![\p{L}])s['’]il/iu;

/** Premier verbe causal affirmé dans un texte français, ou null. */
export function verbeCausal(texte) {
  for (const proposition of String(texte || '').split(/[,;:.!?()]|\s(?:mais|tandis que|alors que)\s/u)) {
    for (const m of proposition.matchAll(VERBE)) {
      const avant = proposition.slice(0, m.index);
      const mot = m[0].toLowerCase();
      if (NON_AFFIRME.test(avant)) continue;
      if ((mot === 'réduit' || mot === 'cause') && ADJECTIF_OU_NOM.test(avant)) continue;
      if (INFINITIFS.includes(mot) && BUT.test(avant)) continue;
      return m[0];
    }
  }
  return null;
}
