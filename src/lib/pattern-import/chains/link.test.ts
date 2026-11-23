import { afterEach, describe, expect, it } from 'vitest';

import type { ChainOpts, IRPath, PtMm, Sheet, Style } from '../types';
import { linkItems } from './link';

// A size line drawn as separate dashes with a gap wider than the tracker's 3 mm stays a heap of
// fragments. Pass 2b joins a REGULAR train of such dashes, and only when `dashTrains` is on.

const OPTS: ChainOpts = { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 };
const solid = (id = 0): Style => ({
  id,
  strokeRgb: [32, 29, 30],
  widthMm: 0.98,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
});

let op = 0;
const dash = (a: PtMm, b: PtMm, style = 0): IRPath => ({
  id: op,
  pts: [a, b],
  closed: false,
  style,
  src: { file: '0', page: 0, op: op++, sub: 0 },
});

/** Dashes of `len` mm starting at the given x positions, on the row y. */
const row = (xs: number[], y = 0, len = 6.1, style = 0) =>
  xs.map((x) => dash({ x, y }, { x: x + len, y }, style));

const every = (n: number, step: number, from = 0) =>
  Array.from({ length: n }, (_, i) => from + i * step);

function alive(paths: IRPath[], dashTrains: boolean, styles: Style[] = [solid()]) {
  const sheet = { paths, styles, poses: [], texts: [], rasters: [] } as unknown as Sheet;
  return linkItems(sheet, { ...OPTS, dashTrains }).chains.filter((c) => !c.dead);
}

describe('pass 2b: trains of dashes', () => {
  it('leaves dashes 7.8 mm apart alone by default', () => {
    expect(alive(row(every(8, 13.9)), false)).toHaveLength(8);
  });

  it('joins eight regular dashes into one line when asked', () => {
    const chains = alive(row(every(8, 13.9)), true);
    expect(chains).toHaveLength(1);
    expect(chains[0].items).toHaveLength(8);
  });

  it('does not join two dashes: a train has at least three', () => {
    expect(alive(row(every(2, 13.9)), true)).toHaveLength(2);
  });

  it('does not join dashes whose step is irregular', () => {
    const xs = [0, 13.9, 40, 53.9, 80, 93.9];
    expect(alive(row(xs), true).length).toBeGreaterThan(1);
  });

  it('cuts a path at a change of step and joins each stretch', () => {
    // five dashes 7.8 mm apart, then a jump of 30 mm, then five more
    const xs = [...every(5, 13.9), ...every(5, 13.9, 100)];
    expect(alive(row(xs), true)).toHaveLength(2);
  });

  it('keeps two parallel rows 1 mm apart as two lines', () => {
    const paths = [...row(every(6, 13.9), 0), ...row(every(6, 13.9), 1)];
    const chains = alive(paths, true);
    expect(chains).toHaveLength(2);
    expect(chains.every((c) => c.items.length === 6)).toBe(true);
  });

  it('leaves a pen that declares its dash to the tracker', () => {
    const declared: Style = { ...solid(1), dash: [6.1, 7.8] };
    expect(alive(row(every(8, 13.9), 0, 6.1, 1), true, [declared])).toHaveLength(8);
  });
});

describe('pen split before a chain is mixed', () => {
  /** Strokes of one operation, in order, `gap` mm between dashes. */
  const operation = (lengths: number[], gap: number, op: number, x0 = 0) => {
    let x = x0;
    let sub = 0;
    return lengths.map((len) => {
      const p: IRPath = {
        id: sub,
        pts: [
          { x, y: 0 },
          { x: x + len, y: 0 },
        ],
        closed: false,
        style: 0,
        src: { file: '0', page: 0, op, sub: sub++ },
      };
      x += len + gap;
      return p;
    });
  };
  const linked = (paths: IRPath[]) =>
    linkItems({ paths, styles: [solid()], poses: [], texts: [], rasters: [] } as unknown as Sheet, {
      ...OPTS,
    }).chains.filter((c) => !c.dead);

  afterEach(() => {
    delete process.env.SPLIT_PEN_OFF;
  });

  it('cuts one operation where a settled dash changes length', () => {
    const chains = linked(operation([6, 6, 6, 6, 10, 10, 10, 10], 4, 1));
    expect(chains).toHaveLength(2);
    expect(chains.map((c) => c.items.length).sort()).toEqual([4, 4]);
  });

  it('keeps a dash-dot period as one chain', () => {
    const period = [6, 1.8, 1.2, 6, 1.8, 1.2, 6, 1.8, 1.2];
    expect(linked(operation(period, 2, 1))).toHaveLength(1);
  });

  it('joins the same pen across a 2 mm seam and refuses a different pen there', () => {
    const same = linked([...operation([6, 6, 6, 6], 4, 1), ...operation([6, 6, 6, 6], 4, 2, 38)]);
    expect(same).toHaveLength(1);
    const other = linked([
      ...operation([6, 6, 6, 6], 4, 3),
      ...operation([10, 10, 10, 10], 4, 4, 38),
    ]);
    expect(other).toHaveLength(2);
  });

  it('joins the length change when SPLIT_PEN_OFF=1', () => {
    process.env.SPLIT_PEN_OFF = '1';
    expect(linked(operation([6, 6, 6, 6, 10, 10, 10, 10], 4, 1))).toHaveLength(1);
  });
});

describe('pass 3: strokes as a band (dashTrains)', () => {
  /** A zigzag line: strokes alternately leaning one way and the other, 2.3 mm apart along x. */
  const zigzag = (n: number, y0 = 0) =>
    Array.from({ length: n }, (_, i) => {
      const x = i * 2.3;
      const lean = i % 2 ? -1 : 1;
      return dash({ x, y: y0 + 1.5 * lean }, { x: x + 2, y: y0 - 1.5 * lean });
    });

  const lines = (paths: IRPath[], dashTrains: boolean) =>
    alive(paths, dashTrains).filter((c) => c.items.length >= 8);

  it('leaves a zigzag of separate strokes in pieces by default', () => {
    expect(lines(zigzag(40), false)).toHaveLength(0);
  });

  it('takes a zigzag of 40 strokes as one line when asked', () => {
    const found = lines(zigzag(40), true);
    expect(found).toHaveLength(1);
    expect(found[0].items.length).toBeGreaterThanOrEqual(36);
  });

  it('never joins two zigzags 3 mm apart into one line that hops between them', () => {
    const found = lines([...zigzag(40, 0), ...zigzag(40, 3)], true);
    for (const c of found) {
      const ys = c.items.map((l) => l.it.c?.y ?? 0);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
    }
  });
});
