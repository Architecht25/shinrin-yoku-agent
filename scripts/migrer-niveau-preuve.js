/**
 * Ajoute niveau_de_preuve = « non évalué » aux fiches qui n'ont pas ce champ, sans rien
 * reclasser. Peut être relancé sans risque.
 */
import { loadStore, saveStore } from '../src/store.js';
import { NIVEAU_NON_EVALUE } from '../src/extract.js';

const store = await loadStore();
let ajoutes = 0;
for (const fiche of store.fiches) {
  if ('niveau_de_preuve' in fiche) continue;
  fiche.niveau_de_preuve = NIVEAU_NON_EVALUE;
  ajoutes += 1;
}
if (ajoutes) await saveStore(store);
console.log(`[migration] ${ajoutes} fiche(s) complétée(s) sur ${store.fiches.length}.`);
