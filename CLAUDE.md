# CLAUDE.md — shinrin-yoku-agent

Contexte pour Claude Code. Le déroulé d'un run, les règles de vérification, les données
et les commandes sont décrits dans [README.md](README.md) : le lire avant toute session.

## Domaine

Veille scientifique pour **Braña Sana / La Borbolla** (centre bien-être en Asturies) :
repos, soins naturels et retour au manuel. Quatre thématiques : bain de forêt,
repos/sommeil, sieste & marche, retour au manuel.

Sortie relue à la main avant tout usage éditorial ; ce n'est pas un générateur de
contenu marketing.

## Essentiel

- Node >= 20 (CI : 22), ESM, sans TypeScript ni linter. IA : `@anthropic-ai/sdk`, modèle
  `claude-sonnet-5` (constante `MODEL` dans `src/extract.js`). E-mail : Nodemailer (SMTP
  Resend). Persistance : fichiers JSON versionnés dans `data/`.
- Tests : `npm test` (`node:test`, sans réseau). Lancés par `ci.yml` et par le workflow
  de veille avant tout envoi.
- Essai : `npm run veille:essai` (écrit dans `tmp/replay/`, aucun envoi, appels Claude
  réels). Ne pas utiliser `npm run veille` pour essayer.
- Production : `.github/workflows/veille-shinrin-yoku.yml`, **vendredi 18h05 UTC**. Le bot
  commite sur `master` : faire `git pull` avant de travailler.
- Dépôt **public** (`Architecht25/shinrin-yoku-agent`), tableau de bord publié sur GitHub
  Pages.

## Modules

```
src/index.js                options : --preparer, --envoyer, --dry-run
src/preparation.js          collecte → fiches → vérification → journal → base → file
src/envoi.js, file-envois.js  envoi e-mail puis hub, avec reprise
src/sources/pubmed.js       E-utilities, pagination par date d'entrée, parseur XML (regex)
src/extract.js              fiche : outil forcé, validation
src/appel-outil.js          troncature, validation, nouvelle tentative
src/types-etude.js          types d'étude et règles PubMed
src/niveaux.js              niveau de preuve, prudence, verbes causaux, étiquettes
src/retractations.js, evaluation-ancienne.js
src/verification.js         second appel + contrôle des chiffres (src/chiffres.js)
src/digest.js               journal
src/verification-journal.js contrôle du journal contre les fiches
src/preuves.js              data/abstracts/<année>.json (empreintes, sans texte)
src/store.js                base et déduplication (PMID, DOI, titre)
src/markdown.js, email.js, hub.js, exportHtml.js   sorties
```

## Conventions

- Les requêtes passent toutes par `withExclusions` (animaux/in vitro et recommandations
  cliniques exclus). Garder les requêtes étroites.
- Ne jamais faire deviner au modèle ce que le code sait (thématique, PMID, DOI, titre,
  date, type PubMed explicite).
- `angle_brana_sana` reste vide sans lien concret et honnête (score 0 dans ce cas).
- Tout ce que le modèle produit est validé après réception ; en cas de doute, on retire
  plutôt qu'on diffuse.
- Le tableau de bord est public : tout texte inséré doit rester échappé
  (`jsonPourScript`, `textContent`, `escapeHtml`).
- Ne jamais écrire le texte d'un résumé dans un fichier versionné (dépôt public).
- Aucune adresse ni aucun secret dans `data/` ou dans les messages d'erreur enregistrés.
  `.env` n'est jamais commité.

## Points d'attention

- Le hub ignore un second article portant la même semaine ISO.
- `data/db.json` grossit sans purge.
- `veille-shinrin-yoku/` est un ancien dossier de sortie, conservé.
