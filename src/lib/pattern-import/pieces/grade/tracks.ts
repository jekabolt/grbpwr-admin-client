// pieces/grade (H1) — tracks: the drawn lines re-linked through junctions.
//
// Elements are chains cut back at their junction points (a source-path boundary another chain
// ends at: a crossing a CAD export / a trace cut the lines at, or a T where F3 joined a landing
// line to one half of its host). Element ends are clustered:
//   tight cluster (≤ 0.6 mm, the lines were cut there) → junction model
//     2 ends   straight-through → one track, else a corner (both end)
//     3 ends   a T: the straightest pair is the host and chains; the third end LANDS — never chains
//     4+ ends  a pinch / X: ends split by the cluster axis, sorted by angle, paired in order (the
//              straight continuation reverses the order — a fork flips the rank direction); if
//              that fails, the straightest pairs chain and the rest land
//   loose (≤ gapMm) free ends → greedy straight-through (dash gaps, small breaks)
import type { ChainId, ChainSet, PathId, Sheet } from 'lib/pattern-import/types';

import {
  arcLengths,
  cross,
  dist,
  dot,
  endTangent,
  polyLen,
  projectOn,
  sub,
  subPolyline,
  unit,
  type V,
} from './vec';

export type Element = { id: number; chain: ChainId; from: number; to: number; pts: V[] };
export type TrackItem = { el: number; rev: boolean; at: number; L: number };
export type Track = {
  id: number;
  pts: V[];
  items: TrackItem[];
  lengthMm: number;
  closed: boolean;
};

export type TrackOpts = {
  gapMm: number;
  angleDeg: number;
  lateralMm: number;
  junctionMm: number;
  /** a line cut at a junction continues within this angle (the two halves of one drawn line) */
  junctionAngleDeg: number;
  /** a pairing whose rival is within this many degrees is not trusted (the stub stays alone) */
  junctionMarginDeg: number;
};

export const TRACK_OPTS: TrackOpts = {
  gapMm: 3,
  angleDeg: 22,
  lateralMm: 0.5,
  junctionMm: 0.6,
  junctionAngleDeg: 10,
  junctionMarginDeg: 4,
};

class PointGrid {
  cells = new Map<string, number[]>();
  constructor(readonly cell: number) {}
  key(x: number, y: number) {
    return `${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`;
  }
  add(p: V, id: number) {
    const k = this.key(p.x, p.y);
    const a = this.cells.get(k);
    if (a) a.push(id);
    else this.cells.set(k, [id]);
  }
  near(p: V, f: (id: number) => void) {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) for (const id of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) f(id);
  }
}

/** Chains cut at their junction points (see header). */
export function elementsOf(sheet: Sheet, set: ChainSet, use: readonly ChainId[], o: TrackOpts = TRACK_OPTS): Element[] {
  const pathById = new Map<PathId, V[]>();
  for (const p of sheet.paths) pathById.set(p.id, p.closed && p.pts.length > 2 ? [...p.pts, p.pts[0]] : p.pts);
  type Cut = { chain: ChainId; u: number; p: V };
  const cand: Cut[] = [];
  const accOf = new Map<ChainId, number[]>();
  const grid = new PointGrid(Math.max(1, o.junctionMm * 2));
  const endOwner: ChainId[] = [];
  for (const id of use) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    const acc = arcLengths(c.pts);
    accOf.set(id, acc);
    if (!c.closed) {
      grid.add(c.pts[0], endOwner.length);
      endOwner.push(id);
      grid.add(c.pts[c.pts.length - 1], endOwner.length);
      endOwner.push(id);
    }
    if (c.ranges.length < 2) continue;
    let last = 0;
    for (let k = 1; k < c.ranges.length; k++) {
      const a = pathById.get(c.ranges[k - 1].path);
      const b = pathById.get(c.ranges[k].path);
      if (!a || !b || a.length < 2 || b.length < 2) continue;
      const ea = [a[0], a[a.length - 1]];
      const eb = [b[0], b[b.length - 1]];
      let best: { d: number; p: V } = { d: Infinity, p: ea[0] };
      for (const x of ea)
        for (const y of eb) {
          const d = dist(x, y);
          if (d < best.d) best = { d, p: { x: (x.x + y.x) / 2, y: (x.y + y.y) / 2 } };
        }
      const pr = projectOn(c.pts, acc, best.p);
      if (pr.d > 1 || pr.u < last + 0.2 || pr.u > acc[acc.length - 1] - 0.2) continue;
      last = pr.u;
      cand.push({ chain: id, u: pr.u, p: best.p });
    }
  }
  // a boundary is a junction when ANOTHER chain ends or has a boundary at the same point
  const cutGrid = new PointGrid(Math.max(1, o.junctionMm * 2));
  cand.forEach((c, i) => cutGrid.add(c.p, i));
  const cutsOf = new Map<ChainId, number[]>();
  for (const c of cand) {
    let hit = false;
    grid.near(c.p, (e) => {
      if (endOwner[e] === c.chain) return;
      const ch = set.chains[endOwner[e]];
      const q = e % 2 === 0 ? ch.pts[0] : ch.pts[ch.pts.length - 1];
      if (dist(q, c.p) <= o.junctionMm) hit = true;
    });
    if (!hit)
      cutGrid.near(c.p, (j) => {
        const d = cand[j];
        if (d.chain !== c.chain && dist(d.p, c.p) <= o.junctionMm) hit = true;
      });
    if (!hit) continue;
    const a = cutsOf.get(c.chain);
    if (a) a.push(c.u);
    else cutsOf.set(c.chain, [c.u]);
  }
  const out: Element[] = [];
  for (const id of use) {
    const c = set.chains[id];
    const acc = accOf.get(id);
    if (!c || !acc) continue;
    const total = acc[acc.length - 1];
    const cuts = [0, ...(cutsOf.get(id) ?? []).sort((a, b) => a - b), total];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const pts = cuts.length === 2 ? c.pts.slice() : subPolyline(c.pts, acc, cuts[k], cuts[k + 1]);
      if (pts.length < 2) continue;
      out.push({ id: out.length, chain: id, from: cuts[k], to: cuts[k + 1], pts });
    }
  }
  return out;
}

export function buildTracks(els: readonly Element[], o: TrackOpts = TRACK_OPTS): Track[] {
  type End = { el: number; end: 0 | 1; p: V; t: V };
  const ends: End[] = [];
  els.forEach((q, k) => {
    ends.push({ el: k, end: 0, p: q.pts[0], t: endTangent(q.pts, 0) });
    ends.push({ el: k, end: 1, p: q.pts[q.pts.length - 1], t: endTangent(q.pts, 1) });
  });
  const cosMax = Math.cos((o.angleDeg * Math.PI) / 180);
  const grid = new PointGrid(Math.max(2, o.gapMm));
  ends.forEach((e, i) => grid.add(e.p, i));
  const mate = new Int32Array(ends.length).fill(-1);
  const landed = new Uint8Array(ends.length);
  const straight = (a: number, b: number) => -dot(ends[a].t, ends[b].t);
  const pairUp = (a: number, b: number) => {
    mate[a] = b;
    mate[b] = a;
  };
  // ── tight clusters: junction model ──
  const parent = ends.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  ends.forEach((e, i) =>
    grid.near(e.p, (j) => {
      if (j > i && ends[j].el !== e.el && dist(ends[j].p, e.p) <= o.junctionMm) parent[find(i)] = find(j);
    }),
  );
  const clusters = new Map<number, number[]>();
  ends.forEach((_, i) => {
    const r = find(i);
    const a = clusters.get(r);
    if (a) a.push(i);
    else clusters.set(r, [i]);
  });
  const inTight = new Uint8Array(ends.length);
  const cosJ = Math.cos((o.junctionAngleDeg * Math.PI) / 180);
  const deg = (c: number) => (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  const greedyIn = (members: number[]) => {
    const all: { a: number; b: number; c: number }[] = [];
    for (let x = 0; x < members.length; x++)
      for (let y = x + 1; y < members.length; y++) {
        const a = members[x];
        const b = members[y];
        if (ends[a].el === ends[b].el) continue;
        all.push({ a, b, c: straight(a, b) });
      }
    const pairs = all.filter((p) => p.c >= cosJ).sort((p, q) => q.c - p.c);
    for (const p of pairs) {
      if (mate[p.a] >= 0 || mate[p.b] >= 0) continue;
      // a rival continuation of either end almost as straight: which line goes on is not
      // readable from the drawing — neither chains
      const ang = deg(p.c);
      const rival = all.some(
        (q) => q !== p && (q.a === p.a || q.b === p.a || q.a === p.b || q.b === p.b) && deg(q.c) - ang < o.junctionMarginDeg,
      );
      if (rival) continue;
      pairUp(p.a, p.b);
    }
  };
  for (const [, members] of clusters) {
    if (members.length < 2) continue;
    for (const i of members) inTight[i] = 1;
    if (members.length === 2) {
      if (straight(members[0], members[1]) >= cosJ && ends[members[0]].el !== ends[members[1]].el)
        pairUp(members[0], members[1]);
      continue;
    }
    let done = false;
    if (members.length >= 4 && members.length % 2 === 0) {
      // pinch: axis = mean tangent folded onto one half-plane
      const ref = ends[members[0]].t;
      let ax = 0;
      let ay = 0;
      for (const i of members) {
        const t = ends[i].t;
        const s = dot(t, ref) >= 0 ? 1 : -1;
        ax += s * t.x;
        ay += s * t.y;
      }
      const axis = unit({ x: ax, y: ay });
      const A = members.filter((i) => dot(ends[i].t, axis) > 0);
      const B = members.filter((i) => dot(ends[i].t, axis) <= 0);
      if (A.length === B.length) {
        const ang = (i: number, f: number) => {
          const t = { x: f * ends[i].t.x, y: f * ends[i].t.y };
          return Math.atan2(cross(axis, t), dot(axis, t));
        };
        A.sort((i, j) => ang(i, 1) - ang(j, 1));
        B.sort((i, j) => ang(i, -1) - ang(j, -1));
        let ok = true;
        for (let k = 0; k < A.length && ok; k++)
          if (straight(A[k], B[k]) < cosJ || ends[A[k]].el === ends[B[k]].el) ok = false;
        if (ok) {
          for (let k = 0; k < A.length; k++) pairUp(A[k], B[k]);
          done = true;
        }
      }
    }
    if (!done) greedyIn(members);
    // whatever is left in a junction of 3+ lines landed on a host: it never chains further
    for (const i of members) if (mate[i] < 0) landed[i] = 1;
  }
  // ── loose: free ends within gapMm, straight-through ──
  const pairs: { a: number; b: number; score: number }[] = [];
  ends.forEach((e, i) => {
    if (mate[i] >= 0 || landed[i]) return;
    grid.near(e.p, (j) => {
      if (j <= i || mate[j] >= 0 || landed[j]) return;
      const f = ends[j];
      if (f.el === e.el) return;
      const g = sub(f.p, e.p);
      const gap = Math.hypot(g.x, g.y);
      if (gap > o.gapMm) return;
      const c = straight(i, j);
      if (c < cosMax) return;
      const lat = gap < 0.05 ? 0 : Math.max(Math.abs(cross(e.t, g)), Math.abs(cross(f.t, g)));
      if (lat > o.lateralMm + 0.05 * gap) return;
      const ang = (Math.acos(Math.min(1, c)) * 180) / Math.PI;
      pairs.push({ a: i, b: j, score: ang + lat * 20 + gap * 0.5 });
    });
  });
  pairs.sort((p, q) => p.score - q.score);
  for (const p of pairs) if (mate[p.a] < 0 && mate[p.b] < 0) pairUp(p.a, p.b);
  void inTight;
  // ── walk ──
  const used = new Uint8Array(els.length);
  const tracks: Track[] = [];
  const walkFrom = (start: number, startEnd: 0 | 1) => {
    const pts: V[] = [];
    const items: TrackItem[] = [];
    let cur = start;
    let enter: 0 | 1 = startEnd;
    let acc = 0;
    let closed = false;
    while (cur >= 0) {
      if (used[cur]) {
        closed = cur === start;
        break;
      }
      used[cur] = 1;
      const q = els[cur].pts;
      const seq = enter === 0 ? q : [...q].reverse();
      if (pts.length) acc += dist(pts[pts.length - 1], seq[0]);
      items.push({ el: cur, rev: enter === 1, at: acc, L: els[cur].to - els[cur].from });
      for (let i = 0; i < seq.length; i++) {
        if (i > 0) acc += dist(seq[i - 1], seq[i]);
        if (!pts.length || dist(seq[i], pts[pts.length - 1]) > 1e-6) pts.push(seq[i]);
      }
      const exitEnd: 0 | 1 = enter === 0 ? 1 : 0;
      const m = mate[cur * 2 + exitEnd];
      if (m < 0) break;
      cur = ends[m].el;
      enter = ends[m].end;
    }
    if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) > 1e-6) pts.push(pts[0]);
    if (!closed && pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 0.1) closed = true;
    if (pts.length >= 2) tracks.push({ id: tracks.length, pts, items, lengthMm: polyLen(pts), closed });
  };
  for (let k = 0; k < els.length; k++) {
    if (used[k]) continue;
    if (mate[k * 2] < 0) walkFrom(k, 0);
    else if (mate[k * 2 + 1] < 0) walkFrom(k, 1);
  }
  for (let k = 0; k < els.length; k++) if (!used[k]) walkFrom(k, 0);
  return tracks;
}

/** Track arc interval [a, b] → chain arc intervals (one per element crossed). */
export function chainSpans(
  t: Track,
  els: readonly Element[],
  a: number,
  b: number,
): { chain: ChainId; fromMm: number; toMm: number }[] {
  const out: { chain: ChainId; fromMm: number; toMm: number }[] = [];
  for (const it of t.items) {
    const lo = Math.max(a, it.at);
    const hi = Math.min(b, it.at + it.L);
    if (hi - lo < 0.05) continue;
    const e = els[it.el];
    const f = it.rev ? e.to - (hi - it.at) : e.from + (lo - it.at);
    const g = it.rev ? e.to - (lo - it.at) : e.from + (hi - it.at);
    out.push({ chain: e.chain, fromMm: f, toMm: g });
  }
  return out;
}
