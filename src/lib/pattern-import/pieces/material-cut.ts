import type { IRPath, PtMm, Sheet } from '../types';
import { dist, pointInPoly, segNearest } from './geom';

function visibleSpan(path: IRPath, from: number, to: number, length: number): boolean {
  const evidence = [path.visibleEdges, ...(path.paintCopies ?? []).map((copy) => copy.edges)];
  if (evidence.includes(true)) return true;
  const spans = evidence.flatMap((v) => (Array.isArray(v) ? v : [])).sort((a, b) => a[0] - b[0]);
  let end = from;
  for (const [lo, hi] of spans) {
    if (lo > end + 0.001 / length) break;
    end = Math.max(end, hi);
  }
  return end >= to - 0.001 / length;
}

/** Only the shared arc and the labelled, physically painted interval may enter the lining cut. */
export function liningCut(
  sheet: Pick<Sheet, 'texts' | 'paths' | 'styles'>,
  outer: PtMm[],
  seed: PtMm,
) {
  const labels = sheet.texts.filter(
    (t) => /^cut here for lining$/i.test(t.text.trim()) && pointInPoly(t.anchor, outer),
  );
  if (labels.length !== 1 || !pointInPoly(seed, outer)) return;
  const label = labels[0];
  const angle = (label.rotationDeg * Math.PI) / 180;
  const choices = [];
  for (const path of sheet.paths) {
    if (path.src.file !== label.src.file || path.background || path.closed || path.pts.length !== 2)
      continue;
    const style = sheet.styles[path.style];
    if (style.fill || style.dash?.length || style.widthMm <= 0) continue;
    const [a, b] = path.pts;
    const length = dist(a, b);
    if (length === 0 || segNearest(label.anchor, a, b).d > label.fontSizeMm / 2) continue;
    const x = (b.x - a.x) / length,
      y = (b.y - a.y) / length;
    if (Math.abs(x * Math.cos(angle) + y * Math.sin(angle)) < Math.cos(Math.PI / 180)) continue;
    const side = (p: PtMm) => (p.y - a.y) * x - (p.x - a.x) * y;
    const sign = Math.sign(side(seed));
    if (!sign) continue;
    const hits: number[] = [],
      cut: PtMm[] = [];
    for (let i = 0; i < outer.length; i++) {
      const p = outer[i],
        q = outer[(i + 1) % outer.length],
        u = sign * side(p),
        v = sign * side(q);
      if (u >= 0) cut.push(p);
      if (u > 0 === v > 0) continue;
      const t = u / (u - v),
        hit = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
      hits.push(((hit.x - a.x) * x + (hit.y - a.y) * y) / length);
      if (t > 0 && t < 1) cut.push(hit);
    }
    if (hits.length !== 2 || cut.length < 3) continue;
    const [from, to] = hits.sort((u, v) => u - v);
    if (from < 0 || to > 1 || !visibleSpan(path, from, to, length)) continue;
    const onLine = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    choices.push({
      cut,
      path: path.id,
      label: label.id,
      segment: [onLine(from), onLine(to)] as [PtMm, PtMm],
      side: sign,
    });
  }
  if (choices.length === 1) return choices[0];
}
