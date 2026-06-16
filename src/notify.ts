import nodemailer from 'nodemailer';
import { buildBundledCheckoutUrl } from './epic.ts';
import type { FreeGame } from './epic.ts';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
  fromName?: string;
}

// Gmail truncates the inbox preview around 70 chars. Leave headroom for the prefix.
const MAX_SUBJECT_TITLES_LENGTH = 55;

export async function sendEmail(config: EmailConfig, games: FreeGame[]): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  await transport.sendMail({
    from: `"${config.fromName ?? 'Epic Free Games Bot'}" <${config.user}>`,
    to: config.to,
    subject: buildSubject(games),
    html: renderHtml(games),
    text: renderText(games),
  });
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

function renderHtml(games: FreeGame[]): string {
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
      const endsOn = new Date(g.endDate).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      });
      const img = g.imageUrl
        ? `<img src="${escapeHtml(g.imageUrl)}" alt="${escapeHtml(g.title)}" style="width:100%;max-width:600px;border-radius:6px;display:block;margin-bottom:12px"/>`
        : '';
      return `
        <div style="margin:0 0 28px 0;padding:18px;border:1px solid #e3e3e3;border-radius:10px;background:#fff">
          ${img}
          <h2 style="margin:0 0 6px 0;font-size:22px;color:#0f1923">${escapeHtml(g.title)}</h2>
          <p style="margin:0 0 10px 0;color:#5d6166;font-size:14px;line-height:1.5">${escapeHtml(g.description)}</p>
          <p style="margin:0 0 14px 0;color:#8a8f95;font-size:12px">Free until ${endsOn} UTC</p>
          <a href="${escapeHtml(g.checkoutUrl)}" style="display:inline-block;padding:11px 22px;background:#0078f2;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Claim now</a>
          ${g.storeUrl ? ` &nbsp; <a href="${escapeHtml(g.storeUrl)}" style="color:#5d6166;font-size:13px;text-decoration:none">Store page &rarr;</a>` : ''}
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:0 auto">
  <h1 style="margin:0 0 20px 0;font-size:24px;color:#0f1923">This week's free games</h1>
  ${claimAllBanner}
  ${cards}
  <p style="margin-top:24px;color:#8a8f95;font-size:12px;text-align:center">
    Sent automatically. Click "Claim now" then press "Add to library" on Epic - the games are free.
  </p>
</div>
</body></html>`;
}

function renderText(games: FreeGame[]): string {
  const bundled = games.length > 1
    ? `Claim all ${games.length} in one click (Epic may show only one game, but clicking "Add to library" claims all ${games.length}):\n${buildBundledCheckoutUrl(games)}\n\n---\n\n`
    : '';
  const perGame = games
    .map((g) => `${g.title}\n${g.description}\nFree until ${g.endDate}\nClaim: ${g.checkoutUrl}`)
    .join('\n\n---\n\n');
  return bundled + perGame;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
