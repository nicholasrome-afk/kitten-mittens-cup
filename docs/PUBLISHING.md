# Publishing and updates

Share this link with the league: **https://nicholasrome-afk.github.io/kitten-mittens-cup/**

The public source repository is **https://github.com/nicholasrome-afk/kitten-mittens-cup**. Hosting uses GitHub Pages with GitHub Actions. Visitors need no account, and your computer does not need to stay on. The Google Sheet remains private; the website reads its approved public tournament feed.

## Scores, the draw and tournament results

Use the private Google Sheet's **Tournament** menu and Scores tab, as described in the [commissioner guide](COMMISSIONER-SHEETS.md). These updates do not require Git, a website rebuild or a new deployment. Allow roughly 90 seconds for the feed cache and viewer refresh.

The opening draw is published only after explicit commissioner approval; the website shows the saved bracket. The commissioner has chosen to enter Yahoo scores manually in Google Sheets.

## Website design or code changes

The local project is `/Users/nrome/Documents/Personal/FF` on branch `main`.

1. Make the changes in this project. For a local preview, open Terminal, run the commands below and keep that Terminal open:

   ```sh
   cd /Users/nrome/Documents/Personal/FF
   npm run dev
   ```

   Open http://localhost:5173/. Stop the server with **Control + C**. Node.js 22 or newer is required. This project has no npm dependencies to install.

2. In another Terminal window, check the change:

   ```sh
   cd /Users/nrome/Documents/Personal/FF
   npm test
   npm run build
   npm run check:preview
   ```

   The preview check requires the local server. Building writes `dist/` locally and does not publish it.

3. Open GitHub Desktop, signed in as the repository owner. Choose **File → Add Local Repository**, select `/Users/nrome/Documents/Personal/FF`, and add it. You only need to add the folder once. Confirm the current branch is **main**. Review the changed files, enter a commit summary, choose **Commit to main**, then **Push origin**. If Desktop says **Fetch origin**, there are no local commits waiting to be pushed.

4. Open the [Publish tournament workflow](https://github.com/nicholasrome-afk/kitten-mittens-cup/actions/workflows/pages.yml). Wait for the run associated with your commit to turn green, then open the public website. A failed test or build prevents that new version from deploying; the last successful deployment remains available.

For a clone on another computer, use GitHub Desktop's **File → Clone Repository → URL**, enter the repository URL above, and select a local folder. Install Node.js 22 or newer and run the same preview commands from that folder.

## Hosting configuration

The repository's **Settings → Pages → Build and deployment → Source** is **GitHub Actions**. The workflow lives at `.github/workflows/pages.yml`. It runs on pushes to `main` and can also be started manually with **Run workflow**. It tests with Node.js 22, builds `dist/`, uploads that folder, and deploys it to the `github-pages` environment. No hosting API key or secret is needed.

The build copies only the public viewer and assets. It excludes the localhost commissioner page, Apps Script administration, local backups and private setup records. The repository deliberately excludes environment files, preview screenshots and private Google setup records. The public feed URL in `config/data-source.js` is intentional; never replace it with credentials or a private token.

All site asset paths are relative, so they work under the `/kitten-mittens-cup/` project path. If the repository is renamed, update the links in these documents and use the URL shown in **Settings → Pages**.

Published JavaScript, configuration and CSS use a content-derived release directory. A new release gets new URLs throughout its module graph, so browsers do not reuse older code for an updated page. Legacy file paths remain available for older cached homepages. If a phone still has an older homepage open, reload it, or open the website with a new `?v=` query value once to request fresh HTML. This does not affect saved tournament data.

## Feed and deployment troubleshooting

- If the site is available but the data is stale, check the latest publication time in the Sheet's Settings cell B12. Use **Save and publish current scores** in the Sheet and allow roughly 90 seconds. A feed failure displays a notice and retains the last valid snapshot on devices that have already loaded one.
- If the Apps Script deployment URL changes, update `config/data-source.js`, test, commit and push. Editing Sheet scores alone does not change the URL. Replacing bound Apps Script code also requires updating its existing web-app deployment to a new version; keep its approved read-only access configuration.
- If a website update is missing, inspect the workflow run for that exact commit. Fix the reported error and push a new commit, or rerun the failed run after resolving a hosting setting.
- For a bad website release, revert its commit using GitHub Desktop's **History → right-click commit → Revert Changes in Commit**, then **Push origin**. This creates a new deployment without rewriting history. Reverting website code does not restore or change the separate Sheet's saved tournament results.

The commissioner guide covers scoring corrections, protected backups, reopening rounds and resetting for another season.
