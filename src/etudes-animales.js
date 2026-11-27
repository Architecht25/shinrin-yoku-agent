/**
 * Second filtre après la recherche PubMed : les exclusions de la requête reposent sur
 * quelques mots et sur l'indexation MeSH, absente des articles très récents.
 */
const HUMAINS = /\b(?:humans?|participants|patients|adults|children|adolescents|students|people|women|men|workers|volunteers|infants)\b/i;
const TITRE = /\b(?:rats?|mice|mouse|murine|rodents?|zebrafish|drosophila|piglets?|broilers?|swine)\b/i;
const RESUME =
  /\b(?:rat|mouse|murine|rodent|animal) models?\b|\b(?:Wistar|Sprague[- ]Dawley|C57BL)|\b(?:male|female|adult|pregnant|aged|young) (?:rats|mice)\b|\b(?:rats|mice) were\b/i;

/**
 * Vrai si le titre ou le résumé décrit un travail sur l'animal sans rien dire d'humains.
 * Une revue ou une étude qui mentionne aussi des humains est gardée.
 */
export function estEtudeAnimale({ title = '', abstract = '' }) {
  if (TITRE.test(title)) return !HUMAINS.test(title);
  return RESUME.test(abstract) && !HUMAINS.test(`${title} ${abstract}`);
}
