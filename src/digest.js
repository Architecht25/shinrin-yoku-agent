import { MODEL } from './extract.js';
import { appelerOutil, validerSchema } from './appel-outil.js';
import { blocRetractations } from './markdown.js';

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

const SYSTEM_PROMPT = `Tu es le rédacteur en chef d'un court journal de veille scientifique pour La Borbolla / Braña Sana (centre bien-être en Asturies : sentiers et forêt, jardin, ateliers manuels, repos, sieste, marche et sommeil). Les lecteurs sont l'équipe du centre, pas des chercheurs.

Règles impératives :
- Sélectionne en priorité ce qui est directement applicable à La Borbolla (champ "pertinence_centre", de 0 à 5, à vérifier avec le contenu ; il ne dit rien de la force de la preuve, donnée par "niveau_de_preuve").
- Style journalistique clair et bref, sans jargon, mais sans jamais surinterpréter : distingue association et effet causal, mentionne les limites importantes (petit échantillon, pas de groupe contrôle...).
- Une fiche avec "eligible_a_la_une" à false ne va jamais à la une (au plus « En bref »).
- N'écris pas les étiquettes (type, niveau de preuve) : elles sont ajoutées automatiquement depuis les fiches.
- Aucun verbe causal pour une étude observationnelle.
- N'utilise que le contenu des fiches. Aucun chiffre, aucune conclusion ni application inventés. Si le lien avec La Borbolla n'est pas honnête, ne mets pas l'étude à la une.
- Pas de ton marketing. Ce texte sera relu avant tout usage éditorial.
- Réponds uniquement en appelant l'outil "rediger_journal".`;

function compactFiche(fiche, id) {
  return {
    id,
    thematique: fiche.thematique,
    pertinence_centre: fiche.pertinence_centre ?? null,
    niveau_de_preuve: fiche.niveau_de_preuve,
    titre: fiche.titre,
    type_etude: fiche.type_etude,
    resultat_principal: fiche.resultat_principal,
    limites: fiche.niveau_de_preuve_et_limites,
    angle_brana_sana: fiche.angle_brana_sana || '',
    eligible_a_la_une: fiche.verification?.journal !== 'bref',
  };
}

export function decrireFiches(fiches) {
  return fiches.map(compactFiche);
}

/** Une seule requête Claude pour rédiger le journal à partir de toutes les fiches du run. */
export async function redigerJournal(client, fiches) {
  const payload = decrireFiches(fiches);
  return appelerOutil(client, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    tool: JOURNAL_TOOL,
    contenu: `Fiches de la semaine (JSON) :\n${JSON.stringify(payload)}`,
    maxTokens: 6000,
    valider: validerJournal,
  });
}

export function validerJournal(journal) {
  const erreurs = validerSchema(journal, JOURNAL_TOOL.input_schema);
  if (erreurs.length) return erreurs;
  for (const [liste, schema] of [['a_la_une', JOURNAL_TOOL.input_schema.properties.a_la_une.items], ['en_bref', JOURNAL_TOOL.input_schema.properties.en_bref.items]]) {
    journal[liste].forEach((item, i) => {
      erreurs.push(...validerSchema(item, schema).map((e) => `${liste}[${i}] : ${e}`));
    });
  }
  return erreurs;
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
export function journalToMarkdown(journal, fiches, { runDate, dashboardUrl, total = fiches.length, retractees = [] }) {
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
        ...(a.pour_la_borbolla ? [`**Pour La Borbolla** : ${a.pour_la_borbolla}`, ''] : []),
        `*${f.type_etude} — ${f.thematique} — ${lien(f)}*`.replace(/ — \*$/, '*'),
      ].join('\n')
    );

  const bref = (journal.en_bref || [])
    .map((b) => ({ b, f: resolve(b.fiche_id) }))
    .filter((x) => x.f)
    .map(({ b, f }) => `- ${b.phrase} (${f.thematique}${lien(f) ? ` — ${lien(f)}` : ''})`);

  const parts = [`# ${journal.titre_une}`, '', `*Veille La Borbolla — ${runDate}*`, '', journal.chapeau];
  if (retractees.length) parts.push('', blocRetractations(retractees));
  if (une.length) parts.push('', '## À la une', '', une.join('\n\n---\n\n'));
  if (bref.length) parts.push('', '## En bref', '', bref.join('\n'));
  parts.push('', '---', '', `${total} étude(s) analysée(s) cette semaine ; toutes les fiches détaillées sont en pièce jointe.${dashboardUrl ? ` Tableau de bord : ${dashboardUrl}` : ''}`);
  return parts.join('\n');
}
