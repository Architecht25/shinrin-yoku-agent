import { MODEL } from './extract.js';

const JOURNAL_TOOL = {
  name: 'rediger_journal',
  description: "Rédige le journal hebdomadaire de veille à partir des fiches fournies, en citant les fiches par leur id.",
  input_schema: {
    type: 'object',
    properties: {
      titre_une: { type: 'string', description: 'Titre de une, sobre et factuel (pas de sensationnalisme).' },
      chapeau: { type: 'string', description: "2-3 phrases : l'essentiel de la semaine pour La Borbolla." },
      a_la_une: {
        type: 'array',
        description: "3 à 6 études les plus applicables à La Borbolla, de la plus à la moins applicable. Vide si rien n'est réellement applicable.",
        items: {
          type: 'object',
          properties: {
            fiche_id: { type: 'integer' },
            titre_journal: { type: 'string', description: "Titre d'article de journal, fidèle au résultat." },
            texte: { type: 'string', description: "3-4 phrases claires pour un non-spécialiste : ce qui a été fait, ce qui a été trouvé, avec la prudence due (association vs causalité, limites)." },
            pour_la_borbolla: { type: 'string', description: "Ce que cela permet concrètement à La Borbolla, 1-2 phrases. Doit découler de la fiche." },
          },
          required: ['fiche_id', 'titre_journal', 'texte', 'pour_la_borbolla'],
        },
      },
      en_bref: {
        type: 'array',
        description: "Jusqu'à 8 autres études intéressantes en une phrase chacune. Ignorer celles sans intérêt.",
        items: {
          type: 'object',
          properties: { fiche_id: { type: 'integer' }, phrase: { type: 'string' } },
          required: ['fiche_id', 'phrase'],
        },
      },
    },
    required: ['titre_une', 'chapeau', 'a_la_une', 'en_bref'],
  },
};

const SYSTEM_PROMPT = `Tu es le rédacteur en chef d'un court journal de veille scientifique pour La Borbolla / Braña Sana (centre bien-être en Asturies : sentiers et forêt, jardin, ateliers manuels, repos/sommeil, mindfulness, alimentation, prévention). Les lecteurs sont l'équipe du centre, pas des chercheurs.

Règles impératives :
- Sélectionne en priorité ce qui est directement applicable à La Borbolla (champ "pertinence_brana_sana", de 0 à 5, des fiches, à vérifier avec leur contenu).
- Style journalistique clair et bref, sans jargon, mais sans jamais surinterpréter : distingue association et effet causal, mentionne les limites importantes (petit échantillon, pas de groupe contrôle...).
- N'utilise que le contenu des fiches. Aucun chiffre, aucune conclusion ni application inventés. Si le lien avec La Borbolla n'est pas honnête, ne mets pas l'étude à la une.
- Pas de ton marketing. Ce texte sera relu avant tout usage éditorial.
- Réponds uniquement en appelant l'outil "rediger_journal".`;

function compactFiche(fiche, id) {
  return {
    id,
    thematique: fiche.thematique,
    pertinence_brana_sana: fiche.pertinence_brana_sana ?? null,
    titre: fiche.titre,
    type_etude: fiche.type_etude,
    resultat_principal: fiche.resultat_principal,
    limites: fiche.niveau_de_preuve_et_limites,
    angle_brana_sana: fiche.angle_brana_sana || '',
  };
}

/** Une seule requête Claude pour rédiger le journal à partir de toutes les fiches du run. */
export async function redigerJournal(client, fiches) {
  const payload = fiches.map((f, i) => compactFiche(f, i));
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    tools: [JOURNAL_TOOL],
    tool_choice: { type: 'tool', name: JOURNAL_TOOL.name },
    messages: [{ role: 'user', content: `Fiches de la semaine (JSON) :\n${JSON.stringify(payload)}` }],
  });
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error("Claude n'a pas produit de journal.");
  return toolUse.input;
}

function lien(fiche) {
  if (fiche.doi) return `[DOI](https://doi.org/${fiche.doi})`;
  if (fiche.lien) return `[source](${fiche.lien})`;
  return '';
}

/**
 * Met en forme le journal en Markdown. Les liens et métadonnées viennent des fiches
 * (par fiche_id), jamais du texte généré ; les ids invalides ou dupliqués sont ignorés.
 */
export function journalToMarkdown(journal, fiches, { runDate, dashboardUrl }) {
  const vus = new Set();
  const resolve = (id) => {
    if (!Number.isInteger(id) || id < 0 || id >= fiches.length || vus.has(id)) return null;
    vus.add(id);
    return fiches[id];
  };

  const une = (journal.a_la_une || [])
    .map((a) => ({ a, f: resolve(a.fiche_id) }))
    .filter((x) => x.f)
    .map(({ a, f }) =>
      [
        `### ${a.titre_journal}`,
        '',
        a.texte,
        '',
        `**Pour La Borbolla** : ${a.pour_la_borbolla}`,
        '',
        `*${f.type_etude} — ${f.thematique} — ${lien(f)}*`.replace(/ — \*$/, '*'),
      ].join('\n')
    );

  const bref = (journal.en_bref || [])
    .map((b) => ({ b, f: resolve(b.fiche_id) }))
    .filter((x) => x.f)
    .map(({ b, f }) => `- ${b.phrase} (${f.thematique}${lien(f) ? ` — ${lien(f)}` : ''})`);

  const parts = [`# ${journal.titre_une}`, '', `*Veille La Borbolla — ${runDate}*`, '', journal.chapeau];
  if (une.length) parts.push('', '## À la une', '', une.join('\n\n---\n\n'));
  if (bref.length) parts.push('', '## En bref', '', bref.join('\n'));
  parts.push('', '---', '', `${fiches.length} étude(s) analysée(s) cette semaine ; toutes les fiches détaillées sont en pièce jointe.${dashboardUrl ? ` Tableau de bord : ${dashboardUrl}` : ''}`);
  return parts.join('\n');
}
