import { getFreeGames } from './epic.ts';
import { loadNotifiedIds, saveNotifiedIds } from './state.ts';
import { sendEmail } from './notify.ts';

const STATE_FILE = 'state/notified.json';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  console.log('Fetching free games from Epic...');
  const games = await getFreeGames();

  if (games.length === 0) {
    console.log('No free games available right now');
    return;
  }
  console.log(`Currently free: ${games.map((g) => g.title).join(', ')}`);

  const notified = await loadNotifiedIds(STATE_FILE);
  const fresh = games.filter((g) => !notified.has(g.id));

  if (fresh.length === 0) {
    console.log('Already notified about all current free games - nothing to send');
    return;
  }

  console.log(`Sending email for ${fresh.length} new game(s)`);
  await sendEmail(
    {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      user: required('SMTP_USER'),
      pass: required('SMTP_PASS'),
      to: required('EMAIL_TO'),
      fromName: process.env.EMAIL_FROM_NAME,
    },
    fresh,
  );

  for (const g of fresh) notified.add(g.id);
  await saveNotifiedIds(STATE_FILE, notified);
  console.log('Done');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});