import type { ChainSet, IRPath, PtMm, Sheet, SizeRun } from '../types';
import { bboxOf, dist, pointInPoly, segIntersect } from './geom';

type Stroke = { pts: PtMm[]; paths: IRPath[]; rings: PtMm[] };

function crossing(a: IRPath, b: IRPath) {
  let vertex: PtMm | undefined;
  for (let i = 1; i < a.pts.length; i++) {
    for (let j = 1; j < b.pts.length; j++) {
      const hit = segIntersect(a.pts[i - 1], a.pts[i], b.pts[j - 1], b.pts[j]);
      if (!hit) continue;
      if (vertex && dist(vertex, hit.p) > 0.01) return;
      vertex = hit.p;
    }
  }
  if (vertex) return vertex;
  // Two separately quantized paint operations can miss their shared vertex.
  for (const p of a.pts)
    for (const q of b.pts) {
      if (dist(p, q) > 0.004) continue;
      if (vertex && dist(vertex, p) > 0.01) return;
      vertex = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    }
  return vertex;
}

function aligned(a: PtMm, b: PtMm, c: PtMm, d: PtMm) {
  return (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y) > 0.92 * dist(a, b) * dist(c, d);
}

/** A dash and three outlined rings are separate paint operations. At a fold
 * the two masked copies of the dash cross at the turn of the brush. */
export function ringStrokeLoop(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: Pick<ChainSet, 'chains' | 'classes'>,
  run: Pick<SizeRun, 'sizes'>,
  rank: number,
  seed: PtMm,
) {
  const cls = set.classes.find((c) => c.id === run.sizes[rank]?.classId);
  const legend = cls?.evidence.find(
    (e): e is Extract<typeof e, { kind: 'legend-sample' }> => e.kind === 'legend-sample',
  );
  const sample = legend && set.chains[legend.chain];
  if (!cls || !sample || sample.markPeriod !== '=ooo') return null;
  if (
    run.sizes.some(
      (size, i) =>
        i !== rank &&
        set.classes
          .find((c) => c.id === size.classId)
          ?.evidence.some(
            (e) =>
              e.kind === 'legend-sample' && set.chains[e.chain]?.markPeriod === sample.markPeriod,
          ),
    )
  )
    return null;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const glyphs = sample.ranges.map((r) => paths.get(r.path)!).filter(Boolean);
  const dash = glyphs.find((p) => !p.closed);
  if (!dash || !glyphs.some((p) => p.closed)) return null;
  const unit = dist(dash.pts[0], dash.pts.at(-1)!);
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const pen = styles.get(dash.style)!;
  const ringPen = styles.get(glyphs.find((p) => p.closed)!.style)!;
  const ringsByPage = new Map<number, Map<number, IRPath>>();
  for (const p of sheet.paths) {
    const ink = styles.get(p.style)!;
    if (
      p.src.file !== dash.src.file ||
      !p.closed ||
      ink.fill ||
      ink.widthMm !== ringPen.widthMm ||
      ink.layer !== ringPen.layer ||
      ink.strokeRgb?.join() !== ringPen.strokeRgb?.join()
    )
      continue;
    const page = ringsByPage.get(p.src.page) ?? new Map<number, IRPath>();
    page.set(p.src.op, p);
    ringsByPage.set(p.src.page, page);
  }
  const strokes: Stroke[] = [];
  const folded: IRPath[] = [];
  for (const path of sheet.paths) {
    const style = styles.get(path.style)!;
    if (
      path.background ||
      path.closed ||
      path.src.file !== dash.src.file ||
      style.fill ||
      style.dash?.length ||
      style.widthMm !== pen.widthMm ||
      style.layer !== pen.layer ||
      style.strokeRgb?.join() !== pen.strokeRgb?.join()
    )
      continue;
    if (path.pts.length < 2 || dist(path.pts[0], path.pts.at(-1)!) > 4 * unit) continue;
    const page = ringsByPage.get(path.src.page);
    const rings: PtMm[] = [];
    for (let op = path.src.op + 1; page && op <= path.src.op + 24; op++) {
      const ring = page.get(op);
      if (ring && dist(ring.pts[0], path.pts[0]) < 4 * unit) {
        const box = bboxOf(ring.pts);
        rings.push({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
      }
    }
    if (!rings.length) continue;
    const box = style.clip?.split(':').at(-1)?.split(',').map(Number);
    if (
      box?.length === 4 &&
      Math.max(box[2] - box[0], box[3] - box[1]) < 5 * unit &&
      path.pts.length >= 3
    )
      folded.push(path);
    else strokes.push({ pts: path.pts, paths: [path], rings });
  }
  for (let i = 0; i < folded.length; i++)
    for (const b of folded.slice(i + 1)) {
      const a = folded[i];
      if (a.src.page !== b.src.page || dist(a.pts[0], b.pts[0]) > 4 * unit) continue;
      const vertex = crossing(a, b);
      if (!vertex) continue;
      for (const [entry, exit] of [
        [a, b],
        [b, a],
      ])
        strokes.push({
          pts: [entry.pts[0], vertex, exit.pts.at(-1)!],
          paths: [entry, exit],
          rings: [],
        });
    }
  const bins = new Map<string, Stroke[]>();
  const cell = (v: number) => Math.floor(v / (3.1 * unit));
  for (const stroke of strokes) {
    const a = stroke.pts[0],
      key = [cell(a.x), cell(a.y)].join();
    const bin = bins.get(key) ?? [];
    bin.push(stroke);
    bins.set(key, bin);
  }
  const next = new Map<Stroke, Stroke>();
  for (const stroke of strokes) {
    const a = stroke.pts.at(-2)!,
      b = stroke.pts.at(-1)!;
    const options: Stroke[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const item of bins.get([cell(b.x) + i, cell(b.y) + j].join()) ?? []) {
          const [c, d] = item.pts;
          if (
            item !== stroke &&
            dist(b, c) < (stroke.paths.length === 2 ? 3.1 : 2.05) * unit &&
            aligned(a, b, b, c) &&
            aligned(b, c, c, d)
          )
            options.push(item);
        }
    if (options.length === 1) next.set(stroke, options[0]);
  }
  const checked = new Set<Stroke>(),
    loops = [];
  for (const start of strokes) {
    if (checked.has(start)) continue;
    const seen = new Map<Stroke, number>();
    let cur: Stroke | undefined = start;
    while (cur && !checked.has(cur) && !seen.has(cur)) {
      seen.set(cur, seen.size);
      cur = next.get(cur);
    }
    for (const s of seen.keys()) checked.add(s);
    if (!cur || !seen.has(cur)) continue;
    const cycle = [...seen.keys()].slice(seen.get(cur));
    const pts = cycle.flatMap((s, i) => {
      const after = cycle[(i + 1) % cycle.length],
        a = s.pts.at(-1)!,
        b = after.pts[0];
      const gap = dist(a, b),
        tx = (b.x - a.x) / gap,
        ty = (b.y - a.y) / gap;
      const rings = [...s.rings, ...after.rings]
        .map((p) => ({
          p,
          along: (p.x - a.x) * tx + (p.y - a.y) * ty,
          across: Math.abs((p.y - a.y) * tx - (p.x - a.x) * ty),
        }))
        .filter((r) => r.along > 0 && r.along < gap && r.across < unit / 4)
        .sort((l, r) => l.along - r.along);
      return [...s.pts, ...rings.map((r) => r.p)];
    });
    if (!pointInPoly(seed, pts)) continue;
    const ids = new Set(cycle.flatMap((s) => s.paths.map((p) => p.id)));
    const walls = cls.chains.filter((id) => set.chains[id].ranges.some((r) => ids.has(r.path)));
    if (walls.length >= 3) loops.push({ pts, walls });
  }
  return loops.length === 1 ? loops[0] : null;
}
