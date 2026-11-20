import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { isChallenge, payload, solve, type Challenge } from './solve';

const salt = 'a1b2c3d4e5f6a1b2c3d4e5f6?expires=1900000000&issued=1890000000000';
const task = (n: number, maxnumber = 5_000): Challenge => ({
  algorithm: 'SHA-256',
  challenge: createHash('sha256')
    .update(salt + n)
    .digest('hex'),
  maxnumber,
  salt,
  signature: 'f'.repeat(64),
});

describe('signup proof', () => {
  it('finds the number, also at both ends of the range', async () => {
    expect(await solve(task(1234))).toBe(1234);
    expect(await solve(task(0))).toBe(0);
    expect(await solve(task(5_000))).toBe(5_000);
  });

  it('gives up past the range or when stopped', async () => {
    expect(await solve(task(6_000))).toBeNull();
    expect(await solve(task(4_000), undefined, () => true)).toBeNull();
  });

  it('pauses between batches', async () => {
    let pauses = 0;
    expect(await solve(task(700), async () => void pauses++)).toBe(700);
    expect(pauses).toBeGreaterThan(5);
  });

  it('builds the ALTCHA v1 payload the server reads', () => {
    const c = task(7);
    expect(JSON.parse(atob(payload(c, 7, 812.6)))).toEqual({
      algorithm: 'SHA-256',
      challenge: c.challenge,
      number: 7,
      salt,
      signature: c.signature,
      took: 813,
    });
  });

  it('treats anything but a real task as no task', () => {
    expect(isChallenge(task(1))).toBe(true);
    expect(isChallenge(null)).toBe(false);
    expect(isChallenge({ ...task(1), algorithm: 'SHA-1' })).toBe(false);
    expect(isChallenge({ ...task(1), challenge: 'zz' })).toBe(false);
    expect(isChallenge({ ...task(1), maxnumber: 0 })).toBe(false);
    expect(isChallenge('<html>')).toBe(false);
  });
});
