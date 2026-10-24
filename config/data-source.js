// Public deployment URL only. Never add credentials or private Google tokens.
// Verified public read-only feed; the underlying spreadsheet stays private.
export const dataSource = {
  mode: 'google-sheets', // 'local' or 'google-sheets'
  feedUrl: 'https://script.google.com/macros/s/AKfycby6LPNkqgKSmbFTK-1J1MR2mQiB-gMTOaQOKfPQuuZR-1BjGVVIngc4qBqrCllF9tXB/exec',
  refreshIntervalMs: 60000
};
