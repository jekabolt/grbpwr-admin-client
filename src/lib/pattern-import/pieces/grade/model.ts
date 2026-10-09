// pieces/grade (H1) — the rank model of a sheet drawn with ONE line style for every size.
//
//   samples    every 4 mm along a track, a normal ray; the parallel tracks it crosses are lanes
//   tuples     the ordered lane set of a sample; FULL = exactly n lanes (the n sizes side by side)
//   components full tuples linked by a shared track: same lane → same orientation, mirrored lane
//              → opposite (a pinch / fork). One free bit per component (which way the rank grows)
//   sets       per sample, the ranks a track carries under bit 0: full → {lane}; partial → each
//              rank predicted at (q − r0)·step snaps onto the DRAWN lane it lands on; a track that
//              never sat in a full tuple takes its neighbours' votes (iterated: predicted tracks
//              vote too); lone (no neighbour) = drawn once for every size
//   landings   a track ending ON another hands its ranks to the host until the next landing of
//              the same rank (the size line continues along the line it merged into)
import type { ChainSet, Sheet } from 'lib/pattern-import/types';

import { SegGrid } from '../geom';

import { buildTracks, elementsOf, TRACK_OPTS, type Element, type Track } from './tracks';
import { arcLengths, dist, dot, endTangent, median, resampleT, sub, unit, type V } from './vec';

/** A parallel track met by a sample's normal ray: offset s (mm) and |cos| of its angle to the track. */
export type Lane = { track: number; s: number; c?: number };
export type Sample = {
  track: number;
  idx: number;
  p: V;
  t: V;
  n: V;
  /** arc position on the track, mm */
  u: number;
  lanes: Lane[];
  coincident: boolean;
};
export type Entry = { comp: number; ranks: number[] };

export type GradeModel = {
  n: number;
  els: Element[];
  tracks: Track[];
  step0: number;
  reach: number;
  samplesOf: Map<number, Sample[]>;
  /** track → per sample → rank entries under bit 0 (comp −1 = fixed, e.g. "every size") */
  sets: Map<number, Entry[][]>;
  compOf: Int32Array;
  rank0: Int32Array;
  compOfSet: Map<number, number>;
  common: Set<number>;
  nComps: number;
  fullTuples: number;
  parityConflicts: number;
  laneConflicts: number;
  /** band count per cross-section: histogram of lane counts of multi-lane samples */
  bandHist: Map<number, number>;
  /** label frames: never walls */
  frames: Set<number>;
  /** track → sample indices whose cross-section contradicts the grade order (no wall there) */
  masked: Map<number, Set<number>>;
};

type Tuple = { key: string; lanes: number[]; count: number };

class Parity {
  parent: number[] = [];
  par: number[] = [];
  conflicts = 0;
  add() {
    this.parent.push(this.parent.length);
    this.par.push(0);
    return this.parent.length - 1;
  }
  find(x: number): [number, number] {
    if (this.parent[x] === x) return [x, 0];
    const [r, p] = this.find(this.parent[x]);
    this.parent[x] = r;
    this.par[x] ^= p;
    return [r, this.par[x]];
  }
  union(x: number, y: number, d: number): boolean {
    const [rx, px] = this.find(x);
    const [ry, py] = this.find(y);
    if (rx === ry) {
      if ((px ^ py) !== d) {
        this.conflicts++;
        return false;
      }
      return true;
    }
    this.parent[rx] = ry;
    this.par[rx] = px ^ py ^ d;
    return true;
  }
}

/** Parallel tracks crossed by the normal ray at p (|s| ≤ reach), nearest hit per track, sorted by s. */
function rayHits(grid: SegGrid, tracks: Track[], p: V, nrm: V, reach: number, self: number, t: V, cosMin: number): Lane[] {
  const a = { x: p.x - nrm.x * reach, y: p.y - nrm.y * reach };
  const b = { x: p.x + nrm.x * reach, y: p.y + nrm.y * reach };
  const best = new Map<number, number>();
  const cosOf = new Map<number, number>();
  const seen = new Set<number>();
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const visit = (k: number, i: number) => {
    if (k === self) return;
    const key = k * 1048576 + i;
    if (seen.has(key)) return;
    seen.add(key);
    const q = tracks[k].pts;
    const c = q[i];
    const d = q[i + 1];
    const sx = d.x - c.x;
    const sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return;
    const qx = c.x - a.x;
    const qy = c.y - a.y;
    const tt = (qx * sy - qy * sx) / den;
    const uu = (qx * ry - qy * rx) / den;
    if (tt < 0 || tt > 1 || uu < 0 || uu > 1) return;
    const sl = Math.hypot(sx, sy) || 1;
    const cs = Math.abs((sx * t.x + sy * t.y) / sl);
    if (cs < cosMin) return;
    const s = (tt - 0.5) * 2 * reach;
    const prev = best.get(k);
    if (prev === undefined || Math.abs(s) < Math.abs(prev)) {
      best.set(k, s);
      cosOf.set(k, cs);
    }
  };
  const steps = Math.ceil((2 * reach) / grid.cell) + 1;
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    grid.near({ x: a.x + rx * u, y: a.y + ry * u }, grid.cell * 0.5, visit);
  }
  const sorted = [...best].map(([track, s]) => ({ track, s, c: cosOf.get(track) ?? 1 })).sort((x, y) => x.s - y.s);
  const out: Lane[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(h.s - last.s) < 0.3) {
      if (h.track < last.track) out[out.length - 1] = h;
      continue;
    }
    out.push(h);
  }
  return out;
}

/**
 * §5.3: a neighbouring piece's bundle within reach joins the lane run with a wider gap between
 * the two bundles than inside either. Cut the run where a spacing exceeds SPLIT_RATIO × the
 * median spacing; keep the group holding self.
 */
export const SPLIT_RATIO = 2.6;
function splitRun(run: Lane[], self: number): Lane[] {
  if (run.length < 4) return run;
  const sp = run.slice(1).map((l, k) => l.s - run[k].s);
  const med = median(sp);
  let lo = 0;
  let hi = run.length - 1;
  const si = run.findIndex((l) => l.track === self);
  for (let k = si; k > 0; k--)
    if (sp[k - 1] > SPLIT_RATIO * med) {
      lo = k;
      break;
    }
  for (let k = si; k < run.length - 1; k++)
    if (sp[k] > SPLIT_RATIO * med) {
      hi = k;
      break;
    }
  return run.slice(lo, hi + 1);
}

export type ModelOpts = {
  /** sample pitch along a track, mm */
  pitchMm: number;
  /** max angle between a lane and the track, degrees */
  laneAngleDeg: number;
  log?: (s: string) => void;
};

/** Passes of "predicted tracks vote too" (02-DESIGN §5.1). */
export const PROPAGATE_PASSES = 3;

export const MODEL_OPTS: ModelOpts = { pitchMm: 4, laneAngleDeg: 30 };

export function buildModel(sheet: Sheet, set: ChainSet, use: number[], n: number, mo: ModelOpts = MODEL_OPTS): GradeModel {
  const log = mo.log ?? (() => {});
  const els = elementsOf(sheet, set, use);
  const tracks = buildTracks(els);
  const long = tracks.filter((t) => t.lengthMm >= 1.5);
  const grid = new SegGrid(8);
  for (const t of long) grid.addPolyline(t.id, t.pts);
  const cosLane = Math.cos((mo.laneAngleDeg * Math.PI) / 180);
  // step0 = mode of the distance to the nearest parallel neighbour
  const hist = new Map<number, number>();
  const raw = new Map<number, { p: V; t: V; u: number }[]>();
  for (const t of long) {
    const rs = resampleT(t.pts, mo.pitchMm);
    raw.set(t.id, rs);
    for (const s of rs) {
      const nrm = { x: -s.t.y, y: s.t.x };
      const lanes = rayHits(grid, tracks, s.p, nrm, 30, t.id, s.t, cosLane);
      let d = Infinity;
      for (const l of lanes) d = Math.min(d, Math.abs(l.s));
      if (!isFinite(d) || d < 1) continue;
      const bin = Math.round(d * 2) / 2;
      hist.set(bin, (hist.get(bin) ?? 0) + 1);
    }
  }
  let step0 = 8;
  let hb = -1;
  for (const [k, v] of hist)
    if (v > hb || (v === hb && k < step0)) {
      hb = v;
      step0 = k;
    }
  const reach = Math.min(90, Math.max(10, (n - 1) * step0 * 1.4 + 3));
  log(`  elements ${els.length} tracks ${tracks.length} (long ${long.length}) step0=${step0} reach=${reach.toFixed(0)}`);
  // samples with the real reach; the lane run around self is cut at gaps > 2.5·step0
  const samplesOf = new Map<number, Sample[]>();
  for (const t of long) {
    const list: Sample[] = [];
    (raw.get(t.id) ?? []).forEach((s, idx) => {
      const nrm = { x: -s.t.y, y: s.t.x };
      const hits = rayHits(grid, tracks, s.p, nrm, reach, t.id, s.t, cosLane);
      const coincident = hits.some((h) => Math.abs(h.s) < 0.3);
      const all = [...hits.filter((h) => Math.abs(h.s) >= 0.3), { track: t.id, s: 0, c: 1 }].sort((x, y) => x.s - y.s);
      const si = all.findIndex((l) => l.track === t.id);
      let lo = si;
      while (lo > 0 && all[lo].s - all[lo - 1].s <= 2.5 * step0) lo--;
      let hi = si;
      while (hi + 1 < all.length && all[hi + 1].s - all[hi].s <= 2.5 * step0) hi++;
      list.push({ track: t.id, idx, p: s.p, t: s.t, n: nrm, u: s.u, lanes: splitRun(all.slice(lo, hi + 1), t.id), coincident });
    });
    samplesOf.set(t.id, list);
  }
  const M: GradeModel = {
    n,
    els,
    tracks,
    step0,
    reach,
    samplesOf,
    sets: new Map(),
    compOf: new Int32Array(tracks.length).fill(-1),
    rank0: new Int32Array(tracks.length).fill(-1),
    compOfSet: new Map(),
    common: new Set(),
    nComps: 0,
    fullTuples: 0,
    parityConflicts: 0,
    laneConflicts: 0,
    bandHist: new Map(),
    frames: new Set(),
    masked: new Map(),
  };
  for (const [, ss] of samplesOf)
    for (const s of ss) if (s.lanes.length > 1) M.bandHist.set(s.lanes.length, (M.bandHist.get(s.lanes.length) ?? 0) + 1);
  rankTracks(M, log);
  return M;
}

/** Tuples → components with parity → rank0 per track → per-sample rank sets → landings. */
function rankTracks(M: GradeModel, log: (s: string) => void) {
  const { n, tracks, samplesOf, step0 } = M;
  const tuples = new Map<string, Tuple>();
  const sampleKey = new Map<Sample, string>();
  for (const [, ss] of samplesOf)
    for (const s of ss) {
      let ids = s.lanes.map((l) => l.track);
      let sv = s.lanes.map((l) => l.s);
      if (ids.length > n) {
        const selfIdx = ids.indexOf(s.track);
        let best = -1;
        let bestCv = Infinity;
        for (let w0 = Math.max(0, selfIdx - n + 1); w0 <= Math.min(selfIdx, ids.length - n); w0++) {
          const sp: number[] = [];
          for (let k = w0 + 1; k < w0 + n; k++) sp.push(sv[k] - sv[k - 1]);
          const m = sp.reduce((a, b) => a + b, 0) / sp.length;
          const cv = Math.sqrt(sp.reduce((a, v) => a + (v - m) ** 2, 0) / sp.length) / (m || 1);
          if (cv < bestCv) {
            bestCv = cv;
            best = w0;
          }
        }
        if (best >= 0 && bestCv <= 0.4) {
          ids = ids.slice(best, best + n);
          sv = sv.slice(best, best + n);
        }
      }
      const f = ids.join(',');
      const r = [...ids].reverse().join(',');
      const key = f <= r ? f : r;
      const lanes = f <= r ? ids : [...ids].reverse();
      let tu = tuples.get(key);
      if (!tu) {
        tu = { key, lanes, count: 0 };
        tuples.set(key, tu);
      }
      tu.count++;
      sampleKey.set(s, key);
    }
  const full = [...tuples.values()].filter((t) => t.lanes.length === n && t.count >= 2);
  M.fullTuples = full.length;
  const par = new Parity();
  const nodeOf = new Map<string, number>();
  for (const t of full) nodeOf.set(t.key, par.add());
  const byTrack = new Map<number, { key: string; lane: number; count: number }[]>();
  for (const t of full)
    t.lanes.forEach((tr, lane) => {
      const a = byTrack.get(tr);
      const e = { key: t.key, lane, count: t.count };
      if (a) a.push(e);
      else byTrack.set(tr, [e]);
    });
  for (const [, list] of byTrack) {
    list.sort((a, b) => b.count - a.count);
    const a = list[0];
    for (let i = 1; i < list.length; i++) {
      const c = list[i];
      if (c.lane === a.lane) par.union(nodeOf.get(a.key)!, nodeOf.get(c.key)!, 0);
      else if (c.lane === n - 1 - a.lane) par.union(nodeOf.get(a.key)!, nodeOf.get(c.key)!, 1);
      else M.laneConflicts++;
    }
  }
  M.parityConflicts = par.conflicts;
  const compIdOf = new Map<number, number>();
  const votes = new Map<number, Map<number, number>>();
  for (const t of full) {
    const [root, p] = par.find(nodeOf.get(t.key)!);
    if (!compIdOf.has(root)) compIdOf.set(root, compIdOf.size);
    const comp = compIdOf.get(root)!;
    t.lanes.forEach((tr, lane) => {
      const r = p === 0 ? lane : n - 1 - lane;
      let v = votes.get(tr);
      if (!v) {
        v = new Map();
        votes.set(tr, v);
      }
      v.set(r, (v.get(r) ?? 0) + t.count);
      if (M.compOf[tr] < 0) M.compOf[tr] = comp;
    });
  }
  M.nComps = compIdOf.size;
  for (const [tr, v] of votes) {
    let br = -1;
    let bw = -1;
    for (const [r, w] of v)
      if (w > bw) {
        bw = w;
        br = r;
      }
    M.rank0[tr] = br;
  }
  // per-sample rank sets of ranked tracks; votes for the unranked neighbours
  const ALL = Array.from({ length: n }, (_, i) => i);
  const voteSets = new Map<number, Map<number, Map<string, number>>>();
  const nearestSample = (tr: number, hit: V) => {
    const oss = samplesOf.get(tr);
    if (!oss) return -1;
    let bi = -1;
    let bd = Infinity;
    oss.forEach((o, j) => {
      const d = dist(o.p, hit);
      if (d < bd) {
        bd = d;
        bi = j;
      }
    });
    return bi;
  };
  for (const [tr, ss] of samplesOf) {
    if (M.rank0[tr] < 0) continue;
    const r0 = M.rank0[tr];
    const fullIdx: { i: number; step: number }[] = [];
    ss.forEach((s, i) => {
      const key = sampleKey.get(s);
      if (!key || !nodeOf.has(key)) return;
      const tu = tuples.get(key)!;
      const [, p] = par.find(nodeOf.get(key)!);
      const laneOrderSign = s.lanes[0].track === tu.lanes[0] ? 1 : -1;
      const rankUp = (p === 0 ? 1 : -1) * laneOrderSign;
      const sp = s.lanes.slice(1).map((l, k) => l.s - s.lanes[k].s);
      fullIdx.push({ i, step: rankUp * median(sp) });
    });
    const comp = M.compOf[tr];
    const mine: Entry[][] = ss.map(() => [{ comp, ranks: [r0] }]);
    ss.forEach((s, i) => {
      const key = sampleKey.get(s);
      if (key && nodeOf.has(key)) return;
      if (s.lanes.length === 1) {
        mine[i] = [{ comp: -1, ranks: ALL }];
        return;
      }
      if (!fullIdx.length) return;
      let near = fullIdx[0];
      for (const f of fullIdx) if (Math.abs(f.i - i) < Math.abs(near.i - i)) near = f;
      const spLoc = s.lanes.slice(1).map((l, k) => l.s - s.lanes[k].s);
      const step = Math.sign(near.step) * median(spLoc);
      const perLane: number[][] = s.lanes.map(() => []);
      for (let q = 0; q < n; q++) {
        const e = (q - r0) * step;
        let bl = -1;
        let bd = 0.45 * Math.abs(step);
        s.lanes.forEach((l, k) => {
          const d = Math.abs(l.s - e);
          if (d < bd) {
            bd = d;
            bl = k;
          }
        });
        if (bl >= 0) perLane[bl].push(q);
      }
      s.lanes.forEach((l, k) => {
        if (l.track === tr) {
          mine[i] = [{ comp, ranks: perLane[k].length ? perLane[k] : [r0] }];
          return;
        }
        if (M.rank0[l.track] >= 0 || !perLane[k].length) return;
        const bi = nearestSample(l.track, { x: s.p.x + s.n.x * l.s, y: s.p.y + s.n.y * l.s });
        if (bi < 0) return;
        let v = voteSets.get(l.track);
        if (!v) {
          v = new Map();
          voteSets.set(l.track, v);
        }
        let vs = v.get(bi);
        if (!vs) {
          vs = new Map();
          v.set(bi, vs);
        }
        const k2 = `${comp}|${perLane[k].join(',')}`;
        vs.set(k2, (vs.get(k2) ?? 0) + 1);
      });
    });
    M.sets.set(tr, mine);
  }
  // unranked tracks: common (drawn once for every size), or ranked by their neighbours' votes.
  // Iterated (§5.1): a track ranked by votes votes in its turn — wherever ≥ 2 lanes of one
  // cross-section are known (same component), rank = a + b·s is fitted through them and every
  // unknown lane whose fit lands on an integer rank (±0.3) gets that vote.
  const assign = (tr: number, ss: Sample[], v: Map<number, Map<string, number>>) => {
    const compW = new Map<number, number>();
    for (const [, vs] of v)
      for (const [k, w] of vs) {
        const c = +k.split('|')[0];
        compW.set(c, (compW.get(c) ?? 0) + w);
      }
    let comp = -1;
    let bw = -1;
    for (const [c, w] of compW)
      if (w > bw) {
        bw = w;
        comp = c;
      }
    M.compOfSet.set(tr, comp);
    const mine: Entry[][] = ss.map((s, i) => {
      const vs = v.get(i);
      if (vs) {
        let bk = '';
        let bw2 = -1;
        for (const [k, w] of vs)
          if (+k.split('|')[0] === comp && w > bw2) {
            bw2 = w;
            bk = k;
          }
        if (bk) return [{ comp, ranks: bk.split('|')[1].split(',').map(Number) }];
      }
      return s.lanes.length === 1 ? [{ comp: -1, ranks: ALL }] : [];
    });
    const voted = mine.map((m, i) => (m.length ? i : -1)).filter((i) => i >= 0);
    mine.forEach((m, i) => {
      if (m.length) return;
      let near = -1;
      for (const j of voted) if (near < 0 || Math.abs(j - i) < Math.abs(near - i)) near = j;
      if (near >= 0 && Math.abs(near - i) <= 10) mine[i] = mine[near];
    });
    M.sets.set(tr, mine);
  };
  for (const [tr, ss] of samplesOf) {
    if (M.rank0[tr] >= 0) continue;
    const alone = ss.filter((s) => s.lanes.length === 1).length;
    const coinc = ss.filter((s) => s.coincident).length;
    if (alone >= 0.6 * ss.length || coinc >= 0.6 * ss.length) {
      M.common.add(tr);
      M.sets.set(tr, ss.map(() => [{ comp: -1, ranks: ALL }]));
    }
  }
  const single = (tr: number, i: number): Entry | null => {
    const e = M.sets.get(tr)?.[i];
    if (!e || e.length !== 1 || e[0].comp < 0 || e[0].ranks.length !== 1) return null;
    return e[0];
  };
  for (let pass = 0; pass <= PROPAGATE_PASSES; pass++) {
    // tracks still unknown take the votes gathered so far
    let assigned = 0;
    for (const [tr, ss] of samplesOf) {
      if (M.rank0[tr] >= 0 || M.common.has(tr) || M.sets.has(tr)) continue;
      const v = voteSets.get(tr);
      if (v && v.size) {
        assign(tr, ss, v);
        assigned++;
      }
    }
    if (pass === PROPAGATE_PASSES) break;
    // known tracks vote for the unknown lanes of their cross-sections
    let cast = 0;
    for (const [tr, ss] of samplesOf) {
      if (!M.sets.has(tr) || M.common.has(tr)) continue;
      ss.forEach((s, i) => {
        if (s.lanes.length < 2) return;
        const me = single(tr, i);
        if (!me) return;
        const known: { s: number; r: number }[] = [];
        const unknown: { l: Lane; j: number }[] = [];
        for (const l of s.lanes) {
          if (l.track === tr) {
            known.push({ s: 0, r: me.ranks[0] });
            continue;
          }
          const j = nearestSample(l.track, { x: s.p.x + s.n.x * l.s, y: s.p.y + s.n.y * l.s });
          if (j < 0) continue;
          if (M.sets.has(l.track)) {
            const e = single(l.track, j);
            if (e && e.comp === me.comp) known.push({ s: l.s, r: e.ranks[0] });
          } else if (!M.common.has(l.track)) unknown.push({ l, j });
        }
        if (known.length < 2 || !unknown.length) return;
        // least squares r = a + b·s
        const N = known.length;
        const ms = known.reduce((x, k) => x + k.s, 0) / N;
        const mr = known.reduce((x, k) => x + k.r, 0) / N;
        let sxx = 0;
        let sxy = 0;
        for (const k of known) {
          sxx += (k.s - ms) ** 2;
          sxy += (k.s - ms) * (k.r - mr);
        }
        if (sxx < 1e-9) return;
        const bb = sxy / sxx;
        const aa = mr - bb * ms;
        if (Math.abs(bb) < 1e-6) return;
        for (const k of known) if (Math.abs(aa + bb * k.s - k.r) > 0.25) return; // not one even grade
        for (const u of unknown) {
          const q = aa + bb * u.l.s;
          const qi = Math.round(q);
          if (Math.abs(q - qi) > 0.3 || qi < 0 || qi >= n) continue;
          let v = voteSets.get(u.l.track);
          if (!v) {
            v = new Map();
            voteSets.set(u.l.track, v);
          }
          let vs = v.get(u.j);
          if (!vs) {
            vs = new Map();
            v.set(u.j, vs);
          }
          const key = `${me.comp}|${qi}`;
          vs.set(key, (vs.get(key) ?? 0) + 1);
          cast++;
        }
      });
    }
    log(`  propagate pass ${pass}: assigned ${assigned}, votes cast ${cast}`);
    if (!cast && !assigned) break;
  }
  landings(M, log);
  log(`  full ${full.length} comps ${M.nComps} ranked ${votes.size} common ${M.common.size} parity ${par.conflicts} lane ${M.laneConflicts}`);
  void step0;
  void tracks;
}

/** A track END on another track's interior hands its ranks to the host (see header). */
function landings(M: GradeModel, log: (s: string) => void) {
  const { n, tracks, samplesOf, sets } = M;
  const hostGrid = new SegGrid(4);
  for (const [tr] of samplesOf) hostGrid.addPolyline(tr, tracks[tr].pts);
  const accCache = new Map<number, number[]>();
  const accOf = (tr: number) => {
    let a = accCache.get(tr);
    if (!a) {
      a = arcLengths(tracks[tr].pts);
      accCache.set(tr, a);
    }
    return a;
  };
  type Event = { u: number; dir: number; entries: Entry[] };
  const events = new Map<number, Event[]>();
  let count = 0;
  const neighbourHas = (host: number, smp: Sample, rr: number) =>
    smp.lanes.some((l) => {
      if (l.track === host) return false;
      const oss = samplesOf.get(l.track);
      const om = sets.get(l.track);
      if (!oss || !om) return false;
      const hit = { x: smp.p.x + smp.n.x * l.s, y: smp.p.y + smp.n.y * l.s };
      let bi = -1;
      let bd = 6;
      oss.forEach((o, j) => {
        const d = dist(o.p, hit);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      });
      return bi >= 0 && om[bi].some((x) => x.ranks.length < n && x.ranks.includes(rr));
    });
  const pass = (): number => {
    let changed = 0;
    events.clear();
    for (const [tr, ss] of samplesOf) {
      const m = sets.get(tr);
      if (!m || !ss.length) continue;
      const t = tracks[tr];
      if (t.closed) continue;
      for (const end of [0, 1] as const) {
        const e = end ? t.pts[t.pts.length - 1] : t.pts[0];
        const tau = endTangent(t.pts, end);
        const entries = m[end ? ss.length - 1 : 0];
        if (!entries.length) continue;
        const rk = entries.flatMap((x) => x.ranks);
        if (rk.length === n && entries.some((x) => x.comp === -1)) continue;
        let best: { host: number; u: number; dir: number; d: number } | null = null;
        hostGrid.near(e, 1.4, (h, i) => {
          if (h === tr) return;
          const q = tracks[h].pts;
          const a = q[i];
          const ab = sub(q[i + 1], a);
          const L2 = dot(ab, ab) || 1e-12;
          const uu = Math.max(0, Math.min(1, dot(sub(e, a), ab) / L2));
          const hit = { x: a.x + ab.x * uu, y: a.y + ab.y * uu };
          const d = dist(hit, e);
          if (d > 0.6) return;
          const acc = accOf(h);
          const u = acc[i] + uu * Math.sqrt(L2);
          if (u < 1 || u > acc[acc.length - 1] - 1) return;
          const c = dot(tau, unit(ab));
          if (Math.abs(c) < Math.cos((35 * Math.PI) / 180)) return;
          if (!best || d < best.d) best = { host: h, u, dir: Math.sign(c), d };
        });
        if (!best) continue;
        const bb = best as { host: number; u: number; dir: number; d: number };
        const ev = events.get(bb.host) ?? [];
        ev.push({ u: bb.u, dir: bb.dir, entries });
        events.set(bb.host, ev);
        count++;
      }
    }
    for (const [host, ev] of events) {
      const ss = samplesOf.get(host);
      const m = sets.get(host);
      if (!ss || !m) continue;
      const closedHost = tracks[host].closed;
      for (const e of ev) {
        for (const entry of e.entries) {
          for (const r of entry.ranks) {
            let stop = e.dir > 0 ? Infinity : -Infinity;
            for (const f of ev) {
              if (f === e || !f.entries.some((x) => x.ranks.includes(r))) continue;
              if (e.dir > 0 && f.u > e.u && f.u < stop) stop = f.u;
              if (e.dir < 0 && f.u < e.u && f.u > stop) stop = f.u;
            }
            let wrapStop: number | null = null;
            if (closedHost && !isFinite(stop)) {
              let w = e.dir > 0 ? Infinity : -Infinity;
              for (const f of ev) {
                if (f === e || !f.entries.some((x) => x.ranks.includes(r))) continue;
                if (e.dir > 0 && f.u < w) w = f.u;
                if (e.dir < 0 && f.u > w) w = f.u;
              }
              if (isFinite(w)) wrapStop = w;
            }
            const order = ss.map((s, i) => ({ u: s.u, i })).sort((a, b) => (e.dir > 0 ? a.u - b.u : b.u - a.u));
            const walk = (list: { u: number; i: number }[]) => {
              for (const { u, i } of list) {
                const cur = m[i];
                const has = cur.some((x) => x.ranks.includes(r));
                if (!has && Math.abs(u - e.u) > 1 && neighbourHas(host, ss[i], r)) return;
                const have = cur.find((x) => x.comp === entry.comp);
                if (have) {
                  if (!have.ranks.includes(r)) {
                    have.ranks = [...have.ranks, r].sort((a, b) => a - b);
                    changed++;
                  }
                } else {
                  cur.push({ comp: entry.comp, ranks: [r] });
                  changed++;
                }
              }
            };
            walk(order.filter(({ u }) => (e.dir > 0 ? u >= e.u && u <= stop : u <= e.u && u >= stop)));
            if (wrapStop != null) {
              const ws = wrapStop;
              walk(order.filter(({ u }) => (e.dir > 0 ? u <= ws : u >= ws)).reverse());
            }
          }
        }
      }
    }
    return changed;
  };
  for (let k = 0; k < 4; k++) if (!pass()) break;
  log(`  landings ${count} on ${events.size} hosts`);
}

// ── evaluation under component bits ──────────────────────────────────────────────────────────

export const compOfTrack = (M: GradeModel, tr: number) =>
  M.compOf[tr] >= 0 ? M.compOf[tr] : (M.compOfSet.get(tr) ?? -1);

const flip = (ranks: number[], n: number, bit: number) =>
  bit ? ranks.map((r) => n - 1 - r).sort((a, b) => a - b) : ranks;

export function ranksAt(M: GradeModel, tr: number, i: number, bits: readonly number[]): number[] {
  const m = M.sets.get(tr);
  if (!m || M.masked.get(tr)?.has(i)) return [];
  const out = new Set<number>();
  for (const e of m[i] ?? []) for (const r of e.comp >= 0 ? flip(e.ranks, M.n, bits[e.comp] ?? 0) : e.ranks) out.add(r);
  return [...out].sort((a, b) => a - b);
}

export type TrackPortion = { track: number; from: number; to: number; ranks: number[]; comps: number[] };

/** Maximal runs of equal rank sets along each track (boundaries halfway between samples). */
export function trackPortions(M: GradeModel, bits: readonly number[], only?: Set<number>): TrackPortion[] {
  const out: TrackPortion[] = [];
  for (const [tr, ss] of M.samplesOf) {
    if (M.frames.has(tr) || (only && !only.has(tr))) continue;
    const total = M.tracks[tr].lengthMm;
    let i = 0;
    while (i < ss.length) {
      const rs = ranksAt(M, tr, i, bits);
      const key = rs.join(',');
      let j = i;
      while (j + 1 < ss.length && ranksAt(M, tr, j + 1, bits).join(',') === key) j++;
      const from = i === 0 ? 0 : (ss[i - 1].u + ss[i].u) / 2;
      const to = j === ss.length - 1 ? total : (ss[j].u + ss[j + 1].u) / 2;
      if (rs.length) {
        const comps = [...new Set((M.sets.get(tr)?.[i] ?? []).map((e) => e.comp).filter((c) => c >= 0))];
        out.push({ track: tr, from, to, ranks: rs, comps });
      }
      i = j + 1;
    }
  }
  return out;
}

/**
 * The logic of the increment, checked locally: under the chosen bits, the single ranks met along
 * any normal ray must grow with the offset (sizes nest; a fork swaps sides only where lines cross,
 * and crossing lines are not lanes of one ray). A sample whose lanes read e.g. 5 · 1 · 2 · 0 has a
 * wrong rank somewhere in its cross-section — every single-rank lane there loses its wall at that
 * spot (the rank leaks to the operator instead of closing along the wrong line). Returns the
 * number of masked samples.
 */
const ORDER_COS = Math.cos((8 * Math.PI) / 180);
export const DEBUG_ORDER = { on: false, printed: 0, log: (s: string) => console.log(s) };
export function maskOrderConflicts(M: GradeModel, bits: readonly number[]): number {
  M.masked.clear();
  const nearest = (tr: number, p: V) => {
    const ss = M.samplesOf.get(tr);
    if (!ss) return -1;
    let bi = -1;
    let bd = 3;
    ss.forEach((o, j) => {
      const d = dist(o.p, p);
      if (d < bd) {
        bd = d;
        bi = j;
      }
    });
    return bi;
  };
  const marks: [number, number][] = [];
  for (const [tr, ss] of M.samplesOf) {
    ss.forEach((s, i) => {
      if (s.lanes.length < 3) return;
      // a clean cross-section only: every lane parallel (≤ 8°) and evenly spaced — a line crossing
      // the bundle at a shallow angle, or a second bundle meeting it at a corner, is not a lane
      if (s.lanes.some((l) => (l.c ?? 1) < ORDER_COS)) return;
      const sp = s.lanes.slice(1).map((l, k) => l.s - s.lanes[k].s);
      const med = median(sp);
      if (sp.some((d) => d < 0.5 * med || d > 2.2 * med)) return;
      if (sp.some((d) => d < 1)) return; // converging below the drawing's resolution
      const self = M.sets.get(tr)?.[i];
      if (!self || self.length !== 1 || self[0].comp < 0) return;
      const comp = self[0].comp;
      const seq: { tr: number; j: number; r: number }[] = [];
      for (const l of s.lanes) {
        const j = l.track === tr ? i : nearest(l.track, { x: s.p.x + s.n.x * l.s, y: s.p.y + s.n.y * l.s });
        if (j < 0) continue;
        const e = M.sets.get(l.track)?.[j];
        if (!e || e.length !== 1 || e[0].comp !== comp) continue; // same component only
        const rs = ranksAt(M, l.track, j, bits);
        if (rs.length === 1) seq.push({ tr: l.track, j, r: rs[0] });
      }
      if (seq.length < 3) return;
      let up = 0;
      let down = 0;
      for (let k = 1; k < seq.length; k++) {
        if (seq[k].r > seq[k - 1].r) up++;
        else if (seq[k].r < seq[k - 1].r) down++;
      }
      if (up && down) {
        for (const q of seq) marks.push([q.tr, q.j]);
        if (DEBUG_ORDER.on && DEBUG_ORDER.printed++ < 40)
          DEBUG_ORDER.log(`   conflict t${tr}#${i} at (${s.p.x.toFixed(0)},${s.p.y.toFixed(0)}): ${s.lanes.map((l) => `t${l.track}@${l.s.toFixed(1)}`).join(' ')} → ${seq.map((q) => `t${q.tr}:${q.r}`).join(' ')}`);
      }
    });
  }
  for (const [tr, j] of marks) {
    let m = M.masked.get(tr);
    if (!m) {
      m = new Set();
      M.masked.set(tr, m);
    }
    m.add(j);
  }
  return marks.length;
}
