import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { appelerOutil, validerSchema } from './appel-outil.js';
import { TYPES_ETUDE, contrainteType, resoudreType } from './types-etude.js';

export const MODEL = 'claude-sonnet-5';
export const ECHEC_EXTRACTION = 'extraction échouée';
const MAX_TOKENS_FICHE = 2048;

export const FICHE_TOOL = {
  name: 'enregistrer_fiche',
  description:
    "Enregistre la fiche structurée d'une étude scientifique liée à l'un des piliers de veille de Braña Sana.",
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
        description: "Angle d'application concret pour Braña Sana (sentier, jardin médicinal, atelier manuel, programme de repos) UNIQUEMENT si un lien pertinent et honnête existe. Toujours fournir le champ ; chaîne vide si aucun lien pertinent ne se justifie — ne jamais forcer un rapprochement.",
      },
      pertinence_brana_sana: {
        type: 'integer',
        description: "Score de pertinence pratique pour Braña Sana, de 0 à 5. Doit valoir 0 si angle_brana_sana est vide. Sinon, reflète la force combinée de la preuve et le caractère concret/actionnable de l'angle (5 = preuve solide et application directe à un programme ou un espace existant ; 1-2 = lien plausible mais preuve faible ou angle vague). Ne jamais gonfler ce score pour rendre un article artificiellement intéressant.",
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
      'pertinence_brana_sana',
    ],
  },
};

const SYSTEM_PROMPT = `Tu es un assistant de veille scientifique rigoureux pour Braña Sana, un centre bien-être en Asturies (La Borbolla), dont les piliers couvrent le bain de forêt, le repos/sommeil, le retour au travail manuel, la mindfulness, la nutrition/longévité et la santé préventive. Ta seule tâche est d'extraire, à partir du titre et du résumé (abstract) d'une publication fournis par l'utilisateur, une fiche structurée factuelle.

Règles impératives :
- Ne jamais surinterpréter un résultat. Distingue toujours une association statistique d'une preuve d'effet causal.
- Si le résumé mentionne une taille d'échantillon réduite, une absence de groupe contrôle, un biais ou une hétérogénéité méthodologique, le signaler dans "niveau_de_preuve_et_limites".
- Si le résumé ne mentionne aucune limite, ne pas en inventer — indique "non précisé dans le résumé".
- Le champ "angle_brana_sana" doit rester vide si aucun lien concret et honnête ne se justifie. Ne force jamais un rapprochement marketing.
- Le champ "pertinence_brana_sana" (0 à 5) doit rester honnête et cohérent avec "angle_brana_sana" : 0 si ce dernier est vide, et proportionnel à la force de la preuve et au caractère concret de l'angle sinon. Ne jamais le gonfler.
- Utilise exclusivement les informations fournies (titre, résumé, métadonnées) — n'invente aucune donnée absente.
- Tous les champs de l'outil sont obligatoires, y compris "angle_brana_sana" (chaîne vide si aucun angle).
- Si la thématique ou un type d'étude imposé par PubMed est indiqué, respecte-le.
- N'écris un chiffre que s'il figure dans le titre ou le résumé.
- Réponds uniquement en appelant l'outil "enregistrer_fiche".`;

function consigneType(article) {
  const { impose, permis } = contrainteType(article.publicationTypes);
  if (impose) return `Type d'étude imposé par PubMed : ${impose}`;
  if (permis) return `Types d'étude compatibles avec PubMed : ${permis.join(', ')}`;
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
  const score = fiche.pertinence_brana_sana;
  const angle = fiche.angle_brana_sana.trim();
  if (score < 0 || score > 5) erreurs.push('pertinence_brana_sana doit être entre 0 et 5');
  if (angle && score === 0) erreurs.push('angle_brana_sana renseigné avec un score de 0');
  if (!angle && score !== 0) erreurs.push('score non nul sans angle_brana_sana');
  return erreurs;
}

/** Champs connus avec certitude du code, communs aux fiches réussies et échouées. */
function champsDuCode(article) {
  return {
    doi: article.doi || null,
    lien: article.url || null,
    source: article.source,
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
    const { doi_ou_lien, type_etude: typeModele, ...rest } = reponse;
    const { type, origine } = resoudreType(article.publicationTypes, typeModele);
    const codes = champsDuCode(article);
    // Titre et date viennent de PubMed quand ils existent : le modèle ne les réécrit pas.
    const duCode = {
      ...(article.title ? { titre: article.title } : {}),
      ...(article.date ? { date: article.date } : {}),
    };
    const fiche = { ...rest, ...duCode, type_etude: type, ...codes, lien: codes.lien || doi_ou_lien || null };
    const origines = Object.fromEntries(
      Object.keys(fiche).map((cle) => [cle, cle in codes || cle in duCode ? 'code' : 'modèle'])
    );
    origines.type_etude = origine;
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
