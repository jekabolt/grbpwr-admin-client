// Spatial indexes for the geometry pass — EXACT accelerators.
//
// Every query here answers what the full scan it replaced answered: the candidates that can win are
// measured with the same arithmetic in the same order under the same tie rule; only candidates that
// provably cannot win are not looked at. Two devices keep that proof honest:
//   - a prune compares a bbox bound against a measured distance; both are Math.hypot of
//     differences rounded independently, so a prune fires only when the bound beats the distance
//     by PRUNE_EPS_MM — far above double rounding at garment scale, far below anything geometric;
//   - a point is filed into a cell by floor(x / cell); at a cell boundary the division may round it
//     into the neighbour, so a ring is declared out of reach only when its geometric distance
//     exceeds the limit by that same margin.
// Why it exists (card 61, 171 pieces, 187k resample points, one build): SewLine.nearest walked
// 1.5 M grid cells through a Map for 24k queries, edgeFoot measured 3.8 M segments for 42k
// queries, far() 2.0 M — three quarters of buildAssemblyPieces. The indexes cut the candidates,
// not the answers (marks.ts / segment.ts callers; identity proved by canonical JSON of the built
// pieces on card 61, a ×4 copy of it and the CLO / prod DXF corpora).

import type { Pt2 } from '../types';

export const PRUNE_EPS_MM = 1e-6;

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export type BBox = { x0: number; y0: number; x1: number; y1: number };

export function bboxOf(pts: readonly Pt2[]): BBox {
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

/** Distance from a point to a bbox (0 inside): a lower bound of its distance to anything in it. */
export const boxDist = (p: Pt2, b: BBox) =>
  Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1));

/** Above this many cells the dense table gives way to a map: a misread unit can blow a contour up. */
const DENSE_MAX_CELLS = 1 << 22;
/**
 * Blocks of COARSE × COARSE cells carry an occupancy bit. A query whose block and the eight around
 * it are empty has every point at least COARSE + 1 cells away — with 10 mm cells, 70 mm: beyond the
 * 66 mm the marks ever ask for, so such a miss costs nine lookups instead of 15 × 15 cells. It
 * catches a query 70–210 mm from the line, i.e. the middle of a big panel (card 70: 155 of 165
 * misses at 66 mm; prod corpus: 1 446 of 7 422; card 61, small pieces: 40 of 2 023 — there the
 * misses still walk ~220 cells each, half of all cells walked; an exact chessboard distance
 * transform of the cells would start every walk at the first non-empty ring, for ~3 ms of
 * transform per build of card 61 against ~8 ms of walking — left undone).
 */
const COARSE = 7;

/**
 * Points on a uniform grid. CSR over the cells (two Int32Arrays: no hashing, no allocation per
 * lookup); within a cell the indices ascend, as a scan in input order would meet them. The cells
 * are dense over the points' bbox, or — past DENSE_MAX_CELLS — the occupied ones numbered through
 * a map.
 */
export class PointGrid {
  /** Exact bbox of the points (what `bboxOf(pts)` returns), gathered in the same pass. */
  readonly box: BBox;
  private readonly gx0: number;
  private readonly gy0: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  /** Occupied cell → CSR slot when the grid is too large for a dense table; null when dense. */
  private readonly slots: Map<number, number> | null;
  private readonly crows: number;
  private readonly ccols: number;
  private readonly coarse: Uint8Array | null;

  constructor(
    readonly pts: readonly Pt2[],
    readonly cell: number,
  ) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let gx0 = Infinity;
    let gy0 = Infinity;
    let gx1 = -Infinity;
    let gy1 = -Infinity;
    const n = pts.length;
    const cx = new Int32Array(n);
    const cy = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      cx[i] = gx;
      cy[i] = gy;
      if (gx < gx0) gx0 = gx;
      if (gy < gy0) gy0 = gy;
      if (gx > gx1) gx1 = gx;
      if (gy > gy1) gy1 = gy;
    }
    this.box = { x0, y0, x1, y1 };
    if (n === 0) {
      this.gx0 = this.gy0 = 0;
      this.cols = this.rows = 0;
      this.start = new Int32Array(1);
      this.items = new Int32Array(0);
      this.slots = null;
      this.crows = this.ccols = 0;
      this.coarse = null;
      return;
    }
    this.gx0 = gx0;
    this.gy0 = gy0;
    this.cols = gx1 - gx0 + 1;
    this.rows = gy1 - gy0 + 1;
    const cells = this.cols * this.rows;
    const rows = this.rows;
    // Cell → CSR slot: the cell index itself when dense, else a number per occupied cell.
    let slotOf: (c: number) => number;
    let slotCount: number;
    if (Number.isFinite(cells) && cells <= DENSE_MAX_CELLS) {
      this.slots = null;
      slotOf = (c) => c;
      slotCount = cells;
    } else {
      const slots = new Map<number, number>();
      for (let i = 0; i < n; i++) {
        const c = (cx[i] - gx0) * rows + (cy[i] - gy0);
        if (!slots.has(c)) slots.set(c, slots.size);
      }
      this.slots = slots;
      slotOf = (c) => slots.get(c)!;
      slotCount = slots.size;
    }
    const start = new Int32Array(slotCount + 1);
    for (let i = 0; i < n; i++) start[slotOf((cx[i] - gx0) * rows + (cy[i] - gy0)) + 1]++;
    for (let s = 0; s < slotCount; s++) start[s + 1] += start[s];
    const fill = start.slice(0, slotCount);
    const items = new Int32Array(n);
    for (let i = 0; i < n; i++) items[fill[slotOf((cx[i] - gx0) * rows + (cy[i] - gy0))]++] = i;
    this.start = start;
    this.items = items;
    this.ccols = Math.ceil(this.cols / COARSE);
    this.crows = Math.ceil(rows / COARSE);
    const coarseCells = this.ccols * this.crows;
    if (Number.isFinite(coarseCells) && coarseCells <= DENSE_MAX_CELLS) {
      const coarse = new Uint8Array(coarseCells);
      for (let i = 0; i < n; i++) {
        coarse[
          Math.floor((cx[i] - gx0) / COARSE) * this.crows + Math.floor((cy[i] - gy0) / COARSE)
        ] = 1;
      }
      this.coarse = coarse;
    } else {
      this.coarse = null;
    }
  }

  /** CSR slot of cell (gx, gy), or −1 when it is outside the grid or (sparse) holds no point. */
  private slot(gx: number, gy: number): number {
    const lx = gx - this.gx0;
    const ly = gy - this.gy0;
    if (lx < 0 || ly < 0 || lx >= this.cols || ly >= this.rows) return -1;
    const c = lx * this.rows + ly;
    return this.slots ? this.slots.get(c) ?? -1 : c;
  }

  /**
   * The first ring around cell (cx, cy) that can hold a point: 0 unless the block of (cx, cy) and
   * the eight blocks around it are all empty — then every point is at least COARSE + 1 cells away,
   * and the rings below that are empty, so skipping them changes nothing a walk would find.
   */
  private firstRing(cx: number, cy: number): number {
    const coarse = this.coarse;
    if (!coarse) return 0;
    const bx = Math.floor((cx - this.gx0) / COARSE);
    const by = Math.floor((cy - this.gy0) / COARSE);
    for (let x = bx - 1; x <= bx + 1; x++) {
      if (x < 0 || x >= this.ccols) continue;
      for (let y = by - 1; y <= by + 1; y++) {
        if (y < 0 || y >= this.crows) continue;
        if (coarse[x * this.crows + y]) return 0;
      }
    }
    return COARSE + 1;
  }

  /**
   * The point nearest to `p` when within `limit`, else idx −1: exactly what a scan in index order
   * with a strict `<` returns — the LOWEST index among equal distances. Rings of cells grow from
   * p's cell; a ring whose inner reach exceeds the limit, or the best found so far, is not walked.
   */
  nearest(p: Pt2, limit: number): { idx: number; d: number } {
    const cell = this.cell;
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    let idx = -1;
    let d = Infinity;
    const pts = this.pts;
    const start = this.start;
    const items = this.items;
    const take = (gx: number, gy: number) => {
      const s = this.slot(gx, gy);
      if (s < 0) return;
      for (let j = start[s], e = start[s + 1]; j < e; j++) {
        const i = items[j];
        const di = dist(p, pts[i]);
        if (di < d || (di === d && i < idx)) {
          d = di;
          idx = i;
        }
      }
    };
    for (let r = this.firstRing(cx, cy); ; r++) {
      const inner = (r - 1) * cell;
      if (inner > limit + PRUNE_EPS_MM) break;
      if (idx >= 0 && d < inner - PRUNE_EPS_MM) break;
      if (r === 0) {
        take(cx, cy);
        continue;
      }
      for (let gx = cx - r; gx <= cx + r; gx++) {
        take(gx, cy - r);
        take(gx, cy + r);
      }
      for (let gy = cy - r + 1; gy <= cy + r - 1; gy++) {
        take(cx - r, gy);
        take(cx + r, gy);
      }
    }
    return d <= limit ? { idx, d } : { idx: -1, d: Infinity };
  }

  /**
   * The marks' own nearest (SewLine.nearest as it always was, ring for ring): ties go to the FIRST
   * point met in ring / cell / index order — the centre cell, then each ring's top and bottom rows
   * left to right, then its two side columns top to bottom — and the walk stops at the ring whose
   * inner reach the best hit already matches. That order is the contract (marks hang on it), so it
   * is kept; what is new is only that empty rings and rings past the limit are not walked.
   */
  nearestFirstMet(p: Pt2, limit: number): { idx: number; d: number } {
    const cell = this.cell;
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    let idx = -1;
    let d = Infinity;
    const pts = this.pts;
    const start = this.start;
    const items = this.items;
    const visit = (gx: number, gy: number) => {
      const s = this.slot(gx, gy);
      if (s < 0) return;
      for (let j = start[s], e = start[s + 1]; j < e; j++) {
        const i = items[j];
        const di = dist(p, pts[i]);
        if (di < d) {
          d = di;
          idx = i;
        }
      }
    };
    const rings = Math.ceil(limit / cell) + 1;
    for (let r = this.firstRing(cx, cy); r <= rings; r++) {
      const inner = (r - 1) * cell;
      // Every point of ring r is at least its inner reach away: past the limit, no hit can come.
      if (inner > limit + PRUNE_EPS_MM) break;
      // Ring r: once a hit is closer than the ring's inner reach, no farther ring can beat it.
      if (idx >= 0 && d <= inner) break;
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
    return d <= limit ? { idx, d } : { idx: -1, d: Infinity };
  }
}

/** Segments per chunk of a polyline index; 8 keeps a 1 m edge (250 coarse segments) in ~30 boxes. */
const CHUNK = 8;

/**
 * A polyline's consecutive segments in chunks of CHUNK, each with the bbox of its points: a nearest-
 * segment scan visits a chunk only when its box is not provably farther than the best so far. The
 * closing segment of a ring (last point → first) is its own chunk at the end, so a scan in chunk
 * order meets the segments in the same order as a plain loop.
 */
export class PolylineChunks {
  /** First segment index of each chunk (segment i runs pts[i] → pts[i + 1], or → pts[0] for the ring's last). */
  readonly first: Int32Array;
  /** One past the last segment index of each chunk. */
  readonly end: Int32Array;
  readonly box: Float64Array;
  readonly count: number;

  constructor(
    readonly pts: readonly Pt2[],
    readonly closed: boolean,
  ) {
    const n = pts.length;
    const openSegs = Math.max(0, n - 1);
    const openChunks = Math.ceil(openSegs / CHUNK);
    const ring = closed && n > 2 ? 1 : 0;
    this.count = openChunks + ring;
    this.first = new Int32Array(this.count);
    this.end = new Int32Array(this.count);
    this.box = new Float64Array(this.count * 4);
    for (let c = 0; c < openChunks; c++) {
      const s = c * CHUNK;
      const e = Math.min(openSegs, s + CHUNK);
      this.first[c] = s;
      this.end[c] = e;
      this.setBox(c, s, e);
    }
    if (ring) {
      const c = openChunks;
      this.first[c] = n - 1;
      this.end[c] = n;
      this.box[c * 4] = Math.min(pts[n - 1][0], pts[0][0]);
      this.box[c * 4 + 1] = Math.min(pts[n - 1][1], pts[0][1]);
      this.box[c * 4 + 2] = Math.max(pts[n - 1][0], pts[0][0]);
      this.box[c * 4 + 3] = Math.max(pts[n - 1][1], pts[0][1]);
    }
  }

  private setBox(c: number, s: number, e: number) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = s; i <= e; i++) {
      const [x, y] = this.pts[i];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    this.box[c * 4] = x0;
    this.box[c * 4 + 1] = y0;
    this.box[c * 4 + 2] = x1;
    this.box[c * 4 + 3] = y1;
  }

  /** Lower bound of the distance from `p` to any point of chunk `c`. */
  boxDist(p: Pt2, c: number): number {
    const b = this.box;
    const o = c * 4;
    return Math.hypot(
      Math.max(b[o] - p[0], 0, p[0] - b[o + 2]),
      Math.max(b[o + 1] - p[1], 0, p[1] - b[o + 3]),
    );
  }
}
