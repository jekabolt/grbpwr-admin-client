// sizes/ — closing a size line: bridges over label gaps, and landing its ends on the line it meets.
//
// Bridges: two chains of the SAME rank whose ends face each other across ≤ bridgeMm, nearly
// collinear (the gap under «125 Mod.» or a notch), are one line — the later chain is appended to
// the earlier one and marked joined.
// Landings: a dashed size line stops a dash short of the line it runs into (Ф0.5: 68 such ends on
// palto). From each end, a ray along the end tangent up to landMm finds the first line; the end is
// extended onto it. Landings tell where the shared stretch of a line begins (recover.splitShared)
// and they close the outline for the fill (F4).
import type { Chain, PtMm } from 'lib/pattern-import/types';

import { dist, endTangent, PtGrid, SegGrid } from '../chains/geom';

export const LAND = { bridgeMm: 25, bridgeLateralMm: 1.0, bridgeAngleDeg: 20, landMm: 8 };

export type Landing = { chain: number; end: 0 | 1; on: number; at: PtMm; gapMm: number };

/** Join same-rank chains across short collinear gaps. Returns joined chain → host chain. */
export function bridgeSameRank(chains: Chain[], rankOf: Map<number, number>): Map<number, number> {
  const joined = new Map<number, number>();
  const cosMax = Math.cos((LAND.bridgeAngleDeg * Math.PI) / 180);
  for (let round = 0; round < 6; round++) {
    const ends: { c: number; end: 0 | 1; p: PtMm; t: PtMm }[] = [];
    const grid = new PtGrid(LAND.bridgeMm);
    for (const [c] of rankOf) {
      if (joined.has(c)) continue;
      const ch = chains[c];
      if (ch.closed || ch.lengthMm < 3) continue;
      for (const end of [0, 1] as const) {
        const t = endTangent(ch.pts, end, 5);
        if (!t) continue;
        const p = end ? ch.pts[ch.pts.length - 1] : ch.pts[0];
        grid.add(ends.length, p);
        ends.push({ c, end, p, t });
      }
    }
    const cands: { i: number; j: number; cost: number }[] = [];
    ends.forEach((A, i) => {
      grid.near(A.p, LAND.bridgeMm, (j) => {
        if (j <= i) return;
        const B = ends[j];
        if (B.c === A.c || rankOf.get(B.c) !== rankOf.get(A.c)) return;
        const dx = B.p.x - A.p.x;
        const dy = B.p.y - A.p.y;
        const g = Math.hypot(dx, dy);
        if (g > LAND.bridgeMm) return;
        if (-(A.t.x * B.t.x + A.t.y * B.t.y) < cosMax) return;
        const latA = Math.abs(dx * A.t.y - dy * A.t.x);
        const latB = Math.abs(dx * B.t.y - dy * B.t.x);
        const alA = dx * A.t.x + dy * A.t.y;
        const alB = -(dx * B.t.x + dy * B.t.y);
        if (alA < -0.3 || alB < -0.3 || latA > LAND.bridgeLateralMm || latB > LAND.bridgeLateralMm) return;
        cands.push({ i, j, cost: g + 3 * (latA + latB) });
      });
    });
    cands.sort((a, b) => a.cost - b.cost);
    const used = new Set<number>();
    let merged = 0;
    for (const m of cands) {
      const A = ends[m.i];
      const B = ends[m.j];
      if (used.has(A.c) || used.has(B.c)) continue;
      used.add(A.c);
      used.add(B.c);
      const a = chains[A.c];
      const b = chains[B.c];
      const aPts = A.end === 1 ? a.pts : a.pts.slice().reverse();
      const bPts = B.end === 0 ? b.pts : b.pts.slice().reverse();
      const pts = aPts.concat(bPts);
      chains[A.c] = { ...a, pts, lengthMm: a.lengthMm + b.lengthMm + dist(A.p, B.p), ranges: a.ranges.concat(b.ranges) };
      joined.set(B.c, A.c);
      rankOf.delete(B.c);
      merged++;
    }
    if (!merged) break;
  }
  return joined;
}

/** Extend size-line ends onto the first line ahead (≤ landMm). `targets` = lines that can be met. */
export function landEnds(chains: Chain[], rankOf: Map<number, number>, targets: boolean[]): Landing[] {
  const grid = new SegGrid(6);
  const poly = chains.map((c) => c.pts);
  chains.forEach((c, i) => {
    if (targets[i] || rankOf.has(i)) grid.addPolyline(i, c.pts);
  });
  const out: Landing[] = [];
  for (const [c] of rankOf) {
    const ch = chains[c];
    if (ch.closed || ch.lengthMm < 5) continue;
    for (const end of [0, 1] as const) {
      const pts = chains[c].pts;
      const t = endTangent(pts, end, 3);
      if (!t) continue;
      const p = end ? pts[pts.length - 1] : pts[0];
      let best: { j: number; u: number } | null = null;
      const mid = { x: p.x + (t.x * LAND.landMm) / 2, y: p.y + (t.y * LAND.landMm) / 2 };
      grid.near(mid, LAND.landMm / 2 + 1, (j, si) => {
        if (j === c) return;
        const a = poly[j][si];
        const b = poly[j][si + 1];
        const sx = b.x - a.x;
        const sy = b.y - a.y;
        const den = t.x * sy - t.y * sx;
        if (Math.abs(den) < 1e-12) return;
        const qx = a.x - p.x;
        const qy = a.y - p.y;
        const u = (qx * sy - qy * sx) / den;
        const v = (qx * t.y - qy * t.x) / den;
        if (v < -1e-6 || v > 1 + 1e-6 || u < -0.05 || u > LAND.landMm) return;
        if (!best || u < best.u) best = { j, u };
      });
      if (!best) continue;
      const { j, u } = best as { j: number; u: number };
      const at = { x: p.x + t.x * Math.max(0, u), y: p.y + t.y * Math.max(0, u) };
      if (u > 0.02) {
        const np = end ? [...pts, at] : [at, ...pts];
        chains[c] = { ...chains[c], pts: np, lengthMm: chains[c].lengthMm + u };
      }
      out.push({ chain: c, end, on: j, at, gapMm: Math.max(0, u) });
    }
  }
  return out;
}
