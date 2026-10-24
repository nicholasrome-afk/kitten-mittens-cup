import { parsePublicPayload } from './sheets-model.js';

export function validateFeedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) throw new Error('Use the published Google Apps Script /exec URL, without query parameters.');
  return url;
}

// Apps Script documents JSONP for cross-origin, non-sensitive read-only feeds.
// Only the configured Google deployment is loaded. Callback names are random,
// constrained identifiers and are checked again by the publishing script.
export function fetchSnapshot(endpoint, { timeoutMs = 12000, doc = globalThis.document, scope = globalThis.window, random = globalThis.crypto, timers = globalThis } = {}) {
  const url = validateFeedUrl(endpoint);
  const bytes = random.getRandomValues(new Uint8Array(12));
  const callback = `__tournamentFeed_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  url.searchParams.set('callback', callback);
  url.searchParams.set('t', String(Date.now()));
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    let settled = false;
    let timer;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      script.remove();
      delete scope[callback];
      if (error) reject(error); else resolve(value);
    }
    scope[callback] = payload => {
      try { finish(null, parsePublicPayload(payload)); }
      catch (error) { finish(new Error(`The feed returned invalid tournament data. ${error.message}`)); }
    };
    script.async = true;
    // This public feed needs no Google session. Omit cross-origin cookies so
    // Google's multi-account routing cannot rewrite the deployment URL.
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.src = url.href;
    script.onerror = () => finish(new Error('Could not reach the Google Sheets feed. Check that the web app is deployed for Anyone with Execute as Me.'));
    timer = timers.setTimeout(() => finish(new Error('The Google Sheets feed timed out. Showing the most recent valid data when available.')), timeoutMs);
    doc.head.append(script);
  });
}

export function cachedSnapshot(storage, endpoint) {
  try {
    const raw = storage.getItem(`midseason-public-v1:${endpoint}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    parsePublicPayload(entry.payload);
    if (!Number.isFinite(Date.parse(entry.receivedAt))) return null;
    return entry;
  } catch { return null; }
}
export function cacheSnapshot(storage, endpoint, payload, receivedAt) {
  parsePublicPayload(payload);
  try { storage.setItem(`midseason-public-v1:${endpoint}`, JSON.stringify({ payload, receivedAt })); }
  catch { /* In-memory state still works when browser storage is unavailable. */ }
}
