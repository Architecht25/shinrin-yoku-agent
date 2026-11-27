/**
 * File des envois (data/file-envois.json). La préparation y dépose chaque run une fois la
 * base enregistrée ; l'envoi la traite ensuite, e-mail puis hub, et reprend au run suivant
 * ce qui a échoué. Le fichier est versionné : aucune adresse ni aucun secret n'y entre.
 */
import { lireJson, ecrireJson } from './store.js';

export const A_ENVOYER = 'à envoyer';
const ENVOYE = 'envoyé';
const IGNORE = 'ignoré';
export const ABANDONNE = 'abandonné';

export const MAX_RUNS = { email: 5, hub: 8 };
const ESSAIS_PAR_RUN = 3;
const PAUSE_MS = 5000;

const lireFile = (chemin) => lireJson(chemin, { envois: [] });

export async function mettreEnFile(chemin, { id, runDate, email, hub }) {
  const file = await lireFile(chemin);
  file.envois.push({
    id,
    run_date: runDate,
    email: { statut: A_ENVOYER, runs: 0, ...email },
    hub: { statut: A_ENVOYER, runs: 0, payload: hub },
  });
  await ecrireJson(chemin, file);
}

/** Codes seulement : les messages SMTP ou réseau peuvent contenir adresses ou hôtes. */
export const codeErreur = (err) => [err.code, err.responseCode].filter(Boolean).join(' ') || err.name || 'erreur';

async function avecReprise(action, pause) {
  let resultat;
  for (let essai = 1; essai <= ESSAIS_PAR_RUN; essai += 1) {
    resultat = await action();
    if (resultat.ok || resultat.definitif) break;
    if (essai < ESSAIS_PAR_RUN) await pause(PAUSE_MS * essai);
  }
  return resultat;
}

function consigner(voie, nom, resultat) {
  if (resultat.ignore) {
    voie.statut = IGNORE;
    return;
  }
  voie.runs += 1;
  if (resultat.ok) {
    voie.statut = ENVOYE;
    delete voie.erreur;
    return;
  }
  voie.erreur = resultat.erreur;
  if (voie.runs >= MAX_RUNS[nom]) voie.statut = ABANDONNE;
}

/**
 * @param envoyerEmail (email) => Promise<{ignore?: true}>, lève en cas d'échec
 * @param envoyerHub   (payload) => Promise<{status}> (contrat de sendToHub, ne lève pas)
 * Renvoie le nombre d'échecs par voie. Une panne du hub ne retarde jamais un e-mail :
 * tous les e-mails partent avant le premier appel au hub.
 */
export async function traiterFile(chemin, { envoyerEmail, envoyerHub, pause = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const file = await lireFile(chemin);
  const echecs = { email: 0, hub: 0 };

  const actions = {
    email: async (voie) => {
      try {
        const r = await envoyerEmail(voie);
        return r?.ignore ? { ignore: true } : { ok: true };
      } catch (err) {
        return { ok: false, erreur: codeErreur(err) };
      }
    },
    hub: async (voie) => {
      try {
        const r = await envoyerHub(voie.payload);
        if (r.status === 'disabled') return { ignore: true };
        if (r.status === 'sent' || r.status === 'duplicate') return { ok: true };
        if (r.status === 'skipped') return { ok: false, definitif: true, erreur: 'configuration du hub incomplète' };
        const refus = r.httpStatus >= 400 && r.httpStatus < 500 && r.httpStatus !== 429;
        return { ok: false, definitif: refus, erreur: r.httpStatus ? `HTTP ${r.httpStatus}` : 'réseau' };
      } catch (err) {
        return { ok: false, erreur: codeErreur(err) };
      }
    },
  };

  for (const nom of ['email', 'hub']) {
    for (const envoi of file.envois) {
      const voie = envoi[nom];
      if (voie.statut !== A_ENVOYER) continue;
      const resultat = await avecReprise(() => actions[nom](voie), pause);
      consigner(voie, nom, resultat);
      if (!resultat.ok && !resultat.ignore) {
        echecs[nom] += 1;
        const suite = voie.statut === ABANDONNE ? 'abandonné' : 'repris au prochain run';
        console.error(`[veille] Envoi ${nom} du ${envoi.run_date} en échec (${resultat.erreur}) — ${suite}.`);
      }
      // Enregistré après chaque envoi, pour ne pas renvoyer ce qui est déjà parti.
      await ecrireJson(chemin, file);
    }
  }

  // Les envois terminés sortent de la file ; les abandons y restent visibles.
  const fini = (v) => v.statut === ENVOYE || v.statut === IGNORE;
  const restants = file.envois.filter((e) => !(fini(e.email) && fini(e.hub)));
  if (file.envois.length) await ecrireJson(chemin, { envois: restants });
  return echecs;
}
