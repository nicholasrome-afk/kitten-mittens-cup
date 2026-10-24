/* Bound Google Apps Script controller. Build with npm run build:sheets.
   Code.gs contains this file plus the exact tested browser tournament engine. */
const FIRST_DATA_ROW = 5;
const STATE_TAB = '_State';
const PUBLIC_TAB = '_Public';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tournament')
    .addItem('1. Initialize this spreadsheet', 'initializeTournament')
    .addItem('Save settings and Week 7 totals', 'saveTournamentSettings')
    .addSeparator()
    .addItem('Generate / regenerate draw preview', 'generateTournamentDraw')
    .addItem('Approve and lock draw', 'approveTournamentDraw')
    .addSeparator()
    .addItem('Save and publish current scores', 'publishTournamentScores')
    .addItem('Review and finalize current round', 'finalizeTournamentRound')
    .addItem('Reopen a round for a correction', 'reopenTournamentRound')
    .addSeparator()
    .addItem('Restore sheet views from saved state', 'restoreTournamentViews')
    .addItem('Reset tournament / next season', 'resetSheetTournament')
    .addToUi();
}

function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function publicCacheKey_(id) { return `public-tournament:${id}`; }
function ui_() { return SpreadsheetApp.getUi(); }
function withLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return action(); }
  finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}
function menu_(action) {
  try { return action(); }
  catch (error) { console.error(error.stack || error.message); status_(`Action stopped: ${error.message}`); ui_().alert(error.message); }
}
function status_(message) {
  const guide = book_().getSheetByName('Guide');
  if (guide) guide.getRange('A5').setValue(message);
  book_().toast(message, 'Tournament', 10);
}
function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function getJson_(book, name) {
  const tab = book.getSheetByName(name);
  if (!tab) throw new Error('Initialize this spreadsheet from the Tournament menu first.');
  const [json, hash] = tab.getRange('A2:B2').getValues()[0];
  if (!json || typeof json !== 'string' || hash_(json) !== hash) throw new Error(`${name} data is damaged. Nothing was reset or republished. Keep the spreadsheet and its protected backups for recovery.`);
  return JSON.parse(json);
}
function readState_() { return Engine.validateState(getJson_(book_(), STATE_TAB)); }
function putJson_(name, value) {
  const json = JSON.stringify(value);
  if (json.length > 45000) throw new Error('Tournament data exceeds the safe cell size. Archive old audit entries before retrying.');
  const tab = book_().getSheetByName(name) || book_().insertSheet(name);
  tab.getRange('A1:B2').setValues([['Saved JSON — do not edit', 'SHA-256 checksum'], [json, hash_(json)]]);
  if (!tab.isSheetHidden()) tab.hideSheet();
}
function rows_(name) {
  const sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error(`Missing ${name} tab. Initialize the spreadsheet first.`);
  if (sheet.getLastRow() > 104) throw new Error(`${name} contains unexpected extra rows. Restore sheet views or remove the unintended data.`);
  const width = SheetModel.SHEET_HEADERS[name].length;
  return sheet.getRange(FIRST_DATA_ROW, 1, Math.max(1, sheet.getLastRow() - 4), width).getValues();
}
function inputs_() { return { settings: rows_('Settings'), teams: rows_('Teams'), schedule: rows_('Schedule') }; }
function inputFingerprint_() {
  return hash_(JSON.stringify({ inputs: inputs_(), scores: rows_('Scores'), bracket: rows_('Bracket') }));
}
function applySettings_(state) {
  const input = inputs_();
  return SheetModel.applySettingsRows(state, input.settings, input.teams, input.schedule);
}
function applyScores_(state) {
  const sheet = book_().getSheetByName('Scores');
  const formulas = sheet.getRange(FIRST_DATA_ROW, 5, Math.max(1, sheet.getLastRow() - 4), 3).getFormulas();
  if (formulas.some(row => row.some(Boolean))) throw new Error('Enter scores and statuses as plain values, not spreadsheet formulas.');
  return SheetModel.scoresFromRows(state, rows_('Scores'));
}
function backup_(state, reason) {
  const suffix = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 4);
  const tab = book_().insertSheet(`_Backup_${suffix}`);
  const json = JSON.stringify(state);
  tab.getRange('A1:B3').setValues([['Reason', reason], ['Saved JSON', 'SHA-256 checksum'], [json, hash_(json)]]);
  protect_(tab, []);
  tab.hideSheet();
}
function writeState_(state, options = {}) {
  Engine.validateState(state);
  const payload = SheetModel.publicPayload(state);
  // Validate both serializations before the first write.
  if ([state, payload].some(value => JSON.stringify(value).length > 45000)) throw new Error('Snapshot is too large to store safely. No publication was attempted.');
  putJson_(STATE_TAB, state);
  renderViews_(state, options);
  putJson_(PUBLIC_TAB, payload);
  CacheService.getScriptCache().put(publicCacheKey_(book_().getId()), JSON.stringify(payload), 30);
  const settings = book_().getSheetByName('Settings');
  settings.getRange('B10').setValue(state.locked);
  settings.getRange('B12').setValue(payload.publishedAt);
  book_().getSheetByName('Guide')?.getRange('A3').setValue('Commissioner menu installed. Website connection is complete only after the deployed feed has been verified.');
  status_(`Published ${Utilities.formatDate(new Date(payload.publishedAt), 'America/Los_Angeles', 'MMM d, h:mm a')} Pacific. ${state.matches[6]?.winner ? 'Championship confirmed.' : state.locked ? `Draw locked. Current round: ${Engine.ROUND_NAMES[SheetModel.activeRound(state)] || 'complete'}.` : 'No draw has been approved.'}`);
}
function writeTable_(name, values) {
  const sheet = book_().getSheetByName(name) || book_().insertSheet(name);
  const headers = SheetModel.SHEET_HEADERS[name];
  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(FIRST_DATA_ROW, 1, 100, headers.length).clearContent();
  if (values.length) sheet.getRange(FIRST_DATA_ROW, 1, values.length, headers.length).setValues(values);
  sheet.getRange(4, 1, 101, headers.length).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  sheet.getRange(4, 1, 1, headers.length).setBackground('#edf0ed').setFontWeight('bold').setWrap(true);
  if (sheet.getFrozenRows() !== 4) sheet.setFrozenRows(4);
  return sheet;
}
function label_(state, id) {
  const team = state.config.teams.find(t => t.id === id);
  return team ? `${team.characterName || team.name}${team.characterName ? ` (${team.name})` : ''}` : 'To be decided';
}
function renderViews_(state, options) {
  const cfg = state.config;
  const oldBracket = book_().getSheetByName('Bracket');
  const previousBracket = options.clearTies || !oldBracket ? [] : oldBracket.getRange(FIRST_DATA_ROW, 1, 100, 14).getValues();
  if (options.syncConfig) {
    writeTable_('Settings', SheetModel.settingsRows(cfg));
    writeTable_('Teams', cfg.teams.map(t => [t.id, t.yahooTeamId || '', t.name, t.characterName || '', t.logoUrl || '', t.color || '', t.initials || '', state.pointsThrough7[t.id] ?? '']));
    writeTable_('Schedule', cfg.schedule.map(g => [g.week, g.teamA, g.teamB, 'regular-season', true]));
  }
  const scores = writeTable_('Scores', SheetModel.scoreRows(state));
  // Native Sheets tables require column-level number-format changes separately.
  scores.getRange('E5:E104').setNumberFormat('0.00');
  scores.getRange('F5:F104').setNumberFormat('0.00');
  // The imported native Scores table owns its typed status dropdown. Replacing
  // that validation through Range.setDataValidation is rejected by Google.
  const bracketRows = state.matches.map(m => {
    const week = cfg.quarterfinalWeek + m.round;
    return [state.season, Engine.ROUND_NAMES[m.round], week, m.id, m.teamIds[0] || '', label_(state, m.teamIds[0]), m.teamIds[1] || '', label_(state, m.teamIds[1]), Engine.scoreFor(state, m.teamIds[0], week)?.actual ?? '', Engine.scoreFor(state, m.teamIds[1], week)?.actual ?? '', m.winner || '', Engine.matchStatus(state, m), m.finalizedAt || '', SheetModel.pendingTieChoice(state, m, previousBracket)];
  });
  writeTable_('Bracket', bracketRows).getRange('I5:J104').setNumberFormat('0.00');
  writeTable_('Draw', (state.preview || []).map((pair, i) => [`r1-${i + 1}`, pair[0], label_(state, pair[0]), pair[1], label_(state, pair[1]), state.locked ? 'Locked' : 'Preview — not approved']));
  if (options.protect) protectAll_(state);
}
function protect_(sheet, openRanges) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(p => p.getDescription().startsWith('Midseason:')).forEach(p => p.remove());
  const protection = sheet.protect().setDescription(`Midseason: ${sheet.getName()}`);
  protection.setWarningOnly(false);
  protection.setUnprotectedRanges(openRanges);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}
function protectAll_(state) {
  const book = book_();
  ['Guide', 'Draw', STATE_TAB, PUBLIC_TAB].forEach(name => { const sheet = book.getSheetByName(name); if (sheet) protect_(sheet, []); });
  protect_(book.getSheetByName('Settings'), [book.getSheetByName('Settings').getRange('B5:B9')]);
  const teams = book.getSheetByName('Teams');
  const openTeamRanges = state.locked ? [] : [teams.getRange('B5:G12')];
  if (!state.matches.some(m => m.finalizedAt)) openTeamRanges.push(teams.getRange('H5:H12'));
  protect_(teams, openTeamRanges);
  protect_(book.getSheetByName('Schedule'), [book.getSheetByName('Schedule').getRange('A5:C12')]);
  const round = SheetModel.activeRound(state);
  const scoreSheet = book.getSheetByName('Scores');
  const editable = state.locked ? SheetModel.scoreRows(state).map((row, i) => row[1] === state.config.quarterfinalWeek + round ? scoreSheet.getRange(FIRST_DATA_ROW + i, 5, 1, 3) : null).filter(Boolean) : [];
  protect_(scoreSheet, editable);
  const bracket = book.getSheetByName('Bracket');
  const ties = state.matches.filter(m => m.round === round).map(m => bracket.getRange(FIRST_DATA_ROW + state.matches.indexOf(m), 14));
  ties.forEach(range => range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(state.config.teams.map(t => t.id), true).setAllowInvalid(false).build()));
  protect_(bracket, ties);
}

function initializeTournament() {
  menu_(() => withLock_(() => {
    if (book_().getSheetByName(STATE_TAB)) throw new Error('This spreadsheet is already initialized. Nothing was reset. Use Restore sheet views if a tab needs repair.');
    const input = inputs_();
    const config = SheetModel.configFromRows(input.settings, input.teams, input.schedule, DEFAULT_CONFIG);
    let state = Engine.initialState(config);
    state = SheetModel.applySettingsRows(state, input.settings, input.teams, input.schedule);
    PropertiesService.getScriptProperties().setProperty('TOURNAMENT_SPREADSHEET_ID', book_().getId());
    // Create both internal tabs before protection is applied.
    putJson_(PUBLIC_TAB, SheetModel.publicPayload(state));
    writeState_(state, { syncConfig: true, protect: true });
    onOpen();
  }));
}
function saveTournamentSettings() {
  menu_(() => withLock_(() => writeState_(applySettings_(readState_()), { syncConfig: true, protect: true })));
}
function generateTournamentDraw() {
  menu_(() => withLock_(() => {
    const state = applySettings_(readState_());
    const choose = n => Engine.randomInt(n, array => { array[0] = parseInt(Utilities.getUuid().slice(0, 8), 16); });
    const next = Engine.previewDraw(state, Engine.generateDraw(state.config, choose));
    writeState_(next, { syncConfig: true, protect: true });
    book_().setActiveSheet(book_().getSheetByName('Draw'));
  }));
}
function approveTournamentDraw() {
  menu_(() => {
    const prepared = withLock_(() => {
      const state = readState_();
      const input = inputs_();
      const config = SheetModel.configFromRows(input.settings, input.teams, input.schedule, state.config);
      if (JSON.stringify(config) !== JSON.stringify(state.config)) throw new Error('Settings or teams changed after the preview. Save settings and regenerate the preview before locking.');
      return { before: state, next: Engine.lockDraw(state), fingerprint: inputFingerprint_() };
    });
    const summary = prepared.before.preview.map((pair, i) => `Match ${i + 1}: ${pair.map(id => label_(prepared.before, id)).join(' vs. ')}`).join('\n');
    if (ui_().alert('Approve this exact draw?', `${summary}\n\nAll semifinal and championship paths will lock. A full confirmed reset is required to change the draw.`, ui_().ButtonSet.YES_NO) !== ui_().Button.YES) return;
    withLock_(() => {
      if (readState_().revision !== prepared.before.revision || inputFingerprint_() !== prepared.fingerprint) throw new Error('The sheet changed while you reviewed. Review the latest draw again.');
      backup_(prepared.before, 'Before locking draw');
      writeState_(prepared.next, { protect: true });
    });
  });
}
function publishTournamentScores() {
  menu_(() => withLock_(() => writeState_(applyScores_(applySettings_(readState_())), {})));
}
function finalizeTournamentRound() {
  menu_(() => {
    const prepared = withLock_(() => {
      const before = readState_();
      let state = applySettings_(before);
      state = applyScores_(state);
      const round = SheetModel.activeRound(state);
      const overrideRows = rows_('Bracket');
      const overrides = Object.fromEntries(overrideRows.filter(row => row[3] && row[13]).map(row => [String(row[3]), String(row[13])]));
      return { before, next: Engine.finalizeRound(state, round, overrides), round, fingerprint: inputFingerprint_() };
    });
    const week = prepared.before.config.quarterfinalWeek + prepared.round;
    const summary = prepared.next.matches.filter(m => m.round === prepared.round).map(m => {
      const score = id => Engine.scoreFor(prepared.next, id, week).actual.toFixed(2);
      return `${m.teamIds.map(id => `${label_(prepared.next, id)} ${score(id)}`).join(' vs. ')}\nWinner: ${label_(prepared.next, m.winner)}${m.resolution === 'score' ? '' : ` (${m.resolution} tiebreaker)`}`;
    }).join('\n\n');
    if (ui_().alert(`Confirm Week ${week} official scores?`, `${summary}\n\nConfirm only after Yahoo's weekly scores are complete. ${prepared.round === 2 ? 'This declares the champion.' : 'These winners will advance.'}`, ui_().ButtonSet.YES_NO) !== ui_().Button.YES) return;
    withLock_(() => {
      if (readState_().revision !== prepared.before.revision || inputFingerprint_() !== prepared.fingerprint) throw new Error('The sheet changed during your review. Nothing advanced. Review and finalize again.');
      backup_(prepared.before, `Before finalizing Week ${week}`);
      writeState_(prepared.next, { protect: true });
    });
  });
}
function reopenTournamentRound() {
  menu_(() => {
    const before = withLock_(readState_);
    const askWeek = ui_().prompt('Which round needs a correction?', `Enter its week: ${before.config.quarterfinalWeek}, ${before.config.quarterfinalWeek + 1} or ${before.config.quarterfinalWeek + 2}.`, ui_().ButtonSet.OK_CANCEL);
    if (askWeek.getSelectedButton() !== ui_().Button.OK) return;
    const round = Number(askWeek.getResponseText()) - before.config.quarterfinalWeek;
    if (![0, 1, 2].includes(round)) throw new Error('Enter one of the three tournament weeks.');
    const confirmation = ui_().prompt('Reopen and clear later results?', 'This clears this round’s winners and ALL later participants, scores and results. The locked opening draw stays fixed. Type REOPEN to confirm.', ui_().ButtonSet.OK_CANCEL);
    if (confirmation.getSelectedButton() !== ui_().Button.OK) return;
    const next = Engine.reopenRound(before, round, confirmation.getResponseText());
    withLock_(() => {
      if (readState_().revision !== before.revision) throw new Error('The tournament changed. Review the current state before reopening.');
      backup_(before, 'Before reopening a round');
      writeState_(next, { protect: true, clearTies: true });
    });
  });
}
function restoreTournamentViews() {
  menu_(() => withLock_(() => {
    const state = readState_();
    writeState_(state, { syncConfig: true, protect: true });
    status_('Views restored from the last valid saved tournament. The draw and results were not reset.');
  }));
}
function resetSheetTournament() {
  menu_(() => {
    const prepared = withLock_(() => {
      const before = readState_();
      const input = inputs_();
      const config = SheetModel.configFromRows(input.settings, input.teams, input.schedule, before.config);
      return { before, config, fingerprint: inputFingerprint_() };
    });
    const answer = ui_().prompt('Reset tournament?', `This clears the draw, scores, results and Week 7 totals and starts season ${prepared.config.season}. Verify Teams and both restricted schedules first. A protected backup will be kept in this spreadsheet. Type RESET ${prepared.before.season} to continue.`, ui_().ButtonSet.OK_CANCEL);
    if (answer.getSelectedButton() !== ui_().Button.OK) return;
    const next = Engine.resetTournament(prepared.before, answer.getResponseText(), prepared.config);
    withLock_(() => {
      if (readState_().revision !== prepared.before.revision || inputFingerprint_() !== prepared.fingerprint) throw new Error('Inputs changed during review. Start the reset review again.');
      backup_(prepared.before, 'Before explicit tournament reset');
      writeState_(next, { syncConfig: true, protect: true });
    });
  });
}

// A user edit automatically publishes valid current-round scores, never winners.
// Script/API writes do not trigger onEdit. The menu is the explicit retry path.
function onEdit(event) {
  if (!event?.range) return;
  const sheet = event.range.getSheet();
  const name = sheet.getName();
  if (!book_().getSheetByName(STATE_TAB)) return;
  if (['Settings', 'Teams', 'Schedule'].includes(name)) {
    status_('Input changes are pending. Use Tournament → Save settings and Week 7 totals. For a new season or changed locked configuration, use the explicit Reset action.');
    return;
  }
  if (name !== 'Scores' || event.range.getLastRow() < FIRST_DATA_ROW) return;
  try {
    withLock_(() => {
      const state = readState_();
      if (event.range.getColumn() < 5 || event.range.getLastColumn() > 7) throw new Error('Only edit Actual score, Projected score and Score status. IDs and finalized results are protected.');
      const round = SheetModel.activeRound(state);
      for (let row = Math.max(FIRST_DATA_ROW, event.range.getRow()); row <= event.range.getLastRow(); row++) {
        const values = sheet.getRange(row, 1, 1, 9).getValues()[0];
        if (!state.locked || values[1] !== state.config.quarterfinalWeek + round) throw new Error('This score is not in the current editable round. Reopen a finalized round before correcting it.');
        if (values[6] === 'not-started' && values[4] !== '') sheet.getRange(row, 7).setValue('in-progress');
        if (values[4] === '' && values[5] === '' && values[6] !== 'final') sheet.getRange(row, 7).setValue('not-started');
      }
      writeState_(applyScores_(state), {});
    });
  } catch (error) { status_(`Score not published: ${error.message} The website keeps the last valid scores. Correct the cells, then use Save and publish current scores.`); }
}

// The only public entry point is a read-only GET of an explicitly sanitized snapshot.
// There is intentionally NO doPost and no public action, reset or scoring endpoint.
function doGet(event) {
  const callback = event?.parameter?.callback || '';
  if (callback && !/^__tournamentFeed_[a-f0-9]{24}$/.test(callback)) return ContentService.createTextOutput('{"error":"Invalid callback"}').setMimeType(ContentService.MimeType.JSON);
  let payload;
  try {
    const cache = CacheService.getScriptCache();
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('TOURNAMENT_SPREADSHEET_ID');
    const key = publicCacheKey_(spreadsheetId);
    const cached = cache.get(key);
    const saved = cached ? JSON.parse(cached) : getJson_(SpreadsheetApp.openById(spreadsheetId), PUBLIC_TAB);
    SheetModel.parsePublicPayload(saved);
    payload = SheetModel.publicPayload(saved.state, saved.publishedAt);
    cache.put(key, JSON.stringify(payload), 30);
  } catch (error) { payload = { schemaVersion: 1, error: 'Tournament feed is unavailable. The commissioner should check the spreadsheet status.' }; }
  return ContentService.createTextOutput(SheetModel.encodeFeed(payload, callback)).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
