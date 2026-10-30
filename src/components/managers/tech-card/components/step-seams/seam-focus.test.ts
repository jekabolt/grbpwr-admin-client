import { describe, expect, it } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import { isGuess, placeHasDrop, seamFocus } from './seam-focus';

const collar = [
  { name: 'Main collar', pieces: ['MAIN'] },
  { name: 'Second collar', pieces: ['SECOND'] },
];

describe('seamFocus', () => {
  it('a pair on the table keeps only its pieces', () => {
    const groups = [...collar, { name: 'Band', pieces: ['BAND'] }];
    expect(seamFocus(groups, new Set(['MAIN', 'SECOND']), [])).toEqual(collar);
  });

  it('a lone pick with no partner keeps the other input on the canvas', () => {
    // The collar after «place»: the second collar's edge picked alone hid the main collar, so
    // nothing on it could be picked and accept stayed grey.
    expect(seamFocus(collar, new Set(['SECOND']), [])).toBeNull();
  });

  it('one input: a lone pick keeps the rest of its pieces', () => {
    const one = [{ name: 'Front', pieces: ['F', 'P'] }];
    expect(seamFocus(one, new Set(['F']), [])).toBeNull();
    expect(seamFocus(one, new Set(['F', 'P']), [])).toEqual(one);
  });

  it('a seam between two later inputs still hides an input it does not touch', () => {
    const groups = [{ name: 'Body', pieces: ['BODY'] }, ...collar];
    expect(seamFocus(groups, new Set(['MAIN', 'SECOND']), [])).toEqual(collar);
  });

  it('nothing on the table: no focus', () => {
    expect(seamFocus(collar, new Set(), [])).toBeNull();
  });
});

describe('placeHasDrop', () => {
  const piece = (key: string, lens: number[], inner = 0) => ({
    inner: Array.from({ length: inner }, () => []),
    geom: {
      pieceKey: key,
      edges: lens.map((lenMm, i) => ({ id: `${key}#${i}`, kind: 'edge', lenMm })),
    } as unknown as PieceGeom,
  });
  const free = () => false;

  it('a host inner line takes the part', () => {
    expect(placeHasDrop([piece('H', [100], 1)], piece('P', [400]), free, null)).toBe(true);
  });

  it('a free host edge of the part’s length takes it, a taken one does not', () => {
    const host = piece('H', [439, 120]);
    const part = piece('P', [439.2, 60]);
    expect(placeHasDrop([host], part, free, null)).toBe(true);
    expect(placeHasDrop([host], part, (id) => id === 'H#0', null)).toBe(false);
  });

  it('nothing near in length and no inner line: nowhere to drop (the collar sewn all round)', () => {
    expect(placeHasDrop([piece('H', [421, 120])], piece('P', [200, 80]), free, null)).toBe(false);
  });
});

describe('isGuess', () => {
  it('only a proposal flagged not confident is a guess', () => {
    expect(isGuess({ confident: false })).toBe(true);
    expect(isGuess({ confident: true })).toBe(false);
    expect(isGuess({})).toBe(false);
    expect(isGuess(null)).toBe(false);
  });
});
