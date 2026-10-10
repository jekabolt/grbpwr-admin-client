// Typed features of one piece candidate: notches (layer 4), drills (layer 8 squares), internal
// lines (layer 8), grain (layer 7, exactly one per block), fold, seam.
//
// The DXF fast path already carries them (`PieceCandidate.features`, F8 `dxf.features`); a PDF /
// SVG / HPGL candidate gets them here from the ChainSet:
//   • notch  — a short (≤ 15 mm), straight chain that crosses or touches the outline at ≥ 45°;
//              written starting ON the cut line pointing inward, depth < 1 cm (the writer clamps);
//   • drill  — a small closed chain (≤ 15 mm across) or a dot inside the outline;
//   • grain  — a straight open line ≥ 40 mm inside (one chain, or 2–6 collinear dashes of one
//              style) and its evidence (A1): a grain class (counts two), arrowheads (barbs ≤ 25 mm
//              at 15–60° at both ends or a symmetric pair — not among lettering), a grain word
//              ("grain", "Fadenlauf", "долевая", "droit fil"…) beside it, the same line in every
//              size copy (a grainline is not graded), the dashes themselves. Two or more evidences →
//              'detected'; exactly one → 'proposed' (D3: shown, accepted only by a click);
//   • internal — every other chain inside of an internal/common class (darts, pocket placement).
// Size lines of OTHER ranks run inside a multi-size outline too; they are size-classed and skipped.

import type {
  BoxMm,
  Chain,
  ChainSet,
  DrillFeature,
  Feature,
  GrainEvidenceKind,
  GrainFeature,
  InternalFeature,
  NotchFeature,
  PathRange,
  PieceCandidate,
  PtMm,
  Sheet,
} from '../types';
import { PATIMPORT } from '../types';
import { drawnSeam, featuresOf } from './allowance';
import { bboxOf, centroidOf, closestOnPolyline, dist, footOnSegment, pointInPolygon } from './geom';
import { glyphCellKey, undashed } from './glyphs';

export const NOTCH_MAX_CHAIN_MM = 15;
export const DRILL_MAX_MM = 15;
export const GRAIN_MIN_MM = 40;
/** A1: a grain word this close to the line (its box centre to the segment), mm. */
export const GRAIN_TEXT_MM = 60;
/** A1: a grain word turned along the line (±10°) counts this far, mm. */
export const GRAIN_TEXT_ALONG_MM = 120;
/**
 * N3: a grain word turned along the line (±10°) this close to it (its box centre to the segment) is
 * written ON the line — its direction is a second evidence beside the word, mm.
 */
export const GRAIN_TEXT_ON_LINE_MM = 10;
/** A1: an arrowhead barb: a chain this short, its tip this close to a line end, at 15–60°. */
export const GRAIN_HEAD_MAX_MM = 25;
export const GRAIN_HEAD_END_MM = 6;
export const GRAIN_HEAD_MIN_DEG = 15;
export const GRAIN_HEAD_MAX_DEG = 60;
/** N3: each barb of a one-end pair is at least this long, mm. */
export const GRAIN_PAIR_BARB_MIN_MM = 2.5;
/** A1: dashes of one dashed grainline: 2–6 of them, gaps up to this, mm. */
export const GRAIN_DASH_GAP_MM = 20;
export const GRAIN_DASH_MAX = 6;
/** A1: a size copy of the line: length within ±1 mm, direction within ±2°. */
export const GRAIN_COPY_LEN_MM = 1;
export const GRAIN_COPY_DEG = 2;
/** A1: a size copy of a nested sheet's shared line lies on it, ≤ this across, mm. */
export const GRAIN_COPY_ON_LINE_MM = 1;
/**
 * A1: how strong each evidence is when two lines compete (never length first): a grain class, then
 * arrowheads, then the word, then the ungraded copies, then the dashes.
 */
const GRAIN_STRENGTH: Record<GrainEvidenceKind, number> = {
  class: 8,
  arrowheads: 4,
  word: 2,
  along: 1,
  ungraded: 1,
  dashes: 0.5,
  'dxf-layer': 8,
  operator: 8,
  borrowed: 0,
  geometry: 0,
  accepted: 0,
};

/** What the caller knows beyond the candidate: the sheet's size count and the family's box. */
export type FeatureOpts = { sizeCount?: number; region?: BoxMm };

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
export function classifyFeatures(
  cand: PieceCandidate,
  set: ChainSet,
  sheet?: Sheet,
  opts: FeatureOpts = {},
): Feature[] {
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

  // the chains inside that may carry a feature (another size's line, a seam, ignored: never)
  // N3: the seam line drawn in the outlines' own pen (one-pen sheets, wm M) is the seam, measured
  const seamIds = new Set(drawnSeam(cand, set)?.ids ?? []);
  const inner: Chain[] = [];
  for (const id of new Set(cand.inside)) {
    const ch = set.chains[id];
    if (!ch || notchChains.has(id) || seamIds.has(id)) continue;
    const k = clsOf.get(id);
    const role = k?.role;
    if (role === 'size' && !wallCls.has(k?.id)) continue; // another size's line
    if (role === 'ignore' || role === 'seam') continue;
    if (role === 'size') continue; // own size, inner loop = seam measurement, not a feature
    inner.push(ch);
  }

  const grain = bestGrain(cand, set, sheet, inner, clsOf, opts);
  const taken = new Set(grain ? [...grain.ids, ...grain.heads] : []);
  if (grain) out.push(grain.feature);

  for (const ch of inner) {
    if (taken.has(ch.id)) continue;
    const role = clsOf.get(ch.id)?.role;
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
    // a grain-classed line that lost to another is not an internal line (exactly ONE grain)
    if (role === 'grain') continue;
    if (lengthOf(ch.pts, ch.closed) >= 5)
      out.push({
        kind: 'internal',
        pts: ch.pts,
        closed: ch.closed,
        origin: 'detected',
        ranges: ch.ranges,
        confidence: 0.8,
      } satisfies InternalFeature);
  }
  return out;
}

// ── grain (A1) ──────────────────────────────────────────────────────────────────────────────

/** One straight line inside the piece that may be its grainline. */
type GrainLine = {
  a: PtMm;
  b: PtMm;
  /** The chains drawing it (one, or the dashes). */
  ids: number[];
  ranges: PathRange[];
  len: number;
  dashed: boolean;
  grainClass: boolean;
  /** Barbs drawn in the same polyline as the shaft (barb → tip → shaft), trimmed off it. */
  barbs: [PtMm, PtMm][];
};

/**
 * A polyline that is a straight shaft with its arrowhead drawn in one stroke (blazer: barb → tip →
 * shaft): up to two end segments ≤ GRAIN_HEAD_MAX_MM trimmed off each end leave a straight body
 * ≥ GRAIN_MIN_MM. Null when no such trim makes it straight.
 */
function trimBarbs(pts: readonly PtMm[]): { body: PtMm[]; barbs: [PtMm, PtMm][] } | null {
  const n = pts.length;
  for (let k = 1; k <= 4; k++)
    for (let i = 0; i <= Math.min(2, k); i++) {
      const j = k - i;
      if (j > 2 || n - i - j < 2) continue;
      const body = pts.slice(i, n - j);
      if (straightness(body) > 0.5 || lengthOf(body, false) < GRAIN_MIN_MM) continue;
      const barbs: [PtMm, PtMm][] = [];
      for (let t = 0; t < i; t++) barbs.push([pts[t], pts[t + 1]]);
      for (let t = n - j - 1; t < n - 1; t++) barbs.push([pts[t], pts[t + 1]]);
      if (barbs.some(([p, q]) => dist(p, q) > GRAIN_HEAD_MAX_MM)) continue;
      return { body, barbs };
    }
  return null;
}

/** Smallest angle between two directions, degrees, 0..90 (lines have no sense). */
function lineAngleDiff(a: number, b: number): number {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
}

/** Straight open lines ≥ GRAIN_MIN_MM: single chains, and 2–6 collinear dashes of one style. */
function grainLines(inner: readonly Chain[], isGrainClass: (id: number) => boolean): GrainLine[] {
  const straight = inner.filter(
    (ch) => !ch.closed && ch.pts.length >= 2 && straightness(ch.pts) <= 0.5,
  );
  const out: GrainLine[] = [];
  const inDashes = new Set<number>();
  // (d) dashes: collinear (±2°, ≤ 0.7 mm off the line), one style, gaps ≤ GRAIN_DASH_GAP_MM
  const segs = straight
    .filter((ch) => ch.lengthMm >= 2)
    .map((ch) => {
      const a = ch.pts[0];
      const z = ch.pts[ch.pts.length - 1];
      const L = dist(a, z) || 1;
      return { ch, a, z, ux: (z.x - a.x) / L, uy: (z.y - a.y) / L, L };
    });
  const used = new Set<number>();
  for (const s of segs) {
    if (used.has(s.ch.id)) continue;
    const off = (p: PtMm) => Math.abs((p.x - s.a.x) * -s.uy + (p.y - s.a.y) * s.ux);
    const along = (p: PtMm) => (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy;
    const cosTol = Math.cos((GRAIN_COPY_DEG * Math.PI) / 180);
    const members = segs
      .filter(
        (o) =>
          !used.has(o.ch.id) &&
          o.ch.style === s.ch.style &&
          Math.abs(o.ux * s.ux + o.uy * s.uy) >= cosTol &&
          off(o.a) <= 0.7 &&
          off(o.z) <= 0.7,
      )
      .map((o) => {
        const t0 = along(o.a);
        const t1 = along(o.z);
        return { o, lo: Math.min(t0, t1), hi: Math.max(t0, t1) };
      })
      .sort((x, y) => x.lo - y.lo);
    if (members.length < 2) continue;
    // the run of members around s with every gap ≤ GRAIN_DASH_GAP_MM
    const runs: (typeof members)[] = [];
    let cur: typeof members = [];
    let reach = -Infinity;
    for (const m of members) {
      if (cur.length && m.lo - reach > GRAIN_DASH_GAP_MM) {
        runs.push(cur);
        cur = [];
      }
      cur.push(m);
      reach = Math.max(reach, m.hi);
    }
    runs.push(cur);
    const run = runs.find((r) => r.some((m) => m.o === s));
    if (!run || run.length < 2) continue;
    for (const m of run) used.add(m.o.ch.id);
    if (run.length > GRAIN_DASH_MAX) continue; // a long dashed line: a fold, a stitch line
    // dashes follow one another; strokes that overlap are copies of one line (sizes, duplicates)
    if (run.some((m, i) => i > 0 && m.lo < Math.max(...run.slice(0, i).map((x) => x.hi)) - 0.5))
      continue;
    // a dashed line repeats: dash lengths alike (lettering strokes on one baseline are not)
    const lens = run.map((m) => m.hi - m.lo);
    if (Math.min(...lens) < 0.3 * Math.max(...lens)) continue;
    const lo = run[0].lo;
    const hi = Math.max(...run.map((m) => m.hi));
    if (hi - lo < GRAIN_MIN_MM) continue;
    const ids = run.map((m) => m.o.ch.id);
    for (const id of ids) inDashes.add(id);
    out.push({
      a: { x: s.a.x + s.ux * lo, y: s.a.y + s.uy * lo },
      b: { x: s.a.x + s.ux * hi, y: s.a.y + s.uy * hi },
      ids,
      ranges: run.flatMap((m) => m.o.ch.ranges),
      len: hi - lo,
      dashed: true,
      grainClass: ids.some(isGrainClass),
      barbs: [],
    });
  }
  for (const ch of straight) {
    if (inDashes.has(ch.id)) continue;
    const L = lengthOf(ch.pts, false);
    if (L < GRAIN_MIN_MM) continue;
    out.push({
      a: ch.pts[0],
      b: ch.pts[ch.pts.length - 1],
      ids: [ch.id],
      ranges: ch.ranges,
      len: L,
      dashed: false,
      grainClass: isGrainClass(ch.id),
      barbs: [],
    });
  }
  // a shaft with its head(s) in the same stroke
  for (const ch of inner) {
    if (ch.closed || ch.pts.length < 3 || straightness(ch.pts) <= 0.5) continue;
    const t = trimBarbs(ch.pts);
    if (!t) continue;
    out.push({
      a: t.body[0],
      b: t.body[t.body.length - 1],
      ids: [ch.id],
      ranges: ch.ranges,
      len: lengthOf(t.body, false),
      dashed: false,
      grainClass: isGrainClass(ch.id),
      barbs: t.barbs,
    });
  }
  return out;
}

/**
 * (a) Arrowheads: barbs — segments of chains ≤ GRAIN_HEAD_MAX_MM — whose tip is ≤ GRAIN_HEAD_END_MM
 * from a line end and which run back along the line at 15–60°. They count at BOTH ends, or as a
 * symmetric pair (one barb each side) at one end; a head among lettering (its cell as dense as the
 * gate's G18 refuses) does not count. Returns the head chains, or null.
 */
function arrowheads(
  line: GrainLine,
  heads: readonly Chain[],
  lettered: (p: PtMm) => boolean,
): number[] | null {
  const ends = [line.a, line.b];
  const sides: Set<number>[] = [new Set(), new Set()];
  const barbsAt: { side: number; deg: number; len: number }[][] = [[], []];
  const ids = new Set<number>();
  const own = new Set(line.ids);
  const integral: Chain[] = line.barbs.map(([p, q]) => ({
    id: -1,
    pts: [p, q],
    closed: false,
    ranges: [],
    motif: null,
    style: -1 as Chain['style'],
    lengthMm: dist(p, q),
  }));
  const cosLo = Math.cos((GRAIN_HEAD_MAX_DEG * Math.PI) / 180);
  const cosHi = Math.cos((GRAIN_HEAD_MIN_DEG * Math.PI) / 180);
  for (const h of [...heads, ...integral]) {
    if (own.has(h.id)) continue;
    const n = h.pts.length;
    for (let i = 0; i < (h.closed ? n : n - 1); i++) {
      const p = h.pts[i];
      const q = h.pts[(i + 1) % n];
      for (let e = 0; e < 2; e++) {
        const E = ends[e];
        const O = ends[1 - e];
        const tip = dist(p, E) <= dist(q, E) ? p : q;
        const far = tip === p ? q : p;
        if (dist(tip, E) > GRAIN_HEAD_END_MM) continue;
        const vx = far.x - tip.x;
        const vy = far.y - tip.y;
        const vl = Math.hypot(vx, vy);
        if (vl < 1.5) continue;
        const ix = O.x - E.x;
        const iy = O.y - E.y;
        const il = Math.hypot(ix, iy) || 1;
        const cos = (vx * ix + vy * iy) / (vl * il);
        if (cos < cosLo || cos > cosHi) continue;
        if (lettered(tip) || lettered(far)) continue;
        const side = Math.sign(ix * vy - iy * vx);
        sides[e].add(side);
        barbsAt[e].push({ side, deg: (Math.acos(Math.min(1, cos)) * 180) / Math.PI, len: vl });
        if (h.id >= 0) ids.add(h.id);
      }
    }
  }
  const both = sides[0].size > 0 && sides[1].size > 0;
  // N3 (wm M back): a pair at ONE end is a drawn head only when its two barbs mirror each other —
  // like angles (± 10°), like lengths (≤ 1.6 ×), each ≥ 2.5 mm — and stand alone (≤ 4 DIFFERENT
  // strokes at the tip; palto draws one head per size, 5 identical copies). A diagonal running into
  // a tile label («KOLUMNA 5») meets short horizontal / vertical strokes of all lengths: no head.
  const distinct = (bs: { side: number; deg: number; len: number }[]) =>
    bs.filter(
      (b, i) =>
        !bs
          .slice(0, i)
          .some(
            (o) =>
              o.side === b.side && Math.abs(o.deg - b.deg) <= 2 && Math.abs(o.len - b.len) <= 0.5,
          ),
    ).length;
  const pair = barbsAt.some(
    (bs) =>
      distinct(bs) <= 4 &&
      bs.some(
        (p) =>
          p.len >= GRAIN_PAIR_BARB_MIN_MM &&
          bs.some(
            (q) =>
              q.side !== p.side &&
              q.len >= GRAIN_PAIR_BARB_MIN_MM &&
              Math.abs(q.deg - p.deg) <= 10 &&
              Math.max(p.len, q.len) <= 1.6 * Math.min(p.len, q.len),
          ),
      ),
  );
  if (!both && !pair) return null;
  if (lettered(line.a) || lettered(line.b)) return null;
  return [...ids];
}

/** The candidate's best grain line with its evidence, or null when no line has any. */
function bestGrain(
  cand: PieceCandidate,
  set: ChainSet,
  sheet: Sheet | undefined,
  inner: readonly Chain[],
  clsOf: Map<number, ChainSet['classes'][number]>,
  opts: FeatureOpts,
): { feature: GrainFeature; ids: number[]; heads: number[] } | null {
  const lines = grainLines(inner, (id) => clsOf.get(id)?.role === 'grain');
  if (!lines.length) return null;

  // the gate's lettering test (G16/G18) on the short strokes inside: per 60 mm cell, dashes out
  const strokes = undashed(
    inner.filter((ch) => ch.lengthMm < PATIMPORT.glyphShortMm && ch.pts.length >= 2),
  );
  const cells = new Map<string, number>();
  for (const st of strokes) {
    const k = glyphCellKey(st.pts[0]);
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  const lettered = (p: PtMm) => (cells.get(glyphCellKey(p)) ?? 0) >= PATIMPORT.glyphMaxShortPerCell;
  // heads: short chains inside, also those the legend set aside (a lettering pass takes barbs for
  // strokes — blazer); the lettering test above, on the strokes that are written, still applies
  const headChains = [...new Set(cand.inside)].flatMap((id) => {
    const ch = set.chains[id];
    const role = clsOf.get(id)?.role;
    return ch &&
      ch.lengthMm <= GRAIN_HEAD_MAX_MM &&
      ch.pts.length >= 2 &&
      role !== 'size' &&
      role !== 'seam'
      ? [ch]
      : [];
  });

  const grainTexts = (sheet?.texts ?? []).filter(
    (t) =>
      GRAIN_WORDS.test(t.text) &&
      (pointInPolygon(
        { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
        cand.outer,
      ) ||
        cand.textsInside.includes(t.id)),
  );

  // (c) ungraded: the same line (±1 mm, ±2°) in ≥ n − 1 size copies inside the family's box —
  // and each copy provably another size's: on its own per-size layer / OCG (kombinezon draws one
  // per size), or lying ON the line (≤ 1 mm across, a nested sheet's shared line) in at least
  // max(3, n − 1) copies (two coincident strokes may be a fill + stroke duplicate). A long CF /
  // placket line beside the grain, equal in every size, is neither.
  const n = opts.sizeCount ?? 0;
  const box = opts.region ?? cand.bbox;
  const styleLayer = new Map((sheet?.styles ?? []).map((st) => [st.id, st.layer]));
  const ungradedOf = (l: GrainLine): boolean => {
    if (n < 3 || l.dashed) return false;
    const ang = angleDeg(l.a, l.b);
    const ux = (l.b.x - l.a.x) / l.len;
    const uy = (l.b.y - l.a.y) / l.len;
    const own = set.chains[l.ids[0]];
    const layers = new Set<string>();
    const ownLayer = own ? styleLayer.get(own.style) : null;
    if (ownLayer) layers.add(ownLayer);
    let onLine = 1;
    for (const o of set.chains) {
      if (o.id === l.ids[0] || o.closed || Math.abs(o.lengthMm - l.len) > GRAIN_COPY_LEN_MM + 0.5)
        continue;
      const a = o.pts[0];
      const z = o.pts[o.pts.length - 1];
      if (Math.abs(dist(a, z) - l.len) > GRAIN_COPY_LEN_MM) continue;
      if (lineAngleDiff(angleDeg(a, z), ang) > GRAIN_COPY_DEG) continue;
      const m = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
      if (m.x < box.minX - 10 || m.x > box.maxX + 10 || m.y < box.minY - 10 || m.y > box.maxY + 10)
        continue;
      if (straightness(o.pts) > 0.5) continue;
      // a size copy lies BESIDE the line (graded placement), not further along it: the two
      // overlap along the line's direction by at least half (a collinear stroke is not a copy)
      const t0 = (a.x - l.a.x) * ux + (a.y - l.a.y) * uy;
      const t1 = (z.x - l.a.x) * ux + (z.y - l.a.y) * uy;
      if (Math.min(l.len, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) < 0.5 * l.len) continue;
      const lay = styleLayer.get(o.style);
      if (lay) layers.add(lay);
      if (Math.abs((m.x - l.a.x) * -uy + (m.y - l.a.y) * ux) <= GRAIN_COPY_ON_LINE_MM) onLine++;
    }
    return layers.size >= Math.max(2, n - 1) || onLine >= Math.max(3, n - 1);
  };

  let best: {
    l: GrainLine;
    evidence: GrainEvidenceKind[];
    weight: number;
    strength: number;
    heads: number[];
  } | null = null;
  // a line among lettering (its ends or middle in a cell as dense as G18 refuses) is a stroke
  const live = lines.filter((l) => {
    const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
    return !(lettered(l.a) || lettered(l.b) || lettered(mid));
  });
  // (b) each grain word labels ONE line: the nearest (≤ 60 mm, ≤ 120 mm turned along it); written
  // along that line (± 10°) within 10 mm, its direction is a second evidence (N3, gerber «GRAIN»)
  const worded = new Set<GrainLine>();
  const along = new Set<GrainLine>();
  for (const t of grainTexts) {
    const c = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
    let near: { l: GrainLine; d: number } | null = null;
    for (const l of live) {
      const d = footOnSegment(c, l.a, l.b).d;
      if (!near || d < near.d) near = { l, d };
    }
    if (!near) continue;
    const turned = lineAngleDiff(t.rotationDeg, angleDeg(near.l.a, near.l.b)) <= 10;
    if (near.d <= GRAIN_TEXT_MM || (near.d <= GRAIN_TEXT_ALONG_MM && turned)) worded.add(near.l);
    if (turned && near.d <= GRAIN_TEXT_ON_LINE_MM) along.add(near.l);
  }
  for (const l of live) {
    const heads = arrowheads(l, headChains, lettered);
    const word = worded.has(l);
    const ungraded = ungradedOf(l);
    const evidence: GrainEvidenceKind[] = [
      ...(l.grainClass ? (['class'] as const) : []),
      ...(heads ? (['arrowheads'] as const) : []),
      ...(word ? (['word'] as const) : []),
      ...(word && along.has(l) ? (['along'] as const) : []),
      ...(ungraded ? (['ungraded'] as const) : []),
      ...(l.dashed ? (['dashes'] as const) : []),
    ];
    // a grain class is the legend's (operator's, a DXF layer's) word: it counts two
    const weight = evidence.length + (l.grainClass ? 1 : 0);
    if (!weight) continue;
    // competing lines: the stronger evidence wins, length only breaks a tie
    const strength = evidence.reduce((s, e) => s + GRAIN_STRENGTH[e], 0);
    if (!best || strength > best.strength || (strength === best.strength && l.len > best.l.len))
      best = { l, evidence, weight, strength, heads: heads ?? [] };
  }
  if (!best) return null;
  const { l, evidence, weight, heads } = best;
  return {
    feature: {
      kind: 'grain',
      a: l.a,
      b: l.b,
      angleDeg: angleDeg(l.a, l.b),
      // D3: one evidence is a proposal, never applied without the operator's click
      origin: weight >= 2 ? 'detected' : 'proposed',
      ranges: l.ranges,
      confidence: Math.min(1, 0.4 + weight / 5),
      evidence,
    },
    ids: l.ids,
    heads,
  };
}
