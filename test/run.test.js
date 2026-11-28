import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chemins } from '../src/chemins.js';
import { preparer } from '../src/preparation.js';
import { traiterFile, mettreEnFile, MAX_RUNS } from '../src/file-envois.js';
import { fenetreCollecte } from '../src/fenetre.js';
import { fetchRecentPubmedArticles } from '../src/sources/pubmed.js';
import { THEMES } from '../src/themes.js';
import { ficheModele, articleFactice, reponseOutil } from './helpers.js';

console.log = () => {};
console.error = () => {};

const lire = async (p) => JSON.parse(await readFile(p, 'utf-8'));
const absent = (p) => assert.rejects(readFile(p), { code: 'ENOENT' });
let emplacements;
beforeEach(async () => {
  emplacements = chemins(await mkdtemp(path.join(tmpdir(), 'run-')));
});

/** Client qui répond selon l'outil demandé. */
const pertinente = () => reponseOutil(ficheModele({ angle_brana_sana: 'Atelier', pertinence_centre: 4 }));
const client = ({ extraction = pertinente } = {}) => ({
  messages: {
    async create(r) {
      const outil = r.tool_choice.name;
      if (outil === 'enregistrer_fiche') return extraction(r);
      if (outil === 'enregistrer_verification') {
        return reponseOutil({ verdict: 'confirmé', raison: '', type_etude_corrige: '', resultat_principal_corrige: '', limites_corrigees: '', angle_corrige: '', niveau_corrige: '', justification_niveau_corrigee: '' });
      }
      if (outil === 'rediger_journal') return reponseOutil({ titre_une: 'T', chapeau: 'C.', a_la_une: [], en_bref: [{ fiche_id: 0, phrase: 'P.' }] });
      return reponseOutil({ non_soutenues: [] });
    },
  },
});
const sources = (articles) => ({
  parMotsCles: async () => articles,
  parAuteurs: async () => [],
  parPmids: async (ids) => ids.map((pmid) => articleFactice({ pmid, doi: null })),
});
const lancer = (o = {}) =>
  preparer({
    themes: [THEMES[3]], toutes: true, emplacements, runDate: '2026-11-27', runId: 'r1', dashboardUrl: '',
    client: client(), sources: sources([articleFactice()]), ...o,
  });

describe('préparation', () => {
  test('enregistre base, preuves, file et date de collecte, sans rien envoyer', async () => {
    await lancer();
    assert.equal((await lire(emplacements.db)).fiches.length, 1);
    assert.ok((await lire(path.join(emplacements.preuves, '2026.json')))['111']);
    // Aucun fichier enregistré ne contient le texte du résumé.
    for (const f of [emplacements.db, emplacements.file, path.join(emplacements.preuves, '2026.json')]) {
      assert.ok(!(await readFile(f, 'utf-8')).includes(articleFactice().abstract), f);
    }
    const [envoi] = (await lire(emplacements.file)).envois;
    assert.equal(envoi.email.statut, 'à envoyer');
    assert.equal(envoi.hub.payload.external_id, '2026-W48');
    assert.equal((await lire(emplacements.etat)).derniere_collecte, '2026-11-27');
  });

  test('toutes les extractions échouent : erreur, rien d’enregistré', async () => {
    await assert.rejects(lancer({ client: client({ extraction: () => { throw new Error('401'); } }) }), /Toutes les extractions/);
    await absent(emplacements.db);
    await absent(emplacements.file);
    await absent(emplacements.etat);
  });

  test('base impossible à enregistrer : aucun envoi en file', async () => {
    await mkdir(`${emplacements.db}.tmp`, { recursive: true });
    await assert.rejects(lancer());
    await absent(emplacements.file);
  });

  test('échec partiel : fiche marquée, retentée ensuite puis remplacée', async () => {
    const deux = sources([articleFactice(), articleFactice({ pmid: '222', doi: '10.1/y', title: 'Other' })]);
    const casse = client({ extraction: (r) => (r.messages[0].content.includes('Titre : Other') ? reponseOutil({}) : pertinente()) });
    await lancer({ client: casse, sources: deux });
    let fiches = (await lire(emplacements.db)).fiches;
    assert.deepEqual(fiches.map((f) => [f.pmid, f.statut, f.tentatives]), [['111', undefined, undefined], ['222', 'extraction échouée', 1]]);

    await lancer({ sources: sources([]) });
    fiches = (await lire(emplacements.db)).fiches;
    assert.deepEqual(fiches.map((f) => [f.pmid, f.statut]), [['111', undefined], ['222', undefined]]);
  });

  test('reprise seule encore en échec : comptée, puis abandonnée après trois tentatives', async () => {
    await mkdir(path.dirname(emplacements.db), { recursive: true });
    await writeFile(emplacements.db, JSON.stringify({ fiches: [{ pmid: '9', titre: 't', statut: 'extraction échouée', tentatives: 2, thematique_id: 'sommeil' }] }));
    const casse = client({ extraction: () => reponseOutil({}) });
    await lancer({ client: casse, sources: sources([]) });
    assert.equal((await lire(emplacements.db)).fiches[0].tentatives, 3);
    assert.deepEqual(await lancer({ client: casse, sources: sources([]) }), { nouvelles: 0 });
  });
});

describe('file des envois', () => {
  const ajouter = (id) => mettreEnFile(emplacements.file, { id, runDate: '2026-11-27', email: { sujet: id }, hub: { external_id: id } });
  const pause = async () => {};

  test('panne du hub : l’e-mail part, le hub est repris au run suivant sans renvoyer l’e-mail', async () => {
    await ajouter('a');
    const journal = [];
    const envoyerEmail = async () => { journal.push('email'); return {}; };
    const r1 = await traiterFile(emplacements.file, { pause, envoyerEmail, envoyerHub: async () => { journal.push('hub'); return { status: 'error', httpStatus: 503 }; } });
    assert.deepEqual(r1, { email: 0, hub: 1 });
    assert.deepEqual(journal, ['email', 'hub', 'hub', 'hub']);
    assert.equal((await lire(emplacements.file)).envois[0].hub.erreur, 'HTTP 503');

    journal.length = 0;
    await traiterFile(emplacements.file, { pause, envoyerEmail, envoyerHub: async () => { journal.push('hub'); return { status: 'sent' }; } });
    assert.deepEqual(journal, ['hub']);
    assert.deepEqual((await lire(emplacements.file)).envois, []);
  });

  test('tous les e-mails passent avant le hub ; un e-mail en échec reste en file sans adresse', async () => {
    await ajouter('a');
    await ajouter('b');
    const ordre = [];
    const r = await traiterFile(emplacements.file, {
      pause,
      envoyerEmail: async (e) => {
        ordre.push(`email ${e.sujet}`);
        if (e.sujet === 'a') throw Object.assign(new Error('refus quelqu.un@exemple.invalid'), { code: 'EAUTH', responseCode: 535 });
        return {};
      },
      envoyerHub: async (p) => { ordre.push(`hub ${p.external_id}`); return { status: 'sent' }; },
    });
    assert.equal(r.email, 1);
    assert.deepEqual(ordre, ['email a', 'email a', 'email a', 'email b', 'hub a', 'hub b']);
    const brut = await readFile(emplacements.file, 'utf-8');
    assert.doesNotMatch(brut, /@/);
    assert.equal(JSON.parse(brut).envois[0].email.erreur, 'EAUTH 535');
  });

  test('abandon après le nombre maximal de runs, entrée conservée', async () => {
    await ajouter('a');
    const options = { pause, envoyerEmail: async () => ({}), envoyerHub: async () => ({ status: 'skipped' }) };
    for (let i = 0; i < MAX_RUNS.hub + 1; i += 1) await traiterFile(emplacements.file, options);
    const [e] = (await lire(emplacements.file)).envois;
    assert.equal(e.hub.statut, 'abandonné');
    assert.equal(e.hub.runs, MAX_RUNS.hub);
  });
});

describe('collecte', () => {
  test('fenêtre depuis la dernière collecte, bornée', () => {
    const store = { fiches: [{ ajoute_le: '2026-11-24' }] };
    assert.equal(fenetreCollecte({}, store, '2026-11-27').jours, 10);
    assert.equal(fenetreCollecte({ derniere_collecte: '2026-11-06' }, store, '2026-11-27').jours, 24);
    assert.deepEqual(fenetreCollecte({ derniere_collecte: '2026-01-01' }, store, '2026-11-27'), { jours: 90, tronquee: true });
  });

  const simulerPubmed = async (total, action) => {
    const original = globalThis.fetch;
    const recherches = [];
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith('esearch.fcgi')) {
        recherches.push(u.searchParams);
        const debut = Number(u.searchParams.get('retstart'));
        const idlist = Array.from({ length: Math.max(0, Math.min(20, total - debut)) }, (_, i) => String(debut + i + 1));
        return { ok: true, json: async () => ({ esearchresult: { count: String(total), idlist } }) };
      }
      const xml = u.searchParams.get('id').split(',').map((id) => `<PubmedArticle><PMID>${id}</PMID></PubmedArticle>`).join('');
      return { ok: true, text: async () => xml };
    };
    try {
      await action(recherches);
    } finally {
      globalThis.fetch = original;
    }
  };

  test('au-delà de 20 résultats, toutes les pages sont lues', async () => {
    await simulerPubmed(45, async (recherches) => {
      const articles = await fetchRecentPubmedArticles({ query: 'x', jours: 10, taillePage: 20 });
      assert.equal(articles.length, 45);
      assert.deepEqual(recherches.map((p) => p.get('retstart')), ['0', '20', '40']);
      assert.equal(recherches[0].get('datetype'), 'edat');
      assert.equal(recherches[0].get('reldate'), '10');
    });
  });

  test('au-delà du plafond : erreur plutôt que perte silencieuse', async () => {
    await simulerPubmed(501, async () => {
      await assert.rejects(fetchRecentPubmedArticles({ query: 'x', jours: 10, taillePage: 20 }), /plafond/);
    });
  });
});

describe('rétractations dans un run', () => {
  test('publication rétractée exclue à la collecte ; fiche récente signalée même sans nouveauté', async () => {
    await mkdir(path.dirname(emplacements.db), { recursive: true });
    await writeFile(emplacements.db, JSON.stringify({ fiches: [{ pmid: '9', doi: '10.1/neuf', titre: 'Ancienne', ajoute_le: '2026-11-20', thematique_id: 'sommeil', niveau_de_preuve: 'observationnelle' }] }));
    const s = {
      parMotsCles: async () => [articleFactice({ publicationTypes: ['Retracted Publication'] })],
      parAuteurs: async () => [],
      parPmids: async (ids) => ids.map((pmid) => articleFactice({ pmid, retracte: true })),
    };
    await lancer({ sources: s });
    const fiches = (await lire(emplacements.db)).fiches;
    assert.equal(fiches.length, 1);
    assert.ok(fiches[0].avertissement_retractation);
    const [envoi] = (await lire(emplacements.file)).envois;
    assert.match(envoi.email.markdown, /Rétractations détectées/);
    assert.match(envoi.hub.payload.summary, /rétractée/);
  });
});

describe('seuil de pertinence', () => {
  test('sous le seuil : « Rien cette semaine », sans appel de rédaction, fiches jointes', async () => {
    const appels = [];
    const base = client({ extraction: () => reponseOutil(ficheModele({ angle_brana_sana: 'Lien lointain', pertinence_centre: 2 })) });
    await lancer({ client: { messages: { create: (r) => { appels.push(r.tool_choice.name); return base.messages.create(r); } } } });
    assert.deepEqual(appels, ['enregistrer_fiche', 'enregistrer_verification']);
    const [envoi] = (await lire(emplacements.file)).envois;
    assert.match(envoi.email.markdown, /^# Rien cette semaine/);
    assert.doesNotMatch(envoi.email.markdown, /À la une|En bref/);
    assert.match(envoi.email.piece_jointe, /A simulated study/);
    assert.match(envoi.email.sujet, /Le journal de la semaine/);
  });
});

describe('évaluation d’une fiche ancienne après un échec', () => {
  test('tentative comptée, reprise au run suivant sans nouveauté, puis plus jamais refaite', async () => {
    await mkdir(path.dirname(emplacements.db), { recursive: true });
    await writeFile(emplacements.db, JSON.stringify({ fiches: [{ pmid: '9', titre: 'Ancienne', ajoute_le: '2026-11-20', thematique_id: 'sommeil', niveau_de_preuve: 'non évalué' }] }));
    const s = { parMotsCles: async () => [], parAuteurs: async () => [], parPmids: async (ids) => ids.map((pmid) => articleFactice({ pmid, retracte: true, publicationTypes: ['Observational Study'] })) };
    let panne = true;
    let evaluations = 0;
    const c = { messages: { async create(r) {
      if (r.tool_choice.name === 'evaluer_niveau') {
        evaluations += 1;
        if (panne) throw new Error('529');
        return reponseOutil({ type_etude: 'étude observationnelle', niveau_propose: 'indéterminé', extrait_justification: '', justification_niveau: '', effectif: 0, pertinence_centre: 0 });
      }
      return client().messages.create(r);
    } } };
    await lancer({ sources: s, client: c });
    assert.equal((await lire(emplacements.db)).fiches[0].tentatives_evaluation, 1);
    panne = false;
    await lancer({ sources: s, client: c });
    assert.equal((await lire(emplacements.db)).fiches[0].niveau_de_preuve, 'observationnelle');
    await lancer({ sources: s, client: c });
    assert.equal(evaluations, 2);
  });
});
