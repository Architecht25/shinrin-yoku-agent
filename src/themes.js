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
      '"shinrin-yoku"[Title/Abstract] OR "forest bathing"[Title/Abstract] OR "forest therapy"[Title/Abstract] OR "nature therapy"[Title/Abstract] OR (("therapeutic garden"[Title/Abstract] OR "nature-based intervention"[Title/Abstract] OR "nature-based interventions"[Title/Abstract] OR "green prescription"[Title/Abstract] OR "green space"[Title/Abstract] OR "blue space"[Title/Abstract] OR "green exercise"[Title/Abstract] OR ecotherapy[Title/Abstract]) AND (stress[Title/Abstract] OR "mental health"[Title/Abstract] OR wellbeing[Title/Abstract] OR "well-being"[Title/Abstract] OR depression[Title/Abstract] OR anxiety[Title/Abstract] OR restoration[Title/Abstract]))',
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
    id: 'sieste-marche',
    label: 'Sieste & marche',
    // Repos actif (cf. « Rest », A. Soojung-Kim Pang) : sieste et marche. Requêtes volontairement
    // étroites — « nap » ou « walking » seuls ramènent surtout du bruit (cohortes de sommeil,
    // biomécanique, réadaptation clinique). Pas d'auteur de référence PubMed identifié.
    pubmedQuery:
      '(("daytime nap"[Title/Abstract] OR napping[Title/Abstract] OR "power nap"[Title/Abstract] OR "afternoon nap"[Title/Abstract] OR "midday nap"[Title/Abstract] OR siesta[Title/Abstract]) AND (alertness[Title/Abstract] OR fatigue[Title/Abstract] OR mood[Title/Abstract] OR memory[Title/Abstract] OR wellbeing[Title/Abstract] OR "cognitive performance"[Title/Abstract] OR "work performance"[Title/Abstract])) OR (("walking intervention"[Title/Abstract] OR "walking program"[Title/Abstract] OR "walking programme"[Title/Abstract] OR "nature walk"[Title/Abstract] OR "walking in nature"[Title/Abstract] OR "outdoor walking"[Title/Abstract] OR "mindful walking"[Title/Abstract] OR "walking meeting"[Title/Abstract] OR "walking group"[Title/Abstract] OR "walking and creativity"[Title/Abstract]) AND (stress[Title/Abstract] OR "mental health"[Title/Abstract] OR mood[Title/Abstract] OR wellbeing[Title/Abstract] OR "well-being"[Title/Abstract] OR creativity[Title/Abstract] OR depression[Title/Abstract]))',
    referenceAuthors: [],
  },
  {
    id: 'manuel',
    label: 'Retour au manuel (mains, artisanat, potager)',
    // Retour à l'usage des mains — artisanat, potager, bricolage… — pour s'occuper, occuper
    // l'esprit et développer de nouvelles compétences (enjeu à l'ère de l'IA). Les termes
    // trop génériques (« crafting », « hands-on », « ceramics », « stress ») sont exclus :
    // ils ramènent du job crafting, de la pédagogie ou de la science des matériaux.
    pubmedQuery:
      '("craft therapy"[Title/Abstract] OR "handicraft"[Title/Abstract] OR "handicrafts"[Title/Abstract] OR "knitting"[Title/Abstract] OR "woodworking"[Title/Abstract] OR "pottery"[Title/Abstract] OR "ceramic making"[Title/Abstract] OR "clay work"[Title/Abstract] OR "arts and crafts"[Title/Abstract] OR "craft activities"[Title/Abstract] OR "craft-based"[Title/Abstract] OR "vegetable garden"[Title/Abstract] OR "vegetable gardening"[Title/Abstract] OR "gardening"[Title/Abstract] OR "community garden"[Title/Abstract] OR "allotment"[Title/Abstract] OR "horticultural therapy"[Title/Abstract] OR "therapeutic horticulture"[Title/Abstract] OR "making and crafting"[Title/Abstract] OR "manual skills"[Title/Abstract] OR "handwork"[Title/Abstract] OR "working with hands"[Title/Abstract] OR "manual activity"[Title/Abstract] OR "manual activities"[Title/Abstract]) AND ("wellbeing"[Title/Abstract] OR "well-being"[Title/Abstract] OR "mental health"[Title/Abstract] OR "psychological stress"[Title/Abstract] OR "perceived stress"[Title/Abstract] OR "skill acquisition"[Title/Abstract] OR "skill learning"[Title/Abstract] OR "learning new skills"[Title/Abstract] OR "cognitive function"[Title/Abstract] OR "creativity"[Title/Abstract] OR "sense of purpose"[Title/Abstract] OR "self-efficacy"[Title/Abstract] OR "meaningful activity"[Title/Abstract] OR "depression"[Title/Abstract] OR "anxiety"[Title/Abstract] OR "loneliness"[Title/Abstract]) NOT ("job crafting"[Title/Abstract] OR curriculum[Title/Abstract] OR surgical[Title/Abstract] OR dental[Title/Abstract])',
    referenceAuthors: [],
  },
];
