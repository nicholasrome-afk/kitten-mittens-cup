import { league } from '../config/league.js';
import { initialState, enumerateDraws, previewDraw, lockDraw, saveScores } from './tournament.js';

// Illustrative only: not Yahoo data, not an approved draw, never persisted by viewer.
export function exampleState(config = league) {
  // A deterministic illustration, adapted to the configured IDs/restrictions.
  // It is never saved or approved on behalf of the commissioner.
  let state = lockDraw(previewDraw(initialState(config), enumerateDraws(config)[0]));
  const values = [112.84, 98.62, 87.46, 104.28, 121.36, 116.92, 93.70, 109.54];
  state = saveScores(state, 0, state.matches.slice(0, 4).flatMap(m => m.teamIds).map((teamId, i) => ({
    teamId, actual: values[i], projected: +(values[i] + 14 + (i % 3) * 3.4).toFixed(2), status: 'in-progress'
  })));
  return state;
}
