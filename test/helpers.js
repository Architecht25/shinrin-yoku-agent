/** Aides de test (aucun test ici). */
export function ficheModele(over = {}) {
  return {
    titre: 'Étude simulée',
    auteurs: 'Dupont J et al.',
    date: '2026 Nov',
    doi_ou_lien: '10.1/x',
    type_etude: 'revue narrative',
    mecanisme_evalue: 'humeur',
    resultat_principal: 'Association observée.',
    niveau_de_preuve_et_limites: 'Non précisé dans le résumé.',
    angle_brana_sana: '',
    pertinence_brana_sana: 0,
    ...over,
  };
}

export function articleFactice(over = {}) {
  return {
    pmid: '111',
    title: 'A simulated study',
    abstract: 'Twelve participants walked for 30 minutes.',
    journal: 'J Test',
    date: '2026 Nov',
    authors: ['Dupont Jean'],
    doi: '10.1/x',
    publicationTypes: ['Journal Article'],
    url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
    source: 'PubMed',
    thematiqueId: 'sommeil',
    thematiqueLabel: 'Repos / sommeil',
    _runDate: '2026-11-27',
    ...over,
  };
}

export const reponseOutil = (input, stop_reason = 'tool_use') => ({
  stop_reason,
  content: [{ type: 'tool_use', input }],
});

/** Client Anthropic simulé : sert les réponses dans l'ordre et garde les requêtes. */
export function clientSimule(...reponses) {
  const appels = [];
  return {
    appels,
    messages: {
      async create(requete) {
        appels.push(requete);
        const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}
