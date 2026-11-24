import type { ChainSet, IRPath, PtMm, Sheet, SizeRun } from '../types';
import { bboxOf, dist, pointInPoly, segNearest } from './geom';

const mid = (a: PtMm, b: PtMm) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
type Strip = { pts: PtMm[]; chain: number; own: boolean };
type Corner = { entry: PtMm; vertex: PtMm; exit: PtMm };

const boxCenter = (path: IRPath) => {
  const box = bboxOf(path.pts);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
};

// The wide, flat edge of a printed tick runs along the brush. Its tip lies
// on one side of that edge; a round dot has ink on both sides of its diameter.
function tickFrame(path: IRPath, halfWidth: number) {
  const pts = path.pts;
  if (pts.length < 4) return;
  const a = pts[0],
    b = pts.reduce((u, v) => (dist(a, v) > dist(a, u) ? v : u));
  const len = dist(a, b);
  if (len <= 2 * halfWidth) return;
  const nx = (a.y - b.y) / len,
    ny = (b.x - a.x) / len;
  const heights = pts.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny);
  const h = Math.max(...heights),
    l = Math.min(...heights);
  const sign =
    l >= -0.03 && h > halfWidth && h < 2.2 * halfWidth
      ? 1
      : h <= 0.03 && -l > halfWidth && -l < 2.2 * halfWidth
        ? -1
        : 0;
  if (sign) return { base: mid(a, b), nx: sign * nx, ny: sign * ny };
}

// Calibrate against the line through the legend dots. A single-size dot
// alone says nothing about where a neighbouring triangle sits on the pen.
function legendTickOffset(paths: IRPath[]) {
  const dots = paths.filter((p) => p.pts.length >= 5 && dist(p.pts[0], p.pts.at(-1)!) < 0.001);
  if (dots.length < 3) return;
  const a = boxCenter(dots[0]),
    b = boxCenter(dots.at(-1)!);
  const len = dist(a, b);
  if (len < 1) return;
  const nx = (a.y - b.y) / len,
    ny = (b.x - a.x) / len;
  const across = (p: PtMm) => (p.x - a.x) * nx + (p.y - a.y) * ny;
  const widths = dots
    .map((dot) => {
      const h = dot.pts.map(across);
      return (Math.max(...h) - Math.min(...h)) / 2;
    })
    .sort((x, y) => x - y);
  const halfWidth = widths[Math.floor(widths.length / 2)];
  if (!halfWidth || dots.some((dot) => Math.abs(across(boxCenter(dot))) > 0.1 * halfWidth)) return;
  const offsets = paths
    .flatMap((p) => {
      const frame = tickFrame(p, halfWidth);
      if (!frame) return [];
      const alignment = frame.nx * nx + frame.ny * ny;
      return Math.abs(alignment) > 0.98 ? [-across(frame.base) / alignment] : [];
    })
    .sort((x, y) => x - y);
  const distance = offsets[Math.floor(offsets.length / 2)];
  if (
    offsets.length < 3 ||
    !(distance > 0) ||
    offsets.some((v) => Math.abs(v - distance) > 0.1 * halfWidth)
  )
    return;
  return { halfWidth, distance };
}

/** Two narrow quads clip the two printed arms of a patterned corner. Their
 * shared edge is the mitre: its midpoint is on the cut centreline. */
export function printedMitre(a: PtMm[], b: PtMm[]): Corner | undefined {
  if (a.length !== 4 || b.length !== 4) return;
  const shared = a.filter((p) => b.some((q) => dist(p, q) < 0.003));
  if (shared.length !== 2) return;
  const opposite = (quad: PtMm[]) => quad.filter((p) => !shared.some((q) => dist(p, q) < 0.003));
  const lo = opposite(a),
    hi = opposite(b);
  if (lo.length !== 2 || hi.length !== 2) return;
  const vertex = mid(shared[0], shared[1]),
    entry = mid(lo[0], lo[1]),
    exit = mid(hi[0], hi[1]);
  if (dist(entry, vertex) < dist(lo[0], lo[1]) || dist(exit, vertex) < dist(hi[0], hi[1])) return;
  return { entry, vertex, exit };
}

/** Read a keyed compound pattern from its individual paint operations. A change
 * of direction across a gap needs the two arms of a printed mitre; another
 * row crossing the gap cannot supply a missing corner. */
export function clippedMarkLoop(
  sheet: Pick<Sheet, 'styles' | 'paths'>,
  set: Pick<ChainSet, 'chains' | 'classes'>,
  run: Pick<SizeRun, 'sizes'>,
  rank: number,
  seed: PtMm,
) {
  const cls = set.classes.find((c) => c.id === run.sizes[rank]?.classId);
  const sample = cls?.evidence.find((e) => e.kind === 'legend-sample');
  if (cls?.role !== 'size') return null;
  if (sample?.kind !== 'legend-sample') return null;
  const exemplar = set.chains[sample.chain],
    period = exemplar?.markPeriod;
  if (!period || !period.includes('d') || (!period.includes('D') && !period.includes('t')))
    return null;
  if (
    set.classes.some(
      (c) =>
        c !== cls &&
        c.evidence.some(
          (e) => e.kind === 'legend-sample' && set.chains[e.chain]?.markPeriod === period,
        ),
    )
  )
    return null;
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const pen = styles.get(exemplar.style);
  if (!pen?.fill) return null;
  const sameInk = (id: number) => {
    const s = styles.get(id);
    return s?.fill && s.layer === pen.layer && s.strokeRgb?.join() === pen.strokeRgb?.join();
  };
  const byPath = new Map(sheet.paths.map((p) => [p.id, p]));
  const singleDot = /^[dt]+$/.test(period);
  const offset = singleDot
    ? legendTickOffset(exemplar.ranges.flatMap((r) => byPath.get(r.path) ?? []))
    : undefined;
  if (singleDot && !offset) return null;
  const source = new Map<PtMm, IRPath['src']>();
  const sampleOps = exemplar.ranges
    .map((r) => byPath.get(r.path)?.src.op)
    .filter((op): op is number => op !== undefined)
    .sort((a, b) => a - b);
  const intervals = sampleOps
    .slice(1)
    .map((op, i) => op - sampleOps[i])
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const cadence = intervals[Math.floor(intervals.length / 2)];
  const strips: Strip[] = [];
  const own = new Set(cls.chains);
  const allowed = new Set(
    set.classes
      .filter(
        (c) =>
          c === cls ||
          c.role === 'common' ||
          c.role === 'internal' ||
          (singleDot && c.role === 'notch' && !c.evidence.length),
      )
      .flatMap((c) => c.chains),
  );
  const pitch = exemplar.lengthMm / (exemplar.ranges.length - 1);
  if (!(pitch > 0 && pitch < 4)) return null;
  for (const chain of set.chains) {
    if (chain.markPeriod !== period || !allowed.has(chain.id) || chain.id === sample.chain)
      continue;
    if (
      !own.has(chain.id) &&
      set.classes.some((c) => c.role === 'notch' && c.chains.includes(chain.id)) &&
      !chain.ranges.some((r) => styles.get(byPath.get(r.path)?.style ?? -1)?.clipQuad)
    )
      continue;
    const arc = [0];
    for (let i = 1; i < chain.pts.length; i++)
      arc.push(arc[i - 1] + dist(chain.pts[i - 1], chain.pts[i]));
    const painted = [];
    for (const id of new Set(chain.ranges.map((r) => r.path))) {
      const p = byPath.get(id);
      if (!p || !sameInk(p.style) || styles.get(p.style)?.clipQuad) continue;
      const frame = offset && tickFrame(p, offset.halfWidth);
      const v =
        frame && offset
          ? {
              x: frame.base.x + frame.nx * offset.distance,
              y: frame.base.y + frame.ny * offset.distance,
            }
          : boxCenter(p);
      source.set(v, p.src);
      let at = 0,
        d = Infinity;
      for (let j = 1; j < chain.pts.length; j++) {
        const hit = segNearest(v, chain.pts[j - 1], chain.pts[j]);
        if (hit.d < d) {
          d = hit.d;
          at = arc[j - 1] + dist(chain.pts[j - 1], hit.q);
        }
      }
      painted.push({ v, at });
    }
    const ordered = painted.sort((a, b) => a.at - b.at);
    let pts: PtMm[] = [];
    const flush = () => {
      if (pts.length >= 2) strips.push({ pts, chain: chain.id, own: own.has(chain.id) });
      pts = [];
    };
    for (const { v } of ordered) {
      const prev = pts[pts.length - 1];
      if (prev && dist(prev, v) < 0.08) continue;
      if (prev && dist(prev, v) > 2.1 * pitch) flush();
      pts.push(v);
    }
    flush();
  }
  const corners: Corner[] = [];
  const quadByClip = new Map<string, PtMm[]>();
  for (const s of sheet.styles)
    if (s.clip && s.clipQuad && sameInk(s.id))
      quadByClip.set(JSON.stringify(s.clipQuad), s.clipQuad);
  const quads = [...quadByClip.values()];
  for (let i = 0; i < quads.length; i++)
    for (let j = i + 1; j < quads.length; j++) {
      if (dist(quads[i][0], quads[j][0]) > 20) continue;
      const corner = printedMitre(quads[i], quads[j]);
      if (corner) corners.push(corner);
    }
  if (!corners.length) return null;
  const ends = strips.flatMap(({ pts }, i) => [
    { i, p: pts[0], back: pts[1] },
    { i, p: pts[pts.length - 1], back: pts[pts.length - 2] },
  ]);
  const forward = (end: (typeof ends)[number], p: PtMm) => {
    const a = end.p,
      b = end.back;
    return (a.x - b.x) * (p.x - a.x) + (a.y - b.y) * (p.y - a.y) > 0;
  };
  const edges = ends.map((a, k) => {
    const choices: { mate: number; via: PtMm[] }[] = [];
    for (let j = 0; j < ends.length; j++) {
      const b = ends[j];
      if (k === j || a.i === b.i) continue;
      const gap = dist(a.p, b.p);
      const aligns = (end: typeof a, target: PtMm) => {
        const dx = end.p.x - end.back.x,
          dy = end.p.y - end.back.y;
        return (
          dx * (target.x - end.p.x) + dy * (target.y - end.p.y) > 0.85 * Math.hypot(dx, dy) * gap
        );
      };
      const from = source.get(a.p),
        to = source.get(b.p);
      // A turn can fall inside one paint run. Two consecutive keyed glyphs
      // there carry stronger evidence than the end tangents of split chains.
      const continuous =
        singleDot &&
        from &&
        to &&
        from.page === to.page &&
        from.file === to.file &&
        Math.abs(from.op - to.op) <= 2 * cadence &&
        forward(a, b.p) &&
        forward(b, a.p);
      if (gap <= 1.7 * pitch && (continuous || (aligns(a, b.p) && aligns(b, a.p))))
        choices.push({ mate: j, via: [] });
      if (gap > 15) continue;
      for (const corner of corners) {
        const { vertex } = corner;
        const [u, w] =
          dist(a.p, corner.entry) < dist(a.p, corner.exit)
            ? [corner.entry, corner.exit]
            : [corner.exit, corner.entry];
        if (
          dist(a.p, u) < pitch &&
          dist(b.p, w) < pitch &&
          forward(a, vertex) &&
          forward(b, vertex)
        )
          choices.push({ mate: j, via: [u, vertex, w] });
      }
    }
    return choices.length === 1 ? choices[0] : undefined;
  });
  const loops = [];
  const visited = new Set<number>();
  for (let start = 0; start < ends.length; start += 2) {
    if (visited.has(start >> 1)) continue;
    const seen = new Set<number>(),
      walls = new Set<number>(),
      pts: PtMm[] = [];
    let direct = 0,
      mitres = 0,
      k = start;
    while (!seen.has(k >> 1)) {
      const strip = strips[k >> 1];
      seen.add(k >> 1);
      walls.add(strip.chain);
      if (strip.own) direct++;
      pts.push(...(k % 2 ? strip.pts.slice().reverse() : strip.pts));
      const exit = k ^ 1,
        edge = edges[exit];
      if (!edge || edges[edge.mate]?.mate !== exit) {
        k = -1;
        break;
      }
      if (edge.via.length) mitres++;
      pts.push(...edge.via);
      k = edge.mate;
    }
    for (const i of seen) visited.add(i);
    if (k === start && direct >= 3 && mitres >= 3 && pointInPoly(seed, pts))
      loops.push({ pts, walls: [...walls] });
  }
  return loops.length === 1 ? loops[0] : null;
}
