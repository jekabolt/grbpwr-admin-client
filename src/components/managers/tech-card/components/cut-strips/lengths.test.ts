import { describe, expect, it } from 'vitest';

import { CUT_STRIP_MODES, goneSeamKeys, stripCutMm, stripSewnMm, withSeamGone } from './lengths';

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

describe('a strip on a seam whose decision no longer holds', () => {
  const rows = [
    { seamKey: 'ok', status: 'TECH_CARD_SEAM_STATUS_CONFIRMED', stale: false },
    { seamKey: 'no', status: 'TECH_CARD_SEAM_STATUS_REJECTED', stale: false },
    { seamKey: 'old', status: 'confirmed', stale: true },
  ];
  const gone = goneSeamKeys(rows);

  it('names the rejected and the stale seams, not the confirmed one', () => {
    expect([...gone].sort()).toEqual(['no', 'old']);
  });

  it('has no length from the stored seam', () => {
    for (const key of ['no', 'old']) {
      const marked = withSeamGone(strip({ seamKey: key }), gone);
      expect(stripCutMm(marked, 7)).toBeUndefined();
      expect(stripSewnMm(marked, 7)).toBeUndefined();
    }
  });

  it('keeps the length of a confirmed seam and of a seam with no row', () => {
    expect(stripCutMm(withSeamGone(strip({ seamKey: 'ok' }), gone), 7)).toBe(521);
    expect(stripCutMm(withSeamGone(strip({ seamKey: 'unknown' }), gone), 7)).toBe(521);
  });

  it('still takes a manual cut', () => {
    const manual = strip({
      seamKey: 'no',
      sizes: [{ sizeId: 7, seamMm: { value: '1001' }, manualCutMm: 540 }],
    });
    expect(stripCutMm(withSeamGone(manual, gone), 7)).toBe(540);
  });
});
