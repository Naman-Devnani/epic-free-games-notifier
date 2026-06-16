import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPromotions } from './epic.ts';
import { loadNotifiedIds, saveNotifiedIds } from './state.ts';
import { sendEmail } from './notify.ts';

// Anchor the state path to the repo root (one level above src/) so the script
// works from any cwd - not just when invoked from the repo root.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = resolve(PROJECT_ROOT, 'state', 'notified.json');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN?.toLowerCase() === 'true';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function smtpPort(): number {
  const raw = process.env.SMTP_PORT ?? '587';
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: ${raw} (expected a port number like 587 or 465)`);
  }
  return port;
}

function displayTimeZone(): string {
  const tz = process.env.DISPLAY_TZ ?? 'Asia/Kolkata';
  try {
    // Throws RangeError on an unknown IANA zone - fail now with a clear message
    // rather than at render time deep inside the email build.
    new Date().toLocaleString('en-US', { timeZone: tz });
  } catch {
    throw new Error(`Invalid DISPLAY_TZ: ${tz} (expected an IANA zone like Asia/Kolkata or UTC)`);
  }
  return tz;
}

async function main(): Promise<void> {
  console.log('Fetching free games from Epic...');
  const { current, upcoming } = await getPromotions();

  if (current.length === 0) {
    console.log('No free games available right now');
    return;
  }
  console.log(`Currently free: ${current.map((g) => g.title).join(', ')}`);
  if (upcoming.length > 0) {
    console.log(`Coming next: ${upcoming.map((g) => g.title).join(', ')}`);
  }

  const notified = await loadNotifiedIds(STATE_FILE);
  const fresh = current.filter((g) => !notified.has(g.id));

  if (fresh.length === 0) {
    console.log('Already notified about all current free games - nothing to send');
    return;
  }

  const titles = fresh.map((g) => g.title).join(', ');
  console.log(`Sending email for ${fresh.length} new game(s): ${titles}`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1 - skipping email send and state save');
    return;
  }

  await sendEmail(
    {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: smtpPort(),
      user: required('SMTP_USER'),
      pass: required('SMTP_PASS'),
      to: required('EMAIL_TO'),
      fromName: process.env.EMAIL_FROM_NAME,
      displayTimeZone: displayTimeZone(),
    },
    fresh,
    upcoming,
  );

  // State save is intentionally ordered after the email send: we'd rather
  // re-send a duplicate (annoying) than skip a free game (the whole point).
  // If this throws, the workflow goes red and the failure-notification step
  // emails you so you can fix the state file before next run.
  for (const g of fresh) notified.add(g.id);
  await saveNotifiedIds(STATE_FILE, notified);
  console.log('Done');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
