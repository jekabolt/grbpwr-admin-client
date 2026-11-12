import { describe, expect, it } from 'vitest';

import type { Affine, Pt2 } from 'lib/assembly-skeleton/types';
import {
  DEFAULT_SEAM_TOLERANCE_MM,
  lengthsDiffer,
  overlapOnLayout,
  sideLengthMm,
  seamToleranceOf,
} from './seam-length';

describe('seam tolerance', () => {
  it('an empty step takes the default, and 0 is a real value', () => {
    expect(seamToleranceOf('')).toBe(DEFAULT_SEAM_TOLERANCE_MM);
    expect(seamToleranceOf(undefined)).toBe(DEFAULT_SEAM_TOLERANCE_MM);
    expect(seamToleranceOf('0')).toBe(0);
    expect(seamToleranceOf('2,5')).toBe(2.5);
    expect(seamToleranceOf('-1')).toBe(DEFAULT_SEAM_TOLERANCE_MM);
  });

  it('the owner’s 51 / 50 and 82 / 81 pass at the default and fail at 0', () => {
    expect(lengthsDiffer(51, 50, DEFAULT_SEAM_TOLERANCE_MM)).toBe(false);
    expect(lengthsDiffer(82, 81, DEFAULT_SEAM_TOLERANCE_MM)).toBe(false);
    expect(lengthsDiffer(51, 50, 0)).toBe(true);
    expect(lengthsDiffer(82, 81, 0)).toBe(true);
  });

  it('0 is the old rule: equal when the printed whole millimetres are equal', () => {
    expect(lengthsDiffer(50.4, 49.6, 0)).toBe(false);
    expect(lengthsDiffer(50.6, 50.4, 0)).toBe(true);
  });

  it('a bigger difference stays red until the tolerance covers it', () => {
    expect(lengthsDiffer(52, 50, DEFAULT_SEAM_TOLERANCE_MM)).toBe(true);
    expect(lengthsDiffer(120, 114, 5)).toBe(true);
    expect(lengthsDiffer(120, 114, 6)).toBe(false);
  });
});

describe('inner contour lengths', () => {
  it('counts only the picked inner stretch', () => {
    expect(sideLengthMm([{ target: 'HOST:i0', range: [35, 175] }], new Map(), () => 300)).toBe(140);
    expect(sideLengthMm([{ target: 'HOST:i0' }], new Map(), () => 300)).toBe(300);
  });
});

describe('a side laid on itself in the step picture', () => {
  const at = (dx: number, dy = 0): Affine => [1, 0, 0, 1, dx, dy];
  const line = (piece: string, from: Pt2, to: Pt2) => ({
    piece,
    pts: [from, to],
    lenMm: Math.hypot(to[0] - from[0], to[1] - from[1]),
  });

  it('a pocket edge running 150 mm along its panel edge counts that stretch once', () => {
    // Panel 0..572, pocket 422..701 (279 long, 150 on the panel): one sewn line of 701.
    const parts = [line('P', [0, 0], [572, 0]), line('PCK', [0, 0], [279, 0])];
    const placed = new Map([
      ['P', at(0)],
      ['PCK', at(422)],
    ]);
    expect(overlapOnLayout(parts, placed)).toBeCloseTo(150, 0);
  });

  it('pieces end to end lose nothing', () => {
    const parts = [line('P', [0, 0], [300, 0]), line('Q', [0, 0], [200, 0])];
    const placed = new Map([
      ['P', at(0)],
      ['Q', at(300)],
    ]);
    expect(overlapOnLayout(parts, placed)).toBeLessThan(1);
  });

  it('crossing edges lose nothing', () => {
    const parts = [line('P', [0, 0], [300, 0]), line('Q', [0, -100], [0, 100])];
    const placed = new Map([
      ['P', at(0)],
      ['Q', at(150)],
    ]);
    expect(overlapOnLayout(parts, placed)).toBeLessThan(4);
  });

  it('two edges of one piece never cancel each other', () => {
    const parts = [line('P', [0, 0], [300, 0]), line('P', [0, 1], [300, 1])];
    expect(overlapOnLayout(parts, new Map([['P', at(0)]]))).toBe(0);
  });

  it('a piece without a place counts whole', () => {
    const parts = [line('P', [0, 0], [300, 0]), line('Q', [0, 0], [300, 0])];
    expect(overlapOnLayout(parts, new Map([['P', at(0)]]))).toBe(0);
  });
});
