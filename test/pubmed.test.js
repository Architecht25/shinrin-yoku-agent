import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticlesXml } from '../src/sources/pubmed.js';

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
  assert.equal(a.abstract, 'METHODS: We enrolled 12 adults.\n\nRESULTS: p < 0.05 &lt;');
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
