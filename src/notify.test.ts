import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubject } from './notify.ts';
import type { FreeGame } from './epic.ts';

function game(title: string): FreeGame {
  return {
    id: title,
    namespace: 'ns',
    title,
    description: '',
    imageUrl: '',
    endDate: '2026-06-20T00:00:00Z',
    checkoutUrl: '',
    storeUrl: '',
  };
}

test('buildSubject: short titles are listed in full', () => {
  assert.equal(buildSubject([game('A'), game('B')]), 'Free on Epic: A, B');
});

test('buildSubject: a single game', () => {
  assert.equal(buildSubject([game('Celeste')]), 'Free on Epic: Celeste');
});

test('buildSubject: long combined titles fall back to "first + N more"', () => {
  const subject = buildSubject([
    game('A Game With A Very Long Title That Exceeds The Limit'),
    game('Another Lengthy Game Title Here'),
    game('Third'),
  ]);
  assert.equal(subject, 'Free on Epic: A Game With A Very Long Title That Exceeds The Limit + 2 more');
});

test('buildSubject: one very long single title has no "+ more" suffix', () => {
  const long = 'A Single Extremely Long Game Title That Goes On Well Past Fifty-Five Chars';
  assert.equal(buildSubject([game(long)]), `Free on Epic: ${long}`);
});
