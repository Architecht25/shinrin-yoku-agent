# Shinrin-yoku Agent

Agent de veille scientifique pour La Borbolla / Braña Sana (centre bien-être en
Asturies), couvrant les six piliers du projet :

1. Bain de forêt / shinrin-yoku
2. Repos / sommeil
3. Retour au manuel (travail manuel, artisanat)
4. Mindfulness & performance mentale
5. Nutrition & science de la longévité
6. Santé préventive & médecine personnalisée

Ne produit **pas** de contenu marketing — uniquement des fiches d'étude structurées,
factuelles et exportables, à relire manuellement avant tout usage éditorial.

## Fonctionnement

1. Pour chaque thématique (définie dans `src/themes.js`), interroge PubMed
   (E-utilities, API officielle) sur les mots-clés de la thématique, triés par date,
   jusqu'à `PUBMED_MAX_RESULTS` résultats (20 par défaut).
1bis. Interroge en plus, en priorité, les publications des chercheurs de référence de
   chaque thématique (combinées aux mêmes mots-clés thématiques pour désambiguïser les
   homonymes) :
   - Bain de forêt : Qing Li (Nippon Medical School), Yoshifumi Miyazaki (Chiba
     University)
   - Repos / sommeil : Matthew Walker (UC Berkeley), Steven Laureys (Université de
     Liège)
   - Retour au manuel : aucun chercheur de référence identifié à ce stade — filtre par
     mots-clés uniquement
   - Mindfulness & performance mentale : Jon Kabat-Zinn (UMass), Amishi Jha
     (Université de Miami)
   - Nutrition & longévité : Valter Longo (USC), David Sinclair (Harvard)
   - Santé préventive & médecine personnalisée : Eric Topol (Scripps Research)

   Ces fiches sont marquées `origine_recherche: "reference"` pour les distinguer des
   résultats de la recherche générique par mots-clés (`origine_recherche: "mot-clé"`).
2. Déduplique par rapport à la base déjà connue (clé : DOI, ou titre normalisé si pas
   de DOI) — tous les lots (6 thématiques × mots-clés + auteurs) sont dédupliqués
   ensemble, en une seule passe, avant extraction.
3. Pour chaque article réellement nouveau, extrait une fiche structurée via Claude
   (Sonnet) : titre, auteurs, date, DOI/lien, thématique, type d'étude, mécanisme
   évalué, résultat principal, niveau de preuve/limites, angle d'application possible
   pour Braña Sana (uniquement si pertinent — jamais forcé). La thématique elle-même
   n'est pas devinée par Claude : elle est connue avec certitude dès la récupération
   (on sait pour quelle thématique l'article a été recherché) et simplement attachée à
   la fiche.
4. Enregistre les nouvelles fiches dans `data/db.json` (base unique, toutes
   thématiques confondues, avec le champ `thematique_id` pour le tri/filtre).
5. Écrit un Markdown du run dans `veille-la-borbolla/AAAA-MM-JJ.md`, organisé par
   section thématique.
6. Envoie ce Markdown par email (HTML + pièce jointe `.md`) aux adresses
   `RECIPIENT_EMAIL_1` / `RECIPIENT_EMAIL_2`, toutes thématiques confondues dans un
   seul email. **Aucun email n'est envoyé s'il n'y a aucune étude nouvelle, toutes
   thématiques confondues** — pas de bruit.

## Installation

```bash
npm install
cp .env.example .env
# renseigner ANTHROPIC_API_KEY, les identifiants SMTP et les destinataires
```

## Utilisation

```bash
npm run veille     # lance un run de veille complet (6 thématiques)
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

## Ajouter ou ajuster une thématique

Toute la configuration d'une thématique (id, libellé, requête PubMed, chercheurs de
référence) vit dans `src/themes.js`. Le pipeline de récupération/extraction
(`src/sources/pubmed.js`, `src/extract.js`, `src/index.js`) est générique et
paramétré par thématique — ajouter une thématique ne demande pas de dupliquer de
code, juste une nouvelle entrée dans `THEMES`.

## Architecture

```
src/
  config.js       variables d'environnement
  themes.js        définition des 6 thématiques (requêtes PubMed + chercheurs de référence)
  sources/pubmed.js   client PubMed E-utilities (esearch + efetch), générique par thématique
  extract.js      extraction structurée via Claude (tool use), thématique attachée déterministe
  store.js        stockage JSON + déduplication (DOI ou titre), tous thèmes confondus
  markdown.js      génération des fiches Markdown, organisées par section thématique
  email.js         envoi du rapport par email (nodemailer)
  index.js         orchestration du run de veille (boucle sur les thématiques)
  export.js        export Markdown de toute la base
data/db.json       base de connaissances (source de vérité, toutes thématiques)
veille-la-borbolla/   sorties Markdown consultables, organisées par section thématique
veille-shinrin-yoku/  sorties Markdown historiques (avant l'extension multi-thématiques)
```

Inspiré de l'architecture de l'Agent Veille de ren0vate (scraping → analyse Claude →
stockage → email), sans dépendance directe à ce projet.
