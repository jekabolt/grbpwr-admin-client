// CONTOUR SIGNATURE — binds a ManifestBlock to the cut line actually drawn (Codex F14 R2).
//
// The C3 binding compared bbox, position, area and feature counts. Those are not a shape: the
// triangle (0,0),(100,0),(0,100) and (0,0),(100,100),(0,100) agree on all of them. The signature
// is the cut ring itself, coarsened so that it fits the 999 prologue:
//
//   ring  → relative to its own bbox min corner (INSERT copies are translated, never reshaped)
//         → Douglas–Peucker on the CLOSED ring, eps from CONTOUR_SIG_EPS_MM, grown ×1.5 until at
//           most `contourSigCap(blocks in the file)` vertices are left (8..40; every kept vertex IS
//           a ring vertex)
//         → quantised to CONTOUR_SIG_Q_MM (0.1 mm) integers, delta-coded: [x0, y0, dx1, dy1, …]
//   dev   = max distance (in quanta, rounded up) from any ring vertex to the QUANTISED chord that
//           replaced it. DP assigns every ring vertex to exactly one chord, and the distance from a
//           point moving along a ring edge to one segment is convex, so every point of the ring —
//           not only its vertices — lies within `dev` of the signature polyline.
//
// THE CHECK (reader, `contourSigProblem`) is a two-sided Hausdorff bound, independent of the ring's
// start vertex and orientation (it compares point sets, nothing is indexed):
//   forward   every signature vertex lies within TOL of the drawn ring
//             (it is a ring vertex moved by ≤ 0.0707 mm of quantisation);
//   backward  every drawn vertex and every drawn edge midpoint lies within dev + TOL of the
//             signature polyline (the drawn ring is the written ring, so the bound above holds).
// TOL covers quantisation (≤ √2·Q/2 = 0.0707 mm) plus the writer → DXF text → card parser round
// trip (`toFixed(6)` mm, the parser's Clipper grid of 1e-4 cm = 0.001 mm, `stripDegenerate` of
// 0.001 mm, collinear vertices dropped — which moves no point of the ring). 0.15 mm leaves > 2×
// headroom over the measured worst case (see the F14f report).
//
// Main-thread safe and dependency-free (manifest/ contract): plain arithmetic only.
import type { ContourSignature, PtMm } from '../types';

/** One signature unit, mm. Coordinates and `dev` are integers in these units. */
export const CONTOUR_SIG_Q_MM = 0.1;
/** First DP tolerance, mm. */
export const CONTOUR_SIG_EPS_MM = 0.5;
/** Vertex cap per block — the validator's bound too. */
export const CONTOUR_SIG_MAX_PTS = 40;
/** Vertex floor per block when a big sheet shares the file budget. */
export const CONTOUR_SIG_MIN_PTS = 8;
/**
 * Signature vertices per FILE. The 999 prologue must stay well inside the backend's 64 KB DXF
 * sniff window (bucket/pattern.go isDXF; G14 warns at 48 KB): measured ≈ 5.9 prologue bytes per
 * vertex + ≈ 40 per block, so 3200 vertices cost ≈ 19 KB on top of the manifest itself.
 */
export const CONTOUR_SIG_FILE_PTS = 3200;

/** Per-block vertex cap for a file of `blocks` blocks. */
export function contourSigCap(blocks: number): number {
  const share = Math.floor(CONTOUR_SIG_FILE_PTS / Math.max(1, blocks));
  return Math.max(CONTOUR_SIG_MIN_PTS, Math.min(CONTOUR_SIG_MAX_PTS, share));
}
/** Reader slack on top of quantisation, mm (see the header). */
export const CONTOUR_SIG_TOL_MM = 0.15;
/** Validator bounds: a garment piece is far inside them; they keep a hostile manifest bounded. */
export const CONTOUR_SIG_MAX_DEV = 10_000; // quanta = 1 m
export const CONTOUR_SIG_MAX_COORD = 100_000_000; // quanta = 10 km

type Seg = { a: PtMm; b: PtMm };

function distToSeg(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function ringSegs(ring: readonly PtMm[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < ring.length; i++) out.push({ a: ring[i], b: ring[(i + 1) % ring.length] });
  return out;
}

function distToSegs(p: PtMm, segs: readonly Seg[]): number {
  let best = Infinity;
  for (const s of segs) {
    const d = distToSeg(p, s.a, s.b);
    if (d < best) best = d;
  }
  return best;
}

/** Indices DP keeps on the open run pts[i..j] (both ends kept by the caller). */
function dpRun(pts: readonly PtMm[], i: number, j: number, eps: number, keep: boolean[]) {
  const stack: [number, number][] = [[i, j]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let fd = eps;
    for (let k = a + 1; k < b; k++) {
      const d = distToSeg(pts[k], pts[a], pts[b]);
      if (d > fd) {
        fd = d;
        far = k;
      }
    }
    if (far < 0) continue;
    keep[far] = true;
    stack.push([a, far], [far, b]);
  }
}

/** DP on a closed ring: anchors are vertex 0 and the vertex farthest from it. */
function dpClosed(ring: readonly PtMm[], eps: number): number[] {
  const n = ring.length;
  if (n <= 3) return ring.map((_, i) => i);
  let far = 1;
  let fd = -1;
  for (let k = 1; k < n; k++) {
    const d = Math.hypot(ring[k].x - ring[0].x, ring[k].y - ring[0].y);
    if (d > fd) {
      fd = d;
      far = k;
    }
  }
  const ext = [...ring, ring[0]]; // index n = vertex 0 again
  const keep = new Array<boolean>(n + 1).fill(false);
  keep[0] = keep[far] = keep[n] = true;
  dpRun(ext, 0, far, eps, keep);
  dpRun(ext, far, n, eps, keep);
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(k);
  return out;
}

function cleanRing(ring: readonly PtMm[]): PtMm[] {
  const out: PtMm[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push(p);
  }
  while (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= 1e-9) out.pop();
    else break;
  }
  return out;
}

function relToMin(ring: readonly PtMm[]): PtMm[] {
  let minX = Infinity;
  let minY = Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  return ring.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/**
 * Writer side: the signature of one cut ring (mm, any frame, any start vertex, either winding).
 * null for a ring of fewer than 3 distinct vertices — the block then goes unsigned, and the card
 * distrusts the manifest (fail-safe) instead of the writer throwing.
 */
export function contourSignature(
  ring: readonly PtMm[],
  maxPts: number = CONTOUR_SIG_MAX_PTS,
): ContourSignature | null {
  const cap = Math.max(3, Math.min(CONTOUR_SIG_MAX_PTS, Math.floor(maxPts)));
  const rel = relToMin(cleanRing(ring));
  if (rel.length < 3 || !rel.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    return null;
  let eps = CONTOUR_SIG_EPS_MM;
  let idx = dpClosed(rel, eps);
  while (idx.length > cap) {
    eps *= 1.5;
    idx = dpClosed(rel, eps);
  }
  const Q = CONTOUR_SIG_Q_MM;
  const q = idx.map((i) => ({ x: Math.round(rel[i].x / Q), y: Math.round(rel[i].y / Q) }));
  // dev over the QUANTISED chords: each ring vertex against the chord DP replaced it with
  let dev = 0;
  for (let k = 0; k < idx.length; k++) {
    const i0 = idx[k];
    const i1 = k + 1 < idx.length ? idx[k + 1] : idx[0] + rel.length;
    const a = { x: q[k].x * Q, y: q[k].y * Q };
    const b = { x: q[(k + 1) % q.length].x * Q, y: q[(k + 1) % q.length].y * Q };
    for (let j = i0; j <= i1; j++) {
      const d = distToSeg(rel[j % rel.length], a, b);
      if (d > dev) dev = d;
    }
  }
  const pts: number[] = [q[0].x, q[0].y];
  for (let k = 1; k < q.length; k++) pts.push(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
  return { dev: Math.ceil(dev / Q - 1e-9), pts };
}

/** The signature ring in mm, relative to the block's bbox min corner. */
export function decodeContourSig(sig: ContourSignature): PtMm[] {
  const out: PtMm[] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k + 1 < sig.pts.length; k += 2) {
    x = k === 0 ? sig.pts[0] : x + sig.pts[k];
    y = k === 0 ? sig.pts[1] : y + sig.pts[k + 1];
    out.push({ x: x * CONTOUR_SIG_Q_MM, y: y * CONTOUR_SIG_Q_MM });
  }
  return out;
}

/** Validator half: why `x` is not a well-formed bounded signature, or null. */
export function contourSigShapeProblem(x: unknown): string | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return 'not an object';
  const o = x as Record<string, unknown>;
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
  if (!isInt(o.dev) || o.dev < 0 || o.dev > CONTOUR_SIG_MAX_DEV)
    return `dev is not an integer in [0, ${CONTOUR_SIG_MAX_DEV}]`;
  const p = o.pts;
  if (!Array.isArray(p) || p.length % 2 !== 0 || p.length < 6 || p.length > 2 * CONTOUR_SIG_MAX_PTS)
    return `pts is not an even list of 3..${CONTOUR_SIG_MAX_PTS} points`;
  let x0 = 0;
  let y0 = 0;
  for (let k = 0; k < p.length; k++) {
    const v = p[k];
    if (!isInt(v)) return `pts[${k}] is not an integer`;
    if (k % 2 === 0) x0 = k === 0 ? v : x0 + v;
    else y0 = k === 1 ? v : y0 + v;
    const c = k % 2 === 0 ? x0 : y0;
    // relative to the ring's own bbox min corner: never below 0 (rounding of ≥ 0 stays ≥ 0)
    if (c < 0 || c > CONTOUR_SIG_MAX_COORD) return `pts[${k}] leaves [0, ${CONTOUR_SIG_MAX_COORD}]`;
  }
  return null;
}

export type ContourSigMatch = {
  /** max distance from a signature vertex to the drawn ring, mm */
  forwardMm: number;
  /** max distance from a drawn vertex / edge midpoint to the signature polyline, mm */
  backwardMm: number;
  /** the backward bound this signature allows, mm (dev + TOL) */
  backwardLimitMm: number;
};

/** Both Hausdorff halves of `drawn` (mm, any frame/start/winding) against the signature. */
export function contourSigMatch(sig: ContourSignature, drawn: readonly PtMm[]): ContourSigMatch {
  const d = relToMin(cleanRing(drawn));
  const s = decodeContourSig(sig);
  const dSegs = ringSegs(d);
  const sSegs = ringSegs(s);
  let forwardMm = 0;
  for (const p of s) forwardMm = Math.max(forwardMm, distToSegs(p, dSegs));
  let backwardMm = 0;
  for (const seg of dSegs) {
    backwardMm = Math.max(backwardMm, distToSegs(seg.a, sSegs));
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    backwardMm = Math.max(backwardMm, distToSegs(mid, sSegs));
  }
  return {
    forwardMm,
    backwardMm,
    backwardLimitMm: sig.dev * CONTOUR_SIG_Q_MM + CONTOUR_SIG_TOL_MM,
  };
}

/** Reader side: why the drawn cut ring is not the one the manifest signed, or null. */
export function contourSigProblem(sig: ContourSignature, drawn: readonly PtMm[]): string | null {
  if (drawn.length < 3) return 'no cut ring to compare';
  const m = contourSigMatch(sig, drawn);
  if (m.forwardMm > CONTOUR_SIG_TOL_MM)
    return `outline differs from the signed one by ${m.forwardMm.toFixed(1)} mm`;
  if (m.backwardMm > m.backwardLimitMm)
    return `outline strays ${m.backwardMm.toFixed(1)} mm from the signed one (allowed ${m.backwardLimitMm.toFixed(1)})`;
  return null;
}
