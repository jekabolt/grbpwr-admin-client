import { describe, expect, it } from 'vitest';

import { CUT_STRIP_MODES, stripCutMm, stripSewnMm } from './lengths';

const strip = (overrides: Record<string, unknown> = {}) => ({
  lengthMode: 'from_seam',
  fitPct: { value: '50' },
  overlapMm: { value: '20' },
  sizes: [{ sizeId: 7, seamMm: { value: '1001' } }],
  ...overrides,
});

describe('cut strip lengths', () => {
  it('keeps the fixed mode order', () => {
    expect(CUT_STRIP_MODES).toEqual(['from_seam', 'per_size', 'one_length']);
  });

  it('rounds an exact half up to a whole millimetre', () => {
    expect(stripCutMm(strip(), 7)).toBe(521);
    expect(stripSewnMm(strip(), 7)).toBe(501);
  });

  it('lets a manual size override the seam formula', () => {
    expect(
      stripCutMm(strip({ sizes: [{ sizeId: 7, seamMm: { value: '1001' }, manualCutMm: 540 }] }), 7),
    ).toBe(540);
  });

  it('returns undefined when the requested size has no known length', () => {
    expect(stripCutMm(strip(), 8)).toBeUndefined();
    expect(stripSewnMm(strip({ sizes: [{ sizeId: 7 }] }), 7)).toBeUndefined();
  });
});
