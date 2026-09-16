# CLAUDE.md — shinrin-yoku-agent

Fichier de contexte pour Claude Code. Lire avant toute session.

## Domaine métier

Agent Node.js de **veille scientifique automatisée** pour **Braña Sana / La Borbolla**,
un centre bien-être en Asturies (Espagne). Le lien exact avec un autre projet/app nommé
"borbolla" n'a pas été retrouvé dans le code (aucune dépendance ni référence croisée) —
le nom du dossier de sortie `veille-la-borbolla/` suggère un lien avec ce lieu/projet,
sans confirmation directe dans ce repo.

Chaque lundi (ou à la demande), l'agent :
- interroge PubMed sur 6 thématiques liées aux piliers de Braña Sana (bain de forêt,
  sommeil, travail manuel, mindfulness, nutrition/longévité, santé préventive),
  définies dans `src/themes.js` — mots-clés + chercheurs de référence par thématique
- déduplique les articles trouvés contre l'historique (`data/db.json`)
- pour chaque article réellement nouveau, demande à Claude d'en extraire une **fiche
  structurée factuelle** (titre, auteurs, type d'étude, mécanisme évalué, résultat
  principal, niveau de preuve et limites, angle d'application pour Braña Sana —
  laissé vide si aucun lien honnête ne se justifie)
- écrit un Markdown du run (`veille-la-borbolla/AAAA-MM-JJ.md`) et envoie ce rapport
  par email aux destinataires configurés

Consigne de fond (portée par le system prompt Claude, `src/extract.js`) : ne jamais
surinterpréter un résultat, toujours distinguer association statistique et preuve
d'effet causal, signaler les limites méthodologiques mentionnées par les auteurs (ou
indiquer explicitement leur absence plutôt que d'en inventer). Sortie destinée à être
relue manuellement avant tout usage éditorial — ce n'est pas un générateur de contenu
marketing.

## Stack technique

| Composant | Version |
|-----------|---------|
| Node.js | >= 20 (CI : Node 22 via `actions/setup-node@v4`) |
| Modules | ESM natif (`"type": "module"`), pas de TypeScript |
| IA | `@anthropic-ai/sdk` ^0.32.1 (SDK OFFICIEL Anthropic), modèle `claude-sonnet-5` |
| Email | Nodemailer ^9.0.3 (SMTP, configuré ici avec Resend) |
| Config | dotenv ^16.4.5 |
| Persistance | fichier JSON plat `data/db.json`, versionné en git — pas de vraie BDD |
| Tests / lint | aucun |
| CI/CD | GitHub Actions (`.github/workflows/veille-shinrin-yoku.yml`) |
| Déploiement | pas de Dockerfile/Procfile — cron GitHub Actions pour le pipeline ; le tableau de bord HTML (`veille-la-borbolla/dashboard.html`) est publié sur **GitHub Pages** à chaque run par le même workflow |

## Commandes essentielles

```bash
# Installation
npm install
cp .env.example .env              # puis renseigner ANTHROPIC_API_KEY, SMTP, destinataires

# Exécution
npm run veille                    # lance un run de veille complet (6 thématiques)
npm run export                    # exporte toute la base de connaissances (data/db.json) en Markdown lisible
npm run dashboard                 # régénère veille-la-borbolla/dashboard.html (tableau de bord de tri)

# Lancement local via wrapper bash (PATH nvm hardcodé — probablement pour un cron local)
bin/run-veille.sh

# CI manuelle
gh workflow run veille-shinrin-yoku.yml   # déclenche le run via workflow_dispatch
```

Aucun test, aucun linter/formatter configuré dans ce repo.

## Architecture (pipeline et modules)

```
src/
  config.js         Lecture des variables d'environnement (dotenv)
  themes.js         Définition statique des 6 thématiques de veille
                     (requête PubMed [Title/Abstract] + chercheurs de référence par thème)
  sources/pubmed.js  Client PubMed E-utilities (esearch + efetch), fetch HTTP brut, générique
                     par thématique — pas de dépendance à une lib PubMed tierce
  extract.js         Extraction structurée via Claude : appel UNIQUE, TOOL-FORCÉ
                     (tool_choice: {type:'tool', name:'enregistrer_fiche'}), un seul tool
                     custom FICHE_TOOL — utilisé comme mécanisme de structured output,
                     pas comme agent conversationnel (pas de mémoire, pas de boucle)
  store.js           Chargement/sauvegarde de data/db.json + déduplication
                     (clé : DOI normalisé, sinon titre normalisé)
  markdown.js        Génération du rapport Markdown du run, organisé par section thématique
  email.js           Envoi du rapport par email (Nodemailer), HTML + pièce jointe .md
  index.js           Orchestration : boucle sur les 6 thématiques → dédup → extraction
                      Claude par article nouveau → écriture Markdown → envoi email
  export.js          Export Markdown de toute la base de connaissances (hors run)
  exportHtml.js       Génère veille-la-borbolla/dashboard.html : tableau de bord HTML
                     statique (zéro dépendance), filtrable par run/thématique/type
                     d'étude, sans backend — exporte `writeDashboard(store)`, appelée
                     par `main()` (CLI `npm run dashboard`) et par `src/index.js` après
                     chaque run pour régénérer le fichier automatiquement

data/db.json              Base de connaissances (source de vérité, toutes thématiques
                            confondues), versionnée en git, champ `thematique_id` pour tri/filtre
veille-la-borbolla/        Sorties Markdown du pipeline actuel (post-renommage, un fichier
                            par run daté AAAA-MM-JJ.md) — cible réelle du code (src/index.js) —
                            contient aussi `dashboard.html`, publié sur GitHub Pages par la CI
veille-shinrin-yoku/       Dossier LEGACY pré-renommage, un seul fichier (2026-07-19.md),
                            jamais migré ni supprimé — voir "Points d'attention"
bin/run-veille.sh          Wrapper bash pour lancement local (PATH nvm hardcodé)
.github/workflows/
  veille-shinrin-yoku.yml  CI : cron hebdo (lundi 5h05 UTC) + workflow_dispatch manuel
```

Pipeline détaillé d'un run (`src/index.js`) :
1. Pour chaque thématique de `src/themes.js` : récupère les articles PubMed récents par
   mots-clés (`fetchRecentPubmedArticles`) + par chercheurs de référence
   (`fetchReferenceAuthorArticles`), étiquetés `thematiqueId`/`thematiqueLabel`
2. Déduplique l'ensemble des articles (toutes thématiques confondues) contre
   `data/db.json` (`partitionNewArticles`, clé DOI ou titre normalisé)
3. Pour chaque article réellement nouveau, appelle Claude (`extractFiche`,
   `claude-sonnet-5`) indépendamment — un appel = un article, pas de contexte partagé
4. Sauvegarde les nouvelles fiches dans `data/db.json`
5. Régénère `veille-la-borbolla/dashboard.html` (`writeDashboard`, `src/exportHtml.js`)
   à partir de la base complète mise à jour
6. Génère le Markdown du run (`buildRunMarkdown`) et l'écrit dans
   `veille-la-borbolla/AAAA-MM-JJ.md` — inclut un lien vers `DASHBOARD_URL` si la
   variable est renseignée (c'est le cas en CI, vide en local)
7. Envoie le rapport par email si des destinataires sont configurés — **aucun email
   n'est envoyé s'il n'y a aucune étude nouvelle** (pas de bruit)

La CI (`veille-shinrin-yoku.yml`) exécute ce pipeline puis **commit et push
automatiquement** `data/db.json` et `veille-la-borbolla/` avec un bot dédié
(`veille-shinrin-yoku-bot`), puis publie `veille-la-borbolla/dashboard.html` (renommé
`index.html`) sur **GitHub Pages** via `actions/upload-pages-artifact` +
`actions/deploy-pages` (job séparé `deploy-pages`, `needs: veille`). Le dépôt étant
privé, la page Pages nécessite un plan GitHub payant (Pro/Team/Enterprise) — sur un
plan Free, la publication Pages échoue en CI (`deploy-pages` en erreur) tant que le
dépôt reste privé ; passer le dépôt en public ou upgrader le plan lève la limite.

## Conventions

- Ajouter une thématique = ajouter une entrée dans `src/themes.js` uniquement — le
  pipeline (`sources/pubmed.js`, `extract.js`, `index.js`) est générique et ne doit pas
  être dupliqué par thématique.
- Ne jamais faire deviner par Claude une information déjà connue de manière certaine
  (ex. la thématique d'un article, connue dès la requête PubMed d'origine) — l'attacher
  déterministiquement plutôt que de la faire ressortir du tool use.
- Le champ `angle_brana_sana` (ou tout champ d'application produit) doit rester vide si
  aucun lien concret et honnête ne se justifie — ne jamais forcer un rapprochement
  marketing dans le prompt ou en aval.
- Toute nouvelle source (ClinicalTrials.gov, Frontiers, MDPI...) doit suivre le même
  modèle de module isolé dans `src/sources/`. Pas de scraping agressif (ex. Google
  Scholar, sans API officielle) — fallback manuel uniquement.
- Ne jamais committer de vraie clé API ou secret dans le repo — `.env` est gitignored,
  `.env.example` ne contient que des noms de variables.

## Variables d'environnement

```
ANTHROPIC_API_KEY             # Clé API Claude (Anthropic)

PUBMED_API_KEY                 # Optionnel — quota plus élevé E-utilities NCBI
PUBMED_TOOL_NAME               # Paramètre "tool" requis par l'API PubMed
PUBMED_CONTACT_EMAIL           # Paramètre "email" requis par l'API PubMed
PUBMED_MAX_RESULTS             # Nb max de résultats par thématique (recherche mots-clés)
PUBMED_REFERENCE_AUTHOR_MAX_RESULTS  # Nb max de résultats par thématique (recherche par auteur)

SMTP_HOST                      # Hôte SMTP (Resend en CI)
SMTP_PORT                      # Port SMTP
SMTP_SECURE                    # true/false
SMTP_USER                      # Utilisateur SMTP
SMTP_PASS                      # Mot de passe / clé SMTP
SMTP_FROM                      # Adresse expéditeur affichée

RECIPIENT_EMAIL_1              # Destinataire 1 du rapport
RECIPIENT_EMAIL_2              # Destinataire 2 du rapport

DASHBOARD_URL                   # URL publique du tableau de bord (GitHub Pages) — optionnel,
                                 # ajoutée en tête du rapport quand renseignée ; vide en local
```

En CI (`veille-shinrin-yoku.yml`), ces valeurs sont injectées via `secrets.*` pour
`ANTHROPIC_API_KEY` et `SMTP_PASS`, et en clair dans le workflow pour le reste
(hôte/port SMTP Resend, adresses destinataires) — aucune valeur réelle à reporter ici.

## Points d'attention

- **BUG CONNU (non corrigé au 10/09/2026) — dossier de sortie manquant en CI** : le
  workflow fait `git add data/db.json veille-la-borbolla/`, mais ce dossier n'existe
  pas encore dans le repo tel que committé (seul l'ancien `veille-shinrin-yoku/` du
  pré-renommage existe, avec un seul fichier `2026-07-19.md`). Le code écrit bien dans
  `veille-la-borbolla/` (`src/index.js`, depuis le commit de renommage `4e410a2`), mais
  le dossier legacy n'a jamais été migré ni supprimé. Risque d'échec silencieux du
  commit/push automatique tant que ce n'est pas corrigé — **à corriger en priorité**
  (créer/committer `veille-la-borbolla/` avec au moins un `.gitkeep` ou migrer le
  contenu de `veille-shinrin-yoku/`, puis supprimer ce dernier).
- **Aucun test, aucun linter/formatter** dans le repo — toute modification doit être
  vérifiée manuellement (lancement local via `npm run veille` ou `bin/run-veille.sh`).
- **`data/db.json` grossit indéfiniment sans purge** — base JSON plate versionnée en
  git, aucune archive/rotation prévue ; à surveiller si le volume d'articles/fiches
  augmente significativement dans le temps.
- **Aucune cible de déploiement** — le pipeline ne tourne que via le cron GitHub
  Actions (`workflow_dispatch` pour un déclenchement manuel) ou en local via
  `bin/run-veille.sh` (PATH nvm hardcodé, probablement destiné à un cron local en
  complément ou en remplacement du CI).
- **Un seul appel Claude par article**, indépendant, tool-forcé — ce n'est pas un
  agent conversationnel : pas de mémoire, pas de boucle agentique, pas de contexte
  partagé entre articles d'un même run.
