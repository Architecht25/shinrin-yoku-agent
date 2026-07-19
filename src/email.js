import nodemailer from 'nodemailer';
import { config } from './config.js';

function markdownToSimpleHtml(markdown) {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const withInlineFormatting = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const html = withInlineFormatting
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line.trim() === '---') return '<hr>';
      if (line.trim() === '') return '';
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      return `<p>${line}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><body style="font-family: sans-serif; line-height: 1.5;">${html}</body></html>`;
}

export function createTransport() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/**
 * Envoie le rapport de veille aux destinataires configurés.
 * N'envoie rien si aucun destinataire n'est configuré (le CLI doit vérifier ce cas avant, mais
 * on garde une garde ici pour éviter un envoi partiel silencieux).
 */
export async function sendVeilleReport({ transport, subject, markdown, attachmentName }) {
  if (config.recipients.length === 0) {
    throw new Error('Aucun destinataire configuré (RECIPIENT_EMAIL_1 / RECIPIENT_EMAIL_2).');
  }

  await transport.sendMail({
    from: config.smtp.from,
    to: config.recipients,
    subject,
    html: markdownToSimpleHtml(markdown),
    attachments: [
      {
        filename: attachmentName,
        content: markdown,
        contentType: 'text/markdown',
      },
    ],
  });
}
