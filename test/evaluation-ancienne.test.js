import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluerFicheAncienne } from '../src/evaluation-ancienne.js';
import { articleFactice, reponseOutil, clientSimule } from './helpers.js';

console.error = () => {};
const ancienne = { pmid: '111', type_etude: 'RCT', niveau_de_preuve: 'non évalué', resultat_principal: 'Texte d’origine réduit de 99 %.', niveau_de_preuve_et_limites: 'L.', mecanisme_evalue: 'm', angle_brana_sana: '', titre: 'T' };
const article = articleFactice({ publicationTypes: ['Observational Study'] });
const evaluation = reponseOutil({ type_etude: 'étude observationnelle', niveau_propose: 'indéterminé', extrait_justification: '', justification_niveau: '', effectif: 0, pertinence_centre: 0 });
const avis = reponseOutil({ verdict: 'confirmé', raison: '', type_etude_corrige: '', resultat_principal_corrige: '', limites_corrigees: '', angle_corrige: '', niveau_corrige: '', justification_niveau_corrigee: '' });

test('évaluée une seule fois, avec les mêmes règles, sans reclasser ni réécrire', async () => {
  const client = clientSimule(evaluation, avis);
  const { fiche, preuve } = await evaluerFicheAncienne(client, ancienne, article, '2026-11-27');
  assert.equal(fiche.niveau_de_preuve, 'observationnelle');
  assert.ok(['vérifié', 'à confirmer'].includes(fiche.confiance_extraction));
  assert.equal(fiche.type_etude, 'RCT');
  assert.equal(fiche.resultat_principal, ancienne.resultat_principal);
  assert.ok(preuve);
  const encore = await evaluerFicheAncienne(client, fiche, article, '2026-12-04');
  assert.equal(encore.preuve, null);
  assert.equal(client.appels.length, 2);
});

test('vérification impossible ou résumé absent : reste « non évalué »', async () => {
  for (const [client, a] of [[clientSimule(evaluation, new Error('panne')), article], [clientSimule(new Error('panne')), article], [clientSimule(evaluation), { ...article, abstract: '' }]]) {
    const r = await evaluerFicheAncienne(client, ancienne, a, '2026-11-27');
    assert.equal(r.fiche.niveau_de_preuve, 'non évalué');
    assert.equal(r.preuve, null);
  }
});
