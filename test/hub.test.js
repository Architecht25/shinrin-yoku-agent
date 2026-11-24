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
