/** Emplacements des données et des sorties, relatifs à une racine (le dépôt, ou tmp/replay/). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RACINE_REPLAY = path.join(RACINE, 'tmp', 'replay');

export function chemins(racine = RACINE) {
  return {
    db: path.join(racine, 'data', 'db.json'),
    preuves: path.join(racine, 'data', 'abstracts'),
    file: path.join(racine, 'data', 'file-envois.json'),
    etat: path.join(racine, 'data', 'etat.json'),
    sorties: path.join(racine, 'veille-la-borbolla'),
  };
}
