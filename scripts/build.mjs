import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const viewerFiles = ['config/league.js', 'config/characters.js', 'config/data-source.js', 'src/bootstrap.js', 'src/app.js', 'src/styles.css', 'src/storage.js', 'src/demo.js', 'src/tournament.js', 'src/sheets-model.js', 'src/feed.js', 'src/ui.js'];

export async function buildSite(source = root, out = path.join(root, 'dist')) {
  const html = await readFile(path.join(source, 'index.html'), 'utf8');
  const files = await Promise.all(viewerFiles.map(async file => [file, await readFile(path.join(source, file))]));
  const hash = createHash('sha256').update(html);
  for (const [file, bytes] of files) hash.update(file).update('\0').update(bytes);
  const release = hash.digest('hex').slice(0, 16);
  const prefix = `releases/${release}`;
  await rm(out, { recursive: true, force: true });
  // Version the complete module graph, including bootstrap's dynamic import.
  // Relative imports remain inside this release, even when older URLs are cached.
  for (const [file, bytes] of files) {
    for (const destination of [file, `${prefix}/${file}`]) {
      await mkdir(path.dirname(path.join(out, destination)), { recursive: true });
      await writeFile(path.join(out, destination), bytes);
    }
  }
  const publishedHtml = html
    .replace('href="./src/styles.css"', `href="./${prefix}/src/styles.css"`)
    .replace('src="./src/bootstrap.js"', `src="./${prefix}/src/bootstrap.js"`);
  if (!publishedHtml.includes(`./${prefix}/src/styles.css`) || !publishedHtml.includes(`./${prefix}/src/bootstrap.js`)) {
    throw new Error('The homepage must load the versioned viewer stylesheet and bootstrap.');
  }
  await writeFile(path.join(out, 'index.html'), publishedHtml);
  await cp(path.join(source, 'favicon.svg'), path.join(out, 'favicon.svg'));
  await cp(path.join(source, 'assets'), path.join(out, 'assets'), { recursive: true });
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = await buildSite();
  console.log(`Static viewer built in dist/ (release ${release}). Commissioner administration and private state excluded. Not deployed.`);
}
