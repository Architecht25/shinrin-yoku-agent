import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildHtml, jsonPourScript } from '../src/exportHtml.js';

const piege = '</script><script>alert(1)</script><!--<img src=x onerror=alert(2)>&\u2028\u2029"\'';
const fiche = (o = {}) => ({
  titre: piege, auteurs: piege, type_etude: piege, resultat_principal: piege, mecanisme_evalue: piege,
  niveau_de_preuve_et_limites: piege, angle_brana_sana: piege, pertinence_brana_sana: '<b>', lien: 'javascript:alert(3)',
  niveau_de_preuve: piege, confiance_extraction: piege, justification_niveau: piege,
  thematique_id: 'sommeil', thematique: piege, ajoute_le: '2026-11-27', ...o,
});

test('le JSON inséré ne contient aucun caractère capable de sortir de la balise, et reste fidèle', () => {
  const json = jsonPourScript({ t: piege });
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/);
  assert.equal(JSON.parse(json).t, piege);
});

const blocJson = (html, id) => html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1];

test('la page garde exactement ses trois scripts et les données intactes', () => {
  const html = buildHtml([fiche()]);
  assert.equal(html.match(/<script/g).length, 3);
  assert.equal(html.match(/<\/script>/g).length, 3);
  assert.equal(JSON.parse(blocJson(html, 'fiches-data'))[0].titre, piege);
});

/** DOM minimal : exécute le script de la page et enregistre tout ce qui est écrit en HTML. */
function executer(html) {
  const elements = [];
  const creer = (tag = 'div') => {
    const el = {
      tag, children: [], ecouteurs: {}, value: '', style: { setProperty() {} },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(type, f) { this.ecouteurs[type] = f; },
      getAttribute: () => null, setAttribute() {},
    };
    elements.push(el);
    return el;
  };
  const parId = new Map();
  const document = {
    documentElement: creer('html'),
    createElement: creer,
    getElementById(id) {
      if (!parId.has(id)) {
        const el = creer();
        if (id.endsWith('-data') || id === 'theme-meta') el.textContent = blocJson(html, id);
        parId.set(id, el);
      }
      return parId.get(id);
    },
  };
  const code = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, { document, window: { matchMedia: () => ({ matches: false }) } });
  return { elements, parId };
}

test('aucun texte n’est interprété comme HTML, et seuls les liens web sont cliquables', () => {
  const { elements, parId } = executer(buildHtml([fiche(), fiche({ lien: 'https://exemple.org/a' })]));
  parId.get('expandAll').ecouteurs.click();
  const ecrit = elements.map((e) => e.innerHTML || '').join('');
  assert.match(ecrit, /&lt;\/script&gt;/);
  assert.doesNotMatch(ecrit, /<script|<img|<b>|<!--/);
  assert.deepEqual([...new Set(elements.filter((e) => e.tag === 'a').map((e) => e.href))], ['https://exemple.org/a']);
});

test('les fiches en échec ne sont pas publiées', () => {
  const html = buildHtml([fiche({ statut: 'extraction échouée', titre: 'NE PAS PUBLIER' })]);
  assert.doesNotMatch(html, /NE PAS PUBLIER/);
});
