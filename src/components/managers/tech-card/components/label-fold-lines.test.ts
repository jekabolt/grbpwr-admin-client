import { describe, expect, it } from 'vitest';

import {
  foldFront,
  foldWordOf,
  foldedSpans,
  labelAssembly,
  labelAxisLen,
  layersAt,
  parseStitchLines,
  formatFoldLines,
  labelFoldLines,
  parseFoldLines,
  presetFoldLines,
  teeFolded,
  teeStem,
  teeStitch,
  teeStitchLines,
} from './label-fold-lines';

describe('label fold lines', () => {
  it('uses width only for the explicit width axis', () => {
    expect(labelAxisLen({ widthMm: '100', heightMm: '30', foldAxis: 'width' })).toBe(100);
    expect(labelAxisLen({ widthMm: '100', heightMm: '30', foldAxis: '' })).toBe(30);
    expect(labelAxisLen({ widthMm: { value: '75,5' }, heightMm: '20', foldAxis: 'width' })).toBe(
      75.5,
    );
  });

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
    expect(presetFoldLines('tee', 100)).toEqual([42, 58]);
  });

  it('shades from each end to the nearest line, one line = everything after it', () => {
    expect(foldedSpans([50], 100)).toEqual([[50, 100]]);
    expect(foldedSpans([12, 40, 88], 100)).toEqual([
      [0, 12],
      [88, 100],
    ]);
    expect(foldedSpans([], 100)).toEqual([]);
  });

  it('keeps tee explicit and folds only its stem band', () => {
    expect(foldWordOf([42, 58], 100)).toBe('ends');
    expect(foldWordOf([42, 58], 100, 'tee')).toBe('tee');
    expect(foldedSpans([42, 58], 100, 'tee')).toEqual([[42, 58]]);
    expect(foldFront([42, 58], 100, 'tee')).toEqual([0, 84]);
    expect(teeStem([42, 58])).toBe(8);
    expect(teeFolded([42, 58], 100)).toBe(84);
  });

  it('stores one tee stitch distance as two absolute lines', () => {
    expect(teeStitchLines(3, [42, 58])).toEqual([47, 53]);
    expect(teeStitch([47, 53], [42, 58])).toBe(3);
    expect(teeStitchLines(0, [42, 58])).toEqual([49, 51]);
    expect(teeStitchLines(20, [42, 58])).toEqual([43, 57]);
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
  it('joins tee wings at the internal tip line', () => {
    expect(labelAssembly([42, 58], [47, 53], 100, 'tee')).toEqual({
      foldedMm: 84,
      heightMm: 84,
      stitches: [42],
      shownStitches: [42],
      sewnTop: false,
      sewnAtMm: 42,
      layers: 2,
    });
    expect(layersAt(42, [42, 58], 100, 'tee')).toBe(2);
    expect(layersAt(12, [42, 58], 100, 'tee')).toBe(1);
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

  it('folds and stitches a width-axis label from the left', async () => {
    const { labelShownSizeText } = await import('./garment-label-pieces');
    expect(
      labelShownSizeText({
        kind: 'composition',
        widthMm: '100',
        heightMm: '30',
        foldAxis: 'width',
        fold: 'half',
        foldLinesMm: '50',
        stitchLinesMm: '40,60',
      }),
    ).toBe('40 × 30');
  });

  it('shows both tee wings on either fold axis', async () => {
    const { labelShownSizeText } = await import('./garment-label-pieces');
    expect(
      labelShownSizeText({
        kind: 'composition',
        widthMm: '30',
        heightMm: '100',
        fold: 'tee',
        foldLinesMm: '42,58',
        stitchLinesMm: '47,53',
      }),
    ).toBe('30 × 84');
    expect(
      labelShownSizeText({
        kind: 'composition',
        widthMm: '100',
        heightMm: '30',
        foldAxis: 'width',
        fold: 'tee',
        foldLinesMm: '42,58',
        stitchLinesMm: '47,53',
      }),
    ).toBe('84 × 30');
  });
});

describe('one fold line keeps the sewn edge in front', () => {
  it('shows from the sewn edge to the fold, whichever side is longer', () => {
    expect(labelAssembly([12], [], 100).foldedMm).toBe(12);
    expect(labelAssembly([48], [], 100).foldedMm).toBe(48);
    expect(labelAssembly([70], [], 100).foldedMm).toBe(70);
  });
});
