// COLLAR module of the paper doll (tmp/plans/assembly-3d-doll/04-COLLAR.md). Pure geometry helpers;
// doll.ts wires them into the solve.
//
//  K1 the neck PATH: on a garment with a front opening the neckline is an open path
//     CF-left → back neck (CB) → CF-right, not a closed loop. It is walked along the body's free
//     boundary from the centre back both ways until the boundary turns down for a sustained run (the
//     front edge); a notch on the neck edge just before that corner is the CF line (the part between
//     is the front's extension). No such corner → a closed loop cut at the centre front (pullover,
//     or a front already drawn closed).
//  K2 a run (the stand's neck edge, a fall's neck edge, the stand's top) is mapped onto its base by
//     ANCHORED arc length: CB ↔ CB, symmetric notch pairs ↔ SNP / CF; what lies beyond the CF marks
//     (the button extensions) is not sewn.
//
// Universal: no piece names. Geometry (positions after phase 1, pattern notches, chart u/v) only.

import { loopPath, type RawLoop } from './loops';
import type { Path } from './solve';
import type { Vec3 } from './types';

export type CollarCtx = {
  pos: Float64Array;
  uv: Float64Array;
  /** Chart coordinates (u around, v up) of every vertex. */
  cuv: Float64Array;
  panelOf: Int32Array;
  ringOf: Int32Array;
  nbOf: (panel: number) => number;
  /** Ring vertex sits on a pattern notch. */
  isNotch: (v: number) => boolean;
};

export const p3 = (c: CollarCtx, v: number): Vec3 => [
  c.pos[3 * v],
  c.pos[3 * v + 1],
  c.pos[3 * v + 2],
];

/** Rest-length path (pattern mm) of an ordered vertex run. */
export const restPath = (c: CollarCtx, verts: number[]): Path =>
  loopPath(verts, c.uv, c.panelOf, 0, false, { ringOf: c.ringOf, nbOf: c.nbOf });

/** Arc position (rest mm) of index k of a path. */
const arcAt = (P: Path, k: number) => P.s[Math.max(0, Math.min(P.s.length - 1, k))];

export type NeckPath = {
  /** Walk order: CF-left (doll's left, +x) → CB → CF-right; closed: CF → left → CB → right → CF. */
  verts: number[];
  path: Path;
  closed: boolean;
  /** Rest-arc positions on `path`, mm. */
  cb: number;
  snp: [number, number] | null;
  /** Front extension cut off at each end (front-edge corner → CF notch), mm. */
  ext: [number, number];
  /** How the CF ends were found, in words. */
  how: string;
};

/** Index (in `verts`) of the centre back: on the back half of the run above the armholes (z
 *  below the run's own mid depth — a neck pulled forward still has a back), nearest x = 0,
 *  highest. */
function cbIndex(c: CollarCtx, verts: number[], vArm: number): number {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const v of verts) {
    const p = p3(c, v);
    if (p[1] <= vArm) continue;
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
  }
  const zMid = (z0 + z1) / 2;
  const back = (p: Vec3) => p[1] > vArm && p[2] < zMid;
  let minAx = Infinity;
  for (const v of verts) {
    const p = p3(c, v);
    if (back(p)) minAx = Math.min(minAx, Math.abs(p[0]));
  }
  let best = -1;
  let by = -Infinity;
  verts.forEach((v, k) => {
    const p = p3(c, v);
    if (back(p) && Math.abs(p[0]) <= minAx + 6 && p[1] > by) [best, by] = [k, p[1]];
  });
  return best;
}

/** A closed loop cut at the centre front (front, above the armholes, x ≈ 0, highest), left first. */
function cutAtFront(c: CollarCtx, L: number[], vArm: number): number[] | null {
  const front = (v: number) => {
    const p = p3(c, v);
    return p[2] > 5 && p[1] >= vArm;
  };
  let bx = Infinity;
  for (const v of L) if (front(v)) bx = Math.min(bx, Math.abs(p3(c, v)[0]));
  let best = -1;
  let by = -Infinity;
  L.forEach((v, k) => {
    const p = p3(c, v);
    if (front(v) && Math.abs(p[0]) <= bx + 6 && p[1] > by) [best, by] = [k, p[1]];
  });
  if (best < 0) return null;
  const out = [...L.slice(best), ...L.slice(0, best), L[best]];
  const k = Math.min(out.length - 1, 6);
  return p3(c, out[k])[0] >= p3(c, out[0])[0]
    ? out
    : [out[0], ...out.slice(1, -1).reverse(), out[0]];
}

/** CF notches (open path), CB and SNP of a neck path. */
function finishPath(
  c: CollarCtx,
  verts0: number[],
  isClosed: boolean,
  cbV: number,
  how0: string,
  noCut = false,
): NeckPath {
  let verts = verts0;
  let how = how0;
  let closed = isClosed;
  // CF notches: a notch on the neck run within 50 mm of an open end is the CF line; the stretch
  // from the corner to it is the front's extension (the overlap), not part of the neckline. On a
  // closed loop (fronts drawn edge to edge) the notches either side of the centre front do the same:
  // the path opens between them.
  const ext: [number, number] = [0, 0];
  {
    const P0 = restPath(c, verts);
    let k0 = -1;
    for (let k = 1; k < verts.length && P0.s[k] <= 50; k++)
      if (c.isNotch(verts[k]) && P0.s[k] > 5) {
        k0 = k;
        break;
      }
    let k1 = -1;
    for (let k = verts.length - 2; k > 0 && P0.len - P0.s[k] <= 50; k--)
      if (c.isNotch(verts[k]) && P0.len - P0.s[k] > 5) {
        k1 = k;
        break;
      }
    if (!closed) {
      if (k0 < 0) k0 = 0;
      if (k1 < 0) k1 = verts.length - 1;
    }
    if (!noCut && k0 >= 0 && k1 >= 0 && k1 - k0 > 4 && (k0 > 0 || k1 < verts.length - 1)) {
      ext[0] = P0.s[k0];
      ext[1] = P0.len - P0.s[k1];
      verts = verts.slice(k0, k1 + 1);
      how += closed
        ? `; opened at the CF notches either side of the closure (${ext[0].toFixed(0)} / ${ext[1].toFixed(0)} mm of front extension left out)`
        : `; CF at the neck-edge notches (front extension ${ext[0].toFixed(0)} / ${ext[1].toFixed(0)} mm left out)`;
      closed = false;
    }
  }
  const path = restPath(c, verts);
  let kcb = verts.indexOf(cbV);
  if (kcb < 0) kcb = Math.floor(verts.length / 2);
  // SNP: the widest point of each half (max |x|), or a seam junction (a change of panel) within
  // 30 mm of it.
  const snpOf = (k0: number, k1: number, sgn: 1 | -1) => {
    let best = -1;
    let bx = -Infinity;
    for (let k = k0; k <= k1; k++) {
      const x = sgn * p3(c, verts[k])[0];
      if (x > bx) [best, bx] = [k, x];
    }
    if (best < 0) return NaN;
    let bj = -1;
    let bd = 30;
    for (let k = Math.max(k0 + 1, 1); k <= k1; k++)
      if (c.panelOf[verts[k]] !== c.panelOf[verts[k - 1]]) {
        const d = Math.abs(arcAt(path, k) - arcAt(path, best));
        if (d < bd) [bj, bd] = [k, d];
      }
    return arcAt(path, bj >= 0 ? bj : best);
  };
  // Plausibility: the CB lies about half way round, each SNP between the CB and its end.
  const L = path.len;
  let cb = arcAt(path, kcb);
  if (cb < 0.3 * L || cb > 0.7 * L) {
    how += `; the centre back found at ${((100 * cb) / Math.max(1, L)).toFixed(0)} % of the path — taken half way instead`;
    cb = L / 2;
  }
  const sL = snpOf(0, kcb, 1);
  const sR = snpOf(kcb, verts.length - 1, -1);
  const snp: [number, number] | null =
    Number.isFinite(sL) &&
    Number.isFinite(sR) &&
    sL > 0.08 * L &&
    sL < cb - 10 &&
    sR > cb + 10 &&
    sR < 0.92 * L
      ? [sL, sR]
      : null;
  return { verts, path, closed, cb, snp, ext, how };
}

/**
 * L4: the neck path given by a CONFIRMED seam — the body side of the seam a person said the stand /
 * collar is sewn to, walked as stored (`verts`, any direction). Left end first, CB on it; cut at the
 * CF notches near its ends (`cut`) or whole.
 */
export function neckFromRun(
  c: CollarCtx,
  verts0: number[],
  vArm: number,
  cut: boolean,
  how: string,
): NeckPath {
  let verts = verts0;
  // Left end first: the first third of the walk runs round the doll's left (+x) — the ends
  // themselves sit near x = 0 at the centre front and cannot tell.
  const n3 = Math.max(1, Math.floor(verts.length / 3));
  const mx = (vs: number[]) => vs.reduce((t, v) => t + p3(c, v)[0], 0) / vs.length;
  if (mx(verts.slice(0, n3)) < mx(verts.slice(verts.length - n3))) verts = [...verts].reverse();
  const k = cbIndex(c, verts, vArm);
  return finishPath(c, verts, false, k >= 0 ? verts[k] : -1, how, !cut);
}

/** The neck as a closed loop cut at the centre front (pullovers; the fallback of K1). */
export function closedNeckPath(
  c: CollarCtx,
  loop: number[],
  vArm: number,
  how: string,
): NeckPath | null {
  const verts = cutAtFront(c, loop, vArm);
  if (!verts) return null;
  const k = cbIndex(c, verts, vArm);
  return finishPath(c, verts, true, k >= 0 ? verts[k] : -1, how);
}

/**
 * K1. The neck path on the body's free loops after phase 1. `vArm` is the armhole level (the
 * neckline never goes below it).
 */
export function findNeckPath(
  c: CollarCtx,
  loops: RawLoop[],
  vArm: number,
): { neck: NeckPath | null; note: string; debug: string } {
  const big = loops.filter((l) => l.len > 150);
  let debug = '';
  // CB: on the back (z < 0), above the armholes, nearest x = 0; the highest of those.
  let cbLoop: RawLoop | null = null;
  let cbIdx = -1;
  {
    const all = big.flatMap((l) => l.verts);
    const k = cbIndex(c, all, vArm);
    if (k < 0)
      return { neck: null, note: 'no free boundary at the back above the armholes', debug };
    const v = all[k];
    for (const l of big) {
      const i = l.verts.indexOf(v);
      if (i >= 0) {
        cbLoop = l;
        cbIdx = i;
        break;
      }
    }
  }
  if (!cbLoop) return { neck: null, note: 'no centre back found', debug };
  const L = (cbLoop as RawLoop).verts;
  const closed = (cbLoop as RawLoop).closed;
  const n = L.length;
  // Walk in the flat chart: rest arc (pattern mm) and chart height, summed over steps along one
  // panel's contour only (a weld across a seam end has no length). A CF edge runs straight down
  // there however phase 1 bent it.
  const walk = (dir: 1 | -1) => {
    const idx = [cbIdx];
    for (let k = 1; k < n; k++) {
      let i = cbIdx + dir * k;
      if (closed) i = ((i % n) + n) % n;
      else if (i < 0 || i >= n) break;
      idx.push(i);
    }
    const A = [0];
    const Y = [0];
    for (let j = 1; j < idx.length; j++) {
      const a = L[idx[j - 1]];
      const b = L[idx[j]];
      const ra = c.ringOf[a];
      const rb = c.ringOf[b];
      const nb = c.panelOf[a] === c.panelOf[b] ? c.nbOf(c.panelOf[a]) : 0;
      const step = nb > 0 && ra >= 0 && rb >= 0 && ((ra + 1) % nb === rb || (rb + 1) % nb === ra);
      A.push(
        A[j - 1] +
          (step ? Math.hypot(c.uv[2 * b] - c.uv[2 * a], c.uv[2 * b + 1] - c.uv[2 * a + 1]) : 0),
      );
      Y.push(Y[j - 1] + (step ? c.cuv[2 * b + 1] - c.cuv[2 * a + 1] : 0));
    }
    return { idx, A, Y };
  };
  /** First CF-top corner along a walk: the boundary turns from the neckline straight down. */
  const corner = (w: ReturnType<typeof walk>) => {
    const ahead = (j: number, d: number) => {
      let k = j;
      while (k < w.idx.length - 1 && w.A[k] - w.A[j] < d) k++;
      return k;
    };
    const behind = (j: number, d: number) => {
      let k = j;
      while (k > 0 && w.A[j] - w.A[k] < d) k--;
      return k;
    };
    const drop = (j: number, k: number) =>
      (w.Y[j] - w.Y[k]) / Math.max(1, Math.abs(w.A[k] - w.A[j]));
    const score = (j: number) => {
      const p = p3(c, L[w.idx[j]]);
      if (p[2] <= 0 || p[1] < vArm) return null;
      const j2 = ahead(j, 60);
      if (w.A[j2] - w.A[j] < 40) return null;
      const sOut = drop(j, j2);
      const j3 = ahead(j, 200);
      const sSus = drop(j, j3);
      const j0 = behind(j, 25);
      const sIn = j0 < j ? drop(j0, j) : 0;
      if (sOut < 0.9 || sSus < 0.88 || sIn > 0.6) return null;
      return sOut - sIn;
    };
    for (let j = 1; j < w.idx.length; j++) {
      const s0 = score(j);
      if (s0 === null) continue;
      // The sharpest point within 30 mm of the first hit.
      let best = j;
      let bs = s0;
      for (let k = j + 1; k < w.idx.length && w.A[k] - w.A[j] < 30; k++) {
        const s = score(k);
        if (s !== null && s > bs) [best, bs] = [k, s];
      }
      return best;
    }
    return -1;
  };
  const fw = walk(1);
  const bw = walk(-1);
  const jf = corner(fw);
  const jb = corner(bw);
  {
    const q = p3(c, L[cbIdx]);
    const prof = (w: ReturnType<typeof walk>) => {
      const out: string[] = [];
      let next = 0;
      for (let j = 0; j < w.idx.length && w.A[j] < 900; j++)
        if (w.A[j] >= next) {
          const p = p3(c, L[w.idx[j]]);
          out.push(`${w.A[j].toFixed(0)}:${p.map((x) => x.toFixed(0)).join(',')}`);
          next += 40;
        }
      return out.join(' ');
    };
    debug = `loop ${(cbLoop as RawLoop).len.toFixed(0)} mm ${closed ? 'closed' : 'open'} n ${n} · CB ${q.map((x) => x.toFixed(0)).join(',')} · corners fwd ${jf >= 0 ? fw.A[jf].toFixed(0) : '-'} bwd ${jb >= 0 ? bw.A[jb].toFixed(0) : '-'} · fwd ${prof(fw)} · bwd ${prof(bw)}`;
  }
  if (jf > 0 && jb > 0 && (!closed || jf + jb < n - 1)) {
    let verts = [...bw.idx.slice(0, jb + 1).reverse(), ...fw.idx.slice(1, jf + 1)].map((i) => L[i]);
    if (p3(c, verts[0])[0] < p3(c, verts[verts.length - 1])[0]) verts = verts.reverse();
    const how = 'open path — the boundary turns down the front edge at both ends';
    return { neck: finishPath(c, verts, false, L[cbIdx], how), note: how, debug };
  }
  if (closed) {
    const how =
      jf > 0 || jb > 0
        ? 'closed loop cut at the centre front — a front edge turns down on one side only'
        : 'closed loop cut at the centre front — no front opening on the boundary';
    const neck = closedNeckPath(c, L, vArm, how);
    return {
      neck,
      note: neck ? how : 'closed loop without a front point above the armholes',
      debug,
    };
  }
  return { neck: null, note: 'open boundary run without front-edge corners', debug };
}

/** The longest smooth stretch of a run (split where the chart direction turns more than 35°). */
export function smoothest(c: CollarCtx, verts: number[]): number[] {
  if (verts.length < 4) return verts;
  const P = restPath(c, verts);
  const dirAt = (k: number, back: boolean) => {
    // Direction over ~8 mm of chart before (back) / after k.
    let j = k;
    if (back) while (j > 0 && P.s[k] - P.s[j] < 8) j--;
    else while (j < verts.length - 1 && P.s[j] - P.s[k] < 8) j++;
    const a = verts[back ? j : k];
    const b = verts[back ? k : j];
    return Math.atan2(c.cuv[2 * b + 1] - c.cuv[2 * a + 1], c.cuv[2 * b] - c.cuv[2 * a]);
  };
  const cuts = [0];
  for (let k = 1; k < verts.length - 1; k++) {
    if (P.s[k] - P.s[cuts[cuts.length - 1]] < 6) continue;
    let d = Math.abs(dirAt(k, false) - dirAt(k, true));
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (35 * Math.PI) / 180) cuts.push(k);
  }
  cuts.push(verts.length - 1);
  let best: [number, number] = [0, verts.length - 1];
  let bl = -1;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const l = P.s[cuts[i + 1]] - P.s[cuts[i]];
    if (l > bl) [best, bl] = [[cuts[i], cuts[i + 1]], l];
  }
  return verts.slice(best[0], best[1] + 1);
}

export type RunMarks = {
  verts: number[];
  path: Path;
  /** Rest-arc positions of notches along the run. */
  notches: number[];
  cb: number;
  cbByNotch: boolean;
};

/** Notches and the centre (CB) of a run (CB = a notch near the middle, else the middle). */
export function runMarks(c: CollarCtx, verts: number[]): RunMarks {
  const path = restPath(c, verts);
  const notches: number[] = [];
  verts.forEach((v, k) => {
    if (c.isNotch(v) && (!notches.length || path.s[k] - notches[notches.length - 1] > 2))
      notches.push(path.s[k]);
  });
  const mid = path.len / 2;
  let cb = mid;
  let cbByNotch = false;
  let bd = Math.max(6, 0.04 * path.len);
  for (const s of notches)
    if (Math.abs(s - mid) < bd) [cb, bd, cbByNotch] = [s, Math.abs(s - mid), true];
  return { verts, path, notches, cb, cbByNotch };
}

/**
 * The symmetric notch pair (about the run's CB) whose span best matches `target` mm, within
 * `[lo, hi]` × target. `exclude`: a pair already taken. Returns null when none qualifies.
 */
export function symmetricPair(
  m: RunMarks,
  target: number,
  lo: number,
  hi: number,
  exclude?: [number, number] | null,
): [number, number] | null {
  const tol = Math.max(4, 0.015 * m.path.len);
  let best: [number, number] | null = null;
  let bd = Infinity;
  for (const a of m.notches)
    for (const b of m.notches) {
      if (a >= m.cb - 5 || b <= m.cb + 5) continue;
      if (Math.abs((a + b) / 2 - m.cb) > tol) continue;
      if (exclude && Math.abs(a - exclude[0]) < 2 && Math.abs(b - exclude[1]) < 2) continue;
      const r = (b - a) / target;
      if (r < lo || r > hi) continue;
      const d = Math.abs(Math.log(r));
      if (d < bd) [best, bd] = [[a, b], d];
    }
  return best;
}

/** Piecewise-linear map through anchors (x strictly increasing); linear with slope 1 beyond. */
export function makeMap(anchors: [number, number][]) {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  return (x: number) => {
    const n = xs.length;
    if (x <= xs[0]) return ys[0] + (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]);
    let i = 0;
    while (i < n - 2 && xs[i + 1] < x) i++;
    const w = (x - xs[i]) / Math.max(1e-9, xs[i + 1] - xs[i]);
    return ys[i] + (ys[i + 1] - ys[i]) * w;
  };
}

/** A 3D curve (a base for a ring unit): position by rest arc, extrapolated along the end tangents. */
export function baseCurve(c: CollarCtx, P: Path) {
  const pts = [...P.v].map((v) => p3(c, v));
  const at = (t: number): Vec3 => {
    const s = P.s;
    const n = pts.length;
    const tan = (i0: number, i1: number) => {
      const a = pts[i0];
      const b = pts[i1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l] as Vec3;
    };
    if (t <= 0) {
      let k = 1;
      while (k < n - 1 && s[k] < 15) k++;
      const d = tan(k, 0);
      return [pts[0][0] - d[0] * t, pts[0][1] - d[1] * t, pts[0][2] - d[2] * t];
    }
    if (t >= P.len) {
      let k = n - 2;
      while (k > 0 && P.len - s[k] < 15) k--;
      const d = tan(k, n - 1);
      const e = t - P.len;
      return [pts[n - 1][0] + d[0] * e, pts[n - 1][1] + d[1] * e, pts[n - 1][2] + d[2] * e];
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= t) lo = m;
      else hi = m;
    }
    const w = s[hi] > s[lo] ? (t - s[lo]) / (s[hi] - s[lo]) : 0;
    return [
      pts[lo][0] + (pts[hi][0] - pts[lo][0]) * w,
      pts[lo][1] + (pts[hi][1] - pts[lo][1]) * w,
      pts[lo][2] + (pts[hi][2] - pts[lo][2]) * w,
    ];
  };
  return { at, len: P.len, pts };
}
