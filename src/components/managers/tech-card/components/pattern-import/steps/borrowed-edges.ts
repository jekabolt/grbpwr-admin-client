// The sizes step lights a size row's own lines. Two things make that outline look open although the
// pieces step closes it:
//
//   • an edge the PDF draws ONCE for every size (the centre-front line, a shared hem, the edge of a
//     rectangle the sizes grow away from) sits in another row — whichever pen drew it — so it is
//     not among the row's lines;
//   • two lines of the row stop a fraction of a millimetre short of each other (a dash that ends a
//     gap early), and the highlight shows the gap.
//
// `litOutline` closes the row's outline the way a person would trace it: every free end of the row
// is joined to another free end — straight when the two point at each other (≤ 12 mm), otherwise
// by the shortest way over the SHARED edges (a line the lines of several other sizes stop on —
// every hem ends on the centre-front line; `splitShared` in sizes/recover.ts reads the same
// landings). The way is one clean line from end to end, however many pens drew the
// edge on top of each other. A free end that finds no partner is returned in `open`: an honest
// hole, not painted over. Display aid only: nothing here is written anywhere.
import type { ChainSet, LineClass } from 'lib/pattern-import/types';

type Poly = ArrayLike<number>;
export type Seg = [number, number, number, number];

/**
 * A line lands on another when its end stops this close to it, at an angle. A dashed size line
 * stops a dash short of the line it runs into (the pieces step looks 8 mm ahead); 2–3 mm is common.
 */
const LAND_MM = 4;
/** A shared edge touches the row's own line when they come this close, mm. */
const SINK_MM = 1;
/** A way may end on the row's own line, but not within this of the end it starts from, mm. */
const SINK_ARC_MM = 60;
/** An end is ON a line when it is this close to it, mm. */
const ON_MM = 1;
/** Ends of the lit set touch (the corner is closed already) within this, mm. */
const TOUCH_MM = 0.6;
/** Two ends that point at each other are one stroke up to this far apart, mm. */
const BRIDGE_MM = 12;
/** Each end's outward tangent lies within this cosine of the gap (~45°). */
const FACING_COS = 0.5;
/** An end that points further away than this from the other end does not close on it. */
const AWAY_COS = 0.2;
/** Both ends point away from each other at least this much: the lines run past the corner. */
const OVER_COS = 0.3;
/** A line meets another at a corner when |cos| of the angle between them is below this (~45°). */
const CORNER_COS = 0.7;
/**
 * A line is a SHARED edge when the lines of at least this many OTHER sizes stop on it. Every hem and
 * neckline of a front piece ends on its centre-front line; a size's own top edge is met by that
 * size's side lines only. (`splitShared` in sizes/recover.ts reads the same landings.)
 */
const SHARED_BY = 3;
/** Ends are filed in cells of this size, mm. */
const CELL = 8;
/** A way is not drawn where it runs this close to the row's own line and along it, mm. */
const DOUBLE_MM = 10;
const DOUBLE_COS = 0.9;
/** A way over shared edges may be this many times the straight distance between its ends … */
const WAY_RATIO = 3;
/** … and this long at most, mm. */
const WAY_MAX_MM = 2500;
/** Ending on the row's own line is a weaker closure than meeting another free end, mm. */
const SINK_PENALTY_MM = 30;

const n2 = (a: Poly) => a.length / 2;
const rankOf = (c: LineClass): number | null => {
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
};

function lengthOf(a: Poly): number {
  let s = 0;
  for (let i = 0; i + 1 < n2(a); i++)
    s += Math.hypot(a[2 * i + 2] - a[2 * i], a[2 * i + 3] - a[2 * i + 1]);
  return s;
}

/** Closest points of segments p1p2 and q1q2: distance, and the parameter on the first. */
function segPair(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number,
): { d: number; t: number; u: number } {
  const ux = p2x - p1x;
  const uy = p2y - p1y;
  const vx = q2x - q1x;
  const vy = q2y - q1y;
  const wx = p1x - q1x;
  const wy = p1y - q1y;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d0 = ux * wx + uy * wy;
  const e0 = vx * wx + vy * wy;
  const den = a * c - b * b;
  let t = den > 1e-12 ? (b * e0 - c * d0) / den : 0;
  let u = 0;
  t = Math.max(0, Math.min(1, t));
  u = c > 1e-12 ? (b * t + e0) / c : 0;
  if (u < 0) {
    u = 0;
    t = a > 1e-12 ? Math.max(0, Math.min(1, -d0 / a)) : 0;
  } else if (u > 1) {
    u = 1;
    t = a > 1e-12 ? Math.max(0, Math.min(1, (b - d0) / a)) : 0;
  }
  const dx = p1x + t * ux - (q1x + u * vx);
  const dy = p1y + t * uy - (q1y + u * vy);
  return { d: Math.hypot(dx, dy), t, u };
}

type Near = { d: number; seg: number; t: number; x: number; y: number; dx: number; dy: number };

/** The point of polyline `a` nearest to (x, y), and the direction of the segment it is on. */
function nearestOn(a: Poly, x: number, y: number, skipEnd?: 0 | 1): Near {
  const n = n2(a);
  const best: Near = { d: Infinity, seg: 0, t: 0, x: 0, y: 0, dx: 1, dy: 0 };
  for (let i = 0; i + 1 < n; i++) {
    if (skipEnd === 0 && i === 0) continue;
    if (skipEnd === 1 && i === n - 2) continue;
    const ax = a[2 * i];
    const ay = a[2 * i + 1];
    const dx = a[2 * i + 2] - ax;
    const dy = a[2 * i + 3] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) {
      const l = Math.sqrt(l2) || 1;
      best.d = d;
      best.seg = i;
      best.t = t;
      best.x = px;
      best.y = py;
      best.dx = dx / l;
      best.dy = dy / l;
    }
  }
  return best;
}

type End = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  chain: number;
  arc: number;
  len: number;
};

/** Outward unit tangent of a polyline end, measured back over ~3 mm. */
function endOf(a: Poly, k: 0 | 1, chain: number): End {
  const n = n2(a);
  const e = k === 0 ? 0 : n - 1;
  const step = k === 0 ? 1 : -1;
  const x = a[2 * e];
  const y = a[2 * e + 1];
  let j = e;
  while (j + step >= 0 && j + step < n && Math.hypot(a[2 * j] - x, a[2 * j + 1] - y) < 3) j += step;
  const dx = x - a[2 * j];
  const dy = y - a[2 * j + 1];
  const l = Math.hypot(dx, dy) || 1;
  const len = lengthOf(a);
  return { x, y, tx: dx / l, ty: dy / l, chain, arc: k === 0 ? 0 : len, len };
}

/**
 * Where end `e` lands on polyline `a`: within LAND_MM and across it (a corner), or right on it at
 * any angle (the row's line runs on along the shared edge and ends there).
 */
function landing(e: End, a: Poly): Near | null {
  const r = nearestOn(a, e.x, e.y);
  if (r.d <= ON_MM) return r;
  return r.d <= LAND_MM && Math.abs(e.tx * r.dx + e.ty * r.dy) < CORNER_COS ? r : null;
}

/** Where end `e` is aimed at polyline `a` from up to BRIDGE_MM away: the line it stops short of. */
function reach(e: End, a: Poly): Near | null {
  const r = nearestOn(a, e.x, e.y);
  if (r.d > BRIDGE_MM || r.d < 1e-6) return null;
  return (e.tx * (r.x - e.x) + e.ty * (r.y - e.y)) / r.d > FACING_COS ? r : null;
}

/** Free ends of the lit lines: not touching any other lit line. */
function freeEnds(lit: ReadonlyMap<number, Poly>): End[] {
  const free: End[] = [];
  for (const [id, a] of lit) {
    if (a.length < 4) continue;
    for (const k of [0, 1] as const) {
      const e = endOf(a, k, id);
      let touched = false;
      for (const [o, b] of lit) {
        if (b.length < 4) continue;
        if (nearestOn(b, e.x, e.y, o === id ? k : undefined).d <= TOUCH_MM) {
          touched = true;
          break;
        }
      }
      if (!touched) free.push(e);
    }
  }
  return free;
}

/**
 * Pairs of free ends within BRIDGE_MM, nearest first, each end used once:
 *   • one points at the other and the other does not point away — a stroke broken in two (both
 *     point at each other) or a corner that stops short (a hem that starts a dash after the side
 *     line): `over` false, a bridge is drawn;
 *   • both point away from each other — the two lines run past the corner and cross: the outline
 *     is closed there, `over` true, nothing is drawn.
 */
function facingPairs(free: End[]): { i: number; j: number; over: boolean }[] {
  const cand: { i: number; j: number; mm: number; over: boolean }[] = [];
  for (let i = 0; i < free.length; i++)
    for (let j = i + 1; j < free.length; j++) {
      const A = free[i];
      const B = free[j];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const mm = Math.hypot(dx, dy);
      if (mm > BRIDGE_MM || mm < 1e-6) continue;
      const a = (A.tx * dx + A.ty * dy) / mm;
      const b = (B.tx * -dx + B.ty * -dy) / mm;
      if (Math.max(a, b) > FACING_COS && Math.min(a, b) >= -AWAY_COS)
        cand.push({ i, j, mm, over: false });
      else if (Math.max(a, b) < -OVER_COS) cand.push({ i, j, mm, over: true });
    }
  cand.sort((p, q) => p.mm - q.mm);
  const used = new Set<number>();
  const out: { i: number; j: number; over: boolean }[] = [];
  for (const c of cand) {
    if (used.has(c.i) || used.has(c.j)) continue;
    used.add(c.i);
    used.add(c.j);
    out.push({ i: c.i, j: c.j, over: c.over });
  }
  return out;
}

// ── shared edges: the lines no other size runs beside ───────────────────────────────────────────

type EndRec = { cls: number; x: number; y: number; tx: number; ty: number };
type EndIndex = { cells: Map<string, EndRec[]>; sizes: number };
const indexCache = new WeakMap<object, EndIndex>();
const sharedCache = new WeakMap<object, Map<number, boolean>>();

/** Every end of every size line, filed by cell, with its tangent. */
function endIndex(set: Pick<ChainSet, 'classes'>, preview: readonly Poly[]): EndIndex {
  const hit = indexCache.get(preview);
  if (hit) return hit;
  const cells: EndIndex['cells'] = new Map();
  let sizes = 0;
  for (const c of set.classes) {
    if (c.role !== 'size') continue;
    sizes++;
    for (const id of c.chains) {
      const a = preview[id];
      if (!a || a.length < 4) continue;
      for (const k of [0, 1] as const) {
        const e = endOf(a, k, id);
        const key = `${Math.floor(e.x / CELL)}:${Math.floor(e.y / CELL)}`;
        const rec = { cls: c.id, x: e.x, y: e.y, tx: e.tx, ty: e.ty };
        const b = cells.get(key);
        if (b) b.push(rec);
        else cells.set(key, [rec]);
      }
    }
  }
  const idx = { cells, sizes };
  indexCache.set(preview, idx);
  return idx;
}

/** Whether the lines of enough other sizes stop on polyline `id` (of size row `cls`). */
function isShared(id: number, cls: number, preview: readonly Poly[], index: EndIndex): boolean {
  const need = Math.min(SHARED_BY, Math.max(1, index.sizes - 1));
  const a = preview[id];
  const seen = new Set<number>();
  for (let i = 0; i + 1 < n2(a); i++) {
    const x0 = Math.min(a[2 * i], a[2 * i + 2]) - LAND_MM;
    const x1 = Math.max(a[2 * i], a[2 * i + 2]) + LAND_MM;
    const y0 = Math.min(a[2 * i + 1], a[2 * i + 3]) - LAND_MM;
    const y1 = Math.max(a[2 * i + 1], a[2 * i + 3]) + LAND_MM;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
        for (const e of index.cells.get(`${cx}:${cy}`) ?? []) {
          if (e.cls === cls || seen.has(e.cls)) continue;
          const r = nearestOn([a[2 * i], a[2 * i + 1], a[2 * i + 2], a[2 * i + 3]], e.x, e.y);
          if (r.d <= ON_MM || (r.d <= LAND_MM && Math.abs(e.tx * r.dx + e.ty * r.dy) < CORNER_COS))
            seen.add(e.cls);
          if (seen.size >= need) return true;
        }
  }
  return false;
}

// ── the way over shared edges ───────────────────────────────────────────────────────────────────

type Req = { seg: number; t: number; x: number; y: number; node: number };
type Graph = { xs: number[]; ys: number[]; adj: [number, number][][] };

/**
 * A graph over `edges` (id → polyline). Besides the vertices it holds the nodes where free ends
 * land and where one shared edge ends on another (a corner), so a way can turn there.
 */
type Sink = { node: number; chain: number; arc: number; x: number; y: number };

function buildGraph(
  edges: ReadonlyMap<number, Poly>,
  own: ReadonlyMap<number, Poly>,
  free: End[],
): { g: Graph; lands: { node: number; w: number }[][]; sinks: Sink[] } {
  const reqs = new Map<number, Req[]>();
  const want = (id: number, r: Near): Req => {
    const q: Req = { seg: r.seg, t: r.t, x: r.x, y: r.y, node: -1 };
    const l = reqs.get(id);
    if (l) l.push(q);
    else reqs.set(id, [q]);
    return q;
  };
  const freeReqs: { e: number; q: Req; w: number }[] = [];
  free.forEach((e, i) => {
    for (const [id, a] of edges) {
      if (id === e.chain) continue;
      const r = landing(e, a);
      if (r) freeReqs.push({ e: i, q: want(id, r), w: r.d });
    }
  });
  // a shared edge that ends on another shared edge: the corner
  const corners: { from: number; k: 0 | 1; q: Req; w: number }[] = [];
  for (const [id, a] of edges)
    for (const k of [0, 1] as const) {
      const e = endOf(a, k, id);
      for (const [oid, b] of edges) {
        if (oid === id) continue;
        const r = landing(e, b);
        if (r) corners.push({ from: id, k, q: want(oid, r), w: r.d });
      }
    }
  // where a shared edge touches or crosses the row's own line: a way may end there
  const sinkReqs: { q: Req; chain: number; arc: number }[] = [];
  for (const [id, a] of edges)
    for (const [oid, b] of own) {
      let run = 0;
      for (let j = 0; j + 1 < n2(b); j++) {
        const bl = Math.hypot(b[2 * j + 2] - b[2 * j], b[2 * j + 3] - b[2 * j + 1]);
        for (let i = 0; i + 1 < n2(a); i++) {
          const r = segPair(
            a[2 * i],
            a[2 * i + 1],
            a[2 * i + 2],
            a[2 * i + 3],
            b[2 * j],
            b[2 * j + 1],
            b[2 * j + 2],
            b[2 * j + 3],
          );
          if (r.d > SINK_MM) continue;
          const x = a[2 * i] + r.t * (a[2 * i + 2] - a[2 * i]);
          const y = a[2 * i + 1] + r.t * (a[2 * i + 3] - a[2 * i + 1]);
          sinkReqs.push({
            q: want(id, { d: r.d, seg: i, t: r.t, x, y, dx: 0, dy: 0 }),
            chain: oid,
            arc: run + r.u * bl,
          });
        }
        run += bl;
      }
    }
  const g: Graph = { xs: [], ys: [], adj: [] };
  const node = (x: number, y: number) => {
    g.xs.push(x);
    g.ys.push(y);
    g.adj.push([]);
    return g.xs.length - 1;
  };
  const link = (a: number, b: number, w = Math.hypot(g.xs[a] - g.xs[b], g.ys[a] - g.ys[b])) => {
    g.adj[a].push([b, w]);
    g.adj[b].push([a, w]);
  };
  const ends = new Map<string, number>();
  for (const [id, a] of edges) {
    const n = n2(a);
    const list = (reqs.get(id) ?? []).slice().sort((p, q) => p.seg - q.seg || p.t - q.t);
    let r = 0;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const v = node(a[2 * i], a[2 * i + 1]);
      if (i === 0) ends.set(`${id}:0`, v);
      if (i === n - 1) ends.set(`${id}:1`, v);
      if (prev >= 0) link(prev, v);
      prev = v;
      // nodes the requests put on the segment i → i + 1, in order
      while (r < list.length && list[r].seg === i && i + 1 < n) {
        const q = list[r++];
        q.node = node(q.x, q.y);
        link(prev, q.node);
        prev = q.node;
      }
    }
  }
  for (const c of corners) {
    const a = ends.get(`${c.from}:${c.k}`);
    if (a !== undefined && c.q.node >= 0) link(a, c.q.node, c.w);
  }
  const lands: { node: number; w: number }[][] = free.map(() => []);
  for (const f of freeReqs) if (f.q.node >= 0) lands[f.e].push({ node: f.q.node, w: f.w });
  const sinks: Sink[] = sinkReqs
    .filter((s) => s.q.node >= 0)
    .map((s) => ({ node: s.q.node, chain: s.chain, arc: s.arc, x: s.q.x, y: s.q.y }));
  return { g, lands, sinks };
}

/** Dijkstra from the landing nodes of one free end. */
function shortest(g: Graph, from: { node: number; w: number }[]) {
  const n = g.xs.length;
  const dist = new Float64Array(n).fill(Infinity);
  const pred = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  // a binary heap would be quicker; the graph is a few thousand nodes and there are few ends
  const open = new Set<number>();
  for (const f of from)
    if (f.w < dist[f.node]) {
      dist[f.node] = f.w;
      open.add(f.node);
    }
  while (open.size) {
    let u = -1;
    let best = Infinity;
    for (const v of open)
      if (dist[v] < best) {
        best = dist[v];
        u = v;
      }
    open.delete(u);
    if (done[u]) continue;
    done[u] = 1;
    for (const [v, w] of g.adj[u])
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        pred[v] = u;
        open.add(v);
      }
  }
  return { dist, pred };
}

/**
 * The parts of a way that do not run on the row's own lines. A shared edge is often drawn in a
 * second pen a millimetre or two beside the row's own line there; lighting both reads as a double
 * outline, and the own line is lit already.
 */
function offOwn(way: number[], own: ReadonlyMap<number, Poly>): number[][] {
  const parts: number[][] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length >= 4) parts.push(cur);
    cur = [];
  };
  // beside an own line and running along it: its double. At a corner the way crosses the own line
  // and stays.
  const near = (x: number, y: number, tx: number, ty: number) => {
    for (const b of own.values()) {
      const r = nearestOn(b, x, y);
      if (r.d <= ON_MM) return true;
      if (r.d <= DOUBLE_MM && Math.abs(tx * r.dx + ty * r.dy) > DOUBLE_COS) return true;
    }
    return false;
  };
  for (let i = 0; i + 1 < way.length / 2; i++) {
    const ax = way[2 * i];
    const ay = way[2 * i + 1];
    const bx = way[2 * i + 2];
    const by = way[2 * i + 3];
    const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
    for (let s = 0; s < m; s++) {
      const x0 = ax + ((bx - ax) * s) / m;
      const y0 = ay + ((by - ay) * s) / m;
      const x1 = ax + ((bx - ax) * (s + 1)) / m;
      const y1 = ay + ((by - ay) * (s + 1)) / m;
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      if (near((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / l, (y1 - y0) / l)) flush();
      else {
        if (!cur.length) cur.push(x0, y0);
        cur.push(x1, y1);
      }
    }
  }
  flush();
  return parts;
}

export type LitOutline = {
  /** The ways over shared edges that close the row's outline, each one flat [x0, y0, x1, y1, …]. */
  lines: Float32Array[];
  /** Short segments joining ends that point at each other, [x0, y0, x1, y1] mm. */
  bridges: Seg[];
  /** Free ends that found no partner: where the outline is really open. */
  open: { x: number; y: number; chain: number }[];
};

/**
 * Close `row`'s outline. `preview[id]` is a chain's polyline, flat [x0, y0, x1, y1, …], mm.
 */
function compute(
  set: Pick<ChainSet, 'classes'>,
  preview: readonly Poly[],
  row: LineClass,
): LitOutline {
  const out: LitOutline = { lines: [], bridges: [], open: [] };
  if (row.role !== 'size' || rankOf(row) == null) return out;
  const own = new Map<number, Poly>();
  for (const id of row.chains) if (preview[id]?.length >= 4) own.set(id, preview[id]);

  let free = freeEnds(own);
  // 1. ends that point at each other: a straight bridge
  const bridged = new Set<number>();
  for (const { i, j, over } of facingPairs(free)) {
    if (!over) out.bridges.push([free[i].x, free[i].y, free[j].x, free[j].y]);
    bridged.add(i);
    bridged.add(j);
  }
  free = free.filter((_, i) => !bridged.has(i));
  // an end that stops short of another line of the same row (a corner): straight onto it
  const landed = new Set<number>();
  free.forEach((e, i) => {
    let best: Near | null = null;
    for (const [id, a] of own) {
      if (id === e.chain) continue;
      const r = landing(e, a) ?? reach(e, a);
      if (r && (!best || r.d < best.d)) best = r;
    }
    if (best) {
      out.bridges.push([e.x, e.y, best.x, best.y]);
      landed.add(i);
    }
  });
  free = free.filter((_, i) => !landed.has(i));
  if (!free.length) return out;

  // 2. the rest: over shared edges — lines of the other rows no line of another size runs beside
  const index = endIndex(set, preview);
  let memo = sharedCache.get(preview);
  if (!memo) sharedCache.set(preview, (memo = new Map()));
  const edges = new Map<number, Poly>();
  for (const c of set.classes) {
    if (c.id === row.id || (c.role !== 'common' && c.role !== 'size')) continue;
    for (const id of c.chains) {
      const a = preview[id];
      if (!a || a.length < 4) continue;
      let v = memo.get(id);
      if (v === undefined) memo.set(id, (v = isShared(id, c.id, preview, index)));
      if (v) edges.set(id, a);
    }
  }
  const { g, lands, sinks } = buildGraph(edges, own, free);
  const runs = free.map((_, i) => (lands[i].length ? shortest(g, lands[i]) : null));
  type Cand = { i: number; j: number; len: number; end: number };
  const cand: Cand[] = [];
  for (let i = 0; i < free.length; i++) {
    const r = runs[i];
    if (!r) continue;
    const ok = (len: number, x: number, y: number) =>
      len <= WAY_MAX_MM && len <= WAY_RATIO * Math.hypot(free[i].x - x, free[i].y - y) + 20;
    // to another free end
    for (let j = i + 1; j < free.length; j++) {
      let best = Infinity;
      let end = -1;
      for (const l of lands[j]) {
        const d = r.dist[l.node] + l.w;
        if (d < best) {
          best = d;
          end = l.node;
        }
      }
      if (end >= 0 && ok(best, free[j].x, free[j].y)) cand.push({ i, j, len: best, end });
    }
    // or onto the row's own line, away from where it starts (the corner the shared edge closes)
    let bs: Sink | null = null;
    let bd = Infinity;
    for (const s of sinks) {
      if (s.chain === free[i].chain && Math.abs(s.arc - free[i].arc) < SINK_ARC_MM) continue;
      if (r.dist[s.node] < bd) {
        bd = r.dist[s.node];
        bs = s;
      }
    }
    if (bs && bd > 0 && ok(bd, bs.x, bs.y))
      cand.push({ i, j: -1, len: bd + SINK_PENALTY_MM, end: bs.node });
  }
  cand.sort((p, q) => p.len - q.len);
  const used = new Set<number>();
  for (const c of cand) {
    if (used.has(c.i) || (c.j >= 0 && used.has(c.j))) continue;
    used.add(c.i);
    if (c.j >= 0) used.add(c.j);
    const pred = runs[c.i]!.pred;
    const way: number[] = c.j >= 0 ? [free[c.j].x, free[c.j].y] : [];
    for (let v = c.end; v >= 0; v = pred[v]) way.push(g.xs[v], g.ys[v]);
    way.push(free[c.i].x, free[c.i].y);
    for (const part of offOwn(way, own)) out.lines.push(Float32Array.from(part));
  }
  out.open = free.filter((_, i) => !used.has(i)).map(({ x, y, chain }) => ({ x, y, chain }));
  return out;
}

const outlineCache = new WeakMap<object, Map<number, { sig: string; out: LitOutline }>>();

/**
 * `litOutline`, remembered per chain preview and row: the sizes step asks again on every hover.
 * The row's line list is part of the key, so an answer that moves a line recomputes it.
 */
export function litOutline(
  set: Pick<ChainSet, 'classes'>,
  preview: readonly Poly[],
  row: LineClass,
): LitOutline {
  let byRow = outlineCache.get(preview);
  if (!byRow) outlineCache.set(preview, (byRow = new Map()));
  const sig = `${row.role}:${row.chains.length}:${row.chains[0] ?? ''}:${row.chains[row.chains.length - 1] ?? ''}`;
  const hit = byRow.get(row.id);
  if (hit && hit.sig === sig) return hit.out;
  const out = compute(set, preview, row);
  byRow.set(row.id, { sig, out });
  return out;
}
