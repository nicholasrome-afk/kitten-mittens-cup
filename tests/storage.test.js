import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { league } from '../config/league.js';
import { initialState, generateDraw, previewDraw, lockDraw, resetTournament } from '../src/tournament.js';
import { STORAGE_KEY, loadState, persistState } from '../src/storage.js';

let data;
beforeEach(() => {
  data = new Map();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
});

test('first load has no approved draw and never saves the illustrative fixture', () => {
  const s = loadState(); assert.equal(s.locked, false); assert.equal(data.size, 0);
});
test('lock persists across repeated loads', () => {
  const initial = loadState();
  const preview = persistState(previewDraw(initial, generateDraw(league)), initial.revision);
  const final = persistState(lockDraw(preview), preview.revision);
  assert.deepEqual(loadState(), final); assert.deepEqual(loadState().preview, preview.preview);
});
test('stale-tab edits cannot replace a newer save', () => {
  const s = initialState(league);
  const first = persistState(previewDraw(s, generateDraw(league)), s.revision);
  assert.throws(() => persistState(previewDraw(s, generateDraw(league)), s.revision), /Another tab/);
  assert.deepEqual(loadState(), first);
});
test('reset maintains increasing revisions and invalidates old tabs', () => {
  let s = initialState(league);
  s = persistState(previewDraw(s, generateDraw(league)), s.revision);
  s = persistState(lockDraw(s), s.revision);
  const next = persistState(resetTournament(s, 'RESET 2026'), s.revision);
  assert.equal(next.revision, s.revision + 1);
  assert.throws(() => persistState(s, s.revision), /Another tab/);
});
test('externally removed storage is not silently overwritten by a stale tab', () => {
  const s = persistState(previewDraw(initialState(league), generateDraw(league)), 0);
  data.clear();
  assert.throws(() => persistState(lockDraw(s), s.revision), /removed/);
});
test('invalid saved data is preserved verbatim for recovery', () => {
  data.set(STORAGE_KEY, '{broken');
  assert.throws(() => loadState(), /preserved/);
  assert.equal(data.get(STORAGE_KEY), '{broken');
});
test('invalid incoming state cannot corrupt the last saved state', () => {
  const s = persistState(previewDraw(initialState(league), generateDraw(league)), 0);
  const corrupt = structuredClone(s); corrupt.preview[0][0] = corrupt.preview[1][0];
  assert.throws(() => persistState(corrupt, s.revision), /exactly once/);
  assert.deepEqual(loadState(), s);
});
test('quota/storage failures are explicit and leave the old saved value intact', () => {
  const s = persistState(previewDraw(initialState(league), generateDraw(league)), 0);
  globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => persistState(lockDraw(s), s.revision), /has not been applied/);
  assert.deepEqual(loadState(), s);
});
