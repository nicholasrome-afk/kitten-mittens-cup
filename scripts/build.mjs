import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'src'), { recursive: true });
await mkdir(path.join(out, 'config'), { recursive: true });
for (const file of ['index.html', 'favicon.svg', 'config/league.js', 'config/characters.js', 'config/data-source.js', 'src/bootstrap.js', 'src/app.js', 'src/styles.css', 'src/storage.js', 'src/demo.js', 'src/tournament.js', 'src/sheets-model.js', 'src/feed.js', 'src/ui.js']) {
  await cp(path.join(root, file), path.join(out, file));
}
await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
console.log('Static viewer built in dist/. Commissioner page, Apps Script administration and private state excluded. Not deployed.');
