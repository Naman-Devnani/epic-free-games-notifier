import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentFreeOffer,
  buildCheckoutUrl,
  buildBundledCheckoutUrl,
  parseFreeGames,
  type RawElement,
} from './epic.ts';

const NOW = new Date('2026-06-16T00:00:00Z');

const ACTIVE_WINDOW = { startDate: '2026-06-13T00:00:00Z', endDate: '2026-06-20T00:00:00Z' };

function freeElement(over: Partial<RawElement> = {}): RawElement {
  return {
    id: 'offer-1',
    namespace: 'ns-1',
    title: 'A Free Game',
    productSlug: 'a-free-game',
    promotions: {
      promotionalOffers: [
        { promotionalOffers: [{ ...ACTIVE_WINDOW, discountSetting: { discountPercentage: 0 } }] },
      ],
    },
    ...over,
  };
}

function el(offers: Array<{ start: string; end: string; pct?: number }>): RawElement {
  return {
    id: 'id1',
    namespace: 'ns1',
    title: 'Game',
    promotions: {
      promotionalOffers: [
        {
          promotionalOffers: offers.map((o) => ({
            startDate: o.start,
            endDate: o.end,
            discountSetting: { discountPercentage: o.pct ?? 0 },
          })),
        },
      ],
    },
  };
}

test('getCurrentFreeOffer: returns a 100%-off offer inside its window', () => {
  const offer = getCurrentFreeOffer(
    el([{ start: '2026-06-13T00:00:00Z', end: '2026-06-20T00:00:00Z' }]),
    NOW,
  );
  assert.ok(offer);
  assert.equal(offer?.endDate, '2026-06-20T00:00:00Z');
});

test('getCurrentFreeOffer: ignores non-100%-off discounts', () => {
  const offer = getCurrentFreeOffer(
    el([{ start: '2026-06-13T00:00:00Z', end: '2026-06-20T00:00:00Z', pct: 20 }]),
    NOW,
  );
  assert.equal(offer, null);
});

test('getCurrentFreeOffer: ignores offers outside the active window', () => {
  const past = getCurrentFreeOffer(
    el([{ start: '2026-06-01T00:00:00Z', end: '2026-06-08T00:00:00Z' }]),
    NOW,
  );
  const future = getCurrentFreeOffer(
    el([{ start: '2026-06-20T00:00:00Z', end: '2026-06-27T00:00:00Z' }]),
    NOW,
  );
  assert.equal(past, null);
  assert.equal(future, null);
});

test('getCurrentFreeOffer: with overlapping windows, picks the latest end date', () => {
  const offer = getCurrentFreeOffer(
    el([
      { start: '2026-06-13T00:00:00Z', end: '2026-06-18T00:00:00Z' },
      { start: '2026-06-13T00:00:00Z', end: '2026-06-22T00:00:00Z' },
    ]),
    NOW,
  );
  assert.equal(offer?.endDate, '2026-06-22T00:00:00Z');
});

test('getCurrentFreeOffer: no promotions returns null', () => {
  assert.equal(getCurrentFreeOffer({ id: 'x', namespace: 'n', title: 't' }, NOW), null);
});

test('buildCheckoutUrl: single offer in the expected format', () => {
  const url = buildCheckoutUrl('OFFER', 'NS');
  assert.ok(url.startsWith('https://www.epicgames.com/store/purchase?'));
  assert.ok(url.includes('&offers=1-NS-OFFER'));
  assert.ok(url.includes('&showNavigation=true'));
  assert.ok(!url.includes('/id/login')); // no login wrapper / switch-account
});

test('buildBundledCheckoutUrl: stacks one offers= param per game', () => {
  const url = buildBundledCheckoutUrl([
    { id: 'A', namespace: 'na' },
    { id: 'B', namespace: 'nb' },
  ]);
  assert.ok(url.includes('&offers=1-na-A'));
  assert.ok(url.includes('&offers=1-nb-B'));
  assert.equal(url.match(/&offers=/g)?.length, 2);
});

test('parseFreeGames: maps an active free element with a store URL and checkout URL', () => {
  const games = parseFreeGames([freeElement()], NOW);
  assert.equal(games.length, 1);
  assert.equal(games[0].title, 'A Free Game');
  assert.equal(games[0].endDate, ACTIVE_WINDOW.endDate);
  assert.equal(games[0].storeUrl, 'https://store.epicgames.com/en-US/p/a-free-game');
  assert.ok(games[0].checkoutUrl.includes('&offers=1-ns-1-offer-1'));
});

test('parseFreeGames: drops elements with no active free offer', () => {
  const notFree = freeElement({
    id: 'paid',
    promotions: {
      promotionalOffers: [
        { promotionalOffers: [{ ...ACTIVE_WINDOW, discountSetting: { discountPercentage: 25 } }] },
      ],
    },
  });
  assert.deepEqual(parseFreeGames([notFree], NOW), []);
});

test('parseFreeGames: drops "Mystery Game" placeholders even if free', () => {
  assert.deepEqual(parseFreeGames([freeElement({ title: 'Mystery Game' })], NOW), []);
  assert.deepEqual(parseFreeGames([freeElement({ title: '  mystery game  ' })], NOW), []);
});

test('parseFreeGames: de-duplicates the same offer id within one response', () => {
  const games = parseFreeGames([freeElement(), freeElement()], NOW);
  assert.equal(games.length, 1);
});

test('parseFreeGames: no store URL when there is no productSlug or catalog alias', () => {
  const games = parseFreeGames([freeElement({ productSlug: null, catalogNs: undefined })], NOW);
  assert.equal(games[0].storeUrl, '');
});
