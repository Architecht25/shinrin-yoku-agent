/**
 * Préparation d'un run : collecte, extraction, vérification, journal, puis enregistrement
 * de la base et mise en file des envois. Rien n'est envoyé ici.
 */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { fetchRecentPubmedArticles, fetchReferenceAuthorArticles, fetchArticles } from './sources/pubmed.js';
import { loadStore, saveStore, partitionNewArticles, lireJson, ecrireJson } from './store.js';
import { createAnthropicClient, extractFiche, estExploitable } from './extract.js';
import { redigerJournal, journalToMarkdown, decrireFiches, retenirPourJournal, journalVide } from './digest.js';
import { config } from './config.js';
import { verifierFiche } from './verification.js';
import { verifierJournal } from './verification-journal.js';
import { buildRunMarkdown } from './markdown.js';
import { writeDashboard } from './exportHtml.js';
import { separerPreuve, enregistrerPreuves } from './preuves.js';
import { buildHubPayload } from './hub.js';
import { mettreEnFile } from './file-envois.js';
import { fenetreCollecte } from './fenetre.js';
import { estRetracte, verifierRetractations } from './retractations.js';
import { evaluerFicheAncienne } from './evaluation-ancienne.js';
import { estEtudeAnimale } from './etudes-animales.js';

export const MAX_TENTATIVES_EXTRACTION = 3;

/**
 * Récupère les articles bruts (mots-clés + chercheurs de référence) pour une thématique,
 * et les étiquette avec cette thématique pour le reste du pipeline.
 */
async function fetchThemeArticles(theme, jours, sources) {
  const motCleArticles = await sources.parMotsCles({ query: theme.pubmedQuery, jours });
  console.log(`[veille] ${theme.label} : ${motCleArticles.length} article(s) via recherche par mots-clés.`);

  let referenceArticles = [];
  if (theme.referenceAuthors.length > 0) {
    referenceArticles = await sources.parAuteurs({ query: theme.pubmedQuery, authors: theme.referenceAuthors, jours });
    const noms = theme.referenceAuthors.map((a) => a.nom).join(', ');
    console.log(`[veille] ${theme.label} : ${referenceArticles.length} article(s) via recherche prioritaire par auteur (${noms}).`);
  }

  return [...motCleArticles, ...referenceArticles].map((article) => ({
    ...article,
    thematiqueId: theme.id,
    thematiqueLabel: theme.label,
  }));
}

/** Fiches en échec lors d'un run précédent, à retenter par PMID. */
async function articlesARetenter(store, sources) {
  const echecs = store.fiches.filter(
    (f) => f.statut === 'extraction échouée' && f.pmid && (f.tentatives || 1) < MAX_TENTATIVES_EXTRACTION
  );
  if (!echecs.length) return [];
  const articles = await sources.parPmids(echecs.map((f) => f.pmid));
  return articles.map((article) => {
    const f = echecs.find((e) => e.pmid === article.pmid);
    return {
      ...article,
      thematiqueId: f.thematique_id,
      thematiqueLabel: f.thematique,
      origineRecherche: f.origine_recherche,
      chercheurReference: f.chercheur_reference,
    };
  });
}

const SOURCES_PUBMED = {
  parMotsCles: fetchRecentPubmedArticles,
  parAuteurs: fetchReferenceAuthorArticles,
  parPmids: fetchArticles,
};

/**
 * @param themes       thématiques à collecter
 * @param toutes       true si ce sont toutes les thématiques (sinon la date de collecte n'avance pas)
 * @param emplacements voir chemins.js
 */
export async function preparer({
  themes,
  toutes,
  emplacements,
  runDate,
  runId,
  dashboardUrl,
  client = createAnthropicClient(),
  sources = SOURCES_PUBMED,
}) {
  const store = await loadStore(emplacements.db);
  const etat = await lireJson(emplacements.etat, {});
  const { jours, tronquee } = fenetreCollecte(etat, store, runDate);
  console.log(`[veille] Collecte des articles entrés dans PubMed depuis ${jours} jours.`);
  if (tronquee) console.error(`[veille] Attention : dernière collecte trop ancienne, fenêtre limitée à ${jours} jours.`);

  const articles = [];
  for (const theme of themes) {
    articles.push(...(await fetchThemeArticles(theme, jours, sources)));
  }
  const nonRetractes = articles.filter((a) => !estRetracte(a));
  if (nonRetractes.length < articles.length) {
    console.log(`[veille] ${articles.length - nonRetractes.length} publication(s) rétractée(s) ou avis de rétractation exclu(s).`);
  }
  const publiables = nonRetractes.filter((a) => !estEtudeAnimale(a));
  for (const a of nonRetractes.filter(estEtudeAnimale)) {
    console.log(`[veille] Étude animale exclue : ${a.title.slice(0, 100)}`);
  }
  const retractees = await verifierRetractations(store, runDate, sources.parPmids);
  const marquerCollecte = async () => {
    if (toutes) await ecrireJson(emplacements.etat, { ...etat, derniere_collecte: runDate });
  };

  // Déduplication tous thèmes confondus : une même étude ne doit être réintégrée qu'une
  // fois, même si elle correspond aux mots-clés de plusieurs thématiques à la fois.
  // Les extractions échouées sont traitées à part, avec un nombre de tentatives limité.
  const enEchec = new Set(store.fiches.filter((f) => f.statut === 'extraction échouée' && f.pmid).map((f) => f.pmid));
  const inedits = partitionNewArticles(store, publiables).filter((a) => !enEchec.has(a.pmid));
  const aRetenter = (await articlesARetenter(store, sources)).filter((a) => !estRetracte(a) && !estEtudeAnimale(a));
  console.log(`[veille] ${inedits.length} article(s) nouveau(x), ${aRetenter.length} à retenter.`);

  const aTraiter = [...inedits, ...aRetenter];
  if (aTraiter.length === 0 && retractees.length === 0) {
    await marquerCollecte();
    console.log('[veille] Rien de nouveau — pas de fiche à créer, pas d’email à envoyer.');
    return { nouvelles: 0 };
  }

  const nouvellesFiches = [];
  const echecs = [];
  const preuves = [];

  for (const brut of aTraiter) {
    const article = { ...brut, _runDate: runDate };
    console.log(`[veille] Extraction Claude : ${article.title.slice(0, 80)}...`);
    let { fiche, preuve } = separerPreuve(await extractFiche(client, article), article);
    if (estExploitable(fiche)) {
      ({ fiche, preuve } = await verifierFiche(client, fiche, preuve));
      const { statut, raison } = fiche.verification;
      console.log(`[veille] Vérification : ${statut}${raison ? ` — ${raison}` : ''}`);
      nouvellesFiches.push(fiche);
    } else {
      const precedente = store.fiches.find((f) => article.pmid && f.pmid === article.pmid);
      echecs.push({ ...fiche, tentatives: (precedente?.tentatives || 0) + 1 });
      console.error(`[veille] Extraction échouée pour "${article.title}" : ${fiche.raison_echec}`);
    }
    preuves.push(preuve);
  }

  // Échec général (clé invalide, panne d'API…) : rien n'est enregistré, tout sera repris.
  // Des reprises seules qui échouent encore sont en revanche enregistrées, pour les compter.
  if (nouvellesFiches.length === 0 && inedits.length > 0) {
    throw new Error(`Toutes les extractions ont échoué (${echecs.length}) — rien n'est enregistré.`);
  }

  // Les anciennes fiches qui reparaissent (ici : rétractées) sont évaluées à ce moment-là.
  if (retractees.length) {
    const articlesAnciens = await sources.parPmids(retractees.map((f) => f.pmid)).catch(() => []);
    for (let i = 0; i < retractees.length; i += 1) {
      const ancienne = retractees[i];
      const { fiche, preuve } = await evaluerFicheAncienne(client, ancienne, articlesAnciens.find((a) => a.pmid === ancienne.pmid), runDate);
      if (!preuve) continue;
      store.fiches[store.fiches.indexOf(ancienne)] = fiche;
      retractees[i] = fiche;
      preuves.push(preuve);
    }
  }

  let envoi = null;
  if (nouvellesFiches.length > 0 || retractees.length > 0) {
    // Publication hebdomadaire : uniquement les fiches nouvelles de ce run (la base complète
    // reste dans data/db.json ; `npm run dashboard` régénère un tableau de bord complet en local).
    // Une fiche rétractée y reparaît, avec son avertissement.
    await writeDashboard({ fiches: [...retractees, ...nouvellesFiches] }, emplacements.sorties);
    envoi = await redigerSorties(client, nouvellesFiches, { runDate, runId, dashboardUrl, dossier: emplacements.sorties, retractees });
  }

  // La base d'abord : si son enregistrement échoue, rien n'entre dans la file des envois.
  await enregistrerPreuves(emplacements.preuves, preuves);
  const remplaces = new Set([...nouvellesFiches, ...echecs].map((f) => f.pmid).filter(Boolean));
  store.fiches = store.fiches.filter((f) => !(f.statut === 'extraction échouée' && remplaces.has(f.pmid)));
  store.fiches.push(...nouvellesFiches, ...echecs);
  await saveStore(store, emplacements.db);
  if (envoi) await mettreEnFile(emplacements.file, envoi);
  await marquerCollecte();

  return { nouvelles: nouvellesFiches.length, echecs: echecs.length };
}

/** Écrit le rapport détaillé et le journal, et renvoie ce qui doit être envoyé. */
async function redigerSorties(client, nouvellesFiches, { runDate, runId, dashboardUrl, dossier, retractees }) {
  const fichesMarkdown = buildRunMarkdown(nouvellesFiches, { runDate, dashboardUrl, retractees });

  // Journal lisible (priorité à ce qui est applicable à La Borbolla) ; si la rédaction ou son
  // contrôle échoue, on retombe sur le rapport détaillé plutôt que de ne rien envoyer.
  let journalMarkdown = null;
  let journal = null;
  const seuil = config.seuilPertinence;
  const fichesJournal = retenirPourJournal(nouvellesFiches, seuil);
  console.log(`[veille] ${fichesJournal.length} fiche(s) sur ${nouvellesFiches.length} au seuil de pertinence (${seuil}/5) ou au-dessus.`);
  try {
    if (fichesJournal.length === 0) {
      journal = journalVide(seuil);
    } else {
      const brouillon = await redigerJournal(client, fichesJournal);
      const controle = await verifierJournal(client, brouillon, fichesJournal, decrireFiches(fichesJournal));
      journal = controle.journal;
      for (const { phrase, raison } of controle.suppressions) {
        console.log(`[veille] Journal, phrase supprimée : « ${phrase} » (${raison})`);
      }
    }
    journalMarkdown = journalToMarkdown(journal, fichesJournal, { runDate, dashboardUrl, total: nouvellesFiches.length, retractees });
  } catch (err) {
    journal = null;
    console.error(`[veille] Échec de la rédaction ou du contrôle du journal, repli sur le rapport détaillé : ${err.message}`);
  }

  await mkdir(dossier, { recursive: true });
  await writeFile(path.join(dossier, `${runDate}${journalMarkdown ? '-fiches' : ''}.md`), fichesMarkdown, 'utf-8');
  if (journalMarkdown) await writeFile(path.join(dossier, `${runDate}.md`), journalMarkdown, 'utf-8');
  console.log(`[veille] Sorties écrites dans ${dossier} (${runDate})`);

  return {
    id: runId,
    runDate,
    email: {
      sujet: `Veille La Borbolla / Braña Sana — ${journalMarkdown ? 'Le journal de la semaine' : `${nouvellesFiches.length} nouvelle(s) étude(s)`} — ${runDate}`,
      markdown: journalMarkdown || fichesMarkdown,
      nom_piece_jointe: `veille-la-borbolla-${runDate}-fiches.md`,
      piece_jointe: fichesMarkdown,
    },
    hub: buildHubPayload({
      journal,
      body: journalMarkdown || fichesMarkdown,
      fiches: journal ? fichesJournal : nouvellesFiches,
      retractees,
      runDate,
      runId,
    }),
  };
}
