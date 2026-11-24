import type { Shop, ShopDomain, ShopPayments } from 'api/proto-http/admin';

// The «shop» screen's words (lane X18-L4, mockup x18-shop-mockup.html): every status the server
// answers maps to one pill word and one tone; every refusal key to a 1–3 word line.

export type Tone = 'ok' | 'warn' | 'attention' | 'mut' | 'ink' | 'gap';

export interface Mark {
  word: string;
  tone: Tone;
}

/** Shop.status: off · open · closed · checkout_off. */
export function shopMark(status: string | undefined): Mark {
  switch (status) {
    case 'open':
      return { word: 'open', tone: 'ok' };
    case 'checkout_off':
      return { word: 'checkout off', tone: 'attention' };
    case 'closed':
      return { word: 'closed', tone: 'warn' };
    default:
      return { word: 'off', tone: 'mut' };
  }
}

/** ShopDomain.status, or `redirect` for a host that only redirects. */
export function domainMark(d: ShopDomain): Mark {
  if (d.redirectTo) return { word: 'redirect', tone: 'mut' };
  switch (d.status) {
    case 'live':
      return { word: 'live', tone: 'ok' };
    case 'verifying':
      return { word: 'verifying', tone: 'attention' };
    case 'failed':
      return { word: 'failed', tone: 'warn' };
    default:
      return { word: 'records needed', tone: 'attention' };
  }
}

export const isLive = (d: ShopDomain) => d.status === 'live' && !d.redirectTo;

/** The team's own domains (the platform address lives in the shop block). */
export const customDomains = (s: Shop | undefined): ShopDomain[] =>
  (s?.domains ?? []).filter((d) => d.kind === 'custom');

/** Hosts the main address can be: the platform address and every live own domain. */
export function primaryChoices(s: Shop | undefined): string[] {
  const out: string[] = [];
  for (const d of s?.domains ?? []) {
    const h = d.host ?? '';
    if (h && isLive(d) && (d.kind === 'subdomain' || d.kind === 'custom')) out.push(h);
  }
  if (s?.address && !out.includes(s.address)) out.unshift(s.address);
  return out;
}

/** DNS records still missing on domains that are not live yet (the domain block's «! n»). */
export const missingRecords = (s: Shop | undefined): number =>
  customDomains(s)
    .filter((d) => !isLive(d) && !d.redirectTo)
    .reduce((n, d) => n + (d.records ?? []).filter((r) => !r.found).length, 0);

/** `golden-a.com` → [`golden-a`, `.com`]: the first label in ink. */
export function splitHost(h: string): [string, string] {
  const i = h.indexOf('.');
  return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i)];
}

export type PayState = 'none' | 'onboarding' | 'active' | 'restricted';

/** Where the payments block stands: disconnected reads as never connected. */
export function payState(p: ShopPayments | undefined): PayState {
  if (!p || !p.method || p.method === 'none') return 'none';
  if (p.status === 'disconnected' || p.status === 'none') return 'none';
  if (p.status === 'onboarding') return 'onboarding';
  if (p.status === 'restricted') return 'restricted';
  return 'active';
}

/** The payments block's «! 1»: not taking payments yet. */
export const paymentsNeedWork = (p: ShopPayments | undefined) =>
  payState(p) !== 'active' || !p?.chargesEnabled;

const KEYS = [
  'host_taken',
  'host_not_found',
  'host_managed',
  'host_not_live',
  'host_limit',
  'bad_host',
  'bad_from_name',
  'bad_reply_to',
  'shop_zone_unset',
  'shop_legacy',
  'stripe_not_ready',
  'bad_key',
  'bad_publishable_key',
  'bad_secret_key',
  'bad_webhook_secret',
  'bad_return_path',
  'team_not_active',
  'stripe_unavailable',
  'stripe_account_taken',
  'stripe_connected',
  'stripe_keys_set',
  'stripe_connect_expired',
  'stripe_connect_not_yours',
  'stripe_wrong_mode',
  'shop_payments_busy',
] as const;

export type RefusalKey = (typeof KEYS)[number];

/** The refusal key in a failed call's message, if it names one. */
export function refusalKey(e: unknown): RefusalKey | null {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return KEYS.find((k) => msg.includes(k)) ?? null;
}

const WORDS: Record<RefusalKey, string> = {
  host_taken: 'domain taken',
  host_not_found: 'no such domain',
  host_managed: 'platform address',
  host_not_live: 'not live yet',
  host_limit: 'too many domains',
  bad_host: 'bad domain',
  bad_from_name: 'bad name',
  bad_reply_to: 'bad address',
  shop_zone_unset: 'not available',
  shop_legacy: 'not available',
  stripe_not_ready: 'not available',
  bad_key: 'bad key',
  bad_publishable_key: 'bad key',
  bad_secret_key: 'bad key',
  bad_webhook_secret: 'bad key',
  bad_return_path: 'not available',
  team_not_active: 'team paused',
  stripe_unavailable: 'stripe down',
  stripe_account_taken: 'account taken',
  stripe_connected: 'already connected',
  stripe_keys_set: 'keys already set',
  stripe_connect_expired: 'connect again',
  stripe_connect_not_yours: 'not yours',
  stripe_wrong_mode: 'wrong mode',
  shop_payments_busy: 'orders pending',
};

/** A failed write as the screen says it; `fallback` when the server named nothing known. */
export function refusalWord(e: unknown, fallback = 'not saved'): string {
  const k = refusalKey(e);
  if (k) return WORDS[k];
  const status = (e as { status?: number } | null)?.status;
  if (status === 403) return 'owner only';
  return fallback;
}

/** Stripe is not wired on this contour yet (lane X18-L3): `Unimplemented stripe_not_ready`. */
export function stripeNotReady(e: unknown): boolean {
  if (refusalKey(e) === 'stripe_not_ready') return true;
  const status = (e as { status?: number } | null)?.status;
  return status === 501;
}

/** `?stripe=finish#token=…` on return from Stripe Connect: the token, or null for any other address. */
export function stripeFinishToken(search: string, hash: string): string | null {
  if (new URLSearchParams(search).get('stripe') !== 'finish') return null;
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return t || null;
}

/** The address without `?stripe=…` and the fragment (other query params kept). */
export function withoutStripeReturn(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  q.delete('stripe');
  const rest = q.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/** A bare host as typed: scheme, path and spaces dropped, lowercase. */
export function cleanHost(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '');
}
