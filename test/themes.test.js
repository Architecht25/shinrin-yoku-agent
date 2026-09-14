import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/themes.js';

const EXPECTED_THEME_IDS = [
  'shinrin-yoku',
  'sommeil',
  'manuel',
  'mindfulness',
  'nutrition-longevite',
  'prevention-personnalisee',
];

describe('THEMES', () => {
  test('définit exactement les 6 thématiques attendues, dans le bon ordre', () => {
    assert.deepEqual(
      THEMES.map((t) => t.id),
      EXPECTED_THEME_IDS
    );
  });

  test('chaque thématique porte un id, un label et une requête PubMed non vides', () => {
    for (const theme of THEMES) {
      assert.equal(typeof theme.id, 'string');
      assert.ok(theme.id.length > 0, `id vide pour ${JSON.stringify(theme)}`);

      assert.equal(typeof theme.label, 'string');
      assert.ok(theme.label.length > 0, `label vide pour ${theme.id}`);

      assert.equal(typeof theme.pubmedQuery, 'string');
      assert.ok(theme.pubmedQuery.length > 0, `pubmedQuery vide pour ${theme.id}`);
    }
  });

  test('chaque thématique porte un tableau referenceAuthors (éventuellement vide)', () => {
    for (const theme of THEMES) {
      assert.ok(Array.isArray(theme.referenceAuthors), `referenceAuthors manquant pour ${theme.id}`);
    }
  });

  test('chaque chercheur de référence a un nom et un terme de recherche PubMed', () => {
    for (const theme of THEMES) {
      for (const author of theme.referenceAuthors) {
        assert.equal(typeof author.nom, 'string');
        assert.ok(author.nom.length > 0, `nom vide pour un auteur de ${theme.id}`);

        assert.equal(typeof author.pubmedAuthorTerm, 'string');
        assert.ok(
          author.pubmedAuthorTerm.includes('[Author]'),
          `pubmedAuthorTerm mal formé pour ${author.nom} (${theme.id})`
        );
      }
    }
  });

  test("la thématique 'manuel' n'a pas encore de chercheur de référence identifié", () => {
    const manuel = THEMES.find((t) => t.id === 'manuel');
    assert.deepEqual(manuel.referenceAuthors, []);
  });
});
