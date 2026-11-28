import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticlesXml, withExclusions, fetchWithRetry } from '../src/sources/pubmed.js';

const article = ({ pmid = '111', ids = '<ArticleId IdType="doi">10.1/ARTICLE</ArticleId>', eloc = '' } = {}) => `
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">${pmid}</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><Year>2026</Year><Month>Nov</Month></PubDate></JournalIssue><Title>J &amp; Test</Title></Journal>
      <ArticleTitle>Walking <i>and</i> mood in adults &#x2265; 65</ArticleTitle>
      ${eloc}
      <Abstract>
        <AbstractText Label="METHODS">We enrolled 12&#160;adults.</AbstractText>
        <AbstractText Label="RESULTS">p &lt; 0.05 &amp;lt;</AbstractText>
      </Abstract>
      <AuthorList><Author><LastName>Dupont</LastName><ForeName>Jean</ForeName></Author><Author><CollectiveName>Groupe</CollectiveName></Author><Author><LastName>Li</LastName></Author></AuthorList>
      <PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D016454">Review</PublicationType></PublicationTypeList>
    </Article>
    <CommentsCorrectionsList><CommentsCorrections><PMID Version="1">999</PMID></CommentsCorrections></CommentsCorrectionsList>
    <OtherAbstract><AbstractText>Résumé en autre langue.</AbstractText></OtherAbstract>
    <InvestigatorList><Investigator><LastName>Investigateur</LastName></Investigator></InvestigatorList>
  </MedlineCitation>
  <PubmedData>
    <ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId>${ids}</ArticleIdList>
    <ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9/BIBLIO</ArticleId></ArticleIdList></Reference>
      <ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9/IMBRIQUEE</ArticleId></ArticleIdList></Reference></ReferenceList>
    </ReferenceList>
  </PubmedData>
</PubmedArticle>`;

test('champs de l’article', () => {
  const [a] = parseArticlesXml(`<PubmedArticleSet>${article()}</PubmedArticleSet>`);
  assert.equal(a.pmid, '111');
  assert.equal(a.doi, '10.1/ARTICLE');
  assert.equal(a.title, 'Walking and mood in adults ≥ 65');
  assert.equal(a.journal, 'J & Test');
  assert.equal(a.date, '2026 Nov');
  assert.equal(a.abstract, 'METHODS: We enrolled 12\u00a0adults.\n\nRESULTS: p < 0.05 &lt;');
  assert.deepEqual(a.authors, ['Dupont Jean', 'Li']);
  assert.deepEqual(a.publicationTypes, ['Journal Article', 'Review']);
});

test('sans DOI propre, aucun DOI de la bibliographie n’est repris', () => {
  const [a] = parseArticlesXml(article({ ids: '' }));
  assert.equal(a.doi, null);
});

test('DOI pris dans ELocationID à défaut', () => {
  const [a] = parseArticlesXml(article({ ids: '', eloc: '<ELocationID EIdType="doi" ValidYN="Y">10.1/ELOC</ELocationID>' }));
  assert.equal(a.doi, '10.1/ELOC');
});

test('plusieurs articles restent séparés', () => {
  const liste = parseArticlesXml(article() + article({ pmid: '222', ids: '' }));
  assert.deepEqual(liste.map((a) => [a.pmid, a.doi]), [['111', '10.1/ARTICLE'], ['222', null]]);
});

test('les études chez le rat sont exclues, au singulier comme au pluriel', () => {
  assert.match(withExclusions('x'), /rat\[Title\/Abstract\] OR rats\[Title\/Abstract\]/);
});

/** Remplace fetch par une suite de réponses ; renvoie le résultat et le nombre d'appels. */
async function avecReponses(reponses, fn) {
  const origine = { fetch: globalThis.fetch, warn: console.warn };
  let appels = 0;
  globalThis.fetch = async () => {
    const r = reponses[Math.min(appels++, reponses.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r === 200 ? 'ok' : '', { status: r });
  };
  console.warn = () => {};
  try {
    await fn(() => fetchWithRetry('https://exemple.test/efetch', { asJson: false, attendre: async () => {} }));
    return appels;
  } finally {
    globalThis.fetch = origine.fetch;
    console.warn = origine.warn;
  }
}

test('erreurs passagères (400, 429, 503, réseau) : nouvel essai', async () => {
  for (const panne of [400, 429, 503, new TypeError('fetch failed')]) {
    const appels = await avecReponses([panne, 200], async (appeler) => assert.equal(await appeler(), 'ok'));
    assert.equal(appels, 2);
  }
});

test('erreur persistante : abandon après cinq essais ; 404 : aucun nouvel essai', async () => {
  assert.equal(await avecReponses([400], (appeler) => assert.rejects(appeler, /HTTP 400 pour/)), 5);
  assert.equal(await avecReponses([404], (appeler) => assert.rejects(appeler, /HTTP 404 pour/)), 1);
});
