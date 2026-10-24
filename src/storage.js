import { league } from '../config/league.js';
import { initialState, validateState } from './tournament.js';

export const STORAGE_KEY = 'midseason-tournament-v1';
export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState(league);
  try { return validateState(JSON.parse(raw)); }
  catch (error) { throw new Error(`Saved tournament could not be loaded: ${error.message} Your saved data has been preserved. Restore a valid backup from the commissioner workbench.`); }
}
export function persistState(next, expectedRevision) {
  validateState(next);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw && expectedRevision !== 0) throw new Error('Saved data changed or was removed in another tab. Reload before saving.');
  if (raw && validateState(JSON.parse(raw)).revision !== expectedRevision) throw new Error('Another tab changed the tournament. Reload before saving.');
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { throw new Error('Your browser could not save this change. Enable local storage or export a backup; the change has not been applied.'); }
  return next;
}
