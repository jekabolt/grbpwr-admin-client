// The constraint relaxation: Gauss–Seidel position projection (PBD without dynamics — no gravity,
// no velocity, no friction). Paper keeps its lengths (stretch, stiffness 1), resists folding a
// little (bending, opposite-vertex distances), seams pull matched points together (ramped so pieces
// glide before they lock), proxies push cloth out of the body and pull it gently onto it.
// Deterministic: fixed order, no randomness, typed arrays.

export type Path = {
  /** Global vertex ids in walk order. */
  v: Int32Array;
  /** Cumulative rest length at each vertex, mm. */
  s: Float64Array;
  len: number;
};

/** Point-on-polyline rows of one seam: vertex `v` → (1-w)·b0 + w·b1 (+ optional gap). */
export type SeamRows = { v: number[]; b0: number[]; b1: number[]; w: number[] };

export type Proxy = {
  /** Push (x,y,z) out of the primitive; returns true when moved (writes into out). */
  push(p: Float64Array, i: number): void;
  /** Gentle pull onto the surface (shrink-wrap), strength k in 0..1. */
  pull(p: Float64Array, i: number, k: number): void;
};

export type SolverSeam = {
  rows: SeamRows;
  /** Target stiffness (1 graph seam, 0.6 proposal), ramped by the schedule. */
  k: number;
  active: boolean;
  gap: number;
};

export type SolverState = {
  pos: Float64Array;
  /** Distance constraints: stretch first, then bending. */
  di: Int32Array;
  dj: Int32Array;
  rest: Float64Array;
  dk: Float64Array;
  nStretch: number;
  /** Over-relaxation of the stretch projection (1 = plain Gauss–Seidel). */
  omega: number;
  /** Long-range unilateral limits (never longer than flat): carry motion across a panel fast. */
  li: Int32Array;
  lj: Int32Array;
  lrest: Float64Array;
  seams: SolverSeam[];
  /** Proxy per vertex (index into proxies) or -1. */
  proxyOf: Int32Array;
  proxies: Proxy[];
  /** Vertices that take part in this phase (others frozen). */
  moving: Uint8Array;
  pullK: number;
  /** Weak pull to the initial pose (sleeves, collars: they would swing freely on a ring seam). */
  anchor?: Float64Array;
  anchorK?: Float32Array;
  /**
   * One-sided contacts (a fall over its stand): vertex `i` stays at least `gap` mm outside vertex
   * `j`, measured along the horizontal direction from the vertical axis through (ax, az) to `j`.
   */
  contacts?: { i: Int32Array; j: Int32Array; gap: number; ax: number; az: number }[];
};

/** Rows of a seam: every vertex of A onto B's polyline and every vertex of B onto A's. */
export function seamRows(
  A: Path,
  B: Path,
  same: boolean,
  /** Range of B (0..1) that A maps onto (partial seams), or of A that B maps onto. */
  aRange: [number, number] = [0, 1],
  bRange: [number, number] = [0, 1],
): SeamRows {
  const rows: SeamRows = { v: [], b0: [], b1: [], w: [] };
  const locate = (P: Path, t: number) => {
    const s = Math.max(0, Math.min(1, t)) * P.len;
    let lo = 0;
    let hi = P.v.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P.s[m] <= s) lo = m;
      else hi = m;
    }
    const d = P.s[hi] - P.s[lo];
    return { i0: P.v[lo], i1: P.v[hi], w: d > 1e-9 ? (s - P.s[lo]) / d : 0 };
  };
  // A side vertex at fraction ta (inside aRange) ↔ B fraction tb (inside bRange).
  const aToB = (ta: number) => {
    const x = (ta - aRange[0]) / (aRange[1] - aRange[0]);
    const y = same ? x : 1 - x;
    return bRange[0] + y * (bRange[1] - bRange[0]);
  };
  const bToA = (tb: number) => {
    const y = (tb - bRange[0]) / (bRange[1] - bRange[0]);
    const x = same ? y : 1 - y;
    return aRange[0] + x * (aRange[1] - aRange[0]);
  };
  const eps = 1e-6;
  for (let k = 0; k < A.v.length; k++) {
    const ta = A.len > 0 ? A.s[k] / A.len : 0;
    if (ta < aRange[0] - eps || ta > aRange[1] + eps) continue;
    const t = locate(B, aToB(ta));
    rows.v.push(A.v[k]);
    rows.b0.push(t.i0);
    rows.b1.push(t.i1);
    rows.w.push(t.w);
  }
  for (let k = 0; k < B.v.length; k++) {
    const tb = B.len > 0 ? B.s[k] / B.len : 0;
    if (tb < bRange[0] - eps || tb > bRange[1] + eps) continue;
    const t = locate(A, bToA(tb));
    rows.v.push(B.v[k]);
    rows.b0.push(t.i0);
    rows.b1.push(t.i1);
    rows.w.push(t.w);
  }
  return rows;
}

/**
 * Rows of a seam mapped by ANCHORED arc length (collar onto its base): `anchors` are pairs
 * (arc on A, arc on B) in mm, strictly increasing in both; between anchors the map is linear. Only
 * the stretch of A between the first and last anchor is sewn (beyond it: extensions, left free).
 */
export function anchoredRows(A: Path, B: Path, anchors: [number, number][]): SeamRows {
  const rows: SeamRows = { v: [], b0: [], b1: [], w: [] };
  const locate = (P: Path, s0: number) => {
    const s = Math.max(0, Math.min(P.len, s0));
    let lo = 0;
    let hi = P.v.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P.s[m] <= s) lo = m;
      else hi = m;
    }
    const d = P.s[hi] - P.s[lo];
    return { i0: P.v[lo], i1: P.v[hi], w: d > 1e-9 ? (s - P.s[lo]) / d : 0 };
  };
  const map = (x: number, from: 0 | 1) => {
    const to = 1 - from;
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1][from] < x) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    const w = (x - a[from]) / Math.max(1e-9, b[from] - a[from]);
    return a[to] + (b[to] - a[to]) * w;
  };
  const eps = 1e-6;
  const [a0, b0] = anchors[0];
  const [a1, b1] = anchors[anchors.length - 1];
  for (let k = 0; k < A.v.length; k++) {
    if (A.s[k] < a0 - eps || A.s[k] > a1 + eps) continue;
    const t = locate(B, map(A.s[k], 0));
    rows.v.push(A.v[k]);
    rows.b0.push(t.i0);
    rows.b1.push(t.i1);
    rows.w.push(t.w);
  }
  for (let k = 0; k < B.v.length; k++) {
    if (B.s[k] < b0 - eps || B.s[k] > b1 + eps) continue;
    const t = locate(A, map(B.s[k], 1));
    rows.v.push(B.v[k]);
    rows.b0.push(t.i0);
    rows.b1.push(t.i1);
    rows.w.push(t.w);
  }
  return rows;
}

/** Gap of each row after solving, mm. */
export function rowGaps(pos: Float64Array, r: SeamRows): number[] {
  const out: number[] = [];
  for (let q = 0; q < r.v.length; q++) {
    const i = r.v[q] * 3;
    const a = r.b0[q] * 3;
    const b = r.b1[q] * 3;
    const w = r.w[q];
    const x = pos[a] + (pos[b] - pos[a]) * w - pos[i];
    const y = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * w - pos[i + 1];
    const z = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * w - pos[i + 2];
    out.push(Math.hypot(x, y, z));
  }
  return out;
}

/** One pass. `ramp` (0..1) scales seam stiffness. */
export function pass(S: SolverState, ramp: number): void {
  const p = S.pos;
  const mv = S.moving;
  // Distances (stretch + bending).
  const n = S.di.length;
  for (let c = 0; c < n; c++) {
    const i = S.di[c];
    const j = S.dj[c];
    const mi = mv[i];
    const mj = mv[j];
    if (!mi && !mj) continue;
    const ia = i * 3;
    const ib = j * 3;
    const dx = p[ib] - p[ia];
    const dy = p[ib + 1] - p[ia + 1];
    const dz = p[ib + 2] - p[ia + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    const wsum = mi + mj;
    const f = (((d - S.rest[c]) / d) * S.dk[c] * (c < S.nStretch ? S.omega : 1)) / wsum;
    if (mi) {
      p[ia] += dx * f;
      p[ia + 1] += dy * f;
      p[ia + 2] += dz * f;
    }
    if (mj) {
      p[ib] -= dx * f;
      p[ib + 1] -= dy * f;
      p[ib + 2] -= dz * f;
    }
  }
  // Long-range limits.
  for (let c = 0; c < S.li.length; c++) {
    const i = S.li[c];
    const j = S.lj[c];
    const mi = mv[i];
    const mj = mv[j];
    if (!mi && !mj) continue;
    const ia = i * 3;
    const ib = j * 3;
    const dx = p[ib] - p[ia];
    const dy = p[ib + 1] - p[ia + 1];
    const dz = p[ib + 2] - p[ia + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= S.lrest[c]) continue;
    const f = (((d - S.lrest[c]) / d) * 0.6) / (mi + mj);
    if (mi) {
      p[ia] += dx * f;
      p[ia + 1] += dy * f;
      p[ia + 2] += dz * f;
    }
    if (mj) {
      p[ib] -= dx * f;
      p[ib + 1] -= dy * f;
      p[ib + 2] -= dz * f;
    }
  }
  // Seams.
  for (const s of S.seams) {
    if (!s.active) continue;
    const k = s.k * ramp;
    if (k <= 0) continue;
    const r = s.rows;
    for (let q = 0; q < r.v.length; q++) {
      const i = r.v[q];
      const a = r.b0[q];
      const b = r.b1[q];
      const w = r.w[q];
      const wi = mv[i];
      const wa = mv[a] * (1 - w);
      const wb = mv[b] * w;
      const den = wi + wa * (1 - w) + wb * w;
      if (den <= 0) continue;
      const i3 = i * 3;
      const a3 = a * 3;
      const b3 = b * 3;
      let cx = p[i3] - (p[a3] + (p[b3] - p[a3]) * w);
      let cy = p[i3 + 1] - (p[a3 + 1] + (p[b3 + 1] - p[a3 + 1]) * w);
      let cz = p[i3 + 2] - (p[a3 + 2] + (p[b3 + 2] - p[a3 + 2]) * w);
      if (s.gap > 0) {
        const d = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (d <= s.gap) continue;
        const g = (d - s.gap) / d;
        cx *= g;
        cy *= g;
        cz *= g;
      }
      const f = k / den;
      if (wi) {
        p[i3] -= cx * f;
        p[i3 + 1] -= cy * f;
        p[i3 + 2] -= cz * f;
      }
      if (mv[a]) {
        const g = f * (1 - w);
        p[a3] += cx * g;
        p[a3 + 1] += cy * g;
        p[a3 + 2] += cz * g;
      }
      if (mv[b]) {
        const g = f * w;
        p[b3] += cx * g;
        p[b3 + 1] += cy * g;
        p[b3 + 2] += cz * g;
      }
    }
  }
  // Anchors.
  if (S.anchor && S.anchorK) {
    const A = S.anchor;
    const K = S.anchorK;
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (!k || !mv[i]) continue;
      p[3 * i] += (A[3 * i] - p[3 * i]) * k;
      p[3 * i + 1] += (A[3 * i + 1] - p[3 * i + 1]) * k;
      p[3 * i + 2] += (A[3 * i + 2] - p[3 * i + 2]) * k;
    }
  }
  // Proxies.
  const N = S.proxyOf.length;
  for (let i = 0; i < N; i++) {
    if (!mv[i]) continue;
    const x = S.proxyOf[i];
    if (x < 0) continue;
    const pr = S.proxies[x];
    if (S.pullK > 0) pr.pull(p, i, S.pullK);
    if (!(globalThis as { __DOLL_NOPROXY?: boolean }).__DOLL_NOPROXY) pr.push(p, i);
  }
  // One-sided contacts (last: nothing after them in the pass pushes back through).
  for (const C of S.contacts ?? []) {
    for (let q = 0; q < C.i.length; q++) {
      const i = C.i[q];
      const j = C.j[q];
      const wi = mv[i];
      const wj = mv[j];
      if (!wi && !wj) continue;
      const i3 = i * 3;
      const j3 = j * 3;
      let nx = p[j3] - C.ax;
      let nz = p[j3 + 2] - C.az;
      const nl = Math.sqrt(nx * nx + nz * nz);
      if (nl < 1e-6) continue;
      nx /= nl;
      nz /= nl;
      const d = (p[i3] - p[j3]) * nx + (p[i3 + 2] - p[j3 + 2]) * nz;
      if (d >= C.gap) continue;
      const corr = (C.gap - d) / (wi + wj);
      if (wi) {
        p[i3] += nx * corr * wi;
        p[i3 + 2] += nz * corr * wi;
      }
      if (wj) {
        p[j3] -= nx * corr * wj;
        p[j3 + 2] -= nz * corr * wj;
      }
    }
  }
}

/** Strain of every stretch constraint, |l/l0 − 1|. */
export function strains(S: SolverState): Float64Array {
  const out = new Float64Array(S.nStretch);
  const p = S.pos;
  for (let c = 0; c < S.nStretch; c++) {
    const a = S.di[c] * 3;
    const b = S.dj[c] * 3;
    const d = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    out[c] = S.rest[c] > 0 ? Math.abs(d / S.rest[c] - 1) : 0;
  }
  return out;
}
