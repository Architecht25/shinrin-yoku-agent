import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valeursSource, chiffresAbsents, retirerPhrasesNonSourcees } from '../src/chiffres.js';
import { verifierFiche, MARQUE_A_CORRIGER } from '../src/verification.js';
import { verifierJournal } from '../src/verification-journal.js';
import { decrireFiches, journalToMarkdown, retenirPourJournal, journalVide } from '../src/digest.js';
import { ficheModele, reponseOutil, clientSimule } from './helpers.js';

const resume = 'Twenty-one adults (of 21,318 screened) walked for 30 minutes during five weeks; p < .05, SD 1·5.';
const valeurs = valeursSource(resume);

test('chiffres retrouvés malgré le format français et les nombres en lettres', () => {
  assert.deepEqual(chiffresAbsents('21 adultes sur 21 318, 30 minutes, 5 semaines, p < 0,05, écart 1,5.', valeurs), []);
});

test('chiffre absent ou arrondi repéré ; les sigles ne comptent pas', () => {
  assert.deepEqual(chiffresAbsents('Plus de 21 000 personnes et 40 % de baisse.', valeurs), ['21000', '40']);
  assert.deepEqual(chiffresAbsents('Score SF-36, COVID-19, CO2, récepteur 5-HT, imagerie 3D.', valeurs), []);
});

test('les nombres écrits en français sont contrôlés aussi', () => {
  assert.deepEqual(chiffresAbsents('Cinq semaines, vingt-et-un adultes, une marche.', valeurs), []);
  assert.deepEqual(chiffresAbsents('Neuf études et trente-six essais. Une sixième piste.', valeurs), ['9', '36']);
});

test('seule la phrase au chiffre non sourcé est retirée', () => {
  const r = retirerPhrasesNonSourcees('Marche de 30 minutes. Stress réduit de 40 %. Effet à confirmer.', valeurs);
  assert.equal(r.texte, 'Marche de 30 minutes. Effet à confirmer.');
  assert.deepEqual(r.retires, ['40']);
});

const preuve = { titre_pubmed: 'Walking study', resume, publication_types: ['Randomized Controlled Trial'], sources_champs: {} };
const fiche = (o = {}) => ({ ...ficheModele({ type_etude: 'essai contrôlé randomisé', ...o }) });
const avis = (o = {}) =>
  reponseOutil({ verdict: 'confirmé', raison: '', type_etude_corrige: '', resultat_principal_corrige: '', limites_corrigees: '', niveau_corrige: '', ...o });

test('fiche confirmée : éligible à la une', async () => {
  const { fiche: f } = await verifierFiche(clientSimule(avis()), fiche(), preuve);
  assert.deepEqual(f.verification, { statut: 'confirmé', raison: '', journal: 'une' });
});

test('à corriger avec correction : appliquée, jamais à la une ; PubMed prime sur le type proposé', async () => {
  const client = clientSimule(avis({ verdict: 'à corriger', raison: 'verbe causal', type_etude_corrige: 'étude pilote', resultat_principal_corrige: 'Association observée sur 5 semaines.' }));
  const { fiche: f, preuve: p } = await verifierFiche(client, fiche(), preuve);
  assert.equal(f.resultat_principal, 'Association observée sur 5 semaines.');
  assert.equal(f.type_etude, 'essai contrôlé randomisé');
  assert.equal(f.verification.journal, 'bref');
  assert.equal(p.sources_champs.resultat_principal, 'vérification');
  assert.ok(f.niveau_de_preuve_et_limites.endsWith(MARQUE_A_CORRIGER));
});

test('à corriger sans correction : exclue du journal', async () => {
  const { fiche: f } = await verifierFiche(clientSimule(avis({ verdict: 'à corriger', raison: 'devis douteux' })), fiche(), preuve);
  assert.equal(f.verification.journal, 'exclue');
});

test('le code retire un chiffre inventé même si le modèle confirme', async () => {
  const { fiche: f } = await verifierFiche(clientSimule(avis()), fiche({ resultat_principal: 'Marche évaluée. Stress réduit de 40 %.' }), preuve);
  assert.equal(f.resultat_principal, 'Marche évaluée.');
  assert.equal(f.verification.statut, 'à corriger');
  assert.equal(f.verification.journal, 'bref');
});

test('vérification impossible : « non vérifié », jamais à la une', async () => {
  const { fiche: f } = await verifierFiche(clientSimule(new Error('panne')), fiche(), preuve);
  assert.equal(f.verification.statut, 'non vérifié');
  assert.equal(f.verification.journal, 'bref');
});

const fiches = [
  { ...fiche({ titre: 'A', resultat_principal: 'Marche de 30 minutes.' }), verification: { journal: 'une' } },
  { ...fiche({ titre: 'B' }), verification: { journal: 'bref' } },
];
const brouillon = {
  titre_une: 'Titre',
  chapeau: 'Une phrase fidèle. Une phrase inventée.',
  a_la_une: [
    { fiche_id: 1, titre_journal: 'Non éligible', texte: 't', pour_la_borbolla: '' },
    { fiche_id: 0, titre_journal: 'Une A', texte: 'On a marché 30 minutes. Chez 500 personnes.', pour_la_borbolla: 'Ouvrir un spa.' },
  ],
  en_bref: [{ fiche_id: 1, phrase: 'Étude B.' }],
};

test('journal : fiche non éligible retirée de la une, chiffres et affirmations non soutenus supprimés', async () => {
  const client = clientSimule(
    reponseOutil({ non_soutenues: [{ id: 'chapeau.1', raison: 'absent' }, { id: 'une.0.pour_la_borbolla.0', raison: 'absent' }] })
  );
  const { journal, suppressions } = await verifierJournal(client, brouillon, fiches, decrireFiches(fiches));
  assert.deepEqual(journal.a_la_une.map((a) => a.fiche_id), [0]);
  assert.equal(journal.chapeau, 'Une phrase fidèle.');
  assert.equal(journal.a_la_une[0].texte, 'On a marché 30 minutes.');
  assert.equal(suppressions.length, 3);
  const md = journalToMarkdown(journal, fiches, { runDate: '2026-11-27', total: 3 });
  assert.doesNotMatch(md, /Pour La Borbolla\*\*|500|inventée|Non éligible/);
  assert.match(md, /3 étude\(s\) analysée\(s\)/);
});

test('première phrase supprimée : le texte reprend le résultat de la fiche', async () => {
  const client = clientSimule(reponseOutil({ non_soutenues: [{ id: 'une.0.texte.0', raison: 'absent' }] }));
  const { journal } = await verifierJournal(client, brouillon, fiches, decrireFiches(fiches));
  assert.equal(journal.a_la_une[0].texte, 'Marche de 30 minutes.');
});

test('« En bref » sans sa première phrase : la ligne reprend le résultat de la fiche', async () => {
  const deux = { ...brouillon, en_bref: [{ fiche_id: 1, phrase: 'Début inventé. étude de petite portée, à confirmer.' }] };
  const { journal } = await verifierJournal(clientSimule(reponseOutil({ non_soutenues: [{ id: 'bref.0.0', raison: 'absent' }] })), deux, fiches, decrireFiches(fiches));
  assert.equal(journal.en_bref[0].phrase, 'Association observée.');
});

test('contrôle du journal impossible : lève, pour retomber sur le rapport détaillé', async () => {
  await assert.rejects(verifierJournal(clientSimule(reponseOutil({})), brouillon, fiches, decrireFiches(fiches)));
});

test('journal : verbe causal supprimé pour une étude observationnelle seulement', async () => {
  const obs = [{ ...fiches[0], niveau_de_preuve: 'observationnelle' }, { ...fiches[1], niveau_de_preuve: 'essai contrôlé' }];
  const j = { titre_une: 'T', chapeau: 'C.', a_la_une: [], en_bref: [
    { fiche_id: 0, phrase: 'Association vue. La marche réduit le stress.' }, { fiche_id: 1, phrase: 'La marche réduit le stress.' },
  ] };
  const { journal } = await verifierJournal(clientSimule(reponseOutil({ non_soutenues: [] })), j, obs, decrireFiches(obs));
  assert.deepEqual(journal.en_bref.map((b) => b.phrase), ['Association vue.', 'La marche réduit le stress.']);
});

test('seuil de pertinence : en dessous, ni à la une ni en bref ; le niveau de preuve n’y change rien', () => {
  const f = (pertinence_centre, journal = 'une', niveau_de_preuve = 'exploratoire') => ({ pertinence_centre, niveau_de_preuve, verification: { journal } });
  const liste = [f(2, 'une', 'essai contrôlé'), f(3), f(5, 'bref'), f(5, 'exclue')];
  assert.deepEqual(retenirPourJournal(liste, 3), [liste[1], liste[2]]);
  assert.equal(retenirPourJournal(liste, 0).length, 3);
  assert.equal(journalVide(3).a_la_une.length, 0);
});
