// A1 — one piece → its sewing contour cut into edges (port of probe/seamgraph.mjs, 09.10).
//
// The contour is resampled at SKELETON.resampleMm, corners are local maxima of the turn over a
// ±cornerWinMm window above SKELETON.cornerDeg, and an edge is the run between two corners. Notches
// (layer 4, start of the 2-point path on the line) are snapped to the resample and deduped along
// the contour. Everything inside is millimetres; PieceDTO is centimetres and converts here, once.

import type { PieceDTO } from 'lib/nesting/types';
import {
  SKELETON,
  type Edge,
  type Mm,
  type PieceGeom,
  type Pt2,
  type SkeletonPieceInput,
} from '../types';
import { liningByName } from '../names';
import { handOf } from './twins';

const MM_PER_CM = 10;
/** Two corner candidates closer than this (in resample steps) are one corner. Probe value. */
const CORNER_MERGE_STEPS = 8;
/** An edge shorter than this is a corner artefact, not an edge. */
const MIN_EDGE_MM = 8;
/** A notch further than this from the sewing line is not this contour's notch. */
const NOTCH_SNAP_MM = 14;
/** One logical notch: CLO writes it on the cut line and on the seam line. */
const NOTCH_DEDUPE_MM = 4;
/**
 * A notch this close to an edge end marks the corner, not the edge: within the corner window its
 * side is a coin toss (SS26-005 sleeve: a notch 5 mm from the corner made one of two equal seam
 * edges «1 notch vs 0»). Probe value was 3; = SKELETON.cornerWinMm.
 */
const NOTCH_END_GUARD_MM = SKELETON.cornerWinMm;
/** Turn of an edge is summed away from its corners (steps) with this half-window. */
const TURN_GUARD_STEPS = 8;
const TURN_WIN_STEPS = 3;
/** chord / length above this = a straight edge (rectangle test). */
const RECT_STRAIGHT = 0.995;
/** Mode-B files: the seam loop on layer 8 must be at least this share of the cut area. */
const SEAM_LOOP_MIN_SHARE = 0.3;
/** Drills: closed layer-8/13 loops no bigger than this. */
const DRILL_MAX_MM = 12;

const NOTCH_LAYER = '4';
const CUT_LAYER = '1';
const SEAM_LAYER = '14';
const INTERNAL_LAYER = '8';
const DRILL_LAYERS = new Set([INTERNAL_LAYER, '13']);

// ── small geometry ──────────────────────────────────────────────────────────────────────────

export function dist(a: Pt2, b: Pt2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Shoelace, signed: positive = CCW. */
export function signedArea(pts: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function polyLength(pts: readonly Pt2[], closed: boolean): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) len += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 1) len += dist(pts[pts.length - 1], pts[0]);
  return len;
}

/** Closed contour → points ~`step` apart, CCW, consecutive duplicates dropped. */
export function resample(pts: readonly Pt2[], step: Mm): Pt2[] {
  const p = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]) > 1e-6);
  if (p.length > 1 && dist(p[0], p[p.length - 1]) <= 1e-6) p.pop();
  if (signedArea(p) < 0) p.reverse();
  const out: Pt2[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const k = Math.max(1, Math.round(dist(a, b) / step));
    for (let j = 0; j < k; j++) {
      out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
  }
  return out;
}

/** Turn at `i` over ±w samples, degrees; + = left turn (convex on a CCW contour). */
export function angleAt(pts: readonly Pt2[], i: number, w: number): number {
  const n = pts.length;
  const a = pts[(i - w + n) % n];
  const b = pts[i];
  const c = pts[(i + w) % n];
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  return (Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y) * 180) / Math.PI;
}

export function findCorners(pts: readonly Pt2[]): number[] {
  const n = pts.length;
  const w = Math.max(1, Math.round(SKELETON.cornerWinMm / SKELETON.resampleMm));
  const ang = pts.map((_, i) => angleAt(pts, i, w));
  const cand: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.abs(ang[i]);
    if (a < SKELETON.cornerDeg) continue;
    let isMax = true;
    for (let d = -w; d <= w && isMax; d++) {
      if (d !== 0 && Math.abs(ang[(i + d + n) % n]) > a) isMax = false;
    }
    if (isMax) cand.push(i);
  }
  const merged: number[] = [];
  for (const c of cand) {
    if (merged.length && c - merged[merged.length - 1] < CORNER_MERGE_STEPS) continue;
    merged.push(c);
  }
  if (merged.length > 1 && n - merged[merged.length - 1] + merged[0] < CORNER_MERGE_STEPS) {
    merged.pop();
  }
  return merged;
}

function nearestIdx(pts: readonly Pt2[], p: Pt2): { idx: number; d: number } {
  let idx = 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const di = dist(pts[i], p);
    if (di < d) {
      d = di;
      idx = i;
    }
  }
  return { idx, d };
}

// ── which contour is the sewing line ────────────────────────────────────────────────────────

type Loop = { layer: string; pts: Pt2[]; areaMm2: number };

const toMm = (pts: readonly { x: number; y: number }[]): Pt2[] =>
  pts.map((p) => [p.x * MM_PER_CM, p.y * MM_PER_CM]);

function loopsOf(piece: PieceDTO): Loop[] {
  const loops: Loop[] = [];
  const push = (layer: string, pts: Pt2[]) => {
    if (pts.length >= 3) loops.push({ layer, pts, areaMm2: Math.abs(signedArea(pts)) });
  };
  push(piece.layer ?? '', toMm(piece.poly));
  for (const p of piece.inner ?? []) if (p.closed) push(p.layer, toMm(p.pts));
  return loops;
}

const largest = (loops: Loop[]): Loop | undefined =>
  loops.reduce<Loop | undefined>((m, l) => (!m || l.areaMm2 > m.areaMm2 ? l : m), undefined);

/**
 * The sewing line of a piece, mm, in the PieceDTO frame. CLO writes the cut line on layer 1 and the
 * sewing line on layer 14 (mode A); when the two coincide the sewing line is the big closed loop on
 * layer 8 (mode B). Without either the piece's own contour is used. Seams are matched on the SEWING
 * line: cut-line corners are mitred by the allowance, so their lengths do not pair.
 */
export function seamLoopOf(piece: PieceDTO): { pts: Pt2[]; layer: string } {
  const loops = loopsOf(piece);
  const own = loops[0];
  const cut = largest(loops.filter((l) => l.layer === CUT_LAYER));
  let seam = largest(loops.filter((l) => l.layer === SEAM_LAYER));
  if (cut && seam && Math.abs(cut.areaMm2 - seam.areaMm2) < 1) {
    const l8 = loops.filter(
      (l) => l.layer === INTERNAL_LAYER && l.areaMm2 > SEAM_LOOP_MIN_SHARE * cut.areaMm2,
    );
    seam = largest(l8) ?? seam;
  }
  const pick = seam ?? cut ?? own;
  return { pts: pick?.pts ?? [], layer: pick?.layer ?? '' };
}

/**
 * One block usually yields one PieceDTO PER LAYER (dxf/pieces.ts). A caller that holds all of them
 * (the card's DXF index does) passes them here and gets one piece whose `poly` is the sewing line and
 * whose `inner` is the union of every candidate's inner geometry — needed for mode-B files, where the
 * layer-8 sewing loop exists only as its own candidate and that candidate's inner lacks the layer-8
 * drills.
 */
export function seamPieceOf(candidates: readonly PieceDTO[]): PieceDTO | null {
  if (candidates.length === 0) return null;
  const byLayer = (layer: string) =>
    candidates
      .filter((c) => (c.layer ?? '') === layer)
      .reduce<PieceDTO | undefined>((m, c) => (!m || c.areaCm2 > m.areaCm2 ? c : m), undefined);
  const cut = byLayer(CUT_LAYER);
  let seam = byLayer(SEAM_LAYER);
  if (cut && seam && Math.abs(cut.areaCm2 - seam.areaCm2) < 0.01) {
    const l8 = candidates.filter(
      (c) => c.layer === INTERNAL_LAYER && c.areaCm2 > SEAM_LOOP_MIN_SHARE * cut.areaCm2,
    );
    seam =
      l8.reduce<PieceDTO | undefined>((m, c) => (!m || c.areaCm2 > m.areaCm2 ? c : m), undefined) ??
      seam;
  }
  const base = seam ?? cut ?? candidates[0];
  // Inner geometry of every candidate, re-expressed in the base frame (each candidate is normalized
  // to its OWN bbox; originX/Y put them back on one sheet).
  const ox = base.originX ?? 0;
  const oy = base.originY ?? 0;
  const inner: NonNullable<PieceDTO['inner']> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const dx = (c.originX ?? 0) - ox;
    const dy = (c.originY ?? 0) - oy;
    const extra = c === base ? [] : [{ layer: c.layer ?? '', closed: true, pts: c.poly }];
    for (const p of [...(c.inner ?? []), ...extra]) {
      if (p.pts.length === 0) continue;
      const pts = p.pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      const key = `${p.layer}|${p.closed}|${pts.length}|${pts[0].x.toFixed(3)},${pts[0].y.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The base contour itself must not come back as an inner loop (its layer's small loops —
      // drills on layer 8 in mode B — must).
      if (
        p.closed &&
        c !== base &&
        p.layer === (base.layer ?? '') &&
        loopAreaCm2(p.pts) > SEAM_LOOP_MIN_SHARE * base.areaCm2
      ) {
        continue;
      }
      inner.push({ layer: p.layer, closed: p.closed, pts });
    }
  }
  return { ...base, inner };
}

function loopAreaCm2(pts: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/** Notch anchor points (start of each layer-4 path), mm. */
function notchPoints(piece: PieceDTO): Pt2[] {
  const out: Pt2[] = [];
  for (const p of piece.inner ?? []) {
    if (p.layer !== NOTCH_LAYER || p.pts.length === 0) continue;
    out.push([p.pts[0].x * MM_PER_CM, p.pts[0].y * MM_PER_CM]);
  }
  return out;
}

/** Drill centres (small closed loops on the internal / drill layers), mm. */
export function drillPoints(piece: PieceDTO): Pt2[] {
  const out: Pt2[] = [];
  for (const p of piece.inner ?? []) {
    if (!p.closed || !DRILL_LAYERS.has(p.layer) || p.pts.length < 3) continue;
    const pts = toMm(p.pts);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (x1 - x0 > DRILL_MAX_MM || y1 - y0 > DRILL_MAX_MM) continue;
    const c: Pt2 = [(x0 + x1) / 2, (y0 + y1) / 2];
    if (!out.some((q) => dist(q, c) < 1)) out.push(c);
  }
  return out;
}

// ── A1 ──────────────────────────────────────────────────────────────────────────────────────

export function segmentPiece(input: SkeletonPieceInput): PieceGeom {
  const { pts: loop } = seamLoopOf(input.piece);
  const rs = loop.length >= 3 ? resample(loop, SKELETON.resampleMm) : [];
  const n = rs.length;
  const corners = n ? findCorners(rs) : [];

  // Notches: snapped to the resample, one per ±NOTCH_DEDUPE_MM along the contour.
  const dedupe = Math.round(NOTCH_DEDUPE_MM / SKELETON.resampleMm);
  const notchIdx: number[] = [];
  for (const np of n ? notchPoints(input.piece) : []) {
    const pr = nearestIdx(rs, np);
    if (pr.d > NOTCH_SNAP_MM) continue;
    const dup = notchIdx.some((i) => {
      const d = Math.abs(i - pr.idx);
      return d <= dedupe || n - d <= dedupe;
    });
    if (!dup) notchIdx.push(pr.idx);
  }
  notchIdx.sort((a, b) => a - b);

  const edges: Edge[] = [];
  const cs = corners.length ? corners : n ? [0] : [];
  const guard = NOTCH_END_GUARD_MM / SKELETON.resampleMm;
  for (let k = 0; k < cs.length; k++) {
    const s = cs[k];
    const e = cs[(k + 1) % cs.length];
    const span = e > s ? e - s : n - s + e;
    const pts: Pt2[] = [];
    for (let j = 0; j <= span; j++) pts.push(rs[(s + j) % n]);
    const lenMm = polyLength(pts, false);
    if (lenMm < MIN_EDGE_MM) continue;
    const cum: number[] = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + dist(pts[j], pts[j - 1]));
    let turnDeg = 0;
    for (let j = TURN_GUARD_STEPS; j < pts.length - TURN_GUARD_STEPS; j++) {
      turnDeg += angleAt(pts, j, TURN_WIN_STEPS);
    }
    const notchesMm = notchIdx
      .map((i) => (i - s + n) % n)
      .filter((rel) => rel > guard && rel < span - guard)
      .sort((a, b) => a - b)
      .map((rel) => cum[rel]);
    edges.push({
      id: `${input.pieceKey}#${k}`,
      pieceKey: input.pieceKey,
      k,
      s,
      e,
      pts,
      lenMm,
      chordMm: dist(pts[0], pts[pts.length - 1]),
      turnDeg,
      notchesMm,
      kind: 'edge',
    });
  }

  const rect = corners.length === 4 && edges.every((e) => e.chordMm / e.lenMm > RECT_STRAIGHT);
  return {
    pieceKey: input.pieceKey,
    name: input.name,
    hand: handOf(input.name, input.piece) ?? handOf(input.pieceKey, input.piece),
    // No cloth on the card: a name that says «lining» is lining (the same rule lane B reads).
    cloth: input.cloth ?? (liningByName(input.name) ? 'lining' : null),
    rs,
    corners,
    notchIdx,
    edges,
    rect,
    areaMm2: Math.abs(signedArea(loop)),
    perimMm: polyLength(loop, true),
    twinOf: [],
  };
}
