// DEV ONLY: canned answers for `/shop`, reached through `components/auth/dev-stub` under
// `VITE_AUTH_STUB=1`. A production build never imports it.
//
// localStorage `stub.shop` picks the start (the mockup's states): off · on (default) · domain · live
// `stub.stripe = 'ready'` lets Stripe calls through; by default they answer `stripe_not_ready`.
// Writes live in memory until reload.

import type { Shop, ShopDomain } from 'api/proto-http/admin';

function knob(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function refuse(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

const SUB = 'golden-a.shop.beta.lekalo.studio';

const recordsOf = (host: string, found: boolean) => [
  { type: 'A', name: '@', value: '76.76.21.21', found },
  { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', found: true },
  { type: 'TXT', name: '_vercel', value: `vc-domain-verify=${host},8f3c21d9a7`, found },
];

function custom(host: string, live: boolean): ShopDomain[] {
  return [
    {
      host,
      kind: 'custom',
      status: live ? 'live' : 'records_needed',
      primary: live,
      managed: false,
      redirectTo: undefined,
      records: recordsOf(host, live),
      verifiedAt: undefined,
      checkedAt: undefined,
    },
    {
      host: `www.${host}`,
      kind: 'custom',
      status: live ? 'live' : 'records_needed',
      primary: false,
      managed: false,
      redirectTo: host,
      records: [],
      verifiedAt: undefined,
      checkedAt: undefined,
    },
  ];
}

const subdomain = (primary: boolean): ShopDomain => ({
  host: SUB,
  kind: 'subdomain',
  status: 'live',
  primary,
  managed: true,
  redirectTo: undefined,
  records: [],
  verifiedAt: undefined,
  checkedAt: undefined,
});

let shop: Shop | null = null;

function start(): Shop {
  const s = knob('stub.shop') || 'on';
  const on = s !== 'off';
  const live = s === 'live';
  const dom = s === 'domain' || live;
  return {
    enabled: on,
    status: !on ? 'off' : live ? 'open' : 'checkout_off',
    address: SUB,
    primaryHost: live ? 'golden-a.com' : SUB,
    domains: on ? [subdomain(!live), ...(dom ? custom('golden-a.com', live) : [])] : [],
    payments: live
      ? {
          method: 'connect',
          status: 'active',
          accountName: 'golden a studio ou',
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          mode: 'live',
          keyLast4: undefined,
          webhookUrl: undefined,
        }
      : dom
        ? {
            method: 'connect',
            status: 'onboarding',
            accountName: 'golden a studio ou',
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            mode: 'live',
            keyLast4: undefined,
            webhookUrl: undefined,
          }
        : {
            method: 'none',
            status: 'none',
            accountName: undefined,
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            mode: undefined,
            keyLast4: undefined,
            webhookUrl: undefined,
          },
    mail: { fromName: '', fromAddress: 'noreply@shop.beta.lekalo.studio', replyTo: '' },
    closedByOperator: false,
    missingFeatures: [],
  };
}

const cur = (): Shop => (shop ??= start());

const stripeGate = () => {
  if (knob('stub.stripe') !== 'ready') refuse(501, 'stripe_not_ready');
};

/** The answer for a shop method, or `undefined` when this stub does not know it. */
export function shopStubAnswer(method: string, body: string | null): unknown {
  const a = answer(method, body);
  // a fresh copy, as JSON off the wire would be (the cache compares by value)
  return a === undefined ? undefined : structuredClone(a);
}

function answer(method: string, body: string | null): unknown {
  const req = (body ? JSON.parse(body) : {}) as Record<string, string | boolean | undefined>;
  const s = cur();
  const host = String(req.host ?? '');
  switch (method) {
    case 'GetShop':
      return { shop: s };
    case 'SetShopEnabled':
      s.enabled = !!req.enabled;
      s.status = s.enabled ? 'checkout_off' : 'off';
      s.domains = s.enabled ? [subdomain(true)] : [];
      s.primaryHost = SUB;
      return { shop: s };
    case 'AttachShopDomain': {
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) refuse(400, 'bad_host');
      if (host === 'taken.com') refuse(409, 'host_taken');
      s.domains = [...(s.domains ?? []), ...custom(host, false)];
      return { shop: s, domain: s.domains.find((d) => d.host === host) };
    }
    case 'CheckShopDomain': {
      for (const d of s.domains ?? [])
        if (d.host === host || d.redirectTo === host) {
          d.status = 'live';
          d.records = (d.records ?? []).map((r) => ({ ...r, found: true }));
        }
      return { shop: s, domain: s.domains?.find((d) => d.host === host) };
    }
    case 'RemoveShopDomain':
      s.domains = (s.domains ?? []).filter((d) => d.host !== host && d.redirectTo !== host);
      if (s.primaryHost === host) s.primaryHost = SUB;
      return { shop: s };
    case 'SetShopPrimaryHost':
      s.primaryHost = host;
      return { shop: s };
    case 'SetShopMail': {
      const reply = String(req.replyTo ?? '');
      if (reply && !reply.includes('@')) refuse(400, 'bad_reply_to');
      s.mail = { ...s.mail, fromName: String(req.fromName ?? ''), replyTo: reply } as Shop['mail'];
      return { shop: s };
    }
    case 'StartStripeConnect':
      stripeGate();
      return { url: 'https://connect.stripe.com/setup/s/stub', shop: s };
    case 'SetStripeKeys':
      stripeGate();
      s.payments = {
        method: 'keys',
        status: 'active',
        accountName: undefined,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        mode: String(req.publishableKey ?? '').startsWith('pk_test') ? 'test' : 'live',
        keyLast4: String(req.secretKey ?? '').slice(-4),
        webhookUrl: 'https://backend-beta.lekalo.studio/api/stripe/webhook/t7',
      };
      s.status = 'open';
      return { shop: s };
    case 'DisconnectStripe':
      stripeGate();
      s.payments = { ...s.payments, method: 'none', status: 'disconnected' } as Shop['payments'];
      s.status = 'checkout_off';
      return { shop: s };
    default:
      return undefined;
  }
}
