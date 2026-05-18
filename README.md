# Epic Free Games Notifier

Tiny GitHub Actions workflow that emails me whenever the Epic Games Store has a new free game.

## How it works

1. Cron triggers the workflow Thursday 18:00 UTC (one hour after Epic''s weekly drop), with backup runs on Friday and Monday.
2. The job hits Epic''s public `freeGamesPromotions` API - the same endpoint Epic''s own homepage uses. No auth, no browser, no login.
3. Game IDs are diffed against `state/notified.json` (committed to the repo) so the same email never goes out twice.
4. If anything is new, an HTML email is sent with each game''s artwork, description, expiry, and a one-click claim link.

That''s it. ~200 lines of TypeScript, zero browser automation.

## Why not just use `epicgames-freegames-node`?

That tool is great if you''re self-hosting on a NAS or home server, but for a hosted-CI-only setup it''s overkill:

| Concern | `epicgames-freegames-node` | This repo |
|---|---|---|
| Runtime | Docker + Chromium + Puppeteer | Plain Node.js |
| Auth | Device-code login + session cookies | None - public API |
| Public ingress | Needs a tunnel (localtunnel / cloudflared) for login redirects | Not needed |
| Bot-detection surface | Browser navigates `store.epicgames.com` | Just a static JSON endpoint |
| Config schema | Multi-account, 10+ notifier types, web portal options | 3 secrets |
| Code size | Thousands of lines | A handful of files |

The trade-off: this version does **not** auto-purchase. It emails you a pre-filled checkout link and you press "Place Order" yourself. For weekly free games that''s a ten-second click, and it keeps the whole flow off Epic''s bot-detection radar.

## Setup

Add three repository secrets (Settings -> Secrets and variables -> Actions):

| Name | Value |
|---|---|
| `SMTP_USER` | Gmail address used as the sender |
| `SMTP_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) (16 chars, no spaces). Requires 2FA on the Google account. |
| `EMAIL_TO` | Where to send the notification (can match `SMTP_USER`) |

Then either wait for the next scheduled run or trigger it manually from the Actions tab.

## Files

- `src/epic.ts` - calls Epic''s public API, filters for currently-free promos, builds checkout URLs
- `src/state.ts` - reads/writes `state/notified.json`
- `src/notify.ts` - composes the HTML email and sends via nodemailer
- `src/index.ts` - glues it together
- `.github/workflows/notify.yml` - schedule, secrets wiring, state commit, run cleanup