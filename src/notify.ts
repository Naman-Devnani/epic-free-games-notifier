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

export async function sendEmail(config: EmailConfig, games: FreeGame[]): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  const subject =
    games.length === 1
      ? `Free on Epic: ${games[0].title}`
      : `${games.length} free games on Epic this week`;

  await transport.sendMail({
    from: `"${config.fromName ?? 'Epic Free Games'}" <${config.user}>`,
    to: config.to,
    subject,
    html: renderHtml(games),
    text: renderText(games),
  });
}

function renderHtml(games: FreeGame[]): string {
  const claimAllBanner = games.length > 1
    ? `<div style="margin:0 0 24px 0;padding:16px;background:#0078f2;border-radius:10px;text-align:center">
         <p style="margin:0 0 10px 0;color:#fff;font-size:14px">Claim every game above in one go:</p>
         <a href="${escapeHtml(buildBundledCheckoutUrl(games))}" style="display:inline-block;padding:11px 24px;background:#fff;color:#0078f2;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px">Claim all ${games.length}</a>
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
    Sent automatically. Click "Claim now" then press "Place Order" on Epic - the games are free.
  </p>
</div>
</body></html>`;
}

function renderText(games: FreeGame[]): string {
  return games
    .map((g) => `${g.title}\n${g.description}\nFree until ${g.endDate}\nClaim: ${g.checkoutUrl}`)
    .join('\n\n---\n\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}