import { config } from './config.js';

const TIMEOUT_MS = 15000;

/** Semaine ISO 8601 d'une date AAAA-MM-JJ (le jeudi de la semaine détermine l'année ISO). */
export function isoWeek(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week };
}

function ficheUrl(fiche) {
  if (fiche.doi) return `https://doi.org/${fiche.doi}`;
  if (fiche.lien) return fiche.lien;
  if (fiche.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${fiche.pmid}/`;
  return null;
}

/** Une entrée par étude retenue, avec ces seuls champs. */
function metadataEtude(f) {
  return {
    type_etude: f.type_etude ?? null,
    niveau_de_preuve: f.niveau_de_preuve ?? null,
    confiance_extraction: f.confiance_extraction ?? null,
    pertinence_centre: f.pertinence_centre ?? null,
    doi: f.doi || null,
    pmid: f.pmid || null,
  };
}

/** Fiches citées dans le journal (ids valides, sans doublon) ; toutes les fiches en repli sans journal. */
function citedFiches(journal, fiches) {
  if (!journal) return fiches;
  const vus = new Set();
  const out = [];
  for (const { fiche_id: id } of [...(journal.a_la_une || []), ...(journal.en_bref || [])]) {
    if (!Number.isInteger(id) || id < 0 || id >= fiches.length || vus.has(id)) continue;
    vus.add(id);
    out.push(fiches[id]);
  }
  return out;
}

/**
 * Construit le payload du hub. `body` est le contenu envoyé par email (journal, ou rapport
 * détaillé en repli) ; `journal` peut être null si la rédaction a échoué.
 */
export function buildHubPayload({ journal, body, fiches, runDate, runId, retractees = [] }) {
  const { year, week } = isoWeek(runDate);
  const retenues = citedFiches(journal, fiches);
  const sources = retenues
    .map((f) => ({ title: f.titre, url: ficheUrl(f) }))
    .filter((s) => s.url);
  return {
    title: `Veille bien-être, semaine ${String(week).padStart(2, '0')}`,
    // L'avertissement ouvre le résumé : le hub l'affiche toujours, même sans déplier le corps.
    summary: [
      retractees.length ? `⚠️ ${retractees.length} publication(s) rétractée(s) : voir le détail dans l'article.` : '',
      journal?.chapeau || `${fiches.length} nouvelle(s) étude(s) analysée(s) cette semaine.`,
    ].filter(Boolean).join(' '),
    body,
    kind: 'info',
    kicker: 'Bien-être',
    sources,
    sensitivity: 'normal',
    metadata: { etudes: retenues.map(metadataEtude) },
    external_id: `${year}-W${String(week).padStart(2, '0')}`,
    run_id: runId,
  };
}

/**
 * Envoie la livraison au hub. Ne lève JAMAIS : toute erreur (réseau, HTTP) est journalisée
 * et renvoyée sous forme de résultat, pour ne pas faire échouer la veille ni l'email.
 * 201 = créée ; 200 = doublon (même external_id déjà reçu), considéré comme un succès.
 */
export async function sendToHub(payload, { enabled, url, token, fetchImpl = fetch } = config.hub) {
  if (!enabled) return { status: 'disabled' };
  if (!url || !token) {
    console.error('[veille] Hub activé mais HUB_URL ou HUB_TOKEN manquant — envoi ignoré.');
    return { status: 'skipped' };
  }
  try {
    const response = await fetchImpl(`${url.replace(/\/+$/, '')}/api/v1/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 200) {
      console.log(`[veille] Hub : livraison ${payload.external_id} déjà reçue (doublon), rien à faire.`);
      return { status: 'duplicate' };
    }
    if (response.ok) {
      console.log(`[veille] Hub : livraison ${payload.external_id} envoyée.`);
      return { status: 'sent' };
    }
    console.error(`[veille] Hub : réponse en erreur HTTP ${response.status} — la veille continue.`);
    return { status: 'error', httpStatus: response.status };
  } catch (err) {
    console.error(`[veille] Hub injoignable : ${err.message} — la veille continue.`);
    return { status: 'error', error: err.message };
  }
}
