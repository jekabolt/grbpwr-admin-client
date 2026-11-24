import { describe, expect, it } from 'vitest';
import type { Shop } from 'api/proto-http/admin';
import {
  cleanHost,
  domainMark,
  missingRecords,
  payState,
  primaryChoices,
  refusalWord,
  shopMark,
  stripeFinishToken,
  stripeNotReady,
  withoutStripeReturn,
} from './model';

const d = (o: Record<string, unknown>) => o as never;

describe('shop model', () => {
  it('maps statuses to words', () => {
    expect(shopMark('checkout_off')).toEqual({ word: 'checkout off', tone: 'attention' });
    expect(shopMark(undefined).word).toBe('off');
    expect(domainMark(d({ status: 'live', redirectTo: 'a.com' })).word).toBe('redirect');
    expect(domainMark(d({ status: 'records_needed' })).word).toBe('records needed');
  });

  it('counts missing records of domains not live', () => {
    const shop = {
      domains: [
        {
          kind: 'custom',
          status: 'records_needed',
          records: [{ found: false }, { found: true }, { found: false }],
        },
        { kind: 'custom', status: 'records_needed', redirectTo: 'x', records: [{ found: false }] },
        { kind: 'custom', status: 'live', records: [{ found: false }] },
      ],
    } as unknown as Shop;
    expect(missingRecords(shop)).toBe(2);
  });

  it('offers the address and live own domains as the main address', () => {
    const shop = {
      address: 'a.shop.lekalo.studio',
      domains: [
        { host: 'a.shop.lekalo.studio', kind: 'subdomain', status: 'live' },
        { host: 'a.com', kind: 'custom', status: 'live' },
        { host: 'www.a.com', kind: 'custom', status: 'live', redirectTo: 'a.com' },
        { host: 'b.com', kind: 'custom', status: 'records_needed' },
      ],
    } as unknown as Shop;
    expect(primaryChoices(shop)).toEqual(['a.shop.lekalo.studio', 'a.com']);
  });

  it('reads payments state', () => {
    expect(payState(undefined)).toBe('none');
    expect(payState(d({ method: 'connect', status: 'disconnected' }))).toBe('none');
    expect(payState(d({ method: 'connect', status: 'onboarding' }))).toBe('onboarding');
    expect(payState(d({ method: 'keys', status: 'active' }))).toBe('active');
  });

  it('words refusals and spots stripe_not_ready', () => {
    expect(refusalWord(new Error('rpc error: host_taken'))).toBe('domain taken');
    expect(refusalWord(Object.assign(new Error('x'), { status: 403 }))).toBe('owner only');
    expect(stripeNotReady(new Error('Unimplemented stripe_not_ready'))).toBe(true);
    expect(stripeNotReady(new Error('host_taken'))).toBe(false);
  });

  it('words the stripe refusals', () => {
    expect(refusalWord(new Error('stripe_connect_expired'))).toBe('connect again');
    expect(refusalWord(new Error('stripe_connect_not_yours'))).toBe('not yours');
    expect(refusalWord(new Error('stripe_wrong_mode'))).toBe('wrong mode');
    expect(refusalWord(new Error('shop_payments_busy'))).toBe('orders pending');
    expect(refusalWord(new Error('stripe_connected'))).toBe('already connected');
  });

  it('reads the stripe return and cleans the address', () => {
    expect(stripeFinishToken('?stripe=finish', '#token=abc')).toBe('abc');
    expect(stripeFinishToken('?stripe=cancelled', '#token=abc')).toBeNull();
    expect(stripeFinishToken('?stripe=finish', '')).toBeNull();
    expect(withoutStripeReturn('/shop', '?stripe=finish')).toBe('/shop');
    expect(withoutStripeReturn('/shop', '?a=1&stripe=error')).toBe('/shop?a=1');
  });

  it('cleans a typed host', () => {
    expect(cleanHost(' https://Brand.com/shop ')).toBe('brand.com');
  });
});
