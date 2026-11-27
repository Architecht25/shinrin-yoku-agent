/**
 * Contrôle du journal contre les fiches : toute affirmation absente des fiches est supprimée.
 * Le journal est découpé en phrases numérotées ; le modèle désigne les numéros à retirer
 * et le code fait la suppression, sans jamais reprendre de texte réécrit.
 */
import { MODEL } from './extract.js';
import { appelerOutil, validerSchema } from './appel-outil.js';
import { valeursSource, chiffresAbsents, decouperPhrases } from './chiffres.js';

export const CONTROLE_TOOL = {
  name: 'signaler_affirmations',
  description: 'Liste les phrases du journal qui affirment quelque chose d’absent des fiches.',
  input_schema: {
    type: 'object',
    properties: {
      non_soutenues: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, raison: { type: 'string' } },
          required: ['id', 'raison'],
        },
      },
    },
    required: ['non_soutenues'],
  },
};

const SYSTEM_PROMPT = `Tu contrôles un journal de veille contre les fiches dont il est tiré. Pour chaque phrase numérotée, vérifie que tout ce qu'elle affirme figure dans la fiche indiquée (ou, sans fiche indiquée, dans l'ensemble des fiches). Signale une phrase si elle ajoute un fait, un chiffre, une population, une conclusion ou une application absents des fiches, si elle transforme une association en effet causal, ou si elle est plus affirmative que la fiche. Sont aussi à signaler : toute tendance ou état général de la recherche qu'aucune fiche n'énonce (« intérêt croissant », « de plus en plus d'études », « la science confirme ») et tout jugement ajouté par le rédacteur (« l'intuition reste raisonnable », « bénéfices plausibles »). Sois exigeant, y compris pour le titre de une et le chapeau. Une reformulation simple et fidèle, ou l'explication d'un terme technique, est acceptable. Pour les phrases « pour La Borbolla », une suggestion prudente qui découle de l'angle de la fiche est acceptable ; sans angle dans la fiche, signale-la. Réponds uniquement en appelant l'outil "signaler_affirmations" (liste vide si tout est soutenu).`;

const CHAMPS_UNE = ['titre_journal', 'texte', 'pour_la_borbolla'];

export function segmenter(journal) {
  const segments = [];
  const ajouter = (id, texte, ficheId) =>
    decouperPhrases(texte).forEach((phrase, i) => segments.push({ id: `${id}.${i}`, champ: id, fiche_id: ficheId, phrase }));
  ajouter('titre_une', journal.titre_une, null);
  ajouter('chapeau', journal.chapeau, null);
  journal.a_la_une.forEach((a, n) => CHAMPS_UNE.forEach((c) => ajouter(`une.${n}.${c}`, a[c], a.fiche_id)));
  journal.en_bref.forEach((b, n) => ajouter(`bref.${n}`, b.phrase, b.fiche_id));
  return segments;
}

/** Reconstruit le journal sans les phrases rejetées. */
export function filtrerJournal(journal, segments, rejetes, fiches) {
  const texte = (champ) =>
    segments.filter((s) => s.champ === champ && !rejetes.has(s.id)).map((s) => s.phrase).join(' ');
  const intact = (champ, original) =>
    segments.some((s) => s.champ === champ && rejetes.has(s.id)) ? texte(champ) : original;

  return {
    titre_une: intact('titre_une', journal.titre_une) || 'Veille La Borbolla : les études de la semaine',
    chapeau: intact('chapeau', journal.chapeau) || `${fiches.length} étude(s) retenue(s) cette semaine.`,
    a_la_une: journal.a_la_une
      .map((a, n) => ({
        fiche_id: a.fiche_id,
        titre_journal: intact(`une.${n}.titre_journal`, a.titre_journal) || fiches[a.fiche_id].titre,
        // Sans sa première phrase, un article perd son sujet : on reprend alors le résultat
        // de la fiche vérifiée plutôt que de publier une suite sans début.
        texte: rejetes.has(`une.${n}.texte.0`)
          ? fiches[a.fiche_id].resultat_principal
          : intact(`une.${n}.texte`, a.texte),
        pour_la_borbolla: intact(`une.${n}.pour_la_borbolla`, a.pour_la_borbolla),
      }))
      .filter((a) => a.texte),
    en_bref: journal.en_bref
      .map((b, n) => ({
        fiche_id: b.fiche_id,
        // Même règle qu'à la une : sans son début, la phrase n'est plus lisible.
        phrase: rejetes.has(`bref.${n}.0`)
          ? decouperPhrases(fiches[b.fiche_id].resultat_principal)[0]
          : intact(`bref.${n}`, b.phrase),
      }))
      .filter((b) => b.phrase),
  };
}

const valide = (id, fiches) => Number.isInteger(id) && id >= 0 && id < fiches.length;

/**
 * Applique les règles de sélection puis les deux contrôles (code : chiffres ; modèle :
 * affirmations). Lève si le contrôle par le modèle est impossible : l'appelant retombe
 * alors sur le rapport détaillé plutôt que de diffuser un journal non contrôlé.
 */
export async function verifierJournal(client, journal, fiches, descriptions) {
  const vus = new Set();
  const unique = (x) => valide(x.fiche_id, fiches) && !vus.has(x.fiche_id) && Boolean(vus.add(x.fiche_id));
  const candidat = {
    ...journal,
    // Seules les fiches confirmées peuvent aller à la une.
    a_la_une: journal.a_la_une.filter((a) => fiches[a.fiche_id]?.verification?.journal !== 'bref').filter(unique),
    en_bref: journal.en_bref.filter(unique),
  };
  const segments = segmenter(candidat);

  const parFiche = descriptions.map((d) => valeursSource(JSON.stringify({ ...d, id: undefined })));
  // Le chapeau peut aussi compter les études du journal.
  const comptes = [fiches.length, candidat.a_la_une.length, candidat.a_la_une.length + candidat.en_bref.length];
  const globales = new Set([...parFiche.flatMap((v) => [...v]), ...comptes.map(String)]);
  const rejetes = new Map();
  for (const s of segments) {
    const absents = chiffresAbsents(s.phrase, s.fiche_id === null ? globales : parFiche[s.fiche_id]);
    if (absents.length) rejetes.set(s.id, `chiffre absent des fiches : ${absents.join(', ')}`);
  }

  const reponse = await appelerOutil(client, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    tool: CONTROLE_TOOL,
    contenu: [
      `Fiches (JSON) :\n${JSON.stringify(descriptions)}`,
      '',
      'Phrases du journal :',
      ...segments.map((s) => `[${s.id}]${s.fiche_id === null ? '' : ` (fiche ${s.fiche_id})`} ${s.phrase}`),
    ].join('\n'),
    maxTokens: 4096,
    valider: (r) => {
      const erreurs = validerSchema(r, CONTROLE_TOOL.input_schema);
      if (erreurs.length) return erreurs;
      const ids = new Set(segments.map((s) => s.id));
      return r.non_soutenues.every((x) => ids.has(String(x?.id).replace(/^\[|\]$/g, '')))
        ? []
        : ['identifiant de phrase inconnu'];
    },
  });
  for (const { id, raison } of reponse.non_soutenues) rejetes.set(String(id).replace(/^\[|\]$/g, ''), raison);

  return {
    journal: filtrerJournal(candidat, segments, rejetes, fiches),
    suppressions: segments.filter((s) => rejetes.has(s.id)).map((s) => ({ phrase: s.phrase, raison: rejetes.get(s.id) })),
  };
}
