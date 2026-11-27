import 'dotenv/config';

/** Entier d'environnement borné ; une valeur vide donne le défaut, une valeur fausse arrête. */
export function entier(brut, defaut, min, max) {
  if (brut === undefined || brut === '') return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Valeur de configuration invalide : « ${brut} » (entier de ${min} à ${max}).`);
  return n;
}

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  pubmed: {
    apiKey: process.env.PUBMED_API_KEY || '',
    toolName: process.env.PUBMED_TOOL_NAME || 'shinrin-yoku-agent',
    contactEmail: process.env.PUBMED_CONTACT_EMAIL || '',
    // Tailles de page (toutes les pages sont lues), appliquées à chaque thématique (les requêtes sont
    // définies par thématique dans ce fichier, pas via l'environnement).
    maxResults: Number(process.env.PUBMED_MAX_RESULTS || 20),
    referenceAuthorMaxResults: Number(process.env.PUBMED_REFERENCE_AUTHOR_MAX_RESULTS || 10),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  // Liste d'ids de thématiques (cf. src/themes.js) séparés par des virgules, ex.
  // "shinrin-yoku". Vide = toutes les thématiques.
  themeIds: (process.env.VEILLE_THEMES || '').split(',').map((s) => s.trim()).filter(Boolean),

  recipients: [process.env.RECIPIENT_EMAIL_1, process.env.RECIPIENT_EMAIL_2].filter(Boolean),

  dashboardUrl: process.env.DASHBOARD_URL || '',

  // Sous ce score de pertinence_centre, une fiche n'entre ni « À la une » ni « En bref ».
  seuilPertinence: entier(process.env.SEUIL_PERTINENCE_CENTRE, 3, 0, 5),

  // Sous ce nombre de participants, une étude primaire est « exploratoire ».
  seuilPetitEchantillon: entier(process.env.SEUIL_PETIT_ECHANTILLON, 30, 1, 100000),

  // Hub d'agents : envoi actif seulement si HUB_ENABLED === 'true'.
  hub: {
    enabled: process.env.HUB_ENABLED === 'true',
    url: process.env.HUB_URL || '',
    token: process.env.HUB_TOKEN || '',
  },
};
