// Offline comparison with independently decoded PDF and DXF coordinates.
import { readPrintedCuts } from './printed-cut-ranges.mjs';
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const readCurvedRanges = (sheet, card) =>
  readPrintedCuts(sheet, card).filter((gs) => gs[0].equivalentCurves);
function sampled(ring, step, visit) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      n = Math.ceil(distance(a, b) / step);
    for (let j = 0; j < n; j++)
      visit({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
}
function directed(a, b) {
  const edges = b.map((p, i) => {
    const q = b[(i + 1) % b.length],
      dx = q.x - p.x,
      dy = q.y - p.y;
    return { p, dx, dy, den: dx * dx + dy * dy || 1 };
  });
  let worst = 0;
  sampled(a, 0.5, (p) => {
    let squared = Infinity;
    for (const edge of edges) {
      const x = p.x - edge.p.x,
        y = p.y - edge.p.y;
      const t = Math.max(0, Math.min(1, (x * edge.dx + y * edge.dy) / edge.den));
      squared = Math.min(squared, (x - edge.dx * t) ** 2 + (y - edge.dy * t) ** 2);
    }
    worst = Math.max(worst, squared);
  });
  return Math.sqrt(worst);
}
export const perimeterError = (a, b) => Math.max(directed(a, b), directed(b, a));
