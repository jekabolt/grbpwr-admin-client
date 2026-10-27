import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';

import {
  boxOf,
  candidateOf,
  fitBox,
  inputName,
  labelSpot,
  partnerOf,
  seamOfSides,
  seamSig,
  splitSeams,
  spreadLabels,
  stepLayout,
  surfaceSeam,
  toPx,
} from './step-picture';

// A w × h rectangle, CCW from the origin: edge 0 bottom, 1 right, 2 top, 3 left.
function rect(key: string, w: number, h: number): PieceGeom {
  const c: Pt2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const edges: Edge[] = c.map((p, k) => {
    const q = c[(k + 1) % 4];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return {
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s: k,
      e: k + 1,
      pts: [p, q],
      lenMm: len,
      chordMm: len,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    } as Edge;
  });
  return {
    pieceKey: key,
    name: key,
    hand: 'none',
    cloth: null,
    rs: c,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: true,
    areaMm2: w * h,
    perimMm: 2 * (w + h),
    twinOf: [],
  } as unknown as PieceGeom;
}

const geomsOf = (...g: PieceGeom[]) => new Map(g.map((x) => [x.pieceKey, x]));
const world = (g: PieceGeom, T: Parameters<typeof apply>[0]) => g.rs.map((p) => apply(T, p));

describe('fitBox', () => {
  it('fills the tighter axis and centres the other, y flipped', () => {
    const f = fitBox({ x0: 0, y0: 0, x1: 200, y1: 100 }, 440, 440, 20);
    expect(f.s).toBeCloseTo(2);
    // top-left of the picture (x0, y1) → (pad, pad + (400 − 200)/2)
    expect(toPx(f, [0, 100])).toEqual([20, 120]);
    expect(toPx(f, [200, 0])).toEqual([420, 320]);
  });

  it('a tall picture fills the height', () => {
    const f = fitBox({ x0: -50, y0: -300, x1: 50, y1: 300 }, 800, 620, 10);
    expect(f.s).toBeCloseTo(1);
    const [l, t] = toPx(f, [-50, 300]);
    const [r, b] = toPx(f, [50, -300]);
    expect(t).toBeCloseTo(10);
    expect(b).toBeCloseTo(610);
    expect((l + r) / 2).toBeCloseTo(400);
  });

  it('survives a degenerate box', () => {
    const f = fitBox({ x0: 5, y0: 5, x1: 5, y1: 5 }, 100, 100, 10);
    expect(Number.isFinite(f.s)).toBe(true);
  });
});

describe('candidateOf', () => {
  const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300));
  it('takes the longest side of each run', () => {
    expect(candidateOf({ a: ['A#0', 'A#1'], b: ['B#3'] }, geoms)).toMatchObject({
      a: 'A#1',
      b: 'B#3',
      kind: 'edge',
    });
  });
  it('no seam within one piece or on an unknown edge', () => {
    expect(candidateOf({ a: ['A#1'], b: ['A#3'] }, geoms)).toBeNull();
    expect(candidateOf({ a: ['A#1'], b: ['X#3'] }, geoms)).toBeNull();
  });
});

describe('splitSeams', () => {
  it('inner = inside one input, cross = between inputs, the rest dropped', () => {
    const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300), rect('C', 100, 300));
    const seam = (a: string, b: string) => candidateOf({ a: [a], b: [b] }, geoms)!;
    const { inner, cross } = splitSeams(
      [seam('A#1', 'B#3'), seam('B#1', 'C#3'), { ...seam('A#0', 'C#0'), kind: 'closure-not-seam' }],
      [['A', 'B'], ['C']],
      geoms,
    );
    expect(inner.map((s) => s.a)).toEqual(['A#1']);
    expect(cross.map((s) => s.a)).toEqual(['B#1']);
  });
});

describe('stepLayout', () => {
  const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300), rect('C', 80, 200));
  const inner = candidateOf({ a: ['A#1'], b: ['B#3'] }, geoms)!;
  const cross = candidateOf({ a: ['B#1'], b: ['C#3'] }, geoms)!;

  it('keeps a unit whole: its pieces laid along their inner seam', () => {
    const L = stepLayout([['A', 'B'], ['C']], [inner, cross], geoms);
    const a = boxOf(world(geoms.get('A')!, L.T.get('A')!));
    const b = boxOf(world(geoms.get('B')!, L.T.get('B')!));
    // B stands right against A's right edge.
    expect(Math.min(Math.abs(a.x1 - b.x0), Math.abs(b.x1 - a.x0))).toBeLessThan(1);
    expect(L.input.get('A')).toBe(0);
    expect(L.input.get('C')).toBe(1);
  });

  it('explode pulls the inputs apart, the units stay whole', () => {
    const joined = stepLayout([['A', 'B'], ['C']], [inner, cross], geoms);
    const apart = stepLayout([['A', 'B'], ['C']], [inner, cross], geoms, { explode: 0.1 });
    const gapOf = (L: typeof joined) => {
      const b = boxOf(world(geoms.get('B')!, L.T.get('B')!));
      const c = boxOf(world(geoms.get('C')!, L.T.get('C')!));
      return Math.max(c.x0 - b.x1, b.x0 - c.x1);
    };
    expect(gapOf(joined)).toBeLessThan(1);
    expect(gapOf(apart)).toBeGreaterThan(10);
    const a = boxOf(world(geoms.get('A')!, apart.T.get('A')!));
    const b = boxOf(world(geoms.get('B')!, apart.T.get('B')!));
    expect(Math.min(Math.abs(a.x1 - b.x0), Math.abs(b.x1 - a.x0))).toBeLessThan(1);
  });

  it('draws every piece, also with no seam at all', () => {
    const L = stepLayout([['A'], ['C']], [], geoms);
    expect([...L.T.keys()].sort()).toEqual(['A', 'C']);
    const a = boxOf(world(geoms.get('A')!, L.T.get('A')!));
    const c = boxOf(world(geoms.get('C')!, L.T.get('C')!));
    const overlapX = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
    const overlapY = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
    expect(overlapX <= 0 || overlapY <= 0).toBe(true);
  });

  it('no pieces → an empty picture', () => {
    expect(stepLayout([[]], [], geoms).T.size).toBe(0);
  });

  it('a unit with no seam inside is not drawn joined: its pieces stand apart', () => {
    const L = stepLayout([['A', 'B'], ['C']], [cross], geoms);
    const a = boxOf(world(geoms.get('A')!, L.T.get('A')!));
    const b = boxOf(world(geoms.get('B')!, L.T.get('B')!));
    const gap = Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
    expect(gap).toBeGreaterThan(10);
    // C still goes against B along the step's seam.
    const c = boxOf(world(geoms.get('C')!, L.T.get('C')!));
    expect(Math.min(Math.abs(c.x0 - b.x1), Math.abs(b.x0 - c.x1))).toBeLessThan(1);
  });

  it('another input never stands in a unit’s gap', () => {
    const L = stepLayout([['A', 'B'], ['C']], [], geoms);
    const box = (k: string) => boxOf(world(geoms.get(k)!, L.T.get(k)!));
    const ab = boxOf([
      ...world(geoms.get('A')!, L.T.get('A')!),
      ...world(geoms.get('B')!, L.T.get('B')!),
    ]);
    const c = box('C');
    const overlapX = Math.min(ab.x1, c.x1) - Math.max(ab.x0, c.x0);
    const overlapY = Math.min(ab.y1, c.y1) - Math.max(ab.y0, c.y0);
    expect(overlapX <= 0 || overlapY <= 0).toBe(true);
  });

  it('a piece with no shape is an empty square beside its input', () => {
    const L = stepLayout([['A', 'X'], ['C']], [], geoms);
    expect(L.T.has('X')).toBe(false);
    expect(L.input.get('X')).toBe(0);
    expect(L.ghosts.map((g) => [g.key, g.input])).toEqual([['X', 0]]);
    const g = boxOf(L.ghosts[0].ring);
    const a = boxOf(world(geoms.get('A')!, L.T.get('A')!));
    expect(g.x0).toBeGreaterThan(a.x1);
    expect(g.x1 - g.x0).toBeGreaterThan(10);
    // The picture holds it.
    expect(L.bbox.x1).toBeGreaterThanOrEqual(g.x1);
  });
});

describe('surfaceSeam', () => {
  const geoms = geomsOf(rect('H', 400, 600), rect('P', 100, 100));
  const partBox = (c: NonNullable<ReturnType<typeof surfaceSeam>>) =>
    boxOf(world(geoms.get('P')!, c.surface!.T));

  it('lays the part by its hand placement (corner from the host’s, drawing frame y down)', () => {
    const c = surfaceSeam('H', 'P', [], geoms, { xMm: 50, yMm: 60, rotDeg: 0, flip: false })!;
    expect(c.kind).toBe('surface');
    const b = partBox(c);
    expect(b.x0).toBeCloseTo(50);
    expect(b.x1).toBeCloseTo(150);
    // 60 mm down from the host's top (y 600) → the part's top at 540.
    expect(b.y1).toBeCloseTo(540);
    expect(b.y0).toBeCloseTo(440);
  });

  it('with no placement it sits centred on the host’s line', () => {
    const c = surfaceSeam(
      'H',
      'P',
      [
        [100, 300],
        [300, 300],
      ],
      geoms,
    )!;
    const b = partBox(c);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(200);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(300);
  });

  it('a surface seam between two inputs lays the part on its host', () => {
    const c = surfaceSeam('H', 'P', [], geoms, { xMm: 50, yMm: 60, rotDeg: 0, flip: false })!;
    const L = stepLayout([['H'], ['P']], [c], geoms);
    const h = boxOf(world(geoms.get('H')!, L.T.get('H')!));
    const p = boxOf(world(geoms.get('P')!, L.T.get('P')!));
    expect(p.x0 - h.x0).toBeCloseTo(50);
    expect(h.y1 - p.y1).toBeCloseTo(60);
  });

  it('seamOfSides: an inner line makes it a surface seam, edges a plain one', () => {
    const lines = new Map([['H', [[[0, 0] as Pt2, [10, 0] as Pt2]]]]);
    expect(seamOfSides({ a: ['H:i0'], b: ['P#0'] }, geoms, lines)?.kind).toBe('surface');
    expect(seamOfSides({ a: ['H#1'], b: ['P#3'] }, geoms, lines)?.kind).toBe('edge');
    expect(seamOfSides({ a: ['H:i0'], b: [] }, geoms, lines)).toBeNull();
  });
});

describe('seamSig', () => {
  const geoms = geomsOf(rect('H', 400, 600), rect('P', 100, 100));
  it('moves with what the placer reads, not with the words', () => {
    const at = { xMm: 50, yMm: 60, rotDeg: 0, flip: false };
    const c = surfaceSeam('H', 'P', [], geoms, at)!;
    const moved = surfaceSeam('H', 'P', [], geoms, { ...at, xMm: 70 })!;
    expect(seamSig([c])).not.toBe(seamSig([moved]));
    const e = candidateOf({ a: ['H#1'], b: ['P#3'] }, geoms)!;
    expect(seamSig([e])).not.toBe(seamSig([{ ...e, aParts: ['H#1', 'H#2'] }]));
    expect(seamSig([e])).not.toBe(seamSig([{ ...e, range: { a: [0, 10], b: [0, 10] } }]));
    expect(seamSig([e])).toBe(seamSig([{ ...e, evidence: { ...e.evidence, dLenMm: 3 } }]));
  });
});

describe('partnerOf', () => {
  const delta = (a: number, b: number) => Math.abs(a - b);
  const c = [
    { id: 'B#0', lenMm: 100 },
    { id: 'B#1', lenMm: 296 },
    { id: 'B#2', lenMm: 310 },
    { id: 'B#3', lenMm: 20 },
  ];
  it('the nearest length within 10 %', () => {
    expect(partnerOf(300, c, delta)).toBe('B#1');
  });
  it('nothing near → none', () => {
    expect(partnerOf(200, c, delta)).toBeNull();
    expect(partnerOf(21, c, delta)).toBeNull();
  });
});

describe('labelSpot', () => {
  it('sits off the edge, away from the piece', () => {
    const s = labelSpot(
      [
        [100, 0],
        [100, 200],
      ],
      [50, 100],
      16,
    );
    expect(s.at).toEqual([116, 100]);
    expect(s.anchor).toBe('start');
  });
});

describe('inputName', () => {
  const ops = [
    { outputUnitKey: 'BODY', outputUnitName: 'body' },
    { outputUnitKey: 'ARM', outputUnitName: '' },
    {},
  ];
  const isPiece = (k: string) => k === 'FP';
  const pieceName = (k: string) => (k === 'FP' ? 'front' : k);
  it('a piece by its name, a unit by the step that named it', () => {
    expect(inputName('FP', 2, ops, isPiece, pieceName)).toBe('front');
    expect(inputName('BODY', 2, ops, isPiece, pieceName)).toBe('body');
  });
  it('an unnamed unit reads its key, never empty', () => {
    expect(inputName('ARM', 2, ops, isPiece, pieceName).length).toBeGreaterThan(0);
  });
});

describe('spreadLabels', () => {
  it('two labels on one spot: the second slides along its edge until clear', () => {
    const l = { at: [100, 100] as Pt2, anchor: 'start' as const, t: [0, 1] as Pt2, w: 50, h: 14 };
    const [a, b] = spreadLabels([l, l]);
    expect(a).toEqual([100, 100]);
    expect(Math.abs(b[1] - 100)).toBeGreaterThanOrEqual(14);
    expect(b[0]).toBe(100);
  });
  it('labels apart stay where they are', () => {
    const l = { anchor: 'middle' as const, t: [1, 0] as Pt2, w: 40, h: 14 };
    expect(
      spreadLabels([
        { ...l, at: [0, 0] },
        { ...l, at: [0, 100] },
      ]),
    ).toEqual([
      [0, 0],
      [0, 100],
    ]);
  });
});
