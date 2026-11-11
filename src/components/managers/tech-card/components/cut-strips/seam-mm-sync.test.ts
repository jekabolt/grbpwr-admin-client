import { describe, expect, it } from 'vitest';

import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import { syncCutStripSeamMm } from './seam-mm-sync';

const strip = {
  lineKey: 'strip-a',
  bomLineKey: 'binding-line',
  lengthMode: 'from_seam',
  seamKey: 'side-edge',
  sizes: [
    { sizeId: 1, seamMm: '', manualCutMm: '' },
    { sizeId: 2, seamMm: 'old', manualCutMm: '' },
  ],
} as CutStrip;

describe('syncCutStripSeamMm', () => {
  it('copies every measured cloth-side length and marks the form change dirty', () => {
    const result = syncCutStripSeamMm([strip], [1, 2], (key) =>
      key === 'side-edge'
        ? new Map([
            [1, 810],
            [2, 825],
          ])
        : undefined,
    );
    expect(result.strips[0].sizes?.map((row) => row.seamMm)).toEqual(['810', '825']);
    expect(result).toMatchObject({ changed: true, seamChanged: true });
  });

  it('preserves stored lengths when no pattern measurement is available', () => {
    const result = syncCutStripSeamMm([strip], [1, 2], () => undefined);
    expect(result.strips[0]).toBe(strip);
    expect(result).toMatchObject({ changed: false, seamChanged: false });
  });

  it('normalizes size rows without claiming a measured seam change', () => {
    const result = syncCutStripSeamMm([strip], [2, 3], () => undefined);
    expect(result.strips[0].sizes?.map((row) => row.sizeId)).toEqual([2, 3]);
    expect(result).toMatchObject({ changed: true, seamChanged: false });
  });

  describe('E5: a typed cut on a binding strip yields to the seam', () => {
    const typed = {
      ...strip,
      sizes: [
        { sizeId: 1, seamMm: '', manualCutMm: '700' },
        { sizeId: 2, seamMm: '800', manualCutMm: '790' },
      ],
    } as CutStrip;
    const live = (key: string) =>
      key === 'side-edge'
        ? new Map([
            [1, 810],
            [2, 825],
          ])
        : undefined;

    it('clears the typed cut only for the size whose length just appeared', () => {
      const result = syncCutStripSeamMm([typed], [1, 2], live, () => true);
      expect(result.strips[0].sizes).toEqual([
        { sizeId: 1, seamMm: '810', manualCutMm: '' },
        { sizeId: 2, seamMm: '825', manualCutMm: '790' },
      ]);
    });

    it('keeps the typed cut on a strip that is not binding', () => {
      const result = syncCutStripSeamMm([typed], [1, 2], live, () => false);
      expect(result.strips[0].sizes?.[0]).toEqual({ sizeId: 1, seamMm: '810', manualCutMm: '700' });
    });

    it('keeps the typed cut when the reader gives no live seam (rejected or stale)', () => {
      const result = syncCutStripSeamMm(
        [typed],
        [1, 2],
        () => undefined,
        () => true,
      );
      expect(result.strips[0]).toBe(typed);
    });

    it('keeps the typed cut while the size is still missing from the grading', () => {
      const result = syncCutStripSeamMm(
        [typed],
        [1, 2],
        () => new Map([[2, 825]]),
        () => true,
      );
      expect(result.strips[0].sizes?.[0]).toEqual({ sizeId: 1, seamMm: '', manualCutMm: '700' });
    });
  });
});
