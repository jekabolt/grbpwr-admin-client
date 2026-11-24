// Drawn stretches in the DXF: the parts of a written cut line that were not read from the PDF but
// drawn from the grade (`grade-draw`) or filled across a hole from it (`grade-fill`).
//
// Owner decision (12 Nov 2026, «Слой + текст», «Оба вида»): the workshop must SEE them in any CAD —
//   • a copy of each stretch on its own layer `GRADE_DRAWN` (orange, thick in R2000), laid exactly ON
//     the written cut line: the sub-arc of the cut ring between the stretch's ends. Layer 1 stays one
//     closed polyline (the card, CLO and our reader count pieces by it) — the copy is a marker only;
//   • an `Annotation:` / `ANNOTATION:` word on the piece: «DRAWN FROM GRADE 34MM (22-24)».
// Colour: not red — CLO's cut layer 1 IS red (ACI 1), a red copy on top of it would vanish; orange
// (ACI 30) is no layer's colour in either dialect.
//
// No reader takes `GRADE_DRAWN` as geometry: the card and the gate read layers 1/4/7/8/14, our DXF
// adapter reads 1/14 as the boundary. An unknown layer in AAMA is ignored by the other CADs.

import type { Affine, DerivedEdge, PieceSizeSpec, PtMm } from '../types';
import { applyAffine, closestOnPolyline, dist } from './geom';

export const DRAWN_LAYER = 'GRADE_DRAWN';
export const DRAWN_ACI = 30;
/** R2000 lineweight of the layer, 1/100 mm. */
export const DRAWN_LINEWEIGHT = 50;
/** An end of a stretch farther than this from the written cut line is not on it: skipped, warned. */
export const DRAWN_ON_CUT_MM = 2;
/** Below this the stretch is a dot, not a mark (and the text says nothing). */
export const DRAWN_MIN_MM = 0.5;
/**
 * The marker never closes: the card parser chains every layer into loops on its own (nesting
 * dxf/pieces.ts, closing gaps < 5 · tolChain = 2.5 mm), and a closed GRADE_DRAWN ring would be a
 * second piece in the block. When the stretches cover the whole cut, this much is left unmarked.
 */
export const DRAWN_OPEN_GAP_MM = 6;

const KINDS = new Set(['grade-draw', 'grade-fill']);

/** Arc-length position of a point projected onto a closed ring (and how far off it was). */
function positionOn(ring: readonly PtMm[], cum: readonly number[], p: PtMm) {
  const c = closestOnPolyline(p, ring, true);
  return { s: cum[c.seg] + dist(ring[c.seg], c.q), q: c.q, d: c.d };
}

/** The ring from arc position s0 forward to s1 (wrapping), endpoints included. */
function subArc(ring: readonly PtMm[], cum: readonly number[], L: number, s0: number, s1: number) {
  const n = ring.length;
  const len = (((s1 - s0) % L) + L) % L;
  const at = (s: number): PtMm => {
    const t = ((s % L) + L) % L;
    let i = 0;
    while (i < n - 1 && cum[i + 1] <= t) i++;
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const seg = (i + 1 < n ? cum[i + 1] : L) - cum[i];
    const u = seg > 0 ? (t - cum[i]) / seg : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const out: PtMm[] = [at(s0)];
  // walk the ring's own vertices strictly inside (s0, s0 + len), in order
  const t0 = ((s0 % L) + L) % L;
  let i = 0;
  while (i < n - 1 && cum[i + 1] <= t0) i++;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    const rel = (((cum[j] - t0) % L) + L) % L || L;
    if (rel >= len - 1e-6) break;
    out.push(ring[j]);
  }
  out.push(at(s0 + len));
  return { pts: out, len };
}

/**
 * Each drawn edge (already in the written frame) → the stretch of the written cut ring it covers.
 * Of the two ways round, the one whose middle lies nearest the edge's middle. Edges whose ends are
 * not on the cut line are left out (`skipped`).
 */
export function drawnStretches(
  cut: readonly PtMm[],
  edges: readonly { pts: readonly PtMm[] }[],
): { stretches: PtMm[][]; skipped: number } {
  const n = cut.length;
  if (n < 3) return { stretches: [], skipped: edges.length };
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(cut[i - 1], cut[i]));
  const L = cum[n - 1] + dist(cut[n - 1], cut[0]);
  const spans: { s0: number; len: number }[] = [];
  let skipped = 0;
  for (const e of edges) {
    if (e.pts.length < 2) continue;
    const a = positionOn(cut, cum, e.pts[0]);
    const b = positionOn(cut, cum, e.pts[e.pts.length - 1]);
    if (a.d > DRAWN_ON_CUT_MM || b.d > DRAWN_ON_CUT_MM) {
      skipped++;
      continue;
    }
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const fwd = subArc(cut, cum, L, a.s, b.s);
    const back = subArc(cut, cum, L, b.s, a.s);
    const gap = (pts: PtMm[]) => closestOnPolyline(mid, pts, false).d;
    const pick = fwd.len > 0 && (back.len <= 0 || gap(fwd.pts) <= gap(back.pts)) ? fwd : back;
    if (pick.len >= DRAWN_MIN_MM) spans.push({ s0: pick === fwd ? a.s : b.s, len: pick.len });
  }
  // union of the spans on the ring (touching ones merge: the parser would chain them anyway)
  spans.sort((p, q) => p.s0 - q.s0);
  const merged: { s0: number; len: number }[] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.s0 <= last.s0 + last.len + DRAWN_MIN_MM)
      last.len = Math.max(last.len, sp.s0 + sp.len - last.s0);
    else merged.push({ ...sp });
  }
  // the last one may wrap onto the first
  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (last.s0 + last.len + DRAWN_MIN_MM >= first.s0 + L) {
      last.len = Math.max(last.len, first.s0 + L + first.len - last.s0);
      merged.shift();
    }
  }
  const stretches: PtMm[][] = [];
  for (const m of merged) {
    const len = Math.min(m.len, L - DRAWN_OPEN_GAP_MM);
    if (len < DRAWN_MIN_MM) continue;
    const pts = subArc(cut, cum, L, m.s0, m.s0 + len).pts;
    // never a 2-point line: the card takes any open 2-point chain ≥ 1 cm as a grain candidate
    if (pts.length === 2)
      pts.splice(1, 0, { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
    stretches.push(pts);
  }
  return { stretches, skipped };
}

/** The source-frame derived edges of one block → its drawn stretches on the written cut. */
export function drawnOfBlock(
  cut: readonly PtMm[],
  transform: Affine,
  edges: readonly DerivedEdge[] | undefined,
) {
  const mine = (edges ?? [])
    .filter((e) => KINDS.has(e.kind))
    .map((e) => ({ pts: e.pts.map((p) => applyAffine(transform, p)) }));
  return mine.length ? drawnStretches(cut, mine) : { stretches: [], skipped: 0 };
}

/** The annotation word of a size whose line was (partly) drawn from the grade; null if none. */
export function drawnText(size: Pick<PieceSizeSpec, 'repair'>): string | null {
  const r = size.repair;
  if (!r) return null;
  const mm = r.drawnMm ?? r.holesMm;
  if (!(mm >= DRAWN_MIN_MM)) return null;
  const from = r.fromTokens ? ` (${r.fromTokens[0]}-${r.fromTokens[1]})` : '';
  return `DRAWN FROM GRADE ${Math.round(mm)}MM${from}`;
}
