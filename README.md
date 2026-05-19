# Epic Free Games Notifier

Tiny GitHub Actions workflow that emails me whenever the Epic Games Store has a new free game.

It emails a pre-filled checkout link rather than auto-purchasing — one click on **Place Order** claims the games. Keeps a human in the loop and keeps the whole flow off Epic's bot-detection systems.

## How it works

1. Cron triggers the workflow **Friday, Saturday and Sunday at 11:00 AM IST** (05:30 UTC). Epic's weekly free games drop Thursday 10:30 PM IST; Friday's run catches them, Sat/Sun are backups in case Friday fails.
2. The job hits Epic's public `freeGamesPromotions` API — the same endpoint Epic's homepage uses. No auth, no browser, no login. Fetches have a 10 s timeout and retry up to 3 times on transient errors (4xx and parse errors fail fast).
3. Game IDs are diffed against `state/notified.json` (committed to the repo) so the same email never goes out twice.
4. If anything is new, one HTML email is sent with each game's artwork, description, expiry, and a per-game "Claim now" button. When there are 2+ games, a blue "Claim all N" banner at the top links to a bundled checkout URL so one Place Order claims everything.
5. If the workflow fails (Epic API down, SMTP rejected, state file corrupted), a separate failure-notification email is sent so you don't silently miss free games.

That's it. ~250 lines of TypeScript, zero browser automation.

## Setup

Add three repository secrets (Settings → Secrets and variables → Actions):

| Name | Value |
|---|---|
| `SMTP_USER` | Gmail address used as the sender |
| `SMTP_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) (16 chars, no spaces). Requires 2FA on the Google account. |
| `EMAIL_TO` | Where to send the notification (can match `SMTP_USER`) |

Then either wait for the next scheduled run or trigger it manually from the Actions tab.

## Manual operations

**Dry run** — verify the code without sending an email or changing state. Actions tab → "Notify Epic Free Games" → "Run workflow" → set `dry_run` to `true`. Logs will show what *would* have been sent.

**Type-check locally** — `npm run typecheck` (runs `tsc --noEmit`, no build artifacts produced).

**Reset notification state** — edit `state/notified.json` directly in the repo (commit the change). Setting it to `[]` will re-notify about every currently free game on the next run.

## Files

| File | Purpose |
|---|---|
| `src/epic.ts` | Calls Epic's public API, picks current free promos, builds checkout URLs |
| `src/state.ts` | Reads/writes `state/notified.json` (throws on corrupt JSON rather than silently re-sending) |
| `src/notify.ts` | Composes the HTML email and sends via nodemailer |
| `src/index.ts` | Orchestrates the flow, supports `DRY_RUN` |
| `.github/workflows/notify.yml` | Schedule, secrets wiring, state commit, failure email, cleanup |

## Known limitations

- **Failure email shares SMTP creds with the main email.** If your Gmail App Password is revoked, neither the free-games email nor the failure email can send. The only signal is the workflow turning red in the Actions tab.
- **No reminders.** If you ignore the email, you won't be re-notified about the same game. The dedup-by-ID logic is permanent.
- **Country hardcoded to US.** Epic's free games are usually global, so this doesn't matter in practice; the `country=US` parameter is only for catalog metadata.
