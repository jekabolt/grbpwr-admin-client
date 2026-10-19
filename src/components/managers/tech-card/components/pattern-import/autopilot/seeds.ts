// A10 · AUTOPILOT — "click inside every piece" when the sheet seeds nothing (no text, no face seed):
// one point inside the innermost loop of each nest of closed lines (the e2e oracle's rule,
// scripts/pattern-import/e2e-entry.ts `oracleClicks`), read off the chain preview the sizes step
// already has. Each seed is a STRONG assumption: the fill, the H1 guard and the gate still decide
// whether it is a piece.
import type { PtMm } from 'lib/pattern-import/types';

type Loop = {
  pts: PtMm[];
  area: number;
  box: { minX: number; minY: number; maxX: number; maxY: number };
};

function inside(p: PtMm, poly: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Points inside every outermost closed outline ≥ `minAreaMm2` (one per nest). */
export function seedPoints(preview: readonly Float32Array[], minAreaMm2 = 2000): PtMm[] {
  const loops: Loop[] = [];
  for (const a of preview) {
    if (a.length < 8) continue;
    const n = a.length / 2;
    if (Math.hypot(a[0] - a[2 * n - 2], a[1] - a[2 * n - 1]) > 1) continue;
    const pts: PtMm[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: a[2 * i], y: a[2 * i + 1] });
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const area = Math.abs(s) / 2;
    if (area < minAreaMm2) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    loops.push({
      pts,
      area,
      box: {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
    });
  }
  loops.sort((x, y) => y.area - x.area);
  const outer = loops.filter(
    (l, i) =>
      !loops
        .slice(0, i)
        .some((o) => inside(l.pts[0], o.pts) && inside(l.pts[Math.floor(l.pts.length / 2)], o.pts)),
  );
  const out: PtMm[] = [];
  for (const o of outer) {
    const nest = loops.filter(
      (l) => l === o || (l.area >= 0.5 * o.area && l.area <= o.area && inside(l.pts[0], o.pts)),
    );
    const inner = nest[nest.length - 1];
    // a point inside the innermost loop: scan rows of its box, from the middle down
    for (let r = 8; r < 20; r++) {
      const y = inner.box.minY + ((inner.box.maxY - inner.box.minY) * r) / 20;
      const xs: number[] = [];
      for (let i = 0, j = inner.pts.length - 1; i < inner.pts.length; j = i++) {
        const a = inner.pts[i];
        const b = inner.pts[j];
        if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
      xs.sort((p, q) => p - q);
      if (xs.length >= 2 && xs[1] - xs[0] > 20) {
        out.push({ x: (xs[0] + xs[1]) / 2, y });
        break;
      }
    }
  }
  return out;
}
