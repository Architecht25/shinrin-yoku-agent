import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/themes.js';

const EXPECTED_THEME_IDS = ['shinrin-yoku', 'sommeil', 'sieste-marche'];

describe('THEMES', () => {
  test('définit exactement les 3 thématiques attendues, dans le bon ordre', () => {
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

  test("la thématique 'sieste-marche' n'a pas de chercheur de référence identifié", () => {
    const siesteMarche = THEMES.find((t) => t.id === 'sieste-marche');
    assert.deepEqual(siesteMarche.referenceAuthors, []);
  });
});

import { withExclusions } from '../src/sources/pubmed.js';

describe('withExclusions', () => {
  test('enveloppe la requête et exclut animaux/in vitro sans exiger humans[MeSH]', () => {
    const q = withExclusions('"forest bathing"[Title/Abstract]');
    assert.ok(q.startsWith('("forest bathing"[Title/Abstract]) NOT'));
    assert.match(q, /zebrafish/);
    assert.match(q, /animals\[MeSH Terms\] NOT humans\[MeSH Terms\]/);
    assert.doesNotMatch(q, /AND humans/);
  });
});
