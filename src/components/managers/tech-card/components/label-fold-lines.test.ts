import { describe, expect, it } from 'vitest';

import {
  foldedSpans,
  labelAssembly,
  parseStitchLines,
  formatFoldLines,
  labelFoldLines,
  parseFoldLines,
  presetFoldLines,
} from './label-fold-lines';

describe('label fold lines', () => {
  it('parses, drops bad items, keeps 0 < v < height, sorts and dedupes', () => {
    expect(parseFoldLines('88, 12,x,0,-3,100,12.04,150', 100)).toEqual([12, 88]);
    expect(parseFoldLines('', 100)).toEqual([]);
  });

  it('formats as CSV without spaces', () => {
    expect(formatFoldLines([50, 10, 10], 100)).toBe('10,50');
  });

  it('derives lines from the fold word only when nothing is stored', () => {
    expect(labelFoldLines({ fold: 'ends' }, 100)).toEqual([10, 90]);
    expect(labelFoldLines({ fold: 'half', foldLinesMm: '30' }, 100)).toEqual([30]);
    expect(presetFoldLines('flat', 100)).toEqual([]);
  });

  it('shades from each end to the nearest line, one line = everything after it', () => {
    expect(foldedSpans([50], 100)).toEqual([[50, 100]]);
    expect(foldedSpans([12, 40, 88], 100)).toEqual([
      [0, 12],
      [88, 100],
    ]);
    expect(foldedSpans([], 100)).toEqual([]);
  });
});

describe('label assembly', () => {
  it('folds the owner photo label in half and sews both stitches as one', () => {
    const a = labelAssembly([50], [40, 60], 100);
    expect(a).toEqual({
      foldedMm: 50,
      heightMm: 40,
      stitches: [40],
      shownStitches: [0],
      sewnTop: true,
      layers: 2,
    });
  });
  it('sews a loop by both ends', () => {
    expect(labelAssembly([50], [0, 100], 100)).toMatchObject({
      heightMm: 50,
      stitches: [0],
      layers: 2,
    });
  });
  it('keeps the folded size without a stitch', () => {
    expect(labelAssembly([10, 90], [], 100)).toMatchObject({
      foldedMm: 80,
      heightMm: 80,
      sewnTop: false,
    });
  });
  it('merges stitches that miss each other by half a millimetre', () => {
    expect(labelAssembly([50], [39.5, 60], 100)).toMatchObject({
      stitches: [39.5],
      heightMm: 39.5,
    });
  });
  it('keeps a flat label sewn at both ends whole, with both seams', () => {
    expect(labelAssembly([], [0, 100], 100)).toMatchObject({
      heightMm: 100,
      shownStitches: [0, 100],
      sewnTop: true,
      layers: 1,
    });
  });
  it('sews an end-fold label through its folds', () => {
    expect(labelAssembly([10, 90], [10, 90], 100)).toMatchObject({
      foldedMm: 80,
      heightMm: 80,
      shownStitches: [0, 80],
      layers: 2,
    });
  });
  it('cuts at the stitch nearest an end and keeps the longer part', () => {
    expect(labelAssembly([], [80], 100)).toMatchObject({ heightMm: 80, shownStitches: [0] });
    expect(labelAssembly([], [20], 100)).toMatchObject({ heightMm: 80, shownStitches: [0] });
  });
  it('ignores stitches on a label without a height', () => {
    expect(labelAssembly([], [10], 0)).toMatchObject({ sewnTop: false, shownStitches: [] });
  });
  it('reads edges as stitch positions', () => {
    expect(parseStitchLines('0, 100, 120, -1, 40', 100)).toEqual([0, 40, 100]);
  });
});

describe('label shown size', () => {
  it('reads the owner photo label as 30 × 40 on the garment', async () => {
    const { labelShownSizeText } = await import('./garment-label-pieces');
    expect(
      labelShownSizeText({
        kind: 'composition',
        widthMm: '30',
        heightMm: '100',
        fold: 'half',
        foldLinesMm: '50',
        stitchLinesMm: '40,60',
      }),
    ).toBe('30 × 40');
    expect(labelShownSizeText({ kind: 'composition', widthMm: '30', heightMm: '100' })).toBe(
      '30 × 100',
    );
    expect(labelShownSizeText({ kind: 'composition' })).toBe('');
  });
});
