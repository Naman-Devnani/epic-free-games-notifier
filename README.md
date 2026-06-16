# Epic Free Games Notifier

![Notify Epic Free Games](https://github.com/Naman-Devnani/epic-free-games-notifier/actions/workflows/notify.yml/badge.svg)

Tiny GitHub Actions workflow that emails you whenever the Epic Games Store has a new free game.

The email contains a pre-filled "Claim now" button for each game and, when there are 2+ games, a single "Claim all N" button at the top that loads every game into one checkout. You finish by pressing "Add to library" on Epic. The games are free, so no payment screen. Human stays in the loop, nothing automates Epic's checkout.

> **Epic UI quirk:** the "Claim all" checkout page only *displays* one of the games, but clicking "Add to library" once claims **all** the games in the link (the order includes every offer — verified on a fresh account). The banner says so up front so it isn't alarming.

## How it works

1. **An external scheduler (cron-job.org)** triggers the workflow **Friday, Saturday and Sunday at 11:00 AM IST** by POSTing a `repository_dispatch` event — this fires on time, to the second (see [Precise scheduling](#precise-scheduling)). GitHub's own `schedule` cron (~11:17 AM IST) is kept as a free backup in case the external scheduler ever misses, but it is best-effort and often delayed 1-3 hours. Epic's weekly free games drop Thursday 10:30 PM IST; Friday's run catches them, Sat/Sun are backups in case Friday fails.
2. The job hits Epic's public `freeGamesPromotions` API, the same endpoint Epic's homepage uses. No auth, no browser, no login. Fetches have a 10 s timeout and retry up to 3 times on transient errors (4xx and parse errors fail fast).
3. Game IDs are diffed against `state/notified.json` (committed to the repo) so the same email never goes out twice.
4. If anything is new, one HTML email is sent. Each game gets its own card (artwork, description, expiry, "Claim now" button) and a "Claim all N" banner appears at the top when 2+ games are bundled.
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

## Precise scheduling

GitHub's `schedule` cron is best-effort: scheduled runs are deprioritized and routinely fire 1-3 hours late. For on-time delivery, a free external scheduler pings GitHub's API at the exact minute, which fires the `repository_dispatch` trigger — those events run within seconds.

**1. Create a GitHub token** (fine-grained, minimal scope):

- GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
- Repository access: **Only select repositories** → this repo.
- Permissions: **Contents → Read and write** (this is what authorizes `repository_dispatch`).
- Expiration: set a reminder to rotate it before it lapses (or use "No expiration" if you accept the risk).
- Copy the token (starts with `github_pat_`).

**2. Create the cron job at [cron-job.org](https://cron-job.org)** (free, no card, 1-minute resolution):

- Sign up, then **Create cronjob**.
- **URL:** `https://api.github.com/repos/Naman-Devnani/epic-free-games-notifier/dispatches`
- **Schedule:** custom → Friday, Saturday, Sunday at **11:00**. Set the account timezone to **Asia/Kolkata** (Settings → Timezone) so 11:00 means 11:00 IST.
- **Request method:** `POST`
- **Headers** (Advanced → Headers):
  | Key | Value |
  |---|---|
  | `Accept` | `application/vnd.github+json` |
  | `Authorization` | `Bearer github_pat_…your token…` |
  | `X-GitHub-Api-Version` | `2022-11-28` |
  | `User-Agent` | `epic-free-games-cron` |
- **Request body:** `{"event_type":"run-notify"}`
- Save. Use cron-job.org's **"Run now"** / "Test run" to confirm you get HTTP `204` back and a run appears in the Actions tab.

The workflow listens for `repository_dispatch` of type `run-notify`, so the body's `event_type` must match exactly.

> **Why a backup cron too?** The workflow keeps GitHub's `schedule` trigger (~11:17 AM IST) so that if cron-job.org is ever down or the token expires, you still get a (late) email instead of silence. The dedup state file means the backup run is a harmless no-op when the on-time run already sent.

### Using a non-Gmail SMTP server

The code reads `SMTP_HOST` and `SMTP_PORT` from env vars (defaulting to `smtp.gmail.com:587`). To use Outlook, SendGrid, Mailgun, etc., edit the workflow's `env:` block:

```yaml
SMTP_HOST: smtp.your-provider.com
SMTP_PORT: '465'   # 465 enables TLS, 587 uses STARTTLS
```

### Changing the displayed timezone

Expiry times in the email are rendered in `DISPLAY_TZ` (an IANA zone, default `Asia/Kolkata`). To show a different zone, edit the `DISPLAY_TZ` value in the workflow's `env:` block, e.g. `America/New_York` or `UTC`.

## Manual operations

**Dry run.** Verify the code without sending an email or changing state. Actions tab → "Notify Epic Free Games" → "Run workflow" → set `dry_run` to `true`. Logs will show what *would* have been sent.

**Type-check locally.** Requires Node 22+. From the repo root:
```sh
npm install        # one-time
npm run typecheck  # runs tsc --noEmit, no build artifacts produced
```

**Reset notification state.** Edit `state/notified.json` directly in the repo (commit the change). Setting it to `[]` will re-notify about every currently free game on the next run.

**Pause notifications.** Settings → Actions → General → Disable Actions for this repository. Or open the "Notify Epic Free Games" workflow page and click "Disable workflow". Re-enable any time. Deleting one of the secrets also stops it (the run goes red and the failure email fires once, then nothing until you restore the secret).

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
- **"Claim" links assume you're signed in to Epic.** The buttons link straight to Epic's checkout so a signed-in click lands directly on "Add to library". If you click while signed out, Epic shows an "Account id is missing" page — just sign in and click the link again. (The alternative, wrapping in Epic's login flow, forced a "switch account" chooser on *every* claim, which was worse.)
- **"Claim all" checkout shows only one game.** Epic's free-game overlay renders just one of the bundled games even though clicking "Add to library" claims all of them. Cosmetic Epic bug, not a claim failure — the email banner calls this out so it isn't mistaken for a broken link.
