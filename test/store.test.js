import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dedupKey, partitionNewArticles } from '../src/store.js';

describe('dedupKey', () => {
  test('utilise le DOI normalisé (minuscule, trim) quand il est disponible', () => {
    assert.equal(dedupKey({ doi: ' 10.1234/ABC ' }), 'doi:10.1234/abc');
  });

  test("retombe sur le titre normalisé quand aucun DOI n'est disponible", () => {
    assert.equal(
      dedupKey({ titre: 'Forest Bathing & Stress: A Review!' }),
      'title:forest bathing stress a review'
    );
  });

  test('deux titres avec accents/casse/ponctuation différents donnent la même clé', () => {
    const a = dedupKey({ titre: 'Étude sur le Sommeil Réparateur' });
    const b = dedupKey({ titre: 'etude sur le sommeil reparateur' });
    assert.equal(a, b);
  });
});

describe('partitionNewArticles', () => {
  test('exclut un article dont le DOI correspond exactement à un déjà stocké', () => {
    const store = { fiches: [{ doi: '10.1000/xyz', titre: 'Ancien titre' }] };
    const articles = [{ doi: '10.1000/xyz', title: 'Titre différent mais même DOI' }];

    const nouveaux = partitionNewArticles(store, articles);

    assert.deepEqual(nouveaux, []);
  });

  test('exclut un article dont le titre normalisé correspond à un déjà stocké sans DOI', () => {
    const store = { fiches: [{ doi: null, titre: 'Forest Bathing and Cortisol Levels' }] };
    const articles = [{ doi: null, title: 'forest bathing and cortisol levels' }];

    const nouveaux = partitionNewArticles(store, articles);

    assert.deepEqual(nouveaux, []);
  });

  test('conserve un article réellement nouveau (DOI et titre inédits)', () => {
    const store = { fiches: [{ doi: '10.1000/xyz', titre: 'Ancien titre' }] };
    const articles = [{ doi: '10.9999/new', title: 'Un article totalement nouveau' }];

    const nouveaux = partitionNewArticles(store, articles);

    assert.equal(nouveaux.length, 1);
    assert.equal(nouveaux[0].title, 'Un article totalement nouveau');
  });

  test('déduplique aussi au sein du même lot (deux articles identiques dans le batch)', () => {
    const store = { fiches: [] };
    const articles = [
      { doi: '10.5555/dup', title: 'Article en double' },
      { doi: '10.5555/dup', title: 'Article en double (variante titre)' },
    ];

    const nouveaux = partitionNewArticles(store, articles);

    assert.equal(nouveaux.length, 1);
  });
});
