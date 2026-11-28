import { LOT_EFETCH } from './sources/pubmed.js';

/**
 * Rétractations : exclusion à la collecte, et revérification à chaque run des fiches des
 * douze dernières semaines.
 */
export const FENETRE_JOURS = 12 * 7;

const TYPES = ['retracted publication', 'retraction of publication'];

/** `retracte` est posé par le parseur quand PubMed signale un avis de rétractation lié. */
export const estRetracte = (article) =>
  Boolean(article.retracte) || (article.publicationTypes || []).some((t) => TYPES.includes(t.toLowerCase().trim()));

/**
 * Marque les fiches récentes devenues rétractées et les renvoie (chacune une seule fois).
 * Ne lève pas : une panne de PubMed ne doit pas empêcher la veille ; la vérification sera
 * refaite au run suivant.
 */
export async function verifierRetractations(store, runDate, parPmids) {
  const limite = new Date(Date.parse(runDate) - FENETRE_JOURS * 86400000).toISOString().slice(0, 10);
  const suivies = store.fiches.filter(
    (f) => f.pmid && f.statut !== 'extraction échouée' && !f.avertissement_retractation && f.ajoute_le >= limite
  );
  if (!suivies.length) return [];
  // Lot par lot : un lot refusé ne fait pas perdre la vérification des autres.
  const articles = [];
  const verifiees = [];
  let erreur;
  for (let i = 0; i < suivies.length; i += LOT_EFETCH) {
    const lot = suivies.slice(i, i + LOT_EFETCH);
    try {
      articles.push(...(await parPmids(lot.map((f) => f.pmid))));
      verifiees.push(...lot);
    } catch (err) {
      erreur = err;
    }
  }
  if (erreur) {
    console.error(`[veille] Rétractations : ${suivies.length - verifiees.length} fiche(s) non revérifiée(s), reportée(s) au prochain run : ${erreur.message}`);
  }
  if (!verifiees.length) return [];
  const retractes = new Set(articles.filter(estRetracte).map((a) => a.pmid));
  if (articles.length < verifiees.length) {
    console.error(`[veille] Rétractations : ${verifiees.length - articles.length} fiche(s) non retrouvée(s) sur PubMed, à surveiller.`);
  }
  const nouvelles = verifiees.filter((f) => retractes.has(f.pmid));
  nouvelles.forEach((f) => { f.avertissement_retractation = { detectee_le: runDate }; });
  console.log(`[veille] Rétractations : ${verifiees.length} fiche(s) revérifiée(s) sur ${suivies.length}, ${nouvelles.length} nouvelle(s) rétractation(s).`);
  return nouvelles;
}
