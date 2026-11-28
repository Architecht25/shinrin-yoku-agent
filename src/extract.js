import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { appelerOutil, validerSchema } from './appel-outil.js';
import { TYPES_ETUDE, contrainteType, resoudreType } from './types-etude.js';
import { LISTE_NIVEAUX, NIVEAU_NON_EVALUE, niveauParPubmed, resoudreNiveau, estPrepublication, MENTION_PREPUBLICATION } from './niveaux.js';

export { NIVEAU_NON_EVALUE };

export const MODEL = 'claude-sonnet-5';
export const ECHEC_EXTRACTION = 'extraction échouée';
const MAX_TOKENS_FICHE = 2048;

export const FICHE_TOOL = {
  name: 'enregistrer_fiche',
  description:
    "Enregistre la fiche structurée d'une étude scientifique liée à l'une des thématiques de veille de Braña Sana.",
  input_schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' },
      auteurs: { type: 'string', description: 'Auteurs principaux, séparés par des virgules (ex. "Li Q, Kobayashi M et al.")' },
      date: { type: 'string', description: 'Date ou année de publication telle que fournie' },
      doi_ou_lien: { type: 'string', description: 'DOI si disponible, sinon le lien source fourni' },
      type_etude: {
        type: 'string',
        enum: TYPES_ETUDE,
        description: "Type d'étude. Une revue n'est « systématique » que si le résumé décrit une méthode systématique de recherche des études. En cas de doute : « indéterminé ».",
      },
      mecanisme_evalue: {
        type: 'string',
        description: 'Mécanisme physiologique ou psychologique évalué (ex. cortisol, cellules NK, HRV, système nerveux autonome, sommeil, humeur)',
      },
      resultat_principal: {
        type: 'string',
        description: "Résultat principal en une phrase, fidèle et non exagéré. Distinguer clairement association et preuve d'effet.",
      },
      niveau_de_preuve_et_limites: {
        type: 'string',
        description: "Niveau de preuve et limites mentionnées par les auteurs : taille d'échantillon, hétérogénéité méthodologique, absence de groupe contrôle, etc. Si l'étude ne précise rien, l'indiquer explicitement plutôt que de l'inventer.",
      },
      angle_brana_sana: {
        type: 'string',
        description: "Angle d'application concret pour Braña Sana (sentier, jardin médicinal, atelier manuel, programme de repos) UNIQUEMENT si un lien pertinent et honnête existe. Toujours fournir le champ ; chaîne vide (sans expliquer pourquoi) si aucun lien pertinent ne se justifie — ne jamais forcer un rapprochement.",
      },
      niveau_propose: {
        type: 'string',
        enum: LISTE_NIVEAUX,
        description: "Niveau de preuve proposé d'après le seul résumé. « indéterminé » si le résumé ne permet pas de trancher.",
      },
      extrait_justification: {
        type: 'string',
        description: "UNE phrase ou portion de phrase recopiée mot pour mot du résumé (en anglais s'il l'est) qui justifie le niveau proposé. Chaîne vide si « indéterminé ».",
      },
      justification_niveau: {
        type: 'string',
        description: 'La justification du niveau en une phrase en français, appuyée sur cet extrait.',
      },
      effectif: {
        type: 'integer',
        description: "Nombre de participants de l'étude tel qu'écrit dans le résumé ; 0 s'il n'y est pas ou s'il s'agit d'une synthèse.",
      },
      pertinence_centre: {
        type: 'integer',
        description: "Utilité pratique du SUJET pour les activités de Braña Sana, de 0 à 5, SANS AUCUN lien avec la force de la preuve (jugée à part) : 5 = porte directement sur un programme ou un espace existant et un public comparable ; 3 = application concrète moyennant une adaptation ; 1 = lien lointain ; 0 = aucun lien (angle_brana_sana vide).",
      },
    },
    required: [
      'titre',
      'auteurs',
      'date',
      'doi_ou_lien',
      'type_etude',
      'mecanisme_evalue',
      'resultat_principal',
      'niveau_de_preuve_et_limites',
      'angle_brana_sana',
      'niveau_propose',
      'extrait_justification',
      'justification_niveau',
      'effectif',
      'pertinence_centre',
    ],
  },
};

const SYSTEM_PROMPT = `Tu es un assistant de veille scientifique rigoureux pour Braña Sana, un centre bien-être en Asturies (La Borbolla), dont la veille porte sur le repos, les soins naturels et le retour au manuel : bain de forêt, repos et sommeil, sieste et marche, travail des mains (artisanat, potager). Ta seule tâche est d'extraire, à partir du titre et du résumé (abstract) d'une publication fournis par l'utilisateur, une fiche structurée factuelle.

Règles impératives :
- Ne jamais surinterpréter un résultat. Distingue toujours une association statistique d'une preuve d'effet causal.
- Si le résumé mentionne une taille d'échantillon réduite, une absence de groupe contrôle, un biais ou une hétérogénéité méthodologique, le signaler dans "niveau_de_preuve_et_limites".
- Si le résumé ne mentionne aucune limite, ne pas en inventer — indique "non précisé dans le résumé".
- Le champ "angle_brana_sana" doit rester vide si aucun lien concret et honnête ne se justifie. Ne force jamais un rapprochement marketing.
- "pertinence_centre" (0 à 5) mesure seulement l'utilité du sujet pour le centre : une étude faible sur un sujet central peut valoir 5, une étude solide sur un sujet lointain 1. La force de la preuve se dit dans le niveau de preuve, jamais dans ce score. 0 si "angle_brana_sana" est vide.
- Pour une étude observationnelle, aucun verbe causal (réduit, améliore, entraîne, protège, favorise, augmente...) : écris « est associé à ». Ni « facteur protecteur », « effet protecteur » ou « levier de protection », y compris dans "angle_brana_sana".
- Utilise exclusivement les informations fournies (titre, résumé, métadonnées) — n'invente aucune donnée absente.
- Tous les champs de l'outil sont obligatoires, y compris "angle_brana_sana" (chaîne vide si aucun angle).
- Deux cas seulement : soit "angle_brana_sana" décrit une application concrète et le score va de 1 à 5 ; soit "angle_brana_sana" vaut exactement "" et le score 0. N'écris jamais dans ce champ qu'il n'y a pas de lien, ni pourquoi.
- Si la thématique ou un type d'étude imposé par PubMed est indiqué, respecte-le.
- N'écris un chiffre que s'il figure dans le titre ou le résumé.
- Réponds uniquement en appelant l'outil "enregistrer_fiche".`;

function consigneType(article) {
  const { impose, permis } = contrainteType(article.publicationTypes);
  if (impose) return `Type d'étude imposé par PubMed : ${impose}`;
  if (permis) return `Types d'étude compatibles avec PubMed : ${permis.join(', ')}`;
  return '';
}

function consigneNiveau(article) {
  const { impose, permis } = niveauParPubmed(article.publicationTypes);
  if (impose) return `Niveau de preuve imposé par PubMed : ${impose}`;
  if (permis) return `Niveaux compatibles avec PubMed : ${permis.join(', ')}`;
  return '';
}

function buildUserMessage(article) {
  return [
    `Thématique de veille : ${article.thematiqueLabel}`,
    `Titre : ${article.title}`,
    article.authors?.length ? `Auteurs listés : ${article.authors.join(', ')}` : '',
    article.date ? `Date de publication : ${article.date}` : '',
    article.journal ? `Revue : ${article.journal}` : '',
    article.doi ? `DOI : ${article.doi}` : '',
    article.url ? `Lien source : ${article.url}` : '',
    article.publicationTypes?.length ? `Types de publication déclarés : ${article.publicationTypes.join(', ')}` : '',
    consigneType(article),
    consigneNiveau(article),
    estPrepublication(article.publicationTypes) ? `${MENTION_PREPUBLICATION}.` : '',
    '',
    'Résumé (abstract) :',
    article.abstract || '(aucun résumé disponible — base-toi uniquement sur le titre et indique-le dans les limites)',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Validation après réception : schéma strict, limites non vides, score cohérent avec l'angle. */
export function validerFiche(fiche) {
  const erreurs = validerSchema(fiche, FICHE_TOOL.input_schema);
  if (erreurs.length) return erreurs;
  for (const cle of ['titre', 'type_etude', 'mecanisme_evalue', 'resultat_principal', 'niveau_de_preuve_et_limites']) {
    if (!fiche[cle].trim()) erreurs.push(`champ vide : ${cle}`);
  }
  if (fiche.effectif < 0) erreurs.push('effectif négatif');
  const score = fiche.pertinence_centre;
  const angle = fiche.angle_brana_sana.trim();
  if (score < 0 || score > 5) erreurs.push('pertinence_centre doit être entre 0 et 5');
  if (angle && score === 0) erreurs.push('angle_brana_sana renseigné avec un score de 0 : avec un score de 0, renvoie angle_brana_sana = "" (aucun texte, aucune explication) ; sinon donne un score de 1 à 5');
  if (!angle && score !== 0) erreurs.push('score non nul sans angle_brana_sana');
  return erreurs;
}

/** Champs connus avec certitude du code, communs aux fiches réussies et échouées. */
function champsDuCode(article) {
  return {
    doi: article.doi || null,
    lien: article.url || null,
    source: article.source,
    niveau_de_preuve: NIVEAU_NON_EVALUE,
    ...(estPrepublication(article.publicationTypes) ? { prepublication: true } : {}),
    pmid: article.pmid || null,
    // Thématique attachée depuis la requête d'origine (src/themes.js) plutôt que devinée
    // par Claude : on la connaît déjà avec certitude, pas besoin de la faire deviner.
    thematique_id: article.thematiqueId,
    thematique: article.thematiqueLabel,
    origine_recherche: article.origineRecherche || 'mot-clé',
    chercheur_reference: article.chercheurReference || null,
    ajoute_le: article._runDate,
  };
}

/**
 * Transforme un article brut (PubMed, etc.) en fiche structurée via Claude.
 * Ne lève pas : après une réponse invalide retentée une fois (ou une erreur d'API), renvoie
 * une fiche marquée « extraction échouée », sans aucun contenu produit par le modèle.
 */
export async function extractFiche(client, article) {
  try {
    const reponse = await appelerOutil(client, {
      model: MODEL,
      system: SYSTEM_PROMPT,
      tool: FICHE_TOOL,
      contenu: buildUserMessage(article),
      maxTokens: MAX_TOKENS_FICHE,
      valider: validerFiche,
    });
    const {
      doi_ou_lien, type_etude: typeModele,
      niveau_propose, extrait_justification, justification_niveau, effectif,
      ...rest
    } = reponse;
    // L'extrait sert au contrôle puis disparaît : aucun texte de résumé n'est enregistré.
    const niveau = resoudreNiveau(article, { niveau_propose, extrait_justification, justification_niveau });
    const { type, origine } = resoudreType(article.publicationTypes, typeModele);
    const codes = champsDuCode(article);
    // Titre et date viennent de PubMed quand ils existent : le modèle ne les réécrit pas.
    const duCode = {
      ...(article.title ? { titre: article.title } : {}),
      ...(article.date ? { date: article.date } : {}),
    };
    const fiche = {
      ...rest, ...duCode, type_etude: type, ...codes, lien: codes.lien || doi_ou_lien || null,
      niveau_de_preuve: niveau.niveau,
      justification_niveau: niveau.justification,
      effectif: effectif || null,
    };
    const origines = Object.fromEntries(
      Object.keys(fiche).map((cle) => [cle, cle in codes || cle in duCode ? 'code' : 'modèle'])
    );
    origines.type_etude = origine;
    origines.niveau_de_preuve = niveau.origine;
    origines.justification_niveau = niveau.origine;
    origines.effectif = 'modèle';
    if (!codes.lien && doi_ou_lien) origines.lien = 'modèle';
    return { ...fiche, origines };
  } catch (err) {
    return {
      statut: ECHEC_EXTRACTION,
      titre: article.title,
      raison_echec: err.message.slice(0, 300),
      ...champsDuCode(article),
    };
  }
}

export function estExploitable(fiche) {
  return fiche.statut !== ECHEC_EXTRACTION;
}

export function createAnthropicClient() {
  return new Anthropic({ apiKey: config.anthropicApiKey });
}
