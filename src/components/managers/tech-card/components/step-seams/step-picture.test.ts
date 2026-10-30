import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import {
  pairOverlap,
  pieceKeyOf,
  pieceTilt,
  rasterize,
  resolveEdge,
} from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';

import {
  CARD77_OPS,
  CARD77_PIECE_KEYS,
  card77Geoms,
  card77Graph,
  card77InnerLines,
  card77Step,
} from './card77.fixture';
import {
  CARD83_OPS,
  CARD83_PIECE_KEYS,
  card83Geoms,
  card83Graph,
  card83InnerLines,
} from './card83.fixture';
import {
  CARD63_OPS,
  CARD63_PIECE_KEYS,
  card63Geoms,
  card63Graph,
  card63InnerLines,
  card63Step,
} from './card63.fixture';
import {
  CARD58_OPS,
  CARD58_PIECE_KEYS,
  card58Geoms,
  card58Graph,
  card58InnerLines,
  card58Step,
} from './card58.fixture';
import {
  boxOf,
  candidateOf,
  confidentSeam,
  earlierInner,
  fitBox,
  focusPieces,
  inputName,
  insideRing,
  labelSpot,
  midAlong,
  partnerOf,
  seamOfSides,
  seamSig,
  splitSeams,
  spotInside,
  spreadLabels,
  stepLayout,
  surfaceSeam,
  tiltOf,
  toPx,
  UPRIGHT,
  type StepLayout,
} from './step-picture';
import type { HandOn } from './step-hand';
import { frameSeamsOf, innerSeamsOf, splitLaid } from './step-picture-view';
import {
  inputGroups,
  pieceOfTarget,
  sewnBeforeStep,
  suggestStepPair,
  suggestStepPairs,
  usedEdgesBeforeStep,
} from './step-seams-model';

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

  const gapAB = (L: StepLayout) => {
    const a = boxOf(world(geoms.get('A')!, L.T.get('A')!));
    const b = boxOf(world(geoms.get('B')!, L.T.get('B')!));
    return Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  };

  it('an inner seam the solver finds ambiguous does not shape the unit: its pieces stand apart', () => {
    const unsure = { ...inner, assignment: { margin: 0, confidence: 'ambiguous' as const } };
    expect(gapAB(stepLayout([['A', 'B']], [unsure], geoms))).toBeGreaterThan(10);
    const likelyRun = { ...inner, kind: 'partial' as const, score: 0.6 };
    expect(gapAB(stepLayout([['A', 'B']], [likelyRun], geoms))).toBeGreaterThan(10);
  });

  it('a stored inner seam shapes the unit whatever the engine thinks of it', () => {
    const stored = {
      ...inner,
      score: 0.3,
      assignment: { margin: 0, confidence: 'ambiguous' as const },
      provenance: {
        seamKey: 's1',
        status: 'confirmed' as const,
        source: 'manual' as const,
        direction: 'same' as const,
        by: 'x',
        at: 'now',
        how: 'hint' as const,
      },
    };
    expect(gapAB(stepLayout([['A', 'B']], [stored], geoms))).toBeLessThan(1);
  });

  it('a cross seam never folds an input over: its top stays up, or it stands beside', () => {
    // A's top edge to C's top edge would hang C upside down on A. (A true rectangle turned half
    // round is the same shape, so C is read as any other piece here.)
    const g = new Map(geoms);
    g.set('C', { ...geoms.get('C')!, rect: false });
    const fold = candidateOf({ a: ['A#2'], b: ['C#2'] }, g)!;
    const boxes = (L: StepLayout) => ({
      a: boxOf(world(g.get('A')!, L.T.get('A')!)),
      c: boxOf(world(g.get('C')!, L.T.get('C')!)),
    });
    // Exploded (the canvas), C stands beside A.
    const E = stepLayout([['A'], ['C']], [fold], g, { explode: 0.08 });
    expect(tiltOf(E.T.get('C')!)).toBeLessThanOrEqual(UPRIGHT);
    expect(E.layers).toEqual([]);
    const { a, c } = boxes(E);
    const overlapX = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
    const overlapY = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
    expect(overlapX <= 0 || overlapY <= 0).toBe(true);
    // Joined (the result), C hangs from A's top inside A, its top still up: A's layer, as a pocket
    // bag lies on the front it is sewn to — not folded over it.
    const L = stepLayout([['A'], ['C']], [fold], g);
    expect(tiltOf(L.T.get('C')!)).toBeLessThanOrEqual(UPRIGHT);
    expect(L.layers).toEqual([[1, 0]]);
    const on = boxes(L);
    expect(on.c.x0).toBeGreaterThanOrEqual(on.a.x0 - 0.5);
    expect(on.c.x1).toBeLessThanOrEqual(on.a.x1 + 0.5);
    expect(on.c.y0).toBeGreaterThanOrEqual(on.a.y0 - 0.5);
    expect(on.c.y1).toBeLessThanOrEqual(on.a.y1 + 0.5);
    expect(on.c.y1).toBeCloseTo(on.a.y1, 0);
  });
});

describe('confidentSeam', () => {
  const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300));
  const edge = candidateOf({ a: ['A#1'], b: ['B#3'] }, geoms)!;
  const prov = {
    seamKey: 's',
    status: 'confirmed' as const,
    source: 'graph' as const,
    direction: 'same' as const,
    by: 'x',
    at: 'now',
    how: 'hint' as const,
  };
  it('stored, or sure, or a clean high edge reading', () => {
    expect(confidentSeam(edge)).toBe(true);
    expect(confidentSeam({ ...edge, score: 0.5, provenance: prov })).toBe(true);
    expect(
      confidentSeam({
        ...edge,
        kind: 'composite',
        score: 0.5,
        assignment: { margin: 3, confidence: 'sure' },
      }),
    ).toBe(true);
  });
  it('not an unsure, rivalled, partial or composite reading, never a closure', () => {
    expect(confidentSeam({ ...edge, assignment: { margin: 0, confidence: 'ambiguous' } })).toBe(
      false,
    );
    expect(confidentSeam({ ...edge, kind: 'composite' })).toBe(false);
    expect(confidentSeam({ ...edge, kind: 'partial' })).toBe(false);
    expect(confidentSeam({ ...edge, score: 0.8 })).toBe(false);
    expect(confidentSeam({ ...edge, ambiguousWith: [edge] })).toBe(false);
    expect(confidentSeam({ ...edge, kind: 'closure-not-seam', provenance: prov })).toBe(false);
  });
});

/**
 * Card 83, the owner's shirt, every join step: the picture the picker draws (canvas, exploded) and
 * the joined result, read the way the eye reads them — by rasters of the laid outlines.
 */
describe('stepLayout on card 58', () => {
  const geoms = card58Geoms();
  const graph = card58Graph();
  const innerLines = card58InnerLines();
  const ops = CARD58_OPS;
  const pieceKeys = CARD58_PIECE_KEYS;
  const at = card58Step;
  const identical = (ka: string, kb: string) =>
    !!geoms.get(ka)?.twinOf.some((t) => t.key === kb && t.kind === 'identical');
  const det = (T: readonly number[]) => T[0] * T[3] - T[1] * T[2];
  const ring = (L: StepLayout, k: string) => world(geoms.get(k)!, L.T.get(k)!);
  const overlapOf = (a: Pt2[], b: Pt2[]) => pairOverlap(rasterize(a, 2), rasterize(b, 2));
  /** How far apart a seam's two edges lie in a layout (their middles), mm. */
  const gapOf = (L: StepLayout, c: SeamCandidate) => {
    const mid = (id: string) => {
      const T = L.T.get(pieceKeyOf(id))!;
      return midAlong(resolveEdge(id, geoms)!.pts.map((p) => apply(T, p))).p;
    };
    const a = mid(c.a);
    const b = mid(c.b);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  const lenOf = (c: SeamCandidate) => resolveEdge(c.a, geoms)!.len;
  /** The step as the app frames it: every proposal (or the first alone), its own seams laid. */
  const stepOf = (op: number, every = true) => {
    const i = at(op);
    const leaves = inputGroups(ops, i, pieceKeys).map((g) => g.pieces);
    const raw = splitSeams(graph.chosen, leaves, geoms);
    const used = usedEdgesBeforeStep(ops, i, new Map());
    const proposals = suggestStepPairs(ops, i, pieceKeys, geoms, used, null, new Map());
    const own = (every ? proposals : proposals.slice(0, 1))
      .map((p) => seamOfSides(p, geoms, innerLines))
      .filter((c): c is SeamCandidate => !!c);
    const sewn = sewnBeforeStep(ops, i, pieceKeys, geoms, new Map());
    const inner = [...raw.inner, ...earlierInner(sewn, leaves, geoms, innerLines, raw.inner)];
    return {
      leaves,
      proposals,
      own,
      canvas: stepLayout(leaves, frameSeamsOf(inner, [], own, raw.cross), geoms, { explode: 0.08 }),
      result: stepLayout(leaves, [...inner, ...own], geoms),
    };
  };

  for (const op of [10, 30])
    it(`op ${op}: two layers cut alike open out over their seam — mirror images, never on each other`, () => {
      const s = stepOf(op);
      expect(s.leaves.map((l) => l.length)).toEqual([1, 1]);
      const [ka] = s.leaves[0];
      const [kb] = s.leaves[1];
      expect(identical(ka, kb)).toBe(true);
      expect(s.own).toHaveLength(1);
      for (const L of [s.canvas, s.result]) {
        expect(L.T.has(ka) && L.T.has(kb)).toBe(true);
        expect(overlapOf(ring(L, ka), ring(L, kb))).toBeLessThanOrEqual(0.01);
        expect(det(L.T.get(ka)!) * det(L.T.get(kb)!)).toBeLessThan(0);
        expect(L.stacked).toEqual([]);
      }
      // Sewn edge to edge: the seam's edges meet in the result, a sliver apart at most.
      expect(gapOf(s.result, s.own[0])).toBeLessThan(0.25 * lenOf(s.own[0]));
    });

  /** The least distance between two rings, mm (0 when they touch or cross). */
  const ringGap = (a: Pt2[], b: Pt2[]) => {
    const toSeg = (q: Pt2, p0: Pt2, p1: Pt2) => {
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((q[0] - p0[0]) * dx + (q[1] - p0[1]) * dy) / l2));
      return Math.hypot(q[0] - p0[0] - k * dx, q[1] - p0[1] - k * dy);
    };
    let d = Infinity;
    for (const [P, Q] of [
      [a, b],
      [b, a],
    ])
      for (const q of P)
        for (let i = 0; i < Q.length; i++) d = Math.min(d, toSeg(q, Q[i], Q[(i + 1) % Q.length]));
    return d;
  };
  /** Inputs drawn touching (a sewn pair meets along its seam), as components. */
  const touching = (L: StepLayout, leaves: readonly (readonly string[])[], tol = 10) => {
    const comp = leaves.map((_, i) => i);
    const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
    for (let p = 0; p < leaves.length; p++)
      for (let q = p + 1; q < leaves.length; q++)
        for (const ka of leaves[p])
          for (const kb of leaves[q])
            if (ringGap(ring(L, ka), ring(L, kb)) <= tol) comp[find(p)] = find(q);
    return new Set(leaves.map((_, i) => find(i))).size;
  };

  it('op 60: the stand, its facing and the collar hang together on their three proposals; the first alone leaves the collar apart', () => {
    const s = stepOf(60);
    expect(s.leaves).toHaveLength(3);
    expect(s.proposals.length).toBeGreaterThanOrEqual(2);
    // Nothing on anything else; the twins opened out over their seam, mirror images.
    const rings = s.leaves.map((ks) => ks.map((k) => ring(s.result, k)));
    for (let p = 0; p < rings.length; p++)
      for (let q = p + 1; q < rings.length; q++)
        for (const a of rings[p])
          for (const b of rings[q]) expect(overlapOf(a, b)).toBeLessThanOrEqual(0.01);
    const twin = s.own.find((c) => identical(pieceKeyOf(c.a), pieceKeyOf(c.b)))!;
    expect(twin).toBeDefined();
    expect(gapOf(s.result, twin)).toBeLessThan(0.25 * lenOf(twin));
    expect(
      det(s.result.T.get(pieceKeyOf(twin.a))!) * det(s.result.T.get(pieceKeyOf(twin.b))!),
    ).toBeLessThan(0);
    expect(s.result.stacked.some((st) => st.includes(pieceKeyOf(twin.a)))).toBe(false);
    // One whole: every input meets another along a seam (a deep collar curve meets a flat stand
    // edge at its ends, so the seam's middles may part — the pieces still touch).
    expect(touching(s.result, s.leaves)).toBe(1);
    // The first proposal alone (the twins) leaves the collar standing apart.
    const first = stepOf(60, false);
    expect(first.own).toHaveLength(1);
    expect(touching(first.result, first.leaves)).toBe(2);
  });
});

describe('stepLayout on card 83', () => {
  const geoms = card83Geoms();
  const graph = card83Graph();
  const innerLines = card83InnerLines();
  const ops = CARD83_OPS;
  const pieceKeys = CARD83_PIECE_KEYS;
  const steps = ops.map((op, i) => {
    const leaves = inputGroups(ops, i, pieceKeys).map((g) => g.pieces);
    const raw = splitSeams(graph.chosen, leaves, geoms);
    const used = usedEdgesBeforeStep(ops, i, new Map());
    const suggestion = suggestStepPair(ops, i, pieceKeys, geoms, used, null, new Map());
    const own = suggestion ? [seamOfSides(suggestion, geoms, innerLines)!].filter(Boolean) : [];
    // Inside each input: the engine's sure seams, and what the steps before sewed there.
    const sewn = sewnBeforeStep(ops, i, pieceKeys, geoms, new Map());
    const inner = [...raw.inner, ...earlierInner(sewn, leaves, geoms, innerLines, raw.inner)];
    const frame = [...inner, ...(own.length ? own : raw.cross)];
    return {
      op: op.operationNumber,
      index: i,
      leaves,
      inner,
      canvas: stepLayout(leaves, frame, geoms, { explode: 0.08 }),
      result: stepLayout(leaves, [...inner, ...own], geoms),
    };
  });
  const ringsOf = (L: StepLayout, leaves: readonly (readonly string[])[], i: number): Pt2[][] => [
    ...leaves[i].filter((k) => L.T.has(k)).map((k) => world(geoms.get(k)!, L.T.get(k)!)),
    ...L.ghosts.filter((g) => g.input === i).map((g) => g.ring),
  ];
  const overlapOf = (A: Pt2[][], B: Pt2[][]) => {
    let o = 0;
    for (const a of A)
      for (const b of B) o = Math.max(o, pairOverlap(rasterize(a, 2), rasterize(b, 2)));
    return o;
  };
  const identical = (ka: string, kb: string) =>
    !!geoms.get(ka)?.twinOf.some((t) => t.key === kb && t.kind === 'identical');
  const followersOf = (L: StepLayout) => new Set(L.stacked.flatMap((s) => s.slice(1)));
  // A layer under its twin leans as the twin does; a piece set into a run points away from it.
  const freeOf = (L: StepLayout) => new Set([...followersOf(L), ...L.onRuns]);
  const det = (T: readonly number[]) => T[0] * T[3] - T[1] * T[2];
  // A layer opened out over its identical twin (two single-piece inputs) is the twin's mirror
  // image: turned over on purpose.
  const openedOf = (L: StepLayout, leaves: readonly (readonly string[])[]) => {
    const singles = leaves.filter((ks) => ks.length === 1).map((ks) => ks[0]);
    return new Set(
      singles.filter(
        (k) =>
          L.T.has(k) && det(L.T.get(k)!) < 0 && singles.some((o) => o !== k && identical(k, o)),
      ),
    );
  };

  for (const s of steps) {
    it(`op ${s.op}: the canvas never lays two inputs on each other`, () => {
      const rings = s.leaves.map((_, i) => ringsOf(s.canvas, s.leaves, i));
      for (let p = 0; p < rings.length; p++)
        for (let q = p + 1; q < rings.length; q++) expect(overlapOf(rings[p], rings[q])).toBe(0);
    });

    it(`op ${s.op}: the result joins the sides, else stands apart; identical twins open out over their seam, never on each other`, () => {
      const rings = s.leaves.map((_, i) => ringsOf(s.result, s.leaves, i));
      for (let p = 0; p < rings.length; p++)
        for (let q = p + 1; q < rings.length; q++) {
          expect(overlapOf(rings[p], rings[q])).toBeLessThanOrEqual(0.01);
          const twins =
            s.leaves[p].length === 1 &&
            s.leaves[q].length === 1 &&
            identical(s.leaves[p][0], s.leaves[q][0]);
          // One is the other's mirror image, a book opened at the seam.
          if (twins)
            expect(
              det(s.result.T.get(s.leaves[p][0])!) * det(s.result.T.get(s.leaves[q][0])!),
            ).toBeLessThan(0);
        }
    });

    it(`op ${s.op}: every piece stands its own way up, on the canvas and in the result`, () => {
      for (const L of [s.canvas, s.result]) {
        const free = freeOf(L);
        const opened = openedOf(L, s.leaves);
        for (const [k, T] of L.T)
          if (!free.has(k) && !opened.has(k))
            expect(pieceTilt(geoms.get(k)!, T)).toBeLessThanOrEqual(UPRIGHT);
      }
    });

    it(`op ${s.op}: inside an input nothing overlaps but a layer under its identical twin`, () => {
      for (const L of [s.canvas, s.result]) {
        const followers = followersOf(L);
        for (const ks of s.leaves) {
          const drawn = ks.filter((k) => L.T.has(k) && !followers.has(k));
          for (let p = 0; p < drawn.length; p++)
            for (let q = p + 1; q < drawn.length; q++) {
              const a = world(geoms.get(drawn[p])!, L.T.get(drawn[p])!);
              const b = world(geoms.get(drawn[q])!, L.T.get(drawn[q])!);
              expect(overlapOf([a], [b])).toBeLessThanOrEqual(0.01);
            }
        }
      }
    });

    it(`op ${s.op}: each input's name has a spot inside its biggest piece`, () => {
      for (const L of [s.canvas, s.result])
        for (const ks of s.leaves) {
          const rings = ks.filter((k) => L.T.has(k)).map((k) => world(geoms.get(k)!, L.T.get(k)!));
          const biggest = rings.reduce((m, r) => {
            const a = (b: Pt2[]) => {
              const x = boxOf(b);
              return (x.x1 - x.x0) * (x.y1 - x.y0);
            };
            return a(r) > a(m) ? r : m;
          });
          expect(insideRing(spotInside(biggest), biggest)).toBe(true);
        }
    });
  }

  it('op 370: the left sleeve is set into the armhole run, away from the body; the rest keeps its way up', () => {
    const s = steps.find((x) => x.op === 370)!;
    for (const L of [s.canvas, s.result]) {
      expect(L.onRuns).toContain('SLV_L');
      expect(L.onRuns).not.toContain('BP');
      const free = freeOf(L);
      for (const [k, T] of L.T)
        if (!free.has(k)) expect(pieceTilt(geoms.get(k)!, T)).toBeLessThan(0.03);
    }
    // Its cuff stays on the sleeve's hem, on the far side from the body.
    const box = (k: string) => boxOf(world(geoms.get(k)!, s.result.T.get(k)!));
    const body = box('BP');
    const slv = box('SLV_L');
    const cuff = box('SLV_M_L');
    const far = (b: ReturnType<typeof box>) =>
      Math.hypot(
        (b.x0 + b.x1) / 2 - (body.x0 + body.x1) / 2,
        (b.y0 + b.y1) / 2 - (body.y0 + body.y1) / 2,
      );
    expect(far(cuff)).toBeGreaterThan(far(slv));
  });

  it('op 400: both sleeves hang off the body’s armhole runs, their cuffs beyond them', () => {
    const s = steps.find((x) => x.op === 400)!;
    for (const L of [s.canvas, s.result]) {
      expect(L.onRuns).toEqual(expect.arrayContaining(['SLV_L', 'SLV_R']));
      const box = (k: string) => boxOf(world(geoms.get(k)!, L.T.get(k)!));
      const body = box('BP');
      const far = (k: string) => {
        const b = box(k);
        return Math.hypot(
          (b.x0 + b.x1) / 2 - (body.x0 + body.x1) / 2,
          (b.y0 + b.y1) / 2 - (body.y0 + body.y1) / 2,
        );
      };
      expect(far('SLV_M_L')).toBeGreaterThan(far('SLV_L'));
      expect(far('SLV_M_R')).toBeGreaterThan(far('SLV_R'));
    }
  });

  it('op 200: the result lays the fronts against the back along the proposals, the placket on its front edge', () => {
    const s = steps.find((x) => x.op === 200)!;
    const boxIn = (L: StepLayout, k: string) => boxOf(world(geoms.get(k)!, L.T.get(k)!));
    const sideBySide = (L: StepLayout, a: string, b: string) => {
      const A = boxIn(L, a);
      const B = boxIn(L, b);
      return Math.min(Math.abs(A.x0 - B.x1), Math.abs(B.x0 - A.x1));
    };
    // The step proposes one side seam per side, the left first: the picture takes the first, so
    // the left front touches the back's side.
    expect(sideBySide(s.result, 'FL', 'BP')).toBeLessThan(12);
    // Both proposals sewn: each front on its own side of the back.
    const used = usedEdgesBeforeStep(ops, s.index, new Map());
    const sides = suggestStepPairs(ops, s.index, pieceKeys, geoms, used, null, new Map());
    expect(sides.map((p) => p.hand)).toEqual(['L', 'R']);
    const own = sides.map((p) => seamOfSides(p, geoms, innerLines)!).filter(Boolean);
    const both = stepLayout(s.leaves, [...s.inner, ...own], geoms);
    expect(sideBySide(both, 'FL', 'BP')).toBeLessThan(12);
    expect(sideBySide(both, 'FR', 'BP')).toBeLessThan(12);
    // Step 130 sewed the placket to the left front's centre edge (the engine reads the same pair,
    // unsure): it stands against that edge, upright, never on the front.
    const box = (k: string) => boxIn(s.result, k);
    const fl = box('FL');
    const pl = box('PLCK');
    expect(sideBySide(s.result, 'FL', 'PLCK')).toBeLessThan(12);
    expect(pl.y0).toBeGreaterThan(fl.y0 - 12);
    expect(pl.y1).toBeLessThan(fl.y1 + 12);
    expect(pieceTilt(geoms.get('PLCK')!, s.result.T.get('PLCK')!)).toBeLessThan(0.03);
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
  it('sits off the edge, inside its own piece — two laid sides never share the gap', () => {
    const s = labelSpot(
      [
        [100, 0],
        [100, 200],
      ],
      [50, 100],
      16,
    );
    expect(s.at).toEqual([84, 100]);
    expect(s.anchor).toBe('end');
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

describe('focusPieces', () => {
  const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300), rect('C', 100, 300));
  const sure = (a: string, b: string) => ({ ...candidateOf({ a: [a], b: [b] }, geoms)!, score: 1 });
  const seamPieces = new Set(['A', 'C']);

  it('adds the piece a sewn seam runs through between the seam’s pieces', () => {
    const inner = [sure('A#1', 'B#3'), sure('B#1', 'C#3')];
    expect(focusPieces(['A', 'B', 'C'], seamPieces, inner)).toEqual(['A', 'B', 'C']);
  });

  it('a piece of the seam no sewn seam reaches is kept; a loose piece is not', () => {
    expect(focusPieces(['A', 'B', 'C'], seamPieces, [])).toEqual(['A', 'C']);
    const unsure = { ...sure('A#1', 'B#3'), score: 0.5 };
    expect(focusPieces(['A', 'B', 'C'], seamPieces, [unsure, sure('B#1', 'C#3')])).toEqual([
      'A',
      'C',
    ]);
  });

  it('one piece of the seam needs no bridge', () => {
    expect(focusPieces(['A', 'B'], new Set(['A']), [sure('A#1', 'B#3')])).toEqual(['A']);
  });

  it('a part placed on a host keeps its host, and the host its part (card 6 op 260, op 770)', () => {
    const onHost = {
      ...sure('A#1', 'C#3'),
      kind: 'surface',
      surface: { host: 'B', part: 'C' },
    } as unknown as SeamCandidate;
    // The placket carries the seam; the sleeve it sits on stays drawn.
    expect(focusPieces(['B', 'C'], new Set(['C']), [onHost])).toEqual(['B', 'C']);
    // Two seam pieces bridged by a sewn seam keep the part placed on one of them.
    const inner = [sure('A#1', 'B#3'), onHost];
    expect(focusPieces(['A', 'B', 'C'], new Set(['A', 'B']), inner)).toEqual(['A', 'B', 'C']);
  });
});

describe('stepLayout apart', () => {
  const geoms = geomsOf(rect('A', 100, 300), rect('B', 100, 300), rect('C', 80, 200));
  const inner = candidateOf({ a: ['A#1'], b: ['B#3'] }, geoms)!;

  it('a piece no seam joins to the input’s main body stands beside it and is reported apart', () => {
    const L = stepLayout([['A', 'B', 'C']], [inner], geoms);
    expect(L.apart).toEqual(['C']);
    expect(L.T.has('C')).toBe(true);
  });

  it('nothing is apart when every piece is joined, or when the input is one piece', () => {
    expect(stepLayout([['A', 'B']], [inner], geoms).apart).toEqual([]);
    expect(stepLayout([['C']], [], geoms).apart).toEqual([]);
  });

  it('a run across a piece standing apart hangs along the pieces drawn joined (card 57 op 80, 70 op 50)', () => {
    // A yoke no seam lays upright stands beside the body; the sleeve's armhole run crosses it.
    const g = geomsOf(
      rect('A', 100, 300),
      rect('B', 100, 300),
      rect('Y', 120, 60),
      rect('S', 150, 200),
    );
    const run: SeamCandidate = { ...candidateOf({ a: ['S#0'], b: ['A#2', 'B#2', 'Y#0'] }, g)! };
    for (const leaves of [
      [['A', 'B', 'Y'], ['S']],
      [['A', 'B'], ['S']],
    ]) {
      const L = stepLayout(leaves, [inner, run], g);
      expect(L.clusters).toHaveLength(1);
      expect(L.onRuns).toContain('S');
      const body = boxOf([
        ...world(g.get('A')!, L.T.get('A')!),
        ...world(g.get('B')!, L.T.get('B')!),
      ]);
      const s = boxOf(world(g.get('S')!, L.T.get('S')!));
      // Above the body's top, over its width.
      expect(s.y0).toBeGreaterThanOrEqual(body.y1 - 1);
      expect((s.x0 + s.x1) / 2).toBeGreaterThan(body.x0);
      expect((s.x0 + s.x1) / 2).toBeLessThan(body.x1);
    }
  });
});

describe('stepLayout on card 77: a pocket bag lies on the piece it is sewn to (as card 59 op 380)', () => {
  const geoms = card77Geoms();
  const graph = card77Graph();
  const innerLines = card77InnerLines();
  const ops = CARD77_OPS;
  const pieceKeys = CARD77_PIECE_KEYS;
  // The picker's result and canvas for the step's one proposal.
  const stepOf = (op: number) => {
    const index = card77Step(op);
    const leaves = inputGroups(ops, index, pieceKeys).map((g) => g.pieces);
    const byKey = new Map();
    const used = new Set(usedEdgesBeforeStep(ops, index, byKey));
    const [sug] = suggestStepPairs(ops, index, pieceKeys, geoms, used, null, byKey);
    const split = splitLaid(graph.chosen, leaves, geoms, innerLines, byKey);
    const inner = innerSeamsOf(split, ops, index, pieceKeys, leaves, geoms, innerLines, byKey);
    const own = seamOfSides(sug, geoms, innerLines)!;
    const seamPieces = new Set([...sug.a, ...sug.b].map(pieceOfTarget));
    const focused = leaves.map((l) => focusPieces(l, seamPieces, inner)).filter((l) => l.length);
    const result = stepLayout(focused, [...inner, own], geoms);
    const canvas = stepLayout(focused, [...inner, own], geoms, { explode: 0.08 });
    const inputOf = (k: string) => focused.findIndex((l) => l.includes(k));
    const box = (k: string) => boxOf(world(geoms.get(k)!, result.T.get(k)!));
    const markOf = (k: string) =>
      boxOf(innerLines.get(k)![0].map((p) => apply(result.T.get(k)!, p)));
    return { result, canvas, inputOf, box, markOf };
  };
  const det = (T: readonly number[]) => T[0] * T[3] - T[1] * T[2];
  const within = (b: ReturnType<typeof boxOf>, of: ReturnType<typeof boxOf>) =>
    b.x0 >= of.x0 - 1 && b.x1 <= of.x1 + 1 && b.y0 >= of.y0 - 1 && b.y1 <= of.y1 + 1;

  it('op 420: the bag lies on the front upright, on the front’s pocket mark, its layer', () => {
    const s = stepOf(420);
    expect(s.result.layers).toEqual([[s.inputOf('PCK_R_BTTM'), s.inputOf('P_R_MAIN')]]);
    const T = s.result.T.get('PCK_R_BTTM')!;
    expect(tiltOf(T)).toBeLessThan(0.01);
    expect(det(T)).toBeGreaterThan(0);
    const bag = s.box('PCK_R_BTTM');
    expect(within(bag, s.box('P_R_MAIN'))).toBe(true);
    // Seam edge on the waist, the rest of its outline on the dashed mark the front carries for it.
    const mark = s.markOf('P_R_MAIN');
    expect(bag.x0).toBeCloseTo(mark.x0, 0);
    expect(bag.x1).toBeCloseTo(mark.x1, 0);
    expect(bag.y0).toBeCloseTo(mark.y0, 0);
    expect(bag.y1).toBeCloseTo(s.box('P_R_MAIN').y1, 0);
  });

  it('op 450: the two halves of the bag sewn round their edge are drawn one on the other', () => {
    const s = stepOf(450);
    expect(s.result.layers).toEqual([[s.inputOf('PCK_L_BTTM'), s.inputOf('PCK_L_MAIN')]]);
    const T = s.result.T.get('PCK_L_BTTM')!;
    expect(tiltOf(T)).toBeLessThan(0.01);
    expect(det(T)).toBeGreaterThan(0);
    const half = s.box('PCK_L_BTTM');
    const main = s.box('PCK_L_MAIN');
    expect(within(half, main)).toBe(true);
    // Its round edge on the other half's bottom, its top on the line the other half carries.
    expect(half.y0).toBeCloseTo(main.y0, 0);
    expect(half.y1).toBeCloseTo(s.markOf('PCK_L_MAIN').y1, 0);
  });

  it('the exploded canvas stands every piece beside: no layer there', () => {
    for (const op of [420, 450]) expect(stepOf(op).canvas.layers).toEqual([]);
  });
});

describe('stepLayout on card 77 op 1020: the sleeves into the armholes of a yoked body', () => {
  const geoms = card77Geoms();
  const graph = card77Graph();
  const innerLines = card77InnerLines();
  const ops = CARD77_OPS;
  const pieceKeys = CARD77_PIECE_KEYS;
  const index = card77Step(1020);
  const leaves = inputGroups(ops, index, pieceKeys).map((g) => g.pieces);
  const byKey = new Map();
  const used = new Set(usedEdgesBeforeStep(ops, index, byKey));
  const proposals = suggestStepPairs(ops, index, pieceKeys, geoms, used, null, byKey);
  const split = splitLaid(graph.chosen, leaves, geoms, innerLines, byKey);
  const inner = innerSeamsOf(split, ops, index, pieceKeys, leaves, geoms, innerLines, byKey);
  const cross = split.cross.filter((c) => c.kind !== 'surface');
  // What the picker draws for each proposal: the pieces carrying the seam, joined by what the
  // steps before sewed; the canvas framed by the proposal shown, the result sewn along it.
  const views = proposals.map((sug) => {
    const own = seamOfSides(sug, geoms, innerLines)!;
    const seamPieces = new Set([...sug.a, ...sug.b].map(pieceOfTarget));
    const focused = leaves
      .map((l) => focusPieces(l, seamPieces, inner))
      .filter((l) => l.length > 0);
    return {
      hand: sug.hand,
      sleeve: pieceOfTarget(sug.a[0]),
      focused,
      canvas: stepLayout(focused, frameSeamsOf(inner, [], [own], cross), geoms, { explode: 0.08 }),
      result: stepLayout(focused, [...inner, own], geoms),
    };
  });
  const box = (L: StepLayout, k: string) => boxOf(world(geoms.get(k)!, L.T.get(k)!));
  const mid = (b: ReturnType<typeof box>) => (b.x0 + b.x1) / 2;
  const overlapOf = (A: Pt2[][], B: Pt2[][]) => {
    let o = 0;
    for (const a of A)
      for (const b of B) o = Math.max(o, pairOverlap(rasterize(a, 2), rasterize(b, 2)));
    return o;
  };

  it('one proposal per side: the sleeve cap against the body’s four-edge armhole', () => {
    expect(views.map((v) => v.hand)).toEqual(['L', 'R']);
    expect(views.map((v) => v.sleeve)).toEqual(['SLV_L', 'SLV_R']);
    for (const v of views) {
      expect(v.focused.map((l) => l.length)).toEqual([1, 5]);
      expect(v.focused[1]).toEqual(expect.arrayContaining(['BP_U', 'BP_U_1', 'BP_MAIN']));
    }
  });

  it('the body’s part is laid joined: the yoke on the back, its second layer on it', () => {
    for (const v of views)
      for (const L of [v.canvas, v.result]) {
        expect(L.apart).toEqual([]);
        expect(L.stacked).toEqual([['BP_U', 'BP_U_1']]);
        const yoke = box(L, 'BP_U');
        const back = box(L, 'BP_MAIN');
        expect(yoke.y0).toBeGreaterThan(back.y1 - 1);
        expect(yoke.y0 - back.y1).toBeLessThan(20);
      }
  });

  it('the sleeve is set into the armhole run and, sewn, clears the body', () => {
    for (const v of views) {
      expect(v.canvas.onRuns).toEqual([v.sleeve]);
      expect(v.result.onRuns).toEqual([v.sleeve]);
      const body = v.focused[1].map((k) => world(geoms.get(k)!, v.result.T.get(k)!));
      const sleeve = [world(geoms.get(v.sleeve)!, v.result.T.get(v.sleeve)!)];
      expect(overlapOf(sleeve, body)).toBeLessThanOrEqual(0.01);
    }
  });

  it('each side’s sleeve hangs on its own side of the body', () => {
    const [l, r] = views;
    expect(mid(box(l.result, 'SLV_L'))).toBeLessThan(mid(box(l.result, 'BP_MAIN')));
    expect(mid(box(r.result, 'SLV_R'))).toBeGreaterThan(mid(box(r.result, 'BP_MAIN')));
  });
});

describe('stepLayout on card 63: a hand placement beats the guess (the back pocket bags)', () => {
  const geoms = card63Geoms();
  const graph = card63Graph();
  const innerLines = card63InnerLines();
  const ops = CARD63_OPS;
  const pieceKeys = CARD63_PIECE_KEYS;
  // The picker's RESULT for the step's first proposal: the pieces on the seam (`whole`: every
  // piece of the inputs, as a later step's unit shows them).
  const stepOf = (op: number, opts: Parameters<typeof stepLayout>[3] = {}, whole = false) => {
    const index = card63Step(op);
    const leaves = inputGroups(ops, index, pieceKeys).map((g) => g.pieces);
    const byKey = new Map();
    const used = new Set(usedEdgesBeforeStep(ops, index, byKey));
    const [sug] = suggestStepPairs(ops, index, pieceKeys, geoms, used, null, byKey);
    const split = splitLaid(graph.chosen, leaves, geoms, innerLines, byKey);
    const inner = innerSeamsOf(split, ops, index, pieceKeys, leaves, geoms, innerLines, byKey);
    const own = seamOfSides(sug, geoms, innerLines)!;
    const seamPieces = new Set([...sug.a, ...sug.b].map(pieceOfTarget));
    const focused = whole
      ? leaves
      : leaves.map((l) => focusPieces(l, seamPieces, inner)).filter((l) => l.length);
    const result = stepLayout(focused, [...inner, own], geoms, { explode: 0, ...opts });
    const inputOf = (k: string) => focused.findIndex((l) => l.includes(k));
    const box = (k: string) => boxOf(world(geoms.get(k)!, result.T.get(k)!));
    // The laid piece's seam run against its partner's, both drawn: the larger end gap, mm.
    const gap = (k: string) => {
      const h = result.hand.get(k)!;
      const a = [h.target.partRun[0], h.target.partRun.at(-1)!].map((p) =>
        apply(result.T.get(k)!, p),
      );
      const b = [h.target.partnerRun[0], h.target.partnerRun.at(-1)!].map((p) =>
        apply(result.T.get(h.target.partner)!, p),
      );
      const d = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      return Math.min(
        Math.max(d(a[0], b[0]), d(a[1], b[1])),
        Math.max(d(a[0], b[1]), d(a[1], b[0])),
      );
    };
    return { result, inputOf, box, gap };
  };
  const det = (T: readonly number[]) => T[0] * T[3] - T[1] * T[2];
  const within = (b: ReturnType<typeof boxOf>, of: ReturnType<typeof boxOf>) =>
    b.x0 >= of.x0 - 1 && b.x1 <= of.x1 + 1 && b.y0 >= of.y0 - 1 && b.y1 <= of.y1 + 1;
  const bagIn: HandOn = { inside: true, rotDeg: 0, flip: false, slideMm: 0, partner: 'Back_L' };
  const leftHand = new Map([['PCK_BACK_1L', bagIn]]);

  it('no hand: the layout as before, an empty placement map changes nothing', () => {
    const round = (b: ReturnType<typeof boxOf>) =>
      [b.x0, b.x1, b.y0, b.y1].map((v) => Math.round(v * 10) / 10);
    // Boxes of the pieces as drawn before hand placement existed (mm, 0.1).
    const before: [number, boolean, Record<string, number[]>][] = [
      [100, false, { PCK_BACK_1L: [-8.3, 241.4, 1010, 1189.9], Back_L: [0, 396, 0, 1026.6] }],
      [70, false, { PCK_BACK_1R: [154.5, 404.2, 1010, 1189.9], Back_R: [0, 396, 0, 1026.6] }],
      [160, true, { PCK_BACK_1L: [-9.5, 240.1, 1021.7, 1201.6], Back_L: [0, 396, 0, 1026.6] }],
      [130, true, { PCK_BACK_1R: [155.8, 405.5, 1021.7, 1201.6], Back_R: [0, 396, 0, 1026.6] }],
    ];
    for (const [op, whole, boxes] of before) {
      const s = stepOf(op, {}, whole);
      for (const [k, b] of Object.entries(boxes)) expect(round(s.box(k))).toEqual(b);
      expect(s.result.layers).toEqual([]);
      expect(s.result.hand.size).toBe(0);
      const empty = stepOf(op, { hand: new Map(), twinHand: new Map() }, whole).result;
      expect([...empty.T]).toEqual([...s.result.T]);
      expect(empty.layers).toEqual(s.result.layers);
      expect(empty.apart).toEqual(s.result.apart);
    }
  });

  it('op 100: the bag placed inside lies in the back, upright, a layer under the back', () => {
    const none = stepOf(100);
    const s = stepOf(100, { hand: leftHand });
    expect(s.result.layers).toEqual([[s.inputOf('PCK_BACK_1L'), s.inputOf('Back_L')]]);
    expect(s.result.hand.get('PCK_BACK_1L')).toMatchObject({ place: bagIn, twin: false });
    expect(within(s.box('PCK_BACK_1L'), s.box('Back_L'))).toBe(true);
    // Hangs from the back's top edge (it stood above it), its seam on the back's seam.
    expect(s.box('PCK_BACK_1L').y1).toBeCloseTo(s.box('Back_L').y1, 0);
    expect(none.box('PCK_BACK_1L').y1).toBeGreaterThan(s.box('Back_L').y1 + 100);
    expect(s.gap('PCK_BACK_1L')).toBeLessThan(0.5);
    // Upright: the turn it had standing above (the top edge's slope), not turned over or mirrored.
    const T = s.result.T.get('PCK_BACK_1L')!;
    expect(det(T)).toBeGreaterThan(0);
    expect(T[3]).toBeGreaterThan(0);
    expect(tiltOf(T)).toBeCloseTo(tiltOf(none.result.T.get('PCK_BACK_1L')!), 3);
    // The back stays where it was.
    expect([...s.result.T.get('Back_L')!]).toEqual([...none.result.T.get('Back_L')!]);
  });

  it('opened out (not inside): placed on the seam, not a layer', () => {
    const s = stepOf(100, { hand: new Map([['PCK_BACK_1L', { ...bagIn, inside: false }]]) });
    expect(s.result.layers).toEqual([]);
    expect(s.gap('PCK_BACK_1L')).toBeLessThan(0.5);
    expect(s.box('PCK_BACK_1L').y0).toBeGreaterThan(s.box('Back_L').y1 - 30);
  });

  it('turn and flip keep the bag’s seam on the back’s seam (Δ≈0)', () => {
    for (const inside of [false, true])
      for (const flip of [false, true])
        for (const rotDeg of [0, 90, 180, 270]) {
          const place = { inside, flip, rotDeg, slideMm: 0, partner: 'Back_L' };
          const s = stepOf(100, { hand: new Map([['PCK_BACK_1L', place]]) });
          expect(s.gap('PCK_BACK_1L')).toBeLessThan(0.5);
          expect(s.result.layers.length).toBe(inside ? 1 : 0);
        }
  });

  it('op 70: the right bag draws the left bag’s placement, mirrored, when it has none', () => {
    const left = stepOf(100, { hand: leftHand });
    const s = stepOf(70, { hand: new Map(), twinHand: leftHand });
    expect(s.result.layers).toEqual([[s.inputOf('PCK_BACK_1R'), s.inputOf('Back_R')]]);
    expect(s.result.hand.get('PCK_BACK_1R')).toMatchObject({
      place: { inside: true, rotDeg: 0, flip: false, partner: 'Back_R' },
      twin: true,
    });
    expect(s.gap('PCK_BACK_1R')).toBeLessThan(0.5);
    // The left bag's box in the left back, reflected across the back.
    const [bl, kl, br, kr] = [
      left.box('PCK_BACK_1L'),
      left.box('Back_L'),
      s.box('PCK_BACK_1R'),
      s.box('Back_R'),
    ];
    expect(br.x0 - kr.x0).toBeCloseTo(kl.x1 - bl.x1, 0);
    expect(kr.x1 - br.x1).toBeCloseTo(bl.x0 - kl.x0, 0);
    expect(br.y0).toBeCloseTo(bl.y0, 0);
    expect(br.y1).toBeCloseTo(bl.y1, 0);
    // Its own placement wins over the twin's.
    const own = new Map([['PCK_BACK_1R', { ...bagIn, inside: false, partner: 'Back_R' }]]);
    const mine = stepOf(70, { hand: own, twinHand: leftHand });
    expect(mine.result.layers).toEqual([]);
    expect(mine.result.hand.get('PCK_BACK_1R')?.twin).toBe(false);
  });

  it('a later step draws the stored placement the same way (op 160 left, op 130 right)', () => {
    const left = stepOf(160, { hand: leftHand }, true);
    expect(left.result.pieceLayers).toEqual([['PCK_BACK_1L', 'Back_L']]);
    expect(within(left.box('PCK_BACK_1L'), left.box('Back_L'))).toBe(true);
    expect(left.gap('PCK_BACK_1L')).toBeLessThan(0.5);
    const right = stepOf(130, { hand: new Map(), twinHand: leftHand }, true);
    expect(right.result.pieceLayers).toEqual([['PCK_BACK_1R', 'Back_R']]);
    expect(right.result.hand.get('PCK_BACK_1R')?.twin).toBe(true);
    expect(within(right.box('PCK_BACK_1R'), right.box('Back_R'))).toBe(true);
  });
});
