import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  Pt2,
  SeamCandidate,
  SeamEvidence,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';
import { frameOf } from 'lib/seams/frame';

import { foldCreases, foldPanel, solveDoll } from './doll';
import { foldedOutline, foldPlies } from './fold-outline';
import { type MeshCrease, meshPiece, pointInPolygon, type PieceMesh } from './mesh';
import type { DollFold, DollFoldReport, DollOptions, DollReport, UV } from './types';

const evidence: SeamEvidence = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  // not `identical`: an identical twin sewn to its twin is read as a ply of it, not a panel
  twin: 'none',
  self: false,
  aLenMm: 200,
  bLenMm: 200,
};

function rectangle(key: string, name: string, index: number, w = 10, h = 20): SkeletonPieceInput {
  const poly = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const piece: PieceDTO = {
    id: index,
    name,
    blockName: key,
    source: 'fold-test',
    poly,
    bboxW: w,
    bboxH: h,
    areaCm2: w * h,
  };
  return {
    pieceKey: key,
    name,
    piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  };
}

/**
 * Body-sized: front and back (500 × 700 mm) sewn along one long edge, a placket strip (40 × 700 mm)
 * sewn to the front's other long edge by one of its own — its free half is what turns under. The
 * sizes are real so the doll wraps a real girth, not a toy one.
 */
function fixture(sewPlacket = true, apart = false) {
  const facts: SkeletonFacts = {
    pieces: [
      rectangle('F', 'front', 1, 50, 70),
      rectangle('P', 'PLCK_L', 2, 4, 70),
      // `apart`: the back is the bigger piece (the chart's root) with a yoke sewn on top of it, and
      // no seam reaches the front — the front and its placket float together, as one lot.
      rectangle('B', 'back', 3, apart ? 52 : 50, 70),
      ...(apart ? [rectangle('Y', 'back yoke', 4, 52, 20)] : []),
    ],
    category: 'shirt',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
  const read = readSeamGraph(facts);
  const seam = (a: string, b: string, len: number): SeamCandidate => ({
    a,
    b,
    score: 1,
    kind: 'edge',
    evidence: { ...evidence, aLenMm: len, bLenMm: len },
  });
  // Edges of a rectangle poly: 0 bottom, 1 right, 2 top, 3 left.
  const owners = [
    ...(sewPlacket ? [seam('F#1', 'P#3', 700)] : []),
    apart ? seam('B#2', 'Y#0', 520) : seam('B#1', 'F#3', 700),
  ];
  const graph: SeamGraph = {
    ...read,
    chosen: owners,
    rejected: [],
    components: apart
      ? [
          ['F', 'P'],
          ['B', 'Y'],
        ]
      : [['F', 'P', 'B']],
  };
  const rows = owners.map((owner, i) => {
    const row = seamFromCandidate(owner, graph.pieces, {
      seamKey: `owner-row-${i}`,
      status: 'confirmed',
      source: 'manual',
      anchoredSize: 'M',
    });
    if (!row) throw new Error('fixture row did not resolve');
    return { row, owner };
  });
  const options: DollOptions = {
    targetVertices: 1500,
    maxPasses: 80,
    settlePasses: 0,
    proposeComposite: false,
    seams: {
      mode: 'owner',
      rows: rows.map((r) => r.row),
      size: 'M',
      candidates: rows.map((r) => ({ seamKey: r.row.seamKey, candidate: r.owner, inStep: true })),
    },
  };
  return { facts, graph, options };
}

// The strip's long middle line in its seam frame (the strip is taller than wide: u across); the
// half at `flipU` turns — by default the free one (the sewn edge is at u = 0).
const middle = (kind: DollFold['kind'] = 'inward', flipU = 0.75): DollFold => ({
  seq: 1,
  a: [0.5, 0],
  b: [0.5, 1],
  flipAt: [flipU, 0.5],
  kind,
});

const withoutTimes = (report: DollReport): DollReport => ({
  ...report,
  stats: { ...report.stats, ms: 0, msMesh: 0, msSolve: 0 },
});

describe('meshPiece creases', () => {
  const rs: [number, number][] = [];
  const W = 40;
  const H = 200;
  const step = 5;
  for (let x = 0; x < W; x += step) rs.push([x, 0]);
  for (let y = 0; y < H; y += step) rs.push([W, y]);
  for (let x = W; x > 0; x -= step) rs.push([x, H]);
  for (let y = H; y > 0; y -= step) rs.push([0, y]);
  const corners = [0, W / step, W / step + H / step, 2 * (W / step) + H / step];

  it('creases a line into the triangulation: consecutive crease vertices are edges, no straddler', () => {
    const s = rs.findIndex((p) => p[0] === W / 2 && p[1] === 0);
    const e = rs.findIndex((p) => p[0] === W / 2 && p[1] === H);
    const mesh = meshPiece(rs, corners, 8, [{ s, e }]);
    const crease = mesh.creases?.[0] ?? [];
    expect(crease.length).toBeGreaterThan(2);
    for (const v of crease) expect(mesh.pts[v][0]).toBeCloseTo(W / 2, 6);
    const edges = new Set<string>();
    for (let t = 0; t < mesh.tris.length; t += 3) {
      const [a, b, c] = [mesh.tris[t], mesh.tris[t + 1], mesh.tris[t + 2]];
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ])
        edges.add(p < q ? `${p}-${q}` : `${q}-${p}`);
    }
    for (let i = 0; i + 1 < crease.length; i++) {
      const [p, q] = [crease[i], crease[i + 1]];
      expect(edges.has(p < q ? `${p}-${q}` : `${q}-${p}`)).toBe(true);
    }
    // No triangle has vertices strictly on both sides of the line.
    for (let t = 0; t < mesh.tris.length; t += 3) {
      let left = 0;
      let right = 0;
      for (let k = 0; k < 3; k++) {
        const x = mesh.pts[mesh.tris[t + k]][0] - W / 2;
        if (x < -1e-6) left++;
        else if (x > 1e-6) right++;
      }
      expect(left && right).toBeFalsy();
    }
  });

  it('refuses a crease it cannot crease and keeps the plain mesh', () => {
    const plain = meshPiece(rs, corners, 8);
    const refused = meshPiece(rs, corners, 8, [{ s: 0, e: 0 }]);
    expect(refused.creases).toEqual([[]]);
    expect(refused.pts).toEqual(plain.pts);
    expect(Array.from(refused.tris)).toEqual(Array.from(plain.tris));
    expect(plain.creases).toBeUndefined();
  });
});

describe('solveDoll folds', () => {
  it('folds the placket along its middle: finished width half the cut, plies apart, no NaN', () => {
    const { facts, graph, options } = fixture();
    const report = solveDoll({ graph, facts, options: { ...options, folds: { P: [middle()] } } });
    expect(report.stats.nan).toBe(0);
    for (const v of report.positions) expect(Number.isFinite(v)).toBe(true);
    expect(report.folds).toHaveLength(1);
    const f = report.folds![0];
    expect(f.pieceKey).toBe('P');
    expect(f.applied).toBe(true);
    expect(f.cutWidthMm).toBeCloseTo(40, 0);
    expect(f.finishedWidthMm).toBeCloseTo(20, 0);
    expect(f.note).toContain('turned under');
    expect(f.creaseDevMm).toBeLessThanOrEqual(1.5);
    expect(f.dihedralMinDeg).toBeGreaterThanOrEqual(170);
    expect(f.interpenetrating).toBe(0);
    expect(f.plyGapMm).not.toBeNull();
    expect(f.plyGapMm!.min).toBeGreaterThan(0);
    expect(f.drawnWidthMm).toBeLessThan(0.75 * f.cutWidthMm);
    expect(report.warnings.some((w) => w.includes('not folded'))).toBe(false);
  }, 60_000);

  it('says in words when the line does not cross the piece', () => {
    const { facts, graph, options } = fixture();
    const off: DollFold = { seq: 1, a: [1.5, 0], b: [1.5, 1], flipAt: [0.25, 0.5], kind: 'inward' };
    const report = solveDoll({ graph, facts, options: { ...options, folds: { P: [off] } } });
    expect(report.folds).toHaveLength(1);
    expect(report.folds![0].applied).toBe(false);
    expect(report.folds![0].note).toContain('not folded');
    expect(report.panels.some((p) => p.pieceKey === 'P')).toBe(true);
    expect(report.warnings.some((w) => w.includes('not folded'))).toBe(true);
  }, 60_000);

  it('folds a placket that is sewn to nothing (drawn apart) and still measures its plies', () => {
    const { facts, graph, options } = fixture(false);
    const report = solveDoll({ graph, facts, options: { ...options, folds: { P: [middle()] } } });
    expect(report.floating.some((f) => f.pieceKey === 'P')).toBe(true);
    const f = report.folds![0];
    expect(f.applied).toBe(true);
    expect(f.finishedWidthMm).toBeCloseTo(20, 0);
    expect(f.drawnWidthMm).toBeLessThan(0.75 * f.cutWidthMm);
    expect(f.plyGapMm).not.toBeNull();
    expect(f.plyGapMm!.min).toBeGreaterThan(0);
    expect(f.plyGapMm!.max).toBeLessThan(2.5);
    expect(f.interpenetrating).toBe(0);
  }, 60_000);

  it('floats a front and its placket as one lot: the seam between them drawn, the plies apart', () => {
    const { facts, graph, options } = fixture(true, true);
    const report = solveDoll({ graph, facts, options: { ...options, folds: { P: [middle()] } } });
    expect(report.stats.nan).toBe(0);
    // Both drift from the body as one lot, laid as the chart laid them — the front says so.
    expect(report.floating.map((f) => f.pieceKey).sort()).toEqual(['F', 'P']);
    expect(report.floating.find((f) => f.pieceKey === 'F')!.reason).toContain('drawn apart with P');
    // The seam inside the lot is a seam, drawn closed — not a row that "cannot be drawn".
    const fp = report.seams.find((s) => s.id === 'F#1~P#3');
    expect(fp).toBeDefined();
    expect(fp!.state).not.toBe('open');
    expect(fp!.residualP95Mm).toBeLessThan(5);
    expect((report.contradictions ?? []).some((c) => c.includes('cannot be drawn'))).toBe(false);
    // The placket folds on the lot as it would on the doll: its plies lie apart, none through.
    const f = report.folds![0];
    expect(f.applied).toBe(true);
    expect(f.finishedWidthMm).toBeCloseTo(20, 0);
    expect(f.plyGapMm).not.toBeNull();
    expect(f.plyGapMm!.min).toBeGreaterThan(0);
    expect(f.plyGapMm!.max).toBeLessThan(2.5);
    expect(f.interpenetrating).toBe(0);
  }, 60_000);

  it('is byte-for-byte the old doll without folds', () => {
    const { facts, graph, options } = fixture();
    const legacy = solveDoll({ graph, facts, options });
    const empty = solveDoll({ graph, facts, options: { ...options, folds: {} } });
    const emptyList = solveDoll({ graph, facts, options: { ...options, folds: { P: [] } } });
    expect(legacy.folds).toBeUndefined();
    expect(withoutTimes(empty)).toEqual(withoutTimes(legacy));
    expect(withoutTimes(emptyList)).toEqual(withoutTimes(legacy));
  }, 60_000);
});

// A w × h rectangle as the doll meshes it: a contour sample every mm, CCW from the origin.
function ringOf(w: number, h: number): Pt2[] {
  const rs: Pt2[] = [];
  for (let x = 0; x < w; x++) rs.push([x, 0]);
  for (let y = 0; y < h; y++) rs.push([w, y]);
  for (let x = w; x > 0; x--) rs.push([x, h]);
  for (let y = h; y > 0; y--) rs.push([0, y]);
  return rs;
}
const cornersOf = (w: number, h: number) => [0, w, w + h, 2 * w + h];
const atRing = (rs: readonly Pt2[], [x, y]: Pt2) => rs.findIndex((p) => p[0] === x && p[1] === y);
const lineOf = (rs: readonly Pt2[], a: Pt2, b: Pt2): MeshCrease => ({
  s: atRing(rs, a),
  e: atRing(rs, b),
});

const edgesOf = (mesh: PieceMesh) => {
  const edges = new Set<string>();
  for (let t = 0; t < mesh.tris.length; t += 3) {
    const [a, b, c] = [mesh.tris[t], mesh.tris[t + 1], mesh.tris[t + 2]];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ])
      edges.add(p < q ? `${p}-${q}` : `${q}-${p}`);
  }
  return edges;
};

// Stands in for the whole output: printed by the code before crossings were split (53395cd71).
const PINS = {
  none: 3167247377,
  oneMesh: 4221441830,
  oneFold: 2703701573,
  parallelMesh: 1528128353,
  parallelFold: 4223140791,
  pleats: 214770988,
};
function fingerprint(pts: readonly Pt2[], ...lists: readonly ArrayLike<number>[]): number {
  let hash = 2166136261;
  const mix = (v: number) => {
    hash = Math.imul(hash ^ v, 16777619) >>> 0;
  };
  for (const [x, y] of pts) {
    mix(Math.round(x * 1e6) | 0);
    mix(Math.round(y * 1e6) | 0);
  }
  for (const list of lists) {
    mix(list.length);
    for (let i = 0; i < list.length; i++) mix(list[i]);
  }
  return hash;
}
const meshPrint = (mesh: PieceMesh) =>
  fingerprint(mesh.pts, mesh.tris, mesh.bRs, ...(mesh.creases ?? []));

function geomOf(rs: Pt2[], w: number, h: number): PieceGeom {
  return {
    pieceKey: 'P',
    name: 'P',
    hand: null,
    cloth: null,
    rs,
    corners: cornersOf(w, h),
    notchIdx: [],
    edges: [],
    rect: true,
    areaMm2: w * h,
    perimMm: 2 * (w + h),
    twinOf: [],
  };
}

/** A fold given in mm on a w × h rectangle (its frame is the rectangle). */
const foldMm =
  (w: number, h: number) =>
  (seq: number, a: Pt2, b: Pt2, flipAt: Pt2, kind: DollFold['kind'] = 'inward'): DollFold => ({
    seq,
    a: [a[0] / w, a[1] / h],
    b: [b[0] / w, b[1] / h],
    flipAt: [flipAt[0] / w, flipAt[1] / h],
    kind,
  });

function foldRectangle(w: number, h: number, folds: DollFold[], step = 12) {
  const rs = ringOf(w, h);
  const g = geomOf(rs, w, h);
  const frame = frameOf(g);
  const mesh = meshPiece(rs, cornersOf(w, h), step, foldCreases(rs, frame, folds));
  const warnings: string[] = [];
  const reports: DollFoldReport[] = [];
  const fold = foldPanel(g, mesh, folds, frame, step, warnings, reports);
  const mm = folds.map((f) => ({
    seq: f.seq,
    a: [f.a[0] * w, f.a[1] * h] as Pt2,
    b: [f.b[0] * w, f.b[1] * h] as Pt2,
    flipAt: [f.flipAt[0] * w, f.flipAt[1] * h] as Pt2,
    kind: f.kind,
  }));
  const flatPly = foldPlies(rs, mm);
  return { rs, mesh, fold: fold!, warnings, reports, flatPly };
}

const polyArea = (poly: readonly Pt2[]) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
};

const distToSeg = (p: Pt2, a: Pt2, b: Pt2) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};
const distToPoly = (p: Pt2, poly: readonly Pt2[]) => {
  if (pointInPolygon(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, distToSeg(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
};

/** Grid points (`cell` mm apart) inside any of the polygons: a footprint without even-odd. */
function footprint(polys: readonly (readonly Pt2[])[], cell = 2) {
  const all = polys.flat();
  const [xs, ys] = [all.map((p) => p[0]), all.map((p) => p[1])];
  const [x0, x1] = [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))];
  const [y0, y1] = [Math.floor(Math.min(...ys)), Math.ceil(Math.max(...ys))];
  let n = 0;
  for (let x = x0 + cell / 2; x < x1; x += cell)
    for (let y = y0 + cell / 2; y < y1; y += cell)
      if (polys.some((poly) => pointInPolygon([x, y], poly))) n++;
  return n * cell * cell;
}

const mirror = (p: Pt2, a: Pt2, b: Pt2): Pt2 => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [nx, ny] = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const d = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny;
  return [p[0] - 2 * d * nx, p[1] - 2 * d * ny];
};
const sideOfLine = (p: Pt2, a: Pt2, b: Pt2) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

describe('meshPiece crossing creases', () => {
  const [w, h] = [200, 300];
  const rs = ringOf(w, h);
  const keep = cornersOf(w, h);

  it('two crossing lines share one vertex, and every segment of both is a triangle edge', () => {
    const v = lineOf(rs, [100, 0], [100, 300]);
    const u = lineOf(rs, [200, 150], [0, 150]);
    expect(meshPiece(rs, keep, 12, [v]).creases![0]).toHaveLength(43);
    for (const lines of [
      [v, u],
      [u, v],
    ]) {
      const mesh = meshPiece(rs, keep, 12, lines);
      const [a, b] = mesh.creases!;
      expect(a.length).toBeGreaterThan(2);
      expect(b.length).toBeGreaterThan(2);
      const shared = a.filter((id) => b.includes(id));
      expect(shared).toHaveLength(1);
      expect(mesh.pts[shared[0]]).toEqual([100, 150]);
      const edges = edgesOf(mesh);
      for (const ids of mesh.creases!)
        for (let k = 0; k + 1 < ids.length; k++) {
          const [p, q] = [ids[k], ids[k + 1]];
          expect(edges.has(p < q ? `${p}-${q}` : `${q}-${p}`)).toBe(true);
        }
    }
  });

  it('holds at a shallow angle and close to the contour', () => {
    const shallow: [Pt2, Pt2, Pt2, Pt2][] = [
      [
        [0, 150],
        [200, 150],
        [0, 141],
        [200, 159],
      ], // 5°, mid piece
      [
        [0, 150],
        [200, 150],
        [0, 118],
        [200, 182],
      ], // 18°
      [
        [0, 8],
        [200, 8],
        [40, 0],
        [200, 16],
      ], // 3°, 8 mm from the edge, one line ends on it
    ];
    for (const [a, b, c, d] of shallow) {
      const mesh = meshPiece(rs, keep, 12, [lineOf(rs, a, b), lineOf(rs, c, d)]);
      expect(mesh.creases!.map((ids) => ids.length >= 2)).toEqual([true, true]);
      expect(mesh.creases![0].filter((id) => mesh.creases![1].includes(id))).toHaveLength(1);
    }
  });

  it('three lines through one point share that one vertex', () => {
    const square = ringOf(300, 300);
    const mesh = meshPiece(square, cornersOf(300, 300), 12, [
      lineOf(square, [150, 0], [150, 300]),
      lineOf(square, [0, 150], [300, 150]),
      lineOf(square, [0, 0], [300, 300]),
    ]);
    const [a, b, c] = mesh.creases!;
    expect(a.filter((id) => b.includes(id) && c.includes(id))).toHaveLength(1);
    expect(new Set([...a, ...b, ...c]).size).toBe(a.length + b.length + c.length - 2);
  });

  it('a pleat line gives way to a fold that crosses it and is left as it was otherwise', () => {
    const fold = lineOf(rs, [0, 150], [200, 150]);
    const pleat = { ...lineOf(rs, [100, 0], [100, 300]), passive: true };
    const crossed = meshPiece(rs, keep, 12, [pleat, fold]);
    expect(crossed.creases![0]).toEqual([]);
    expect(crossed.creases![1].length).toBeGreaterThan(2);
    const beside = { ...lineOf(rs, [100, 0], [100, 100]), passive: true };
    const free = meshPiece(rs, keep, 12, [beside, fold]);
    expect(free.creases!.every((ids) => ids.length >= 2)).toBe(true);
  });

  it('pleat lines that cross each other stay as they were: no shared vertex', () => {
    const a = { ...lineOf(rs, [0, 0], [200, 300]), passive: true };
    const b = { ...lineOf(rs, [200, 0], [0, 300]), passive: true };
    const mesh = meshPiece(rs, keep, 12, [a, b]);
    const plain = meshPiece(rs, keep, 12, [
      { s: a.s, e: a.e },
      { s: b.s, e: b.e },
    ]);
    expect(plain.pts).not.toEqual(mesh.pts);
  });
});

describe('foldPanel crossing folds', () => {
  const [w, h] = [200, 300];
  const at = foldMm(w, h);

  it('two lines at a right angle: both applied, one shared vertex, plies and area as foldPlies', () => {
    const turn = at(1, [60, 0], [60, 300], [30, 150]);
    const hem = at(2, [0, 40], [200, 40], [100, 10]);
    const { mesh, fold, warnings, reports, flatPly } = foldRectangle(w, h, [turn, hem]);
    expect(reports.map((r) => r.applied)).toEqual([true, true]);
    expect(warnings).toEqual([]);
    const [c1, c2] = fold.creases;
    const shared = c1.verts.filter((v) => c2.verts.includes(v));
    expect(shared).toHaveLength(1);
    expect(fold.flat[shared[0]][0]).toBeCloseTo(60, 9);
    expect(fold.flat[shared[0]][1]).toBeCloseTo(40, 9);
    // Plies: four in the 2D answer, the same four ranks in the mesh, each of the same area.
    expect(flatPly.plies).toHaveLength(4);
    expect([...new Set(fold.triPly)].sort((a, b) => a - b)).toEqual(
      flatPly.plies.map((p) => p.layer).sort((a, b) => a - b),
    );
    const T = mesh.tris;
    const triangle = (t: number): Pt2[] => [mesh.pts[T[t]], mesh.pts[T[t + 1]], mesh.pts[T[t + 2]]];
    for (const ply of flatPly.plies) {
      let area = 0;
      for (let t = 0; t < T.length; t += 3)
        if (fold.triPly[t / 3] === ply.layer) area += polyArea(triangle(t));
      expect(area).toBeCloseTo(polyArea(ply.poly), 6);
    }
    // The folded footprint: what the turned flaps leave uncovered is gone, and only that.
    const tris: Pt2[][] = [];
    for (let t = 0; t < T.length; t += 3) tris.push(triangle(t));
    const fromMesh = footprint(tris);
    expect(Math.abs(fromMesh - footprint(flatPly.plies.map((p) => p.poly)))).toBeLessThan(100);
    expect(Math.abs(fromMesh - (200 - 60) * (300 - 40))).toBeLessThan(400);
  }, 30_000);

  it('a skew second line: every ply turns over its own stretch, as foldedOutline and as paper', () => {
    // First a straight turn at y = 100, then a line 20° off the square (109 mm over 300) across it.
    const [A1, B1]: Pt2[] = [
      [0, 100],
      [200, 100],
    ];
    const [A2, B2]: Pt2[] = [
      [45, 0],
      [154, 300],
    ];
    const first = at(1, A1, B1, [100, 20]);
    const second = at(2, A2, B2, [10, 150]);
    const folds = [first, second];
    const { mesh, fold, reports, flatPly } = foldRectangle(w, h, folds);
    expect(reports.map((r) => r.applied)).toEqual([true, true]);

    // Paper, in closed form. A line that crosses a fold turns each ply about that ply's own stretch:
    // the corner that went through both folds lands at R1(R2(q)), with R1, R2 the mirrors as cut.
    const s1 = Math.sign(sideOfLine([100, 20], A1, B1));
    const s2 = Math.sign(sideOfLine([10, 150], A2, B2));
    const expected = (q: Pt2): Pt2 => {
      const [m1, m2] = [
        Math.sign(Math.round(sideOfLine(q, A1, B1) * 1e6)) === s1,
        Math.sign(Math.round(sideOfLine(q, A2, B2) * 1e6)) === s2,
      ];
      if (m1 && m2) return mirror(mirror(q, A2, B2), A1, B1);
      if (m1) return mirror(q, A1, B1);
      if (m2) return mirror(q, A2, B2);
      return q;
    };
    let turnedTwice = 0;
    fold.flat.forEach((q, i) => {
      const e = expected(q);
      expect(Math.hypot(mesh.pts[i][0] - e[0], mesh.pts[i][1] - e[1])).toBeLessThan(1e-6);
      if (Math.hypot(e[0] - q[0], e[1] - q[1]) > 1 && fold.ply[i] === -2) turnedTwice++;
    });
    expect(turnedTwice).toBeGreaterThan(0);

    // The upper stretch of the second line never moved; its lower stretch went with the first turn.
    const c2 = fold.creases[1].verts;
    const above = c2.filter((v) => fold.flat[v][1] > 100 + 1e-6);
    const below = c2.filter((v) => fold.flat[v][1] < 100 - 1e-6);
    expect(above.length).toBeGreaterThan(0);
    expect(below.length).toBeGreaterThan(0);
    for (const v of above) expect(mesh.pts[v]).toEqual(fold.flat[v]);
    for (const v of below) expect(mesh.pts[v][1]).toBeCloseTo(200 - fold.flat[v][1], 6);

    // 2D and 3D agree: every mesh vertex lies on the ply of its own rank, every outline point on the
    // folded contour.
    const outline = foldedOutline(
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as UV[],
      folds,
      { w, h },
    );
    expect(outline.plies).toHaveLength(flatPly.plies.length);
    const plies = outline.plies.map((p) => ({
      layer: p.layer,
      poly: p.poly.map(([u, v]): Pt2 => [u * w, v * h]),
    }));
    mesh.pts.forEach((p, i) => {
      const own = plies.find((ply) => ply.layer === fold.ply[i])!;
      expect(distToPoly(p, own.poly)).toBeLessThan(0.5);
    });
    for (const [u, v] of outline.outline) {
      const q: Pt2 = [u * w, v * h];
      const near = Math.min(...fold.geom.rs.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));
      expect(near).toBeLessThan(0.5);
    }
    // Rigid plies: a chord or a stray point would change these.
    for (const ply of flatPly.plies) {
      const cut = plies.find((p) => p.layer === ply.layer)!;
      expect(polyArea(cut.poly)).toBeCloseTo(polyArea(ply.poly), 6);
    }
    expect(flatPly.plies.reduce((sum, ply) => sum + polyArea(ply.poly), 0)).toBeCloseTo(w * h, 6);
  }, 30_000);

  it('a triangle with all its corners on creases gets its own ply', () => {
    const turn = at(1, [60, 0], [60, 300], [30, 150]);
    const hem = at(2, [0, 40], [200, 40], [100, 10]);
    const { mesh, fold } = foldRectangle(w, h, [turn, hem]);
    const shared = fold.creases[0].verts.filter((v) => fold.creases[1].verts.includes(v))[0];
    const T = mesh.tris;
    let around = 0;
    for (let t = 0; t < T.length; t += 3) {
      if (T[t] !== shared && T[t + 1] !== shared && T[t + 2] !== shared) continue;
      around++;
      const [p, q, r] = [fold.flat[T[t]], fold.flat[T[t + 1]], fold.flat[T[t + 2]]];
      const [cx, cy] = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3];
      const rank = cx < 60 ? (cy < 40 ? -2 : -1) : cy < 40 ? -3 : 0;
      // Corner ranks: body 0, turned flap −1, its hem −2, the body's hem −3 (a flipped stack).
      expect(fold.triPly[t / 3]).toBe(rank);
    }
    expect(around).toBeGreaterThanOrEqual(4);
  });
});

describe('fold rows without a crossing', () => {
  const [w, h] = [200, 300];
  const at = foldMm(w, h);
  const rs = ringOf(w, h);
  const keep = cornersOf(w, h);
  const turn = at(1, [60, 0], [60, 300], [30, 150]);
  const second = at(2, [120, 0], [120, 300], [10, 150]);

  it('no lines: the mesh as it was', () => {
    const mesh = meshPiece(rs, keep, 12);
    expect(meshPrint(mesh)).toBe(PINS.none);
    expect(mesh.creases).toBeUndefined();
  });

  it('one line: the mesh and the fold as they were', () => {
    const { mesh, fold, reports } = foldRectangle(w, h, [turn]);
    expect(reports.map((r) => r.applied)).toEqual([true]);
    const flat = meshPiece(rs, keep, 12, foldCreases(rs, frameOf(geomOf(rs, w, h)), [turn]));
    expect(meshPrint(flat)).toBe(PINS.oneMesh);
    expect(fingerprint(mesh.pts, fold.ply, fold.triPly, fold.triFlip)).toBe(PINS.oneFold);
  });

  it('parallel lines: the mesh and the fold as they were', () => {
    const { mesh, fold, reports } = foldRectangle(w, h, [turn, second]);
    expect(reports.map((r) => r.applied)).toEqual([true, true]);
    const flat = meshPiece(
      rs,
      keep,
      12,
      foldCreases(rs, frameOf(geomOf(rs, w, h)), [turn, second]),
    );
    expect(meshPrint(flat)).toBe(PINS.parallelMesh);
    expect(fingerprint(mesh.pts, fold.ply, fold.triPly, fold.triFlip)).toBe(PINS.parallelFold);
  });

  it('pleat rows only: the mesh as it was', () => {
    const pleats = [
      at(1, [80, 0], [100, 300], [85, 150], 'pleat_r'),
      at(2, [100, 0], [100, 300], [95, 150], 'pleat_r'),
      at(3, [120, 0], [100, 300], [115, 150], 'pleat_r'),
    ];
    const flat = meshPiece(rs, keep, 12, foldCreases(rs, frameOf(geomOf(rs, w, h)), pleats));
    expect(meshPrint(flat)).toBe(PINS.pleats);
  });
});

describe('solveDoll crossing folds', () => {
  const across = (seq: number, kind: DollFold['kind'] = 'inward'): DollFold => ({
    seq,
    a: [0, 0.1],
    b: [1, 0.1],
    flipAt: [0.5, 0.02],
    kind,
  });

  it('folds a free placket along its middle and across its foot: each to its own width', () => {
    const { facts, graph, options } = fixture(false);
    const report = solveDoll({
      graph,
      facts,
      options: { ...options, folds: { P: [middle(), across(2)] } },
    });
    expect(report.stats.nan).toBe(0);
    for (const v of report.positions) expect(Number.isFinite(v)).toBe(true);
    expect(report.folds!.map((f) => f.applied)).toEqual([true, true]);
    expect(report.warnings.some((w) => w.includes('not folded'))).toBe(false);
    const [along, foot] = report.folds!;
    expect(Math.abs(along.drawnWidthMm - 20)).toBeLessThan(1.5);
    expect(Math.abs(foot.drawnWidthMm - 630)).toBeLessThan(1.5);
    for (const f of report.folds!) {
      // The crossing turns the crease over there: that is no kink.
      expect(f.creaseDevMm).toBeLessThanOrEqual(1.5);
      expect(f.dihedralMinDeg).toBeGreaterThanOrEqual(160);
      expect(f.interpenetrating).toBe(0);
      expect(f.plyGapMm!.min).toBeGreaterThan(0);
      expect(f.plyGapMm!.max).toBeLessThan(5);
    }
  }, 60_000);

  it('applies both on a sewn placket too; a seam along the foot fights it with or without a crossing', () => {
    const { facts, graph, options } = fixture();
    const report = solveDoll({
      graph,
      facts,
      options: { ...options, folds: { P: [middle(), across(2)] } },
    });
    expect(report.stats.nan).toBe(0);
    expect(report.folds!.map((f) => f.applied)).toEqual([true, true]);
    expect(report.warnings.some((w) => w.includes('not folded'))).toBe(false);
  }, 60_000);

  it('a pleat row across a fold stays flat and does not cost the fold', () => {
    const { facts, graph, options } = fixture();
    const pleat: DollFold = { ...middle('pleat_r'), seq: 1 };
    const report = solveDoll({
      graph,
      facts,
      options: { ...options, folds: { P: [pleat, across(2)] } },
    });
    expect(report.folds!.map((f) => [f.seq, f.applied])).toEqual([[2, true]]);
    expect(report.warnings.some((w) => w.includes('not folded'))).toBe(false);
  }, 60_000);
});
