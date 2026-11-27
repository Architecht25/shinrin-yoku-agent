import { config } from '../config.js';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function commonParams() {
  const params = new URLSearchParams();
  if (config.pubmed.apiKey) params.set('api_key', config.pubmed.apiKey);
  if (config.pubmed.toolName) params.set('tool', config.pubmed.toolName);
  if (config.pubmed.contactEmail) params.set('email', config.pubmed.contactEmail);
  return params;
}

// NCBI limite les E-utilities à 3 requêtes/seconde sans clé API (10/s avec).
// Un run complet enchaîne un appel par thématique (mot-clé + chercheurs de référence
// éventuels) — ce délai minimal entre requêtes évite un 429 sur un run sans
// PUBMED_API_KEY configurée, même avec plusieurs thématiques enchaînées.
const MIN_DELAY_MS = config.pubmed.apiKey ? 110 : 400;
let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

// Le débit ciblé par MIN_DELAY_MS suppose qu'on est seul sur notre IP ; sur les
// runners GitHub Actions (IP partagée avec d'autres jobs), le 429 de NCBI survient
// quand même de temps en temps. On absorbe ça par quelques retries avec backoff
// (respecte l'en-tête Retry-After si NCBI le fournit) plutôt que de faire échouer
// tout le run pour un pic de charge passager.
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1000;

async function fetchWithRetry(url, { asJson }) {
  for (let attempt = 0; ; attempt += 1) {
    await throttle();
    const res = await fetch(url);
    if (res.ok) return asJson ? res.json() : res.text();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : BASE_BACKOFF_MS * 2 ** attempt;
      console.warn(`[pubmed] HTTP 429, nouvelle tentative dans ${delay}ms (essai ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    throw new Error(`PubMed API — HTTP ${res.status} pour ${url}`);
  }
}

async function fetchJson(url) {
  return fetchWithRetry(url, { asJson: true });
}

async function fetchText(url) {
  return fetchWithRetry(url, { asJson: false });
}

/**
 * Exclusions communes à toutes les requêtes : études animales/in vitro et recommandations
 * cliniques de spécialité, sans intérêt pour un centre bien-être. On exclut "animaux sans
 * humains" plutôt que de exiger humans[MeSH] : les articles très récents ne sont pas encore
 * indexés MeSH et seraient sinon perdus ; les termes [Title/Abstract] couvrent ce cas.
 */
const EXCLUSIONS =
  'NOT (animals[MeSH Terms] NOT humans[MeSH Terms]) ' +
  'NOT (zebrafish[Title/Abstract] OR mice[Title/Abstract] OR mouse[Title/Abstract] OR rat[Title/Abstract] OR rats[Title/Abstract] ' +
  'OR drosophila[Title/Abstract] OR "C. elegans"[Title/Abstract] OR "in vitro"[Title/Abstract] OR "cell line"[Title/Abstract]) ' +
  'NOT "Practice Guideline"[Publication Type]';

export function withExclusions(query) {
  return `(${query}) ${EXCLUSIONS}`;
}

/** Garde-fou : au-delà, la requête est sans doute devenue trop large. */
export const PLAFOND_PAR_RECHERCHE = 500;
const LOT_EFETCH = 100;

/**
 * Recherche tous les PMIDs entrés dans PubMed depuis `jours` jours, page par page.
 * La fenêtre porte sur la date d'entrée (edat), pas sur la date de publication : un article
 * ajouté tard avec une date ancienne n'est pas manqué. Lève plutôt que de tronquer.
 */
async function searchPmids(query, taillePage, jours) {
  const pmids = new Set();
  for (let debut = 0; ; debut += taillePage) {
    const params = commonParams();
    params.set('db', 'pubmed');
    params.set('term', withExclusions(query));
    params.set('retstart', String(debut));
    params.set('retmax', String(taillePage));
    params.set('sort', 'pub+date');
    params.set('datetype', 'edat');
    params.set('reldate', String(jours));
    params.set('retmode', 'json');

    const data = await fetchJson(`${EUTILS_BASE}/esearch.fcgi?${params.toString()}`);
    const resultat = data?.esearchresult;
    if (!resultat?.idlist || resultat.ERROR) {
      throw new Error('PubMed API — réponse de recherche inexploitable.');
    }
    const total = Number(resultat.count);
    if (total > PLAFOND_PAR_RECHERCHE) {
      throw new Error(`PubMed — ${total} résultats pour une seule recherche (plafond ${PLAFOND_PAR_RECHERCHE}) : requête ou fenêtre à revoir.`);
    }
    resultat.idlist.forEach((id) => pmids.add(id));
    if (debut + taillePage >= total) return [...pmids];
    if (resultat.idlist.length === 0) throw new Error('PubMed API — pagination interrompue avant la fin.');
  }
}

function textOf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  return node['#text'] || '';
}

/**
 * Récupère les métadonnées (titre, auteurs, date, DOI, résumé) pour un lot de PMIDs via efetch (XML).
 * On utilise un parsing regex volontairement simple plutôt qu'un parseur XML complet :
 * le XML PubMed est stable et cette dépendance en moins garde le projet facile à maintenir en solo.
 */
export async function fetchArticles(pmids) {
  if (pmids.length > LOT_EFETCH) {
    const articles = [];
    for (let i = 0; i < pmids.length; i += LOT_EFETCH) {
      articles.push(...(await fetchArticles(pmids.slice(i, i + LOT_EFETCH))));
    }
    return articles;
  }
  if (pmids.length === 0) return [];

  const params = commonParams();
  params.set('db', 'pubmed');
  params.set('id', pmids.join(','));
  params.set('retmode', 'xml');

  const xml = await fetchText(`${EUTILS_BASE}/efetch.fcgi?${params.toString()}`);
  return parseArticlesXml(xml);
}

function extractAll(xml, tagPattern) {
  const matches = [...xml.matchAll(tagPattern)];
  return matches.map((m) => m[1]);
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(str) {
  const point = (n, brut) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : brut);
  // &amp; en dernier : « &amp;lt; » doit donner « &lt; », pas « < ».
  return str
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => point(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => point(Number(d), m))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const texte = (brut) => decodeEntities(stripTags(brut));

function premier(xml, pattern) {
  return xml.match(pattern)?.[1] ?? null;
}

/**
 * DOI de l'article lui-même : celui de son <ArticleIdList> (PubmedData), sinon son
 * <ELocationID>. Les DOI de la bibliographie (<ReferenceList>) sont retirés en amont.
 */
function articleDoi(block) {
  const pubmedData = premier(block, /<PubmedData>([\s\S]*?)<\/PubmedData>/) || '';
  const ids = premier(pubmedData, /<ArticleIdList>([\s\S]*?)<\/ArticleIdList>/) || '';
  const doi =
    premier(ids, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/) ||
    premier(block, /<ELocationID(?=[^>]*EIdType="doi")[^>]*>([\s\S]*?)<\/ELocationID>/);
  return doi ? decodeEntities(doi.trim()) : null;
}

export function parseArticlesXml(xml) {
  const articles = [];
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  for (const brut of articleBlocks) {
    // Avis de rétractation lié à cet article (lu avant de retirer les commentaires).
    const retracte = /RefType="RetractionIn"/.test(brut);
    // La bibliographie et les commentaires liés portent leurs propres PMID et DOI.
    const block = brut
      .replace(/<ReferenceList>[\s\S]*<\/ReferenceList>/g, '')
      .replace(/<CommentsCorrectionsList>[\s\S]*?<\/CommentsCorrectionsList>/g, '');

    const pmid = premier(block, /<PMID[^>]*>(\d+)<\/PMID>/);
    const title = premier(block, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
    // Résumé principal uniquement (pas <OtherAbstract>), avec les intitulés de section.
    const resume = premier(block, /<Abstract>([\s\S]*?)<\/Abstract>/) || '';
    const abstractParts = [...resume.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map(([, attrs, corps]) => {
      const label = attrs.match(/Label="([^"]*)"/)?.[1];
      return `${label ? `${decodeEntities(label)}: ` : ''}${texte(corps)}`;
    });
    const journal = premier(block, /<Title>([\s\S]*?)<\/Title>/);

    const pubDate = premier(block, /<PubDate>([\s\S]*?)<\/PubDate>/) || '';
    const medlineDate = premier(pubDate, /<MedlineDate>([\s\S]*?)<\/MedlineDate>/);
    const date = medlineDate
      ? medlineDate.trim()
      : [/<Year>(\d{4})<\/Year>/, /<Month>(\w+)<\/Month>/, /<Day>(\d{1,2})<\/Day>/]
          .map((p) => premier(pubDate, p))
          .filter(Boolean)
          .join(' ');

    const authorList = premier(block, /<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/) || '';
    const authors = extractAll(authorList, /<Author(?:\s[^>]*)?>([\s\S]*?)<\/Author>/g)
      .map((a) => {
        const last = premier(a, /<LastName>([\s\S]*?)<\/LastName>/);
        const fore = premier(a, /<ForeName>([\s\S]*?)<\/ForeName>/);
        return last ? decodeEntities(fore ? `${last} ${fore}` : last) : null;
      })
      .filter(Boolean);

    const publicationTypes = extractAll(block, /<PublicationType(?:\s[^>]*)?>([\s\S]*?)<\/PublicationType>/g).map(texte);

    articles.push({
      pmid,
      title: title ? texte(title) : '(titre indisponible)',
      abstract: abstractParts.join('\n\n'),
      journal: journal ? texte(journal) : '',
      date,
      authors,
      doi: articleDoi(block),
      publicationTypes,
      retracte,
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
      source: 'PubMed',
    });
  }

  return articles;
}

/**
 * Point d'entrée du module : renvoie les articles PubMed les plus récents pour une requête donnée.
 * `query` est fourni par l'appelant (une thématique de src/themes.js) — ce module reste
 * générique et ne connaît aucune thématique en particulier.
 */
export async function fetchRecentPubmedArticles({ query, jours, taillePage = config.pubmed.maxResults }) {
  const pmids = await searchPmids(query, taillePage, jours);
  const articles = await fetchArticles(pmids);
  return articles.map((article) => ({ ...article, origineRecherche: 'mot-clé' }));
}

/**
 * Chercheurs de référence d'une thématique — leurs publications sont recherchées en priorité,
 * même si le titre/résumé n'emploie pas littéralement les mots-clés de la thématique.
 * Le terme auteur est combiné (AND) avec `query` : des noms d'auteurs courants (homonymes
 * fréquents sur PubMed) sont ainsi désambiguïsés par l'intersection avec le sujet.
 */
export async function fetchReferenceAuthorArticles({
  query,
  authors,
  jours,
  taillePage = config.pubmed.referenceAuthorMaxResults,
}) {
  const results = [];

  for (const { nom, pubmedAuthorTerm } of authors) {
    const authorQuery = `${pubmedAuthorTerm} AND (${query})`;
    const pmids = await searchPmids(authorQuery, taillePage, jours);
    const articles = await fetchArticles(pmids);
    for (const article of articles) {
      results.push({ ...article, origineRecherche: 'reference', chercheurReference: nom });
    }
  }

  return results;
}
