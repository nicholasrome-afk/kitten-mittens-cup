import { characterForTeam } from '../config/characters.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const scoreText = value => value === null || value === undefined ? '—' : value.toFixed(2);
export const statusLabel = status => ({ 'not-started': 'Not started', 'in-progress': 'In progress', 'awaiting-confirmation': 'Awaiting confirmation', final: 'Final' })[status];
export function safeColor(color) { return /^#[0-9a-f]{6}$/i.test(color) ? color : '#a3b4ab'; }
export function avatar(team, className = '') {
  const profile = characterForTeam(team);
  const url = profile.logoUrl || '';
  let safeUrl = '';
  if (/^\.\/assets\/avatars\/[a-z-]+\.jpg$/.test(url)) safeUrl = url;
  else try { if (new URL(url).protocol === 'https:') safeUrl = url; } catch { /* Use initials. */ }
  const position = /^\d{1,3}% \d{1,3}%$/.test(profile.portraitPosition || '') ? profile.portraitPosition : '50% 50%';
  const crop = profile.portraitCrop;
  const hasCrop = crop && Object.values(crop).every(value => Number.isFinite(value) && Math.abs(value) <= 500);
  const cropStyle = hasCrop ? `;--portrait-width:${crop.width}%;--portrait-left:${crop.left}%;--portrait-top:${crop.top}%` : '';
  return `<span class="avatar ${safeUrl ? 'has-portrait' : ''} ${hasCrop ? 'face-crop' : ''} ${className}" style="--team-color:${safeColor(team?.color || '')};--portrait-position:${position}${cropStyle}"><span aria-hidden="true">${escapeHtml(profile.initials || team?.name?.slice(0, 2).toUpperCase() || '?')}</span>${safeUrl ? `<img src="${escapeHtml(safeUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}
export function teamNameMarkup(team, tag = 'span') {
  tag = tag === 'h3' ? 'h3' : 'span';
  const profile = characterForTeam(team);
  const primary = profile.characterName || team.name;
  return `<${tag} class="team-name">${escapeHtml(primary)}</${tag}>${profile.characterName ? `<span class="yahoo-name">(${escapeHtml(profile.yahooName)})</span>` : ''}`;
}
export function installImageFallbacks(root = document) {
  root.querySelectorAll('.avatar img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
}
// Original vector statuette: a golden kitten with four oversized knit mittens.
export const trophy = `<svg viewBox="0 0 240 240" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="kitten-gold" x1="67" y1="24" x2="168" y2="189" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff1bc"/><stop offset=".46" stop-color="#deb461"/><stop offset="1" stop-color="#8c642e"/>
    </linearGradient>
    <linearGradient id="mitten-knit" x1="83" y1="103" x2="156" y2="175" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff8e1"/><stop offset="1" stop-color="#d9cba3"/>
    </linearGradient>
  </defs>
  <circle cx="120" cy="112" r="94" stroke="#efd294" stroke-opacity=".10"/>
  <circle cx="120" cy="112" r="74" stroke="#efd294" stroke-opacity=".08"/>
  <path d="M96 151c-35 5-45-19-35-40 7-14 8-25-1-31" stroke="url(#kitten-gold)" stroke-width="12" stroke-linecap="round"/>
  <path d="M104 88c-5 15-22 32-20 54 1 21 17 31 36 31s35-10 36-31c2-22-15-39-20-54" fill="url(#kitten-gold)"/>
  <path d="M113 100c-8 12-12 30-8 43 3 10 9 16 15 16s12-6 15-16c4-13 0-31-8-43" fill="#fff0ba" opacity=".27"/>
  <path d="m83 53-1-32 26 14c8-3 16-3 24 0l26-14-1 32c12 24-7 45-37 45S71 77 83 53Z" fill="url(#kitten-gold)"/>
  <path d="m89 47-1-15 14 9m36 0 14-9-1 15" fill="#93612f" opacity=".65"/>
  <path d="M99 61c3-4 8-4 11 0m20 0c3-4 8-4 11 0" stroke="#573d23" stroke-width="3" stroke-linecap="round"/>
  <path d="m115 72 5 5 5-5h-10Z" fill="#75502f"/>
  <path d="M120 77v5m0 0c-3 4-7 4-10 1m10-1c3 4 7 4 10 1M101 74l-17-3m17 10-16 3m54-10 17-3m-17 10 16 3" stroke="#75502f" stroke-width="1.6" stroke-linecap="round"/>
  <path d="m103 114-17-7m51 7 17-7" stroke="url(#kitten-gold)" stroke-width="14" stroke-linecap="round"/>
  <g fill="url(#mitten-knit)" stroke="#a98c55" stroke-width="1.5">
    <path d="M70 101c0-8 5-13 12-13s11 5 11 13v7c7-6 13 1 9 7l-10 13H73c-3-9-3-18-3-27Z"/>
    <path d="M170 101c0-8-5-13-12-13s-11 5-11 13v7c-7-6-13 1-9 7l10 13h19c3-9 3-18 3-27Z"/>
    <path d="M87 160c0-9 6-15 14-15s14 6 14 15v11H87v-11Z"/>
    <path d="M125 160c0-9 6-15 14-15s14 6 14 15v11h-28v-11Z"/>
  </g>
  <g fill="#bba274" stroke="#9b7d4a" stroke-width="1">
    <rect x="72" y="124" width="22" height="7" rx="2"/>
    <rect x="146" y="124" width="22" height="7" rx="2"/>
    <rect x="86" y="168" width="30" height="7" rx="2"/>
    <rect x="124" y="168" width="30" height="7" rx="2"/>
  </g>
  <g stroke="#9b7d4a" stroke-width="1" stroke-linecap="round" opacity=".7">
    <path d="m77 104 4 4 4-4m-8 9 4 4 4-4m70-9 4 4 4-4m-8 9 4 4 4-4m-69 39 4 4 4-4m30 0 4 4 4-4"/>
  </g>
  <path d="M91 179h58l10 12H81l10-12Z" fill="url(#kitten-gold)"/>
  <rect x="76" y="191" width="88" height="16" rx="2" fill="#bb914c"/>
  <rect x="68" y="207" width="104" height="7" rx="2" fill="#78552d"/>
  <rect x="99" y="195" width="42" height="8" rx="1" fill="#604724"/>
  <path d="m108 197 2 2-2 2m4-4-2 2 2 2m7-4v4m0-4 3 3 3-3v4m8-4h-4v2h3v2h-4" stroke="#efcf86" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M120 8v6m83 94h7M30 108h7m146-71-4 5M57 37l4 5" stroke="#edce86" stroke-width="2" stroke-linecap="round"/>
</svg>`;
