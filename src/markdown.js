import { THEMES } from './themes.js';

function ficheToMarkdown(fiche) {
  const lienLigne = fiche.doi
    ? `[DOI: ${fiche.doi}](https://doi.org/${fiche.doi})`
    : fiche.lien
      ? `[Lien source](${fiche.lien})`
      : 'non disponible';

  const titre =
    fiche.origine_recherche === 'reference'
      ? `### [Référence — ${fiche.chercheur_reference || '?'}] ${fiche.titre}`
      : `### ${fiche.titre}`;

  const lignes = [
    titre,
    '',
    `- **Auteurs** : ${fiche.auteurs || 'non précisé'}`,
    `- **Date** : ${fiche.date || 'non précisée'}`,
    `- **Source** : ${fiche.source || 'non précisée'}${fiche.pmid ? ` (PMID ${fiche.pmid})` : ''}`,
    `- **DOI / lien** : ${lienLigne}`,
    `- **Type d'étude** : ${fiche.type_etude || 'non précisé'}`,
    `- **Mécanisme évalué** : ${fiche.mecanisme_evalue || 'non précisé'}`,
    '',
    `**Résultat principal** : ${fiche.resultat_principal || 'non précisé'}`,
    '',
    `**Niveau de preuve / limites** : ${fiche.niveau_de_preuve_et_limites || 'non précisé'}`,
  ];

  if (fiche.angle_brana_sana) {
    lignes.push('', `**Angle Braña Sana** : ${fiche.angle_brana_sana}`);
  }

  return lignes.join('\n');
}

/**
 * Regroupe les fiches par thématique, dans l'ordre de src/themes.js.
 * Les fiches antérieures à l'introduction du champ thématique (toutes issues du
 * bain de forêt, seule thématique existant alors) sont rattachées à "shinrin-yoku".
 */
function groupByTheme(fiches) {
  const groupes = new Map();
  for (const fiche of fiches) {
    const themeId = fiche.thematique_id || 'shinrin-yoku';
    if (!groupes.has(themeId)) groupes.set(themeId, []);
    groupes.get(themeId).push(fiche);
  }
  return groupes;
}

/**
 * Sélectionne, par thématique, les fiches les plus pertinentes pour Braña Sana :
 * uniquement celles avec un angle_brana_sana renseigné (jamais forcé en amont),
 * triées par pertinence_brana_sana décroissante, limitées à `limit` par thématique.
 */
function selectionPertinenceMarkdown(fiches, { limit = 5 } = {}) {
  const avecAngle = fiches.filter((f) => (f.angle_brana_sana || '').trim().length > 0);
  const groupes = groupByTheme(avecAngle);
  const themesAvecSelection = THEMES.filter((theme) => groupes.has(theme.id));
  if (themesAvecSelection.length === 0) return '';

  const sections = themesAvecSelection.map((theme) => {
    const top = [...groupes.get(theme.id)]
      .sort((a, b) => (b.pertinence_brana_sana || 0) - (a.pertinence_brana_sana || 0))
      .slice(0, limit);
    const items = top.map((f) => `- **${f.titre}** — ${f.angle_brana_sana}`).join('\n');
    return [`### ${theme.label}`, '', items].join('\n');
  });

  return ['## Sélection — les plus pertinentes pour Braña Sana', '', ...sections].join('\n\n');
}

function sectionsMarkdown(fiches) {
  const groupes = groupByTheme(fiches);
  return THEMES.filter((theme) => groupes.has(theme.id))
    .map((theme) => {
      const fichesTheme = groupes.get(theme.id);
      return [`## ${theme.label}`, '', fichesTheme.map(ficheToMarkdown).join('\n\n---\n\n')].join('\n');
    })
    .join('\n\n---\n\n');
}

/**
 * Génère le Markdown d'un run de veille (uniquement les fiches nouvellement ajoutées),
 * organisé par section thématique.
 */
export function buildRunMarkdown(fiches, { runDate, dashboardUrl }) {
  const entete = [
    `# Veille La Borbolla / Braña Sana — ${runDate}`,
    '',
    `${fiches.length} nouvelle(s) étude(s) détectée(s), toutes thématiques confondues.`,
    ...(dashboardUrl ? ['', `[Tableau de bord de tri](${dashboardUrl})`] : []),
    '',
    '---',
  ];

  const selection = selectionPertinenceMarkdown(fiches);

  return [...entete, '', selection, selection ? '\n---\n' : '', sectionsMarkdown(fiches)].join('\n');
}

/**
 * Génère le Markdown de toute la base de connaissances (export complet, consultation
 * manuelle), organisé par section thématique ; les fiches sont triées par date d'ajout
 * (les plus récentes en premier) au sein de chaque section.
 */
export function buildFullExportMarkdown(fiches) {
  const entete = [
    '# Base de connaissances — Veille La Borbolla / Braña Sana',
    '',
    `${fiches.length} étude(s) au total.`,
    '',
    '---',
  ];

  const triees = [...fiches].sort((a, b) => (b.ajoute_le || '').localeCompare(a.ajoute_le || ''));

  return [...entete, '', sectionsMarkdown(triees)].join('\n');
}
