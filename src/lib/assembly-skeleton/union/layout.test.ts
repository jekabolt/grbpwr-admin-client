import { describe, expect, it } from 'vitest';

import type { Affine, Edge, PieceGeom, Pt2, SeamCandidate } from '../types';
import { apply, IDENTITY } from './affine';
import { orderSideAlongOutline, runOf, unionLayout } from './layout';

/** A piece from its ring (CCW) and the ring indexes its corners sit at; edge k runs corner k → k+1. */
function piece(key: string, ring: Pt2[], corners: number[]): PieceGeom {
  const n = ring.length;
  const edges: Edge[] = corners.map((s, k) => {
    const e = corners[(k + 1) % corners.length];
    const pts: Pt2[] = [];
    for (let j = s; ; j = (j + 1) % n) {
      pts.push(ring[j]);
      if (j === e) break;
    }
    let len = 0;
    for (let j = 1; j < pts.length; j++)
      len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    return {
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s,
      e,
      pts,
      lenMm: len,
      chordMm: Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]),
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    } as Edge;
  });
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return {
    pieceKey: key,
    name: key,
    hand: 'none',
    cloth: null,
    rs: ring,
    corners,
    notchIdx: [],
    edges,
    rect: false,
    areaMm2: Math.abs(area) / 2,
    perimMm: edges.reduce((s, e) => s + e.lenMm, 0),
    twinOf: [],
  } as unknown as PieceGeom;
}

const seam = (a: string, b: string): SeamCandidate =>
  ({ a, b, score: 1, kind: 'edge', evidence: {} }) as unknown as SeamCandidate;

describe('runOf', () => {
  const side = (pts: Pt2[]) => ({ key: 'X', pts, len: 100 });
  const at = (): Affine => IDENTITY;
  // A U: left side down, bottom across, right side up — open at the top.
  const left = side([
    [0, 100],
    [0, 0],
  ]);
  const bottom = side([
    [0, 0],
    [100, 0],
  ]);
  const right = side([
    [100, 0],
    [100, 100],
  ]);

  it('parts listed from the opening run end to end, the chord across the opening', () => {
    const run = runOf([left, bottom, right], at)!;
    expect(run[0]).toEqual([0, 100]);
    expect(run[run.length - 1]).toEqual([100, 100]);
  });

  it('parts listed from a corner of a side that closes on itself run from its widest break', () => {
    // From the bottom: bottom → right → left would end a step from where it began.
    const run = runOf([bottom, right, left], at)!;
    expect(run[0]).toEqual([0, 100]);
    expect(run[run.length - 1]).toEqual([100, 100]);
  });

  it('null until every part is on the table', () => {
    expect(runOf([left, bottom], () => undefined)).toBeNull();
  });
});

describe('unionLayout push-off', () => {
  // A back whose yoke seam bows up 15 mm against a yoke whose edge is straight: laid edge to
  // edge they share a lens.
  const back = piece(
    'BACK',
    [
      [0, 0],
      [200, 0],
      [200, 300],
      [150, 312],
      [100, 315],
      [50, 312],
      [0, 300],
    ],
    [0, 1, 2, 6],
  );
  const yoke = piece(
    'YOKE',
    [
      [0, 0],
      [200, 0],
      [200, 60],
      [0, 60],
    ],
    [0, 1, 2, 3],
  );
  const geoms = new Map([
    [back.pieceKey, back],
    [yoke.pieceKey, yoke],
  ]);
  const yokeSeam = seam('BACK#2', 'YOKE#0');
  const topOf = (L: ReturnType<typeof unionLayout>, key: string) =>
    Math.max(
      ...geoms
        .get(key)!
        .rs.map((p) => apply(L.placements.find((q) => q.pieceKey === key)!.T, p)[1]),
    );
  const bottomOf = (L: ReturnType<typeof unionLayout>, key: string) =>
    Math.min(
      ...geoms
        .get(key)!
        .rs.map((p) => apply(L.placements.find((q) => q.pieceKey === key)!.T, p)[1]),
    );

  it('without it the yoke on the lens is refused and stands apart', () => {
    const L = unionLayout(['BACK', 'YOKE'], [yokeSeam], geoms, { overlapMax: 0.01, rasterMm: 2 });
    expect(L.overflow).toEqual(['YOKE']);
  });

  it('with it the yoke goes off the seam until clear, a hair above the back', () => {
    const L = unionLayout(['BACK', 'YOKE'], [yokeSeam], geoms, {
      overlapMax: 0.01,
      rasterMm: 2,
      pushOffMax: 0.24,
    });
    expect(L.overflow).toEqual([]);
    const y = L.placements.find((p) => p.pieceKey === 'YOKE')!;
    expect(y.attachedVia).toBe('BACK#2');
    expect(L.overlap).toBeLessThanOrEqual(0.01);
    const gap = bottomOf(L, 'YOKE') - topOf(L, 'BACK');
    expect(gap).toBeGreaterThan(-16);
    expect(gap).toBeLessThan(40);
  });

  it('a piece it cannot clear within the bound still stands apart', () => {
    const L = unionLayout(['BACK', 'YOKE'], [yokeSeam], geoms, {
      overlapMax: 0.01,
      rasterMm: 2,
      pushOffMax: 0.02,
    });
    expect(L.overflow).toEqual(['YOKE']);
  });
});

describe('identical layers', () => {
  // A collar layer: an uneven quad, so only the straight copy covers its twin.
  const ring: Pt2[] = [
    [0, 0],
    [120, 0],
    [200, 60],
    [10, 90],
  ];
  const geoms = new Map([
    ['A', piece('A', ring, [0, 1, 2, 3])],
    ['B', piece('B', ring, [0, 1, 2, 3])],
  ]);

  it('orderSideAlongOutline: a side clicked out of order runs along the outline', () => {
    expect(orderSideAlongOutline(['B#0', 'B#3', 'B#1'], geoms)).toEqual(['B#3', 'B#0', 'B#1']);
    expect(orderSideAlongOutline(['B#2', 'B#0'], geoms)).toEqual(['B#2', 'B#0']);
    expect(orderSideAlongOutline(['A#0', 'B#1'], geoms)).toEqual(['A#0', 'B#1']);
  });

  it('a layer sewn to its twin by a side clicked out of order goes straight on it', () => {
    const row = {
      ...seam('A#0', 'B#0'),
      aParts: ['A#3', 'A#0', 'A#1'],
      bParts: ['B#0', 'B#3', 'B#1'],
      evidence: { twin: 'identical' },
    } as unknown as SeamCandidate;
    const L = unionLayout(['A', 'B'], [row], geoms, { rasterMm: 2 });
    const T = (k: string) => L.placements.find((p) => p.pieceKey === k)!.T;
    for (const p of ring) {
      const a = apply(T('A'), p);
      const b = apply(T('B'), p);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1);
    }
  });
});
