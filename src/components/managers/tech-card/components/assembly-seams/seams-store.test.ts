import { describe, expect, it } from 'vitest';

import type { StoredSeam } from 'lib/seams';

import { reuseKeys, writeRefusal } from './seams-store';

const row = (seamKey: string, a = 'BP#1', b = 'FP#3') =>
  ({
    seamKey,
    kind: 'edge',
    sideA: [{ edgeHint: a, range: [0, 0] }],
    sideB: [{ edgeHint: b, range: [0, 0] }],
  }) as unknown as StoredSeam;

describe('the refusal an ACCEPT shows (C3)', () => {
  const stored = row('OLD');
  const fresh = row('NEW');

  it('a row put onto a pair already stored is written, and refused, under that pair key', () => {
    expect(reuseKeys([fresh], [stored])[0].seamKey).toBe('OLD');
    const state = { server: [stored], pending: {}, errors: { OLD: 'duplicate_anchor' } };
    // The picker read errors[NEW] and showed a bare «not saved».
    expect((state.errors as Record<string, string>)[fresh.seamKey]).toBeUndefined();
    expect(writeRefusal(fresh, state)).toBe('duplicate_anchor');
  });

  it('its own key still answers', () => {
    expect(writeRefusal(fresh, { server: [], pending: {}, errors: { NEW: 'refused' } })).toBe(
      'refused',
    );
  });

  it('a write dropped because the pair is still saving says so', () => {
    const state = {
      server: [],
      pending: { OLD: { kind: 'upsert' as const, row: stored } },
      errors: {},
    };
    expect(writeRefusal(fresh, state)).toBe('still saving');
  });

  it('nothing known: the plain words', () => {
    expect(writeRefusal(fresh, { server: [], pending: {}, errors: {} })).toBe('not saved');
  });
});
