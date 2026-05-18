import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadNotifiedIds(filePath: string): Promise<Set<string>> {
  try {
    const data = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(data) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export async function saveNotifiedIds(filePath: string, ids: Set<string>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify([...ids].sort(), null, 2) + '\n');
}