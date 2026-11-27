import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractFiche } from '../src/extract.js';
import { separerPreuve, enregistrerPreuves } from '../src/preuves.js';
import { ficheModele, articleFactice, reponseOutil, clientSimule } from './helpers.js';

test('résumé, types, PMID et origine des champs vont dans abstracts/<année>.json, pas dans la fiche', async () => {
  const article = articleFactice({ publicationTypes: ['Observational Study'] });
  const brute = await extractFiche(clientSimule(reponseOutil(ficheModele({ titre: 'Titre inventé' }))), article);
  const { fiche, preuve } = separerPreuve(brute, article);
  assert.equal(fiche.titre, 'A simulated study');
  assert.equal(fiche.origines, undefined);
  assert.equal(fiche.resume, undefined);

  const dossier = await mkdtemp(path.join(tmpdir(), 'preuves-'));
  await enregistrerPreuves(dossier, [preuve]);
  await enregistrerPreuves(dossier, [{ ...preuve, cle: '222', pmid: '222' }]);
  const contenu = JSON.parse(await readFile(path.join(dossier, '2026.json'), 'utf-8'));
  assert.deepEqual(Object.keys(contenu), ['111', '222']);
  assert.equal(contenu['111'].resume, article.abstract);
  assert.deepEqual(contenu['111'].publication_types, ['Observational Study']);
  assert.equal(contenu['111'].sources_champs.type_etude, 'code');
  assert.equal(contenu['111'].sources_champs.titre, 'code');
  assert.equal(contenu['111'].sources_champs.resultat_principal, 'modèle');
});
