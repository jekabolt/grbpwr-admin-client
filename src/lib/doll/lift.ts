// The hook for measure lines (lib/pom): a polyline in PATTERN coordinates of one piece (mm, the
// piece's own frame — PieceGeom.rs) lifted onto the doll through the panel's triangles
// (barycentric). The number of a measure always comes from the flat pattern; the doll only draws.

import type { DollMeasureLine, DollPanel, DollReport, Vec3 } from './types';

type Index = {
  panel: DollPanel;
  cell: number;
  x0: number;
  y0: number;
  nx: number;
  grid: Map<number, number[]>;
};
const cache = new WeakMap<DollPanel, Index>();

function indexOf(panel: DollPanel): Index {
  const hit = cache.get(panel);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  for (let i = 0; i < panel.count; i++) {
    x0 = Math.min(x0, panel.uv[2 * i]);
    y0 = Math.min(y0, panel.uv[2 * i + 1]);
    x1 = Math.max(x1, panel.uv[2 * i]);
  }
  const cell = 40;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
  const grid = new Map<number, number[]>();
  const T = panel.tris;
  for (let t = 0; t < T.length; t += 3) {
    let a0 = Infinity;
    let b0 = Infinity;
    let a1 = -Infinity;
    let b1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const x = panel.uv[2 * T[t + k]];
      const y = panel.uv[2 * T[t + k] + 1];
      a0 = Math.min(a0, x);
      a1 = Math.max(a1, x);
      b0 = Math.min(b0, y);
      b1 = Math.max(b1, y);
    }
    for (let gx = Math.floor((a0 - x0) / cell); gx <= Math.floor((a1 - x0) / cell); gx++)
      for (let gy = Math.floor((b0 - y0) / cell); gy <= Math.floor((b1 - y0) / cell); gy++) {
        const k = gy * nx + gx;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(t);
      }
  }
  const idx = { panel, cell, x0, y0, nx, grid };
  cache.set(panel, idx);
  return idx;
}

/** 3D point of pattern point (x, y) on a panel, or null when it is outside the piece. */
export function liftPoint(report: DollReport, panel: DollPanel, x: number, y: number): Vec3 | null {
  const I = indexOf(panel);
  const k = Math.floor((y - I.y0) / I.cell) * I.nx + Math.floor((x - I.x0) / I.cell);
  const T = panel.tris;
  const P = report.positions;
  for (const t of I.grid.get(k) ?? []) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
    const ax = panel.uv[2 * a];
    const ay = panel.uv[2 * a + 1];
    const bx = panel.uv[2 * b] - ax;
    const by = panel.uv[2 * b + 1] - ay;
    const cx = panel.uv[2 * c] - ax;
    const cy = panel.uv[2 * c + 1] - ay;
    const px = x - ax;
    const py = y - ay;
    const d = bx * cy - by * cx;
    if (Math.abs(d) < 1e-12) continue;
    const v = (px * cy - py * cx) / d;
    const w = (bx * py - by * px) / d;
    const u = 1 - v - w;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const g = (i: number, q: number) => P[3 * (panel.offset + i) + q];
    return [0, 1, 2].map((q) => u * g(a, q) + v * g(b, q) + w * g(c, q)) as Vec3;
  }
  return null;
}

/** A measure line (pieceKey + pattern polyline) → 3D polyline; points off the piece are dropped. */
export function liftMeasureLine(report: DollReport, line: DollMeasureLine): Vec3[] {
  const panel = report.panels.find(
    (p) => p.pieceKey === line.pieceKey && p.instance === (line.instance ?? 0),
  );
  if (!panel) return [];
  const out: Vec3[] = [];
  for (const [x, y] of line.pts) {
    const p = liftPoint(report, panel, x, y);
    if (p) out.push(p);
  }
  return out;
}
