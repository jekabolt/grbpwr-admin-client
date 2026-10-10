// Typed features of one piece candidate: notches (layer 4), drills (layer 8 squares), internal
// lines (layer 8), grain (layer 7, exactly one per block), fold, seam.
//
// The DXF fast path already carries them (`PieceCandidate.features`, F8 `dxf.features`); a PDF /
// SVG / HPGL candidate gets them here from the ChainSet:
//   • notch  — a short (≤ 15 mm), straight chain that crosses or touches the outline at ≥ 45°;
//              written starting ON the cut line pointing inward, depth < 1 cm (the writer clamps);
//   • drill  — a small closed chain (≤ 15 mm across) or a dot inside the outline;
//   • grain  — a straight open chain ≥ 40 mm inside: a grain-classed chain, or one with arrow
//              heads at an end, or one labelled ("grain", "Fadenlauf", "долевая", "droit fil"…);
//   • internal — every other chain inside of an internal/common class (darts, pocket placement).
// Size lines of OTHER ranks run inside a multi-size outline too; they are size-classed and skipped.

import type {
  ChainSet,
  DrillFeature,
  Feature,
  GrainFeature,
  InternalFeature,
  NotchFeature,
  PieceCandidate,
  PtMm,
  Sheet,
} from '../types';
import { PATIMPORT } from '../types';
import { featuresOf } from './allowance';
import { bboxOf, centroidOf, closestOnPolyline, dist, footOnSegment, pointInPolygon } from './geom';

export const NOTCH_MAX_CHAIN_MM = 15;
export const DRILL_MAX_MM = 15;
export const GRAIN_MIN_MM = 40;
export const GRAIN_TEXT_MM = 25;

const GRAIN_WORDS =
  /grain|fadenlauf|fadenl|долев|droit[\s-]*fil|sens\s+du\s+fil|draadrichting|kierunek\s+nitki|nitka|hilo|dritto\s+filo|trådretning|canal/iu;

/** Max distance of a polyline's vertices from its chord, mm. */
function straightness(pts: readonly PtMm[]): number {
  if (pts.length < 3) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let m = 0;
  for (const p of pts) m = Math.max(m, footOnSegment(p, a, b).d);
  return m;
}

const lengthOf = (pts: readonly PtMm[], closed: boolean) => {
  let s = 0;
  for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++)
    s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
};

const angleDeg = (a: PtMm, b: PtMm) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** A notch from a short segment crossing/touching the outline; null when it does not. */
export function notchFrom(seg: [PtMm, PtMm], outer: readonly PtMm[]): NotchFeature | null {
  const [p, q] = seg;
  const L = dist(p, q);
  if (!(L >= PATIMPORT.notchMinMm * 0.5) || L > NOTCH_MAX_CHAIN_MM) return null;
  const cp = closestOnPolyline(p, outer, true);
  const cq = closestOnPolyline(q, outer, true);
  const near = cp.d <= cq.d ? cp : cq;
  const pin = pointInPolygon(p, outer);
  const qin = pointInPolygon(q, outer);
  const crosses = pin !== qin;
  if (!crosses && near.d > 1) return null;
  // angle against the outline's local tangent
  const a = outer[near.seg];
  const b = outer[(near.seg + 1) % outer.length];
  const tang = { x: b.x - a.x, y: b.y - a.y };
  const tl = Math.hypot(tang.x, tang.y) || 1;
  const sx = (q.x - p.x) / L;
  const sy = (q.y - p.y) / L;
  const cos = Math.abs((tang.x * sx + tang.y * sy) / tl);
  if ((Math.acos(Math.min(1, cos)) * 180) / Math.PI < PATIMPORT.notchMinAngleDeg) return null;
  const at = near.q;
  const inner = pin && !qin ? p : qin && !pin ? q : cp.d <= cq.d ? q : p;
  const depth = Math.min(PATIMPORT.notchMaxMm, Math.max(1, dist(at, inner)));
  return {
    kind: 'notch',
    at,
    seg: [at, inner],
    depthMm: depth,
    origin: 'detected',
    ranges: [],
    confidence: crosses ? 0.9 : 0.7,
  };
}

/**
 * Classify the chains around one candidate into features (PDF path). The DXF fast path's own
 * features win when present: they are read from typed layers, not guessed.
 */
export function classifyFeatures(cand: PieceCandidate, set: ChainSet, sheet?: Sheet): Feature[] {
  const known = featuresOf(cand);
  if (known.length) return known;
  const out: Feature[] = [];
  const clsOf = new Map<number, (typeof set.classes)[number]>();
  for (const k of set.classes) for (const ch of k.chains) clsOf.set(ch, k);
  const walls = new Set(cand.walls);
  const wallCls = new Set(cand.walls.map((w) => clsOf.get(w)?.id));
  const box = bboxOf(cand.outer);
  const pad = NOTCH_MAX_CHAIN_MM;
  const notchChains = new Set<number>();

  // notches: short chains anywhere near the outline (they cross it, so they are not "inside")
  for (const ch of set.chains) {
    if (walls.has(ch.id) || ch.closed || ch.lengthMm > NOTCH_MAX_CHAIN_MM) continue;
    const role = clsOf.get(ch.id)?.role;
    if (role === 'size' || role === 'seam' || role === 'ignore' || role === 'grain') continue;
    const b = bboxOf(ch.pts);
    if (
      b.maxX < box.minX - pad ||
      b.minX > box.maxX + pad ||
      b.maxY < box.minY - pad ||
      b.minY > box.maxY + pad
    )
      continue;
    if (straightness(ch.pts) > 0.5) continue;
    const n = notchFrom([ch.pts[0], ch.pts[ch.pts.length - 1]], cand.outer);
    if (!n) continue;
    notchChains.add(ch.id);
    out.push({ ...n, ranges: ch.ranges, confidence: role === 'notch' ? 1 : n.confidence });
  }

  // texts that label a grain line
  const grainTexts = (sheet?.texts ?? []).filter((t) => GRAIN_WORDS.test(t.text));
  const grains: (GrainFeature & { score: number })[] = [];
  const insideIds = new Set(cand.inside);
  for (const id of insideIds) {
    const ch = set.chains[id];
    if (!ch || notchChains.has(id)) continue;
    const k = clsOf.get(id);
    const role = k?.role;
    if (role === 'size' && !wallCls.has(k?.id)) continue; // another size's line
    if (role === 'ignore' || role === 'seam') continue;
    if (role === 'size') continue; // own size, inner loop = seam measurement, not a feature
    const b = bboxOf(ch.pts);
    const across = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
    if (ch.closed && across <= DRILL_MAX_MM) {
      out.push({
        kind: 'drill',
        at: centroidOf(ch.pts),
        origin: 'detected',
        ranges: ch.ranges,
        confidence: 0.8,
      } satisfies DrillFeature);
      continue;
    }
    if (ch.pts.length === 1) {
      out.push({
        kind: 'drill',
        at: ch.pts[0],
        origin: 'detected',
        ranges: ch.ranges,
        confidence: 0.6,
      });
      continue;
    }
    const L = lengthOf(ch.pts, ch.closed);
    if (!ch.closed && L >= GRAIN_MIN_MM && straightness(ch.pts) <= 0.5) {
      const a = ch.pts[0];
      const z = ch.pts[ch.pts.length - 1];
      // arrow heads: short chains starting within 2 mm of an end
      const heads = set.chains.filter(
        (o) =>
          o.id !== id &&
          o.lengthMm <= 20 &&
          (dist(o.pts[0], a) <= 2 ||
            dist(o.pts[0], z) <= 2 ||
            dist(o.pts[o.pts.length - 1], a) <= 2 ||
            dist(o.pts[o.pts.length - 1], z) <= 2),
      ).length;
      const mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
      const labelled = grainTexts.some((t) => {
        const c = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
        return footOnSegment(c, a, z).d <= GRAIN_TEXT_MM || dist(c, mid) <= GRAIN_TEXT_MM;
      });
      const score = (role === 'grain' ? 3 : 0) + (heads ? 2 : 0) + (labelled ? 2 : 0);
      if (score > 0) {
        grains.push({
          kind: 'grain',
          a,
          b: z,
          angleDeg: angleDeg(a, z),
          origin: 'detected',
          ranges: ch.ranges,
          confidence: Math.min(1, 0.4 + score / 7),
          score: score * 10000 + L,
        });
        continue;
      }
    }
    if (role === 'grain') continue;
    if (L >= 5)
      out.push({
        kind: 'internal',
        pts: ch.pts,
        closed: ch.closed,
        origin: 'detected',
        ranges: ch.ranges,
        confidence: 0.8,
      } satisfies InternalFeature);
  }
  // exactly ONE grain per block: the best scored; the others become internal lines
  grains.sort((x, y) => y.score - x.score);
  if (grains.length) {
    const { score: _s, ...g } = grains[0];
    out.push(g);
    for (const o of grains.slice(1))
      out.push({
        kind: 'internal',
        pts: [o.a, o.b],
        closed: false,
        origin: 'detected',
        ranges: o.ranges,
        confidence: 0.5,
      });
  }
  return out;
}
