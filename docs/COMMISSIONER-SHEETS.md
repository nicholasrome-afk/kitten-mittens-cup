# Commissioner operating guide

Open the private tournament spreadsheet in Google Drive, signed in as its owner. All administration uses its **Tournament** menu. Viewers use the public website and need no account.

## Before the draw

Verify Teams, Settings, and the actual Week 7/8 schedules. Stable team IDs stay fixed. Enter real cumulative points through Week 7 in Teams column H, or leave unknown totals blank. Choose **Save settings and Week 7 totals**.

Generate a preview and review the Draw tab. Regenerate if desired, then explicitly **Approve and lock draw**. The supplied schedules permit 31 equally likely complete draws. Approval fixes all later advancement paths.

## Each tournament week

1. Copy official Yahoo scores into the yellow Actual score cells on Scores. Projections are optional. Use the status dropdown; blank differs from zero, and scores allow up to two decimals.
2. Valid user edits publish automatically. Use **Save and publish current scores** if an edit was missed or values were written by a script/API. Script/API changes do not automatically trigger onEdit.
3. After checking Yahoo's completed weekly scores, mark the current round **awaiting-confirmation**.
4. Choose **Review and finalize current round**, review every score and proposed winner, then confirm. Only this action advances teams. Quarterfinals are Week 8, semifinals Week 9, and the championship Week 10.

The viewer checks every 60 seconds while visible; the feed has a 30-second cache. Allow roughly 90 seconds for updates. The latest publication time is recorded in Settings cell B12. The commissioner has chosen manual scoring.

## Ties and corrections

The default tie rule uses higher cumulative points through Week 7. If still unresolved, enter a participating team's stable ID in Bracket column N, then review finalization again. Pending choices survive score saves.

Finalized scores require **Reopen a round for a correction**. Type `REOPEN` to confirm clearing that round's winners and all later participants, scores and results. The opening draw stays locked. Protected hidden backups are retained.

**Restore sheet views from saved state** replaces visible edits with the last valid saved tournament and republishes it. It discards unsaved cell changes, without resetting saved results. Preserve the Sheet and backups if validation reports damaged internal data.

## Future seasons

Update the season, teams and actual restricted schedules, then use **Reset tournament / next season**. Enter the exact `RESET <saved season>` confirmation requested by the dialog. Reset clears the draw, scores, results and Week 7 totals. Verify the new inputs before approving any draw.

Keep the spreadsheet private. The public feed includes only tournament information. Never enter credentials or OAuth tokens in cells or public configuration. The localhost workbench is disabled while Sheets mode is active.
