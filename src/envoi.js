/** Envoi de ce qui est en file : e-mails, puis hub. */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';

import { config } from './config.js';
import { createTransport, sendVeilleReport } from './email.js';
import { sendToHub } from './hub.js';
import { traiterFile } from './file-envois.js';

const versEmail = (transport) => async (email) => {
  if (config.recipients.length === 0) {
    console.log('[veille] Aucun destinataire configuré (RECIPIENT_EMAIL_1/2) — email non envoyé.');
    return { ignore: true };
  }
  await sendVeilleReport({
    transport,
    subject: email.sujet,
    markdown: email.markdown,
    attachmentName: email.nom_piece_jointe,
    attachmentContent: email.piece_jointe,
  });
  // Pas d'adresses dans les journaux : ceux d'un dépôt public le sont aussi.
  console.log(`[veille] Email envoyé à ${config.recipients.length} destinataire(s).`);
  return {};
};

export async function envoyer(emplacements) {
  return traiterFile(emplacements.file, {
    envoyerEmail: versEmail(createTransport()),
    envoyerHub: (payload) => sendToHub(payload),
  });
}

/** Essai à blanc : écrit les e-mails et les livraisons dans des fichiers, sans rien envoyer. */
export async function simulerEnvoi(emplacements, dossier) {
  await mkdir(dossier, { recursive: true });
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  let n = 0;
  return traiterFile(emplacements.file, {
    envoyerEmail: async (email) => {
      // Même rendu que le vrai envoi, avec une expédition capturée dans un fichier .eml.
      let rendu;
      await sendVeilleReport({
        transport: {
          sendMail: async (m) => {
            rendu = await transport.sendMail({ ...m, from: 'essai@exemple.invalid' });
          },
        },
        recipients: ['essai@exemple.invalid'],
        subject: email.sujet,
        markdown: email.markdown,
        attachmentName: email.nom_piece_jointe,
        attachmentContent: email.piece_jointe,
      });
      n += 1;
      await writeFile(path.join(dossier, `email-${n}.eml`), rendu.message);
      return {};
    },
    envoyerHub: async (payload) => {
      await writeFile(path.join(dossier, `hub-${payload.external_id}.json`), JSON.stringify(payload, null, 2));
      return { status: 'sent' };
    },
  });
}
