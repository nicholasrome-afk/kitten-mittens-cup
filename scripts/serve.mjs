import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' };
// Serve only known frontend files. No directory listing, backups, dotfiles or secrets.
const allowed = /^(index\.html|commissioner\.html|favicon\.svg|src\/[a-z-]+\.(js|css)|config\/(league|characters|data-source)\.js|assets\/avatars\/([a-z-]+\.jpg|credits\.html))$/;
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Read-only local server.'); return; }
  // Defend the local commissioner workbench from DNS rebinding.
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) { res.writeHead(403); res.end('Use the printed localhost URL.'); return; }
  try {
    const requested = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname).replace(/^\//, '') || 'index.html';
    if (!allowed.test(requested)) throw new Error('Not found');
    const filename = await realpath(path.join(root, requested));
    if (!filename.startsWith(root)) throw new Error('Not found');
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://script.google.com https://script.googleusercontent.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Page not found.'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Reuse the existing preview, or stop it with Control+C first.` : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`\n  Midseason Championship · Phase 1\n  Bracket:      http://localhost:${port}\n  Commissioner: http://localhost:${port}/commissioner.html\n\n  Local only. Press Control+C to stop.\n`));
