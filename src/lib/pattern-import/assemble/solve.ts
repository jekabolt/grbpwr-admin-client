// assemble (F2) — global pose solve. Every accepted pair measures t_to − t_from; the poses are the
// weighted least-squares solution over ALL pairs (not a spanning tree), so every cycle in the pair
// graph is closed at once and its misfit shows up as residuals. A pair whose residual exceeds
// PATIMPORT.registrationMaxResidualMm while its pages have other evidence is rejected and the solve
// repeated (one outlier at a time, worst first) — a wrong seam can neither pass silently nor drag
// its neighbours along.

import type { Affine, PagePose, PairTransform } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { pageKey, type Rot } from './regpage';

export type SolveResult = {
  poses: PagePose[];
  /** Pairs used in the final solve, with their residuals (same order as `kept`). */
  kept: PairTransform[];
  residuals: number[];
  /** Pairs thrown out as inconsistent, with the residual that condemned them. */
  rejected: { pair: PairTransform; residualMm: number }[];
  warnings: string[];
};

export function rotAffine(rot: Rot, tx: number, ty: number): Affine {
  switch (rot) {
    case 90:
      return { a: 0, b: 1, c: -1, d: 0, e: tx, f: ty };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1, e: tx, f: ty };
    case 270:
      return { a: 0, b: -1, c: 1, d: 0, e: tx, f: ty };
    default:
      return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
  }
}

const weightOf = (p: PairTransform) =>
  p.method === 'recurrence'
    ? 4 + Math.min(p.score, 50)
    : p.method === 'edge-stitch'
      ? 1 + Math.min(p.score, 50) / 10
      : 0.01; // grid-label / manual: a weak prior, never outvotes geometry

/** Dense Gaussian elimination with partial pivoting (n ≤ a few hundred). */
function solveLinear(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / (A[r][r] || 1e-12);
  }
  return x;
}

type Node = { key: string; file: string; page: number; rot: Rot };

function components(nodes: Node[], pairs: PairTransform[]): number[] {
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const p of pairs) {
    const a = idx.get(pageKey(p.from.file, p.from.page));
    const b = idx.get(pageKey(p.to.file, p.to.page));
    if (a !== undefined && b !== undefined) parent[find(a)] = find(b);
  }
  return nodes.map((_, i) => find(i));
}

/** One weighted least-squares pass; the first node of each component is pinned at its seed. */
function lsq(nodes: Node[], pairs: PairTransform[], seeds: Map<string, { x: number; y: number }>) {
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const n = nodes.length;
  const comp = components(nodes, pairs);
  const pinned = new Set<number>();
  const seenComp = new Set<number>();
  for (let i = 0; i < n; i++)
    if (!seenComp.has(comp[i])) {
      seenComp.add(comp[i]);
      pinned.add(i);
    }
  const out = { x: new Float64Array(n), y: new Float64Array(n) };
  for (const axis of ['x', 'y'] as const) {
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const b = new Float64Array(n);
    for (const i of pinned) {
      A[i][i] += 1e6;
      b[i] += 1e6 * (seeds.get(nodes[i].key)?.[axis] ?? 0);
    }
    for (const p of pairs) {
      const i = idx.get(pageKey(p.from.file, p.from.page));
      const j = idx.get(pageKey(p.to.file, p.to.page));
      if (i === undefined || j === undefined) continue;
      const w = weightOf(p);
      const d = axis === 'x' ? p.dxMm : p.dyMm;
      // w (t_j − t_i − d)²
      A[i][i] += w;
      A[j][j] += w;
      A[i][j] -= w;
      A[j][i] -= w;
      b[i] -= w * d;
      b[j] += w * d;
    }
    const sol = solveLinear(A, b);
    out[axis].set(sol);
  }
  return out;
}

/**
 * Global poses from pair transforms (contract `solvePoses`). Rotations come from the pairs
 * (rotDeg of `to` relative to `from`; the first page of a component is 0°). `seeds` places each
 * connected component (default: all at the origin — then the caller arranges components).
 */
export function solvePosesDetailed(
  pairs: PairTransform[],
  seeds: Map<string, { x: number; y: number }> = new Map(),
  extraNodes: { file: string; page: number }[] = [],
): SolveResult {
  const nodes: Node[] = [];
  const byKey = new Map<string, Node>();
  const add = (file: string, page: number) => {
    const key = pageKey(file, page);
    if (!byKey.has(key)) {
      const nd: Node = { key, file, page, rot: 0 };
      byKey.set(key, nd);
      nodes.push(nd);
    }
    return byKey.get(key) as Node;
  };
  for (const p of pairs) {
    add(p.from.file, p.from.page);
    add(p.to.file, p.to.page);
  }
  for (const e of extraNodes) add(e.file, e.page);
  // Rotations by BFS over the pairs.
  const assigned = new Set<string>();
  for (const root of nodes) {
    if (assigned.has(root.key)) continue;
    assigned.add(root.key);
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift() as Node;
      for (const p of pairs) {
        const f = pageKey(p.from.file, p.from.page);
        const t = pageKey(p.to.file, p.to.page);
        if (f === cur.key && !assigned.has(t)) {
          const nd = byKey.get(t) as Node;
          nd.rot = (((cur.rot + p.rotDeg) % 360) + 360) % 360 as Rot;
          assigned.add(t);
          queue.push(nd);
        } else if (t === cur.key && !assigned.has(f)) {
          const nd = byKey.get(f) as Node;
          nd.rot = (((cur.rot - p.rotDeg) % 360) + 360) % 360 as Rot;
          assigned.add(f);
          queue.push(nd);
        }
      }
    }
  }
  const warnings: string[] = [];
  const rejected: SolveResult['rejected'] = [];
  let kept = [...pairs];
  let sol = lsq(nodes, kept, seeds);
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const resid = (p: PairTransform) => {
    const i = idx.get(pageKey(p.from.file, p.from.page)) as number;
    const j = idx.get(pageKey(p.to.file, p.to.page)) as number;
    return Math.hypot(sol.x[j] - sol.x[i] - p.dxMm, sol.y[j] - sol.y[i] - p.dyMm);
  };
  const degree = (p: PairTransform, list: PairTransform[]) => {
    const f = pageKey(p.from.file, p.from.page);
    const t = pageKey(p.to.file, p.to.page);
    let df = 0;
    let dt = 0;
    for (const q of list) {
      const qf = pageKey(q.from.file, q.from.page);
      const qt = pageKey(q.to.file, q.to.page);
      if (q.method === 'grid-label' || q.method === 'manual') continue;
      if (qf === f || qt === f) df++;
      if (qf === t || qt === t) dt++;
    }
    return Math.min(df, dt);
  };
  for (let iter = 0; iter < pairs.length; iter++) {
    let worst = -1;
    let wr: number = PATIMPORT.registrationMaxResidualMm;
    kept.forEach((p, k) => {
      if (p.method === 'grid-label' || p.method === 'manual') return;
      const r = resid(p);
      // Only reject where both ends keep other geometric evidence (the pair is redundant).
      if (r > wr && degree(p, kept) >= 2) {
        wr = r;
        worst = k;
      }
    });
    if (worst < 0) break;
    const bad = kept[worst];
    rejected.push({ pair: bad, residualMm: wr });
    warnings.push(
      `pair ${bad.from.file}:${bad.from.page + 1}→${bad.to.file}:${bad.to.page + 1} (${bad.method}) ` +
        `rejected: loop-closure residual ${wr.toFixed(2)} mm > ${PATIMPORT.registrationMaxResidualMm}`,
    );
    kept = kept.filter((_, k) => k !== worst);
    sol = lsq(nodes, kept, seeds);
  }
  const residuals = kept.map(resid);
  const poses: PagePose[] = nodes.map((nd, i) => {
    let r = 0;
    kept.forEach((p, k) => {
      if (p.method === 'grid-label' || p.method === 'manual') return;
      const f = pageKey(p.from.file, p.from.page);
      const t = pageKey(p.to.file, p.to.page);
      if (f === nd.key || t === nd.key) r = Math.max(r, residuals[k]);
    });
    return {
      file: nd.file,
      page: nd.page,
      toSheet: rotAffine(nd.rot, sol.x[i], sol.y[i]),
      residualMm: r,
    };
  });
  for (let k = 0; k < kept.length; k++)
    if (residuals[k] > PATIMPORT.registrationMaxResidualMm) {
      const p = kept[k];
      warnings.push(
        `pair ${p.from.file}:${p.from.page + 1}→${p.to.file}:${p.to.page + 1} residual ` +
          `${residuals[k].toFixed(2)} mm > ${PATIMPORT.registrationMaxResidualMm} (no redundancy to reject it)`,
      );
    }
  return { poses, kept, residuals, rejected, warnings };
}

/** Contract `solvePoses(pairs)`: global, loop-closure checked (see solvePosesDetailed). */
export function solvePoses(pairs: PairTransform[]): PagePose[] {
  return solvePosesDetailed(pairs).poses;
}
