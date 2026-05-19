import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadNotifiedIds(filePath: string): Promise<Set<string>> {
  let data: string;
  try {
    data = await readFile(filePath, 'utf8');
  } catch {
    // File doesn't exist yet - fresh state.
    return new Set();
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn(`${filePath} is not an array - treating as empty.`);
      return new Set();
    }
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch (err) {
    // Refuse to silently start fresh on a corrupt file - that would re-send emails
    // for every currently free game. Let the workflow fail so the user notices.
    throw new Error(
      `Could not parse ${filePath}: ${(err as Error).message}. Aborting to avoid re-sending emails.`,
    );
  }
}

export async function saveNotifiedIds(filePath: string, ids: Set<string>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify([...ids].sort(), null, 2) + '\n');
}
