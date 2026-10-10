// Free loops: the runs of contour no seam takes, welded across seam ends. A body with its seams
// closed has a neck loop, two armholes and a hem; a sleeve a cap and a wrist. Inter-group joins the
// graph did not find are PROPOSED between such loops (design §3.6).

import type { Path } from './solve';

export type LoopPanel = {
  offset: number;
  /** Boundary vertex count (local ids 0..nb-1 are the ring, in contour order). */
  nb: number;
};

export type LoopInput = {
  panels: LoopPanel[];
  /** Global vertex → panel index / ring position (−1 interior). */
  panelOf: Int32Array;
  ringOf: Int32Array;
  /** Rest coordinates (pattern mm) for lengths. */
  uv: Float64Array;
  /** Active seams as side paths + whether B runs the same way as A + B's range for partials. */
  seams: { A: Path; B: Path; same: boolean; aRange: [number, number]; bRange: [number, number] }[];
};

export type RawLoop = { verts: number[]; closed: boolean; len: number; panels: Set<number> };

export function findLoops(L: LoopInput, panelSet: Set<number>): RawLoop[] {
  const N = L.panelOf.length;
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const covered = new Set<number>(); // global id of the segment's start vertex (ring order)
  const at = (P: Path, t: number) => {
    const s = t * P.len;
    let best = 0;
    for (let k = 1; k < P.v.length; k++)
      if (Math.abs(P.s[k] - s) < Math.abs(P.s[best] - s)) best = k;
    return P.v[best];
  };
  const mark = (P: Path, t0: number, t1: number) => {
    for (let k = 0; k + 1 < P.v.length; k++) {
      const a = P.v[k];
      const b = P.v[k + 1];
      if (P.len > 0 && (P.s[k] < t0 * P.len - 0.5 || P.s[k + 1] > t1 * P.len + 0.5)) continue;
      const pa = L.panelOf[a];
      if (pa < 0 || pa !== L.panelOf[b]) continue;
      const nb = L.panels[pa].nb;
      const ra = L.ringOf[a];
      const rb = L.ringOf[b];
      if ((ra + 1) % nb === rb) covered.add(a);
      else if ((rb + 1) % nb === ra) covered.add(b);
    }
  };
  for (const s of L.seams) {
    mark(s.A, s.aRange[0], s.aRange[1]);
    mark(s.B, s.bRange[0], s.bRange[1]);
    // Weld the ends of the sewn stretch.
    const a0 = at(s.A, s.aRange[0]);
    const a1 = at(s.A, s.aRange[1]);
    const b0 = at(s.B, s.same ? s.bRange[0] : s.bRange[1]);
    const b1 = at(s.B, s.same ? s.bRange[1] : s.bRange[0]);
    union(a0, b0);
    union(a1, b1);
  }
  // Free segments.
  type Seg = { a: number; b: number; ra: number; rb: number; len: number; used: boolean };
  const segs: Seg[] = [];
  const adj = new Map<number, number[]>();
  for (const pi of panelSet) {
    const P = L.panels[pi];
    for (let r = 0; r < P.nb; r++) {
      const a = P.offset + r;
      const b = P.offset + ((r + 1) % P.nb);
      if (covered.has(a)) continue;
      const len = Math.hypot(L.uv[2 * b] - L.uv[2 * a], L.uv[2 * b + 1] - L.uv[2 * a + 1]);
      const seg: Seg = { a, b, ra: find(a), rb: find(b), len, used: false };
      const id = segs.length;
      segs.push(seg);
      for (const r0 of [seg.ra, seg.rb]) {
        if (!adj.has(r0)) adj.set(r0, []);
        adj.get(r0)!.push(id);
      }
    }
  }
  const loops: RawLoop[] = [];
  for (let start = 0; start < segs.length; start++) {
    if (segs[start].used) continue;
    // Walk forward from `start` (ring direction), then backward from its start to catch open runs.
    const fwd: number[] = [];
    let cur = start;
    let node = segs[start].rb;
    segs[start].used = true;
    fwd.push(start);
    for (;;) {
      const nextIds = (adj.get(node) ?? []).filter((id) => !segs[id].used);
      if (!nextIds.length) break;
      // Prefer the ring successor on the same panel, then a segment leaving the node by its start.
      const succ = segs[cur].b;
      let pick = nextIds.find((id) => segs[id].a === succ);
      if (pick === undefined) pick = nextIds.find((id) => segs[id].ra === node) ?? nextIds[0];
      segs[pick].used = true;
      fwd.push(pick);
      node = segs[pick].ra === node ? segs[pick].rb : segs[pick].ra;
      cur = pick;
    }
    const closed = node === segs[start].ra;
    const bwd: number[] = [];
    if (!closed) {
      node = segs[start].ra;
      for (;;) {
        const nextIds = (adj.get(node) ?? []).filter((id) => !segs[id].used);
        if (!nextIds.length) break;
        const pick = nextIds.find((id) => segs[id].rb === node) ?? nextIds[0];
        segs[pick].used = true;
        bwd.push(pick);
        node = segs[pick].rb === node ? segs[pick].ra : segs[pick].rb;
      }
    }
    const order = [...bwd.reverse(), ...fwd];
    const verts: number[] = [];
    let len = 0;
    const panels = new Set<number>();
    for (const id of order) {
      const s = segs[id];
      if (!verts.length || verts[verts.length - 1] !== s.a) verts.push(s.a);
      verts.push(s.b);
      len += s.len;
      panels.add(L.panelOf[s.a]);
    }
    if (closed && verts.length > 2 && find(verts[verts.length - 1]) === find(verts[0])) verts.pop();
    loops.push({ verts, closed, len, panels });
  }
  return loops.filter((l) => l.len > 20);
}

/** A loop (or run) as a solver path with rest lengths; cut a closed loop at vertex index `cut`. */
export function loopPath(
  verts: number[],
  uv: Float64Array,
  panelOf: Int32Array,
  cut = 0,
  closed = false,
  /** Ring positions: a step between two vertices of one panel that are not ring neighbours is a
   *  weld across a seam end (a one-piece sleeve's underarm), not paper — it has no length. */
  ring?: { ringOf: Int32Array; nbOf: (panel: number) => number },
): Path {
  const v: number[] = [];
  if (closed) {
    const n = verts.length;
    for (let k = 0; k <= n; k++) v.push(verts[(cut + k) % n]);
  } else v.push(...verts);
  const s = [0];
  for (let k = 1; k < v.length; k++) {
    const a = v[k - 1];
    const b = v[k];
    let d =
      panelOf[a] === panelOf[b]
        ? Math.hypot(uv[2 * b] - uv[2 * a], uv[2 * b + 1] - uv[2 * a + 1])
        : 0;
    if (d > 0 && ring) {
      const ra = ring.ringOf[a];
      const rb = ring.ringOf[b];
      const nb = ring.nbOf(panelOf[a]);
      if (ra >= 0 && rb >= 0 && (ra + 1) % nb !== rb && (rb + 1) % nb !== ra && ra !== rb) d = 0;
    }
    s.push(s[k - 1] + d);
  }
  return { v: Int32Array.from(v), s: Float64Array.from(s), len: s[s.length - 1] };
}
