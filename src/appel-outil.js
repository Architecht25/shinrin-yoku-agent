/**
 * Appel Claude à outil forcé, avec contrôle de la réponse : troncature (stop_reason) et
 * validation après réception. Une réponse invalide ou tronquée est retentée une fois ;
 * après une troncature, la limite de tokens est doublée.
 */
export class ReponseInvalide extends Error {
  constructor(raisons) {
    super(`Réponse du modèle inexploitable : ${raisons.join(' ; ')}`);
    this.name = 'ReponseInvalide';
    this.raisons = raisons;
  }
}

const TENTATIVES = 2;

export async function appelerOutil(client, { model, system, tool, contenu, maxTokens, valider }) {
  let limite = maxTokens;
  let raisons = [];
  let precedentInvalide = false;

  for (let essai = 1; essai <= TENTATIVES; essai += 1) {
    const rappel = precedentInvalide
      ? `\n\nTa réponse précédente a été refusée : ${raisons.join(' ; ')}. Corrige ces points.`
      : '';
    const response = await client.messages.create({
      model,
      max_tokens: limite,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: contenu + rappel }],
    });

    if (response.stop_reason === 'max_tokens') {
      raisons = [`réponse tronquée à ${limite} tokens`];
      precedentInvalide = false;
      limite *= 2;
      continue;
    }

    const bloc = response.content.find((b) => b.type === 'tool_use' && (!b.name || b.name === tool.name));
    raisons = bloc ? valider(bloc.input) : ["aucun appel à l'outil attendu"];
    if (raisons.length === 0) return bloc.input;
    precedentInvalide = true;
  }

  throw new ReponseInvalide(raisons);
}

/** Validation stricte d'un objet contre un input_schema plat (types simples et enum). */
export function validerSchema(valeur, schema) {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return ['la réponse doit être un objet'];
  const erreurs = [];
  for (const cle of schema.required || []) {
    if (!(cle in valeur)) erreurs.push(`champ obligatoire absent : ${cle}`);
  }
  for (const [cle, v] of Object.entries(valeur)) {
    const regle = schema.properties[cle];
    if (!regle) {
      erreurs.push(`champ inconnu : ${cle}`);
      continue;
    }
    const typeOk =
      regle.type === 'integer' ? Number.isInteger(v)
      : regle.type === 'array' ? Array.isArray(v)
      : regle.type === 'object' ? Boolean(v) && typeof v === 'object' && !Array.isArray(v)
      : typeof v === regle.type;
    if (!typeOk) erreurs.push(`type incorrect pour ${cle} (attendu : ${regle.type})`);
    else if (regle.enum && !regle.enum.includes(v)) erreurs.push(`valeur hors liste pour ${cle}`);
  }
  return erreurs;
}
