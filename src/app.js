import { loadState, STORAGE_KEY } from './storage.js';
import { dataSource } from '../config/data-source.js';
import { fetchSnapshot, cachedSnapshot, cacheSnapshot } from './feed.js';
import { displayTeamName } from '../config/characters.js';
import { exampleState } from './demo.js';
import { matchStatus, scoreFor, tournamentRecord, ROUND_NAMES } from './tournament.js';
import { escapeHtml as esc, avatar, scoreText, statusLabel, trophy, installImageFallbacks, teamNameMarkup } from './ui.js';

const root = document.querySelector('#app');
let lastValid = null;
const remote = dataSource.mode === 'google-sheets';
let feedInfo = { receivedAt: null, publishedAt: null };
let refreshing = false;
let cacheRead = false;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (local && !remote) document.querySelector('#commissioner-link').hidden = false;

function renderMatch(state, m, example) {
  const status = matchStatus(state, m);
  const week = state.config.quarterfinalWeek + m.round;
  return `<article class="match-card ${m.finalizedAt ? 'is-final' : ''}" aria-label="${ROUND_NAMES[m.round]} matchup ${m.index + 1}">
    <div class="match-meta"><span>${m.round === 2 ? 'THE FINAL' : `MATCH ${String(m.index + 1 + (m.round === 1 ? 4 : 0)).padStart(2, '0')}`}</span><span class="match-status ${status}">${status === 'in-progress' ? '<i></i>' : ''}${statusLabel(status)}</span></div>
    ${m.teamIds.map((id, slot) => {
      const team = state.config.teams.find(t => t.id === id);
      const score = scoreFor(state, id, week);
      const winner = m.winner === id && id;
      return `<div class="team-row ${winner ? 'winner' : ''} ${m.winner && !winner ? 'eliminated' : ''}">${team ? avatar(team) : '<span class="avatar unknown">?</span>'}<span class="team-detail">${team ? teamNameMarkup(team) : `<span class="team-name">${m.round === 0 ? 'Draw pending' : `Winner of ${m.round === 1 ? `Match ${String(m.index * 2 + slot + 1).padStart(2, '0')}` : `Semifinal ${slot + 1}`}`}</span>`}<span class="team-sub">${team ? `${tournamentRecord(state, id).wins}–${tournamentRecord(state, id).losses} in tournament` : 'To be decided'}</span></span><span class="score">${scoreText(score?.actual)}${winner ? '<span class="winner-check" aria-label="Winner">✓</span>' : ''}</span></div>`;
    }).join('')}
    <div class="match-bottom">${m.finalizedAt ? `Confirmed${m.resolution === 'score' ? (m.round === 2 ? ' · Champion crowned' : ' · Winner advances') : ` · ${m.resolution === 'commissioner' ? 'Commissioner' : 'Week 7 points'} tiebreaker`}` : m.teamIds.every(Boolean) ? m.teamIds.map(id => { const s = scoreFor(state, id, week); return s?.projected == null ? 'Projection —' : `Proj. ${scoreText(s.projected)}`; }).join('<span> / </span>') : 'The road continues here'}${example && m.round === 0 ? '<span class="sample-small">EXAMPLE</span>' : ''}</div>
  </article>`;
}

function render(state, notice = '') {
  const illustrative = !state.locked;
  const view = illustrative ? exampleState(state.config) : state;
  // Show a real preview in its fixed slots before approval, with no sample scores.
  if (illustrative && state.preview) {
    view.config = state.config;
    view.matches.slice(0, 4).forEach((m, i) => { m.teamIds = state.preview[i]; });
    view.scores = [];
  }
  if (remote && illustrative && !state.preview) {
    view.scores = [];
    view.matches.slice(0, 4).forEach(m => { m.teamIds = [null, null]; });
  }
  const cfg = state.config;
  const champion = state.matches.find(m => m.round === 2)?.winner;
  const championTeam = cfg.teams.find(t => t.id === champion);
  const currentRound = state.locked ? Math.min(state.matches.filter(m => m.finalizedAt).length >= 6 ? 2 : state.matches.filter(m => m.finalizedAt).length >= 4 ? 1 : 0, 2) : 0;
  const tiebreaker = cfg.tiebreaker === 'commissioner' ? 'Tied scores are resolved by the commissioner.' : 'Higher regular-season total points through Week 7 wins a tie. If those totals are equal or unavailable, the commissioner resolves it.';
  const dataLabel = illustrative ? state.preview ? 'Draw preview · awaiting approval' : remote ? 'Draw pending approval' : 'Illustrative bracket · draw not locked' : champion ? 'Tournament complete' : state.started ? `Week ${cfg.quarterfinalWeek + currentRound} · ${ROUND_NAMES[currentRound]}` : 'Draw locked · ready for kickoff';
  const totals = cfg.teams.map(t => ({ ...t, total: state.scores.filter(s => s.teamId === t.id && s.status === 'final').reduce((sum, s) => sum + s.actual, 0), record: tournamentRecord(state, t.id) })).sort((a, b) => b.record.wins - a.record.wins || b.total - a.total);
  const latestScoreUpdate = state.scores.map(s => s.updatedAt).sort().at(-1);
  document.title = `${cfg.tournamentName} · ${cfg.season}`;
  const titleWords = cfg.tournamentName.trim().split(/\s+/);
  document.querySelector('.brand > span:last-child').innerHTML = `${esc(titleWords.slice(0, -1).join(' '))}<br><strong>${esc(titleWords.at(-1))}</strong>`;
  document.querySelector('.brand').setAttribute('aria-label', `${cfg.tournamentName} home`);
  document.querySelector('#season-label').textContent = `${cfg.season} SEASON`;
  document.querySelector('#footer-name').textContent = cfg.tournamentName.toUpperCase();
  root.innerHTML = `
    ${notice ? `<div class="sync-notice" role="alert">${esc(notice)}</div>` : ''}
    <section class="episode-card" aria-label="Tournament opening title card">
      <span>HUEVOS GRANDES <i>✦</i> ${cfg.season} SEASON</span>
      <p>“${champion ? 'The Gang Crowns a Golden God' : 'The Gang Starts a Tournament'}”</p>
      <span>IT’S ALWAYS COMPETITIVE IN THIS LEAGUE</span>
    </section>
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero-copy"><div class="eyebrow"><span class="line"></span>PADDY’S PUB PRESENTS <span class="muted">/</span> ${esc(cfg.name)}</div>
      <p class="tournament-title">${esc(cfg.tournamentName)}</p><h1 id="hero-heading">${champion ? 'A GOLDEN GOD<br>IS CROWNED.' : 'EIGHT TEAMS.<br>ONE GOLDEN GOD.'}</h1>
      <p class="hero-description">${championTeam ? `${esc(displayTeamName(championTeam))} takes the Kitten Mittens Cup. A five-star championship run.` : 'The gang takes fantasy football far too seriously.<br>Same Yahoo lineups. Wild card energy.'}</p>
      <div class="hero-facts"><span><b>08</b> TEAMS</span><span><b>03</b> ROUNDS</span><span><b>01</b> GOLDEN GOD</span></div></div>
      <div class="trophy-panel"><span class="trophy-overline">${championTeam ? 'THE GANG’S GOLDEN GOD' : 'THE PRIDE OF PADDY’S PUB'}</span><div class="trophy-art" role="img" aria-label="A golden kitten wearing four oversized mittens on a trophy pedestal">${trophy}</div><strong>${championTeam ? esc(displayTeamName(championTeam)) : 'THE KITTEN MITTENS CUP'}</strong><span>WEEKS ${cfg.quarterfinalWeek}–${cfg.quarterfinalWeek + 2} <i>✦</i> ${cfg.season}</span></div>
    </section>
    <section class="tournament-section" id="bracket" aria-labelledby="bracket-title">
      <div class="section-header"><div><div class="eyebrow">THE ROAD TO PADDY’S</div><h2 id="bracket-title">${champion ? 'A five-star performance.' : 'Who will poop the bed?'}</h2></div><div class="update-info"><span class="state-pill"><i></i>${esc(dataLabel)}</span>${remote ? `<span>Sheet published ${feedInfo.publishedAt ? new Date(feedInfo.publishedAt).toLocaleString() : '—'}</span><span>${feedInfo.receivedAt ? `Website checked ${new Date(feedInfo.receivedAt).toLocaleTimeString()}` : 'Connecting to Google Sheets…'}</span>` : ''}<span>${latestScoreUpdate ? `Scores saved ${new Date(latestScoreUpdate).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : remote ? 'No scores published yet' : state.updatedAt ? `Local save ${new Date(state.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Yahoo sync not connected'}</span></div></div>
      ${illustrative ? `<div class="draw-note">${state.preview ? 'This is your unapproved draw preview. The commissioner must approve and lock it before scoring begins.' : remote ? 'The commissioner has not approved an opening draw yet. No tournament scores have been published.' : 'Explore an illustrative bracket with fictional scores below. Your actual tournament has no approved draw yet.'}${local && !remote ? ' <a href="./commissioner.html">Open the commissioner workbench ↗</a>' : ''}</div>` : '<div class="bracket-note"><span>✓ Draw locked · fixed advancement paths</span><span>Winners advance only after commissioner confirmation.</span></div>'}
      <div class="round-tabs" role="group" aria-label="Choose bracket round">${ROUND_NAMES.map((name, r) => `<button type="button" data-round="${r}" aria-pressed="${r === currentRound}"><span>W${cfg.quarterfinalWeek + r}</span> ${name}</button>`).join('')}</div>
      <div class="bracket-grid">${ROUND_NAMES.map((name, r) => `<section class="bracket-round round-${r} ${r === currentRound ? 'mobile-active' : ''}" data-round-panel="${r}" aria-label="${name}"><div class="round-heading"><span class="round-number">0${r + 1}</span><div><h3>${name}</h3><span>WEEK ${cfg.quarterfinalWeek + r}</span><small class="round-flavor">${['Wild card energy', 'The gang narrows it down', 'The Kitten Mittens final'][r]}</small></div>${r === currentRound && !champion ? '<span class="round-current">CURRENT</span>' : r === 2 ? '<span class="tiny-star">✦</span>' : ''}</div><div class="round-matches">${view.matches.filter(m => m.round === r).map(m => renderMatch(view, m, illustrative && !state.preview && !remote)).join('')}</div></section>`).join('')}</div>
    </section>
    ${championTeam ? `<section class="champion-path"><div class="eyebrow">PATH TO VICTORY</div><h2>${esc(displayTeamName(championTeam))}</h2><div class="path-games">${state.matches.filter(m => m.winner === champion).map(m => `<div><span>WEEK ${cfg.quarterfinalWeek + m.round} · ${ROUND_NAMES[m.round]}</span><strong>${[champion, m.teamIds.find(id => id !== champion)].map(id => scoreText(scoreFor(state, id, cfg.quarterfinalWeek + m.round)?.actual)).join(' – ')}</strong><small>vs. ${esc(displayTeamName(cfg.teams.find(t => t.id === m.teamIds.find(id => id !== champion))))}</small></div>`).join('')}</div></section>` : ''}
    <section id="teams" class="teams-section" aria-labelledby="teams-title"><div class="section-header"><div><div class="eyebrow">THE USUAL SUSPECTS</div><h2 id="teams-title">The gang’s all here.</h2></div><span class="section-aside">${state.matches.some(m => m.finalizedAt) ? 'Ranked by tournament wins, then confirmed points' : 'Everybody thinks they’re a five-star team.'}</span></div><div class="team-grid">${totals.map(t => `<article class="contender">${avatar(t)}<div>${teamNameMarkup(t, 'h3')}<span class="contender-record">${t.record.wins}–${t.record.losses} record <span class="muted">/</span> ${t.total.toFixed(2)} pts</span></div>${t.record.losses ? '<span class="team-out">OUT</span>' : champion === t.id ? '<span class="team-out champion-tag">CHAMPION</span>' : ''}</article>`).join('')}</div><p class="small-note">Records and points include commissioner-confirmed tournament results only. <a href="./assets/avatars/credits.html">Portrait sources ↗</a></p></section>
    <section class="rules-section" id="rules" aria-labelledby="rules-title"><div class="rules-intro"><div class="eyebrow">BIRD LAW & BRACKET RULES</div><h2 id="rules-title">Chaos in the pub.<br>Order in the bracket.</h2><p>The commissioner handles the bird law. Yahoo handles the points. Your regular season keeps rolling.</p><a href="${esc(cfg.leagueUrl)}" target="_blank" rel="noopener noreferrer">Visit the Yahoo league ↗</a></div><div class="rules-grid"><article><span>01</span><h3>One lineup. Two schemes.</h3><p>Your normal Yahoo lineup and official weekly score count here too. No extra roster or lineup to manage.</p></article><article><span>02</span><h3>Wild card. Fair draw.</h3><p>No Week ${cfg.quarterfinalWeek - 1} or Week ${cfg.quarterfinalWeek} regular-season rematches. Every valid complete draw gets an equal chance. The commissioner approves the draw.</p></article><article><span>03</span><h3>Earn your Golden God status.</h3><p>Quarterfinals in Week ${cfg.quarterfinalWeek}, semifinals in Week ${cfg.quarterfinalWeek + 1}, the final in Week ${cfg.quarterfinalWeek + 2}. Paths stay fixed. Results advance only after confirmation.</p></article><article><span>04</span><h3>Even bird law needs a tiebreaker.</h3><p>${esc(tiebreaker)}</p></article></div></section>
  `;
  root.setAttribute('aria-busy', 'false');
  root.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-round]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    root.querySelectorAll('[data-round-panel]').forEach(p => p.classList.toggle('mobile-active', p.dataset.roundPanel === button.dataset.round));
  }));
  installImageFallbacks(root);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    if (!remote) {
      const state = loadState(); render(state); lastValid = state;
      return;
    }
    if (!cacheRead) {
      cacheRead = true;
      let saved = null;
      try { saved = cachedSnapshot(localStorage, dataSource.feedUrl); } catch { /* Storage may be disabled. */ }
      if (saved) {
        feedInfo = { receivedAt: saved.receivedAt, publishedAt: saved.payload.publishedAt };
        lastValid = saved.payload.state;
        render(lastValid);
      }
    }
    const payload = await fetchSnapshot(dataSource.feedUrl);
    feedInfo = { receivedAt: new Date().toISOString(), publishedAt: payload.publishedAt };
    render(payload.state);
    lastValid = payload.state;
    try { cacheSnapshot(localStorage, dataSource.feedUrl, payload, feedInfo.receivedAt); } catch { /* In-memory state is still valid. */ }
  } catch (error) {
    if (lastValid) render(lastValid, `Update failed. Showing the last valid data. ${error.message}`);
    else { root.innerHTML = `<div class="error-panel" role="alert"><h1>${remote ? 'The Google Sheets feed is not available yet.' : 'Tournament data needs attention.'}</h1><p>${esc(error.message)}</p>${local && !remote ? '<a href="./commissioner.html">Open recovery tools ↗</a>' : '<p>The website will retry automatically. Your saved tournament data has not been changed.</p>'}</div>`; root.setAttribute('aria-busy', 'false'); }
  } finally { refreshing = false; }
}
window.addEventListener('storage', event => { if (!remote && event.key === STORAGE_KEY) refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
if (remote) window.setInterval(() => { if (!document.hidden) refresh(); }, Math.max(30000, dataSource.refreshIntervalMs || 60000));
refresh();
