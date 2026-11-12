import { beforeEach, describe, expect, it } from 'vitest';

import { toWire, type StoredSeam } from 'lib/seams';

import { CARD6_SEAMS } from '../step-seams/card6.fixture';
import { hydrateSeams, resetSeams, reuseKeys, useSeamsStore, writeRefusal } from './seams-store';

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

describe('an older list never replaces a newer one (C7, invariant 3)', () => {
  const [a, b, c] = [...CARD6_SEAMS.values()];
  const keys = () => useSeamsStore.getState().server.map((r) => r.seamKey);
  beforeEach(() => resetSeams());

  it('two replies out of order: the later version stays', () => {
    hydrateSeams(6, [toWire(a)], 10);
    // The second write (v12: a, b, c) answers before the first (v11: a, b).
    expect(hydrateSeams(6, [a, b, c].map(toWire), 12)).toBe(true);
    expect(hydrateSeams(6, [a, b].map(toWire), 11)).toBe(false);
    expect(keys()).toEqual([a, b, c].map((r) => r.seamKey));
    expect(useSeamsStore.getState().serverVersion).toBe(12);
  });

  it('a card read older than the store changes nothing; a newer one is taken', () => {
    hydrateSeams(6, [a, b].map(toWire), 12);
    expect(hydrateSeams(6, [toWire(a)], 11)).toBe(false);
    expect(keys()).toEqual([a, b].map((r) => r.seamKey));
    expect(hydrateSeams(6, [toWire(a)], 13)).toBe(true);
    expect(keys()).toEqual([a.seamKey]);
  });

  it('an equal version is taken only when it says the same', () => {
    hydrateSeams(6, [a, b].map(toWire), 12);
    expect(hydrateSeams(6, [a, b].map(toWire), 12)).toBe(true);
    expect(hydrateSeams(6, [toWire(a)], 12)).toBe(false);
    expect(keys()).toEqual([a, b].map((r) => r.seamKey));
  });

  it('another card resets the store whatever its version', () => {
    hydrateSeams(6, [a, b].map(toWire), 40);
    expect(hydrateSeams(7, [toWire(c)], 3)).toBe(true);
    expect(keys()).toEqual([c.seamKey]);
    expect(useSeamsStore.getState().serverVersion).toBe(3);
    // Back to the first card: its old store is gone, so its read is taken as is.
    expect(hydrateSeams(6, [toWire(a)], 2)).toBe(true);
    expect(keys()).toEqual([a.seamKey]);
  });

  it('a list without a version (the old RPCs) is taken and keeps the version', () => {
    hydrateSeams(6, [a, b].map(toWire), 12);
    expect(hydrateSeams(6, [toWire(a)])).toBe(true);
    expect(keys()).toEqual([a.seamKey]);
    expect(useSeamsStore.getState().serverVersion).toBe(12);
  });
});
