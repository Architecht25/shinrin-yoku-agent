import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildRunMarkdown, buildFullExportMarkdown } from '../src/markdown.js';

function ficheFactice(overrides = {}) {
  return {
    titre: 'Une étude factice sur le bain de forêt',
    auteurs: 'Dupont J, Martin P',
    date: '2026-01-15',
    doi: '10.1234/fake.doi',
    lien: null,
    source: 'PubMed',
    pmid: '99999999',
    type_etude: 'RCT',
    mecanisme_evalue: 'Cortisol salivaire',
    resultat_principal: 'Réduction observée du cortisol après immersion forestière.',
    niveau_de_preuve_et_limites: "Échantillon réduit, absence de groupe contrôle.",
    angle_brana_sana: 'Pertinent pour les sentiers de marche lente.',
    thematique_id: 'shinrin-yoku',
    thematique: 'Bain de forêt / shinrin-yoku',
    origine_recherche: 'mot-clé',
    chercheur_reference: null,
    ajoute_le: '2026-09-14',
    ...overrides,
  };
}

describe('buildRunMarkdown', () => {
  test('inclut la date du run et le nombre de fiches dans l\'en-tête', () => {
    const md = buildRunMarkdown([ficheFactice()], { runDate: '2026-09-14' });

    assert.match(md, /# Veille La Borbolla \/ Braña Sana — 2026-09-14/);
    assert.match(md, /1 nouvelle\(s\) étude\(s\) détectée\(s\)/);
  });

  test('regroupe les fiches sous une section portant le libellé de la thématique', () => {
    const md = buildRunMarkdown([ficheFactice()], { runDate: '2026-09-14' });

    assert.match(md, /## Bain de forêt \/ shinrin-yoku/);
    assert.match(md, /### Une étude factice sur le bain de forêt/);
  });

  test('affiche les champs clés de la fiche (auteurs, date, DOI, résultat, limites)', () => {
    const md = buildRunMarkdown([ficheFactice()], { runDate: '2026-09-14' });

    assert.match(md, /\*\*Auteurs\*\* : Dupont J, Martin P/);
    assert.match(md, /\*\*Date\*\* : 2026-01-15/);
    assert.match(md, /\[DOI: 10\.1234\/fake\.doi\]\(https:\/\/doi\.org\/10\.1234\/fake\.doi\)/);
    assert.match(md, /\*\*Résultat principal\*\* : Réduction observée du cortisol/);
    assert.match(md, /\*\*Niveau de preuve \/ limites\*\* : Échantillon réduit/);
    assert.match(md, /\*\*Angle Braña Sana\*\* : Pertinent pour les sentiers/);
  });

  test('utilise le lien source quand le DOI est absent', () => {
    const md = buildRunMarkdown(
      [ficheFactice({ doi: null, lien: 'https://example.org/etude' })],
      { runDate: '2026-09-14' }
    );

    assert.match(md, /\[Lien source\]\(https:\/\/example\.org\/etude\)/);
  });

  test('préfixe le titre par la référence du chercheur pour une fiche issue de la recherche prioritaire', () => {
    const md = buildRunMarkdown(
      [ficheFactice({ origine_recherche: 'reference', chercheur_reference: 'Qing Li' })],
      { runDate: '2026-09-14' }
    );

    assert.match(md, /### \[Référence — Qing Li\] Une étude factice sur le bain de forêt/);
  });

  test('regroupe correctement plusieurs thématiques dans l\'ordre de src/themes.js', () => {
    const md = buildRunMarkdown(
      [
        ficheFactice({ thematique_id: 'sommeil', thematique: 'Repos / sommeil', titre: 'Étude sommeil' }),
        ficheFactice({ thematique_id: 'shinrin-yoku', titre: 'Étude forêt' }),
      ],
      { runDate: '2026-09-14' }
    );

    const idxForet = md.indexOf('## Bain de forêt / shinrin-yoku');
    const idxSommeil = md.indexOf('## Repos / sommeil');
    assert.ok(idxForet !== -1 && idxSommeil !== -1);
    assert.ok(idxForet < idxSommeil, 'shinrin-yoku doit apparaître avant sommeil (ordre de THEMES)');
  });
});

describe('buildFullExportMarkdown', () => {
  test('affiche le total de fiches et trie par date d\'ajout décroissante au sein d\'une section', () => {
    const md = buildFullExportMarkdown([
      ficheFactice({ titre: 'Fiche ancienne', ajoute_le: '2026-01-01' }),
      ficheFactice({ titre: 'Fiche récente', ajoute_le: '2026-09-01' }),
    ]);

    assert.match(md, /# Base de connaissances/);
    assert.match(md, /2 étude\(s\) au total/);

    const idxRecente = md.indexOf('Fiche récente');
    const idxAncienne = md.indexOf('Fiche ancienne');
    assert.ok(idxRecente < idxAncienne, 'la fiche la plus récente doit apparaître en premier');
  });
});
