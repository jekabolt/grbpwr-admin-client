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
});
