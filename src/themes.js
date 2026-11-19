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
      '"sleep science"[Title/Abstract] OR "restorative rest"[Title/Abstract] OR ("circadian rhythm"[Title/Abstract] AND (sleep[Title/Abstract] OR "light exposure"[Title/Abstract] OR chronotype[Title/Abstract])) OR "sleep hygiene"[Title/Abstract] OR "rest deprivation"[Title/Abstract] OR "types of rest"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Matthew Walker', pubmedAuthorTerm: '"Walker Matthew P"[Author]' },
      { nom: 'Steven Laureys', pubmedAuthorTerm: '"Laureys Steven"[Author]' },
    ],
  },
  {
    id: 'manuel',
    label: 'Retour au manuel',
    pubmedQuery:
      '("craft therapy"[Title/Abstract] OR handicraft[Title/Abstract] OR gardening[Title/Abstract] OR "horticultural therapy"[Title/Abstract] OR woodworking[Title/Abstract] OR "manual work"[Title/Abstract] OR "creative activities"[Title/Abstract] OR "arts and crafts"[Title/Abstract]) AND (wellbeing[Title/Abstract] OR "well-being"[Title/Abstract] OR "mental health"[Title/Abstract] OR stress[Title/Abstract])',
    // Pas d'auteur académique unique de référence identifié à ce stade — filtre par
    // mots-clés uniquement. Ajouter un chercheur ici dès qu'il émerge de la veille.
    referenceAuthors: [],
  },
  {
    id: 'mindfulness',
    label: 'Mindfulness & performance mentale',
    pubmedQuery:
      '"mindfulness meditation"[Title/Abstract] OR "mindfulness-based"[Title/Abstract] OR "cognitive performance meditation"[Title/Abstract] OR "MBSR"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Jon Kabat-Zinn', pubmedAuthorTerm: '"Kabat-Zinn Jon"[Author]' },
      { nom: 'Amishi Jha', pubmedAuthorTerm: '"Jha Amishi P"[Author]' },
    ],
  },
  {
    id: 'nutrition-longevite',
    label: 'Nutrition & science de la longévité',
    pubmedQuery:
      '"longevity science"[Title/Abstract] OR "healthspan"[Title/Abstract] OR "caloric restriction"[Title/Abstract] OR "nutrition longevity"[Title/Abstract] OR "time-restricted eating"[Title/Abstract]',
    referenceAuthors: [
      { nom: 'Valter Longo', pubmedAuthorTerm: '"Longo Valter D"[Author]' },
      { nom: 'David Sinclair', pubmedAuthorTerm: '"Sinclair David A"[Author]' },
    ],
  },
  {
    id: 'prevention-personnalisee',
    label: 'Santé préventive & médecine personnalisée',
    pubmedQuery:
      '("preventive medicine"[Title/Abstract] AND (lifestyle[Title/Abstract] OR "health promotion"[Title/Abstract] OR wellness[Title/Abstract])) OR ("personalized medicine"[Title/Abstract] AND lifestyle[Title/Abstract]) OR "precision health"[Title/Abstract]',
    referenceAuthors: [{ nom: 'Eric Topol', pubmedAuthorTerm: '"Topol Eric J"[Author]' }],
  },
  {
    id: 'sieste-marche',
    label: 'Sieste & marche',
    // Repos actif (cf. « Rest », A. Soojung-Kim Pang) : sieste et marche. Requêtes volontairement
    // étroites — « nap » ou « walking » seuls ramènent surtout du bruit (cohortes de sommeil,
    // biomécanique, réadaptation clinique). Pas d'auteur de référence PubMed identifié.
    pubmedQuery:
      '(("daytime nap"[Title/Abstract] OR napping[Title/Abstract] OR "power nap"[Title/Abstract] OR "afternoon nap"[Title/Abstract] OR "midday nap"[Title/Abstract] OR siesta[Title/Abstract]) AND (alertness[Title/Abstract] OR fatigue[Title/Abstract] OR mood[Title/Abstract] OR memory[Title/Abstract] OR wellbeing[Title/Abstract] OR "cognitive performance"[Title/Abstract] OR "work performance"[Title/Abstract])) OR (("walking intervention"[Title/Abstract] OR "walking program"[Title/Abstract] OR "walking programme"[Title/Abstract] OR "nature walk"[Title/Abstract] OR "walking in nature"[Title/Abstract] OR "outdoor walking"[Title/Abstract] OR "mindful walking"[Title/Abstract] OR "walking meeting"[Title/Abstract] OR "walking group"[Title/Abstract] OR "walking and creativity"[Title/Abstract]) AND (stress[Title/Abstract] OR "mental health"[Title/Abstract] OR mood[Title/Abstract] OR wellbeing[Title/Abstract] OR "well-being"[Title/Abstract] OR creativity[Title/Abstract] OR depression[Title/Abstract]))',
    referenceAuthors: [],
  },
];
