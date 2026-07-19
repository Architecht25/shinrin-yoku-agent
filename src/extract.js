import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

const MODEL = 'claude-sonnet-5';

const FICHE_TOOL = {
  name: 'enregistrer_fiche',
  description: "Enregistre la fiche structurée d'une étude scientifique sur le shinrin-yoku.",
  input_schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' },
      auteurs: { type: 'string', description: 'Auteurs principaux, séparés par des virgules (ex. "Li Q, Kobayashi M et al.")' },
      date: { type: 'string', description: 'Date ou année de publication telle que fournie' },
      doi_ou_lien: { type: 'string', description: 'DOI si disponible, sinon le lien source fourni' },
      type_etude: {
        type: 'string',
        enum: ['RCT', 'revue systématique', 'méta-analyse', 'étude observationnelle', 'cas clinique', 'essai en cours', 'autre'],
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
        description: "Angle d'application concret pour Braña Sana (sentier, jardin médicinal, programme de repos) UNIQUEMENT si un lien pertinent et honnête existe. Laisser vide (chaîne vide) si aucun lien pertinent ne se justifie — ne jamais forcer un rapprochement.",
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
    ],
  },
};

const SYSTEM_PROMPT = `Tu es un assistant de veille scientifique rigoureux pour Braña Sana, un centre bien-être en Asturies (La Borbolla). Ta seule tâche est d'extraire, à partir du titre et du résumé (abstract) d'une publication fournis par l'utilisateur, une fiche structurée factuelle.

Règles impératives :
- Ne jamais surinterpréter un résultat. Distingue toujours une association statistique d'une preuve d'effet causal.
- Si le résumé mentionne une taille d'échantillon réduite, une absence de groupe contrôle, un biais ou une hétérogénéité méthodologique, le signaler dans "niveau_de_preuve_et_limites".
- Si le résumé ne mentionne aucune limite, ne pas en inventer — indique "non précisé dans le résumé".
- Le champ "angle_brana_sana" doit rester vide si aucun lien concret et honnête ne se justifie. Ne force jamais un rapprochement marketing.
- Utilise exclusivement les informations fournies (titre, résumé, métadonnées) — n'invente aucune donnée absente.
- Réponds uniquement en appelant l'outil "enregistrer_fiche".`;

function buildUserMessage(article) {
  return [
    `Titre : ${article.title}`,
    article.authors?.length ? `Auteurs listés : ${article.authors.join(', ')}` : '',
    article.date ? `Date de publication : ${article.date}` : '',
    article.journal ? `Revue : ${article.journal}` : '',
    article.doi ? `DOI : ${article.doi}` : '',
    article.url ? `Lien source : ${article.url}` : '',
    article.publicationTypes?.length ? `Types de publication déclarés : ${article.publicationTypes.join(', ')}` : '',
    '',
    'Résumé (abstract) :',
    article.abstract || '(aucun résumé disponible — base-toi uniquement sur le titre et indique-le dans les limites)',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Transforme un article brut (PubMed, etc.) en fiche structurée via Claude.
 * Renvoie null si Claude ne parvient pas à produire une fiche exploitable pour cet article
 * (on ignore l'article plutôt que de stocker une fiche vide ou inventée).
 */
export async function extractFiche(client, article) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [FICHE_TOOL],
    tool_choice: { type: 'tool', name: FICHE_TOOL.name },
    messages: [{ role: 'user', content: buildUserMessage(article) }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) return null;

  const { doi_ou_lien, ...rest } = toolUse.input;

  return {
    ...rest,
    doi: article.doi || null,
    lien: article.url || doi_ou_lien || null,
    source: article.source,
    pmid: article.pmid || null,
    origine_recherche: article.origineRecherche || 'mot-clé',
    chercheur_reference: article.chercheurReference || null,
    ajoute_le: article._runDate,
  };
}

export function createAnthropicClient() {
  return new Anthropic({ apiKey: config.anthropicApiKey });
}
