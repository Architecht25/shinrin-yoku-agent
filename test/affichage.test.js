import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalToMarkdown } from '../src/digest.js';
import { buildRunMarkdown } from '../src/markdown.js';
import { buildHtml } from '../src/exportHtml.js';

const fiche = (o = {}) => ({
  titre: 'Étude', type_etude: 'revue narrative', niveau_de_preuve: 'opinion ou revue narrative', confiance_extraction: 'à confirmer',
  justification_niveau: 'Revue sans méthode systématique.', niveau_de_preuve_et_limites: 'Aucune méthode décrite.',
  thematique: 'Repos / sommeil', thematique_id: 'sommeil', doi: '10.1/x', ajoute_le: '2026-11-27', ...o,
});
const journal = (a_la_une, en_bref = []) => ({ titre_une: 'T', chapeau: 'C', a_la_une, en_bref });
const une = { fiche_id: 0, titre_journal: 'Titre', texte: 'Étude solide, essai contrôlé.', pour_la_borbolla: '' };
const rendre = (j, fiches) => journalToMarkdown(j, fiches, { runDate: '2026-11-27' });

test('revue narrative jamais « À la une » sans l’avertissement ; idem pour « indéterminé »', () => {
  for (const niveau of ['opinion ou revue narrative', 'indéterminé']) {
    const md = rendre(journal([une]), [fiche({ niveau_de_preuve: niveau })]);
    assert.ok(md.includes(`**⚠️ Niveau de preuve : ${niveau}.**`));
    assert.ok(md.indexOf('⚠️') < md.indexOf(une.texte), 'avant le texte');
  }
  assert.doesNotMatch(rendre(journal([une]), [fiche({ niveau_de_preuve: 'essai contrôlé' })]), /⚠️/);
});

test('« En bref » affiche type, niveau et confiance lus sur la fiche', () => {
  const md = rendre(journal([], [{ fiche_id: 0, phrase: 'Phrase.' }]), [fiche()]);
  assert.match(md, /- Phrase\. \(Repos \/ sommeil — revue narrative — niveau de preuve : opinion ou revue narrative — extraction : à confirmer — \[DOI\]/);
});

test('« À la une » : étiquettes de la fiche, quoi que dise le texte du journal', () => {
  const md = rendre(journal([une]), [fiche()]);
  assert.match(md, /\*revue narrative — niveau de preuve : opinion ou revue narrative — extraction : à confirmer — Repos/);
});

test('fiches détaillées : bloc « Niveau de preuve » avec justification et limites ; ancienne fiche « non évalué »', () => {
  const md = buildRunMarkdown([fiche()], { runDate: '2026-11-27' });
  assert.match(md, /\*\*Niveau de preuve\*\* : opinion ou revue narrative — extraction : à confirmer\n\n- \*\*Justification\*\* : Revue sans[^\n]*\n- \*\*Limites\*\* : Aucune méthode/);
  const ancienne = buildRunMarkdown([fiche({ niveau_de_preuve: 'non évalué', confiance_extraction: undefined, justification_niveau: undefined })], { runDate: '2026-11-27' });
  assert.match(ancienne, /\*\*Niveau de preuve\*\* : non évalué/);
});

test('tableau de bord : niveau et confiance', () => {
  const html = buildHtml([fiche()]);
  assert.match(html, /niveau : ' \+ escapeHtml\(f\.niveau_de_preuve/);
  assert.match(html, /extraction : ' \+ escapeHtml\(f\.confiance_extraction/);
});
