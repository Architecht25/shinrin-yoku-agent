import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estPrepublication } from '../src/niveaux.js';
import { extractFiche } from '../src/extract.js';
import { verifierFiche } from '../src/verification.js';
import { journalToMarkdown, decrireFiches } from '../src/digest.js';
import { buildRunMarkdown } from '../src/markdown.js';
import { buildHtml } from '../src/exportHtml.js';
import { ficheModele, articleFactice, reponseOutil, clientSimule } from './helpers.js';

const MENTION = /Prépublication, non relue par des pairs/;

test('détectée par le code d’après le type PubMed', async () => {
  assert.ok(estPrepublication(['Journal Article', 'Preprint']));
  assert.ok(!estPrepublication(['Journal Article']));
  const f = await extractFiche(clientSimule(reponseOutil(ficheModele())), articleFactice({ publicationTypes: ['Journal Article', 'Preprint'] }));
  assert.equal(f.prepublication, true);
  const g = await extractFiche(clientSimule(reponseOutil(ficheModele())), articleFactice());
  assert.equal(g.prepublication, undefined);
});

const fiche = { titre: 'Étude', prepublication: true, type_etude: 'étude observationnelle', niveau_de_preuve: 'observationnelle', confiance_extraction: 'vérifié', thematique: 'Sommeil', thematique_id: 'sommeil', angle_brana_sana: 'Atelier', pertinence_centre: 4, ajoute_le: '2026-11-27' };
const rendre = (j, f = fiche) => journalToMarkdown(j, [f], { runDate: '2026-11-27' });
const base = { titre_une: 'T', chapeau: 'C', a_la_une: [], en_bref: [] };

test('à la une : avertissement avant le texte ; en bref : mention sur la ligne', () => {
  const une = rendre({ ...base, a_la_une: [{ fiche_id: 0, titre_journal: 'Titre', texte: 'Texte.', pour_la_borbolla: '' }] });
  assert.ok(une.indexOf('**⚠️ Prépublication') > -1 && une.indexOf('**⚠️ Prépublication') < une.indexOf('Texte.'));
  assert.match(rendre({ ...base, en_bref: [{ fiche_id: 0, phrase: 'Phrase.' }] }), /- Phrase\..*Prépublication, non relue/);
  assert.doesNotMatch(rendre({ ...base, en_bref: [{ fiche_id: 0, phrase: 'Phrase.' }] }, { ...fiche, prepublication: undefined }), MENTION);
});

test('fiches détaillées (sélection et fiche), tableau de bord et rédacteur informés', () => {
  const md = buildRunMarkdown([fiche], { runDate: '2026-11-27' });
  assert.equal(md.match(/Prépublication, non relue par des pairs/g).length, 2);
  assert.match(buildHtml([fiche]), /f\.prepublication \?/);
  assert.equal(decrireFiches([fiche])[0].prepublication, true);
});

test('le relecteur est informé que le type PubMed établit la prépublication', async () => {
  const envoye = async (publication_types) => {
    const client = clientSimule(reponseOutil({}));
    let requete;
    const creer = client.messages.create;
    client.messages.create = async (r) => { requete ??= r; return creer(r); };
    await verifierFiche(client, ficheModele(), { titre_pubmed: 'T', publication_types, resume: 'R', sources_champs: {} });
    return requete;
  };
  const avec = await envoye(['Journal Article', 'Preprint']);
  assert.match(avec.messages[0].content, /Établi par PubMed : Prépublication, non relue par des pairs/);
  assert.match(avec.system, /« Preprint » établit à lui seul/);
  assert.doesNotMatch((await envoye(['Journal Article'])).messages[0].content, /Établi par PubMed/);
});
