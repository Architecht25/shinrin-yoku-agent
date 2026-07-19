# Shinrin-yoku Agent

Agent de veille scientifique sur le shinrin-yoku (bain de forêt) pour alimenter la
base de connaissances de Braña Sana / La Borbolla. Ne produit **pas** de contenu
marketing — uniquement des fiches d'étude structurées, factuelles et exportables,
à relire manuellement avant tout usage éditorial.

## Fonctionnement (itération 1)

1. Interroge PubMed (E-utilities, API officielle) sur `shinrin-yoku OR "forest
   bathing" OR "forest therapy"`, triés par date, jusqu'à `PUBMED_MAX_RESULTS`
   résultats (20 par défaut).
2. Déduplique par rapport à la base déjà connue (clé : DOI, ou titre normalisé si
   pas de DOI).
3. Pour chaque article réellement nouveau, extrait une fiche structurée via Claude
   (Sonnet) : titre, auteurs, date, DOI/lien, type d'étude, mécanisme évalué,
   résultat principal, niveau de preuve/limites, angle d'application possible pour
   Braña Sana (uniquement si pertinent — jamais forcé).
4. Enregistre les nouvelles fiches dans `data/db.json`.
5. Écrit un Markdown du run dans `veille-shinrin-yoku/AAAA-MM-JJ.md`.
6. Envoie ce Markdown par email (HTML + pièce jointe `.md`) aux adresses
   `RECIPIENT_EMAIL_1` / `RECIPIENT_EMAIL_2`. **Aucun email n'est envoyé s'il n'y a
   aucune étude nouvelle** — pas de bruit.

## Installation

```bash
npm install
cp .env.example .env
# renseigner ANTHROPIC_API_KEY, les identifiants SMTP et les destinataires
```

## Utilisation

```bash
npm run veille     # lance un run de veille complet
npm run export     # exporte toute la base de connaissances en Markdown lisible
```

## Rigueur scientifique

- Claude reçoit une consigne stricte : ne jamais surinterpréter, toujours distinguer
  association et preuve d'effet, signaler les limites mentionnées par les auteurs
  (taille d'échantillon, absence de contrôle, hétérogénéité méthodologique...), et
  indiquer explicitement quand rien n'est précisé plutôt que d'inventer.
- Le champ "angle Braña Sana" reste vide quand aucun lien concret et honnête ne se
  justifie.

## Sources

- ✅ PubMed / PMC — implémenté (E-utilities officielle, sans clé requise mais
  `PUBMED_API_KEY` recommandé pour un quota plus élevé).
- À ajouter dans une itération suivante, sur le même modèle de module dans
  `src/sources/` : ClinicalTrials.gov (API officielle), Frontiers, MDPI. Google
  Scholar n'a pas d'API officielle — à traiter en fallback manuel seulement, jamais
  en scraping automatisé agressif.

## Architecture

```
src/
  config.js       variables d'environnement
  sources/pubmed.js   client PubMed E-utilities (esearch + efetch)
  extract.js      extraction structurée via Claude (tool use)
  store.js        stockage JSON + déduplication (DOI ou titre)
  markdown.js      génération des fiches Markdown
  email.js         envoi du rapport par email (nodemailer)
  index.js         orchestration du run de veille
  export.js        export Markdown de toute la base
data/db.json       base de connaissances (source de vérité)
veille-shinrin-yoku/   sorties Markdown consultables
```

Inspiré de l'architecture de l'Agent Veille de ren0vate (scraping → analyse Claude →
stockage → email), sans dépendance directe à ce projet.
