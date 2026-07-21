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

async function fetchJson(url) {
  await throttle();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PubMed API — HTTP ${res.status} pour ${url}`);
  }
  return res.json();
}

async function fetchText(url) {
  await throttle();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PubMed API — HTTP ${res.status} pour ${url}`);
  }
  return res.text();
}

/**
 * Recherche les PMIDs les plus récents correspondant à la requête, triés par date de publication.
 */
async function searchPmids(query, maxResults) {
  const params = commonParams();
  params.set('db', 'pubmed');
  params.set('term', query);
  params.set('retmax', String(maxResults));
  params.set('sort', 'pub+date');
  params.set('retmode', 'json');

  const data = await fetchJson(`${EUTILS_BASE}/esearch.fcgi?${params.toString()}`);
  return data?.esearchresult?.idlist || [];
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
async function fetchArticles(pmids) {
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
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseArticlesXml(xml) {
  const articles = [];
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  for (const block of articleBlocks) {
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const titleMatch = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
    const abstractParts = extractAll(block, /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
    const journalMatch = block.match(/<Title>([\s\S]*?)<\/Title>/);
    const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);

    const yearMatch = block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const monthMatch = block.match(/<PubDate>[\s\S]*?<Month>([\w]+)<\/Month>/);
    const dayMatch = block.match(/<PubDate>[\s\S]*?<Day>(\d{1,2})<\/Day>/);
    const medlineDateMatch = block.match(/<PubDate>[\s\S]*?<MedlineDate>([\s\S]*?)<\/MedlineDate>/);

    const lastNames = extractAll(block, /<LastName>([\s\S]*?)<\/LastName>/g);
    const foreNames = extractAll(block, /<ForeName>([\s\S]*?)<\/ForeName>/g);
    const authors = lastNames.map((last, i) => {
      const fore = foreNames[i] ? ` ${foreNames[i]}` : '';
      return decodeEntities(`${last}${fore}`);
    });

    const publicationTypes = extractAll(block, /<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g).map(
      (t) => decodeEntities(stripTags(t))
    );

    const pmid = pmidMatch ? pmidMatch[1] : null;
    const doi = doiMatch ? decodeEntities(doiMatch[1].trim()) : null;

    let date = medlineDateMatch ? medlineDateMatch[1].trim() : '';
    if (!date && yearMatch) {
      date = [yearMatch[1], monthMatch?.[1], dayMatch?.[1]].filter(Boolean).join(' ');
    }

    articles.push({
      pmid,
      title: titleMatch ? decodeEntities(stripTags(titleMatch[1])) : '(titre indisponible)',
      abstract: decodeEntities(stripTags(abstractParts.join('\n\n'))),
      journal: journalMatch ? decodeEntities(stripTags(journalMatch[1])) : '',
      date,
      authors,
      doi,
      publicationTypes,
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
export async function fetchRecentPubmedArticles({ query, maxResults = config.pubmed.maxResults }) {
  const pmids = await searchPmids(query, maxResults);
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
  maxResultsPerAuthor = config.pubmed.referenceAuthorMaxResults,
}) {
  const results = [];

  for (const { nom, pubmedAuthorTerm } of authors) {
    const authorQuery = `${pubmedAuthorTerm} AND (${query})`;
    const pmids = await searchPmids(authorQuery, maxResultsPerAuthor);
    const articles = await fetchArticles(pmids);
    for (const article of articles) {
      results.push({ ...article, origineRecherche: 'reference', chercheurReference: nom });
    }
  }

  return results;
}
