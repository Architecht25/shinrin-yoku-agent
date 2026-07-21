/**
 * Définition des thématiques de veille scientifique pour La Borbolla / Braña Sana.
 * Chaque thématique porte sa propre requête PubMed (mots-clés en [Title/Abstract],
 * pour éviter l'expansion automatique de termes de PubMed) et, le cas échéant,
 * ses chercheurs de référence (recherche combinée auteur AND mots-clés, pour
 * désambiguïser les noms trop courants pour être utilisés seuls).
 *
 * Ajouter une thématique = ajouter une entrée ici ; le pipeline de récupération/
 * extraction (src/sources/pubmed.js, src/extract.js, src/index.js) est générique
 * et n'a pas besoin d'être dupliqué.
 */
export const THEMES = [
  {
    id: 'shinrin-yoku',
    label: 'Bain de forêt / shinrin-yoku',
    pubmedQuery:
      '"shinrin-yoku"[Title/Abstract] OR "forest bathing"[Title/Abstract] OR "forest therapy"[Title/Abstract] OR "nature therapy"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Qing Li', pubmedAuthorTerm: '"Li Qing"[Author]' },
      { nom: 'Yoshifumi Miyazaki', pubmedAuthorTerm: '"Miyazaki Yoshifumi"[Author]' },
    ],
  },
  {
    id: 'sommeil',
    label: 'Repos / sommeil',
    pubmedQuery:
      '"sleep science"[Title/Abstract] OR "restorative rest"[Title/Abstract] OR "circadian rhythm"[Title/Abstract] OR "sleep hygiene"[Title/Abstract] OR "rest deprivation"[Title/Abstract] OR "types of rest"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Matthew Walker', pubmedAuthorTerm: '"Walker Matthew P"[Author]' },
      { nom: 'Steven Laureys', pubmedAuthorTerm: '"Laureys Steven"[Author]' },
    ],
  },
  {
    id: 'manuel',
    label: 'Retour au manuel',
    pubmedQuery:
      '"manual labor mental health"[Title/Abstract] OR "craft therapy"[Title/Abstract] OR "occupational therapy fine motor"[Title/Abstract] OR "handwork wellbeing"[Title/Abstract] OR "embodied cognition hands"[Title/Abstract] OR "digital detox manual activity"[Title/Abstract]',
    // Pas d'auteur académique unique de référence identifié à ce stade — filtre par
    // mots-clés uniquement. Ajouter un chercheur ici dès qu'il émerge de la veille.
    referenceAuthors: [],
  },
  {
    id: 'mindfulness',
    label: 'Mindfulness & performance mentale',
    pubmedQuery:
      '"mindfulness meditation"[Title/Abstract] OR "attention training"[Title/Abstract] OR "cognitive performance meditation"[Title/Abstract] OR "MBSR"[Title/Abstract] OR "focused attention"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Jon Kabat-Zinn', pubmedAuthorTerm: '"Kabat-Zinn Jon"[Author]' },
      { nom: 'Amishi Jha', pubmedAuthorTerm: '"Jha Amishi P"[Author]' },
    ],
  },
  {
    id: 'nutrition-longevite',
    label: 'Nutrition & science de la longévité',
    pubmedQuery:
      '"longevity science"[Title/Abstract] OR "healthspan"[Title/Abstract] OR "caloric restriction"[Title/Abstract] OR "nutrition longevity"[Title/Abstract] OR "aging biology"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Valter Longo', pubmedAuthorTerm: '"Longo Valter D"[Author]' },
      { nom: 'David Sinclair', pubmedAuthorTerm: '"Sinclair David A"[Author]' },
    ],
  },
  {
    id: 'prevention-personnalisee',
    label: 'Santé préventive & médecine personnalisée',
    pubmedQuery:
      '"preventive medicine"[Title/Abstract] OR "personalized medicine"[Title/Abstract] OR "precision health"[Title/Abstract] OR "biomarkers early detection"[Title/Abstract]',
    referenceAuthors: [{ nom: 'Eric Topol', pubmedAuthorTerm: '"Topol Eric J"[Author]' }],
  },
];
