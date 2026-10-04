/**
 * PAINT THE PARTS · the magnetic pen (livewire / intelligent scissors along the flat's ink).
 *
 *   field    once per flat: the distance d(p) to the nearest ink pixel and a cost per pixel
 *            1 + K·min(d, D) — cheap on a line, dear on paper; D is measured on a 1024 sheet.
 *   search   one per pen vertex: Dijkstra from that vertex over the 8-connected grid, expanded
 *            LAZILY until the asked target is settled; the state stays, so a cursor that moves
 *            on costs only the new ground (and a target already settled costs a backtrack).
 *            `expand` takes a budget so the canvas can slice the work across frames.
 *   path     the pixel chain back to the vertex, then: a run off the ink becomes one straight
 *            chord (a gap in an open outline is closed straight; paper is crossed straight),
 *            a run on the ink is thinned (Douglas–Peucker, sub-pixel).
 */
import { distanceTransform, type FlatRegions } from './regions';

export type Pt = { x: number; y: number };

export type InkField = {
  w: number;
  h: number;
  /** Distance to the nearest ink pixel. */
  d: Float32Array;
  /** Nearest ink pixel's index (-1: no ink at all). */
  nearest: Int32Array;
  cost: Float32Array;
  /** One pixel on a 1024 sheet, in this sheet's pixels. */
  unit: number;
};

const K = 4;
const D_AT_1024 = 12;
/** A vertex lands on the line when one is this close (1024 sheet). */
export const SNAP_AT_1024 = 6;
/** A path pixel this close to ink counts as on the line (sheet pixels). */
const ON_INK = 1.5;

const FIELDS = new WeakMap<Uint8Array, InkField>();

/** The cost field of a flat (cached per ink raster). */
export function inkField(flat: Pick<FlatRegions, 'ink' | 'w' | 'h'>): InkField {
  const hit = FIELDS.get(flat.ink);
  if (hit) return hit;
  const { w, h, ink } = flat;
  const unit = Math.max(1, Math.max(w, h) / 1024);
  const cap = D_AT_1024 * unit;
  const { d2, nearest } = distanceTransform(ink, w, h);
  const n = w * h;
  const d = new Float32Array(n);
  const cost = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = nearest[i] < 0 ? cap : Math.sqrt(d2[i]);
    d[i] = v;
    // In units of the 1024 sheet so the balance between line and paper holds at any size.
    cost[i] = 1 + K * (Math.min(v, cap) / unit);
  }
  const out = { w, h, d, nearest, cost, unit };
  FIELDS.set(ink, out);
  return out;
}

/** The point on the nearest line within the snap radius, else the point itself. */
export function snapToInk(f: InkField, p: Pt, radius = SNAP_AT_1024 * f.unit): Pt {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return p;
  const i = y * f.w + x;
  const j = f.nearest[i];
  if (j < 0 || f.d[i] > radius) return p;
  return { x: (j % f.w) + 0.5, y: Math.floor(j / f.w) + 0.5 };
}

const SQRT2 = Math.SQRT2;

/** Dijkstra from one vertex, grown on demand. Buffers are shared across searches of one field. */
export class LiveWire {
  readonly field: InkField;
  readonly seed: number;
  private dist: Float32Array;
  private prev: Int32Array;
  private state: Uint8Array; // 0 unseen, 1 in heap, 2 settled
  private touched: Int32Array;
  private nTouched = 0;
  private hk: Float32Array;
  private hv: Int32Array;
  private hn = 0;
  /** Pixels settled so far (for the probe). */
  settledCount = 0;

  constructor(field: InkField, from: Pt, reuse?: LiveWire) {
    this.field = field;
    const { w, h } = field;
    const n = w * h;
    const sx = Math.min(w - 1, Math.max(0, Math.floor(from.x)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(from.y)));
    this.seed = sy * w + sx;
    if (reuse && reuse.field === field) {
      reuse.reset();
      this.dist = reuse.dist;
      this.prev = reuse.prev;
      this.state = reuse.state;
      this.touched = reuse.touched;
      this.hk = reuse.hk;
      this.hv = reuse.hv;
    } else {
      this.dist = new Float32Array(n);
      this.prev = new Int32Array(n);
      this.state = new Uint8Array(n);
      this.touched = new Int32Array(1 << 16);
      this.hk = new Float32Array(1 << 16);
      this.hv = new Int32Array(1 << 16);
    }
    this.touch(this.seed, 0, -1);
  }

  private reset(): void {
    for (let k = 0; k < this.nTouched; k += 1) this.state[this.touched[k]] = 0;
    this.nTouched = 0;
    this.hn = 0;
    this.settledCount = 0;
  }

  private touch(i: number, g: number, from: number): void {
    if (this.state[i] === 0) {
      if (this.nTouched === this.touched.length) {
        const t = new Int32Array(this.touched.length * 2);
        t.set(this.touched);
        this.touched = t;
      }
      this.touched[this.nTouched++] = i;
    }
    this.state[i] = 1;
    this.dist[i] = g;
    this.prev[i] = from;
    this.push(g, i);
  }

  private push(k: number, v: number): void {
    if (this.hn === this.hk.length) {
      const nk = new Float32Array(this.hk.length * 2);
      nk.set(this.hk);
      this.hk = nk;
      const nv = new Int32Array(this.hv.length * 2);
      nv.set(this.hv);
      this.hv = nv;
    }
    const hk = this.hk;
    const hv = this.hv;
    let c = this.hn++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hk[p] <= k) break;
      hk[c] = hk[p];
      hv[c] = hv[p];
      c = p;
    }
    hk[c] = k;
    hv[c] = v;
  }

  /** Pop the minimum; -1 when empty. */
  private pop(): number {
    if (this.hn === 0) return -1;
    const hk = this.hk;
    const hv = this.hv;
    const top = hv[0];
    const n = --this.hn;
    if (n > 0) {
      const k = hk[n];
      const v = hv[n];
      let c = 0;
      for (;;) {
        let m = 2 * c + 1;
        if (m >= n) break;
        if (m + 1 < n && hk[m + 1] < hk[m]) m += 1;
        if (hk[m] >= k) break;
        hk[c] = hk[m];
        hv[c] = hv[m];
        c = m;
      }
      hk[c] = k;
      hv[c] = v;
    }
    return top;
  }

  /** Is the target pixel settled (its shortest path known). */
  settled(t: Pt): boolean {
    return this.state[this.index(t)] === 2;
  }

  index(t: Pt): number {
    const { w, h } = this.field;
    const x = Math.min(w - 1, Math.max(0, Math.floor(t.x)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(t.y)));
    return y * w + x;
  }

  /**
   * Grow until `t` is settled or `budget` pixels were settled in this call. True when settled.
   */
  expand(t: Pt, budget = Infinity): boolean {
    const target = this.index(t);
    if (this.state[target] === 2) return true;
    const { w, h, cost } = this.field;
    const { state, dist } = this;
    let left = budget;
    for (;;) {
      const u = this.pop();
      if (u < 0) return false;
      if (state[u] === 2) continue;
      state[u] = 2;
      this.settledCount += 1;
      const g = dist[u];
      const cu = cost[u];
      const ux = u % w;
      const uy = (u - ux) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        const vy = uy + dy;
        if (vy < 0 || vy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const vx = ux + dx;
          if (vx < 0 || vx >= w) continue;
          const v = vy * w + vx;
          const s = state[v];
          if (s === 2) continue;
          const step = (cu + cost[v]) * 0.5 * (dx !== 0 && dy !== 0 ? SQRT2 : 1);
          const nd = g + step;
          if (s === 0 || nd < dist[v]) this.touch(v, nd, u);
        }
      }
      if (u === target) return true;
      left -= 1;
      if (left <= 0) return false;
    }
  }

  /** The thinned path from the seed to `t` (seed first); `t` must be settled. */
  pathTo(t: Pt): Pt[] {
    const target = this.index(t);
    if (this.state[target] !== 2) return [];
    const { w } = this.field;
    const chain: number[] = [];
    for (let i = target; i >= 0; i = this.prev[i]) chain.push(i);
    chain.reverse();
    return refine(
      this.field,
      chain.map((i) => ({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 })),
    );
  }
}

/** Off-ink runs → one chord; on-ink runs → Douglas–Peucker. Ends kept. */
export function refine(f: InkField, px: Pt[]): Pt[] {
  if (px.length <= 2) return px;
  const on = px.map((p) => f.d[Math.floor(p.y) * f.w + Math.floor(p.x)] <= ON_INK * f.unit);
  const out: Pt[] = [px[0]];
  let k = 0;
  while (k < px.length - 1) {
    if (on[k] && on[k + 1]) {
      let e = k + 1;
      while (e + 1 < px.length && on[e + 1]) e += 1;
      const run = simplify(px.slice(k, e + 1), 0.6);
      for (let j = 1; j < run.length; j += 1) out.push(run[j]);
      k = e;
    } else {
      // Off the line: straight to the next point back on it (or the end).
      let e = k + 1;
      while (e < px.length - 1 && !on[e]) e += 1;
      out.push(px[e]);
      k = e;
    }
  }
  return out;
}

/** Douglas–Peucker. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const dist = Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / len;
      if (dist > far) {
        far = dist;
        at = i;
      }
    }
    if (far > eps) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Is p on a line (after snapping it lies on ink). */
export const onInk = (f: InkField, p: Pt): boolean => {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x >= 0 && y >= 0 && x < f.w && y < f.h && f.d[y * f.w + x] <= ON_INK * f.unit;
};

/**
 * Does a segment follow the ink: only between two points ON lines. A click on paper means a
 * straight edge there — the pen never drags a far line into a cut through open cloth.
 */
export const magnetic = (f: InkField, a: Pt, b: Pt): boolean => onInk(f, a) && onInk(f, b);
