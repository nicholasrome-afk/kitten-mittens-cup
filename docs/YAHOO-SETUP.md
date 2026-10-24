# Connecting Yahoo scoring

**Deferred by the commissioner: scoring will be entered manually in Google Sheets.** This document is retained as a reference; no Yahoo connection or scheduled import is being configured.

Checked against Yahoo's official developer pages on October 24, 2026. **Yahoo automatic scoring is not installed or enabled yet.** Manual Google Sheets scoring continues to work.

## First: request Fantasy Sports API access

Yahoo currently requires an application and review before granting Fantasy Sports API access. Its [access application](https://sports.yahoo.com/developer/access/) asks for the product, data required and intended users, including personal or single-league use. New applicants without a Yahoo Developer Network application may leave Client ID blank. The form currently states that API access is read-only.

Enter your own accurate contact details. Suggested product information:

- Product: **Kitten Mittens Cup**
- Website: **https://nicholasrome-afk.github.io/kitten-mittens-cup/**
- Expected users: **Small (< 1,000 users)**; describe the eight league members in the use case.
- Project description: **A personal, noncommercial fantasy football tournament website for one eight-team Yahoo league.**
- Intended use case:

  > Read team identifiers, the regular-season Week 7/8 schedule, cumulative team points through Week 7, and weekly team fantasy scores for Weeks 8–10 in the 2026 NFL season. Request projections if available. Use these to update a separate midseason tournament bracket for the eight league members approximately every 15–30 minutes during games. The bracket is publicly viewable at the website URL. A private Google Sheet manages tournament administration, and the commissioner confirms final results. The integration requests read access only and does not change Yahoo rosters, lineups, transactions or league settings.

This text describes the proposed integration, not an already connected service. Review the form and Yahoo's terms yourself before submitting. Yahoo controls approval and timing. The [developer portal](https://sports.yahoo.com/developer/) describes application, review and access; its [application confirmation page](https://sports.yahoo.com/developer/application-confirmation/) provides follow-up instructions for approved applicants.

## After approval

We will work through these steps with the commissioner; they are not completed by entering the league number or checking a setting:

1. Register or configure the Yahoo application as instructed by Yahoo, with **Fantasy Sports – Read** permission. Use the product name and website above. Request no write permission.
2. Install a private Apps Script authorization and synchronization component. Its actual callback URL must be registered exactly in the Yahoo app before authorization. The current public read-only feed and GitHub Pages homepage are not OAuth callback handlers.
3. Store the client ID, client secret and OAuth tokens in private Apps Script properties accessible only to trusted project editors. Never put them in Sheet cells, browser JavaScript, GitHub, the public feed or chat. Use the Yahoo sign-in for an account that belongs to the league, then approve read access on Yahoo's consent screen.
4. Use Yahoo's authorization-code flow to obtain access and refresh tokens. Refresh expired access tokens server-side and retain a replacement refresh token if Yahoo rotates it. See [Yahoo's OAuth documentation](https://developer.yahoo.com/oauth2/guide/flows_authcode/).
5. Discover and verify the **2026 NFL game key**, the full league key for league **748802**, and all eight team keys. Match the Yahoo teams to the existing stable tournament IDs and inspect the mapping before saving. A numeric league ID alone is insufficient. Verify the stored restricted schedules against Yahoo before relying on the imported mapping. See [Yahoo's Fantasy API reference](https://sports.yahoo.com/developer/docs/).
6. Test a real authenticated read and a score import. Fetch the specified tournament week's team points, rather than copying Yahoo matchup winners. Yahoo's regular-season opponents differ from this tournament's opponents. Import cumulative Week 7 totals for tiebreakers and projections only where supported.
7. After a successful test, enable an Apps Script time-driven trigger, initially every **15 minutes** during the configured tournament/game window. Google supports 15-minute triggers, but actual freshness also depends on Yahoo's data and quotas. Script changes must explicitly publish the validated state because script/API writes do not trigger onEdit. See [Google's trigger documentation](https://developers.google.com/apps-script/reference/script/clock-trigger-builder).

## Required integration behavior

Scores remain provisional until the commissioner confirms the completed round. Synchronization must preserve the locked draw, finalized rounds and downstream paths, record the last successful fetch, and avoid importing incomplete responses as zero scores. Errors retain the last valid state and show a useful status. Automatic scoring needs a pause/disable action so manual corrections remain practical. Add Yahoo's required attribution when its data is displayed.

No Yahoo credentials, token exchange, real league retrieval or scheduled import has been verified yet. The immediate next action is the API access application, unless the commissioner already has approved Fantasy Sports access.
