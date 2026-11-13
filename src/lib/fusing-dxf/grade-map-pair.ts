// Grade map · one size pair of a piece map, handed to the zone carry as its correspondences.
//
// The cut track gives the contour's nodes: a node on a ring corner ends a contour stretch, between
// two nodes a point keeps its plain arc fraction. Every internal line, notch and drill track carried
// in both sizes gives its line pair (node fractions; a drill moves with its centre). A track the map
// refused, or one that does not bind to the live geometry, is left to the zone mapper's own
// inference; when such a track lies near a zone ring (or the cut itself fell back) the size is
// marked approximate, with the reasons in plain words.

import { lineCorners } from 'lib/pattern-import/adapters/rul/correspond';
import type { PtMm } from 'lib/pattern-import/types';
import { BIND_MM, bindToLine, carryArc, nodesOf, type BoundLine } from 'lib/grade-map/bind';
import {
  dist,
  distanceToPolyline,
  mod,
  pathOf,
  pointAt,
  pointInRing,
  project,
  type Path,
} from 'lib/grade-map/geom';
import { classify, type SizeMarks } from 'lib/grade-map/marks';
import type { GmPiece, GmTrack } from 'lib/grade-map/types';
import type { FuseInternalLine, FuseInternals } from './dxf';
import { flattenSpline } from './spline';
import type { PieceFuseSpec } from './types';
import {
  CONTOUR_CORNER_THRESHOLDS,
  type GivenCorrespondence,
  type GivenLinePairs,
  type GivenNodes,
} from './zone-grade';

/** One piece's grade map as the runtime holds it. */
export type PieceGradeMap = {
  piece: GmPiece;
  /** The size the map's nodes are absolute in. */
  baseSizeId: number;
  /** Builder version, file, piece and geometry: one key, one map. */
  key: string;
};

/** A piece map read between two of its sizes. Swap from and to for the way back. */
export type GradeMapPair = {
  map: PieceGradeMap;
  from: number;
  to: number;
  /** Told why, when a track the zone relies on was refused and fell back to inference. */
  approximate?: (reasons: string[]) => void;
};

/** A line, notch or drill this close to a zone ring (or inside it) is one the zone relies on, mm. */
export const RELY_MM = 20;
/** A cut node this close in arc to a ring corner ends a contour stretch there, mm. */
const CORNER_NODE_MM = 0.02;
/** A pair's points this close to a line lie on it, mm. */
const ON_LINE_MM = 1e-3;
/** An inferred line's point this close to a map pair's line shares it, mm. */
const SHARED_MM = 0.05;
/** A shared point the inferred pair sends farther than this from the map's twin contradicts it, mm. */
const AGREE_MM = 0.5;
/** Lines are tested against the zone at least this often, mm. */
const RELY_STEP_MM = 5;
/** At most this many reasons are listed; the rest are counted. */
const MAX_REASONS = 4;

const KIND_WORD: Record<GmTrack['kind'], string> = {
  cut: 'cut line',
  seam: 'seam line',
  internal: 'internal line',
  notch: 'notch',
  drill: 'drill',
};

export type Side = { lines: readonly FuseInternalLine[]; cut: Path | null; marks: SizeMarks };

const sideOf = (outline: readonly PtMm[], lines: readonly FuseInternalLine[]): Side => {
  const cut = pathOf(outline, true);
  return { lines, cut, marks: classify(lines, cut) };
};

/** A track's nodes in one size, or why the map does not carry it there. */
function nodesIn(
  map: PieceGradeMap,
  track: GmTrack,
  sizeId: number,
): { nodes: PtMm[] } | { refused: string } {
  if (sizeId === map.baseSizeId) return { nodes: nodesOf(track, null)! };
  const size = track.sizes.find((z) => z.sizeId === sizeId);
  if (!size) return { refused: 'size not in the grade map' };
  const nodes = nodesOf(track, sizeId);
  return nodes ? { nodes } : { refused: size.refused ?? 'refused' };
}

export type BoundMark = { line: BoundLine; idx: number[] } | { point: PtMm; idx: number[] };

/** A mark track bound to the live lines of one size (the binder's own rule), with the line indices. */
function bindMark(track: GmTrack, nodes: readonly PtMm[], side: Side): BoundMark | null {
  if (!nodes.length) return null;
  if (track.kind === 'drill') {
    let best: { c: PtMm; idx: number[] } | null = null;
    let bestD = BIND_MM;
    for (const d of side.marks.drills) {
      const e = dist(d.c, nodes[0]);
      if (e <= bestD) [best, bestD] = [d, e];
    }
    return best ? { point: best.c, idx: best.idx } : null;
  }
  const candidates: { path: Path; idx: number }[] = [];
  if (track.kind === 'notch')
    for (const n of side.marks.notches) {
      const path = pathOf([n.a, n.b], false);
      if (path) candidates.push({ path, idx: n.idx });
    }
  else if (track.kind === 'internal')
    for (const l of side.marks.internals)
      if (l.line.layer === track.layer && l.line.closed === track.closed)
        candidates.push({ path: l.path, idx: l.idx });
  let best: { line: BoundLine; worst: number; idx: number } | null = null;
  for (const c of candidates) {
    const b = bindToLine(nodes, c.path);
    if (b && (!best || b.worst < best.worst)) best = { ...b, idx: c.idx };
  }
  return best ? { line: best.line, idx: [best.idx] } : null;
}

/**
 * Two bound lines of one track, point i onto point i: the nodes, both lines' own vertices (the
 * other line's read back by node fractions), so the pair is exact wherever either line bends.
 */
function linePairOf(from: BoundLine, to: BoundLine): [PtMm[], PtMm[]] {
  const closed = from.path.closed;
  const L = from.path.total;
  const lo = from.arcs[0];
  const hi = closed ? lo + L : from.arcs[from.arcs.length - 1];
  const inRange = (a: number) => (closed ? lo + mod(a - lo, L) : a);
  const arcs: number[] = [...from.arcs];
  const vertices = (path: Path) => path.cum.slice(0, closed ? path.pts.length : path.cum.length);
  for (const c of vertices(from.path)) arcs.push(inRange(c));
  for (const c of vertices(to.path)) arcs.push(inRange(carryArc(to, from, c)));
  arcs.sort((a, b) => a - b);
  const kept: number[] = [];
  for (const a of arcs) {
    if (a < lo - 1e-9 || a > hi + 1e-9 || (closed && a > hi - 1e-6)) continue;
    if (kept.length && a - kept[kept.length - 1] <= 1e-6) continue;
    kept.push(a);
  }
  return [
    kept.map((a) => pointAt(from.path, a)),
    kept.map((a) => pointAt(to.path, carryArc(from, to, a))),
  ];
}

/** The zone's rings (outer, islands, holes; a rect's four corners), piece-local mm. */
function zoneRings(source: PieceFuseSpec): PtMm[][] {
  const zone = source.zone;
  if (!zone) return [];
  if ('rect' in zone) {
    const [ax, ay, bx, by] = zone.rect;
    return [
      [
        { x: ax, y: ay },
        { x: bx, y: ay },
        { x: bx, y: by },
        { x: ax, y: by },
      ],
    ];
  }
  if (!('spline' in zone)) return [];
  return [zone.spline, ...zone.islands, ...zone.holes]
    .map((spline) => flattenSpline(spline.points))
    .filter((ring) => ring.length >= 3);
}

function densified(points: readonly PtMm[], closed: boolean): PtMm[] {
  const out: PtMm[] = [];
  const n = points.length;
  if (n === 1) return [points[0]];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const k = Math.max(1, Math.ceil(dist(a, b) / RELY_STEP_MM));
    for (let s = 0; s < k; s++)
      out.push({ x: a.x + ((b.x - a.x) * s) / k, y: a.y + ((b.y - a.y) * s) / k });
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** The mark lies inside a zone ring or within RELY_MM of one. */
function nearZone(points: readonly PtMm[], closed: boolean, rings: readonly PtMm[][]): boolean {
  if (!points.length) return false;
  const dense = densified(points, closed);
  return rings.some(
    (ring) =>
      dense.some((p) => pointInRing(p, ring) || distanceToPolyline(p, ring, true) <= RELY_MM) ||
      ring.some((q) => distanceToPolyline(q, points, closed) <= RELY_MM),
  );
}

/** Where a map pair sends a point lying on its line (within SHARED_MM), or null. */
function twinOn(pair: GivenLinePairs[number], p: PtMm): PtMm | null {
  const [a, b, closed] = pair;
  let best: PtMm | null = null;
  let bestD = SHARED_MM;
  for (let i = 0; i < (closed ? a.length : a.length - 1); i++) {
    const j = (i + 1) % a.length;
    const dx = a[j].x - a[i].x;
    const dy = a[j].y - a[i].y;
    const l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, ((p.x - a[i].x) * dx + (p.y - a[i].y) * dy) / l)) : 0;
    const d = Math.hypot(p.x - a[i].x - t * dx, p.y - a[i].y - t * dy);
    if (d <= bestD) {
      bestD = d;
      best = { x: b[i].x + (b[j].x - b[i].x) * t, y: b[i].y + (b[j].y - b[i].y) * t };
    }
  }
  return best;
}

/**
 * An inferred pair with a point on a map pair's line that it sends elsewhere than the map does
 * (a line ending on a traced line, followed to the wrong twin): the traced line wins.
 */
function contradicts(from: readonly PtMm[], to: readonly PtMm[], own: GivenLinePairs): boolean {
  return from.some((p, k) =>
    own.some((pair) => {
      const twin = twinOn(pair, p);
      return !!twin && !!to[k] && dist(twin, to[k]) > AGREE_MM;
    }),
  );
}

/** Some claimed line holds every point. */
function claimedHolds(points: readonly PtMm[], claimed: ReadonlySet<FuseInternalLine>): boolean {
  for (const line of claimed)
    if (
      line.points.length &&
      points.every((p) => distanceToPolyline(p, line.points, line.closed) <= ON_LINE_MM)
    )
      return true;
  return false;
}

export type PairCorrespondence = {
  given: GivenCorrespondence;
  /** Why the size is approximate; empty when every track the zone relies on came from the map. */
  reasons: string[];
  /** Tracks paired from the map (cut included) and left to inference, for the record. */
  mapped: number;
  inferred: number;
};

const memo = new WeakMap<
  GmPiece,
  {
    from: number;
    to: number;
    base: readonly PtMm[];
    target: readonly PtMm[];
    internals: FuseInternals | null | undefined;
    zone: PieceFuseSpec['zone'];
    out: PairCorrespondence | null;
  }[]
>();

/**
 * The map's correspondences between the pair's two sizes, for a zone carried from `baseOutline`
 * (size `from`) to `targetOutline` (size `to`), with the reasons the result is approximate. null
 * when the pair maps a size onto itself (nothing to carry).
 */
export function pairCorrespondence(
  pair: GradeMapPair,
  source: PieceFuseSpec,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals?: FuseInternals | null,
): PairCorrespondence | null {
  const known = memo.get(pair.map.piece) ?? [];
  const hit = known.find(
    (k) =>
      k.from === pair.from &&
      k.to === pair.to &&
      k.base === baseOutline &&
      k.target === targetOutline &&
      k.internals === internals &&
      k.zone === source.zone,
  );
  if (hit) return hit.out;
  const out = buildPairCorrespondence(pair, source, baseOutline, targetOutline, internals);
  memo.set(pair.map.piece, [
    ...known.slice(-15),
    {
      from: pair.from,
      to: pair.to,
      base: baseOutline,
      target: targetOutline,
      internals,
      zone: source.zone,
      out,
    },
  ]);
  return out;
}

/**
 * The map's mark tracks (internal lines, notches, drills) bound to the live lines of both sizes:
 * the pairs it carries, and why each from-size mark it knows was not carried.
 */
export type MarkBinding = {
  fromSide: Side;
  toSide: Side;
  accepted: { kind: GmTrack['kind']; fb: BoundMark; tb: BoundMark }[];
  refusedAt: ReadonlyMap<number, string>;
};

const bindings = new WeakMap<
  GmPiece,
  {
    from: number;
    to: number;
    base: readonly PtMm[];
    target: readonly PtMm[];
    internals: FuseInternals | null | undefined;
    out: MarkBinding;
  }[]
>();

/** `bindMarks` for the pair between these two outlines, reused while the inputs are the same objects. */
export function markBinding(
  pair: GradeMapPair,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): MarkBinding {
  const known = bindings.get(pair.map.piece) ?? [];
  const hit = known.find(
    (k) =>
      k.from === pair.from &&
      k.to === pair.to &&
      k.base === baseOutline &&
      k.target === targetOutline &&
      k.internals === internals,
  );
  if (hit) return hit.out;
  const out = bindMarks(
    pair,
    sideOf(baseOutline, internals?.base ?? []),
    sideOf(targetOutline, internals?.target ?? []),
  );
  bindings.set(pair.map.piece, [
    ...known.slice(-15),
    { from: pair.from, to: pair.to, base: baseOutline, target: targetOutline, internals, out },
  ]);
  return out;
}

function bindMarks(pair: GradeMapPair, fromSide: Side, toSide: Side): MarkBinding {
  const { map } = pair;
  const refusedAt = new Map<number, string>();
  const bound: MarkBinding['accepted'] = [];
  const count = (hits: Map<number, number>, idx: readonly number[]) => {
    for (const i of new Set(idx)) hits.set(i, (hits.get(i) ?? 0) + 1);
  };
  const fromHits = new Map<number, number>();
  const ontoHits = new Map<number, number>();
  for (const track of map.piece.tracks) {
    if (track.kind === 'cut' || track.kind === 'seam') continue;
    const f = nodesIn(map, track, pair.from);
    const fb = 'nodes' in f ? bindMark(track, f.nodes, fromSide) : null;
    // A track not traced in the size carried from: its lines are swept up as unknown.
    if (!fb) continue;
    count(fromHits, fb.idx);
    const t = nodesIn(map, track, pair.to);
    const tb = 'nodes' in t ? bindMark(track, t.nodes, toSide) : null;
    if (!tb || 'line' in fb !== 'line' in tb) {
      const reason = 'refused' in t ? t.refused : 'the map does not lie on a line of this size';
      for (const i of fb.idx) if (!refusedAt.has(i)) refusedAt.set(i, reason);
      continue;
    }
    count(ontoHits, tb.idx);
    bound.push({ kind: track.kind, fb, tb });
  }
  // Two tracks on one mark, in either size (two near-twin lines, one of them followed into the
  // other's place; carried back, the same two tracks share the one line they left): the map
  // contradicts itself, both go to inference. Checking both sides keeps the way back the mirror
  // of the way there.
  const accepted = bound.filter(({ fb, tb }) => {
    if (fb.idx.some((i) => fromHits.get(i)! > 1) || tb.idx.some((i) => ontoHits.get(i)! > 1)) {
      for (const i of fb.idx) refusedAt.set(i, 'another mark is traced onto the same line');
      return false;
    }
    return true;
  });
  return { fromSide, toSide, accepted, refusedAt };
}

/** A from-size point on a bound line, carried onto the twin line by the map's node fractions. */
export function carriedOn(from: BoundLine, to: BoundLine, p: PtMm): PtMm {
  return pointAt(to.path, carryArc(from, to, project(from.path, p).s));
}

function buildPairCorrespondence(
  pair: GradeMapPair,
  source: PieceFuseSpec,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): PairCorrespondence | null {
  if (pair.from === pair.to) return null;
  const { map } = pair;
  const { fromSide, toSide, accepted, refusedAt } = markBinding(
    pair,
    baseOutline,
    targetOutline,
    internals,
  );
  const rings = zoneRings(source);
  const reasons: string[] = [];
  let mapped = 0;
  let inferred = 0;
  const why = (r: { refused: string } | { nodes: PtMm[] }, side: 'from' | 'to') =>
    'refused' in r ? (side === 'from' ? `${r.refused} (in the size carried from)` : r.refused) : '';

  // The contour.
  const cut = map.piece.tracks.find((t) => t.kind === 'cut');
  let cutNodes: { from: PtMm[]; to: PtMm[] } | null = null;
  if (!cut) reasons.push('cut line: not in the grade map');
  else {
    const f = nodesIn(map, cut, pair.from);
    const t = nodesIn(map, cut, pair.to);
    if ('refused' in f || 'refused' in t)
      reasons.push(`cut line: ${'refused' in f ? why(f, 'from') : why(t, 'to')}`);
    else if (
      !fromSide.cut ||
      !toSide.cut ||
      !bindToLine(f.nodes, fromSide.cut) ||
      !bindToLine(t.nodes, toSide.cut)
    )
      reasons.push('cut line: the map does not lie on this outline');
    else cutNodes = { from: f.nodes, to: t.nodes };
  }
  if (cutNodes) mapped++;
  else inferred++;

  // Internal lines, notches, drills.
  const fromClaimed = new Set<FuseInternalLine>();
  const toClaimed = new Set<FuseInternalLine>();
  const fromIdx = new Set<number>();
  const pairs: GivenLinePairs = [];
  for (const { fb, tb } of accepted) {
    for (const i of fb.idx) fromIdx.add(i);
    for (const i of fb.idx) fromClaimed.add(fromSide.lines[i]);
    for (const i of tb.idx) toClaimed.add(toSide.lines[i]);
    mapped++;
    if ('point' in fb && 'point' in tb) {
      // A drill moves whole with its centre, every stroke of it.
      const dx = tb.point.x - fb.point.x;
      const dy = tb.point.y - fb.point.y;
      for (const i of fb.idx) {
        const stroke = fromSide.lines[i];
        if (stroke.points.length < 2) continue;
        pairs.push([
          stroke.points.map((p) => ({ x: p.x, y: p.y })),
          stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          true,
        ]);
      }
    } else if ('line' in fb && 'line' in tb) {
      const [a, b] = linePairOf(fb.line, tb.line);
      if (a.length >= 2) pairs.push([a, b, fb.line.path.closed]);
    }
  }

  // The marks of the size carried from that the map did not carry: inferred as today; near a zone
  // ring they make the size approximate.
  const marks: { kind: GmTrack['kind']; idx: number[]; points: PtMm[]; closed: boolean }[] = [
    ...fromSide.marks.internals.map((l) => ({
      kind: 'internal' as const,
      idx: [l.idx],
      points: l.path.pts,
      closed: l.path.closed,
    })),
    ...fromSide.marks.notches.map((n) => ({
      kind: 'notch' as const,
      idx: [n.idx],
      points: [n.a, n.b],
      closed: false,
    })),
    ...fromSide.marks.drills.map((d) => ({
      kind: 'drill' as const,
      idx: d.idx,
      points: [d.c],
      closed: false,
    })),
  ];
  for (const m of marks) {
    if (m.idx.some((i) => fromIdx.has(i))) continue;
    inferred++;
    if (!nearZone(m.points, m.closed, rings)) continue;
    const reason =
      m.idx.map((i) => refusedAt.get(i)).find(Boolean) ?? 'not traced between these sizes';
    reasons.push(`${KIND_WORD[m.kind]} near the zone: ${reason}`);
  }

  const given: GivenCorrespondence = {
    key: `${map.key}|${pair.from}>${pair.to}`,
    contour: cutNodes ? (b, t, sameWay) => contourNodes(cutNodes!, b, t, sameWay) : undefined,
    lines: (b, t, infer, sameWay) => {
      const [bClaimed, tClaimed] = sameWay ? [fromClaimed, toClaimed] : [toClaimed, fromClaimed];
      const own: GivenLinePairs = sameWay
        ? pairs
        : pairs.map(([from, to, closed]) => [to, from, closed]);
      const kept = infer().filter(
        ([from, to]) =>
          !claimedHolds(from, bClaimed) &&
          !claimedHolds(to, tClaimed) &&
          !contradicts(from, to, own),
      );
      return [...own, ...kept];
    },
  };
  return { given, reasons: summarized(reasons), mapped, inferred };
}

/** Distinct reasons, the first MAX_REASONS listed and the rest counted. */
export function summarized(reasons: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  const list = [...counts].map(([r, n]) => (n > 1 ? `${r} (×${n})` : r));
  return list.length > MAX_REASONS
    ? [...list.slice(0, MAX_REASONS), `${list.length - MAX_REASONS} more`]
    : list;
}

/** The cut nodes bound to the two rings the zone mapper builds between. */
function contourNodes(
  cut: { from: PtMm[]; to: PtMm[] },
  base: readonly PtMm[],
  target: readonly PtMm[],
  sameWay: boolean,
): GivenNodes | null {
  const [bn, tn] = sameWay ? [cut.from, cut.to] : [cut.to, cut.from];
  const bp = pathOf(base, true);
  const tp = pathOf(target, true);
  if (!bp || !tp || bp.pts.length !== base.length || tp.pts.length !== target.length) return null;
  const b = bindToLine(bn, bp);
  const t = bindToLine(tn, tp);
  if (!b || !t) return null;
  const corners = lineCorners(bp.pts, true, CONTOUR_CORNER_THRESHOLDS[0]).map((c) => bp.cum[c.i]);
  const half = bp.total / 2;
  const breaks = b.line.arcs.map((s) =>
    corners.some((c) => Math.abs(mod(s - c + half, bp.total) - half) <= CORNER_NODE_MM),
  );
  return { s: b.line.arcs, t: t.line.arcs, breaks };
}

/**
 * The pair's correspondences for `zoneGrade`, after telling `pair.approximate` why the size is
 * approximate (when it is). null: no pair, or one mapping a size onto itself.
 */
export function gradeMapGiven(
  pair: GradeMapPair | null | undefined,
  source: PieceFuseSpec,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals?: FuseInternals | null,
): GivenCorrespondence | null {
  if (!pair) return null;
  let out: PairCorrespondence | null = null;
  try {
    out = pairCorrespondence(pair, source, baseOutline, targetOutline, internals);
  } catch (e) {
    // A map that cannot be read is no map: the size is carried as without one, and says so.
    pair.approximate?.([`grade map unreadable: ${e instanceof Error ? e.message : String(e)}`]);
    return null;
  }
  if (out?.reasons.length) pair.approximate?.(out.reasons);
  return out?.given ?? null;
}
