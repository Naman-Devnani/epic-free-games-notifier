# Epic Free Games Notifier

![Notify Epic Free Games](https://github.com/Naman-Devnani/epic-free-games-notifier/actions/workflows/notify.yml/badge.svg)

Tiny GitHub Actions workflow that emails you whenever the Epic Games Store has a new free game.

The email contains a pre-filled "Claim now" button for each game and, when there are 2+ games, a single "Claim all N" button at the top that loads every game into one checkout in one click. You finish by pressing Place Order on Epic — the games are free, no payment screen. Human stays in the loop, nothing automates Epic's checkout.

## How it works

1. **Cron** triggers the workflow **Friday, Saturday and Sunday at 11:00 AM IST** (05:30 UTC). Epic's weekly free games drop Thursday 10:30 PM IST; Friday's run catches them, Sat/Sun are backups in case Friday fails.
2. The job hits Epic's public `freeGamesPromotions` API — the same endpoint Epic's homepage uses. No auth, no browser, no login. Fetches have a 10 s timeout and retry up to 3 times on transient errors (4xx and parse errors fail fast).
3. Game IDs are diffed against `state/notified.json` (committed to the repo) so the same email never goes out twice.
4. If anything is new, one HTML email is sent — each game gets its own card (artwork, description, expiry, "Claim now" button) and a "Claim all N" banner appears at the top when 2+ games are bundled.
5. If the workflow fails (Epic API down, SMTP rejected, state file corrupted), a separate failure-notification email is sent so you don't silently miss free games.
6. A second job, **cleanup**, runs after each notify job and deletes old workflow runs (keeps the 2 most recent, anything older than 1 day gets pruned) so the Actions tab stays tidy.

Roughly 375 lines of TypeScript, zero browser automation.

## Setup

Add three repository secrets (Settings → Secrets and variables → Actions):

| Name | Value |
|---|---|
| `SMTP_USER` | Gmail address used as the sender |
| `SMTP_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) (16 chars, no spaces). Requires 2FA on the Google account. |
| `EMAIL_TO` | Where to send the notification (can match `SMTP_USER`) |

Then either wait for the next scheduled run or trigger it manually from the Actions tab.

### Using a non-Gmail SMTP server

The code reads `SMTP_HOST` and `SMTP_PORT` from env vars (defaulting to `smtp.gmail.com:587`). To use Outlook, SendGrid, Mailgun, etc., edit the workflow's `env:` block:

```yaml
SMTP_HOST: smtp.your-provider.com
SMTP_PORT: '465'   # 465 enables TLS, 587 uses STARTTLS
```

## Manual operations

**Dry run** — verify the code without sending an email or changing state. Actions tab → "Notify Epic Free Games" → "Run workflow" → set `dry_run` to `true`. Logs will show what *would* have been sent.

**Type-check locally** — requires Node 22+. From the repo root:
```sh
npm install        # one-time
npm run typecheck  # runs tsc --noEmit, no build artifacts produced
```

**Reset notification state** — edit `state/notified.json` directly in the repo (commit the change). Setting it to `[]` will re-notify about every currently free game on the next run.

**Pause notifications** — Settings → Actions → General → Disable Actions for this repository. Or open the "Notify Epic Free Games" workflow page and click "Disable workflow". Re-enable any time. Deleting one of the secrets also stops it (the run goes red and the failure email fires once, then nothing until you restore the secret).

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
