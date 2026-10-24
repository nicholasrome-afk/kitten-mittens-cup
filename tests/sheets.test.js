import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { league } from '../config/league.js';
import { characterForTeam } from '../config/characters.js';
import * as Engine from '../src/tournament.js';
import * as Model from '../src/sheets-model.js';
import { fetchSnapshot, validateFeedUrl, cachedSnapshot, cacheSnapshot } from '../src/feed.js';

function inputs(config = league) {
  return {
    settings: Model.settingsRows(config),
    teams: config.teams.map(t => { const p = characterForTeam(t); return [t.id, t.yahooTeamId || '', t.name, t.characterName || p.characterName, t.logoUrl || p.logoUrl, t.color, p.initials, null]; }),
    schedule: config.schedule.map(g => [g.week, g.teamA, g.teamB, 'regular-season', true])
  };
}
function fresh() {
  const input = inputs();
  const cfg = Model.configFromRows(input.settings, input.teams, input.schedule, league);
  return Model.applySettingsRows(Engine.initialState(cfg), input.settings, input.teams, input.schedule);
}
function locked() { const state = fresh(); return Engine.lockDraw(Engine.previewDraw(state, Engine.enumerateDraws(state.config)[0])); }
function scored(state, round, values) {
  const rows = Model.scoreRows(state);
  let i = 0;
  for (const row of rows) if (row[1] === state.config.quarterfinalWeek + round) { row[4] = values?.[i] ?? 100 + i; row[6] = 'awaiting-confirmation'; i++; }
  return Model.scoresFromRows(state, rows);
}
function completed() {
  let state = locked();
  for (let round = 0; round < 3; round++) state = Engine.finalizeRound(scored(state, round), round);
  return state;
}

test('sheet initialization preserves real schedules and blank scores/totals', () => {
  const state = fresh();
  assert.equal(state.locked, false); assert.equal(state.preview, null);
  assert.ok(Object.values(state.pointsThrough7).every(v => v === null));
  assert.equal(Engine.enumerateDraws(state.config).length, 31);
  assert.equal(Model.scoreRows(state).length, 8);
  assert.ok(Model.scoreRows(state).every(row => row[4] === '' && row[5] === ''));
});
test('sheet inputs use stable IDs even when team rows are sorted', () => {
  const state = fresh(); const input = inputs(state.config); input.teams.reverse();
  const next = Model.applySettingsRows(state, input.settings, input.teams, input.schedule);
  assert.deepEqual(next.config.teams.map(t => t.id), state.config.teams.map(t => t.id));
});
test('sheet config edits invalidate an unlocked preview and cannot alter a locked draw', () => {
  let state = fresh(); state = Engine.previewDraw(state, Engine.enumerateDraws(state.config)[0]);
  const input = inputs(state.config); input.settings[0][1] = 'Kitten Mittens Championship';
  const next = Model.applySettingsRows(state, input.settings, input.teams, input.schedule);
  assert.equal(next.preview, null); assert.equal(next.config.tournamentName, 'Kitten Mittens Championship');
  assert.throws(() => Model.applySettingsRows(locked(), input.settings, input.teams, input.schedule), /locked/);
});
test('year changes require an explicit reset and missing/duplicate teams fail', () => {
  const state = fresh(); const input = inputs(state.config); input.settings[2][1] = 2027;
  assert.throws(() => Model.applySettingsRows(state, input.settings, input.teams, input.schedule), /Reset/);
  input.teams[0][0] = input.teams[1][0];
  assert.throws(() => Model.configFromRows(input.settings, input.teams, input.schedule, state.config), /distinct/);
});
test('manual sheet scoring completes all three rounds with explicit finalization only', () => {
  let state = locked();
  for (let round = 0; round < 3; round++) {
    state = scored(state, round);
    assert.ok(state.matches.filter(m => m.round === round).every(m => m.winner === null));
    assert.ok(state.scores.filter(s => s.week === 8 + round).every(s => s.source === 'manual-sheet'));
    state = Engine.finalizeRound(state, round);
    Engine.validateState(state);
  }
  assert.ok(state.matches[6].winner);
  assert.deepEqual(Engine.tournamentRecord(state, state.matches[6].winner), { wins: 3, losses: 0 });
});
test('sheet score parser distinguishes blank, zero, negative and invalid values', () => {
  const state = locked(); const rows = Model.scoreRows(state);
  rows[0][4] = 0; rows[0][6] = 'in-progress'; rows[1][4] = -1.24; rows[1][6] = 'in-progress';
  const next = Model.scoresFromRows(state, rows);
  assert.equal(next.scores[0].actual, 0); assert.equal(next.scores[1].actual, -1.24); assert.equal(next.scores[2].actual, null);
  rows[0][4] = '123.4'; assert.throws(() => Model.scoresFromRows(state, rows), /number/);
  rows[0][4] = 123.456; assert.throws(() => Model.scoresFromRows(state, rows), /two decimals/);
});
test('duplicate score keys and altered season/team records are rejected', () => {
  const state = locked(); let rows = Model.scoreRows(state); rows[1][2] = rows[0][2];
  assert.throws(() => Model.scoresFromRows(state, rows), /Duplicate/);
  rows = Model.scoreRows(state); rows[0][0] = 2027;
  assert.throws(() => Model.scoresFromRows(state, rows), /unexpected season/);
});
test('finalized sheet scores are protected and reopening clears downstream rows', () => {
  let state = Engine.finalizeRound(scored(locked(), 0), 0);
  let rows = Model.scoreRows(state); rows[0][4] += 10;
  assert.throws(() => Model.scoresFromRows(state, rows), /finalized score/);
  state = completed(); rows = Model.scoreRows(state);
  const reopened = Engine.reopenRound(state, 0, 'REOPEN');
  assert.equal(Model.scoreRows(reopened).length, 8);
  assert.throws(() => Model.scoresFromRows(reopened, rows), /add or remove/);
  assert.equal(reopened.matches[6].winner, null);
});
test('Week 7 totals cannot change after finals without reopening', () => {
  const state = completed(); const input = inputs(state.config); input.teams[0][7] = 999;
  assert.throws(() => Model.applySettingsRows(state, input.settings, input.teams, input.schedule), /Reopen/);
});
test('pending tiebreaker choice survives score saves only for the same unfinished matchup', () => {
  const state = locked(); const match = state.matches[0];
  const row = [state.season, '', 8, match.id, match.teamIds[0], '', match.teamIds[1], '', '', '', '', '', '', match.teamIds[0]];
  assert.equal(Model.pendingTieChoice(scored(state, 0), match, [row]), match.teamIds[0]);
  assert.equal(Model.pendingTieChoice(state, match, [[2027, ...row.slice(1)]]), '');
  const changed = [...row]; changed[6] = 'different';
  assert.equal(Model.pendingTieChoice(state, match, [changed]), '');
  const finalized = [...row]; finalized[12] = new Date().toISOString();
  assert.equal(Model.pendingTieChoice(state, match, [finalized]), '');
  assert.equal(Model.pendingTieChoice(state, { ...match, finalizedAt: new Date().toISOString() }, [row]), '');
  assert.equal(Model.pendingTieChoice(state, match, []), '');
});
test('public feed allowlist strips credentials, Yahoo IDs and private audit fields', () => {
  const state = completed();
  state.config.oauthSecret = 'PRIVATE_SECRET';
  state.config.teams[0].yahooTeamId = 'PRIVATE_TEAM_KEY';
  state.config.teams[0].refreshToken = 'PRIVATE_SECRET';
  state.scores[0].accessToken = 'PRIVATE_SECRET';
  state.audit.push({ at: new Date().toISOString(), action: 'PRIVATE_SECRET' });
  const payload = Model.publicPayload(state);
  assert(!JSON.stringify(payload).includes('PRIVATE_'));
  assert.ok(payload.state.matches[6].winner); assert.equal(payload.state.audit.length, 0);
  Model.parsePublicPayload(payload);
});
test('feed callbacks are constrained and script-sensitive data is escaped', () => {
  const callback = '__tournamentFeed_0123456789abcdef01234567';
  const text = Model.encodeFeed({ value: '</script>\u2028' }, callback);
  assert(!text.includes('</script>')); assert(text.includes('\\u003c'));
  assert.throws(() => Model.encodeFeed({}, 'alert(1)//'), /Invalid callback/);
});
test('invalid state and unknown feed schema never replace valid cached data', () => {
  assert.throws(() => Model.parsePublicPayload({schemaVersion:99}), /valid published/);
  const payload = Model.publicPayload(completed()); payload.state.matches[6].winner = 'nobody';
  assert.throws(() => Model.parsePublicPayload(payload), /winner/);
});
test('feed URL only accepts a published Google deployment URL', () => {
  const valid = 'https://script.google.com/macros/s/test_deployment/exec';
  assert.equal(validateFeedUrl(valid).href, valid);
  for (const bad of ['http://script.google.com/macros/s/a/exec','https://evil.example/macros/s/a/exec','https://script.google.com/macros/s/a/dev','https://script.google.com/macros/s/a/exec?action=reset']) assert.throws(() => validateFeedUrl(bad));
});

function fakeFeed(action) {
  const scope = {};
  let removed = false;
  const doc = { createElement: () => ({ remove: () => { removed = true; } }), head: { append: script => action(script, scope) } };
  return { scope, doc, removed: () => removed };
}
test('read-only feed loads a valid response and removes the callback/script', async () => {
  const payload = Model.publicPayload(fresh());
  const fake = fakeFeed((script, scope) => queueMicrotask(() => scope[new URL(script.src).searchParams.get('callback')](payload)));
  const actual = await fetchSnapshot('https://script.google.com/macros/s/test/exec', { ...fake, timeoutMs:100 });
  assert.deepEqual(actual, payload); assert(fake.removed()); assert.equal(Object.keys(fake.scope).length, 0);
});
test('failed/timed-out feed retains the last valid cached snapshot', async () => {
  const data = new Map(); const storage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const url = 'https://script.google.com/macros/s/test/exec'; const payload=Model.publicPayload(completed());
  cacheSnapshot(storage,url,payload,new Date().toISOString());
  const fake=fakeFeed(()=>{});
  await assert.rejects(fetchSnapshot(url,{...fake,timeoutMs:5}), /timed out/);
  assert.deepEqual(cachedSnapshot(storage,url).payload,payload);
  assert(fake.removed());
});
test('feed transport and validation errors reject with useful messages', async () => {
  const fail=fakeFeed(script=>queueMicrotask(()=>script.onerror()));
  await assert.rejects(fetchSnapshot('https://script.google.com/macros/s/test/exec',{...fail,timeoutMs:100}), /Could not reach/);
  const invalid=fakeFeed((script,scope)=>queueMicrotask(()=>scope[new URL(script.src).searchParams.get('callback')]({schemaVersion:99})));
  await assert.rejects(fetchSnapshot('https://script.google.com/macros/s/test/exec',{...invalid,timeoutMs:100}), /invalid tournament/);
});

test('generated Apps Script engine completes the same tournament as the browser engine', async () => {
  const source=await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
  const context=vm.createContext({console});
  vm.runInContext(source+'\nglobalThis.testEngine = Engine;',context);
  const actual=context.testEngine;
  let state=actual.lockDraw(actual.previewDraw(fresh(),Engine.enumerateDraws(fresh().config)[0]));
  for(let round=0;round<3;round++){
    const week=8+round;
    const teams=state.matches.filter(m=>m.round===round).flatMap(m=>m.teamIds);
    state=actual.saveScores(state,round,teams.map((teamId,i)=>({teamId,actual:100+i,projected:null,status:'awaiting-confirmation'})));
    state=actual.finalizeRound(state,round);
  }
  assert.equal(state.matches[6].winner,completed().matches[6].winner);
  actual.validateState(state);
  assert.equal(actual.enumerateDraws(state.config).length,31);
});
test('public Apps Script endpoint ignores write-like query parameters and sanitizes cached data', async () => {
  const source=await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
  const payload=Model.publicPayload(completed()); payload.state.config.secret='PRIVATE_SECRET';
  let writes=0;
  const context=vm.createContext({console,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet'})},
    CacheService:{getScriptCache:()=>({get:()=>JSON.stringify(payload),put:()=>{}})},
    SpreadsheetApp:{openById:()=>{writes++;throw new Error('Unexpected sheet access');}},
    ContentService:{MimeType:{JSON:'JSON',JAVASCRIPT:'JAVASCRIPT'},createTextOutput:text=>({text,setMimeType(type){this.type=type;return this;}})}
  });
  vm.runInContext(source+'\nglobalThis.readEndpoint=doGet;',context);
  const result=context.readEndpoint({parameter:{action:'reset',score:'1000'}});
  const read=JSON.parse(result.text);
  assert.equal(read.state.matches[6].winner,payload.state.matches[6].winner);
  assert(!result.text.includes('PRIVATE_SECRET')); assert.equal(writes,0);
  assert(!/function\s+doPost\s*\(/.test(source));
  const injected=context.readEndpoint({parameter:{callback:'alert(1)'}});
  assert.equal(injected.type,'JSON'); assert.equal(injected.text,'{"error":"Invalid callback"}');
});

test('Apps Script public caches are isolated by spreadsheet identity', async () => {
  const source=await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
  let selected='operational';
  const values=new Map([
    ['public-tournament:operational',JSON.stringify(Model.publicPayload(fresh()))],
    ['public-tournament:practice',JSON.stringify(Model.publicPayload(completed()))]
  ]);
  const context=vm.createContext({console,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>selected})},
    CacheService:{getScriptCache:()=>({get:key=>values.get(key),put:(key,value)=>values.set(key,value)})},
    ContentService:{MimeType:{JSON:'JSON',JAVASCRIPT:'JAVASCRIPT'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  });
  vm.runInContext(source+'\nglobalThis.readEndpoint=doGet;',context);
  const original=context.readEndpoint({parameter:{}}).text;
  assert.equal(JSON.parse(original).state.locked,false);
  selected='practice';
  assert.ok(JSON.parse(context.readEndpoint({parameter:{}}).text).state.matches[6].winner);
  selected='operational';
  assert.equal(context.readEndpoint({parameter:{}}).text,original);
});
