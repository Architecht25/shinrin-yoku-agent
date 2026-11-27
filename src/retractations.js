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
  try {
    const articles = await parPmids(suivies.map((f) => f.pmid));
    const retractes = new Set(articles.filter(estRetracte).map((a) => a.pmid));
    if (articles.length < suivies.length) {
      console.error(`[veille] Rétractations : ${suivies.length - articles.length} fiche(s) non retrouvée(s) sur PubMed, à surveiller.`);
    }
    const nouvelles = suivies.filter((f) => retractes.has(f.pmid));
    nouvelles.forEach((f) => { f.avertissement_retractation = { detectee_le: runDate }; });
    console.log(`[veille] Rétractations : ${suivies.length} fiche(s) revérifiée(s), ${nouvelles.length} nouvelle(s) rétractation(s).`);
    return nouvelles;
  } catch (err) {
    console.error(`[veille] Revérification des rétractations impossible, reportée au prochain run : ${err.message}`);
    return [];
  }
}
