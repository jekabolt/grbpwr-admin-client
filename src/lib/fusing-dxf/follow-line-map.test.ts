import { describe, expect, it } from 'vitest';
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseInternalLine } from './dxf';
import { followLineMove, type LineByMap } from './follow-line';
import type { LinePair } from './zone-grade';

const line = (y: number, x0 = 0, x1 = 100): FuseInternalLine => ({
  layer: 'internal',
  closed: false,
  points: [
    { x: x0, y },
    { x: x1, y },
  ],
});

// Base: two parallel lines 3 mm apart. On the size each moved and turned its own way, so the
// geometric pairing can mistake one twin for the other.
const lower = line(50);
const upper = line(53);
const lowerTwin: PtMm[] = [
  { x: 10, y: 60 },
  { x: 110, y: 60 },
];
const upperTwin: PtMm[] = [
  { x: 0, y: 64 },
  { x: 100, y: 74 },
];
const anchor = { x: 40, y: 53 };
const ring: PtMm[] = [
  { x: 30, y: 53 },
  { x: 50, y: 53 },
  { x: 50, y: 70 },
  { x: 30, y: 70 },
];
// What inference returned: the anchor's line (upper) paired with the lower line's twin.
const wrong: LinePair = { from: upper.points, to: lowerTwin, closed: false };
const byMap = (hit: boolean): LineByMap => ({
  lines: [lower, upper],
  resolve: (l) => (!hit ? null : l === upper ? upperTwin : l === lower ? lowerTwin : null),
});
const near = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

describe('follow_line by the grade map', () => {
  it('the map picks the right twin of two close parallel lines', () => {
    const move = followLineMove(anchor, wrong, byMap(true))!;
    // The anchor lands on the upper line's twin, at the same share of its length.
    expect(near(move(anchor), { x: 40, y: 68 })).toBeLessThan(1e-9);
    // The ring turns as the upper line turned.
    const a = move(ring[0]);
    const b = move(ring[1]);
    expect(Math.atan2(b.y - a.y, b.x - a.x)).toBeCloseTo(Math.atan2(10, 100), 9);
    // Inference alone puts it on the lower twin.
    expect(near(followLineMove(anchor, wrong)!(anchor), { x: 50, y: 60 })).toBeLessThan(1e-9);
  });

  it('a twin with other points pairs by share of length', () => {
    const dense = {
      ...byMap(true),
      resolve: (l: FuseInternalLine) =>
        l === upper ? [0, 0.25, 0.5, 1].map((s) => ({ x: 100 * s, y: 64 + 10 * s })) : null,
    };
    expect(near(followLineMove(anchor, wrong, dense)!(anchor), { x: 40, y: 68 })).toBeLessThan(
      1e-9,
    );
  });

  it('a miss falls back to inference, unchanged', () => {
    const today = followLineMove(anchor, wrong)!;
    const missed = followLineMove(anchor, wrong, byMap(false))!;
    const offLine = followLineMove({ x: 40, y: 51.5 }, wrong, byMap(true))!;
    const todayOff = followLineMove({ x: 40, y: 51.5 }, wrong)!;
    for (const p of ring) {
      expect(missed(p)).toEqual(today(p));
      expect(offLine(p)).toEqual(todayOff(p));
    }
    expect(followLineMove(anchor, null, byMap(false))).toBeNull();
  });

  it('a hit carries a ring even when inference found no twin', () => {
    expect(near(followLineMove(anchor, null, byMap(true))!(anchor), { x: 40, y: 68 })).toBeLessThan(
      1e-9,
    );
  });
});
