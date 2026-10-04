/**
 * PAINT THE PARTS · the magnetic pen (livewire / intelligent scissors along the flat's ink).
 *
 *   field    built lazily for ONE flat at a time (the side being drawn on): a cost byte per
 *            pixel 1 + K·min(d, D), d = chamfer distance to the nearest ink pixel measured on a
 *            1024 sheet — cheap on a line, dear on paper.
 *   search   Dijkstra from the last vertex over the 8-connected grid, inside a CORRIDOR (the box
 *            of vertex and target grown by a margin; a target leaving it restarts the search in a
 *            wider one), grown LAZILY toward the target under a time deadline; the state
 *            stays, so a cursor that moves on costs only new ground. ONE workspace for the whole
 *            screen: a new search takes it over, the previous one is dead.
 *   path     the pixel chain back to the vertex, then: a run off the ink becomes one straight
 *            chord (a gap in an open outline is closed straight), a run on the ink is thinned
 *            (Douglas–Peucker over a bounded number of points); a path longer than DETOUR × the
 *            straight distance is refused (the caller draws it straight).
 *
 * Only an edge between two points ON lines is magnetic: a click on paper means a straight edge.
 */
import type { FlatRegions } from './regions';

export type Pt = { x: number; y: number };

export type InkField = {
  w: number;
  h: number;
  ink: Uint8Array;
  /** 1 + K·min(d, D) per pixel, d in 1024-sheet pixels. */
  cost: Uint8Array;
  /** One pixel on a 1024 sheet, in this sheet's pixels. */
  unit: number;
};

const K = 4;
const D_AT_1024 = 12;
/** A vertex lands on the line when one is this close (1024 sheet). */
export const SNAP_AT_1024 = 6;
/** A pixel this close to ink (1024 sheet) is on the line: its cost is at most this. */
const ON_INK_COST = 1 + Math.round(K * 1.5);
/** The corridor around vertex → target: at least this (1024 sheet), else this share of the span. */
const MARGIN_AT_1024 = 48;
const MARGIN_SHARE = 0.6;
/** A path longer than this × the straight distance is not a line to follow. */
const DETOUR = 3;
/** Douglas–Peucker never sees more points than this per run. */
const DP_POINTS = 2000;

let FIELD: { ink: Uint8Array; field: InkField } | null = null;

/** The cost field of a flat — only the last asked flat is kept. */
export function inkField(flat: Pick<FlatRegions, 'ink' | 'w' | 'h'>): InkField {
  if (FIELD?.ink === flat.ink) return FIELD.field;
  FIELD = null;
  const { w, h, ink } = flat;
  const unit = Math.max(1, Math.max(w, h) / 1024);
  // Chamfer 3-4 distance in thirds of a pixel, capped where the cost stops growing.
  const cap = Math.min(65535, Math.ceil(D_AT_1024 * unit * 3) + 4);
  const n = w * h;
  const d = new Uint16Array(n);
  for (let i = 0; i < n; i += 1) d[i] = ink[i] ? 0 : cap;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y -= 1)
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  const cost = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const at1024 = d[i] / 3 / unit;
    cost[i] = 1 + Math.round(K * Math.min(at1024, D_AT_1024));
  }
  const field = { w, h, ink, cost, unit };
  FIELD = { ink, field };
  return field;
}

/** Drop the field and the search workspace (pen put away, side gone). */
export function releaseInk(): void {
  FIELD = null;
  WS = null;
}

/** The nearest ink pixel within the snap radius, else the point itself. */
export function snapToInk(f: InkField, p: Pt, radius = SNAP_AT_1024 * f.unit): Pt {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return p;
  const r = Math.ceil(radius);
  let best = radius * radius + 1e-9;
  let at = -1;
  for (let yy = Math.max(0, y - r); yy <= Math.min(f.h - 1, y + r); yy += 1)
    for (let xx = Math.max(0, x - r); xx <= Math.min(f.w - 1, x + r); xx += 1) {
      if (!f.ink[yy * f.w + xx]) continue;
      const dd = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (dd < best) {
        best = dd;
        at = yy * f.w + xx;
      }
    }
  return at < 0 ? p : { x: (at % f.w) + 0.5, y: Math.floor(at / f.w) + 0.5 };
}

/** Is p on a line. */
export const onInk = (f: InkField, p: Pt): boolean => {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x >= 0 && y >= 0 && x < f.w && y < f.h && f.cost[y * f.w + x] <= ON_INK_COST;
};

/** Does the edge a → b follow the ink: both ends on lines. */
export const magnetic = (f: InkField, a: Pt, b: Pt): boolean => onInk(f, a) && onInk(f, b);

/* ─────────────────────────── the one workspace ─────────────────────────── */

type Workspace = {
  n: number;
  dist: Float32Array;
  /** The step that reached a pixel (index into DX/DY). */
  dir: Uint8Array;
  /** 0 unseen, 1 in heap, 2 settled. */
  state: Uint8Array;
  touched: Int32Array;
  nTouched: number;
  hk: Float32Array;
  hv: Int32Array;
  owner: LiveWire | null;
};
let WS: Workspace | null = null;

function claim(n: number, owner: LiveWire): Workspace {
  if (!WS || WS.n !== n) {
    WS = {
      n,
      dist: new Float32Array(n),
      dir: new Uint8Array(n),
      state: new Uint8Array(n),
      touched: new Int32Array(1 << 15),
      nTouched: 0,
      hk: new Float32Array(1 << 15),
      hv: new Int32Array(1 << 15),
      owner,
    };
    return WS;
  }
  for (let k = 0; k < WS.nTouched; k += 1) WS.state[WS.touched[k]] = 0;
  WS.nTouched = 0;
  WS.owner = owner;
  return WS;
}

/** Bytes the pen holds right now (field + workspace) — for the probe. */
export function penBytes(): number {
  const f = FIELD ? FIELD.field.cost.byteLength : 0;
  const ws = WS
    ? WS.dist.byteLength +
      WS.dir.byteLength +
      WS.state.byteLength +
      WS.touched.byteLength +
      WS.hk.byteLength +
      WS.hv.byteLength
    : 0;
  return f + ws;
}

const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const STEP = DX.map((dx, k) => (dx !== 0 && DY[k] !== 0 ? Math.SQRT2 : 1));

/** Dijkstra from one vertex toward a target, grown on demand inside its corridor. */
export class LiveWire {
  readonly field: InkField;
  readonly from: Pt;
  private seed: number;
  private x0: number;
  private y0: number;
  private x1: number;
  private y1: number;
  private hn = 0;
  /** Pixels settled so far (for the probe). */
  settledCount = 0;

  constructor(field: InkField, from: Pt, toward: Pt) {
    this.field = field;
    this.from = from;
    const { w, h } = field;
    const sx = Math.min(w - 1, Math.max(0, Math.floor(from.x)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(from.y)));
    const tx = Math.floor(toward.x);
    const ty = Math.floor(toward.y);
    const span = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
    const m = Math.ceil(Math.max(MARGIN_AT_1024 * field.unit, MARGIN_SHARE * span));
    this.x0 = Math.max(0, Math.min(sx, tx) - m);
    this.x1 = Math.min(w - 1, Math.max(sx, tx) + m);
    this.y0 = Math.max(0, Math.min(sy, ty) - m);
    this.y1 = Math.min(h - 1, Math.max(sy, ty) + m);
    this.seed = sy * w + sx;
    const ws = claim(w * h, this);
    this.touch(ws, this.seed, 0, 255);
  }

  /** Still owns the workspace (another search may have taken it). */
  alive(): boolean {
    return WS?.owner === this && FIELD?.field === this.field;
  }

  private touch(ws: Workspace, i: number, g: number, dir: number): void {
    if (ws.state[i] === 0) {
      if (ws.nTouched === ws.touched.length) {
        const t = new Int32Array(ws.touched.length * 2);
        t.set(ws.touched);
        ws.touched = t;
      }
      ws.touched[ws.nTouched++] = i;
    }
    ws.state[i] = 1;
    ws.dist[i] = g;
    ws.dir[i] = dir;
    // push
    if (this.hn === ws.hk.length) {
      const nk = new Float32Array(ws.hk.length * 2);
      nk.set(ws.hk);
      ws.hk = nk;
      const nv = new Int32Array(ws.hv.length * 2);
      nv.set(ws.hv);
      ws.hv = nv;
    }
    const { hk, hv } = ws;
    let c = this.hn++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hk[p] <= g) break;
      hk[c] = hk[p];
      hv[c] = hv[p];
      c = p;
    }
    hk[c] = g;
    hv[c] = i;
  }

  private pop(ws: Workspace): number {
    if (this.hn === 0) return -1;
    const { hk, hv } = ws;
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

  /** Is `t` inside this search's corridor (else a new search must start). */
  covers(t: Pt): boolean {
    return this.index(t) >= 0;
  }

  private index(t: Pt): number {
    const x = Math.floor(t.x);
    const y = Math.floor(t.y);
    if (x < this.x0 || x > this.x1 || y < this.y0 || y > this.y1) return -1;
    return y * this.field.w + x;
  }

  /**
   * Grow until `t` is settled or `deadline` (performance.now ms) passes. True when settled;
   * false when out of time, out of the corridor, or the workspace was taken.
   */
  expand(t: Pt, deadline = Infinity): boolean {
    const ws = WS;
    if (!ws || !this.alive()) return false;
    const target = this.index(t);
    if (target < 0) return false;
    if (ws.state[target] === 2) return true;
    const { w, cost } = this.field;
    const { state, dist } = ws;
    const { x0, x1, y0, y1 } = this;
    let tick = 0;
    for (;;) {
      const u = this.pop(ws);
      if (u < 0) return false;
      if (state[u] === 2) continue;
      state[u] = 2;
      this.settledCount += 1;
      const g = dist[u];
      const cu = cost[u];
      const ux = u % w;
      const uy = (u - ux) / w;
      for (let k = 0; k < 8; k += 1) {
        const vx = ux + DX[k];
        const vy = uy + DY[k];
        if (vx < x0 || vx > x1 || vy < y0 || vy > y1) continue;
        const v = vy * w + vx;
        const s = state[v];
        if (s === 2) continue;
        const nd = g + (cu + cost[v]) * 0.5 * STEP[k];
        if (s === 0 || nd < dist[v]) this.touch(ws, v, nd, k);
      }
      if (u === target) return true;
      tick += 1;
      if ((tick & 127) === 0 && performance.now() > deadline) return false;
    }
  }

  /**
   * The thinned path from the vertex to `t` (vertex first); [] when `t` is not settled or the
   * path is a detour (longer than DETOUR × the straight distance).
   */
  pathTo(t: Pt): Pt[] {
    const ws = WS;
    if (!ws || !this.alive()) return [];
    const target = this.index(t);
    if (target < 0 || ws.state[target] !== 2) return [];
    const { w } = this.field;
    const chain: Pt[] = [];
    let len = 0;
    for (let i = target, guard = ws.nTouched + 1; guard > 0; guard -= 1) {
      const p = { x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 };
      chain.push(p);
      const k = ws.dir[i];
      if (i === this.seed || k === 255) break;
      len += STEP[k];
      i -= DY[k] * w + DX[k];
    }
    chain.reverse();
    const a = chain[0];
    const b = chain[chain.length - 1];
    if (len > DETOUR * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return [];
    return refine(this.field, chain);
  }
}

/** Off-ink runs → one chord; on-ink runs → Douglas–Peucker. Ends kept. */
export function refine(f: InkField, px: Pt[]): Pt[] {
  if (px.length <= 2) return px;
  const on = px.map((p) => onInk(f, p));
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

/** Douglas–Peucker over at most DP_POINTS points (a longer run is decimated first). */
export function simplify(input: Pt[], eps: number): Pt[] {
  let pts = input;
  if (pts.length > DP_POINTS) {
    const step = Math.ceil(pts.length / DP_POINTS);
    pts = pts.filter((_, i) => i % step === 0 || i === input.length - 1);
  }
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
