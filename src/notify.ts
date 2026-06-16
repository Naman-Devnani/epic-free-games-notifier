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

/** Format a free game's price as struck-through original next to "Free". */
function priceHtml(originalPrice: string): string {
  if (!originalPrice) return '';
  return `<p style="margin:0 0 10px 0;font-size:14px">
            <span style="color:#8a8f95;text-decoration:line-through">${escapeHtml(originalPrice)}</span>
            &nbsp;<span style="color:#1a8f3c;font-weight:700">Free</span>
          </p>`;
}

function renderHtml(games: FreeGame[], timeZone: string, upcoming: UpcomingGame[]): string {
  // One link that claims every game at once. Epic's checkout overlay confusingly
  // shows only one of the games, but clicking "Add to library" claims all the
  // offers in the URL - so the banner says so up front to avoid alarm.
  const claimAllBanner = games.length > 1
    ? `<div style="margin:0 0 24px 0;padding:16px;background:#0078f2;border-radius:10px;text-align:center">
         <p style="margin:0 0 10px 0;color:#fff;font-size:14px">Claim all ${games.length} games in one click:</p>
         <a href="${escapeHtml(buildBundledCheckoutUrl(games))}" style="display:inline-block;padding:11px 24px;background:#fff;color:#0078f2;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px">Claim all ${games.length}</a>
         <p style="margin:10px 0 0 0;color:#cfe3fb;font-size:12px">Epic's page may only show one game - clicking "Add to library" still claims all ${games.length}.</p>
       </div>`
    : '';
  const cards = games
    .map((g) => {
      const endsOn = formatExpiry(g.endDate, timeZone);
      const img = g.imageUrl
        ? `<img src="${escapeHtml(g.imageUrl)}" alt="${escapeHtml(g.title)}" style="width:100%;max-width:600px;border-radius:6px;display:block;margin-bottom:12px"/>`
        : '';
      return `
        <div style="margin:0 0 28px 0;padding:18px;border:1px solid #e3e3e3;border-radius:10px;background:#fff">
          ${img}
          <h2 style="margin:0 0 6px 0;font-size:22px;color:#0f1923">${escapeHtml(g.title)}</h2>
          ${priceHtml(g.originalPrice)}
          <p style="margin:0 0 10px 0;color:#5d6166;font-size:14px;line-height:1.5">${escapeHtml(g.description)}</p>
          <p style="margin:0 0 14px 0;color:#8a8f95;font-size:12px">Free until ${endsOn}</p>
          <a href="${escapeHtml(g.checkoutUrl)}" style="display:inline-block;padding:11px 22px;background:#0078f2;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Claim now</a>
          ${g.storeUrl ? ` &nbsp; <a href="${escapeHtml(g.storeUrl)}" style="color:#5d6166;font-size:13px;text-decoration:none">Store page &rarr;</a>` : ''}
        </div>`;
    })
    .join('');

  const upcomingSection = upcoming.length > 0
    ? `<div style="margin:8px 0 0 0;padding:16px 18px;border:1px dashed #c7ccd1;border-radius:10px;background:#fbfbfc">
         <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#5d6166;text-transform:uppercase;letter-spacing:.04em">Coming free next</p>
         ${upcoming
           .map((u) => {
             const starts = formatExpiry(u.startDate, timeZone);
             const price = u.originalPrice
               ? `<span style="color:#8a8f95;text-decoration:line-through">${escapeHtml(u.originalPrice)}</span> `
               : '';
             const name = u.storeUrl
               ? `<a href="${escapeHtml(u.storeUrl)}" style="color:#0f1923;text-decoration:none;font-weight:600">${escapeHtml(u.title)}</a>`
               : `<span style="color:#0f1923;font-weight:600">${escapeHtml(u.title)}</span>`;
             return `<p style="margin:0 0 6px 0;font-size:14px;color:#5d6166">${name} &mdash; ${price}free from ${starts}</p>`;
           })
           .join('')}
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:0 auto">
  <h1 style="margin:0 0 20px 0;font-size:24px;color:#0f1923">This week's free games</h1>
  ${claimAllBanner}
  ${cards}
  ${upcomingSection}
  <p style="margin-top:24px;color:#8a8f95;font-size:12px;text-align:center">
    Sent automatically. Click "Claim now" then press "Add to library" on Epic - the games are free.
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
