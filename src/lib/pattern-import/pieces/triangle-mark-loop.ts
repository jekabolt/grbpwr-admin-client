import type { Chain, ChainSet, IRPath, PtMm, Sheet, SizeRun } from '../types';
import { bboxOf, dist, pointInPoly } from './geom';

const sub = (a: PtMm, b: PtMm) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: PtMm, b: PtMm) => a.x * b.x + a.y * b.y;
const cross = (a: PtMm, b: PtMm) => a.x * b.y - a.y * b.x;
const add = (a: PtMm, b: PtMm, t: number) => ({ x: a.x + t * b.x, y: a.y + t * b.y });
const mid = (a: PtMm, b: PtMm) => add(a, sub(b, a), 0.5);
function unit(a: PtMm, b: PtMm) {
  const len = dist(a, b);
  return len > 1e-5 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : null;
}
function boxCenter(p: IRPath) {
  const b = bboxOf(p.pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
function intersect(a: PtMm, t: PtMm, b: PtMm, u: PtMm) {
  const det = cross(t, u);
  return Math.abs(det) > 0.12 ? add(a, t, cross(sub(b, a), u) / det) : null;
}

// The stamp starts at the forward end of its base. Read its transverse
// midpoint in that frame, so rotating a triangle does not displace the cut.
export function triangleStamp(p: IRPath, width: number, height: number) {
  const a = p.pts[0],
    b = p.pts.reduce((far, q) => (dist(a, q) > dist(a, far) ? q : far));
  // A bent base can still have the dimensions of a normal triangle. Keep
  // its turn for foldedTriangle() rather than stretching one chord across it.
  if (p.pts.length > 3 && b === p.pts[2]) {
    const u = unit(p.pts[0], p.pts[1]),
      v = unit(p.pts[1], b);
    if (u && v && dot(u, v) < 0.97) return null;
  }
  const t = unit(b, a);
  if (!t || Math.abs(dist(a, b) - width) > 0.24 * width) return null;
  const n = { x: -t.y, y: t.x };
  const heights = p.pts.map((q) => dot(sub(q, a), n));
  const h = Math.max(...heights),
    lo = Math.min(...heights);
  if (lo < -0.08 * height || Math.abs(h - height) > 0.25 * height) return null;
  return { p: add(mid(a, b), n, h / 2), t };
}

// At a folded stamp the base follows the two arms. A reversal may end
// in a transverse cap: both shifted ends then give the same printed tip.
export function foldedTriangle(p: IRPath, prev: PtMm, next: PtMm, half: number) {
  const [a, b, c, d] = p.pts;
  if (!d) return null;
  const out = unit(b, a);
  if (!out || dot(out, next) < 0.88) return null;
  const shift = (q: PtMm, t: PtMm) => add(q, { x: -t.y, y: t.x }, half);
  const incoming = unit(d, c);
  if (incoming && dot(incoming, prev) > 0.75) {
    const x = shift(b, out),
      y = shift(c, incoming);
    if (dist(x, y) < 0.12 * half) return [shift(d, incoming), mid(x, y), shift(a, out)];
  }
  const into = unit(c, b);
  if (!into || dot(into, prev) < 0.88) return null;
  const x = shift(c, into),
    y = shift(a, out);
  const v = intersect(x, into, y, out);
  return v && dist(v, b) < 4 * half ? [x, v, y] : null;
}

export function readTriangleRing(paths: IRPath[], pitch: number, width: number, height: number) {
  paths.sort((a, b) => a.src.page - b.src.page || a.src.op - b.src.op);
  const strips: IRPath[][] = [];
  for (const p of paths) {
    let strip = strips.at(-1);
    const last = strip?.at(-1);
    if (
      !strip ||
      !last ||
      last.src.page !== p.src.page ||
      dist(boxCenter(last), boxCenter(p)) > 1.55 * pitch
    ) {
      strip = [];
      strips.push(strip);
    }
    strip.push(p);
  }
  const mates = strips.map((strip) =>
    strips
      .map((s, i) => (dist(boxCenter(strip.at(-1)!), boxCenter(s[0])) < 1.55 * pitch ? i : -1))
      .filter((i) => i >= 0),
  );
  if (mates.some((m) => m.length !== 1) || new Set(mates.flat()).size !== strips.length)
    return null;
  const order: IRPath[] = [],
    seen = new Set<number>();
  let k = 0;
  while (!seen.has(k)) {
    seen.add(k);
    order.push(...strips[k]);
    k = mates[k][0];
  }
  if (k !== 0 || seen.size !== strips.length) return null;
  const axes = order.map((p) => triangleStamp(p, width, height));
  if (axes.filter(Boolean).length < 0.8 * axes.length) return null;
  const result: PtMm[] = [];
  const knots = axes.flatMap((a, i) => (a ? [i] : []));
  for (let j = 0; j < knots.length; j++) {
    const i = knots[j],
      end = knots[(j + 1) % knots.length],
      a = axes[i]!,
      b = axes[end]!;
    result.push(a.p);
    const skip = (end - i - 1 + order.length) % order.length;
    if (skip > 4) return null;
    const turns = dot(a.t, b.t) < 0.97;
    let hasCorner = false;
    for (let s = 1; s <= skip; s++) {
      const mark = order[(i + s) % order.length];
      const corner = turns && foldedTriangle(mark, a.t, b.t, height / 2);
      if (corner) {
        result.push(...corner);
        hasCorner = true;
      } else if (turns && skip > 1) result.push(boxCenter(mark));
    }
    if (turns && !hasCorner) {
      const tip = intersect(a.p, a.t, b.p, b.t);
      if (!tip || dist(tip, a.p) + dist(tip, b.p) > (skip + 2) * pitch * 1.6) return null;
      result.push(tip);
    }
  }
  return result;
}

export function triangleLegend(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: Pick<ChainSet, 'chains' | 'classes'>,
  run: Pick<SizeRun, 'sizes'>,
  rank: number,
) {
  const cls = set.classes.find((c) => c.id === run.sizes[rank]?.classId);
  const sample = cls?.evidence.find((e) => e.kind === 'legend-sample');
  if (cls?.role !== 'size' || sample?.kind !== 'legend-sample') return null;
  const pen = set.chains[sample.chain];
  if (!pen || pen.markPeriod || !pen.motif || pen.ranges.length < 6) return null;
  const pitch = pen.lengthMm / (pen.ranges.length - 1);
  const styles = new Map(sheet.styles.map((style) => [style.id, style]));
  const penStyle = styles.get(pen.style);
  if (!penStyle?.fill) return null;
  const byId = new Map(sheet.paths.map((p) => [p.id, p]));
  const glyphs = (ch: Chain) => ch.ranges.flatMap((r) => byId.get(r.path) ?? []);
  const sampleMarks = glyphs(pen);
  const tri = sampleMarks.filter((p) => p.closed && p.pts.length === 3);
  if (!tri.length || tri.length < 0.9 * sampleMarks.length) return null;
  const [a, b, c] = tri[0].pts;
  const width = dist(a, b),
    height = cross(sub(a, b), sub(c, b)) / width;
  if (
    !(height > 0 && width > height && pitch > width) ||
    !tri.every((p) => triangleStamp(p, width, height)) ||
    set.classes.some(
      (k) =>
        k !== cls &&
        k.evidence.some((e) => {
          if (e.kind !== 'legend-sample') return false;
          const other = set.chains[e.chain];
          return (
            other &&
            Math.abs(other.lengthMm / (other.ranges.length - 1) - pitch) < 0.1 * pitch &&
            glyphs(other).filter((p) => p.pts.length === 3 && triangleStamp(p, width, height))
              .length >=
              0.8 * other.ranges.length
          );
        }),
    )
  )
    return null;
  return { cls, pitch, width, height, penStyle, glyphs, byId, styles, sampleMarks };
}

/** A mixed flood can follow neighbouring size lines, even when the size's own
 * two marked chains meet at both ends. Require every strip in their original
 * paint order to belong to one unambiguous cycle around this seed. */
export function triangleMarkLoop(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: Pick<ChainSet, 'chains' | 'classes'>,
  run: Pick<SizeRun, 'sizes'>,
  rank: number,
  seed: PtMm,
  walls: number[],
) {
  const cls = set.classes.find((c) => c.id === run.sizes[rank]?.classId);
  const sample = cls?.evidence.find((e) => e.kind === 'legend-sample');
  if (
    cls?.role !== 'size' ||
    sample?.kind !== 'legend-sample' ||
    !walls.some((id) => cls.chains.includes(id)) ||
    !walls.some((id) => !cls.chains.includes(id))
  )
    return null;
  const pen = set.chains[sample.chain];
  if (!pen || pen.markPeriod || !pen.motif || pen.ranges.length < 6) return null;
  const pitch = pen.lengthMm / (pen.ranges.length - 1);
  const own = cls.chains
    .map((id) => set.chains[id])
    .filter((ch) => !ch.closed && ch.ranges.length >= 6);
  const pairs: [Chain, Chain][] = [];
  for (let i = 0; i < own.length; i++)
    for (let j = i + 1; j < own.length; j++) {
      const x = own[i],
        y = own[j];
      if (!walls.includes(x.id) || !walls.includes(y.id)) continue;
      const close = (a: PtMm, b: PtMm) => dist(a, b) < 0.35 * pitch;
      if (
        !(
          (close(x.pts[0], y.pts[0]) && close(x.pts.at(-1)!, y.pts.at(-1)!)) ||
          (close(x.pts[0], y.pts.at(-1)!) && close(x.pts.at(-1)!, y.pts[0]))
        )
      )
        continue;
      pairs.push([x, y]);
    }
  if (!pairs.length) return null;
  const source = triangleLegend(sheet, set, run, rank);
  if (!source) return null;
  const { width, height, penStyle, glyphs, byId, styles } = source;
  const loops = [];
  for (const [x, y] of pairs) {
    const paths = [...new Set([...glyphs(x), ...glyphs(y)])];
    if (
      !paths.length ||
      [...x.ranges, ...y.ranges].some((r) => !byId.has(r.path)) ||
      paths.some((p) => {
        const style = styles.get(p.style);
        return (
          !p.closed ||
          p.background ||
          p.src.file !== paths[0].src.file ||
          !style?.fill ||
          style.layer !== penStyle.layer ||
          style.strokeRgb?.join() !== penStyle.strokeRgb?.join()
        );
      })
    )
      continue;
    const pts = readTriangleRing(paths, pitch, width, height);
    if (pts && pointInPoly(seed, pts)) loops.push({ pts, walls: [x.id, y.id], pitch });
  }
  return loops.length === 1 ? loops[0] : null;
}
