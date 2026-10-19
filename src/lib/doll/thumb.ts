// The doll's still for the ASSEMBLY MAP column (design §6, §8 q7): the last solved frame, front
// view, painted with the plain 2D canvas API — painter's order, flat Lambert grey, seams on top —
// so the column never opens a second WebGL context. Runs in the worker on an OffscreenCanvas; any
// 2D context will do (node probes pass none and get null).

import type { DollReport } from './types';

type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineJoin'
  | 'fillRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'setLineDash'
>;

/** Paint the doll front-on (it faces +z, y up) into a w × h context with a white ground. */
export function paintDollThumb(ctx: Ctx2D, report: DollReport, w: number, h: number): void {
  const P = report.positions;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of report.panels) {
    if (p.group === 'FLOAT') continue;
    for (let i = p.offset; i < p.offset + p.count; i++) {
      x0 = Math.min(x0, P[3 * i]);
      x1 = Math.max(x1, P[3 * i]);
      y0 = Math.min(y0, P[3 * i + 1]);
      y1 = Math.max(y1, P[3 * i + 1]);
    }
  }
  if (!Number.isFinite(x0)) return;
  const pad = 0.08;
  const s = Math.min((w * (1 - 2 * pad)) / (x1 - x0 || 1), (h * (1 - 2 * pad)) / (y1 - y0 || 1));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sx = (i: number) => w / 2 + (P[3 * i] - cx) * s;
  const sy = (i: number) => h / 2 - (P[3 * i + 1] - cy) * s;

  // Triangles far → near; a face turned away is the darker inside of the garment.
  const tris: { a: number; b: number; c: number; z: number; shade: number }[] = [];
  for (const p of report.panels) {
    if (p.group === 'FLOAT') continue;
    const T = p.tris;
    for (let t = 0; t < T.length; t += 3) {
      const a = p.offset + T[t];
      const b = p.offset + T[t + 1];
      const c = p.offset + T[t + 2];
      const ux = P[3 * b] - P[3 * a];
      const uy = P[3 * b + 1] - P[3 * a + 1];
      const uz = P[3 * b + 2] - P[3 * a + 2];
      const vx = P[3 * c] - P[3 * a];
      const vy = P[3 * c + 1] - P[3 * a + 1];
      const vz = P[3 * c + 2] - P[3 * a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const n = Math.hypot(nx, ny, nz) || 1;
      // Light from the front, a little from above and the viewer's left.
      const lam = (nx * -0.3 + ny * 0.45 + nz * 0.84) / n;
      const facing = nz >= 0;
      const shade = facing ? 0.72 + 0.24 * Math.max(0, lam) : 0.5 + 0.12 * Math.max(0, -lam);
      tris.push({ a, b, c, z: P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2], shade });
    }
  }
  tris.sort((p, q) => p.z - q.z);
  for (const t of tris) {
    const g = Math.round(255 * t.shade);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(sx(t.a), sy(t.a));
    ctx.lineTo(sx(t.b), sy(t.b));
    ctx.lineTo(sx(t.c), sy(t.c));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Seams on top, by state in weight (monochrome): closed thin ink, proposed dashed, open heavy.
  ctx.lineJoin = 'round';
  for (const seam of report.seams) {
    if (seam.origin === 'layer') continue;
    const open = seam.state === 'open' || seam.state === 'twisted';
    const proposed = seam.state === 'proposed';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = open ? 2.2 : 0.9;
    ctx.setLineDash(proposed ? [3, 3] : []);
    for (const path of open ? [seam.pathA, seam.pathB] : [seam.pathA]) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx(path[0]), sy(path[0]));
      for (let k = 1; k < path.length; k++) ctx.lineTo(sx(path[k]), sy(path[k]));
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}
