import nodemailer from 'nodemailer';
import { buildBundledCheckoutUrl } from './epic.ts';
import type { FreeGame, UpcomingGame } from './epic.ts';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
  fromName?: string;
  /** IANA timezone for rendering expiry times in the email. */
  displayTimeZone: string;
}

// Gmail truncates the inbox preview around 70 chars. Leave headroom for the prefix.
const MAX_SUBJECT_TITLES_LENGTH = 55;

const MAX_SEND_ATTEMPTS = 3;

export async function sendEmail(
  config: EmailConfig,
  games: FreeGame[],
  upcoming: UpcomingGame[] = [],
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  const message = {
    from: `"${config.fromName ?? 'Epic Free Games Bot'}" <${config.user}>`,
    to: config.to,
    subject: buildSubject(games),
    html: renderHtml(games, config.displayTimeZone, upcoming),
    text: renderText(games, config.displayTimeZone, upcoming),
  };

  // Retry transient SMTP failures so one Gmail hiccup doesn't drop the whole
  // notification (the failure email shares these creds, so a silent drop here
  // would otherwise mean missing the free games entirely).
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      await transport.sendMail(message);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_SEND_ATTEMPTS) {
        const delayMs = 1000 * attempt;
        console.warn(
          `Email send attempt ${attempt}/${MAX_SEND_ATTEMPTS} failed: ${(err as Error).message}. Retrying in ${delayMs}ms`,
        );
        await new Promise((r) => {
          setTimeout(r, delayMs);
        });
      }
    }
  }
  throw lastErr;
}

/** Exported for tests. */
export function buildSubject(games: FreeGame[]): string {
  const titles = games.map((g) => g.title);
  const joined = titles.join(', ');
  if (joined.length <= MAX_SUBJECT_TITLES_LENGTH) {
    return `Free on Epic: ${joined}`;
  }
  // Long titles fall back to "first + N more" so the most important game still shows.
  const extra = titles.length - 1;
  const first = titles[0];
  return extra > 0 ? `Free on Epic: ${first} + ${extra} more` : `Free on Epic: ${first}`;
}

/**
 * Format an offer's expiry in the configured timezone, with the zone's
 * abbreviation appended (e.g. "Jun 20, 2026, 5:30 AM GMT+5:30") so the reader
 * never has to do UTC math. Exported for tests.
 */
export function formatExpiry(endDate: string, timeZone: string): string {
  return new Date(endDate).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
}

// Cyberpunk-neon palette. Each gradient is paired with a solid fallback declared
// first, so clients that strip linear-gradient (Gmail) still show a solid colour.
const NEON_GRAD = 'background:#bd34c9;background:linear-gradient(90deg,#a855f7,#ec4899)';
const FREE_GREEN = '#39ff14';

function renderHtml(games: FreeGame[], timeZone: string, upcoming: UpcomingGame[]): string {
  // One link that claims every game at once. Epic's checkout overlay confusingly
  // shows only one of the games, but clicking "Add to library" claims all the
  // offers in the URL - so the banner says so up front to avoid alarm.
  const claimAllBanner = games.length > 1
    ? `<div style="margin:0 0 26px 0;padding:18px;background:#16092b;border:1px solid #3a1f5c;border-radius:14px;text-align:center">
         <a href="${escapeHtml(buildBundledCheckoutUrl(games))}" style="display:block;${NEON_GRAD};color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:15px;border-radius:11px;letter-spacing:.05em">&#9889; GRAB ALL ${games.length} IN ONE CLICK</a>
         <p style="margin:12px 0 0 0;color:#9d7bd6;font-size:12px">Epic's page may show only one game &mdash; clicking "Add to library" still claims all ${games.length}.</p>
       </div>`
    : '';

  const cards = games
    .map((g) => {
      const endsOn = formatExpiry(g.endDate, timeZone);
      const img = g.imageUrl
        ? `<img src="${escapeHtml(g.imageUrl)}" alt="${escapeHtml(g.title)}" width="100%" style="display:block;width:100%"/>`
        : '';
      const price = g.originalPrice
        ? `<p style="margin:0 0 12px 0;font-size:15px"><span style="color:#7a6a92;text-decoration:line-through">${escapeHtml(g.originalPrice)}</span> &nbsp;<span style="color:${FREE_GREEN};font-weight:800;text-shadow:0 0 10px rgba(57,255,20,.6)">FREE</span></p>`
        : `<p style="margin:0 0 12px 0;font-size:15px"><span style="color:${FREE_GREEN};font-weight:800">FREE</span></p>`;
      const storeLink = g.storeUrl
        ? `<a href="${escapeHtml(g.storeUrl)}" style="color:#9d7bd6;font-size:13px;text-decoration:none;margin-left:14px">Store page &rarr;</a>`
        : '';
      return `
        <div style="margin:0 0 22px 0;background:#120a22;border:1px solid #3a1f5c;border-radius:16px;overflow:hidden;box-shadow:0 0 24px rgba(168,85,247,.18)">
          ${img}
          <div style="padding:20px 22px">
            <span style="display:inline-block;${NEON_GRAD};color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.1em;padding:5px 12px;border-radius:6px">&#9733; FREE NOW</span>
            <h2 style="margin:14px 0 6px 0;font-size:23px;color:#ffffff;font-weight:800;text-shadow:0 0 14px rgba(236,72,153,.5)">${escapeHtml(g.title)}</h2>
            ${price}
            <p style="margin:0 0 14px 0;color:#b8a9cf;font-size:13px;line-height:1.5">${escapeHtml(g.description)}</p>
            <p style="margin:0 0 18px 0;color:#8b7aa6;font-size:12px">&#9202; Ends ${endsOn}</p>
            <a href="${escapeHtml(g.checkoutUrl)}" style="display:inline-block;${NEON_GRAD};color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:13px 28px;border-radius:9px;letter-spacing:.03em">CLAIM NOW &#9656;</a>${storeLink}
          </div>
        </div>`;
    })
    .join('');

  const upcomingSection = upcoming.length > 0
    ? `<div style="margin:8px 0 0 0;padding:18px;background:#0d0717;border:1px solid #2a1745;border-radius:14px">
         <p style="margin:0 0 14px 0;font-size:12px;font-weight:800;color:#9d7bd6;text-transform:uppercase;letter-spacing:.14em">&#9654; Coming free next</p>
         ${upcoming
           .map((u) => {
             const starts = formatExpiry(u.startDate, timeZone);
             const price = u.originalPrice
               ? `<span style="color:#7a6a92;text-decoration:line-through">${escapeHtml(u.originalPrice)}</span> `
               : '';
             const name = u.storeUrl
               ? `<a href="${escapeHtml(u.storeUrl)}" style="color:#f0e9fb;text-decoration:none;font-weight:700">${escapeHtml(u.title)}</a>`
               : `<span style="color:#f0e9fb;font-weight:700">${escapeHtml(u.title)}</span>`;
             const img = u.imageUrl
               ? `<img src="${escapeHtml(u.imageUrl)}" alt="${escapeHtml(u.title)}" width="100%" style="display:block;width:100%;border-radius:8px;margin-bottom:8px"/>`
               : '';
             return `<div style="margin:0 0 16px 0">
                       ${img}
                       <p style="margin:0;font-size:14px;color:#b8a9cf">${name} &mdash; ${price}drops ${starts}</p>
                     </div>`;
           })
           .join('')}
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#06030d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:30px 18px">
  <div style="text-align:center;margin-bottom:26px">
    <span style="display:inline-block;border:1px solid #ec4899;border-radius:999px;padding:6px 18px;color:#ec4899;font-size:12px;font-weight:800;letter-spacing:.16em;text-shadow:0 0 10px rgba(236,72,153,.6)">&#11041; FREE LOOT UNLOCKED</span>
    <h1 style="margin:18px 0 0 0;color:#ffffff;font-size:30px;font-weight:900;text-shadow:0 0 18px rgba(168,85,247,.55)">THIS WEEK'S DROPS</h1>
  </div>
  ${claimAllBanner}
  ${cards}
  ${upcomingSection}
  <p style="margin:30px 0 0 0;color:#6a5a82;font-size:11px;text-align:center;line-height:1.6">
    Sent automatically. Hit "Claim now", then "Add to library" on Epic &mdash; 100% free, no payment screen.
  </p>
</div>
</body></html>`;
}

function renderText(games: FreeGame[], timeZone: string, upcoming: UpcomingGame[]): string {
  const bundled = games.length > 1
    ? `Claim all ${games.length} in one click (Epic may show only one game, but clicking "Add to library" claims all ${games.length}):\n${buildBundledCheckoutUrl(games)}\n\n---\n\n`
    : '';
  const perGame = games
    .map((g) => {
      const price = g.originalPrice ? `${g.originalPrice} -> Free` : 'Free';
      return `${g.title}\n${price}\n${g.description}\nFree until ${formatExpiry(g.endDate, timeZone)}\nClaim: ${g.checkoutUrl}`;
    })
    .join('\n\n---\n\n');
  const upcomingText = upcoming.length > 0
    ? `\n\n===\n\nComing free next:\n` +
      upcoming
        .map((u) => `- ${u.title} (${u.originalPrice || 'free'}) from ${formatExpiry(u.startDate, timeZone)}`)
        .join('\n')
    : '';
  return bundled + perGame + upcomingText;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
