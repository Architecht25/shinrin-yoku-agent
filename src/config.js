import 'dotenv/config';

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  pubmed: {
    apiKey: process.env.PUBMED_API_KEY || '',
    toolName: process.env.PUBMED_TOOL_NAME || 'shinrin-yoku-agent',
    contactEmail: process.env.PUBMED_CONTACT_EMAIL || '',
    query:
      process.env.PUBMED_QUERY ||
      '"shinrin-yoku"[Title/Abstract] OR "forest bathing"[Title/Abstract] OR "forest therapy"[Title/Abstract] OR "nature therapy"[Title/Abstract]',
    maxResults: Number(process.env.PUBMED_MAX_RESULTS || 20),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  recipients: [process.env.RECIPIENT_EMAIL_1, process.env.RECIPIENT_EMAIL_2].filter(Boolean),
};
