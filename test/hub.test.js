import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, buildHubPayload, sendToHub } from '../src/hub.js';

const fiches = [
  { titre: 'Étude A', doi: '10.1/a', lien: null, pmid: '1' },
  { titre: 'Étude B', doi: null, lien: 'https://e.org/b', pmid: '2' },
  { titre: 'Étude C', doi: null, lien: null, pmid: '3' },
];
const journal = {
  chapeau: 'Un chapeau.',
  a_la_une: [{ fiche_id: 0 }, { fiche_id: 99 }],
  en_bref: [{ fiche_id: 0 }, { fiche_id: 1 }],
};
const payload = buildHubPayload({ journal, body: '# MD', fiches, runDate: '2026-11-23', runId: 'run-1' });
const opts = (fetchImpl, extra = {}) => ({ enabled: true, url: 'https://hub.test/', token: 'tok', fetchImpl, ...extra });

test('isoWeek : semaine et année ISO', () => {
  assert.deepEqual(isoWeek('2026-11-23'), { year: 2026, week: 48 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
});

test('payload conforme au contrat', () => {
  assert.deepEqual(payload, {
    title: 'Veille bien-être, semaine 48',
    summary: 'Un chapeau.',
    body: '# MD',
    kind: 'info',
    kicker: 'Bien-être',
    sources: [
      { title: 'Étude A', url: 'https://doi.org/10.1/a' },
      { title: 'Étude B', url: 'https://e.org/b' },
    ],
    sensitivity: 'normal',
    metadata: {
      etudes: [
        { type_etude: null, niveau_de_preuve: null, confiance_extraction: null, pertinence_centre: null, doi: '10.1/a', pmid: '1' },
        { type_etude: null, niveau_de_preuve: null, confiance_extraction: null, pertinence_centre: null, doi: null, pmid: '2' },
      ],
    },
    external_id: '2026-W48',
    run_id: 'run-1',
  });
});

test('envoi : URL, en-têtes et corps corrects', async () => {
  let call;
  const res = await sendToHub(payload, opts(async (url, init) => { call = { url, init }; return { ok: true, status: 201 }; }));
  assert.equal(res.status, 'sent');
  assert.equal(call.url, 'https://hub.test/api/v1/deliveries');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(call.init.body), payload);
});

test('doublon : 200 du hub traité comme un succès', async () => {
  const res = await sendToHub(payload, opts(async () => ({ ok: true, status: 200 })));
  assert.equal(res.status, 'duplicate');
});

test('hub en erreur (HTTP 500 ou réseau) : ne lève pas', async () => {
  const http = await sendToHub(payload, opts(async () => ({ ok: false, status: 500 })));
  assert.equal(http.status, 'error');
  const net = await sendToHub(payload, opts(async () => { throw new Error('ECONNREFUSED'); }));
  assert.equal(net.status, 'error');
});

test('désactivé : aucun appel réseau', async () => {
  let called = false;
  const res = await sendToHub(payload, opts(async () => { called = true; }, { enabled: false }));
  assert.equal(res.status, 'disabled');
  assert.equal(called, false);
});

test('metadata : pour chaque étude retenue, les six champs et rien d’autre, kind et external_id inchangés', () => {
  const f = { titre: 'A', doi: '10.1/a', pmid: '1', type_etude: 'étude pilote', niveau_de_preuve: 'exploratoire', confiance_extraction: 'vérifié', pertinence_centre: 4, resultat_principal: 'secret', effectif: 12 };
  const p = buildHubPayload({ journal: { chapeau: 'C', a_la_une: [{ fiche_id: 0 }], en_bref: [] }, body: 'b', fiches: [f, { ...f, pmid: '2' }], runDate: '2026-11-27', runId: 'r' });
  assert.deepEqual(p.metadata, { etudes: [{ type_etude: 'étude pilote', niveau_de_preuve: 'exploratoire', confiance_extraction: 'vérifié', pertinence_centre: 4, doi: '10.1/a', pmid: '1' }] });
  assert.equal(p.kind, 'info');
  assert.equal(p.external_id, '2026-W48');
  const vide = buildHubPayload({ journal: { chapeau: 'Rien.', a_la_une: [], en_bref: [] }, body: 'b', fiches: [], runDate: '2026-11-27', runId: 'r' });
  assert.deepEqual(vide.metadata, { etudes: [] });
});
