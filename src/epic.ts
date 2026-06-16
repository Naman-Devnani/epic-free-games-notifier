const FREE_GAMES_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_ATTEMPTS = 3;

export interface FreeGame {
  id: string;
  namespace: string;
  title: string;
  description: string;
  imageUrl: string;
  endDate: string;
  checkoutUrl: string;
  storeUrl: string;
}

interface RawPromoOffer {
  startDate: string;
  endDate: string;
  discountSetting?: { discountPercentage: number };
}

interface RawElement {
  id: string;
  namespace: string;
  title: string;
  description?: string;
  productSlug?: string | null;
  urlSlug?: string;
  offerType?: string;
  keyImages?: Array<{ type: string; url: string }>;
  catalogNs?: { mappings?: Array<{ pageSlug: string; pageType: string }> };
  promotions?: {
    promotionalOffers?: Array<{ promotionalOffers?: RawPromoOffer[] }>;
  };
}

/**
 * 4xx responses are surfaced through this so the retry loop can recognise them as
 * non-retriable (a 404 won't fix itself in 500 ms).
 */
class NonRetriableHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetriableHttpError';
  }
}

/**
 * Retry transient failures and cap each request so a slow Epic doesn't hold the
 * workflow open. Node 22's fetch has no default timeout, and freeGamesPromotions
 * occasionally 500s under Thursday-drop load.
 */
async function fetchJsonWithRetry(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'epic-free-games-notifier (github.com/Naman-Devnani)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          throw new NonRetriableHttpError(`Epic API ${res.status} ${res.statusText}`);
        }
        throw new Error(`Epic API ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      // Don't waste retries on 4xx or JSON shape errors - they won't get better.
      if (err instanceof NonRetriableHttpError || err instanceof SyntaxError) {
        throw err;
      }
      if (attempt < MAX_FETCH_ATTEMPTS) {
        const delayMs = 500 * attempt;
        console.warn(
          `Fetch attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed: ${(err as Error).message}. Retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
  }
  throw lastErr;
}

export async function getFreeGames(): Promise<FreeGame[]> {
  const url = `${FREE_GAMES_URL}?locale=en-US&country=US&allowCountries=US`;
  const data = (await fetchJsonWithRetry(url)) as {
    data?: { Catalog?: { searchStore?: { elements?: RawElement[] } } };
  };

  const elements = data?.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) {
    throw new Error('Unexpected Epic API response shape');
  }

  const now = new Date();
  return elements.flatMap((el) => {
    const offer = getCurrentFreeOffer(el, now);
    if (!offer) return [];

    // productSlug is the canonical /store/p/{slug} path. urlSlug is an internal
    // identifier that often 404s, so we only build a store link when we have
    // a productSlug or its catalogNs alias.
    const productSlug =
      el.productSlug ||
      el.catalogNs?.mappings?.find((m) => m.pageType === 'productHome')?.pageSlug ||
      '';

    const image =
      el.keyImages?.find((i) => i.type === 'OfferImageWide')?.url ||
      el.keyImages?.find((i) => i.type === 'DieselStoreFrontWide')?.url ||
      el.keyImages?.[0]?.url ||
      '';

    return [
      {
        id: el.id,
        namespace: el.namespace,
        title: el.title,
        description: el.description?.trim() ?? '',
        imageUrl: image,
        endDate: offer.endDate,
        checkoutUrl: buildCheckoutUrl(el.id, el.namespace),
        storeUrl: productSlug ? `https://store.epicgames.com/en-US/p/${productSlug}` : '',
      },
    ];
  });
}

/**
 * If Epic ever lists multiple concurrent free promotions for one game, pick the
 * one ending latest so the email shows the most lenient claim window.
 */
function getCurrentFreeOffer(el: RawElement, now: Date): RawPromoOffer | null {
  const candidates: RawPromoOffer[] = [];
  for (const group of el.promotions?.promotionalOffers ?? []) {
    for (const offer of group.promotionalOffers ?? []) {
      if (offer.discountSetting?.discountPercentage !== 0) continue;
      if (new Date(offer.startDate) <= now && now <= new Date(offer.endDate)) {
        candidates.push(offer);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (new Date(a.endDate) >= new Date(b.endDate) ? a : b));
}

function buildCheckoutUrl(offerId: string, namespace: string): string {
  return buildPurchaseUrl(`&offers=1-${namespace}-${offerId}`);
}

/** Build one checkout URL that pre-fills *all* offers, so a single "Place Order" claims them at once. */
export function buildBundledCheckoutUrl(
  offers: Array<{ id: string; namespace: string }>,
): string {
  const params = offers.map((o) => `&offers=1-${o.namespace}-${o.id}`).join('');
  return buildPurchaseUrl(params);
}

/**
 * Link straight to Epic's purchase page with the offers pre-filled, so a
 * signed-in recipient (the normal case when clicking from their own inbox)
 * lands directly on checkout - one "Place Order" claims everything.
 *
 * We deliberately do NOT wrap this in Epic's /id/login flow. Passing a
 * client_id turns it into an OAuth handshake that bounces an already-logged-in
 * user to a "switch account" chooser before checkout. The tradeoff: a user who
 * is signed out when they click gets Epic's "Account id is missing" page and
 * has to sign in and re-click. That's the rarer case and far less annoying than
 * the account chooser blocking every claim.
 */
function buildPurchaseUrl(offersParams: string): string {
  return (
    `https://www.epicgames.com/store/purchase?highlightColor=0078f2` +
    offersParams +
    `&orderId&purchaseToken&showNavigation=true`
  );
}
