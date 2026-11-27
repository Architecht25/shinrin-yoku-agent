import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estRetracte, verifierRetractations } from '../src/retractations.js';
import { parseArticlesXml } from '../src/sources/pubmed.js';
import { buildRunMarkdown } from '../src/markdown.js';
import { journalToMarkdown } from '../src/digest.js';
import { buildHubPayload } from '../src/hub.js';
import { buildHtml } from '../src/exportHtml.js';

console.log = () => {};
console.error = () => {};

test('détection par Publication Type ou avis de rétractation lié', () => {
  assert.ok(estRetracte({ publicationTypes: ['Retracted Publication'] }));
  assert.ok(estRetracte({ publicationTypes: ['Retraction of Publication'] }));
  assert.ok(!estRetracte({ publicationTypes: ['Journal Article'] }));
  const [a] = parseArticlesXml('<PubmedArticle><PMID>1</PMID><CommentsCorrectionsList><CommentsCorrections RefType="RetractionIn"><PMID>2</PMID></CommentsCorrections></CommentsCorrectionsList></PubmedArticle>');
  assert.equal(a.pmid, '1');
  assert.ok(estRetracte(a));
});

const fiche = (pmid, ajoute_le) => ({ pmid, ajoute_le, titre: `Étude ${pmid}`, doi: `10.1/${pmid}`, thematique_id: 'sommeil' });

test('fiches des douze dernières semaines revérifiées, avertissement posé une seule fois', async () => {
  const store = { fiches: [fiche('1', '2026-11-20'), fiche('2', '2026-11-20'), fiche('3', '2026-08-01')] };
  let demandes;
  const parPmids = async (ids) => { demandes = ids; return ids.map((pmid) => ({ pmid, publicationTypes: pmid === '2' ? ['Retracted Publication'] : [] })); };
  const trouvees = await verifierRetractations(store, '2026-11-27', parPmids);
  assert.deepEqual(demandes, ['1', '2']);
  assert.deepEqual(trouvees.map((f) => f.pmid), ['2']);
  assert.deepEqual(store.fiches[1].avertissement_retractation, { detectee_le: '2026-11-27' });
  assert.deepEqual(await verifierRetractations(store, '2026-12-04', parPmids), []);
});

test('panne de PubMed : aucune exception', async () => {
  assert.deepEqual(await verifierRetractations({ fiches: [fiche('1', '2026-11-20')] }, '2026-11-27', async () => { throw new Error('503'); }), []);
});

test('avertissement visible sur la fiche, le journal, le tableau de bord et le hub', () => {
  const r = { ...fiche('2', '2026-11-20'), avertissement_retractation: { detectee_le: '2026-11-27' } };
  const options = { runDate: '2026-11-27', retractees: [r] };
  assert.match(buildRunMarkdown([r], options), /Rétractations détectées[\s\S]*Étude 2[\s\S]*Publication rétractée/);
  assert.match(journalToMarkdown({ titre_une: 'T', chapeau: 'C', a_la_une: [], en_bref: [] }, [], options), /⚠️ Publication rétractée[\s\S]*Étude 2/);
  assert.match(buildHubPayload({ journal: { chapeau: 'C', a_la_une: [], en_bref: [] }, body: 'b', fiches: [], runId: 'r', ...options }).summary, /^⚠️ 1 publication\(s\) rétractée/);
  assert.match(buildHtml([r]), /badge-retractation/);
});
