import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFiche, validerFiche, ECHEC_EXTRACTION } from '../src/extract.js';
import { TYPES_ETUDE, resoudreType } from '../src/types-etude.js';
import { ficheModele, articleFactice, reponseOutil, clientSimule } from './helpers.js';

test('liste des types d’étude', () => {
  assert.deepEqual(TYPES_ETUDE, [
    'revue systématique', 'méta-analyse', 'revue de portée', 'revue narrative', 'essai contrôlé randomisé',
    'étude observationnelle', 'étude pilote', 'étude qualitative', 'article théorique ou perspective', 'indéterminé',
  ]);
});

test('un Publication Type explicite prime sur le modèle', () => {
  const cas = [
    [['Meta-Analysis', 'Systematic Review'], 'méta-analyse'],
    [['Systematic Review', 'Scoping Review'], 'revue de portée'],
    [['Review', 'Systematic Review'], 'revue systématique'],
    [['Randomized Controlled Trial'], 'essai contrôlé randomisé'],
    [['Observational Study'], 'étude observationnelle'],
    [['Clinical Trial Protocol', 'Randomized Controlled Trial'], 'indéterminé'],
    [['Editorial'], 'article théorique ou perspective'],
  ];
  for (const [pt, attendu] of cas) {
    assert.deepEqual(resoudreType(pt, 'étude pilote'), { type: attendu, origine: 'code' }, pt.join());
  }
});

test('« Review » seul : le modèle précise dans la famille des revues, jamais en dehors', () => {
  assert.deepEqual(resoudreType(['Review'], 'revue narrative'), { type: 'revue narrative', origine: 'modèle' });
  assert.deepEqual(resoudreType(['Review'], 'essai contrôlé randomisé'), { type: 'indéterminé', origine: 'code' });
});

test('sans type explicite, le modèle choisit', () => {
  assert.deepEqual(resoudreType(['Journal Article'], 'étude qualitative'), { type: 'étude qualitative', origine: 'modèle' });
});

test('validation : champs, liste, limites et cohérence angle/score', () => {
  assert.deepEqual(validerFiche(ficheModele()), []);
  const { angle_brana_sana, ...sansAngle } = ficheModele();
  for (const invalide of [
    sansAngle,
    ficheModele({ type_etude: 'RCT' }),
    ficheModele({ niveau_de_preuve_et_limites: '  ' }),
    ficheModele({ angle_brana_sana: 'Atelier', pertinence_brana_sana: 0 }),
    ficheModele({ angle_brana_sana: '', pertinence_brana_sana: 2 }),
    ficheModele({ angle_brana_sana: 'Atelier', pertinence_brana_sana: 9 }),
    ficheModele({ pertinence_brana_sana: '0' }),
    ficheModele({ champ_en_trop: 'x' }),
  ]) {
    assert.notDeepEqual(validerFiche(invalide), [], JSON.stringify(invalide));
  }
});

test('réponse valide : une fiche, un seul appel, type PubMed appliqué', async () => {
  const client = clientSimule(reponseOutil(ficheModele()));
  const fiche = await extractFiche(client, articleFactice({ publicationTypes: ['Randomized Controlled Trial'] }));
  assert.equal(client.appels.length, 1);
  assert.equal(fiche.type_etude, 'essai contrôlé randomisé');
  assert.equal(fiche.pmid, '111');
  assert.equal(fiche.statut, undefined);
});

test('réponse invalide puis valide : une seule nouvelle tentative, avec la raison du refus', async () => {
  const client = clientSimule(reponseOutil(ficheModele({ niveau_de_preuve_et_limites: '' })), reponseOutil(ficheModele()));
  const fiche = await extractFiche(client, articleFactice());
  assert.equal(client.appels.length, 2);
  assert.match(client.appels[1].messages[0].content, /refusée : champ vide/);
  assert.equal(fiche.statut, undefined);
});

test('deux réponses invalides : fiche « extraction échouée » sans contenu du modèle', async () => {
  const client = clientSimule(reponseOutil(ficheModele({ angle_brana_sana: 'x' })));
  const fiche = await extractFiche(client, articleFactice());
  assert.equal(client.appels.length, 2);
  assert.equal(fiche.statut, ECHEC_EXTRACTION);
  assert.equal(fiche.titre, 'A simulated study');
  assert.equal(fiche.resultat_principal, undefined);
});

test('réponse tronquée : limite de tokens doublée, même si le contenu semble complet', async () => {
  const client = clientSimule(reponseOutil(ficheModele(), 'max_tokens'), reponseOutil(ficheModele()));
  const fiche = await extractFiche(client, articleFactice());
  assert.deepEqual(client.appels.map((a) => a.max_tokens), [2048, 4096]);
  assert.equal(fiche.statut, undefined);
});

test('toujours tronquée : extraction échouée', async () => {
  const fiche = await extractFiche(clientSimule(reponseOutil({}, 'max_tokens')), articleFactice());
  assert.equal(fiche.statut, ECHEC_EXTRACTION);
  assert.match(fiche.raison_echec, /tronquée/);
});

test("erreur d'API : extraction échouée, sans lever", async () => {
  const fiche = await extractFiche(clientSimule(new Error('overloaded')), articleFactice());
  assert.equal(fiche.statut, ECHEC_EXTRACTION);
});
