# Kitten Mittens Cup

An eight-team fantasy football tournament with an Always Sunny theme, locally bundled character portraits, and the Kitten Mittens trophy. Quarterfinals are Week 8, semifinals Week 9, and the championship Week 10 of 2026.

The [public website](https://nicholasrome-afk.github.io/kitten-mittens-cup/) reads a public, read-only feed from a **private commissioner-managed Google Sheet**. The commissioner explicitly approved public access to the tournament data. Visitors need no Google sign-in. Yahoo scoring is still manual.

Source and deployment history are in the [GitHub repository](https://github.com/nicholasrome-afk/kitten-mittens-cup). GitHub Pages publishes the tested static viewer whenever `main` changes. See [publishing and updates](docs/PUBLISHING.md) for setup, changes and troubleshooting.

## Run the website

Open Terminal and run:

```sh
cd /Users/nrome/Documents/Personal/FF
npm run dev
```

Leave Terminal open, then visit [the tournament](http://localhost:5173/). Stop the server with **Control + C**. Node.js 22 or newer is required; no npm dependencies need installing. The server watches its own code for changes.

## Run the tournament

Open the private commissioner spreadsheet in Google Drive, signed in as its owner. Use its **Tournament** menu.

1. Verify Teams, Settings and the actual Week 7/8 schedules. Enter real cumulative points through Week 7, or leave unknown totals blank. Save settings from the menu.
2. Generate a preview, review the four matchups, then explicitly approve and lock the draw.
3. Enter actual scores, optional projections and statuses on Scores. Valid user edits publish automatically; **Save and publish current scores** is the retry action.
4. Once Yahoo's weekly scores are complete, mark the round **awaiting-confirmation** and use **Review and finalize current round**. Review the displayed scores and winners before confirming. Only this action advances teams.

The website displays the saved, commissioner-approved draw and real published scores. Before draw approval it shows **Draw pending approval**; blank scores stay blank. Sheet publication and website check times appear above the bracket. Refreshes run every 60 seconds, with a 30-second public cache; allow roughly 90 seconds for an update. The viewer retains the last valid snapshot during a feed failure and displays a notice.

See [commissioner operating guide](docs/COMMISSIONER-SHEETS.md) for corrections, tiebreakers, backups, deployment updates and next-season reset. The old localhost commissioner page is disabled while Sheets mode is active.

## Rules and safeguards

- Every legal complete opening draw has an equal chance. The supplied Week 7/8 restrictions permit **31** complete matchings. Semifinal paths stay fixed after explicit draw approval.
- Provisional scores and projections never advance teams. Scores support blank, zero and negative values, with at most two decimals.
- The default tie rule uses actual cumulative points through Week 7. Unknown or equal totals require a participating team's stable ID in Bracket column N. Pending choices survive score saves.
- Finalized scores are protected. Reopening requires `REOPEN` and clears that round's winners and all later participants, scores and results. Reset requires `RESET <saved season>`. Protected hidden backups are retained before these actions.
- The Sheet is private. The public GET response explicitly includes only tournament fields; it excludes private audit notes, Yahoo team IDs and credentials. There is no public write or reset endpoint. Never put credentials in cells or public configuration.
- Google documents problems with [multiple signed-in accounts](https://developers.google.com/apps-script/guides/support/troubleshooting#issues_with_multiple_google_accounts). The website requests the public feed anonymously, without Google cookies; this was verified in the connected browser.

## Project files

- `config/data-source.js`: public deployment URL and refresh interval; no credentials.
- `config/league.js`: initial league configuration and schedules. Once initialized, the Sheet controls saved configuration.
- `config/characters.js`, `assets/avatars/`: character mapping, local portraits and source credits. Mac uses **Power Bottoms**, as confirmed by the commissioner.
- `src/tournament.js`: shared draw, scoring, advancement and reset engine.
- `src/sheets-model.js`: sheet rows, validation and public field allowlist.
- `src/feed.js`, `src/app.js`: anonymous feed loading, validated cache and viewer rendering.
- `google-apps-script/Code.gs`: generated bound Apps Script; rebuild with `npm run build:sheets`.
- `google-apps-script/Commissioner.source.js`: commissioner menu, private state, protections and read-only feed.

## Verification and status

```sh
npm test
npm run build
npm run check:preview
```

The preview check needs the local server running. It verifies the actual served module graph and all eight portraits. The static build produces `dist/` without commissioner administration, Apps Script or private state; building does not deploy anything.

**59 automated tests pass.** They cover the 31 legal draws against an independent permutation oracle, unbiased selection, scoring, ties, all rounds, corrections, reset, persistence, Sheets validation, generated Apps Script parity, public field filtering, spreadsheet-specific cache isolation, transport failures and browser cache isolation between website releases. The live public JSON/JSONP responses and connected browser were also verified, including all eight portraits and hidden commissioner links. All 20 native Sheets integration checks passed in a private practice copy, including a champion, ties, zero scores, corrections and reset; the real tournament snapshot was unchanged. Detailed verification is recorded in the setup guide.

Current stage: Google Sheets integration, native acceptance checks and GitHub Pages publication completed. The commissioner has chosen manual scoring in Google Sheets. Yahoo OAuth and automatic scoring are not enabled.
