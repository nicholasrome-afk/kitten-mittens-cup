// Check the RUNNING server's complete module graph, not just files on disk.
// This catches stale server allowlists that pass syntax/unit tests but return 404.
import http from 'node:http';
import assert from 'node:assert/strict';
import { characters } from '../config/characters.js';

const port = Number(process.env.PORT || 5173);
const origin = `http://localhost:${port}`;
const visited = new Set();

function get(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: pathname, headers: { Host: `localhost:${port}` } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('The local preview did not respond.')));
  });
}

async function moduleGraph(pathname) {
  if (visited.has(pathname)) return;
  visited.add(pathname);
  const response = await get(pathname);
  assert.equal(response.status, 200, `${pathname} did not load. Restart the local preview server.`);
  assert.match(response.type, /javascript/, `${pathname} was not served as JavaScript.`);
  const imports = [...response.body.toString().matchAll(/^\s*import\s+(?:[^'"\n;]*?\bfrom\s*)?["']([^"']+)["']/gm)].map(match => match[1]);
  for (const specifier of imports) await moduleGraph(new URL(specifier, origin + pathname).pathname);
}

try {
  const page = await get('/');
  assert.equal(page.status, 200);
  const entry = page.body.toString().match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
  assert(entry, 'Homepage has no script entry.');
  await moduleGraph(new URL(entry, origin).pathname);
  // Dynamic bootstrap entries are deliberately selected at runtime.
  await moduleGraph('/src/app.js');
  await moduleGraph('/src/commissioner.js');
  for (const profile of Object.values(characters)) {
    const path = new URL(profile.logoUrl, origin).pathname;
    const image = await get(path);
    assert.equal(image.status, 200, `${profile.characterName}'s portrait did not load.`);
    assert.match(image.type, /^image\/jpeg/);
    assert(image.body.subarray(0, 3).equals(Buffer.from([255, 216, 255])), `${path} is not a JPEG.`);
  }
  console.log(`Running preview verified: ${visited.size} JavaScript modules and all 8 character portraits returned valid responses on port ${port}.`);
} catch (error) {
  console.error(`Preview check failed: ${error.message}`);
  process.exitCode = 1;
}
