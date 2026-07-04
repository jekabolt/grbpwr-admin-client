import {
  common_GenderEnum,
  common_OrderFactor,
  common_SeasonEnum,
  common_SortFactor,
} from 'api/proto-http/frontend';

/**
 * SINGLE SOURCE OF TRUTH for turning a hero "explore / CTA" link into the URL
 * string the storefront expects, and back. The admin app never builds storefront
 * page URLs anywhere else, so THIS FILE is the one place to confirm/adjust the
 * exact paths + query-param names.
 *
 * Any URL that doesn't match a known internal pattern (or points off-origin) is
 * kept as an `external` raw string, so legacy links and off-site links never
 * break and stay editable.
 *
 * TODO(confirm with storefront): the `PATHS`, `Q`, and *_URL maps below are best
 * guesses. Also decide whether internal links need a `/{country}/{locale}`
 * prefix — they are currently emitted as prefix-less relative paths (portable
 * across beta/prod and locale), on the assumption the storefront resolves them
 * within the active locale. If a prefix or absolute origin is required, add it
 * in `PATHS`/`buildStorefrontLink` here and nowhere else.
 */

export type StorefrontLinkType = 'none' | 'external' | 'product' | 'archive' | 'catalog';

export type CatalogLink = {
  type: 'catalog';
  gender?: common_GenderEnum;
  categoryId?: number;
  collection?: string;
  tag?: string;
  onSale?: boolean;
  season?: common_SeasonEnum;
  sort?: common_SortFactor;
  order?: common_OrderFactor;
};

export type StorefrontLink =
  | { type: 'none' }
  | { type: 'external'; url: string }
  | { type: 'product'; slug: string }
  | { type: 'archive'; slug: string }
  | CatalogLink;

// ---- editable templates ---------------------------------------------------

// Internal page paths (relative, no locale prefix — see file header).
const PATHS = {
  product: (slug: string) => `/product/${encodeURIComponent(slug)}`,
  archive: (slug: string) => `/archive/${encodeURIComponent(slug)}`,
  catalog: '/catalog',
};

// Catalog page query-param names.
const Q = {
  gender: 'gender',
  categoryId: 'categoryId',
  collection: 'collection',
  tag: 'tag',
  onSale: 'sale',
  season: 'season',
  sort: 'sort',
  order: 'order',
} as const;

// How enum values appear in the URL (short human forms).
const GENDER_URL: Record<string, string> = {
  GENDER_ENUM_MALE: 'men',
  GENDER_ENUM_FEMALE: 'women',
  GENDER_ENUM_UNISEX: 'unisex',
};
const SORT_URL: Record<string, string> = {
  SORT_FACTOR_CREATED_AT: 'new',
  SORT_FACTOR_UPDATED_AT: 'updated',
  SORT_FACTOR_NAME: 'name',
  SORT_FACTOR_PRICE: 'price',
};
const ORDER_URL: Record<string, string> = {
  ORDER_FACTOR_ASC: 'asc',
  ORDER_FACTOR_DESC: 'desc',
};
const SEASON_URL: Record<string, string> = {
  SEASON_ENUM_SS: 'ss',
  SEASON_ENUM_FW: 'fw',
  SEASON_ENUM_PF: 'pf',
  SEASON_ENUM_RC: 'rc',
};

// ---- internals ------------------------------------------------------------

const invert = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const GENDER_ENUM = invert(GENDER_URL);
const SORT_ENUM = invert(SORT_URL);
const ORDER_ENUM = invert(ORDER_URL);
const SEASON_ENUM = invert(SEASON_URL);

const STOREFRONT_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_STOREFRONT_URL || 'https://grbpwr.com').origin;
  } catch {
    return 'https://grbpwr.com';
  }
})();

// ---- build ----------------------------------------------------------------

/** Serialize a StorefrontLink to the URL string stored in the form / contract. */
export function buildStorefrontLink(link: StorefrontLink): string {
  switch (link.type) {
    case 'none':
      return '';
    case 'external':
      return link.url || '';
    case 'product':
      return link.slug ? PATHS.product(link.slug) : '';
    case 'archive':
      return link.slug ? PATHS.archive(link.slug) : '';
    case 'catalog': {
      const p = new URLSearchParams();
      if (link.gender && GENDER_URL[link.gender]) p.set(Q.gender, GENDER_URL[link.gender]);
      if (link.categoryId != null) p.set(Q.categoryId, String(link.categoryId));
      if (link.collection) p.set(Q.collection, link.collection);
      if (link.tag) p.set(Q.tag, link.tag);
      if (link.onSale) p.set(Q.onSale, 'true');
      if (link.season && SEASON_URL[link.season]) p.set(Q.season, SEASON_URL[link.season]);
      if (link.sort && SORT_URL[link.sort]) p.set(Q.sort, SORT_URL[link.sort]);
      if (link.order && ORDER_URL[link.order]) p.set(Q.order, ORDER_URL[link.order]);
      const qs = p.toString();
      return qs ? `${PATHS.catalog}?${qs}` : PATHS.catalog;
    }
  }
  return '';
}

// ---- parse ----------------------------------------------------------------

/**
 * Parse a stored URL string back into a StorefrontLink. Relative paths resolve
 * against the storefront origin; absolute URLs to a different origin, and any
 * path that doesn't match a known pattern, become `external` (kept verbatim).
 */
export function parseStorefrontLink(url: string | null | undefined): StorefrontLink {
  if (!url || !url.trim()) return { type: 'none' };

  let u: URL;
  try {
    u = new URL(url, STOREFRONT_ORIGIN);
  } catch {
    return { type: 'external', url };
  }

  // Absolute link to some other site → external.
  if (/^https?:\/\//i.test(url) && u.origin !== STOREFRONT_ORIGIN) {
    return { type: 'external', url };
  }

  const path = u.pathname.replace(/\/+$/, '') || '/';

  const product = path.match(/^\/product\/(.+)$/);
  if (product) return { type: 'product', slug: decodeURIComponent(product[1]) };

  const archive = path.match(/^\/archive\/(.+)$/);
  if (archive) return { type: 'archive', slug: decodeURIComponent(archive[1]) };

  if (path === '/catalog') {
    const q = u.searchParams;
    const out: CatalogLink = { type: 'catalog' };
    const gender = q.get(Q.gender);
    if (gender && GENDER_ENUM[gender]) out.gender = GENDER_ENUM[gender] as common_GenderEnum;
    const categoryId = q.get(Q.categoryId);
    if (categoryId && !Number.isNaN(Number(categoryId))) out.categoryId = Number(categoryId);
    const collection = q.get(Q.collection);
    if (collection) out.collection = collection;
    const tag = q.get(Q.tag);
    if (tag) out.tag = tag;
    if (q.get(Q.onSale) === 'true') out.onSale = true;
    const season = q.get(Q.season);
    if (season && SEASON_ENUM[season]) out.season = SEASON_ENUM[season] as common_SeasonEnum;
    const sort = q.get(Q.sort);
    if (sort && SORT_ENUM[sort]) out.sort = SORT_ENUM[sort] as common_SortFactor;
    const order = q.get(Q.order);
    if (order && ORDER_ENUM[order]) out.order = ORDER_ENUM[order] as common_OrderFactor;
    return out;
  }

  return { type: 'external', url };
}

// ---- option lists (for the picker UI) -------------------------------------

export const GENDER_OPTIONS: { label: string; value: common_GenderEnum }[] = [
  { label: 'men', value: 'GENDER_ENUM_MALE' },
  { label: 'women', value: 'GENDER_ENUM_FEMALE' },
  { label: 'unisex', value: 'GENDER_ENUM_UNISEX' },
];

export const SORT_OPTIONS: { label: string; value: common_SortFactor }[] = [
  { label: 'newest', value: 'SORT_FACTOR_CREATED_AT' },
  { label: 'price', value: 'SORT_FACTOR_PRICE' },
  { label: 'name', value: 'SORT_FACTOR_NAME' },
];

export const ORDER_OPTIONS: { label: string; value: common_OrderFactor }[] = [
  { label: 'ascending', value: 'ORDER_FACTOR_ASC' },
  { label: 'descending', value: 'ORDER_FACTOR_DESC' },
];

export const SEASON_OPTIONS: { label: string; value: common_SeasonEnum }[] = [
  { label: 'SS', value: 'SEASON_ENUM_SS' },
  { label: 'FW', value: 'SEASON_ENUM_FW' },
  { label: 'PF', value: 'SEASON_ENUM_PF' },
  { label: 'RC', value: 'SEASON_ENUM_RC' },
];
