import test from 'node:test';
import assert from 'node:assert/strict';
import { league } from '../config/league.js';
import { exampleState } from '../src/demo.js';
import { initialState, enumerateDraws, generateDraw, validateDraw, validateConfig, prohibitedPairs, randomInt, previewDraw, lockDraw, saveScores, savePointsThrough7, scoreFor, finalizeRound, reopenRound, resetTournament, tournamentRecord, matchStatus, validateState } from '../src/tournament.js';

const pairs = [['donna', 'power'], ['pollo', 'sledge'], ['sassy', 'watt'], ['tommy', 'panthers']];
const fresh = () => initialState(league);
const locked = () => lockDraw(previewDraw(fresh(), pairs));
const entries = (state, round, status = 'awaiting-confirmation', values = null) => state.matches.filter(m => m.round === round).flatMap(m => m.teamIds).map((teamId, i) => ({ teamId, actual: values?.[i] ?? 90 + i, projected: null, status }));
const completed = () => {
  let s = locked();
  for (let r = 0; r < 3; r++) s = finalizeRound(saveScores(s, r, entries(s, r)), r);
  return s;
};
const canonical = draw => draw.map(p => [...p].sort().join('|')).sort().join(';');

test('actual Week 7 and Week 8 restrictions produce 31 distinct valid complete draws', () => {
  const draws = enumerateDraws(league);
  assert.equal(draws.length, 31);
  assert.equal(new Set(draws.map(canonical)).size, draws.length);
  draws.forEach(draw => assert.doesNotThrow(() => validateDraw(draw, league)));
  assert.equal(prohibitedPairs(league).size, 8);
});

test('independent exhaustive permutation oracle finds exactly the same legal draws', () => {
  const forbidden = new Set(league.schedule.map(g => [g.teamA, g.teamB].sort().join('|')));
  const found = new Set();
  function permute(prefix, rest) {
    if (!rest.length) {
      const draw = Array.from({ length: 4 }, (_, i) => prefix.slice(i * 2, i * 2 + 2));
      if (draw.every(pair => !forbidden.has([...pair].sort().join('|')))) found.add(canonical(draw));
      return;
    }
    rest.forEach((id, i) => permute([...prefix, id], rest.filter((_, j) => j !== i)));
  }
  permute([], league.teams.map(t => t.id));
  assert.deepEqual(new Set(enumerateDraws(league).map(canonical)), found);
});

test('each legal complete matching is selected by exactly one uniform index', () => {
  const all = enumerateDraws(league);
  const selected = new Set();
  for (let i = 0; i < all.length; i++) {
    let first = true;
    const draw = generateDraw(league, limit => { if (first) { first = false; assert.equal(limit, all.length); return i; } return 0; });
    assert.equal(canonical(draw), canonical(all[i])); selected.add(canonical(draw));
  }
  assert.equal(selected.size, all.length);
});

test('random source rejects overflow tail instead of introducing modulo bias', () => {
  let calls = 0;
  assert.equal(randomInt(31, a => { a[0] = calls++ ? 30 : 0xffffffff; }), 30);
  assert.equal(calls, 2);
  assert.equal(randomInt(1, a => { a[0] = 0xffffffff; }), 0);
});

test('generated draws always cover all teams and avoid every actual restriction', () => {
  for (let i = 0; i < 200; i++) validateDraw(generateDraw(league), league);
});

test('duplicate teams and prohibited pairings are rejected', () => {
  assert.throws(() => validateDraw([pairs[0], pairs[0], pairs[2], pairs[3]], league), /exactly once/);
  assert.throws(() => validateDraw([['pollo', 'donna'], ['sassy', 'power'], ['sledge', 'panthers'], ['tommy', 'watt']], league), /prohibited/);
  assert.throws(() => validateConfig({ ...league, teams: league.teams.slice(1) }), /eight/);
});

test('configuration requires real complete schedules for the restricted weeks', () => {
  assert.throws(() => validateConfig({ ...league, schedule: league.schedule.slice(1) }), /four regular-season/);
});

test('new tournament has no automatic draw approval or scores', () => {
  const state = fresh();
  assert.equal(state.preview, null); assert.equal(state.locked, false); assert.deepEqual(state.scores, []); assert.deepEqual(state.matches, []);
  assert.ok(Object.values(state.pointsThrough7).every(v => v === null));
});

test('preview is reversible; approval locks all seven fixed match positions', () => {
  const original = fresh(); const preview = previewDraw(original, pairs); const state = lockDraw(preview);
  assert.equal(original.preview, null); assert.equal(preview.locked, false); assert.equal(state.matches.length, 7);
  assert.throws(() => previewDraw(state, generateDraw(league)), /locked/);
  assert.throws(() => lockDraw(state), /already/);
  assert.doesNotThrow(() => validateState(JSON.parse(JSON.stringify(state))));
});

test('score entry requires a locked bracket and real participants', () => {
  assert.throws(() => saveScores(fresh(), 0, []), /lock/);
  assert.throws(() => saveScores(locked(), 1, []), /previous round/);
  assert.throws(() => saveScores(locked(), 0, []), /one score/);
});

test('zero and negative scores are valid; duplicate, malformed and missing scores rejected', () => {
  const s = locked(); const e = entries(s, 0); e[0].actual = 0; e[1].actual = -2.04;
  assert.equal(scoreFor(saveScores(s, 0, e), e[1].teamId, 8).actual, -2.04);
  for (const bad of [NaN, Infinity, '12', 12.345, 1001, -1001]) {
    const b = structuredClone(e); b[0].actual = bad;
    assert.throws(() => saveScores(s, 0, b), /must be a number/);
  }
  const missing = structuredClone(e); missing[0].actual = null;
  assert.throws(() => saveScores(s, 0, missing), /cannot be blank/);
  const duplicates = structuredClone(e); duplicates[1].teamId = duplicates[0].teamId;
  assert.throws(() => saveScores(s, 0, duplicates), /one score record/);
});

test('score upsert replaces a week without duplicate records', () => {
  let s = locked(); s = saveScores(s, 0, entries(s, 0));
  s = saveScores(s, 0, entries(s, 0, 'in-progress', [100, 99, 98, 97, 96, 95, 94, 93]));
  assert.equal(s.scores.length, 8); assert.equal(scoreFor(s, 'donna', 8).actual, 100);
});

test('provisional and projected scores never advance teams', () => {
  let s = locked(); const e = entries(s, 0, 'in-progress'); e[0].projected = 999;
  s = saveScores(s, 0, e);
  assert.equal(matchStatus(s, s.matches[0]), 'in-progress');
  assert.equal(s.matches[0].winner, null); assert.deepEqual(s.matches[4].teamIds, [null, null]);
  assert.throws(() => finalizeRound(s, 0), /Awaiting confirmation/);
});

test('manual final status is rejected; finalization is an explicit separate action', () => {
  const s = locked(); assert.throws(() => saveScores(s, 0, entries(s, 0, 'final')), /confirmation/);
  const e = entries(s, 0, 'not-started'); assert.throws(() => saveScores(s, 0, e), /active status/);
});

test('quarterfinals advance four winners along fixed semifinal paths', () => {
  const s = finalizeRound(saveScores(locked(), 0, entries(locked(), 0)), 0);
  assert.deepEqual(s.matches[4].teamIds, ['power', 'sledge']);
  assert.deepEqual(s.matches[5].teamIds, ['watt', 'panthers']);
  assert.equal(matchStatus(s, s.matches[0]), 'final');
  assert.equal(s.matches[6].winner, null); validateState(s);
});

test('a tied score uses higher points through Week 7', () => {
  let s = locked(); s = savePointsThrough7(s, { ...s.pointsThrough7, donna: 850.12, power: 850.11 });
  s = saveScores(s, 0, entries(s, 0, 'awaiting-confirmation', [100, 100, 90, 91, 92, 93, 94, 95]));
  s = finalizeRound(s, 0); assert.equal(s.matches[0].winner, 'donna'); assert.equal(s.matches[0].resolution, 'points-through-week-7'); validateState(s);
});

test('missing or equal primary totals require a commissioner decision', () => {
  for (const totals of [[null, null], [700, 700], [700, null]]) {
    let s = locked(); s = savePointsThrough7(s, { ...s.pointsThrough7, donna: totals[0], power: totals[1] });
    s = saveScores(s, 0, entries(s, 0, 'awaiting-confirmation', [100, 100, 90, 91, 92, 93, 94, 95]));
    assert.throws(() => finalizeRound(s, 0), /Resolve the tied/);
    const next = finalizeRound(s, 0, { 'r1-1': 'power' }); assert.equal(next.matches[0].winner, 'power'); validateState(next);
  }
});

test('configurable commissioner rule ignores higher Week 7 total', () => {
  const cfg = { ...league, tiebreaker: 'commissioner' };
  let s = lockDraw(previewDraw(initialState(cfg), pairs));
  s = savePointsThrough7(s, { ...s.pointsThrough7, donna: 1000, power: 1 });
  s = saveScores(s, 0, entries(s, 0, 'awaiting-confirmation', [100, 100, 90, 91, 92, 93, 94, 95]));
  s = finalizeRound(s, 0, { 'r1-1': 'power' }); assert.equal(s.matches[0].winner, 'power'); validateState(s);
});

test('manual tiebreakers cannot override unequal scores or resolved primary ties', () => {
  let s = saveScores(locked(), 0, entries(locked(), 0));
  assert.throws(() => finalizeRound(s, 0, { 'r1-1': 'donna' }), /unequal/);
  s = savePointsThrough7(locked(), { ...locked().pointsThrough7, donna: 1000, power: 900 });
  s = saveScores(s, 0, entries(s, 0, 'awaiting-confirmation', [100, 100, 90, 91, 92, 93, 94, 95]));
  assert.throws(() => finalizeRound(s, 0, { 'r1-1': 'power' }), /primary tiebreaker/);
});

test('unresolved ties finalize atomically without partial results', () => {
  const s = saveScores(locked(), 0, entries(locked(), 0, 'awaiting-confirmation', [90, 91, 100, 100, 92, 93, 94, 95]));
  assert.throws(() => finalizeRound(s, 0), /Resolve/);
  assert.ok(s.matches.every(m => m.winner === null)); assert.ok(s.scores.every(score => score.status === 'awaiting-confirmation'));
});

test('complete tournament declares a champion with a 3–0 record', () => {
  const s = completed(); assert.equal(s.matches[6].winner, 'panthers');
  assert.deepEqual(tournamentRecord(s, 'panthers'), { wins: 3, losses: 0 });
  assert.equal(s.matches.filter(m => m.finalizedAt).length, 7); validateState(s);
});

test('finalized scores and tiebreaker totals are protected from accidental edits', () => {
  const s = completed(); assert.throws(() => saveScores(s, 0, entries(s, 0)), /Reopen/);
  assert.throws(() => savePointsThrough7(s, s.pointsThrough7), /Reopen/);
  assert.throws(() => finalizeRound(s, 2), /already final/);
});

test('correction clears every later score/result while keeping the locked draw', () => {
  const original = completed(); let s = reopenRound(original, 0, 'REOPEN');
  assert.equal(s.scores.length, 8); assert.ok(s.scores.every(e => e.status === 'awaiting-confirmation'));
  assert.ok(s.matches.every(m => !m.winner)); assert.deepEqual(s.matches[4].teamIds, [null, null]); assert.deepEqual(s.preview, pairs); assert.equal(s.locked, true);
  assert.equal(original.matches[6].winner, 'panthers');
  s = saveScores(s, 0, entries(s, 0, 'awaiting-confirmation', [200, 1, 2, 3, 4, 5, 6, 7])); s = finalizeRound(s, 0);
  assert.equal(s.matches[4].teamIds[0], 'donna'); assert.equal(s.matches[6].winner, null); validateState(s);
});

test('reopening semifinal preserves quarterfinals and clears championship only', () => {
  const s = reopenRound(completed(), 1, 'REOPEN'); assert.equal(s.scores.length, 12);
  assert.ok(s.matches.slice(0, 4).every(m => m.finalizedAt)); assert.deepEqual(s.matches[6].teamIds, [null, null]); validateState(s);
});

test('reopen and reset require exact explicit confirmations', () => {
  assert.throws(() => reopenRound(completed(), 0, 'yes'), /Type REOPEN/);
  assert.throws(() => resetTournament(completed(), 'yes'), /RESET 2026/);
  const s = resetTournament(completed(), 'RESET 2026'); assert.equal(s.locked, false); assert.equal(s.preview, null); assert.deepEqual(s.matches, []); assert.deepEqual(s.scores, []); validateState(s);
});

test('future season reset uses validated new configuration and clears totals', () => {
  const s = resetTournament(completed(), 'RESET 2026', { ...league, season: 2027 });
  assert.equal(s.season, 2027); assert.ok(Object.values(s.pointsThrough7).every(v => v === null)); validateState(s);
});

test('saved JSON survives round-trip with lock and results intact', () => {
  const s = completed(); const restored = validateState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored, s); assert.equal(restored.matches[6].winner, 'panthers');
});

test('corrupt persisted scores, duplicate records and incorrect advancement are rejected', () => {
  let s = completed(); s.scores.push(s.scores[0]); assert.throws(() => validateState(s), /Duplicate/);
  s = completed(); s.matches[4].teamIds.reverse(); assert.throws(() => validateState(s), /Advancement/);
  s = completed(); s.scores[0].actual = 1000; assert.throws(() => validateState(s), /winner/);
  s = completed(); s.preview.reverse(); assert.throws(() => validateState(s), /approved preview/);
  s = completed(); s.matches[6].winner = 'donna'; assert.throws(() => validateState(s), /winner/);
});

test('illustrative fixture contains only provisional scores and no advances', () => {
  const s = exampleState(); validateState(s); assert.ok(s.matches.every(m => !m.winner));
  assert.equal(s.scores.length, 8); assert.ok(s.scores.every(score => score.status === 'in-progress'));
});

test('illustrative fixture adapts to future team identifiers and schedules', () => {
  const mapped = Object.fromEntries(league.teams.map((t, i) => [t.id, `team-${i + 1}`]));
  const cfg = {
    ...league, season: 2027,
    teams: league.teams.map(t => ({ ...t, id: mapped[t.id] })),
    schedule: league.schedule.map(g => ({ ...g, teamA: mapped[g.teamA], teamB: mapped[g.teamB] }))
  };
  const state = exampleState(cfg); validateState(state);
  assert.equal(state.season, 2027); assert.ok(state.scores.every(s => s.teamId.startsWith('team-')));
});
