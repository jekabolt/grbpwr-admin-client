import { describe, expect, it } from 'vitest';
import { isGoodLogo, LOGO_MAX_BYTES, toBase64 } from './logo';
import { oauthErrorWord, parseOAuthFragment } from './oauth';

describe('parseOAuthFragment', () => {
  it.each([
    ['', null],
    ['#', null],
    ['#code=abc', { code: 'abc' }],
    ['code=abc&x=1', { code: 'abc' }],
    ['#error=expired', { error: 'expired' }],
    ['#error=use_password', { error: 'use_password' }],
    ['#error=invite_mismatch', { error: 'invite_mismatch' }],
    ['#error=whatever', { error: 'try_again' }],
    ['#error=', { error: 'try_again' }],
  ])('%s', (hash, want) => expect(parseOAuthFragment(hash)).toEqual(want));
});

describe('oauthErrorWord', () => {
  it('uses existing words only', () => {
    expect(oauthErrorWord('expired')).toBe('link expired');
    expect(oauthErrorWord('cancelled')).toBe('try again');
    expect(oauthErrorWord('use_password')).toBe('try again');
  });
});

describe('isGoodLogo', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
  it('accepts PNG and JPEG by their first bytes', () => {
    expect(isGoodLogo(png)).toBe(true);
    expect(isGoodLogo(jpeg)).toBe(true);
  });
  it('refuses SVG, GIF, empty, truncated', () => {
    expect(isGoodLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      false,
    );
    expect(isGoodLogo(new TextEncoder().encode('GIF89a'))).toBe(false);
    expect(isGoodLogo(new Uint8Array())).toBe(false);
    expect(isGoodLogo(png.subarray(0, 5))).toBe(false);
  });
  it('refuses over 1 MB', () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(png);
    expect(isGoodLogo(big)).toBe(false);
    const edge = new Uint8Array(LOGO_MAX_BYTES);
    edge.set(png);
    expect(isGoodLogo(edge)).toBe(true);
  });
});

describe('toBase64', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0))).toEqual(bytes);
  });
});
