// `yarn seams:check` entry — bundled by scripts/seams/check.mjs (esbuild) and run in node.
//
// Loads a DXF through the product path (the POM probe's loader: the nesting parser → split by size
// → one sewing-line piece per block), reads the seam graph, writes anchors for its seams, perturbs
// the geometry the ways a re-export does, and resolves the anchors back.

import type { PieceDTO, Pt } from '../../src/lib/nesting/types';
import { readSeamGraph, segmentAll } from '../../src/lib/assembly-skeleton/pipeline';
import { edgeIdsOf } from '../../src/lib/assembly-skeleton/geometry';
import type {
  PieceGeom,
  Pt2,
  SeamCandidate,
  SeamDecisions,
  SeamGraph,
  SkeletonCategory,
  SkeletonFacts,
} from '../../src/lib/assembly-skeleton/types';
import {
  SEAMS,
  decisionsFor,
  fromWire,
  grainDegOf,
  newSeamKey,
  resolveSeamDecisions,
  runsOfPiece,
  seamFromCandidate,
  toWire,
  type Resolved,
  type ResolveOptions,
  type StoredSeam,
} from '../../src/lib/seams';
import { sampleAt } from '../../src/lib/seams/frame';
import { load as pomLoad, type CardPiece } from '../pom/check-entry';

export { SEAMS, readSeamGraph, segmentAll, decisionsFor };

export type Loaded = {
  facts: SkeletonFacts;
  baseSize: string;
  sizes: { size: string; facts: SkeletonFacts }[];
};

/** The base size's facts; prod cards keyed by the card's line keys (as the product does). */
export async function load(
  bytes: ArrayBuffer,
  category: SkeletonCategory,
  card: CardPiece[] = [],
): Promise<Loaded> {
  const l = await pomLoad(bytes, category, card);
  const keyOf = new Map(card.map((c) => [c[1].toLowerCase(), c[0]]));
  const rekey = (f: SkeletonFacts): SkeletonFacts => ({
    ...f,
    pieces: f.pieces.map((p) => ({
      ...p,
      pieceKey: keyOf.get(p.pieceKey.toLowerCase()) ?? p.pieceKey,
      name: p.pieceKey,
    })),
  });
  return {
    facts: rekey(l.facts),
    baseSize: l.baseSize,
    sizes: l.sizes.map((s) => ({ size: s.size, facts: rekey({ ...l.facts, pieces: s.pieces }) })),
  };
}

// ── anchors for every seam of a graph ─────────────────────────────────────────────────────────

/** Every seam the graph reads (chosen + closures), with its stored row. */
export function anchorAll(
  graph: SeamGraph,
  facts: SkeletonFacts,
  status: 'confirmed' | 'rejected' = 'confirmed',
): { c: SeamCandidate; row: StoredSeam }[] {
  const grainDeg = grainDegOf(facts);
  const out: { c: SeamCandidate; row: StoredSeam }[] = [];
  const all = [...graph.chosen, ...graph.rejected.filter((c) => c.kind === 'closure-not-seam')];
  let i = 0;
  for (const c of all) {
    const row = seamFromCandidate(c, graph.pieces, {
      seamKey: newSeamKey(1760000000000 + i++),
      status,
      by: 'probe',
      at: '2026-10-10T12:00:00Z',
      anchoredSize: 'M',
      grainDeg,
    });
    if (!row) throw new Error(`no anchor for ${c.a} ↔ ${c.b}`);
    // Through the wire and back, as the card read would hand it over.
    const back = fromWire(JSON.parse(JSON.stringify(toWire(row))));
    if (!back) throw new Error('wire round trip lost a row');
    out.push({ c, row: { ...back, createdBy: 'probe', createdAt: '2026-10-10T12:00:00Z' } });
  }
  return out;
}

export const sideSet = (c: SeamCandidate, s: 'a' | 'b') =>
  [...(s === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b))].sort().join(',');

export function resolve(
  rows: StoredSeam[],
  facts: SkeletonFacts,
  thresholds?: ResolveOptions['thresholds'],
): Resolved {
  return resolveSeamDecisions(rows, segmentAll(facts), { grainDeg: grainDegOf(facts), thresholds });
}

// ── perturbations (what a re-export does) ─────────────────────────────────────────────────────

type Perturb = (p: PieceDTO) => PieceDTO;

const mapPiece = (p: PieceDTO, fn: (pts: Pt[], closed: boolean) => Pt[]): PieceDTO => ({
  ...p,
  poly: fn(p.poly, true),
  inner: (p.inner ?? []).map((q) => ({ ...q, pts: fn(q.pts, q.closed) })),
});

const perimCm = (pts: Pt[]) =>
  pts.reduce(
    (s, q, i) =>
      s + Math.hypot(q.x - pts[(i + 1) % pts.length].x, q.y - pts[(i + 1) % pts.length].y),
    0,
  );

/** The exporter starts every closed contour at another vertex (share `frac` round the loop). */
export const rotateStart =
  (frac: number): Perturb =>
  (p) =>
    mapPiece(p, (pts, closed) => {
      if (!closed || pts.length < 3) return pts;
      const k = Math.floor(pts.length * frac) % pts.length;
      return [...pts.slice(k), ...pts.slice(0, k)];
    });

/** The file mirrored across a vertical axis (the piece's own bbox). */
export const mirror: Perturb = (p) => {
  const W = p.bboxW;
  const m = mapPiece(p, (pts) => pts.map((q) => ({ x: W - q.x, y: q.y })));
  return {
    ...m,
    grain: (p.grain ?? []).map((g) => ({ ...g, angleDeg: (180 - g.angleDeg + 180) % 180 })),
  };
};

/** Re-exported with another resample: every big closed loop walked at `stepCm`, from `phaseCm`. */
export const resampleAt =
  (stepCm: number, phaseCm: number): Perturb =>
  (p) =>
    mapPiece(p, (pts, closed) => {
      if (!closed || pts.length < 3 || perimCm(pts) < 10) return pts;
      const n = pts.length;
      const out: Pt[] = [];
      let carry = phaseCm;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        let t = carry;
        while (t < L) {
          out.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
          t += stepCm;
        }
        carry = t - L;
      }
      return out.length >= 3 ? out : pts;
    });

/** One piece redrawn 5 % bigger (every line of it). */
export const scaleBy =
  (k: number): Perturb =>
  (p) => ({
    ...mapPiece(p, (pts) => pts.map((q) => ({ x: q.x * k, y: q.y * k }))),
    bboxW: p.bboxW * k,
    bboxH: p.bboxH * k,
    areaCm2: p.areaCm2 * k * k,
  });

export function perturb(facts: SkeletonFacts, fn: Perturb, only?: string): SkeletonFacts {
  return {
    ...facts,
    pieces: facts.pieces.map((p) =>
      only && p.pieceKey !== only ? p : { ...p, piece: fn(p.piece) },
    ),
  };
}

/** The drawing transform a perturbation applied (mm, the PieceDTO frame) — the truth mapping. */
export function truthMap(kind: 'same' | 'mirror', piece: PieceDTO): (q: Pt2) => Pt2 {
  if (kind === 'mirror') return (q) => [piece.bboxW * 10 - q[0], q[1]];
  return (q) => q;
}

// ── truth check: does a resolved run lie where the original run went? ─────────────────────────

const distToPolyline = (q: Pt2, pts: readonly Pt2[]) => {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(q[0] - ax - t * dx, q[1] - ay - t * dy));
  }
  return best;
};

/** Points of a run id on a piece (an edge or a chain). */
export function runPts(pieces: readonly PieceGeom[], id: string): Pt2[] | null {
  const key = id.slice(0, id.lastIndexOf('#'));
  const p = pieces.find((q) => q.pieceKey === key);
  if (!p) return null;
  const r = runsOfPiece(p, 3).find((x) => x.id === id);
  if (r) return r.pts;
  // A run the resolver named that runsOfPiece does not list (never: same function).
  return null;
}

/**
 * Same place: every one of 9 samples of each run within `tolMm` of the other run (both ways), the
 * original mapped by the perturbation.
 */
export function samePlace(orig: Pt2[], map: (q: Pt2) => Pt2, now: Pt2[], tolMm = 6): boolean {
  const shares = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const o = sampleAt(orig, shares).map(map);
  const n = sampleAt(now, shares);
  const om = orig.map(map);
  return (
    o.every((q) => distToPolyline(q, now) <= tolMm) &&
    n.every((q) => distToPolyline(q, om) <= tolMm)
  );
}

/** Empty decisions object (gate 6: must change nothing). */
export const EMPTY: SeamDecisions = { forced: [], closures: [], excluded: [], words: [] };

// ── gate 6 helpers: the product pipeline with and without (empty) decisions ──────────────────
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
export { proposeSkeleton } from '../../src/lib/assembly-skeleton/pipeline';

/** The sewn part of a run: `[from, to]` shares of its arc length, as a polyline. */
export function subPts(pts: Pt2[], range: [number, number]): Pt2[] {
  const n = 24;
  return sampleAt(
    pts,
    Array.from({ length: n + 1 }, (_, i) => range[0] + ((range[1] - range[0]) * i) / n),
  );
}

/**
 * Where a resolved run lies against the anchored one (mapped by the perturbation): 'same' both ways
 * within `tolMm`; 'resegmented' when one contains the other within `tolMm` and their lengths differ
 * ≤ 10 % — the same physical edge whose corner the new segmentation moved (a dart tip of 9 mm merged
 * into a leg); else 'wrong'.
 */
export function placeVerdict(
  orig: Pt2[],
  map: (q: Pt2) => Pt2,
  now: Pt2[],
  tolMm = 6,
): 'same' | 'resegmented' | 'wrong' {
  if (samePlace(orig, map, now, tolMm)) return 'same';
  const shares = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const om = orig.map(map);
  const len = (p: Pt2[]) =>
    p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
  const inside = (a: Pt2[], b: Pt2[]) =>
    sampleAt(a, shares).every((q) => distToPolyline(q, b) <= tolMm);
  const ratio = len(now) / Math.max(len(om), 1e-6);
  return (inside(om, now) || inside(now, om)) && ratio >= 0.9 && ratio <= 1.1
    ? 'resegmented'
    : 'wrong';
}

// ── G7: every size ───────────────────────────────────────────────────────────────────────────
export { resolveAcrossSizes, edgeMapOf, resolveSeamDecisions } from '../../src/lib/seams';

/** Each size as the resolver sees it (segmented pieces + grain), optionally with one piece redrawn. */
export function sizePieces(
  sizes: { size: string; facts: SkeletonFacts }[],
  redraw?: { size: string; key: string; k: number },
) {
  return sizes.map((s) => {
    const facts =
      redraw && redraw.size === s.size ? perturb(s.facts, scaleBy(redraw.k), redraw.key) : s.facts;
    return { size: s.size, pieces: segmentAll(facts), grainDeg: grainDegOf(facts) };
  });
}
