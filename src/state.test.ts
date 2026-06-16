import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNotifiedIds, saveNotifiedIds } from './state.ts';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'epic-state-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('loadNotifiedIds: missing file returns an empty set (fresh state)', async () => {
  await withTempDir(async (dir) => {
    const ids = await loadNotifiedIds(join(dir, 'nope.json'));
    assert.equal(ids.size, 0);
  });
});

test('save then load round-trips the ids', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'notified.json');
    await saveNotifiedIds(file, new Set(['b', 'a', 'c']));
    const ids = await loadNotifiedIds(file);
    assert.deepEqual([...ids].sort(), ['a', 'b', 'c']);
  });
});

test('saveNotifiedIds: writes a sorted array with a trailing newline (clean git diffs)', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'notified.json');
    await saveNotifiedIds(file, new Set(['z', 'a', 'm']));
    const raw = await readFile(file, 'utf8');
    assert.equal(raw, '[\n  "a",\n  "m",\n  "z"\n]\n');
  });
});

test('loadNotifiedIds: corrupt JSON throws (never silently re-notifies)', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'notified.json');
    await writeFile(file, '{ this is not json');
    await assert.rejects(() => loadNotifiedIds(file), /Could not parse/);
  });
});

test('loadNotifiedIds: a non-array JSON value is treated as empty', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'notified.json');
    await writeFile(file, '{"not":"an array"}');
    const ids = await loadNotifiedIds(file);
    assert.equal(ids.size, 0);
  });
});

test('loadNotifiedIds: non-string array entries are filtered out', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'notified.json');
    await writeFile(file, '["good", 42, null, "also-good"]');
    const ids = await loadNotifiedIds(file);
    assert.deepEqual([...ids].sort(), ['also-good', 'good']);
  });
});
