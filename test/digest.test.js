import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalToMarkdown } from '../src/digest.js';

const f = (o = {}) => ({ type_etude: 'RCT', thematique: 'Sommeil', doi: '10.1/x', lien: null, ...o });

test('journalToMarkdown : liens issus des fiches, ids invalides et doublons ignorés', () => {
  const md = journalToMarkdown(
    {
      titre_une: 'Titre',
      chapeau: 'Chapeau',
      a_la_une: [
        { fiche_id: 0, titre_journal: 'Une A', texte: 'Texte', pour_la_borbolla: 'Appli' },
        { fiche_id: 99, titre_journal: 'Fantôme', texte: 't', pour_la_borbolla: 'a' },
      ],
      en_bref: [
        { fiche_id: 0, phrase: 'Doublon' },
        { fiche_id: 1, phrase: 'Autre étude' },
      ],
    },
    [f(), f({ doi: null, lien: 'https://e.org' })],
    { runDate: '2026-11-16' }
  );
  assert.match(md, /### Une A/);
  assert.match(md, /https:\/\/doi\.org\/10\.1\/x/);
  assert.doesNotMatch(md, /Fantôme|Doublon/);
  assert.match(md, /Autre étude.*https:\/\/e\.org/);
});
