import { describe, expect, it } from 'vitest';

import type { LineClass } from 'lib/pattern-import/types';

import { litOutline } from './borrowed-edges';

// The sizes step lights a size row's own lines. An edge drawn once for every size sits in another
// row, and two ends may stop short of each other: `litOutline` closes the row's outline over them.

type Pl = number[];
const poly = (...p: [number, number][]) => Float32Array.from(p.flat());

/** One size row; `rank` goes in its nesting-order evidence like the reader's rows. */
const row = (id: number, rank: number, chains: number[], role: LineClass['role'] = 'size') =>
  ({
    id,
    role,
    sizeLabel: String(rank),
    chains,
    totalLengthMm: 0,
    evidence: [{ kind: 'nesting-order', rank }],
    confidence: 1,
  }) as unknown as LineClass;

/**
 * A U drawn by the row itself — top, then right side — and the left and bottom edges drawn once,
 * in the common row, with the lines of three other sizes stopping on them (as every hem stops on
 * the centre-front line).
 */
function scene() {
  const preview: Float32Array[] = [];
  const add = (a: Float32Array) => preview.push(a) - 1;
  const own = [add(poly([0, 100], [80, 100], [80, 0]))];
  const left = add(poly([0, 100], [0, 0]));
  const bottom = add(poly([0, 0], [80, 0]));
  const classes: LineClass[] = [row(0, 0, own), row(9, 5, [left, bottom], 'common')];
  for (let k = 1; k <= 3; k++) {
    const h = add(poly([50, 100 - 10 * k], [0.3, 100 - 10 * k]));
    const v = add(poly([70 - 10 * k, 100], [70 - 10 * k, 0.3]));
    classes.push(row(k, k, [h, v]));
  }
  return { preview, classes };
}

describe('litOutline', () => {
  it('closes a row over the edges drawn once, as one line', () => {
    const { preview, classes } = scene();
    const out = litOutline({ classes }, preview, classes[0]);
    expect(out.open).toHaveLength(0);
    expect(out.lines).toHaveLength(1);
    const w = out.lines[0];
    const ends = [
      [w[0], w[1]],
      [w[w.length - 2], w[w.length - 1]],
    ].sort((p, q) => p[0] - q[0]);
    // the last 1–2 mm beside an own line are not repeated: it is drawn there already
    expect(Math.hypot(ends[0][0] - 0, ends[0][1] - 100)).toBeLessThan(2);
    expect(Math.hypot(ends[1][0] - 80, ends[1][1] - 0)).toBeLessThan(2);
  });

  it('bridges two ends that stop 3 mm short of each other at a corner', () => {
    const preview = [poly([0, 0], [0, 50]), poly([3, 50], [60, 50])];
    const classes = [row(0, 0, [0, 1])];
    const out = litOutline({ classes }, preview, classes[0]);
    expect(out.bridges).toHaveLength(1);
    expect(out.lines).toHaveLength(0);
  });

  it('leaves an end alone when nothing shared is near it', () => {
    const preview = [poly([0, 0], [0, 50], [60, 50])];
    const classes = [row(0, 0, [0])];
    const out = litOutline({ classes }, preview, classes[0]);
    expect(out.lines).toHaveLength(0);
    expect(out.open).toHaveLength(2);
  });

  it('draws nothing for a row of another role', () => {
    const { preview, classes } = scene();
    const out = litOutline({ classes }, preview, classes[1]);
    expect(out).toEqual({ lines: [] as Pl[], bridges: [], open: [] });
  });
});
