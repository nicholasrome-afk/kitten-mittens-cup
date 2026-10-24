> This guide describes the legacy local-browser workbench. With Google Sheets mode active, use [the current Sheets operating guide](GOOGLE-SHEETS-SETUP.md) and the spreadsheet’s Tournament menu.

# Commissioner quick guide — Phase 1

This is a local practice tournament. Nothing entered here changes Yahoo. Google Sheets will become the shared source of truth in Phase 2.

## 1. Open the two pages

Run `npm run dev` from the project folder. In the same browser, open:

- [Tournament viewer](http://localhost:5173)
- [Commissioner workbench](http://localhost:5173/commissioner.html)

The initial viewer shows fictional scores so you can review the design. Those scores are not part of your saved tournament. Your actual draw starts unapproved.

## 2. Generate and lock

1. Click **Generate draw preview**. All eight teams appear exactly once. Both restricted weeks are automatically checked.
2. Click **Regenerate preview** as desired. No score entry is enabled yet.
3. Optional: open **Tiebreaker totals & tournament settings** to change the league name, tournament name or tiebreaker. Enter actual cumulative Week 7 totals if you have them; otherwise leave blank. Save.
4. Review the four matchups, then click **Approve & lock this draw**. Read and accept the confirmation.
5. Refresh the page. Verify the same draw remains and regenerate is disabled.

Match 01 and 02 winners feed semifinal 1. Match 03 and 04 winners feed semifinal 2. The semifinal winners meet in the final. No later draws take place.

## 3. Practice Week 8 scoring

1. Scroll to **Week 8 · Quarterfinals**.
2. Click **Fill fictional example scores** for a practice run, or enter your own local test numbers.
3. Choose **In progress** for live/provisional numbers. Projections are optional. Click **Save Week 8 scores**.
4. Look at the viewer. Scores should appear; nobody should have advanced yet.
5. When ready to confirm the practice round, click **Mark all awaiting confirmation**, then **Save Week 8 scores** again.
6. Click **Review & finalize saved scores**. Review the exact scores and winners in the confirmation before accepting.
7. Verify four winners appear in the fixed semifinal slots.

For real scoring later, Awaiting confirmation means you have reviewed the official Yahoo score after the week's games, rather than relying on a live lead or projection. Phase 1 does not check Yahoo finalization.

## 4. Play the semifinals and championship

Repeat the same score/save/review/finalize flow in Week 9, then Week 10. After the championship is confirmed, the viewer shows the champion, their 3–0 record, and their path through the three games.

## 5. Resolve a tie

- Default: the higher regular-season points total through Week 7 wins. Enter **both** teams' actual totals under settings before finalizing.
- If totals are equal or unavailable, choose the winner in that match's **Secondary tiebreaker winner** dropdown, then review/finalize.
- The commissioner-only tiebreaker can be selected before locking the draw.
- You cannot use the secondary selection to override unequal scores or a winner already determined by known Week 7 totals.

## 6. Correct a result safely

1. Expand **Local backups & activity** and click **Export local backup**.
2. At the earliest affected round, click **Reopen round & clear all later results**.
3. Read the warning and type `REOPEN`.
4. That round's scores are retained for editing, but its winners are cleared. Every later participant, score and result is cleared, including the champion.
5. Correct and save the retained scores, then review/finalize the round again. Re-enter later scores only for the newly confirmed participants.

To correct Week 7 tiebreaker totals after results are final, reopen the quarterfinals so that all final results are invalidated first. This conservative safeguard prevents a changed tiebreaker from silently contradicting an existing result.

## 7. Back up or restore

Export a backup after each finalized round. To restore, select that JSON file under **Restore a JSON backup**, then confirm replacement. Invalid backups are rejected. A successful restore updates your browser's viewer. Keep backups on your Mac; there are no secrets in these tournament files.

## 8. Reset practice / future season

1. Export a backup if you want to keep this tournament.
2. For a new season, first edit `config/league.js` with the new year, teams and that year's real restricted-week schedules. Reload the workbench and verify the configuration season shown in the reset section.
3. Expand **Explicit tournament reset / next season**, click reset, and type `RESET 2026` (or the current saved season displayed in the prompt).
4. Verify no draw is approved and no results remain. Generate and approve a new preview when ready.

Stop after reviewing this local version. Google Sheets setup is the next phase, with separate guided instructions.
