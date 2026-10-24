import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';

test('a changed release bypasses cached modules and CSS under a Pages project path', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'tournament-build-'));
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const source = path.join(temp, 'source'), out = path.join(temp, 'dist');
    for (const entry of ['index.html', 'favicon.svg', 'src', 'config', 'assets']) {
      await cp(path.join(root, entry), path.join(source, entry), { recursive: true });
    }
    const origin = 'https://example.github.io/kitten-mittens-cup/';
    async function requestedAssets() {
      const html = await readFile(path.join(out, 'index.html'), 'utf8');
      const bootstrap = new URL(html.match(/<script[^>]+src="([^"]+)"/)[1], origin);
      const stylesheet = new URL(html.match(/<link rel="stylesheet" href="([^"]+)"/)[1], origin);
      const seen = new Set();
      async function visit(url) {
        if (seen.has(url.href)) return;
        seen.add(url.href);
        const relative = url.pathname.slice(new URL(origin).pathname.length);
        const text = await readFile(path.join(out, relative), 'utf8');
        if (url.href === bootstrap.href) await visit(new URL('./app.js', url));
        for (const match of text.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)) {
          await visit(new URL(match[1], url));
        }
      }
      await visit(bootstrap);
      await readFile(path.join(out, stylesheet.pathname.slice(new URL(origin).pathname.length)));
      seen.add(stylesheet.href);
      assert.equal(seen.size, 12, 'All viewer modules, configuration and CSS must resolve.');
      return seen;
    }
    const first = await buildSite(source, out);
    const cached = await requestedAssets();
    await writeFile(path.join(source, 'src/app.js'), (await readFile(path.join(source, 'src/app.js'), 'utf8')) + '\n// New release\n');
    const second = await buildSite(source, out);
    assert.notEqual(second, first);
    for (const url of await requestedAssets()) assert(!cached.has(url), `Browser would reuse cached ${url}`);
    assert.equal(await buildSite(source, out), second, 'Unchanged inputs keep stable URLs.');
    await assert.rejects(readFile(path.join(out, 'commissioner.html')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(out, `releases/${second}/src/commissioner.js`)), { code: 'ENOENT' });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
