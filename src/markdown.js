function ficheToMarkdown(fiche) {
  const lienLigne = fiche.doi
    ? `[DOI: ${fiche.doi}](https://doi.org/${fiche.doi})`
    : fiche.lien
      ? `[Lien source](${fiche.lien})`
      : 'non disponible';

  const lignes = [
    `## ${fiche.titre}`,
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
 * Génère le Markdown d'un run de veille (uniquement les fiches nouvellement ajoutées).
 */
export function buildRunMarkdown(fiches, { runDate, query }) {
  const entete = [
    `# Veille shinrin-yoku — ${runDate}`,
    '',
    `Requête : \`${query}\``,
    `${fiches.length} nouvelle(s) étude(s) détectée(s).`,
    '',
    '---',
  ];

  const corps = fiches.map(ficheToMarkdown).join('\n\n---\n\n');

  return [...entete, '', corps].join('\n');
}

/**
 * Génère le Markdown de toute la base de connaissances (export complet, consultation manuelle).
 */
export function buildFullExportMarkdown(fiches) {
  const entete = [
    '# Base de connaissances — Veille shinrin-yoku',
    '',
    `${fiches.length} étude(s) au total.`,
    '',
    '---',
  ];

  const triees = [...fiches].sort((a, b) => (b.ajoute_le || '').localeCompare(a.ajoute_le || ''));
  const corps = triees.map(ficheToMarkdown).join('\n\n---\n\n');

  return [...entete, '', corps].join('\n');
}
