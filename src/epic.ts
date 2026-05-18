const FREE_GAMES_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';

const EPIC_CLIENT_ID = '875a3b57d3a640a6b7f9b4e883463ab4';

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
    promotionalOffers?: Array<{
      promotionalOffers?: Array<{
        startDate: string;
        endDate: string;
        discountSetting?: { discountPercentage: number };
      }>;
    }>;
  };
}

export async function getFreeGames(): Promise<FreeGame[]> {
  const url = `${FREE_GAMES_URL}?locale=en-US&country=US&allowCountries=US`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'epic-free-games-notifier (github.com/Naman-Devnani)' },
  });
  if (!response.ok) {
    throw new Error(`Epic API ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
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

    const slug =
      el.productSlug ||
      el.catalogNs?.mappings?.find((m) => m.pageType === 'productHome')?.pageSlug ||
      el.urlSlug ||
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
        storeUrl: slug ? `https://store.epicgames.com/en-US/p/${slug}` : '',
      },
    ];
  });
}

function getCurrentFreeOffer(el: RawElement, now: Date) {
  const groups = el.promotions?.promotionalOffers ?? [];
  for (const group of groups) {
    for (const offer of group.promotionalOffers ?? []) {
      if (offer.discountSetting?.discountPercentage !== 0) continue;
      if (new Date(offer.startDate) <= now && now <= new Date(offer.endDate)) {
        return offer;
      }
    }
  }
  return null;
}

function buildCheckoutUrl(offerId: string, namespace: string): string {
  return wrapWithLogin(`&offers=1-${namespace}-${offerId}`);
}

/** Build one checkout URL that pre-fills *all* offers, so a single "Place Order" claims them at once. */
export function buildBundledCheckoutUrl(
  offers: Array<{ id: string; namespace: string }>,
): string {
  const params = offers.map((o) => `&offers=1-${o.namespace}-${o.id}`).join('');
  return wrapWithLogin(params);
}

function wrapWithLogin(offersParams: string): string {
  const checkout =
    `https://www.epicgames.com/store/purchase?highlightColor=0078f2` +
    offersParams +
    `&orderId&purchaseToken&showNavigation=true`;
  const login = new URL('https://www.epicgames.com/id/login');
  login.searchParams.set('noHostRedirect', 'true');
  login.searchParams.set('redirectUrl', checkout);
  login.searchParams.set('client_id', EPIC_CLIENT_ID);
  return login.toString();
}