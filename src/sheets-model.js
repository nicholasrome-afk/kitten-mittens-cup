import { clone, initialState, validateConfig, validateState, saveScores, savePointsThrough7, scoreFor } from './tournament.js';

// Column order is shared by the template, Apps Script and regression tests.
export const SHEET_HEADERS = {
  Scores: ['Season', 'Week', 'Team ID', 'Team', 'Actual score', 'Projected score', 'Score status', 'Source', 'Last updated'],
  Bracket: ['Season', 'Round', 'Week', 'Matchup ID', 'Team A ID', 'Team A', 'Team B ID', 'Team B', 'Score A', 'Score B', 'Winner ID', 'Status', 'Finalized at', 'Secondary tie winner ID'],
  Draw: ['Matchup', 'Team A ID', 'Team A', 'Team B ID', 'Team B', 'Approval'],
  Settings: ['Setting', 'Value', 'Help'],
  Teams: ['Team ID', 'Yahoo team ID', 'Yahoo team name', 'Character name', 'Logo URL', 'Team color', 'Initials', 'Points through Week 7'],
  Schedule: ['Week', 'Team A ID', 'Team B ID', 'Matchup type', 'Prohibited opening matchup']
};

const blank = value => value === '' || value === null || value === undefined;
const fail = message => { throw new Error(message); };
export function cellNumber(value, label) {
  if (blank(value)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must contain a number, not text or a formula.`);
  return value;
}

export function settingsRows(config) {
  return [
    ['tournamentName', config.tournamentName, 'Editable before locking the draw.'],
    ['name', config.name, 'Your league name.'],
    ['season', config.season, 'For next season, update this and the actual restricted schedules, then use Reset.'],
    ['quarterfinalWeek', config.quarterfinalWeek, 'Semifinals follow one week later, championship two weeks later.'],
    ['tiebreaker', config.tiebreaker, 'points-through-week-7 or commissioner'],
    ['bracketLocked', false, 'Managed by the Tournament menu.'],
    ['automaticScoringEnabled', false, 'Yahoo integration is not enabled in Phase 2.'],
    ['lastPublishedAt', '', 'Most recent successful publication from this sheet.']
  ];
}

export function configFromRows(settings, teams, schedule, previous) {
  const values = Object.fromEntries(settings.filter(row => row[0]).map(row => [row[0], row[1]]));
  const config = clone(previous);
  for (const key of ['name', 'tournamentName', 'tiebreaker']) config[key] = String(values[key] ?? '').trim();
  config.season = cellNumber(values.season, 'Season');
  config.quarterfinalWeek = cellNumber(values.quarterfinalWeek, 'Quarterfinal week');
  const teamRows = teams.filter(row => row.some(v => !blank(v)));
  if (teamRows.length !== 8 || new Set(teamRows.map(row => row[0])).size !== 8) fail('Teams must contain exactly eight distinct stable team IDs.');
  config.teams = teamRows.map(row => ({
    id: String(row[0]).trim(), yahooTeamId: String(row[1] ?? '').trim(), name: String(row[2] ?? '').trim(),
    characterName: String(row[3] ?? '').trim(), logoUrl: String(row[4] ?? '').trim(),
    color: String(row[5] ?? '').trim(), initials: String(row[6] ?? '').trim()
  }));
  // Preserve the stable team order on ordinary edits, independent of sheet sorting.
  if (config.teams.every(t => previous.teams.some(old => old.id === t.id))) config.teams.sort((a, b) => previous.teams.findIndex(t => t.id === a.id) - previous.teams.findIndex(t => t.id === b.id));
  config.schedule = schedule.filter(row => row.some(v => !blank(v))).map(row => ({
    week: cellNumber(row[0], 'Schedule week'), teamA: String(row[1] ?? '').trim(), teamB: String(row[2] ?? '').trim()
  }));
  validateConfig(config);
  if (config.teams.some(t => t.name.length > 100 || t.characterName.length > 100 || t.logoUrl.length > 1000)) fail('Team names must be at most 100 characters and logo URLs at most 1000.');
  return config;
}

export function applySettingsRows(state, settings, teams, schedule) {
  const config = configFromRows(settings, teams, schedule, state.config);
  if (state.locked && JSON.stringify(config) !== JSON.stringify(state.config)) fail('The draw is locked. Configuration cannot change until an explicit tournament reset.');
  if (!state.locked && (config.season !== state.season || config.quarterfinalWeek !== state.config.quarterfinalWeek)) fail('Use Reset tournament to change the season or opening week.');
  const next = clone(state);
  if (!next.locked) {
    next.config = config;
    next.preview = null; // An input change always requires a fresh, unapproved draw.
  }
  const totals = Object.fromEntries(teams.filter(row => row[0]).map(row => [row[0], cellNumber(row[7], 'Points through Week 7')]));
  if (next.matches.some(m => m.finalizedAt)) {
    if (next.config.teams.some(t => totals[t.id] !== next.pointsThrough7[t.id])) fail('Reopen the quarterfinals before changing Week 7 tiebreaker totals.');
    return next;
  }
  return savePointsThrough7(next, totals);
}

export function scoreRows(state) {
  const participants = state.locked ? state.matches.filter(m => m.teamIds.every(Boolean)).flatMap(m => m.teamIds.map(id => ({ id, week: state.config.quarterfinalWeek + m.round }))) : state.config.teams.map(t => ({ id: t.id, week: state.config.quarterfinalWeek }));
  return participants.map(({ id, week }) => {
    const team = state.config.teams.find(t => t.id === id);
    const score = scoreFor(state, id, week);
    return [state.season, week, id, `${team.characterName || team.name}${team.characterName ? ` (${team.name})` : ''}`, score?.actual ?? '', score?.projected ?? '', score?.status || 'not-started', score?.source || 'manual-sheet', score?.updatedAt || ''];
  });
}

export function activeRound(state) {
  return [0, 1, 2].find(round => state.matches.some(m => m.round === round && !m.finalizedAt));
}

export function pendingTieChoice(state, match, previousRows) {
  if (!state.locked || match.finalizedAt || !match.teamIds.every(Boolean)) return '';
  const row = previousRows.find(row => row[0] === state.season && row[3] === match.id &&
    row[4] === match.teamIds[0] && row[6] === match.teamIds[1] && !row[12]);
  return row && match.teamIds.includes(row[13]) ? row[13] : '';
}

export function scoresFromRows(state, rows) {
  if (!state.locked) fail('Generate, review and lock the draw before entering scores.');
  const round = activeRound(state);
  if (round === undefined) fail('The tournament is complete. Reopen a round before correcting scores.');
  const records = rows.filter(row => row.some(v => !blank(v)));
  const expected = scoreRows(state);
  if (records.length !== expected.length) fail('Do not add or remove score rows. Use Restore sheet views from the Tournament menu.');
  const seen = new Set();
  for (const row of records) {
    const key = `${row[1]}:${row[2]}`;
    if (seen.has(key)) fail('Duplicate season/week/team score records detected.');
    seen.add(key);
    if (row[0] !== state.season || !expected.some(e => e[1] === row[1] && e[2] === row[2])) fail('Score rows contain an unexpected season, week or team ID.');
    if (row[1] !== state.config.quarterfinalWeek + round) {
      const saved = scoreFor(state, row[2], row[1]);
      if (!saved || cellNumber(row[4], 'Actual score') !== saved.actual || cellNumber(row[5], 'Projected score') !== saved.projected || row[6] !== saved.status) fail('A finalized score was edited. Reopen that round explicitly before correcting it.');
    }
  }
  const entries = records.filter(row => row[1] === state.config.quarterfinalWeek + round).map(row => ({
    teamId: String(row[2]), actual: cellNumber(row[4], 'Actual score'), projected: cellNumber(row[5], 'Projected score'), status: String(row[6])
  }));
  const next = saveScores(state, round, entries);
  next.scores.filter(s => s.week === state.config.quarterfinalWeek + round).forEach(s => { s.source = 'manual-sheet'; });
  return next;
}

// Explicit allowlist: credentials, account details, arbitrary tabs and audit notes
// never enter the public feed, even if later added to private state/configuration.
export function publicPayload(state, publishedAt = new Date().toISOString()) {
  validateState(state);
  const cfg = state.config;
  const config = {
    name: cfg.name, tournamentName: cfg.tournamentName, leagueId: cfg.leagueId, leagueUrl: cfg.leagueUrl,
    season: cfg.season, quarterfinalWeek: cfg.quarterfinalWeek, tiebreaker: cfg.tiebreaker,
    teams: cfg.teams.map(t => ({ id: t.id, name: t.name, characterName: t.characterName || '', logoUrl: t.logoUrl || '', color: t.color || '', initials: t.initials || '' })),
    schedule: cfg.schedule.map(g => ({ week: g.week, teamA: g.teamA, teamB: g.teamB }))
  };
  const safe = initialState(config);
  for (const key of ['preview', 'locked', 'lockedAt', 'started', 'pointsThrough7', 'updatedAt', 'revision']) safe[key] = clone(state[key]);
  safe.matches = state.matches.map(m => ({ id: m.id, round: m.round, index: m.index, teamIds: clone(m.teamIds), winner: m.winner, finalizedAt: m.finalizedAt, resolution: m.resolution }));
  safe.scores = state.scores.map(s => ({ season: s.season, week: s.week, teamId: s.teamId, actual: s.actual, projected: s.projected, status: s.status, source: s.source, updatedAt: s.updatedAt }));
  validateState(safe);
  return { schemaVersion: 1, publishedAt, state: safe };
}

export function parsePublicPayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || typeof payload.publishedAt !== 'string' || !Number.isFinite(Date.parse(payload.publishedAt))) fail('The feed did not return a valid published tournament snapshot.');
  validateState(payload.state);
  return payload;
}

export function encodeFeed(payload, callback) {
  if (callback && !/^__tournamentFeed_[a-f0-9]{24}$/.test(callback)) fail('Invalid callback name.');
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return callback ? `${callback}(${json});` : json;
}
