// P2 step 0 — the internal marks of a piece, classified once for the three geometric lanes
// (S surface joins, D darts, Z closures; 03-P2-DESIGN.md §2).
//
// What a pattern draws inside a piece is mostly NOT a mark: CLO writes the sewing line again on
// layer 8, Gerber duplicates every internal line on L8 (cut side) and L85 (sew side, often clipped),
// and topstitching / hems / placket folds run parallel to an edge. So, in order:
//   1. inner paths of the piece, minus its contour layer, notches ('4') and grain ('7'), in mm in
//      the `rs` frame;
//   2. seam-copy: a copy of the sewing line — lying on it, the cut line around it (allowances differ
//      per edge, up to 80 mm), or the design's uniform inner offset (bbox = contour − 2·distance) —
//      dropped, never returned (done before 3 so the big loops never reach the twin pass; the
//      design lists it third, the result is the same);
//   3. twins collapse: the same line twice (±2 % length, 90 % of it within 2 mm), or a clipped copy
//      lying on a longer line of another layer — one is kept;
//   4. drills (small loops, crosses — a circle with its cross is one drill) and buttonholes
//      (straight 12–40 mm, not crossed mid-way, end ticks absorbed);
//   5. vee: open, exactly one sharp corner, both ends on the sewing line, apex inside (two straight
//      legs meeting at a point are glued first);
//   6. fold / parallel: a line at a constant offset from one edge (straight, ≥ 150 mm and ≤ 3° =
//      fold), or from the sewing line as a whole round a corner (parallel);
//   7. the rest: placement when its bbox is ≥ 40 mm both ways and it is not a straight line (a part
//      on top has an outline, not a ruler line), else other.
// No rule knows a garment: only the geometry of the marks and the piece's own sewing line.

import {
  SKELETON,
  type Edge,
  type Mm,
  type PieceGeom,
  type PieceMark,
  type PieceMarkKind,
  type Pt2,
  type SkeletonPieceInput,
} from '../types';

const MM_PER_CM = 10;
const NOTCH_LAYER = '4';
const GRAIN_LAYER = '7';

/** Twins: lengths within this share, mean distance within this. */
const TWIN_LEN_REL = 0.02;
const TWIN_DIST_MM = 2;
/** A clipped copy (Gerber L85) must be at least this long to be folded into its longer twin. */
const CLIPPED_MIN_MM = 20;
/** Seam copy: a loop smaller than this share of the piece is never a copy of its contour. */
const SEAM_COPY_MIN_AREA = 0.3;
/** Seam copy lying on the sewing line: 95 % of it this close. */
const SEAM_ON_LINE_MM = 1.5;
/** The cut line is never further than this from the sewing line (a hem allowance + mitre). */
const SEAM_ALLOWANCE_MAX_MM = 80;
/** Straight: chord / length at least this. */
const STRAIGHT = 0.98;
/** Buttonhole length range, mm. */
const BUTTONHOLE_MM: readonly [number, number] = [12, 40];
/** A buttonhole end tick: a short straight segment across the end. */
const TICK_MAX_MM = 10;
const TICK_END_MM = 1.5;
const TICK_ANGLE_DEG = 60;
/** Two short segments crossing at least this steeply are a drill cross. */
const CROSS_ANGLE_DEG = 30;
/** Small items closer than this belong to one drill (a circle with its cross). */
const DRILL_CLUSTER_MM = 1.5;
/** vee: corner turn, corner window and merge, ends on the sewing line, legs glued at a point. */
const VEE_TURN_DEG = 25;
const VEE_WIN_MM = 3;
const VEE_MERGE_MM = 8;
const VEE_END_MM = 10;
const VEE_GLUE_MM = 2;
const VEE_LEG_MIN_MM = 20;
/** fold / parallel: RMS around the offset, share of the path along the one edge. */
const PARALLEL_RMS_MM = 4;
const PARALLEL_COVER = 0.6;
const FOLD_STRAIGHT = 0.99;
const FOLD_ANGLE_DEG = 3;
/** placement: bbox at least this both ways. */
const PLACEMENT_MIN_MM = 40;
/** Path sampling step for distance work, mm. */
const SAMPLE_MM = 2;

// ── small geometry ──────────────────────────────────────────────────────────────────────────

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLen(pts: readonly Pt2[], closed: boolean): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) len += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) len += dist(pts[pts.length - 1], pts[0]);
  return len;
}

function areaOf(pts: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

type BBox = { x0: number; y0: number; x1: number; y1: number };
function bboxOf(pts: readonly Pt2[]): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}
const bw = (b: BBox) => b.x1 - b.x0;
const bh = (b: BBox) => b.y1 - b.y0;
const bboxNear = (a: BBox, b: BBox, pad: number) =>
  a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;

/** Points ~`step` apart along a path (ends kept). */
function sample(pts: readonly Pt2[], closed: boolean, step: number): Pt2[] {
  const ring = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  const out: Pt2[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const k = Math.max(1, Math.round(dist(a, b) / step));
    for (let j = 0; j < k; j++)
      out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && ring.length) out.push(ring[ring.length - 1]);
  return out.length ? out : [...pts];
}

function segDist(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let t = l2 > 1e-12 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function polyDist(p: Pt2, pts: readonly Pt2[], closed: boolean): number {
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i + 1 < n; i++) best = Math.min(best, segDist(p, pts[i], pts[i + 1]));
  if (closed && n > 2) best = Math.min(best, segDist(p, pts[n - 1], pts[0]));
  return best;
}

/** Angle between two directions, 0..90°, orientation-free. */
function lineAngle(a0: Pt2, a1: Pt2, b0: Pt2, b1: Pt2): number {
  const ux = a1[0] - a0[0];
  const uy = a1[1] - a0[1];
  const vx = b1[0] - b0[0];
  const vy = b1[1] - b0[1];
  const c = Math.abs(ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/** Do segments ab and cd cross (proper or touching)? */
function segmentsCross(a: Pt2, b: Pt2, c: Pt2, d: Pt2): boolean {
  const o = (p: Pt2, q: Pt2, r: Pt2) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  const eps = 1e-6;
  return d1 * d2 <= eps && d3 * d4 <= eps;
}

/** Turn at `i` over ±w samples, degrees (signed). */
function turnAt(pts: readonly Pt2[], i: number, w: number): number {
  const a = pts[i - w];
  const b = pts[i];
  const c = pts[i + w];
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  return (Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y) * 180) / Math.PI;
}

// ── the sewing line, indexed ────────────────────────────────────────────────────────────────

const CELL_MM = 10;
/** Grid cell → one number (cells stay well inside ±2^20 for any garment in mm). */
const cellKey = (gx: number, gy: number) => (gx + 1048576) * 2097152 + (gy + 1048576);

/** Nearest point of the sewing line (`rs`, 1 mm resample) and the edge it lies on, via a grid. */
class SewLine {
  private readonly grid = new Map<number, number[]>();
  private readonly edgeOf: Int32Array;
  private readonly alongOf: Float64Array;
  /** No point of the line is further than this from any query inside the line's bbox ± reach. */
  private readonly reach: number;
  /** The line every 8 mm: distances far from it (cut line 10–80 mm out) without the grid's cost. */
  private readonly coarse: Pt2[];
  constructor(
    readonly rs: readonly Pt2[],
    readonly edges: readonly Edge[],
  ) {
    const n = rs.length;
    this.edgeOf = new Int32Array(n).fill(-1);
    this.alongOf = new Float64Array(n);
    edges.forEach((e, k) => {
      const span = e.e > e.s ? e.e - e.s : n - e.s + e.e;
      let along = 0;
      for (let j = 0; j <= span; j++) {
        const i = (e.s + j) % n;
        if (j > 0) along += dist(rs[(e.s + j - 1) % n], rs[i]);
        if (this.edgeOf[i] < 0 || j < span) {
          this.edgeOf[i] = k;
          this.alongOf[i] = along;
        }
      }
    });
    this.coarse = rs.filter((_, i) => i % 8 === 0);
    const b = bboxOf(rs);
    this.reach = rs.length ? 2 * Math.hypot(bw(b), bh(b)) + 1e4 : 0;
    rs.forEach((p, i) => {
      const key = cellKey(Math.floor(p[0] / CELL_MM), Math.floor(p[1] / CELL_MM));
      const cell = this.grid.get(key);
      if (cell) cell.push(i);
      else this.grid.set(key, [i]);
    });
  }

  /** Nearest resample index and its distance. */
  /** Nearest resample index and its distance; past `maxD` the search stops (idx −1, d ∞). */
  nearest(p: Pt2, maxD = Infinity): { idx: number; d: number } {
    if (!this.rs.length) return { idx: -1, d: Infinity };
    const cx = Math.floor(p[0] / CELL_MM);
    const cy = Math.floor(p[1] / CELL_MM);
    let idx = -1;
    let d = Infinity;
    for (let r = 0; r < 4096; r++) {
      // Ring r: once a hit is closer than the ring's inner reach, no farther ring can beat it.
      if (idx >= 0 && d <= (r - 1) * CELL_MM) break;
      if ((r - 1) * CELL_MM > maxD || (r - 1) * CELL_MM > this.reach) break;
      const visit = (gx: number, gy: number) => {
        for (const i of this.grid.get(cellKey(gx, gy)) ?? []) {
          const di = dist(p, this.rs[i]);
          if (di < d) {
            d = di;
            idx = i;
          }
        }
      };
      if (r === 0) visit(cx, cy);
      // The ring's perimeter only: top and bottom rows, then the two side columns.
      for (let gx = cx - r; r > 0 && gx <= cx + r; gx++) {
        visit(gx, cy - r);
        visit(gx, cy + r);
      }
      for (let gy = cy - r + 1; r > 0 && gy <= cy + r - 1; gy++) {
        visit(cx - r, gy);
        visit(cx + r, gy);
      }
    }
    return d <= maxD ? { idx, d } : { idx: -1, d: Infinity };
  }

  /** Distance to the line through its 8 mm chords (≤ 0.1 mm off on garment curves). */
  far(p: Pt2): number {
    return polyDist(p, this.coarse, true);
  }

  /** Nearest edge of a point: its id, the distance and the foot's position along the edge. */
  nearEdge(p: Pt2): { k: number; offsetMm: Mm; alongMm: Mm } | null {
    const { idx, d } = this.nearest(p);
    if (idx < 0) return null;
    let k = this.edgeOf[idx];
    let along = this.alongOf[idx];
    if (k < 0) {
      // A corner artefact too short to be an edge: the closest real edge.
      let best = Infinity;
      this.edges.forEach((e, ek) => {
        e.pts.forEach((q, j) => {
          const dq = dist(q, p);
          if (dq < best) {
            best = dq;
            k = ek;
            along = pathLen(e.pts.slice(0, j + 1), false);
          }
        });
      });
      if (k < 0) return null;
    }
    return { k, offsetMm: d, alongMm: along };
  }
}

// ── paths ───────────────────────────────────────────────────────────────────────────────────

type Path = {
  layer: string;
  closed: boolean;
  pts: Pt2[];
  len: Mm;
  box: BBox;
  /** Input order (stable ids). */
  order: number;
};

function makePath(layer: string, closed: boolean, raw: Pt2[], order: number): Path | null {
  const pts = raw.filter((q, i) => i === 0 || dist(q, raw[i - 1]) > 1e-6);
  let isClosed = closed;
  if (isClosed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= 1e-6) pts.pop();
  // A «closed» path of two points (CLO crosses) is a segment.
  if (isClosed && (pts.length < 3 || areaOf(pts) < 1e-6)) isClosed = false;
  if (pts.length === 0) return null;
  return { layer, closed: isClosed, pts, len: pathLen(pts, isClosed), box: bboxOf(pts), order };
}

const isStraight = (p: Path, min = STRAIGHT) =>
  !p.closed && p.len > 0 && dist(p.pts[0], p.pts[p.pts.length - 1]) / p.len >= min;
const isSmall = (p: Path) => Math.max(bw(p.box), bh(p.box)) <= SKELETON.markDrillMaxMm;
const ends = (p: Path): [Pt2, Pt2] => [p.pts[0], p.pts[p.pts.length - 1]];

/** Twin tests sample a path at this many points. */
const TWIN_SAMPLES = 48;
/** Share of one path's samples that must lie on the other: same line twice / clipped copy. */
const TWIN_SHARE = 0.9;
const CLIPPED_SHARE = 0.95;

/** Points of a path every ≤ 1 mm in a grid of TWIN_DIST_MM cells: «is p within 2 mm of it». */
class PathGrid {
  private readonly cells = new Map<number, Pt2[]>();
  constructor(p: Path) {
    for (const q of sample(p.pts, p.closed, 1)) {
      const k = cellKey(Math.floor(q[0] / TWIN_DIST_MM), Math.floor(q[1] / TWIN_DIST_MM));
      const c = this.cells.get(k);
      if (c) c.push(q);
      else this.cells.set(k, [q]);
    }
  }
  /** Within TWIN_DIST_MM (+ the 0.5 mm of the 1 mm sampling). */
  near(p: Pt2): boolean {
    const cx = Math.floor(p[0] / TWIN_DIST_MM);
    const cy = Math.floor(p[1] / TWIN_DIST_MM);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const q of this.cells.get(cellKey(gx, gy)) ?? []) {
          if (dist(p, q) <= TWIN_DIST_MM + 0.5) return true;
        }
      }
    }
    return false;
  }
}

/** Does at least `share` of `a`'s samples lie on `b`? Gives up as soon as it cannot. */
function liesOn(a: Path, b: PathGrid, share: number): boolean {
  const sa = sample(a.pts, a.closed, Math.max(1, a.len / TWIN_SAMPLES));
  const allowed = Math.floor((1 - share) * sa.length);
  let off = 0;
  for (const p of sa) if (!b.near(p) && ++off > allowed) return false;
  return true;
}

// ── report ──────────────────────────────────────────────────────────────────────────────────

/** Switches for the probe's negative controls; the product runs with everything on. */
export type MarkOptions = {
  /** Step 3: collapse L8/L85 twins and duplicates. */
  twins?: boolean;
  /** Step 2: drop copies of the sewing line. */
  seamCopy?: boolean;
  /** Step 6: lines along an edge are fold / parallel, not placement. */
  parallel?: boolean;
  /** Step 7: a straight line is never a placement (a part on top has an outline, not a ruler line). */
  straight?: boolean;
};

export type MarkReport = {
  marks: PieceMark[];
  /** What was dropped before classification (counts), for the probe and for explanations. */
  dropped: { twins: number; seamCopies: number; ticks: number };
};

/**
 * Every internal mark of a piece, classified; seam-line copies, twins and buttonhole ticks are left
 * out (counted in `dropped`). Points are mm in the frame of `geom.rs`.
 */
export function classifyMarks(
  input: SkeletonPieceInput,
  geom: PieceGeom,
  opts: MarkOptions = {},
): MarkReport {
  const o = { twins: true, seamCopy: true, parallel: true, straight: true, ...opts };
  const dropped = { twins: 0, seamCopies: 0, ticks: 0 };
  const contourLayer = input.piece.layer ?? '';
  const sew = new SewLine(geom.rs, geom.edges);

  // 1. inner paths in mm
  let paths: Path[] = [];
  (input.piece.inner ?? []).forEach((ip, i) => {
    if (ip.layer === NOTCH_LAYER || ip.layer === GRAIN_LAYER) return;
    if (ip.layer === contourLayer && ip.closed && ip.pts.length >= 3) {
      // The contour layer's own big loops are the contour; its small loops (drills) stay.
      const pts: Pt2[] = ip.pts.map((q) => [q.x * MM_PER_CM, q.y * MM_PER_CM]);
      if (areaOf(pts) > SEAM_COPY_MIN_AREA * geom.areaMm2) return;
    }
    const p = makePath(
      ip.layer,
      ip.closed,
      ip.pts.map((q) => [q.x * MM_PER_CM, q.y * MM_PER_CM]),
      i,
    );
    if (p) paths.push(p);
  });

  // 2. copies of the sewing line — first, so the big loops never reach the twin pass. Counted
  // once per distinct copy (the cut line on L1 and on L84 is one copy).
  if (o.seamCopy && geom.rs.length) {
    const copies: Path[] = [];
    const sameAs = (c: Path, p: Path) =>
      c.closed === p.closed &&
      Math.abs(c.len - p.len) <= TWIN_LEN_REL * Math.max(c.len, p.len) &&
      Math.abs(c.box.x0 - p.box.x0) <= TWIN_DIST_MM &&
      Math.abs(c.box.y0 - p.box.y0) <= TWIN_DIST_MM &&
      Math.abs(c.box.x1 - p.box.x1) <= TWIN_DIST_MM &&
      Math.abs(c.box.y1 - p.box.y1) <= TWIN_DIST_MM;
    paths = paths.filter((p) => {
      // The same loop on another layer as a copy already found: that copy again, not tested.
      if (!copies.some((c) => sameAs(c, p))) {
        if (!isSeamCopy(p, sew, geom)) return true;
        dropped.seamCopies++;
      }
      copies.push(p);
      return false;
    });
  }

  // 3. twins
  if (o.twins) {
    const gone = new Set<number>();
    const grids = new Map<number, PathGrid>();
    const gridOf = (p: Path) => {
      let g = grids.get(p.order);
      if (!g) grids.set(p.order, (g = new PathGrid(p)));
      return g;
    };
    const byLen = [...paths].sort((a, b) => b.len - a.len || a.order - b.order);
    for (let i = 0; i < byLen.length; i++) {
      const a = byLen[i];
      if (gone.has(a.order)) continue;
      for (let j = i + 1; j < byLen.length; j++) {
        const b = byLen[j];
        if (gone.has(b.order) || !bboxNear(a.box, b.box, TWIN_DIST_MM)) continue;
        const sameLen = Math.abs(a.len - b.len) <= TWIN_LEN_REL * Math.max(a.len, b.len, 1);
        if (sameLen && a.closed === b.closed) {
          if (liesOn(b, gridOf(a), TWIN_SHARE) && liesOn(a, gridOf(b), TWIN_SHARE)) {
            gone.add(b.order);
          }
          continue;
        }
        // A clipped copy on another layer (Gerber L85 = the sew-side stretch of the L8 line).
        if (b.layer !== a.layer && b.len >= CLIPPED_MIN_MM && liesOn(b, gridOf(a), CLIPPED_SHARE)) {
          gone.add(b.order);
        }
      }
    }
    dropped.twins = gone.size;
    paths = paths.filter((p) => !gone.has(p.order));
  }

  type Out = { kind: PieceMarkKind; path: Path; extra?: Partial<PieceMark> };
  const out: Out[] = [];
  const used = new Set<number>();
  const take = (kind: PieceMarkKind, path: Path, extra?: Partial<PieceMark>) => {
    out.push({ kind, path, extra });
    used.add(path.order);
  };

  // 4a. buttonholes: straight 12–40 mm, not crossed near the middle; end ticks absorbed
  const segs = paths.filter((p) => isStraight(p));
  const crossedMid = (b: Path) =>
    segs.some((s) => {
      if (s === b || !isSmall(s)) return false;
      const [a0, a1] = ends(b);
      const [c0, c1] = ends(s);
      if (!segmentsCross(a0, a1, c0, c1)) return false;
      if (lineAngle(a0, a1, c0, c1) < CROSS_ANGLE_DEG) return false;
      // Crossing within the middle 60 % of b: a cross, not a tick at the end.
      const m: Pt2 = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
      return Math.min(dist(m, a0), dist(m, a1)) > 0.2 * b.len;
    });
  for (const b of segs) {
    if (used.has(b.order) || b.len < BUTTONHOLE_MM[0] || b.len > BUTTONHOLE_MM[1]) continue;
    if (crossedMid(b)) continue;
    const [b0, b1] = ends(b);
    const ticks = segs.filter((s) => {
      if (s === b || used.has(s.order) || s.len > TICK_MAX_MM) return false;
      const [c0, c1] = ends(s);
      if (lineAngle(b0, b1, c0, c1) < TICK_ANGLE_DEG) return false;
      return Math.min(segDist(b0, c0, c1), segDist(b1, c0, c1)) <= TICK_END_MM;
    });
    const atStart = ticks.some((s) => segDist(b0, ...ends(s)) <= TICK_END_MM);
    const atEnd = ticks.some((s) => segDist(b1, ...ends(s)) <= TICK_END_MM);
    if (!(atStart && atEnd) && b.len <= SKELETON.markDrillMaxMm) continue;
    for (const t of ticks) used.add(t.order);
    dropped.ticks += ticks.length;
    take('buttonhole', b, { nearEdge: nearEdgeOf(sew, geom, centreOf(b.box)) });
  }

  // 4b. drills: clusters of small items holding a loop or a cross
  const small = paths.filter((p) => !used.has(p.order) && isSmall(p));
  const parent = small.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < small.length; i++) {
    for (let j = i + 1; j < small.length; j++) {
      if (bboxNear(small[i].box, small[j].box, DRILL_CLUSTER_MM)) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, Path[]>();
  small.forEach((p, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), p]));
  for (const group of [...clusters.values()].sort((a, b) => a[0].order - b[0].order)) {
    const loop = group.find((p) => p.closed);
    const lines = group.filter((p) => !p.closed && p.pts.length >= 2);
    let cross = false;
    for (let i = 0; i < lines.length && !cross; i++) {
      for (let j = i + 1; j < lines.length && !cross; j++) {
        const [a0, a1] = ends(lines[i]);
        const [c0, c1] = ends(lines[j]);
        cross = segmentsCross(a0, a1, c0, c1) && lineAngle(a0, a1, c0, c1) >= CROSS_ANGLE_DEG;
      }
    }
    if (!loop && !cross) continue;
    const box = bboxOf(group.flatMap((p) => p.pts));
    const head = loop ?? [...lines].sort((a, b) => b.len - a.len)[0];
    // One drill: the loop (or the cross's arms end to end) stands for the whole cluster.
    const pts = loop ? loop.pts : lines.flatMap((p) => p.pts);
    for (const p of group) used.add(p.order);
    out.push({
      kind: 'drill',
      path: { ...head, pts, box, closed: !!loop, len: loop ? loop.len : pathLen(pts, false) },
      extra: { nearEdge: nearEdgeOf(sew, geom, centreOf(box)) },
    });
  }

  // 5. vee: glue two straight legs meeting at a point, then one sharp corner, ends on the line
  const open = paths.filter((p) => !used.has(p.order) && !p.closed && !isSmall(p));
  const glued = new Set<number>();
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (glued.has(a.order) || glued.has(b.order)) continue;
      if (a.len < VEE_LEG_MIN_MM || b.len < VEE_LEG_MIN_MM) continue;
      if (!isStraight(a) || !isStraight(b)) continue;
      for (const [pa, pb] of [
        [a.pts, b.pts],
        [[...a.pts].reverse(), b.pts],
        [a.pts, [...b.pts].reverse()],
        [[...a.pts].reverse(), [...b.pts].reverse()],
      ] as [Pt2[], Pt2[]][]) {
        if (dist(pa[pa.length - 1], pb[0]) > VEE_GLUE_MM) continue;
        const joined = makePath(a.layer, false, [...pa, ...pb.slice(1)], a.order);
        const v = joined && veeOf(joined, sew, geom);
        if (joined && v) {
          glued.add(a.order);
          glued.add(b.order);
          used.add(a.order);
          used.add(b.order);
          out.push({ kind: 'vee', path: joined, extra: { vee: v } });
        }
        break;
      }
    }
  }
  for (const p of open) {
    if (used.has(p.order)) continue;
    const v = veeOf(p, sew, geom);
    if (v) take('vee', p, { vee: v });
  }

  // 6. fold / parallel
  if (o.parallel) {
    for (const p of paths) {
      if (used.has(p.order) || p.closed || isSmall(p)) continue;
      const par = parallelOf(p, sew, geom);
      if (!par) continue;
      const fold =
        isStraight(p, FOLD_STRAIGHT) &&
        p.len >= SKELETON.markFoldMinMm &&
        par.angleDeg <= FOLD_ANGLE_DEG;
      take(fold ? 'fold' : 'parallel', p, { nearEdge: par.nearEdge });
    }
  }

  // 7. the rest
  for (const p of paths) {
    if (used.has(p.order)) continue;
    const big = bw(p.box) >= PLACEMENT_MIN_MM && bh(p.box) >= PLACEMENT_MIN_MM;
    take(big && !(o.straight && isStraight(p)) ? 'placement' : 'other', p);
  }

  out.sort((a, b) => a.path.order - b.path.order);
  const marks = out.map(({ kind, path, extra }, i): PieceMark => {
    const box = path.box;
    return {
      id: `${input.pieceKey}@${i}`,
      kind,
      layer: path.layer,
      closed: path.closed,
      pts: path.pts,
      bbox: { w: bw(box), h: bh(box), cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 },
      lenMm: path.len,
      ...extra,
    };
  });
  return { marks, dropped };
}

/** P2 step 0: the classified internal marks of a piece (seam copies, twins, ticks left out). */
export function collectMarks(input: SkeletonPieceInput, geom: PieceGeom): PieceMark[] {
  return classifyMarks(input, geom).marks;
}

// ── classifiers ─────────────────────────────────────────────────────────────────────────────

/**
 * A copy of the sewing line, in any of the three shapes the corpus writes it:
 *   - on the line: every point within SEAM_ON_LINE_MM of it (Gerber L87 = L14; a CLO open L8
 *     stretch of the sewing line in mode-B files);
 *   - the cut line around it: a loop enclosing the whole sewing line no further than
 *     SEAM_ALLOWANCE_MAX_MM from it (allowances differ per edge — hem 25–40 mm, sides 10 mm — so its
 *     bbox is NOT the contour + 2·SA);
 *   - the sewing line inside the cut line (the design's rule): a loop at one constant distance
 *     from the contour, its bbox = the contour's − 2·distance (± markSeamCopyTolMm).
 * A pocket outline or any other mark inside fails all three: it is not on the line, does not
 * enclose it, and is not at one constant distance from every edge.
 */
function isSeamCopy(p: Path, sew: SewLine, geom: PieceGeom): boolean {
  const tol = SKELETON.markSeamCopyTolMm;
  const area = p.closed ? areaOf(p.pts) : 0;
  const bigLoop = p.closed && area >= SEAM_COPY_MIN_AREA * geom.areaMm2;
  const dists = (step: number, maxD = Infinity) =>
    sample(p.pts, p.closed, step)
      .map((q) => sew.nearest(q, maxD).d)
      .sort((x, y) => x - y);
  const at = (ds: number[], f: number) => ds[Math.min(ds.length - 1, Math.floor(ds.length * f))];
  // On the line: a cheap 8-point probe, then 95 % of a finer sampling within SEAM_ON_LINE_MM.
  const onLine = () => {
    if (p.len < CLIPPED_MIN_MM) return false;
    if (dists(p.len / 8, 2 * SEAM_ON_LINE_MM).some((d) => !Number.isFinite(d))) return false;
    return (
      at(dists(Math.max(SAMPLE_MM, p.len / 120), 2 * SEAM_ON_LINE_MM), 0.95) <= SEAM_ON_LINE_MM
    );
  };
  if (!bigLoop) return onLine();
  const cb = bboxOf(geom.rs);
  if (area >= geom.areaMm2) {
    // The cut line around the sewing line.
    const probe = geom.rs.filter((_, i) => i % 16 === 0);
    if (probe.filter((q) => pointInPoly(q, p.pts)).length < 0.95 * probe.length) return onLine();
    return sample(p.pts, true, Math.max(SAMPLE_MM, p.len / 40)).every(
      (q) => sew.far(q) <= SEAM_ALLOWANCE_MAX_MM,
    );
  }
  // The sewing line inside the cut line: both bbox sides shrunk by the same 2·distance.
  const dw = bw(cb) - bw(p.box);
  const dh = bh(cb) - bh(p.box);
  if (Math.abs(dw - dh) > 2 * tol || Math.min(dw, dh) < -tol) return onLine();
  const ds = sample(p.pts, true, Math.max(SAMPLE_MM, p.len / 120))
    .map((q) => sew.far(q))
    .sort((x, y) => x - y);
  const d = at(ds, 0.5);
  return (
    (at(ds, 0.95) <= SEAM_ON_LINE_MM && p.len >= CLIPPED_MIN_MM) ||
    (at(ds, 0.9) - at(ds, 0.1) <= 2 * tol &&
      Math.abs(dw - 2 * d) <= tol &&
      Math.abs(dh - 2 * d) <= tol)
  );
}

function pointInPoly(p: Pt2, poly: readonly Pt2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}

const centreOf = (b: BBox): Pt2 => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

function nearEdgeOf(sew: SewLine, geom: PieceGeom, p: Pt2): PieceMark['nearEdge'] {
  const ne = sew.nearEdge(p);
  return ne ? { edge: geom.edges[ne.k].id, offsetMm: ne.offsetMm, alongMm: ne.alongMm } : undefined;
}

/** Corners of an open path: local maxima of the windowed turn above VEE_TURN_DEG. */
function cornersOf(pts: readonly Pt2[]): number[] {
  const w = Math.max(1, Math.round(VEE_WIN_MM));
  const turn: number[] = pts.map((_, i) =>
    i >= w && i + w < pts.length ? Math.abs(turnAt(pts, i, w)) : 0,
  );
  const out: number[] = [];
  for (let i = w; i + w < pts.length; i++) {
    if (turn[i] < VEE_TURN_DEG) continue;
    let max = true;
    for (let d = -w; d <= w && max; d++) if (d && turn[i + d] > turn[i]) max = false;
    if (!max) continue;
    if (out.length && i - out[out.length - 1] < VEE_MERGE_MM) continue;
    out.push(i);
  }
  return out;
}

function veeOf(p: Path, sew: SewLine, geom: PieceGeom): PieceMark['vee'] | null {
  if (p.closed || p.pts.length < 3) return null;
  const rs = sample(p.pts, false, 1);
  const cs = cornersOf(rs);
  if (cs.length !== 1) return null;
  const [e0, e1] = ends(p);
  const apex = rs[cs[0]];
  if (sew.nearest(e0).d > VEE_END_MM || sew.nearest(e1).d > VEE_END_MM) return null;
  if (sew.nearest(apex).d <= VEE_END_MM) return null;
  const intakeMm = dist(e0, e1);
  const depthMm = intakeMm > 1e-6 ? segDistLine(apex, e0, e1) : dist(apex, e0);
  const ux = e0[0] - apex[0];
  const uy = e0[1] - apex[1];
  const vx = e1[0] - apex[0];
  const vy = e1[1] - apex[1];
  const apexDeg =
    (Math.acos(
      Math.max(
        -1,
        Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)),
      ),
    ) *
      180) /
    Math.PI;
  const ne = sew.nearEdge([(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2]);
  if (!ne) return null;
  return { intakeMm, depthMm, apexDeg, edge: geom.edges[ne.k].id };
}

/** Distance from p to the infinite line through a, b. */
function segDistLine(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  return Math.abs(vx * (p[1] - a[1]) - vy * (p[0] - a[0])) / (Math.hypot(vx, vy) || 1);
}

/** Nearest point of an edge (its 1 mm points as a polyline): distance, foot, foot along the edge. */
/** An edge's 1 mm points every EDGE_STEP-th (and the last): ample for distances, 4× cheaper. */
const EDGE_STEP = 4;
const coarse = new WeakMap<Edge, Pt2[]>();
function coarseOf(e: Edge): Pt2[] {
  let c = coarse.get(e);
  if (!c) {
    c = e.pts.filter((_, i) => i % EDGE_STEP === 0 || i === e.pts.length - 1);
    coarse.set(e, c);
  }
  return c;
}

function edgeFoot(p: Pt2, e: Edge): { d: number; foot: Pt2; along: number } {
  const pts = coarseOf(e);
  let best = { d: Infinity, foot: pts[0], along: 0 };
  let along = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let t = l2 > 1e-12 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const f: Pt2 = [a[0] + t * vx, a[1] + t * vy];
    const d = dist(p, f);
    if (d < best.d) best = { d, foot: f, along: along + t * Math.sqrt(l2) };
    along += Math.sqrt(l2);
  }
  return best;
}

/**
 * A line following one edge at a constant offset: at least PARALLEL_COVER of its samples sit at
 * the median distance from that edge (± 1.5·PARALLEL_RMS_MM), with an RMS around it within
 * PARALLEL_RMS_MM, the median no further than markFoldOffsetMm. Every edge is tried, not only the
 * nearest one: a fold in the middle of a placket is equidistant from both long edges. The best
 * edge is the best covered, then the nearer, then the lower index. `angleDeg` = the line's chord
 * against its feet's chord on the edge.
 */
function parallelOf(
  p: Path,
  sew: SewLine,
  geom: PieceGeom,
): { nearEdge: NonNullable<PieceMark['nearEdge']>; angleDeg: number } | null {
  const sp = sample(p.pts, false, Math.max(SAMPLE_MM, p.len / 80));
  type Foot = { q: Pt2; d: number; foot: Pt2; along: number };
  type Fit = { k: number; cover: number; offset: number; on: Foot[] };
  /** The samples at one constant offset from `feet`, or null when they are not enough. */
  const fitOf = (k: number, feet: Foot[]): Fit | null => {
    const ds = feet.map((f) => f.d).sort((x, y) => x - y);
    const offset = ds[Math.floor(ds.length / 2)];
    if (offset > SKELETON.markFoldOffsetMm) return null;
    const on = feet.filter((f) => Math.abs(f.d - offset) <= 1.5 * PARALLEL_RMS_MM);
    const cover = on.length / sp.length;
    if (cover < PARALLEL_COVER) return null;
    const rms = Math.sqrt(on.reduce((acc, f) => acc + (f.d - offset) ** 2, 0) / on.length);
    return rms > PARALLEL_RMS_MM ? null : { k, cover, offset, on };
  };
  let best: Fit | null = null;
  for (let k = 0; k < geom.edges.length; k++) {
    const e = geom.edges[k];
    // Cheap reject: the line's bbox must come within reach of the edge's.
    if (!bboxNear(p.box, bboxOf(e.pts), SKELETON.markFoldOffsetMm)) continue;
    const fit = fitOf(
      k,
      sp.map((q) => ({ q, ...edgeFoot(q, e) })),
    );
    if (
      fit &&
      (!best ||
        fit.cover > best.cover + 1e-9 ||
        (Math.abs(fit.cover - best.cover) <= 1e-9 && fit.offset < best.offset - 1e-9))
    ) {
      best = fit;
    }
  }
  if (best) {
    const { k, offset, on } = best;
    const first = on[0];
    const last = on[on.length - 1];
    const angleDeg =
      dist(first.q, last.q) > 1 ? lineAngle(first.q, last.q, first.foot, last.foot) : 90;
    const mid = on[Math.floor(on.length / 2)];
    return { nearEdge: { edge: geom.edges[k].id, offsetMm: offset, alongMm: mid.along }, angleDeg };
  }
  // Around a corner: topstitching that follows two or three edges (a collar's points) keeps one
  // offset from the sewing line as a whole, not from any single edge. Parallel, never a fold.
  const feet: Foot[] = [];
  const edgeCount = new Map<number, number>();
  for (const q of sp) {
    const ne = sew.nearEdge(q);
    if (!ne) continue;
    feet.push({ q, d: ne.offsetMm, foot: q, along: ne.alongMm });
    edgeCount.set(ne.k, (edgeCount.get(ne.k) ?? 0) + 1);
  }
  const whole = feet.length ? fitOf(-1, feet) : null;
  if (!whole) return null;
  let k = -1;
  let n = 0;
  for (const [ek, c] of edgeCount) if (c > n || (c === n && ek < k)) [k, n] = [ek, c];
  const mid = whole.on[Math.floor(whole.on.length / 2)];
  return {
    nearEdge: { edge: geom.edges[k].id, offsetMm: whole.offset, alongMm: mid.along },
    angleDeg: 90,
  };
}
