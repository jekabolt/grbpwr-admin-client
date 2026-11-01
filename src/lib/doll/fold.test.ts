import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  SeamCandidate,
  SeamEvidence,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';

import { solveDoll } from './doll';
import { meshPiece } from './mesh';
import type { DollFold, DollOptions, DollReport } from './types';

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
function fixture(sewPlacket = true) {
  const facts: SkeletonFacts = {
    pieces: [
      rectangle('F', 'front', 1, 50, 70),
      rectangle('P', 'PLCK_L', 2, 4, 70),
      rectangle('B', 'back', 3, 50, 70),
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
  const owners = [...(sewPlacket ? [seam('F#1', 'P#3', 700)] : []), seam('B#1', 'F#3', 700)];
  const graph: SeamGraph = {
    ...read,
    chosen: owners,
    rejected: [],
    components: [['F', 'P', 'B']],
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
      candidates: rows.map((r) => ({ seamKey: r.row.seamKey, candidate: r.owner })),
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
