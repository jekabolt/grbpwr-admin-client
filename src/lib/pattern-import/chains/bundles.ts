// chains/ (F3) — graded bundles: parallel lines side by side, one per size.
//
// Neighbours are found by RAY CASTING, not by "anything within 5 mm" (Ф0.5's union-find glued
// neighbouring pieces and fold lines into super-bundles of 7–11): from every 2 mm sample of a
// candidate chain a ray goes out along both normals; the FIRST line it meets is the neighbour on
// that side. A non-candidate line (a common edge, a fold, a grain line) blocks the ray, so a bundle
// never reaches across a common line. Lines closer than `coincideMm` are the same lane (sizes that
// share the line there) and do not block.
//
// Members are ordered by a signed lateral offset propagated through the neighbour pairs (each pair
// knows its mean offset and whether the two chains run the same way). Members whose offsets agree
// within `laneMm` are one LANE (fragments of one size line). A component with more lanes than the
// size count is a super-bundle and is cut where the lateral spacing jumps or a look repeats.
import type { Chain, ChainId, PtMm } from 'lib/pattern-import/types';

import { dist, resample, SegGrid } from './geom';

export const BUNDLE = {
  stepMm: 2,
  maxSepMm: 12,
  coincideMm: 0.25,
  parallelDeg: 25,
  minOverlapMm: 14,
  laneMm: 0.6,
};

export type PairStat = {
  i: number;
  j: number;
  /** Samples of i that saw j first on one side, and of j that saw i. */
  votesI: number;
  votesJ: number;
  /** Mean signed offset of j from i, in i's left-normal frame (mm). */
  offIJ: number;
  /** +1 when i and j run the same way. */
  same: 1 | -1;
};

export type Lane = { chains: number[]; offset: number; length: number };
export type RawBundle = {
  members: number[];
  lanes: Lane[];
  /** Spacing between consecutive lanes (mm). */
  spacing: number[];
  /** Orientation of each member relative to the component reference. */
  orient: Map<number, 1 | -1>;
};

type Hit = { j: number; u: number; seg: number };

/** First line crossed by the ray p + s·n·u, u ∈ (0, maxSep]. */
function castRay(
  grid: SegGrid,
  polys: PtMm[][],
  self: number,
  p: PtMm,
  n: PtMm,
  maxSep: number,
  skipBelow: number,
): Hit | null {
  let best: Hit | null = null;
  const seen = new Set<number>();
  const mid = { x: p.x + (n.x * maxSep) / 2, y: p.y + (n.y * maxSep) / 2 };
  grid.near(mid, maxSep / 2 + 1, (j, si) => {
    if (j === self) return;
    const key = j * 1e6 + si;
    if (seen.has(key)) return;
    seen.add(key);
    const a = polys[j][si];
    const b = polys[j][si + 1];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const den = n.x * sy - n.y * sx;
    if (Math.abs(den) < 1e-12) return;
    const qx = a.x - p.x;
    const qy = a.y - p.y;
    const u = (qx * sy - qy * sx) / den;
    const v = (qx * n.y - qy * n.x) / den;
    if (v < -1e-6 || v > 1 + 1e-6) return;
    if (u <= skipBelow || u > maxSep) return;
    if (!best || u < best.u) best = { j, u, seg: si };
  });
  return best;
}

/**
 * Neighbour pairs among `cand` chains. Every chain in `blockers` (candidates included) stops rays.
 */
export function neighbourPairs(chains: Chain[], cand: boolean[], blockers: boolean[]): Map<string, PairStat> {
  const polys = chains.map((c) => c.pts);
  const grid = new SegGrid(6);
  chains.forEach((c, i) => {
    if (blockers[i] || cand[i]) grid.addPolyline(i, c.pts);
  });
  const cosPar = Math.cos((BUNDLE.parallelDeg * Math.PI) / 180);
  const pairs = new Map<string, PairStat & { sumOff: number; sumSame: number; n: number }>();
  chains.forEach((c, i) => {
    if (!cand[i]) return;
    const smp = resample(c.pts, BUNDLE.stepMm);
    for (const s of smp) {
      if (s.s < 1 || s.s > c.lengthMm - 1) continue;
      const nrm = { x: -s.t.y, y: s.t.x };
      for (const side of [1, -1] as const) {
        const n = { x: nrm.x * side, y: nrm.y * side };
        const h = castRay(grid, polys, i, s.p, n, BUNDLE.maxSepMm, BUNDLE.coincideMm);
        if (!h || !cand[h.j]) continue;
        const a = polys[h.j][h.seg];
        const b = polys[h.j][h.seg + 1];
        const L = dist(a, b) || 1;
        const dot = (s.t.x * (b.x - a.x) + s.t.y * (b.y - a.y)) / L;
        if (Math.abs(dot) < cosPar) continue;
        const lo = Math.min(i, h.j);
        const hi = Math.max(i, h.j);
        const k = `${lo}|${hi}`;
        let ps = pairs.get(k);
        if (!ps) {
          ps = { i: lo, j: hi, votesI: 0, votesJ: 0, offIJ: 0, same: 1, sumOff: 0, sumSame: 0, n: 0 };
          pairs.set(k, ps);
        }
        if (i === lo) {
          ps.votesI++;
          ps.sumOff += side * h.u;
          ps.sumSame += dot > 0 ? 1 : -1;
          ps.n++;
        } else ps.votesJ++;
      }
    }
  });
  // second sweep for pairs only seen from j: offset from j's samples, mirrored
  const out = new Map<string, PairStat>();
  for (const [k, ps] of pairs) {
    const shorter = Math.min(chains[ps.i].lengthMm, chains[ps.j].lengthMm);
    const overlap = Math.max(ps.votesI, ps.votesJ) * BUNDLE.stepMm;
    if (overlap < Math.min(BUNDLE.minOverlapMm, 0.5 * shorter)) continue;
    if (ps.n === 0) continue; // seen only from the longer side: the offset is measured from i
    out.set(k, { i: ps.i, j: ps.j, votesI: ps.votesI, votesJ: ps.votesJ, offIJ: ps.sumOff / ps.n, same: ps.sumSame >= 0 ? 1 : -1 });
  }
  return out;
}

/** Connected components of the neighbour graph, ordered into lanes by propagated offset. */
export function groupComponents(chains: Chain[], pairs: Map<string, PairStat>): RawBundle[] {
  const adj = new Map<number, PairStat[]>();
  for (const p of pairs.values()) {
    for (const v of [p.i, p.j]) {
      const a = adj.get(v);
      if (a) a.push(p);
      else adj.set(v, [p]);
    }
  }
  const done = new Set<number>();
  const out: RawBundle[] = [];
  for (const start of adj.keys()) {
    if (done.has(start)) continue;
    // BFS from the longest chain of the component (collect first)
    const comp: number[] = [];
    const q = [start];
    done.add(start);
    while (q.length) {
      const v = q.shift()!;
      comp.push(v);
      for (const p of adj.get(v) ?? []) {
        const w = p.i === v ? p.j : p.i;
        if (!done.has(w)) {
          done.add(w);
          q.push(w);
        }
      }
    }
    const ref = comp.reduce((a, b) => (chains[a].lengthMm >= chains[b].lengthMm ? a : b));
    const off = new Map<number, number>([[ref, 0]]);
    const orient = new Map<number, 1 | -1>([[ref, 1]]);
    const q2 = [ref];
    while (q2.length) {
      const v = q2.shift()!;
      for (const p of adj.get(v) ?? []) {
        const w = p.i === v ? p.j : p.i;
        if (off.has(w)) continue;
        const ov = orient.get(v)!;
        // offset of w from v in v's frame: offIJ is j-from-i in i's frame
        let d: number;
        if (p.i === v) d = p.offIJ;
        else d = -p.offIJ * p.same; // i-from-j in j's frame
        off.set(w, off.get(v)! + ov * d);
        orient.set(w, (ov * p.same) as 1 | -1);
        q2.push(w);
      }
    }
    const sorted = comp.slice().sort((a, b) => off.get(a)! - off.get(b)!);
    const lanes: Lane[] = [];
    for (const m of sorted) {
      const o = off.get(m)!;
      const last = lanes[lanes.length - 1];
      if (last && Math.abs(o - last.offset) < BUNDLE.laneMm) {
        last.chains.push(m);
        last.length += chains[m].lengthMm;
        last.offset = (last.offset * (last.chains.length - 1) + o) / last.chains.length;
      } else lanes.push({ chains: [m], offset: o, length: chains[m].lengthMm });
    }
    const spacing: number[] = [];
    for (let k = 1; k < lanes.length; k++) spacing.push(lanes[k].offset - lanes[k - 1].offset);
    out.push({ members: comp, lanes, spacing, orient });
  }
  return out;
}

/**
 * Cut a lane sequence into consecutive groups of at most n lanes. Cost: prefer exactly n, cut at
 * the widest spacing, never keep two lanes of the same look in one group (`look[chain]`, -1 = none).
 */
export function splitLanes(b: RawBundle, n: number, look: (chain: number) => number): number[][] {
  const L = b.lanes.length;
  if (L <= n) return [b.lanes.map((_, k) => k)];
  const lookOf = (k: number) => {
    const m = new Map<number, number>();
    for (const c of b.lanes[k].chains) {
      const l = look(c);
      if (l >= 0) m.set(l, (m.get(l) ?? 0) + 1);
    }
    let best = -1;
    let bn = 0;
    for (const [l, cnt] of m)
      if (cnt > bn) {
        bn = cnt;
        best = l;
      }
    return best;
  };
  const looks = b.lanes.map((_, k) => lookOf(k));
  const meanSp = b.spacing.reduce((a, x) => a + x, 0) / Math.max(1, b.spacing.length);
  // dp[k] = min cost to cover lanes 0..k-1
  const dp = new Array(L + 1).fill(Infinity);
  const prev = new Array(L + 1).fill(-1);
  dp[0] = 0;
  for (let k = 1; k <= L; k++)
    for (let s = Math.max(0, k - n); s < k; s++) {
      const size = k - s;
      let cost = dp[s] + (size === n ? 0 : 2 + (n - size));
      // a cut before s: reward wide spacing there
      if (s > 0) cost -= Math.min(3, b.spacing[s - 1] / (meanSp || 1)) - 1;
      const seen = new Set<number>();
      for (let t = s; t < k; t++) {
        if (looks[t] < 0) continue;
        if (seen.has(looks[t])) cost += 3;
        seen.add(looks[t]);
      }
      if (cost < dp[k]) {
        dp[k] = cost;
        prev[k] = s;
      }
    }
  const groups: number[][] = [];
  for (let k = L; k > 0; k = prev[k]) {
    const s = prev[k];
    groups.unshift(Array.from({ length: k - s }, (_, t) => s + t));
  }
  return groups;
}

export type { ChainId };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Cross-sections: the local lane sequence through one point of a line.
//
// Global ordering of a bundle by propagated offsets drifts on long curved bundles (palto: one
// component of 18 "lanes" from 5 lines). A cross-section is local and exact: from a sample on a
// chain, rays go out along both normals and collect every PARALLEL candidate line crossed, in
// order, until the spacing to the next one exceeds maxSep or a blocking (non-candidate) line is
// met. Lines closer than coincideMm share a lane. Each chain is then ranked by vote over all the
// cross-sections it appears in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type CrossSection = {
  /** Chain the section was cast from, and the arc position. */
  from: number;
  at: PtMm;
  /** Local turning (rad, + = left of `from`'s direction) over ±span around the sample. */
  turn: number;
  /** Lanes from the −normal side to the +normal side of `from`; each lane = chains at ~one offset. */
  lanes: number[][];
  /** Offset of each lane along +normal (mm), the `from` lane is 0. */
  offsets: number[];
  /** Orientation of each lane's first chain relative to `from` (+1 same direction). */
  orient: (1 | -1)[];
};

export const XSEC = { stepMm: 5, rayMm: 70, turnSpanMm: 20 };

type RayHit = { j: number; u: number; dot: number };

function castAll(grid: SegGrid, polys: PtMm[][], self: number, p: PtMm, n: PtMm, t: PtMm, maxLen: number): RayHit[] {
  const hits = new Map<number, RayHit>();
  const seen = new Set<number>();
  const stepQ = 6;
  for (let d = 0; d <= maxLen + stepQ; d += stepQ) {
    const q = { x: p.x + n.x * d, y: p.y + n.y * d };
    grid.near(q, stepQ, (j, si) => {
      if (j === self) return;
      const key = j * 1e6 + si;
      if (seen.has(key)) return;
      seen.add(key);
      const a = polys[j][si];
      const b = polys[j][si + 1];
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const den = n.x * sy - n.y * sx;
      if (Math.abs(den) < 1e-12) return;
      const qx = a.x - p.x;
      const qy = a.y - p.y;
      const u = (qx * sy - qy * sx) / den;
      const v = (qx * n.y - qy * n.x) / den;
      if (v < -1e-6 || v > 1 + 1e-6 || u <= 0 || u > maxLen) return;
      const L = Math.hypot(sx, sy) || 1;
      const dot = (t.x * sx + t.y * sy) / L;
      const prev = hits.get(j);
      if (!prev || u < prev.u) hits.set(j, { j, u, dot });
    });
  }
  return [...hits.values()].sort((a, b) => a.u - b.u);
}

function localTurn(pts: PtMm[], s0: number, span: number): number {
  // turning of the polyline between arc s0-span and s0+span
  let s = 0;
  let t = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    s += dist(pts[i - 1], pts[i]);
    if (s < s0 - span || s > s0 + span) continue;
    const ax = pts[i].x - pts[i - 1].x;
    const ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x;
    const by = pts[i + 1].y - pts[i].y;
    t += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  return t;
}

/**
 * Cross-sections from every candidate chain. `blockers` stop a walk (common edges, folds, grain).
 */
export function crossSections(
  chains: Chain[],
  cand: boolean[],
  blockers: boolean[],
  maxSep = BUNDLE.maxSepMm,
): { sections: CrossSection[]; samples: number[]; wide: number[] } {
  const samples = new Array(chains.length).fill(0);
  const wide = new Array(chains.length).fill(0);
  const polys = chains.map((c) => c.pts);
  const grid = new SegGrid(6);
  chains.forEach((c, i) => {
    if (blockers[i] || cand[i]) grid.addPolyline(i, c.pts);
  });
  const cosPar = Math.cos((BUNDLE.parallelDeg * Math.PI) / 180);
  const out: CrossSection[] = [];
  chains.forEach((c, i) => {
    if (!cand[i]) return;
    for (const s of resample(c.pts, XSEC.stepMm)) {
      if (s.s < 2 || s.s > c.lengthMm - 2) continue;
      samples[i]++;
      const nrm = { x: -s.t.y, y: s.t.x };
      const side = (sign: 1 | -1) => {
        const n = { x: nrm.x * sign, y: nrm.y * sign };
        const hits = castAll(grid, polys, i, s.p, n, s.t, XSEC.rayMm);
        const lanes: { chains: number[]; u: number; dot: number }[] = [];
        let prev = 0;
        for (const h of hits) {
          if (Math.abs(h.dot) < cosPar) {
            // a crossing line: a candidate crossing (another bundle, a notch) is stepped over;
            // a blocking crossing line ends the section only if it is not a candidate
            if (!cand[h.j] && blockers[h.j]) break;
            continue;
          }
          if (!cand[h.j]) break;
          if (h.u - prev > maxSep) break;
          const last = lanes[lanes.length - 1];
          if (h.u <= BUNDLE.coincideMm || (last && h.u - last.u <= BUNDLE.coincideMm)) {
            if (last) last.chains.push(h.j);
            else lanes.push({ chains: [h.j], u: 0, dot: h.dot });
            continue;
          }
          lanes.push({ chains: [h.j], u: h.u, dot: h.dot });
          prev = h.u;
        }
        return lanes;
      };
      const plus = side(1);
      const minus = side(-1);
      const zero = minus.length && minus[0].u === 0 ? minus.shift()!.chains : [];
      const zeroP = plus.length && plus[0].u === 0 ? plus.shift()!.chains : [];
      const lanes: number[][] = [];
      const offsets: number[] = [];
      const orient: (1 | -1)[] = [];
      for (let k = minus.length - 1; k >= 0; k--) {
        lanes.push(minus[k].chains);
        offsets.push(-minus[k].u);
        orient.push(minus[k].dot >= 0 ? 1 : -1);
      }
      lanes.push([i, ...zero, ...zeroP]);
      offsets.push(0);
      orient.push(1);
      for (const l of plus) {
        lanes.push(l.chains);
        offsets.push(l.u);
        orient.push(l.dot >= 0 ? 1 : -1);
      }
      if (lanes.length < 2) continue;
      if (lanes.length >= 3) wide[i]++;
      out.push({ from: i, at: s.p, turn: localTurn(c.pts, s.s, XSEC.turnSpanMm), lanes, offsets, orient });
    }
  });
  return { sections: out, samples, wide };
}

/**
 * Cut a cross-section into groups of ≤ n lanes (same costs as splitLanes: exactly n preferred,
 * cuts at wide spacing, no repeated unit inside a group).
 */
export function splitSection(x: CrossSection, n: number, unitOfLane: (lane: number[]) => number): number[][] {
  const fake: RawBundle = {
    members: [],
    lanes: x.lanes.map((chains, k) => ({ chains, offset: x.offsets[k], length: 1 })),
    spacing: x.offsets.slice(1).map((o, k) => o - x.offsets[k]),
    orient: new Map(),
  };
  const laneUnit = x.lanes.map(unitOfLane);
  return splitLanes(fake, n, (c) => {
    // splitLanes asks per chain; map back through the lane containing it
    const k = x.lanes.findIndex((l) => l.includes(c));
    return k >= 0 ? laneUnit[k] : -1;
  });
}
