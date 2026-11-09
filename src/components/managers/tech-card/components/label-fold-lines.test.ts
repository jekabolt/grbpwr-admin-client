import { describe, expect, it } from 'vitest';

import {
  foldedSpans,
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
