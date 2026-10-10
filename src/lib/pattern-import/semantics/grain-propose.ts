// A1 · a grainline the drawing does not prove, proposed from what it does show.
//
// D3: a wrong grain silently rotates the piece in the marker and the gate cannot see it, so
// everything here is a PROPOSAL — shown on the details step, applied only by the operator's click
// ("accept N proposed grainlines"). Order of trust:
//   1. a drawn line with exactly one evidence (features.ts `origin: 'proposed'`) — the drawing's;
//   2. the fold line of an unfolded piece (a CB / CF fold is cut on the lengthwise grain);
//   3. the mirror axis of a piece drawn whole (sleeve, collar, a back drawn complete);
//   4. parallel to a straight edge ≥ 30 % of the perimeter (CF / CB drawn straight);
//   5. the long axis of a strip (aspect ≥ 3: waistband, facing, strap, binding);
//   6. the long axis of an elongated piece (aspect ≥ 1.4: a back, a front, a sleeve — the
//      lengthwise grain runs along the garment's length; a hem edge is the longest STRAIGHT edge
//      of a back with a shaped CB, and taking it turned redcafe's спинка by 90°);
//   7. else parallel to the longest straight edge.
// An axis (5, 6) is snapped to a straight side within 10°, else to the sheet's axis within 7°
// (pieces are mostly laid on the sheet along their grain).
// The line is placed through the piece (its centroid, else its widest chord) at 70 % of the chord.

import { mirrorAxis, principalAngle, resample } from '../ai/geom';
import type { GrainEvidenceKind, GrainFeature, GrainProposal, PtMm } from '../types';
import { foldEdges } from './fold';
import { centroidOf, lineHits, perimeter, pointInPolygon } from './geom';

export const PROPOSE_EDGE_SHARE = 0.3;
export const PROPOSE_STRIP_ASPECT = 3;
export const PROPOSE_LONG_ASPECT = 1.4;
const CHORD_SHARE = 0.7;
const EDGE_MIN_MM = 30;

/** Words for the pill: why a drawn line with one evidence is only proposed. */
const DRAWN_WHY: Partial<Record<GrainEvidenceKind, string>> = {
  arrowheads: 'line with arrowheads',
  word: 'line by a grain word',
  ungraded: 'line in every size',
  dashes: 'dashed line',
};

export function drawnProposal(g: GrainFeature): GrainProposal & { evidence: GrainEvidenceKind[] } {
  const ev = g.evidence ?? [];
  return { a: g.a, b: g.b, why: DRAWN_WHY[ev[0]] ?? 'drawn line', evidence: [...ev] };
}

/**
 * The chord of `outer` along direction `u` through `p` (the stretch inside that contains p, else
 * the longest), shrunk to its middle `CHORD_SHARE`. Null when the line misses the outline.
 */
function chordThrough(outer: readonly PtMm[], p: PtMm, u: PtMm): [PtMm, PtMm] | null {
  const hits = lineHits(p, u, outer);
  if (hits.length < 2) return null;
  let lo = NaN;
  let hi = NaN;
  let best = -1;
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const [t0, t1] = [hits[i], hits[i + 1]];
    const mid = (t0 + t1) / 2;
    if (!pointInPolygon({ x: p.x + u.x * mid, y: p.y + u.y * mid }, outer)) continue;
    const contains = t0 <= 0 && t1 >= 0;
    const score = (contains ? 1e9 : 0) + (t1 - t0);
    if (score > best) [best, lo, hi] = [score, t0, t1];
  }
  if (!(hi - lo > 1)) return null;
  const pad = ((hi - lo) * (1 - CHORD_SHARE)) / 2;
  return [
    { x: p.x + u.x * (lo + pad), y: p.y + u.y * (lo + pad) },
    { x: p.x + u.x * (hi - pad), y: p.y + u.y * (hi - pad) },
  ];
}

const unit = (a: PtMm, b: PtMm): PtMm => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

/** The geometric proposal for one outline (the cut frame of the size shown), or null. */
export function proposeGrain(
  outer: readonly PtMm[],
  opts: { fold?: [PtMm, PtMm] | null } = {},
): (GrainProposal & { evidence: GrainEvidenceKind[] }) | null {
  if (outer.length < 3) return null;
  const c = centroidOf(outer);
  const out = (u: PtMm, why: string, through = c) => {
    const ch = chordThrough(outer, through, u);
    return ch ? { a: ch[0], b: ch[1], why, evidence: ['geometry' as const] } : null;
  };

  // 2. the fold line of an unfolded piece: the line itself (interior once unfolded)
  if (opts.fold) {
    const [a, b] = opts.fold;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = out(unit(a, b), 'fold line', m);
    if (r) return r;
  }

  // 3. mirror axis of a piece drawn whole
  const ax = mirrorAxis(outer);
  if (ax) {
    const r = out({ x: Math.cos(ax.angle), y: Math.sin(ax.angle) }, 'symmetry axis', ax.c);
    if (r) return r;
  }

  // 4. parallel to a long straight edge (CF / CB drawn straight)
  const per = perimeter(outer);
  const edges = foldEdges(outer, EDGE_MIN_MM);
  const long = edges[0];
  if (long && long.lenMm >= PROPOSE_EDGE_SHARE * per) {
    const r = out(unit(long.a, long.b), 'parallel to the straight edge');
    if (r) return r;
  }

  // 5. a strip: its long axis
  const s = resample(outer, 96);
  const pa = principalAngle(s, c);
  const u = { x: Math.cos(pa), y: Math.sin(pa) };
  let [lo, hi, wlo, whi] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of s) {
    const t = (p.x - c.x) * u.x + (p.y - c.y) * u.y;
    const w = (p.x - c.x) * -u.y + (p.y - c.y) * u.x;
    [lo, hi, wlo, whi] = [Math.min(lo, t), Math.max(hi, t), Math.min(wlo, w), Math.max(whi, w)];
  }
  const aspect = (hi - lo) / Math.max(1e-6, whi - wlo);
  // the axis snapped: a straight side (≤ 10° off, ≥ a quarter of the length), else the sheet's
  // own axis (≤ 7° off), else as measured
  const snapped = (): PtMm => {
    const side = edges.find(
      (e) =>
        e.lenMm >= 0.25 * (hi - lo) &&
        Math.abs(unit(e.a, e.b).x * u.x + unit(e.a, e.b).y * u.y) >= Math.cos(Math.PI / 18),
    );
    if (side) return unit(side.a, side.b);
    const cos7 = Math.cos((7 * Math.PI) / 180);
    if (Math.abs(u.x) >= cos7) return { x: Math.sign(u.x), y: 0 };
    if (Math.abs(u.y) >= cos7) return { x: 0, y: Math.sign(u.y) };
    return u;
  };
  if (aspect >= PROPOSE_STRIP_ASPECT) {
    const r = out(snapped(), 'strip axis');
    if (r) return r;
  }

  // 6. an elongated piece: its long axis
  if (aspect >= PROPOSE_LONG_ASPECT) {
    const r = out(snapped(), 'long axis');
    if (r) return r;
  }

  // 7. the longest straight edge
  if (long) return out(unit(long.a, long.b), 'longest straight edge');
  return null;
}
