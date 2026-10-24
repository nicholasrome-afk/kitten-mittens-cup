import { league } from '../config/league.js';
import { dataSource } from '../config/data-source.js';
import { displayTeamName } from '../config/characters.js';
import { loadState, persistState, STORAGE_KEY } from './storage.js';
import { enumerateDraws, generateDraw, previewDraw, lockDraw, saveScores, savePointsThrough7, finalizeRound, reopenRound, resetTournament, scoreFor, validateState, ROUND_NAMES } from './tournament.js';
import { escapeHtml as esc, scoreText, statusLabel } from './ui.js';
import { requestConfirmation } from './dialog.js';

const root = document.querySelector('#admin-app');
const message = document.querySelector('#admin-message');
let state;
if (dataSource.mode === 'google-sheets') {
  root.innerHTML = '<section class="admin-panel"><h2>Manage this tournament in Google Sheets.</h2><p>The viewer now uses the sheet as its source of truth. Use its Tournament menu for draw approval, scoring and finalization. Local browser controls are disabled to avoid conflicting edits.</p></section>';
} else if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  root.innerHTML = '<div class="admin-panel"><h2>Local tools only.</h2><p>Run npm run dev on your Mac and open the printed localhost commissioner URL. This page is excluded from public builds.</p></div>';
} else {
  try { state = loadState(); render(); }
  catch (error) { show(error.message, true); recovery(); }
}

function show(text, error = false) {
  message.className = `admin-message${error ? ' error' : ''}`;
  message.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
}
function run(operation, success) {
  try {
    const next = operation();
    state = persistState(next, state.revision);
    render(); show(success);
  } catch (error) { show(error.message, true); }
}
function teamName(id) { return displayTeamName(state.config.teams.find(t => t.id === id)); }
function bind(id, listener, event = 'click') { document.getElementById(id)?.addEventListener(event, listener); }
function inputNumber(value) { return value.trim() === '' ? null : Number(value); }
function provisionalResult(match) {
  if (match.winner) return '';
  const scores = match.teamIds.map(id => scoreFor(state, id, cfgWeek(match.round)));
  if (scores.some(s => s?.actual == null)) return '';
  if (scores[0].actual === scores[1].actual) return '<p class="inline-hint">Scores tied · tiebreaker required at confirmation.</p>';
  const leader = scores[0].actual > scores[1].actual ? scores[0].teamId : scores[1].teamId;
  return `<p class="inline-hint">Provisional lead: ${esc(teamName(leader))} · no advancement until confirmation.</p>`;
}
function download(content, suffix) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `midseason-${state?.season || 'recovery'}-${suffix}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function backupControls() {
  return `<div class="button-row"><button id="export">Export local backup</button><label>Restore a JSON backup<input id="import" class="admin-file" type="file" accept=".json,application/json"></label></div>`;
}
function bindBackups() {
  bind('export', () => download(localStorage.getItem(STORAGE_KEY) || JSON.stringify(state, null, 2), 'backup'));
  bind('import', async event => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) throw new Error('Backup exceeds 1 MB. Select a tournament JSON backup.');
      const imported = validateState(JSON.parse(await file.text()));
      if (!await requestConfirmation({ title: 'Restore tournament backup?', body: `Restore the ${imported.season} tournament backup? This replaces this browser’s current tournament. Export a backup first if you want to keep it.`, confirmLabel: 'Restore backup', danger: true })) return;
      imported.revision = (state?.revision || 0) + 1;
      if (state) persistState(imported, state.revision);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      state = imported; render(); show('Backup validated and restored.');
    } catch (error) { show(`Restore failed: ${error.message}`, true); }
  }, 'change');
}
function recovery() {
  root.innerHTML = `<section class="admin-panel"><h2>Recover saved data</h2><p>The original browser data is untouched. Export it for safekeeping, then restore a valid backup. No tournament was reset automatically.</p>${backupControls()}</section>`;
  bindBackups();
}
function render() {
  const cfg = state.config;
  root.innerHTML = `
    <section class="admin-panel"><h2>1. Preview and approve the draw</h2><p>Every one of the ${enumerateDraws(cfg).length} valid complete draws has the same probability. Week ${cfg.quarterfinalWeek - 1} and ${cfg.quarterfinalWeek} regular-season opponents cannot meet. Match 01 + 02 feed semifinal 1; match 03 + 04 feed semifinal 2. Those paths lock with the draw.</p>
    <span class="status-inline">${state.locked ? `✓ Draw locked ${new Date(state.lockedAt).toLocaleString()}` : 'Draw is not approved. Nothing has been finalized.'}</span>
    ${state.preview ? `<ol class="draw-list">${state.preview.map(pair => `<li>${esc(teamName(pair[0]))} <span class="muted">vs.</span> ${esc(teamName(pair[1]))}</li>`).join('')}</ol>` : ''}
    <div class="button-row"><button id="generate" ${state.locked ? 'disabled' : ''}>${state.preview ? 'Regenerate preview' : 'Generate draw preview'}</button><button class="primary" id="lock" ${state.locked || !state.preview ? 'disabled' : ''}>Approve & lock this draw</button><a href="./" target="_blank" rel="noopener">Open bracket ↗</a></div></section>
    <section class="admin-panel"><details><summary>2. Tiebreaker totals & tournament settings</summary><p>Enter actual regular-season total points through Week 7. Blank means unknown, never zero. These values are used only to break tied tournament scores. To change totals after finalization, reopen every finalized round first.</p>
    <form id="settings-form"><div class="form-grid"><label>League name<input name="leagueName" value="${esc(cfg.name)}" maxlength="100" required ${state.locked ? 'disabled' : ''}></label><label>Tournament name<input name="tournamentName" value="${esc(cfg.tournamentName)}" maxlength="100" required ${state.locked ? 'disabled' : ''}></label><label>Tiebreaker rule<select name="tiebreaker" ${state.locked ? 'disabled' : ''}><option value="points-through-week-7" ${cfg.tiebreaker === 'points-through-week-7' ? 'selected' : ''}>Higher points through Week 7, then commissioner</option><option value="commissioner" ${cfg.tiebreaker === 'commissioner' ? 'selected' : ''}>Commissioner resolves ties</option></select></label></div><div class="totals-grid">${cfg.teams.map(t => `<label>${esc(displayTeamName(t))} · Week 7 total<input type="number" step="0.01" min="-10000" max="10000" name="points-${t.id}" value="${state.pointsThrough7[t.id] ?? ''}" ${state.matches.some(m => m.finalizedAt) ? 'disabled' : ''}></label>`).join('')}</div><button type="submit">Save settings & totals</button></form></details></section>
    <section class="admin-panel"><h2>3. Enter scores, then confirm a round</h2><p>Save in-progress scores to preview the matchup. When all Yahoo games and scoring are complete, set every score to Awaiting confirmation, save, review, then finalize. Finalizing is your explicit confirmation that these are the official weekly scores.</p>${!state.locked ? '<p class="warning-box">Approve and lock a draw above to enable scoring.</p>' : ''}</section>
    ${state.locked ? ROUND_NAMES.map((name, round) => renderRound(name, round)).join('') : ''}
    <section class="admin-panel"><details><summary>Local backups & activity</summary><p>Browser storage is specific to this browser and this localhost address. Clearing browser data clears the tournament. Export backups before important changes. Use the same address and port each time.</p>${backupControls()}<h3>Recent activity</h3><ol class="audit-log">${state.audit.slice(-12).reverse().map(item => `<li>${esc(new Date(item.at).toLocaleString())} · ${esc(item.action)}</li>`).join('') || '<li>No saved changes yet.</li>'}</ol></details></section>
    <section class="admin-panel reset-section"><details><summary>Explicit tournament reset / next season</summary><p class="warning-box">Reset clears the locked draw, all scores, tiebreaker totals and results in this browser. Export a backup first. For a future season, first update config/league.js with the season, teams and that season’s actual Week 7/8 schedule, then reload. Reset will use that configuration, not reuse old matchups silently.</p><p>Configuration file currently specifies season ${league.season}. Current saved tournament is ${state.season}.</p><button class="danger" id="reset">Reset tournament from configuration…</button></details></section>
  `;
  bind('generate', () => run(() => previewDraw(state, generateDraw(cfg)), 'New draw preview saved. It is not locked or approved.'));
  bind('lock', async () => {
    if (!await requestConfirmation({ title: 'Approve and lock this draw?', body: `${state.preview.map((pair, i) => `Match 0${i + 1}: ${pair.map(teamName).join(' vs. ')}`).join('\n')}\n\nAll bracket paths will lock. Changing the draw later requires a full tournament reset.`, confirmLabel: 'Approve & lock draw' })) return;
    run(() => lockDraw(state), 'Draw approved and locked. You can now enter Week 8 scores.');
  });
  bind('settings-form', event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(() => {
      let next = structuredClone(state);
      if (!next.locked) {
        next.config.name = form.elements.leagueName.value.trim();
        next.config.tournamentName = form.elements.tournamentName.value.trim();
        next.config.tiebreaker = form.elements.tiebreaker.value;
      }
      if (!next.matches.some(m => m.finalizedAt)) next = savePointsThrough7(next, Object.fromEntries(cfg.teams.map(t => [t.id, inputNumber(form.elements[`points-${t.id}`].value)])));
      return next;
    }, 'Tournament settings and tiebreaker totals saved.');
  }, 'submit');
  for (let round = 0; round < 3; round++) bindRound(round);
  bind('reset', async () => {
    const confirmation = await requestConfirmation({ title: 'Reset this tournament?', body: `Export a backup first. This clears the current tournament and starts with the current configuration file (season ${league.season}). Your locked draw, scores, results and tiebreaker totals will be cleared.`, phrase: `RESET ${state.season}`, confirmLabel: 'Reset tournament', danger: true });
    if (confirmation === null) return;
    run(() => resetTournament(state, confirmation, league), 'Tournament reset. No draw is approved. Generate a new preview when ready.');
  });
  bindBackups();
}

function renderRound(name, round) {
  const games = state.matches.filter(m => m.round === round);
  const ready = games.every(m => m.teamIds.every(Boolean));
  const final = games.every(m => m.finalizedAt);
  return `<section class="admin-panel"><div class="round-state"><h2>Week ${state.config.quarterfinalWeek + round} · ${name}</h2><span class="status-inline">${final ? '✓ Confirmed final' : ready ? 'Ready for score entry' : 'Waiting for previous round'}</span></div>${!ready ? '<p>Finalize the previous round to fill these fixed bracket positions.</p>' : `<form class="score-form" id="scores-${round}">${games.map(m => `<div class="score-game"><h3>${esc(m.id.toUpperCase())} ${m.winner ? `· Winner: ${esc(teamName(m.winner))}` : ''}</h3>${provisionalResult(m)}${m.teamIds.map(id => { const score = scoreFor(state, id, state.config.quarterfinalWeek + round); return `<div class="score-entry"><span>${esc(teamName(id))}</span><label>Actual score<input name="actual-${id}" type="number" step="0.01" min="-1000" max="1000" value="${score?.actual ?? ''}" ${final ? 'disabled' : ''}></label><label>Projected (optional)<input name="projected-${id}" type="number" step="0.01" min="-1000" max="1000" value="${score?.projected ?? ''}" ${final ? 'disabled' : ''}></label><label>Score status<select name="status-${id}" ${final ? 'disabled' : ''}>${(final ? ['final'] : ['not-started', 'in-progress', 'awaiting-confirmation']).map(status => `<option value="${status}" ${score?.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></label></div>`; }).join('')}
    ${!final ? `<label class="tie-controls">Secondary tiebreaker winner (tied scores only)<select name="override-${m.id}"><option value="">Use primary tiebreaker / no override</option>${m.teamIds.map(id => `<option value="${id}">${esc(teamName(id))}</option>`).join('')}</select></label>` : ''}</div>`).join('')}
    <div class="button-row">${final ? `<button type="button" class="danger" id="reopen-${round}">Reopen round & clear all later results…</button>` : `<button type="submit" class="primary">Save Week ${state.config.quarterfinalWeek + round} scores</button><button type="button" id="example-${round}">Fill fictional example scores</button><button type="button" id="awaiting-${round}">Mark all awaiting confirmation</button><button type="button" id="finalize-${round}">Review & finalize saved scores…</button>`}</div><p class="inline-hint" style="margin-top:12px">${final ? `Finalization: ${esc(new Date(games[0].finalizedAt).toLocaleString())}. Export a backup before reopening.` : 'Save before finalizing. Unsaved form edits will never be finalized.'}</p></form>`}</section>`;
}

function readScoreEntries(form, round) {
  return state.matches.filter(m => m.round === round).flatMap(m => m.teamIds).map(teamId => ({ teamId,
    actual: inputNumber(form.elements[`actual-${teamId}`].value), projected: inputNumber(form.elements[`projected-${teamId}`].value), status: form.elements[`status-${teamId}`].value
  }));
}

function bindRound(round) {
  bind(`scores-${round}`, event => {
    event.preventDefault();
    run(() => saveScores(state, round, readScoreEntries(event.currentTarget, round)), 'Scores saved. No teams advanced.');
  }, 'submit');
  bind(`example-${round}`, () => {
    const form = document.getElementById(`scores-${round}`);
    state.matches.filter(m => m.round === round).flatMap(m => m.teamIds).forEach((id, i) => {
      form.elements[`actual-${id}`].value = (98.62 + i * 3.17 + (i % 2 ? 7.4 : 0)).toFixed(2);
      form.elements[`projected-${id}`].value = (128.5 + i * 2.23).toFixed(2);
      form.elements[`status-${id}`].value = 'in-progress';
    });
    show('Fictional example scores filled in. Save to show them on the bracket. These are not Yahoo scores.');
  });
  bind(`awaiting-${round}`, () => {
    const form = document.getElementById(`scores-${round}`);
    state.matches.filter(m => m.round === round).flatMap(m => m.teamIds).forEach(id => { form.elements[`status-${id}`].value = 'awaiting-confirmation'; });
    show('Form statuses changed. Save these scores before finalizing.');
  });
  bind(`finalize-${round}`, async () => {
    const form = document.getElementById(`scores-${round}`);
    const games = state.matches.filter(m => m.round === round);
    const overrides = Object.fromEntries(games.map(m => [m.id, form.elements[`override-${m.id}`].value || null]));
    // Validate and calculate first, then request approval of a concrete summary.
    try {
      const entries = readScoreEntries(form, round);
      if (entries.some(e => { const saved = scoreFor(state, e.teamId, state.config.quarterfinalWeek + round); return !saved || ['actual', 'projected', 'status'].some(key => e[key] !== saved[key]); })) throw new Error('This form has unsaved changes. Save the round’s scores, then review and finalize.');
      const next = finalizeRound(state, round, overrides);
      const summary = next.matches.filter(m => m.round === round).map(m => `${m.teamIds.map(id => `${teamName(id)} ${scoreText(scoreFor(state, id, cfgWeek(round))?.actual)}`).join(' vs. ')} → ${teamName(m.winner)}${m.resolution !== 'score' ? ` (${m.resolution} tiebreaker)` : ''}`).join('\n');
      if (!await requestConfirmation({ title: `Confirm Week ${cfgWeek(round)} official results?`, body: `${summary}\n\n${round === 2 ? 'This declares the champion.' : 'These winners will advance.'}`, confirmLabel: round === 2 ? 'Confirm champion' : 'Confirm results & advance' })) return;
      run(() => next, round === 2 ? 'Championship confirmed. Your champion is on the bracket!' : 'Round confirmed. Winners advanced through the fixed paths.');
    } catch (error) { show(error.message, true); }
  });
  bind(`reopen-${round}`, async () => {
    const confirmation = await requestConfirmation({ title: `Reopen Week ${cfgWeek(round)}?`, body: 'This invalidates this round and clears ALL later participants, scores and results. The original draw stays locked. Export a backup first.', phrase: 'REOPEN', confirmLabel: 'Reopen & clear later results', danger: true });
    if (confirmation === null) return;
    run(() => reopenRound(state, round, confirmation), 'Round reopened. Later rounds were cleared. Correct, save and finalize this round again.');
  });
}
function cfgWeek(round) { return state.config.quarterfinalWeek + round; }
