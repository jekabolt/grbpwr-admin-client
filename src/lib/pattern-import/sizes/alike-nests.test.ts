import { describe, expect, it } from 'vitest';

import type { Chain, PtMm, Style } from '../types';
import { rankAlikeNests } from './alike-nests';

// Sizes drawn in one pen (the key prints one sample for 8, 22 and 24) are told apart by how their
// closed outlines nest, between the outlines of sizes whose ranks are known.

const INK: [number, number, number] = [44, 46, 53];
const pen = (id: number, dash: number[] | null): Style => ({
  id,
  strokeRgb: INK,
  widthMm: 0.53,
  dash,
  layer: null,
  fill: false,
  clip: null,
});
const SHARED = [9.57, 1.03, 1.71, 1.03];

/** A closed square outline of side `s`, centred on the origin. */
function square(id: number, s: number, style: number): Chain {
  const h = s / 2;
  const pts: PtMm[] = [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
    { x: -h, y: -h },
  ];
  return { id, pts, closed: true, ranges: [], motif: null, style, lengthMm: 4 * s };
}

/** Ranks: 4 (key "6", own pen), [5 ("8"), 6 ("10")] one pen, 7 ("12", own pen). */
function scene() {
  const styles = new Map<number, Style>([
    [0, pen(0, [9.88, 1.06])],
    [1, pen(1, SHARED)],
    [2, pen(2, [4.94, 1.06])],
  ]);
  // nested squares: 6 (own pen), then two of the shared pen, then 12 (own pen)
  const chains = [square(0, 100, 0), square(1, 120, 1), square(2, 140, 1), square(3, 160, 2)];
  const rankOf = new Map<number, number>([
    [0, 4],
    [3, 7],
  ]);
  // key samples: "8" and "10" print the shared pen; chains 10 and 11 are their sample strokes
  const sample = (id: number, style: number): Chain => ({
    ...square(id, 1, style),
    closed: false,
    lengthMm: 40,
  });
  chains.push(sample(4, 1), sample(5, 1));
  const samples = [
    { label: '8', chain: 4 },
    { label: '10', chain: 5 },
  ];
  const keyRank = new Map([
    ['8', 5],
    ['10', 6],
  ]);
  return { styles, chains, rankOf, samples, keyRank };
}

describe('rankAlikeNests', () => {
  it('gives the outlines of the shared pen the ranks that fall between the known ones, by area', () => {
    const { styles, chains, rankOf, samples, keyRank } = scene();
    const given = rankAlikeNests({
      chains,
      rankOf,
      styles,
      samples,
      keyRank,
      candidate: (i) => i < 4,
    });
    expect([...given].sort()).toEqual([5, 6]);
    expect(rankOf.get(1)).toBe(5); // the smaller of the two is the smaller size
    expect(rankOf.get(2)).toBe(6);
  });

  it('guesses nothing when the outlines are fewer than the sizes between the known ranks', () => {
    const { styles, chains, rankOf, samples, keyRank } = scene();
    chains.splice(2, 1); // only one outline of the shared pen is left for two sizes
    const given = rankAlikeNests({
      chains,
      rankOf: new Map([[0, 4]]),
      styles,
      samples,
      keyRank,
      candidate: (i) => i < 3,
    });
    expect(given.size).toBe(0);
    expect(rankOf.get(1)).toBeUndefined();
  });

  it('changes nothing for a file where every size of the pen has a line', () => {
    const { styles, chains, rankOf, samples, keyRank } = scene();
    rankOf.set(1, 5);
    rankOf.set(2, 6);
    const before = [...rankOf];
    const given = rankAlikeNests({
      chains,
      rankOf,
      styles,
      samples,
      keyRank,
      candidate: (i) => i < 4,
    });
    expect(given.size).toBe(0);
    expect([...rankOf]).toEqual(before);
  });
});

it('certifies a shared baseline from the two adjacent identified outlines', () => {
  const { styles, samples, keyRank } = scene();
  keyRank.set('10', 13);
  const chains = [
    square(0, 100, 0),
    square(1, 105, 1),
    square(2, 110, 2),
    square(3, 150, 1),
    square(4, 1, 1),
    square(5, 1, 1),
  ];
  for (const c of chains) {
    const base = c.pts[0];
    c.pts = c.pts.map((p) => ({ x: p.x - base.x, y: p.y - base.y }));
  }
  const rankOf = new Map([
    [0, 4],
    [2, 6],
  ]);
  const certified: number[] = [];
  rankAlikeNests({
    chains,
    styles,
    samples,
    keyRank,
    rankOf,
    candidate: (i) => i < 4,
    anchorRank: (i) => rankOf.get(i),
    onBracket: (i) => certified.push(i),
  });
  expect(certified).toEqual([1]);
  expect(rankOf.get(1)).toBe(5);
});
