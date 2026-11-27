import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIVEAUX, LISTE_NIVEAUX, niveauParPubmed, resoudreNiveau, appliquerPrudence, verbeCausal } from '../src/niveaux.js';
import { extractFiche } from '../src/extract.js';
import { verifierFiche } from '../src/verification.js';
import { separerPreuve } from '../src/preuves.js';
import { ficheModele, articleFactice, reponseOutil, clientSimule } from './helpers.js';

test('liste des niveaux', () => {
  assert.deepEqual(LISTE_NIVEAUX, ['essai contrôlé', "synthèse d'études", 'observationnelle', 'exploratoire', 'opinion ou revue narrative', 'indéterminé']);
});

test('attribution par le code selon les Publication Types', () => {
  for (const [pt, attendu] of [
    ['Randomized Controlled Trial', NIVEAUX.CONTROLE], ['Meta-Analysis', NIVEAUX.SYNTHESE], ['Systematic Review', NIVEAUX.SYNTHESE],
    ['Observational Study', NIVEAUX.OBSERVATIONNELLE], ['Cohort', NIVEAUX.OBSERVATIONNELLE], ['Case-Control Studies', NIVEAUX.OBSERVATIONNELLE],
    ['Editorial', NIVEAUX.OPINION], ['Clinical Trial Protocol', NIVEAUX.INDETERMINE],
  ]) {
    assert.equal(niveauParPubmed(['Journal Article', pt]).impose, attendu, pt);
  }
});

const resume = 'This narrative overview discusses rest. We surveyed 400 adults at a single time point.';
const proposition = (o = {}) => ({ niveau_propose: NIVEAUX.OBSERVATIONNELLE, extrait_justification: 'We surveyed 400 adults at a single time point.', justification_niveau: 'Enquête à un instant donné.', ...o });

test('cas ambigu : « indéterminé », sauf proposition justifiée par un extrait réel du résumé', () => {
  const article = { publicationTypes: ['Journal Article'], abstract: resume };
  assert.equal(resoudreNiveau(article, proposition()).niveau, NIVEAUX.OBSERVATIONNELLE);
  for (const p of [proposition({ extrait_justification: '' }), proposition({ extrait_justification: 'A randomized trial was conducted.' }), proposition({ justification_niveau: '' })]) {
    assert.equal(resoudreNiveau(article, p).niveau, NIVEAUX.INDETERMINE);
  }
  const revue = { publicationTypes: ['Review'], abstract: resume };
  assert.equal(resoudreNiveau(revue, proposition()).niveau, NIVEAUX.INDETERMINE, 'hors de la famille des revues');
});

test('prudence : revue narrative plafonnée, pilote et petite taille exploratoires', () => {
  const p = (o) => appliquerPrudence({ type: 'indéterminé', niveau: NIVEAUX.CONTROLE, effectif: 200, titre: '', ...o }, 30).niveau;
  assert.equal(p({ type: 'revue narrative', niveau: NIVEAUX.SYNTHESE }), NIVEAUX.OPINION);
  assert.equal(p({ type: 'article théorique ou perspective' }), NIVEAUX.OPINION);
  assert.equal(p({ type: 'étude pilote' }), NIVEAUX.EXPLORATOIRE);
  assert.equal(p({ titre: 'A pilot trial of napping' }), NIVEAUX.EXPLORATOIRE);
  assert.equal(p({ effectif: 12 }), NIVEAUX.EXPLORATOIRE);
  assert.equal(p({ niveau: NIVEAUX.SYNTHESE, effectif: 12 }), NIVEAUX.SYNTHESE);
  assert.equal(p({}), NIVEAUX.CONTROLE);
  assert.equal(p({ niveau: NIVEAUX.OPINION, type: 'étude pilote' }), NIVEAUX.OPINION, 'jamais de montée');
});

test('verbes causaux repérés ; associations, négations, buts et adjectifs admis', () => {
  for (const phrase of ['La marche réduit le stress.', 'Dormir tôt améliore l’humeur.', 'Cela peut diminuer l’anxiété.', 'Le programme a nettement amélioré le sommeil.', 'La nature protège de la dépression.', 'Cela permet de mieux dormir.']) {
    assert.ok(verbeCausal(phrase), phrase);
  }
  for (const phrase of ['La marche est associée à un risque réduit de fatigue.', 'On ne peut pas dire que la nature améliore l’humeur.', 'Aucun lien de cause à effet.', 'Une étude pour savoir si la sieste augmente la mémoire.', 'Un programme visant à améliorer le sommeil.', 'Le groupe réduit était composé de soignants.']) {
    assert.equal(verbeCausal(phrase), null, phrase);
  }
});

async function chaine(modele, article, avis = {}) {
  const brute = await extractFiche(clientSimule(reponseOutil(ficheModele(modele))), article);
  const { fiche, preuve } = separerPreuve(brute, article);
  const verdict = avis instanceof Error ? avis : reponseOutil({ verdict: 'confirmé', raison: '', type_etude_corrige: '', resultat_principal_corrige: '', limites_corrigees: '', niveau_corrige: '', justification_niveau_corrigee: '', ...avis });
  return verifierFiche(clientSimule(verdict), fiche, preuve);
}
const article = articleFactice({ abstract: resume });

test('quatre notions sur la fiche ; l’extrait du résumé n’est pas conservé', async () => {
  const { fiche } = await chaine({ type_etude: 'étude observationnelle', ...proposition(), effectif: 400, angle_brana_sana: 'Atelier', pertinence_centre: 4 }, article);
  assert.equal(fiche.type_etude, 'étude observationnelle');
  assert.equal(fiche.niveau_de_preuve, NIVEAUX.OBSERVATIONNELLE);
  assert.equal(fiche.confiance_extraction, 'vérifié');
  assert.equal(fiche.pertinence_centre, 4);
  assert.doesNotMatch(JSON.stringify(fiche), /We surveyed|pertinence_brana_sana|extrait/);
});

test('le relecteur corrige le niveau proposé ; sans vérification, il redevient « indéterminé »', async () => {
  const corrige = await chaine(proposition(), article, { verdict: 'à corriger', raison: 'devis', niveau_corrige: NIVEAUX.OPINION, justification_niveau_corrigee: 'Le texte présente un avis, sans méthode.' });
  assert.equal(corrige.fiche.justification_niveau, 'Le texte présente un avis, sans méthode.');
  assert.equal(corrige.fiche.niveau_de_preuve, NIVEAUX.OPINION);
  assert.equal(corrige.fiche.confiance_extraction, 'à confirmer');
  const panne = await chaine({ type_etude: 'étude observationnelle', ...proposition() }, article, new Error('panne'));
  assert.equal(panne.fiche.niveau_de_preuve, NIVEAUX.INDETERMINE);
});

test('le code prime sur le relecteur', async () => {
  const { fiche } = await chaine(proposition(), articleFactice({ abstract: resume, publicationTypes: ['Randomized Controlled Trial'] }), { verdict: 'à corriger', raison: 'x', niveau_corrige: NIVEAUX.OBSERVATIONNELLE, justification_niveau_corrigee: 'Autre.', resultat_principal_corrige: 'Écart observé.' });
  assert.equal(fiche.niveau_de_preuve, NIVEAUX.CONTROLE);
  assert.match(fiche.justification_niveau, /^Publication Type PubMed/);
});

test('étude observationnelle : aucun verbe causal, ni dans le résultat ni dans l’angle', async () => {
  const { fiche } = await chaine(
    { ...proposition(), resultat_principal: 'La marche réduit le stress. Une association est observée.', angle_brana_sana: 'La marche améliore le sommeil.', pertinence_centre: 4 },
    articleFactice({ abstract: resume, publicationTypes: ['Observational Study'] })
  );
  assert.equal(fiche.resultat_principal, 'Une association est observée.');
  assert.equal(fiche.angle_brana_sana, '');
  assert.equal(fiche.pertinence_centre, 0);
  assert.equal(fiche.confiance_extraction, 'à confirmer');
});
