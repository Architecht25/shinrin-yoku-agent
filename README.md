# Shinrin-yoku Agent

Agent de veille scientifique pour La Borbolla / Braña Sana (centre bien-être en
Asturies), sur quatre thématiques (`src/themes.js`) :

| Thématique | Chercheurs de référence |
|---|---|
| Bain de forêt / shinrin-yoku | Qing Li, Yoshifumi Miyazaki |
| Repos / sommeil | Matthew Walker, Steven Laureys |
| Sieste & marche | aucun |
| Retour au manuel (mains, artisanat, potager) | aucun |

Les thématiques mindfulness, nutrition/longévité et santé préventive ont été retirées
en novembre 2026. Leurs fiches restent dans `data/db.json` (« archivée » dans les exports).

Ne produit **pas** de contenu marketing : des fiches d'étude et un journal, à relire
avant tout usage éditorial.

## Calendrier

GitHub Actions, chaque **vendredi à 18h05 UTC** (relecture le samedi dans le hub), ou à
la main (`workflow_dispatch`).

## Déroulé d'un run

1. **Collecte** : tous les articles entrés dans PubMed depuis la dernière collecte
   réussie (3 jours de marge, 10 jours au minimum, 90 au maximum), page par page. Au-delà
   de 500 résultats pour une recherche, le run échoue plutôt que de tronquer. PubMed est
   la seule source ; seuls le titre et le résumé sont lus.
2. **Déduplication** sur toute la base : PMID et DOI normalisé (titre à défaut de DOI).
3. **Fiche** par article (Claude, réponse structurée). La réponse est validée (champs,
   liste des types, limites non vides, angle et score cohérents). Réponse invalide ou
   tronquée : une nouvelle tentative, puis fiche « extraction échouée », retentée aux
   runs suivants (3 tentatives au total). Si toutes les extractions de nouveaux articles
   échouent, le run se termine en erreur et rien n'est enregistré.
4. **Vérification** : un second appel compare la fiche au résumé (type, chiffres,
   limites, causalité). Le code retire en plus toute phrase portant un chiffre absent du
   titre et du résumé (arrondis et conversions compris).

   | Résultat | Dans le journal |
   |---|---|
   | confirmé | à la une ou en bref |
   | à corriger, avec correction | en bref seulement |
   | à corriger, sans correction | absente (reste dans les fiches, signalée) |
   | non vérifié (panne du second appel) | en bref seulement |

   La vérification utilise le même modèle dans un contexte séparé : elle réduit les
   erreurs, elle ne remplace pas la relecture.
5. **Journal**, puis contrôle contre les fiches : les phrases non soutenues sont
   supprimées. Si la rédaction ou ce contrôle échoue, le rapport détaillé part à la place.
6. **Enregistrement** de la base, des preuves et de la file des envois.
7. **Envoi** : tous les e-mails d'abord, puis le hub.

## Niveau de preuve

Chaque nouvelle fiche porte quatre notions distinctes :

| Champ | Valeurs |
|---|---|
| `type_etude` | liste ci-dessous |
| `niveau_de_preuve` | essai contrôlé, synthèse d'études, observationnelle, exploratoire, opinion ou revue narrative, indéterminé |
| `confiance_extraction` | vérifié (confirmé sans modification par le second appel), à confirmer |
| `pertinence_centre` | 0 à 5 : utilité du sujet pour le centre, sans lien avec la force de la preuve |

Attribution (`src/niveaux.js`) : un Publication Type explicite s'impose. Sinon
« indéterminé », sauf proposition du modèle appuyée sur un extrait retrouvé mot pour mot
dans le résumé (l'extrait n'est pas enregistré) puis confirmée ou corrigée par le second
appel. Règles de prudence, qui priment sur tout : revue narrative et perspective au plus
« opinion ou revue narrative » ; étude pilote, de faisabilité, qualitative ou de moins de
`SEUIL_PETIT_ECHANTILLON` personnes (30) : « exploratoire » ; aucun verbe causal sur une
étude observationnelle (liste de verbes, imparfaite : la relecture reste nécessaire).

**Journal** : sous `SEUIL_PERTINENCE_CENTRE` (3), une fiche n'entre ni « À la une » ni
« En bref » ; « Rien cette semaine » est un résultat normal. « Opinion ou revue
narrative » et « indéterminé » ne vont à la une qu'avec un avertissement. Les étiquettes
sont toujours lues sur la fiche. Le hub reçoit dans `metadata.etudes`, pour chaque étude
retenue : type, niveau, confiance, pertinence, DOI, PMID.

**Études animales** : exclues par la requête PubMed, puis d'après le titre et le résumé
(`src/etudes-animales.js`) quand ils ne disent rien d'humains.

**Prépublications** : quand PubMed donne le type « Preprint », la mention « Prépublication,
non relue par des pairs » accompagne l'étude dans le journal, les fiches et le tableau de
bord. « Extraction vérifiée » veut dire conforme au résumé, pas relue par des pairs.

**Rétractations** : exclues à la collecte ; chaque run revérifie les fiches des 12
dernières semaines. Un avertissement est ajouté à la fiche, en tête du journal et du
résumé envoyé au hub. Un article déjà livré au hub n'est pas modifié.

Les anciennes fiches restent « non évalué » ; une fiche qui reparaît (rétractation) est
évaluée une seule fois, sans reclassement de ses textes. Après un échec, l'évaluation est
retentée aux runs suivants (3 tentatives au total).

## Types d'étude

revue systématique, méta-analyse, revue de portée, revue narrative, essai contrôlé
randomisé, étude observationnelle, étude pilote, étude qualitative, article théorique ou
perspective, indéterminé.

Un type PubMed explicite (`Publication Types`) est appliqué par le code. Avec « Review »
seul, le modèle précise parmi les revues. Voir `src/types-etude.js`.

Les fiches antérieures gardent leurs anciens types, non reclassés.

## Données

| Fichier | Contenu |
|---|---|
| `data/db.json` | les fiches, avec le résultat de leur vérification |
| `data/abstracts/<année>.json` | par PMID : empreinte SHA-256 du résumé, Publication Types, DOI, et origine de chaque champ (code, modèle, vérification) |
| `data/file-envois.json` | envois en attente ou abandonnés, sans adresses ni secrets |
| `data/etat.json` | date de la dernière collecte |
| `veille-la-borbolla/` | journaux, fiches et tableau de bord du dernier run |

**Le texte des résumés n'est jamais enregistré** (dépôt public, droit d'auteur des
éditeurs). Il sert à la vérification pendant le run. Pour revérifier une fiche, le
redemander à PubMed par son PMID : une empreinte différente signale que le résumé a changé
(ou que le parseur a été modifié). La version exacte vérifiée n'est donc pas conservée.

## Envois et reprises

En CI, la base est commitée et poussée **avant** tout envoi. Si le push échoue, rien ne
part. Un envoi en échec est essayé 3 fois dans le run, puis repris au run suivant
(abandon après 5 runs pour l'e-mail, 8 pour le hub ; l'entrée reste dans la file). Un
échec d'e-mail met le run en erreur ; une panne du hub non, et elle ne bloque pas
l'e-mail. Un envoi réussi peut être répété si le second commit (état des envois) échoue.

Le hub (`POST {HUB_URL}/api/v1/deliveries`, `Authorization: Bearer {HUB_TOKEN}`) reçoit
l'article avec `external_id` = semaine ISO (ex. `2026-W48`). **Un second envoi la même
semaine est un doublon : le hub répond 200 sans mettre l'article à jour.**

Côté hub, l'agent doit exister avec `review_required: true` pour que ses articles
arrivent en brouillon.

## Installation et commandes

```bash
npm install
cp .env.example .env    # clé Anthropic, SMTP, destinataires, hub
npm test                # tests (node:test), sans réseau
npm run veille:essai    # essai à blanc vers tmp/replay/, aucun envoi
npm run veille          # vrai run : préparation puis envoi
npm run export          # toute la base en Markdown
npm run dashboard       # tableau de bord de toute la base
```

`npm run veille:essai` interroge réellement PubMed et Claude (appels facturés), travaille
sur une copie de la base et écrit les e-mails (`.eml`) et les livraisons du hub (`.json`)
dans `tmp/replay/envois/`. `VEILLE_THEMES=manuel` limite les thématiques.

**Attention** : `npm run veille` traite toute la file `data/file-envois.json`, y compris
les envois en attente récupérés de la CI. Un run local ne pousse rien sur GitHub.

Variables : voir `.env.example`. En CI, les tests s'exécutent avant la collecte et
l'envoi.

## Dépôt

`Architecht25/shinrin-yoku-agent` est **public**, comme le tableau de bord GitHub Pages.
Tout ce qui est commité est visible : base, journaux, angles pour le centre, adresses des
destinataires dans le workflow, journaux d'exécution. Ne pas y commiter de résumés ni
d'autres textes d'éditeurs.

## Ajouter ou ajuster une thématique

Une entrée dans `src/themes.js` (id, libellé, requête, chercheurs). Mettre à jour la
description des thématiques dans les consignes (`src/extract.js`, `src/digest.js`) et
`test/themes.test.js`. Toute nouvelle source suit le modèle d'un module isolé dans
`src/sources/` ; pas de scraping de sites sans API officielle.
