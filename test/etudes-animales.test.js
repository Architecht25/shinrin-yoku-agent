import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estEtudeAnimale } from '../src/etudes-animales.js';

test('travaux sur l’animal écartés d’après le titre ou le résumé', () => {
  for (const a of [
    { title: 'Constant light and offspring outcomes', abstract: 'In this study, we established a rat model of continuous light exposure.' },
    { title: 'Sleep loss in mice', abstract: '' },
    { title: 'Gardening odours', abstract: 'Male Wistar animals were randomly assigned.' },
    { title: 'Napping', abstract: 'Female mice were kept in the dark.' },
  ]) assert.ok(estEtudeAnimale(a), a.title);
});

test('études et revues portant aussi sur des humains gardées', () => {
  for (const a of [
    { title: 'Long COVID in China', abstract: 'Participants reported their intake of animal products.' },
    { title: 'Light and mood: a review', abstract: 'Evidence from animal models and from adults is reviewed.' },
    { title: 'From mice to humans: sleep', abstract: '' },
    { title: 'Forest walking and stress', abstract: 'We measured cortisol.' },
    { title: 'The rate of napping', abstract: 'Rates were compared; strategies were discussed.' },
  ]) assert.ok(!estEtudeAnimale(a), a.title);
});
