import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadStore } from './store.js';
import { THEMES } from './themes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'veille-la-borbolla');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'dashboard.html');

// Couleurs catégorielles (palette validée, ordre fixe des slots 1 à 6 — voir
// skill dataviz) attribuées par thématique, jamais par rang, pour que la
// couleur d'une thématique ne change pas quand on filtre.
const THEME_COLORS = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
];

function buildThemeMeta() {
  const meta = {};
  THEMES.forEach((t, i) => {
    meta[t.id] = { label: t.label, color: THEME_COLORS[i % THEME_COLORS.length] };
  });
  meta['_non-classe'] = { label: 'Non classé', color: { light: '#898781', dark: '#898781' } };
  return meta;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function buildHtml(fiches) {
  const themeMeta = buildThemeMeta();
  const data = fiches.map((f) => ({
    ...f,
    thematique_id: f.thematique_id || '_non-classe',
    thematique: f.thematique || 'Non classé',
  }));

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Veille La Borbolla — tableau de bord</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --border: rgba(11,11,11,0.10);
    --gridline: #e1e0d9;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --border: rgba(255,255,255,0.10);
      --gridline: #2c2c2a;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --page: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --border: rgba(255,255,255,0.10);
    --gridline: #2c2c2a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header {
    padding: 20px 16px 12px;
    max-width: 980px;
    margin: 0 auto;
  }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 0.9rem; margin: 0 0 16px; }
  .theme-toggle {
    position: absolute; top: 16px; right: 16px;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 10px; color: var(--text-primary);
    font-size: 0.8rem; cursor: pointer;
  }
  .controls {
    max-width: 980px; margin: 0 auto; padding: 0 16px 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  select, input[type="text"] {
    background: var(--surface-1); color: var(--text-primary);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 7px 10px; font-size: 0.85rem;
  }
  input[type="text"] { flex: 1; min-width: 200px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--border); border-radius: 999px;
    padding: 5px 11px; font-size: 0.78rem; cursor: pointer;
    background: var(--surface-1); color: var(--text-secondary);
    user-select: none;
  }
  .chip.active { color: var(--text-primary); font-weight: 600; border-color: currentColor; }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .chip .count { color: var(--text-muted); }
  .chip.active .count { color: inherit; }
  label.checkbox { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--text-secondary); }
  .buttons { display: flex; gap: 8px; margin-left: auto; }
  button.plain {
    background: none; border: 1px solid var(--border); border-radius: 8px;
    padding: 6px 10px; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer;
  }
  main { max-width: 980px; margin: 0 auto; padding: 0 16px 60px; }
  .count-line { color: var(--text-secondary); font-size: 0.85rem; margin: 6px 0 14px; }
  .card {
    background: var(--surface-1); border: 1px solid var(--border);
    border-left: 4px solid var(--card-color, var(--gridline));
    border-radius: 10px; padding: 12px 14px; margin-bottom: 10px;
    cursor: pointer;
  }
  .card-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
  .card-title { font-size: 0.95rem; font-weight: 600; margin: 0; flex: 1 1 auto; min-width: 200px; }
  .badge {
    font-size: 0.7rem; padding: 2px 7px; border-radius: 999px;
    background: var(--gridline); color: var(--text-secondary); white-space: nowrap;
  }
  .badge-pertinence {
    background: rgba(12,163,12,0.16); color: #0ca30c; font-weight: 600;
  }
  .meta-line { color: var(--text-secondary); font-size: 0.78rem; margin-top: 4px; }
  .snippet { color: var(--text-secondary); font-size: 0.85rem; margin-top: 6px; }
  .details { display: none; margin-top: 10px; border-top: 1px solid var(--gridline); padding-top: 10px; font-size: 0.85rem; }
  .details.open { display: block; }
  .details dt { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; margin-top: 8px; }
  .details dd { margin: 2px 0 0; color: var(--text-primary); }
  .details a { color: var(--card-color, #2a78d6); }
  .empty { color: var(--text-muted); text-align: center; padding: 40px 0; }
  .section-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); margin: 20px 0 8px; }
</style>
</head>
<body>
<header style="position: relative;">
  <button class="theme-toggle" id="themeToggle">🌓 thème</button>
  <h1>Veille scientifique — La Borbolla</h1>
  <p class="subtitle">Tableau de bord de tri des fiches extraites depuis PubMed.</p>
</header>
<div class="controls">
  <div class="row">
    <select id="runSelect"></select>
    <input type="text" id="search" placeholder="Rechercher (titre, auteurs, résultat…)">
    <div class="buttons">
      <button class="plain" id="expandAll">Tout déplier</button>
      <button class="plain" id="collapseAll">Tout replier</button>
    </div>
  </div>
  <div class="row" id="themeChips"></div>
  <div class="row">
    <select id="typeSelect"><option value="">Tous types d'étude</option></select>
    <label class="checkbox"><input type="checkbox" id="onlyAngle"> avec angle Braña Sana renseigné</label>
  </div>
</div>
<main>
  <div class="count-line" id="countLine"></div>
  <div id="list"></div>
</main>
<script id="fiches-data" type="application/json">${JSON.stringify(data)}</script>
<script id="theme-meta" type="application/json">${JSON.stringify(themeMeta)}</script>
<script>
(function () {
  const fiches = JSON.parse(document.getElementById('fiches-data').textContent);
  const themeMeta = JSON.parse(document.getElementById('theme-meta').textContent);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);

  function themeColor(id) {
    const meta = themeMeta[id] || themeMeta['_non-classe'];
    return isDark() ? meta.color.dark : meta.color.light;
  }

  // --- thème clair/sombre ---
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    render();
  });

  // --- dates de run disponibles (plus récent en premier) ---
  const runDates = [...new Set(fiches.map((f) => f.ajoute_le).filter(Boolean))].sort().reverse();
  const runSelect = document.getElementById('runSelect');
  const allOption = document.createElement('option');
  allOption.value = '__all__';
  allOption.textContent = 'Toute la base (' + fiches.length + ' fiches)';
  runSelect.appendChild(allOption);
  runDates.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d;
    const n = fiches.filter((f) => f.ajoute_le === d).length;
    opt.textContent = d + ' (' + n + ' nouvelle' + (n > 1 ? 's' : '') + ')';
    runSelect.appendChild(opt);
  });
  if (runDates.length) runSelect.value = runDates[0];

  // --- filtre types d'étude ---
  const typeSelect = document.getElementById('typeSelect');
  [...new Set(fiches.map((f) => f.type_etude).filter(Boolean))].sort().forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });

  // --- état des filtres ---
  const state = { themes: new Set(), search: '', type: '', onlyAngle: false };
  const expanded = new Set();

  const themeChipsEl = document.getElementById('themeChips');
  const searchEl = document.getElementById('search');
  const onlyAngleEl = document.getElementById('onlyAngle');
  const listEl = document.getElementById('list');
  const countLineEl = document.getElementById('countLine');

  runSelect.addEventListener('change', render);
  typeSelect.addEventListener('change', () => { state.type = typeSelect.value; render(); });
  searchEl.addEventListener('input', () => { state.search = searchEl.value.trim().toLowerCase(); render(); });
  onlyAngleEl.addEventListener('change', () => { state.onlyAngle = onlyAngleEl.checked; render(); });
  document.getElementById('expandAll').addEventListener('click', () => {
    currentVisible().forEach((f) => expanded.add(f._key));
    render();
  });
  document.getElementById('collapseAll').addEventListener('click', () => {
    expanded.clear();
    render();
  });

  fiches.forEach((f, i) => { f._key = (f.doi || f.titre || '') + '::' + i; });

  function currentRunFiches() {
    const val = runSelect.value;
    if (val === '__all__') return fiches;
    return fiches.filter((f) => f.ajoute_le === val);
  }

  function currentVisible() {
    let list = currentRunFiches();
    if (state.themes.size) list = list.filter((f) => state.themes.has(f.thematique_id));
    if (state.type) list = list.filter((f) => f.type_etude === state.type);
    if (state.onlyAngle) list = list.filter((f) => (f.angle_brana_sana || '').trim().length > 0);
    if (state.search) {
      const q = state.search;
      list = list.filter((f) =>
        (f.titre || '').toLowerCase().includes(q) ||
        (f.auteurs || '').toLowerCase().includes(q) ||
        (f.resultat_principal || '').toLowerCase().includes(q) ||
        (f.mecanisme_evalue || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function renderChips() {
    const runFiches = currentRunFiches();
    const counts = {};
    runFiches.forEach((f) => { counts[f.thematique_id] = (counts[f.thematique_id] || 0) + 1; });
    themeChipsEl.innerHTML = '';
    Object.keys(themeMeta).forEach((id) => {
      const n = counts[id] || 0;
      if (n === 0 && !state.themes.has(id)) return;
      const chip = document.createElement('div');
      chip.className = 'chip' + (state.themes.has(id) ? ' active' : '');
      chip.innerHTML = '<span class="dot" style="background:' + themeColor(id) + '"></span>' +
        themeMeta[id].label + ' <span class="count">' + n + '</span>';
      chip.addEventListener('click', () => {
        if (state.themes.has(id)) state.themes.delete(id); else state.themes.add(id);
        render();
      });
      themeChipsEl.appendChild(chip);
    });
  }

  function fmtDate(d) {
    return d || '—';
  }

  function renderList() {
    const visible = currentVisible();
    countLineEl.textContent = visible.length + ' fiche' + (visible.length > 1 ? 's' : '') +
      (state.themes.size || state.type || state.onlyAngle || state.search ? ' (filtrées)' : '');
    listEl.innerHTML = '';
    if (!visible.length) {
      listEl.innerHTML = '<div class="empty">Aucune fiche ne correspond à ces filtres.</div>';
      return;
    }
    const byTheme = {};
    visible.forEach((f) => {
      (byTheme[f.thematique_id] = byTheme[f.thematique_id] || []).push(f);
    });
    Object.keys(byTheme)
      .sort((a, b) => (themeMeta[a]?.label || '').localeCompare(themeMeta[b]?.label || ''))
      .forEach((id) => {
        const section = document.createElement('div');
        section.className = 'section-title';
        section.textContent = (themeMeta[id]?.label || id) + ' — ' + byTheme[id].length;
        listEl.appendChild(section);
        // Les fiches avec un angle Braña Sana concret remontent en tête, triées par
        // pertinence décroissante — pour repérer vite ce qui compte parmi 60+ articles.
        byTheme[id]
          .slice()
          .sort((a, b) => (b.pertinence_brana_sana || 0) - (a.pertinence_brana_sana || 0))
          .forEach((f) => listEl.appendChild(renderCard(f, id)));
      });
  }

  function renderCard(f, themeId) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--card-color', themeColor(themeId));
    const open = expanded.has(f._key);

    const head = document.createElement('div');
    head.className = 'card-head';
    const pertinence = f.angle_brana_sana ? (f.pertinence_brana_sana || 0) : null;
    head.innerHTML =
      '<p class="card-title">' + escapeHtml(f.titre) + '</p>' +
      (pertinence ? '<span class="badge badge-pertinence">pertinence ' + pertinence + '/5</span>' : '') +
      '<span class="badge">' + escapeHtml(f.type_etude || '?') + '</span>';
    card.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'meta-line';
    meta.textContent = [f.auteurs, f.date, f.ajoute_le ? 'ajouté le ' + f.ajoute_le : null]
      .filter(Boolean).join(' · ');
    card.appendChild(meta);

    if (!open) {
      const snippet = document.createElement('div');
      snippet.className = 'snippet';
      snippet.textContent = f.resultat_principal || '';
      card.appendChild(snippet);
    } else {
      const details = document.createElement('dl');
      details.className = 'details open';
      const rows = [
        ['Mécanisme évalué', f.mecanisme_evalue],
        ['Résultat principal', f.resultat_principal],
        ['Niveau de preuve et limites', f.niveau_de_preuve_et_limites],
        ['Angle Braña Sana', f.angle_brana_sana || '(aucun angle retenu)'],
      ];
      rows.forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value || '—';
        details.appendChild(dt);
        details.appendChild(dd);
      });
      if (f.lien) {
        const dt = document.createElement('dt');
        dt.textContent = 'Source';
        const dd = document.createElement('dd');
        const a = document.createElement('a');
        a.href = f.lien;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = f.lien;
        dd.appendChild(a);
        details.appendChild(dt);
        details.appendChild(dd);
      }
      card.appendChild(details);
    }

    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      if (expanded.has(f._key)) expanded.delete(f._key); else expanded.add(f._key);
      render();
    });
    return card;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function render() {
    renderChips();
    renderList();
  }

  render();
})();
</script>
</body>
</html>
`;
}

export async function writeDashboard(store) {
  const html = buildHtml(store.fiches);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, html, 'utf-8');
  return OUTPUT_PATH;
}

async function main() {
  const store = await loadStore();
  const outputPath = await writeDashboard(store);
  console.log(`[dashboard] ${store.fiches.length} fiche(s) exportée(s) vers ${outputPath}`);
}

// Ce module est aussi importé par src/index.js (régénération après chaque run) —
// n'exécuter le CLI que si le fichier est lancé directement (`npm run dashboard`).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[dashboard] Erreur :', err);
    process.exitCode = 1;
  });
}
