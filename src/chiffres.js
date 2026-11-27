/**
 * Contrôle par le code : tout chiffre d'un texte généré doit se retrouver dans sa source.
 * Volontairement strict : un arrondi ou une conversion d'unité compte comme absent.
 */
const MOTS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const DIZAINES = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNITES = Object.keys(MOTS).slice(0, 9).join('|');

const canon = (n) => String(Number(n));

/**
 * Chiffres écrits dans un texte. Les chiffres collés à un sigle (SF-36, COVID-19, CO2,
 * 5-HT, 3D) font partie d'un nom et sont ignorés.
 */
function chiffresDe(texte) {
  return [...texte.matchAll(/\d+(?:\.\d+)?/g)]
    .filter((m) => {
      const avant = texte.slice(0, m.index);
      const apres = texte.slice(m.index + m[0].length);
      return !/\p{L}[-‐‑]?$/u.test(avant) && !/^(?:[-‐‑]?\p{Lu}{1,}(?!\p{Ll})|D\b)/u.test(apres);
    })
    .map((m) => m[0]);
}

const grouperMilliers = (texte, separateurs) =>
  texte.replace(new RegExp(`(?<![\\d.,])\\d{1,3}(?:[${separateurs}]\\d{3})+(?!\\d)`, 'g'), (n) => n.replace(/\D/g, ''));

/** Texte généré, en français : espace pour les milliers, virgule décimale. */
function chiffresGeneres(texte) {
  const normalise = grouperMilliers(String(texte || ''), ' \\u00a0\\u202f\\u2009').replace(/(\d),(?=\d)/g, '$1.');
  return chiffresDe(normalise);
}

/** Valeurs présentes dans la source (anglais ou français), nombres en toutes lettres compris. */
export function valeursSource(source) {
  const brut = String(source || '').replace(/(\d)·(?=\d)/g, '$1.').replace(/(^|[^\d])\.(\d)/g, '$1 0.$2');
  // Les séparateurs sont ambigus : on retient les deux lectures.
  const lectures = [
    brut,
    grouperMilliers(brut, ', \\u00a0\\u202f\\u2009'),
    brut.replace(/(\d),(?=\d)/g, '$1.'),
  ];
  const valeurs = new Set(lectures.flatMap((l) => (l.match(/\d+(?:\.\d+)?/g) || []).map(canon)));

  const bas = brut.toLowerCase();
  const compose = new RegExp(`\\b(${Object.keys(DIZAINES).join('|')})(?:[- ](${UNITES}))?\\b`, 'g');
  for (const [, d, u] of bas.matchAll(compose)) valeurs.add(canon(DIZAINES[d] + (u ? MOTS[u] : 0)));
  for (const mot of bas.match(/[a-z]+/g) || []) {
    if (mot in MOTS) valeurs.add(canon(MOTS[mot]));
  }
  return valeurs;
}

export function chiffresAbsents(texte, valeurs) {
  return [...new Set(chiffresGeneres(texte).filter((n) => !valeurs.has(canon(n))))];
}

export function decouperPhrases(texte) {
  return String(texte || '')
    .split(/(?<=;)\s+|(?<=[.!?])\s+(?=[\p{Lu}\d«"(])/u)
    .filter((p) => p.trim());
}

/** Retire chaque phrase (ou membre séparé par « ; ») qui porte un chiffre absent de la source. */
export function retirerPhrasesNonSourcees(texte, valeurs) {
  const retires = [];
  const gardees = decouperPhrases(texte).filter((phrase) => {
    const absents = chiffresAbsents(phrase, valeurs);
    retires.push(...absents);
    return absents.length === 0;
  });
  return { texte: retires.length ? gardees.join(' ') : String(texte || ''), retires: [...new Set(retires)] };
}
