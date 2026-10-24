// Pure tournament rules, shared by the viewer, local workbench and Node tests.
export const ROUND_NAMES = ['Quarterfinals', 'Semifinals', 'Championship'];
export const SCORE_STATUSES = ['not-started', 'in-progress', 'awaiting-confirmation', 'final'];
export const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pairKey = (a, b) => [a, b].sort().join('|');

export function validateConfig(config) {
  if (!Number.isInteger(config.season) || config.season < 2000 || config.season > 2200) fail('Enter a valid season.');
  if (!Number.isInteger(config.quarterfinalWeek) || config.quarterfinalWeek < 2 || config.quarterfinalWeek > 16) fail('The opening week must be between 2 and 16.');
  if (!['points-through-week-7', 'commissioner'].includes(config.tiebreaker)) fail('Unknown tiebreaker setting.');
  if (!config.name?.trim() || !config.tournamentName?.trim()) fail('League and tournament names are required.');
  if (config.teams.length !== 8 || new Set(config.teams.map(t => t.id)).size !== 8) fail('Exactly eight unique team IDs are required.');
  for (const t of config.teams) if (!/^[a-z0-9-]+$/.test(t.id) || !t.name?.trim()) fail('Each team needs a stable ID and name.');
  for (const week of [config.quarterfinalWeek - 1, config.quarterfinalWeek]) {
    const games = config.schedule.filter(g => g.week === week);
    const ids = games.flatMap(g => [g.teamA, g.teamB]);
    if (games.length !== 4 || new Set(ids).size !== 8 || ids.some(id => !config.teams.some(t => t.id === id))) fail(`Week ${week} needs four regular-season games covering all eight teams exactly once.`);
  }
}

export function prohibitedPairs(config) {
  return new Set(config.schedule.filter(g => [config.quarterfinalWeek - 1, config.quarterfinalWeek].includes(g.week)).map(g => pairKey(g.teamA, g.teamB)));
}

// Enumerate each unordered complete matching ONCE. Choosing uniformly from this
// list avoids the bias introduced by sequential opponent selection/retries.
export function enumerateDraws(config) {
  validateConfig(config);
  const forbidden = prohibitedPairs(config);
  function visit(ids) {
    if (!ids.length) return [[]];
    const [first, ...rest] = ids;
    return rest.flatMap((other, i) => forbidden.has(pairKey(first, other)) ? [] :
      visit(rest.filter((_, j) => i !== j)).map(tail => [[first, other], ...tail]));
  }
  return visit(config.teams.map(t => t.id));
}

export function randomInt(limit, fill = a => globalThis.crypto.getRandomValues(a)) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2 ** 32) fail('Invalid random selection range.');
  const ceiling = Math.floor(2 ** 32 / limit) * limit;
  const word = new Uint32Array(1);
  do { fill(word); } while (word[0] >= ceiling);
  return word[0] % limit;
}

export function generateDraw(config, choose = randomInt) {
  const draws = enumerateDraws(config);
  if (!draws.length) fail('No valid opening-round draw exists for these restrictions.');
  const pairs = clone(draws[choose(draws.length)]);
  // Randomize slots and orientation too: fixed semifinal paths are fair.
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = choose(i + 1);
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map(p => choose(2) ? p.reverse() : p);
}

export function validateDraw(pairs, config) {
  if (!Array.isArray(pairs) || pairs.length !== 4 || pairs.some(p => !Array.isArray(p) || p.length !== 2)) fail('A draw needs four pairs.');
  const ids = pairs.flat();
  if (new Set(ids).size !== 8 || ids.some(id => !config.teams.some(t => t.id === id))) fail('Every team must appear exactly once.');
  if (pairs.some(([a, b]) => prohibitedPairs(config).has(pairKey(a, b)))) fail('This draw contains a prohibited regular-season rematch.');
}

export function initialState(config) {
  validateConfig(config);
  return {
    version: 1, season: config.season, config: clone(config), preview: null,
    locked: false, lockedAt: null, started: false, matches: [], scores: [],
    pointsThrough7: Object.fromEntries(config.teams.map(t => [t.id, null])),
    updatedAt: null, revision: 0, audit: []
  };
}

function changed(state, action) {
  state.updatedAt = new Date().toISOString();
  state.revision++;
  state.audit.push({ at: state.updatedAt, action });
  state.audit = state.audit.slice(-100);
  return state;
}

export function previewDraw(state, pairs) {
  if (state.locked || state.started) fail('The draw is locked. Use the explicit tournament reset to change it.');
  validateDraw(pairs, state.config);
  const next = clone(state);
  next.preview = clone(pairs);
  return changed(next, 'Generated an unlocked draw preview');
}

function newMatch(round, index, teamIds = [null, null]) {
  return { id: `r${round + 1}-${index + 1}`, round, index, teamIds, winner: null, finalizedAt: null, resolution: null };
}

export function lockDraw(state) {
  if (state.locked || state.started) fail('The draw is already locked.');
  validateDraw(state.preview, state.config);
  const next = clone(state);
  next.locked = true;
  next.lockedAt = new Date().toISOString();
  next.matches = [
    ...next.preview.map((pair, i) => newMatch(0, i, clone(pair))),
    newMatch(1, 0), newMatch(1, 1), newMatch(2, 0)
  ];
  return changed(next, 'Approved and locked the draw and all advancement paths');
}

export function scoreFor(state, teamId, week) {
  return state.scores.find(s => s.teamId === teamId && s.week === week) ?? null;
}

export function validScore(value, label = 'Score') {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) fail(`${label} must be a number between -1000 and 1000 with at most two decimals.`);
  return value; // Negative fantasy scores are legitimate.
}

export function saveScores(state, round, entries) {
  if (!state.locked) fail('Approve and lock the draw before entering scores.');
  const games = state.matches.filter(m => m.round === round);
  if (games.length !== [4, 2, 1][round] || games.some(m => m.teamIds.includes(null))) fail('Finalize the previous round before scoring this round.');
  if (games.some(m => m.finalizedAt)) fail('Reopen this round before correcting finalized scores.');
  const ids = games.flatMap(m => m.teamIds);
  if (entries.length !== ids.length || new Set(entries.map(e => e.teamId)).size !== ids.length || entries.some(e => !ids.includes(e.teamId))) fail('Provide one score record for each team in this round.');
  const next = clone(state);
  const week = state.config.quarterfinalWeek + round;
  const normalized = entries.map(e => {
    if (!SCORE_STATUSES.includes(e.status) || e.status === 'final') fail('Scores require commissioner confirmation before becoming final.');
    if (e.status !== 'not-started' && e.actual === null) fail('An active or completed score cannot be blank.');
    if (e.status === 'not-started' && (e.actual !== null || e.projected !== null)) fail('Use an active status when entering a score.');
    if (e.actual !== null) validScore(e.actual);
    if (e.projected !== null) validScore(e.projected, 'Projection');
    return { ...e, week, season: next.season, source: 'manual-local', updatedAt: new Date().toISOString() };
  });
  next.scores = next.scores.filter(s => s.week !== week).concat(normalized);
  next.started = next.started || normalized.some(e => e.status !== 'not-started');
  return changed(next, `Saved Week ${week} scores; no teams advanced`);
}

export function savePointsThrough7(state, totals) {
  if (state.matches.some(m => m.finalizedAt)) fail('Reopen finalized rounds before changing tiebreaker totals.');
  const next = clone(state);
  for (const team of state.config.teams) {
    const value = totals[team.id];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 10000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)) fail('Week 7 cumulative points must be blank or a number with at most two decimals between -10000 and 10000.');
    next.pointsThrough7[team.id] = value;
  }
  return changed(next, 'Updated regular-season points through Week 7');
}

export function decideWinner(state, match, override = null) {
  const week = state.config.quarterfinalWeek + match.round;
  const [a, b] = match.teamIds.map(id => scoreFor(state, id, week));
  if (!a || !b || a.actual === null || b.actual === null) fail(`Both scores are required for ${match.id}.`);
  if (a.actual !== b.actual) {
    if (override) fail('A manual tiebreaker cannot override unequal scores.');
    return { winner: a.actual > b.actual ? a.teamId : b.teamId, resolution: 'score' };
  }
  const [pa, pb] = match.teamIds.map(id => state.pointsThrough7[id]);
  if (state.config.tiebreaker === 'points-through-week-7' && pa !== null && pb !== null && pa !== pb) {
    if (override) fail('The primary tiebreaker already determines this winner.');
    return { winner: pa > pb ? a.teamId : b.teamId, resolution: 'points-through-week-7' };
  }
  if (!match.teamIds.includes(override)) fail(`Resolve the tied matchup ${match.id}: enter both Week 7 totals or select a commissioner tiebreaker winner.`);
  return { winner: override, resolution: 'commissioner' };
}

export function finalizeRound(state, round, overrides = {}) {
  if (!state.locked) fail('Lock the draw first.');
  const next = clone(state);
  const games = next.matches.filter(m => m.round === round);
  if (games.length !== [4, 2, 1][round] || games.some(m => m.teamIds.includes(null))) fail('The previous round must be finalized first.');
  if (games.some(m => m.finalizedAt)) fail('This round is already final. Reopen it to make corrections.');
  for (const m of games) {
    const scores = m.teamIds.map(id => scoreFor(next, id, next.config.quarterfinalWeek + round));
    if (scores.some(s => !s || s.status !== 'awaiting-confirmation')) fail('Set every score in this round to Awaiting confirmation before finalizing.');
    const decision = decideWinner(next, m, overrides[m.id]);
    Object.assign(m, decision, { finalizedAt: new Date().toISOString() });
    for (const s of scores) s.status = 'final';
    if (round < 2) next.matches.find(g => g.round === round + 1 && g.index === Math.floor(m.index / 2)).teamIds[m.index % 2] = m.winner;
  }
  next.started = true;
  return changed(next, `Confirmed Week ${next.config.quarterfinalWeek + round} results and advanced winners`);
}

export function reopenRound(state, round, confirmation) {
  if (confirmation !== 'REOPEN') fail('Type REOPEN to confirm invalidating this round and all later results.');
  if (!state.matches.some(m => m.round === round && m.finalizedAt)) fail('This round has no finalized results to reopen.');
  const next = clone(state);
  for (const m of next.matches.filter(m => m.round >= round)) {
    m.winner = null; m.finalizedAt = null; m.resolution = null;
    if (m.round > round) m.teamIds = [null, null];
  }
  const week = next.config.quarterfinalWeek + round;
  next.scores = next.scores.filter(s => s.week <= week).map(s => s.week === week ? { ...s, status: 'awaiting-confirmation' } : s);
  return changed(next, `Reopened Week ${week}; cleared ALL later participants, scores and results`);
}

export function resetTournament(state, confirmation, config = state.config) {
  if (confirmation !== `RESET ${state.season}`) fail(`Type RESET ${state.season} to confirm clearing this tournament.`);
  const next = initialState(config);
  next.revision = state.revision; // A reset must still invalidate stale tabs.
  return changed(next, `Explicitly reset tournament; previous season was ${state.season}`);
}

export function matchStatus(state, match) {
  if (match.finalizedAt) return 'final';
  const scores = match.teamIds.map(id => scoreFor(state, id, state.config.quarterfinalWeek + match.round));
  if (scores.every(s => s?.status === 'awaiting-confirmation')) return 'awaiting-confirmation';
  if (scores.some(s => s && s.status !== 'not-started')) return 'in-progress';
  return 'not-started';
}

export function tournamentRecord(state, id) {
  const games = state.matches.filter(m => m.finalizedAt && m.teamIds.includes(id));
  return { wins: games.filter(m => m.winner === id).length, losses: games.filter(m => m.winner !== id).length };
}

// Validate persisted/imported data against the same transition rules used by UI.
// Corrupt data is rejected, never silently replaced or used to advance teams.
export function validateState(state) {
  if (!state || state.version !== 1) fail('Unsupported or damaged tournament data.');
  validateConfig(state.config);
  if (state.season !== state.config.season) fail('Tournament season does not match its configuration.');
  if (!Number.isInteger(state.revision) || state.revision < 0 || !Array.isArray(state.audit)) fail('Invalid saved-state metadata.');
  if (typeof state.started !== 'boolean' || typeof state.locked !== 'boolean' || !Array.isArray(state.matches) || !Array.isArray(state.scores)) fail('Invalid tournament state.');
  if (state.preview !== null) validateDraw(state.preview, state.config);
  if (!state.locked && (state.matches.length || state.scores.length || state.started || state.lockedAt)) fail('Unlocked data contains tournament results.');
  if (state.locked && (!state.lockedAt || state.matches.length !== 7)) fail('The locked bracket is incomplete.');
  const ids = state.config.teams.map(t => t.id);
  if (!state.pointsThrough7 || Object.keys(state.pointsThrough7).length !== 8 || ids.some(id => !(id in state.pointsThrough7))) fail('Missing Week 7 totals.');
  // Reuse numeric validation without mutating the source.
  savePointsThrough7({ ...state, matches: [] }, state.pointsThrough7);
  const keys = new Set();
  for (const s of state.scores) {
    const key = `${s.week}:${s.teamId}`;
    if (keys.has(key)) fail('Duplicate score records detected.');
    keys.add(key);
    if (!ids.includes(s.teamId) || s.season !== state.season || ![0, 1, 2].includes(s.week - state.config.quarterfinalWeek) || !SCORE_STATUSES.includes(s.status)) fail('Invalid score record.');
    if (s.actual !== null) validScore(s.actual);
    if (s.projected !== null) validScore(s.projected);
    if (s.status !== 'not-started' && s.actual === null) fail('An active score is missing.');
    if (s.status === 'not-started' && (s.actual !== null || s.projected !== null)) fail('Unstarted scores must be blank.');
  }
  if (state.locked) {
    validateDraw(state.matches.slice(0, 4).map(m => m.teamIds), state.config);
    if (!same(state.preview, state.matches.slice(0, 4).map(m => m.teamIds))) fail('The locked draw differs from its approved preview.');
    const expected = [newMatch(0, 0), newMatch(0, 1), newMatch(0, 2), newMatch(0, 3), newMatch(1, 0), newMatch(1, 1), newMatch(2, 0)];
    state.matches.forEach((m, i) => {
      if (m.id !== expected[i].id || m.round !== expected[i].round || m.index !== expected[i].index || !Array.isArray(m.teamIds) || m.teamIds.length !== 2) fail('Invalid bracket structure.');
      if (m.round > 0) {
        const feeders = state.matches.filter(f => f.round === m.round - 1 && Math.floor(f.index / 2) === m.index);
        if (!same(m.teamIds, feeders.map(f => f.winner))) fail('Advancement does not match confirmed winners.');
      }
      const scores = m.teamIds.map(id => scoreFor(state, id, state.config.quarterfinalWeek + m.round));
      if (m.finalizedAt) {
        if (m.teamIds.includes(null) || scores.some(s => s?.status !== 'final')) fail('Final result is missing participants or confirmed scores.');
        const decision = decideWinner(state, m, m.resolution === 'commissioner' ? m.winner : null);
        if (m.winner !== decision.winner || m.resolution !== decision.resolution) fail('Final winner does not match the scores and tiebreaker.');
      } else if (m.winner !== null || m.resolution !== null || scores.some(s => s?.status === 'final')) fail('Unconfirmed match contains a final result.');
    });
    for (let r = 0; r < 3; r++) {
      const games = state.matches.filter(m => m.round === r);
      if (games.some(m => m.finalizedAt) && games.some(m => !m.finalizedAt)) fail('A round must be confirmed as a whole.');
      const scores = state.scores.filter(s => s.week === state.config.quarterfinalWeek + r);
      const participants = games.flatMap(m => m.teamIds);
      if (scores.length && (participants.includes(null) || scores.length !== participants.length || scores.some(s => !participants.includes(s.teamId)))) fail('Scores do not match this round’s participants.');
    }
    if (!state.started && (state.scores.some(s => s.status !== 'not-started') || state.matches.some(m => m.finalizedAt))) fail('Tournament activity is missing its start marker.');
  }
  return state;
}
