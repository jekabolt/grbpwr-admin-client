// P2 lane D — darts, read off a piece's internal marks (03-P2-DESIGN.md §4).
//
// A dart is a vee mark (geometry/marks.ts: open, one sharp corner, both ends on the sewing line,
// apex inside) — or the same thing drawn as a closed triangle whose base lies on the sewing line —
// that is NARROW and DEEP: intake at the contour in SKELETON.dartIntakeMm, depth ≥ dartDepthMin and
// ≥ dartDepthRatio × intake, apex ≤ dartApexDeg. That keeps out the vee the corpus does have: the
// blazer's back vent (intake 194, depth 65, apex ~ 110°), and any hem line that turns a corner.
//
// No real pattern of the corpus carries a dart (menswear only), so a dart is never more than a
// suggestion: the step built from it is below the accept threshold and asks to be checked.
//
// A dart CUT OUT of the outline (a V in the contour, no line inside) is not read in v1; it is only
// reported, so the technologist adds the step by hand (`outlineVNotches`).
//
// Pleats / tucks are NOT read (§4): two parallel lines are as likely a centre line and a fold.

import { SKELETON, type EdgeId, type Mm, type PieceGeom, type PieceMark, type Pt2 } from '../types';

/** The four thresholds a vee must pass to be a dart; the probe mutates them one by one. */
export type DartRules = {
  intakeMm: readonly [number, number];
  depthMin: Mm;
  depthRatio: number;
  apexDeg: number;
};

export const DART_RULES: DartRules = {
  intakeMm: SKELETON.dartIntakeMm,
  depthMin: SKELETON.dartDepthMin,
  depthRatio: SKELETON.dartDepthRatio,
  apexDeg: SKELETON.dartApexDeg,
};

/**
 * Confidence of a dart step: below SKELETON.accept, so the screen shows it as «decide», never as an
 * automatic tick — until a real pattern with darts has confirmed the reader.
 */
export const DART_CONFIDENCE = 0.55;

export type Dart = {
  /** PieceMark id the dart stands on. */
  mark: string;
  shape: 'vee' | 'triangle';
  intakeMm: Mm;
  depthMm: Mm;
  apexDeg: number;
  /** The edge the dart opens on. */
  edge: EdgeId;
  /** The dart's legs, mouth → apex → mouth, mm in the piece's `rs` frame (what a pictogram draws). */
  legs: Pt2[];
};

export type PieceDarts = {
  pieceKey: string;
  darts: Dart[];
  /** Darts sewn on this piece: its own, or (no dart lines of its own) its mirror twin's. */
  count: number;
  /** Set when the count is the mirror twin's: the piece carries no lines of its own. */
  inheritedFrom?: string;
};

/** Ends of a closed triangle on the sewing line: within this (= marks.ts VEE_END_MM). */
const TRIANGLE_END_MM = 10;
/** Simplification of a closed mark before counting its corners, mm. */
const TRIANGLE_SIMPLIFY_MM = 1.5;
/** Outline V-notch: both legs straight (chord / length) and alike in length (share). */
const NOTCH_STRAIGHT = 0.97;
const NOTCH_LEG_REL = 0.15;
/** Outline V-notch: the contour turns back at the apex by at least this much (concave). */
const NOTCH_TURN_DEG = -120;

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Does a vee (intake, depth, apex) pass the dart rules? */
export function isDart(
  v: { intakeMm: Mm; depthMm: Mm; apexDeg: number },
  r: DartRules = DART_RULES,
): boolean {
  return (
    v.intakeMm >= r.intakeMm[0] &&
    v.intakeMm <= r.intakeMm[1] &&
    v.depthMm >= r.depthMin &&
    v.depthMm >= r.depthRatio * v.intakeMm &&
    v.apexDeg <= r.apexDeg
  );
}

/** The darts drawn inside one piece (its own lines only). */
export function dartsOf(geom: PieceGeom, r: DartRules = DART_RULES): Dart[] {
  const out: Dart[] = [];
  for (const m of geom.marks ?? []) {
    if (m.kind === 'vee' && m.vee) {
      if (!isDart(m.vee, r)) continue;
      out.push({
        mark: m.id,
        shape: 'vee',
        intakeMm: m.vee.intakeMm,
        depthMm: m.vee.depthMm,
        apexDeg: m.vee.apexDeg,
        edge: m.vee.edge,
        legs: m.pts,
      });
      continue;
    }
    if (m.closed && (m.kind === 'placement' || m.kind === 'other')) {
      const t = triangleOf(m, geom);
      if (t && isDart(t, r)) out.push(t);
    }
  }
  return out;
}

/**
 * Darts per piece, in the pieces' order. A MIRROR twin (L/R) with no vee of its own takes its twin's
 * count: exporters often draw the internal lines on one side only. A piece that has vees of its own
 * keeps its own reading (a vent is not turned into a dart by its twin).
 */
export function dartsByPiece(
  pieces: readonly PieceGeom[],
  r: DartRules = DART_RULES,
): Map<string, PieceDarts> {
  const own = new Map(pieces.map((p) => [p.pieceKey, dartsOf(p, r)]));
  const out = new Map<string, PieceDarts>();
  for (const p of pieces) {
    const darts = own.get(p.pieceKey) ?? [];
    if (darts.length) {
      out.set(p.pieceKey, { pieceKey: p.pieceKey, darts, count: darts.length });
      continue;
    }
    const hasLines = (p.marks ?? []).some((m) => m.kind === 'vee') || triangles(p).length > 0;
    const twin = hasLines
      ? undefined
      : p.twinOf.find((t) => t.kind === 'mirror' && (own.get(t.key)?.length ?? 0) > 0);
    if (twin) {
      out.set(p.pieceKey, {
        pieceKey: p.pieceKey,
        darts: [],
        count: own.get(twin.key)!.length,
        inheritedFrom: twin.key,
      });
    }
  }
  return out;
}

/** Closed marks that are triangles with their base on the sewing line (any size). */
function triangles(geom: PieceGeom): Dart[] {
  const out: Dart[] = [];
  for (const m of geom.marks ?? []) {
    if (!m.closed || (m.kind !== 'placement' && m.kind !== 'other')) continue;
    const t = triangleOf(m, geom);
    if (t) out.push(t);
  }
  return out;
}

/**
 * A closed mark read as a dart drawn as a triangle: three corners, two of them on the sewing line
 * (the mouth), the third inside (the apex).
 */
function triangleOf(m: PieceMark, geom: PieceGeom): Dart | null {
  const ring = simplifyRing(m.pts, TRIANGLE_SIMPLIFY_MM);
  if (ring.length !== 3 || !geom.rs.length) return null;
  const d = ring.map((q) => ringDist(q, geom.rs));
  const on = [0, 1, 2].filter((i) => d[i] <= TRIANGLE_END_MM);
  if (on.length !== 2) return null;
  const apexI = [0, 1, 2].find((i) => !on.includes(i))!;
  const apex = ring[apexI];
  if (!pointInRing(apex, geom.rs)) return null;
  const [e0, e1] = on.map((i) => ring[i]);
  const intakeMm = dist(e0, e1);
  const depthMm = intakeMm > 1e-6 ? lineDist(apex, e0, e1) : dist(apex, e0);
  const edge = nearestEdge([(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], geom);
  if (!edge) return null;
  return {
    mark: m.id,
    shape: 'triangle',
    intakeMm,
    depthMm,
    apexDeg: angleAt(apex, e0, e1),
    edge,
    legs: [e0, apex, e1],
  };
}

/**
 * V-notches cut INTO the outline that look like a dart cut out (two straight legs of about one
 * length meeting at a concave apex, and the dart rules on the mouth / depth / apex). v1 does not
 * build a step for them — it says so, and the technologist adds it by hand.
 */
export function outlineVNotches(
  geom: PieceGeom,
  r: DartRules = DART_RULES,
): { edges: [EdgeId, EdgeId]; intakeMm: Mm; depthMm: Mm; apexDeg: number }[] {
  const out: { edges: [EdgeId, EdgeId]; intakeMm: Mm; depthMm: Mm; apexDeg: number }[] = [];
  const es = geom.edges;
  for (let i = 0; i < es.length && es.length >= 3; i++) {
    const a = es[i];
    const b = es[(i + 1) % es.length];
    if (a.e !== b.s) continue;
    if (a.chordMm / a.lenMm < NOTCH_STRAIGHT || b.chordMm / b.lenMm < NOTCH_STRAIGHT) continue;
    if (Math.abs(a.lenMm - b.lenMm) > NOTCH_LEG_REL * Math.max(a.lenMm, b.lenMm)) continue;
    const a0 = a.pts[0];
    const apex = a.pts[a.pts.length - 1];
    const b1 = b.pts[b.pts.length - 1];
    const ux = apex[0] - a0[0];
    const uy = apex[1] - a0[1];
    const vx = b1[0] - apex[0];
    const vy = b1[1] - apex[1];
    const turn = (Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI;
    if (turn > NOTCH_TURN_DEG) continue;
    const intakeMm = dist(a0, b1);
    const depthMm = intakeMm > 1e-6 ? lineDist(apex, a0, b1) : dist(apex, a0);
    const apexDeg = angleAt(apex, a0, b1);
    if (!isDart({ intakeMm, depthMm, apexDeg }, r)) continue;
    out.push({ edges: [a.id, b.id], intakeMm, depthMm, apexDeg });
  }
  return out;
}

// ── small geometry ──────────────────────────────────────────────────────────────────────────

/** Angle at `apex` between the rays to e0 and e1, degrees 0..180. */
function angleAt(apex: Pt2, e0: Pt2, e1: Pt2): number {
  const ux = e0[0] - apex[0];
  const uy = e0[1] - apex[1];
  const vx = e1[0] - apex[0];
  const vy = e1[1] - apex[1];
  const c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Distance from p to the infinite line through a, b. */
function lineDist(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  return Math.abs(vx * (p[1] - a[1]) - vy * (p[0] - a[0])) / (Math.hypot(vx, vy) || 1);
}

function segDist(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t =
    l2 > 1e-12 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Distance from p to a closed ring. */
function ringDist(p: Pt2, ring: readonly Pt2[]): number {
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i++)
    best = Math.min(best, segDist(p, ring[i], ring[(i + 1) % n]));
  return best;
}

function pointInRing(p: Pt2, ring: readonly Pt2[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}

/** The edge whose points come closest to p. */
function nearestEdge(p: Pt2, geom: PieceGeom): EdgeId | null {
  let best = Infinity;
  let id: EdgeId | null = null;
  for (const e of geom.edges) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const d = segDist(p, e.pts[i], e.pts[i + 1]);
      if (d < best) {
        best = d;
        id = e.id;
      }
    }
  }
  return id;
}

/** Douglas–Peucker on a closed ring, split at the point farthest from the first. */
function simplifyRing(pts: readonly Pt2[], tol: Mm): Pt2[] {
  if (pts.length <= 3) return [...pts];
  const dp = (seg: readonly Pt2[]): Pt2[] => {
    const keep = new Uint8Array(seg.length);
    keep[0] = 1;
    keep[seg.length - 1] = 1;
    const stack: [number, number][] = [[0, seg.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let at = -1;
      let far = tol;
      for (let i = a + 1; i < b; i++) {
        const d = segDist(seg[i], seg[a], seg[b]);
        if (d > far) {
          far = d;
          at = i;
        }
      }
      if (at >= 0) {
        keep[at] = 1;
        stack.push([a, at], [at, b]);
      }
    }
    return seg.filter((_, i) => keep[i] === 1);
  };
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (dist(pts[i], pts[0]) > dist(pts[far], pts[0])) far = i;
  const a = dp(pts.slice(0, far + 1));
  const b = dp([...pts.slice(far), pts[0]]);
  const ring = [...a.slice(0, -1), ...b.slice(0, -1)];
  // The split point itself may sit mid-side: drop vertices that do not turn.
  return ring.filter((q, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];
    return segDist(q, prev, next) > tol;
  });
}
