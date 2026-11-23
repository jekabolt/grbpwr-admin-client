import type {
  PtMm,
  BoxMm,
  IRPath,
  Sheet,
  ChainSet,
  Seed,
  Style,
  PieceCandidate,
} from 'lib/pattern-import/types';
import { curvedCut, MAX_PRINTED_CORNERS, samePrintedCurve } from './printed-cut-curves';
import { pointInPoly } from './geom';

export type PrintedCutInput = Pick<Sheet, 'paths' | 'texts' | 'styles'> &
  Pick<ChainSet, 'chains' | 'classes'> & { seeds: Seed[] };
export type PrintedCutGroup = {
  seed: number;
  name: string;
  lo: number;
  hi: number;
  outer: PtMm[];
  paths: number[];
  label: string;
  equivalentCurves?: number;
  polygonSource?: PieceCandidate['polygonSource'];
  confirmedClosedPaths?: boolean;
};
// Source reader for straight-sided cuts with printed, contiguous size ranges.
// Input uses the assembled wizard sheet, the native legend classes and the labelled piece seeds.
const distance = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const inside = (p: PtMm, ring: PtMm[]) =>
  ring.every((a, i) => cross(a, ring[(i + 1) % ring.length], p) > 0);
function nearLabel(p: PtMm, b: BoxMm) {
  return (
    Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minY - p.y, 0, p.y - b.maxY)) < 3
  );
}
function dashSpace(style: Style) {
  const d = style.dash ?? [];
  return Math.max(0, ...d.filter((_, i) => d.length % 2 || i % 2));
}
export function joinsPrintedStrokes(p: IRPath, q: IRPath, styles: Style[], curved: boolean) {
  const a = p.pts.at(-1)!,
    b = q.pts[0],
    g = distance(a, b);
  if (g > 8 || g > Math.max(dashSpace(styles[p.style]), dashSpace(styles[q.style])) + 0.025)
    return false;
  if (g < 0.0001) return true;
  return [
    [p.pts.at(-2)!, a],
    [b, q.pts[1]],
  ].every(([u, v]) => {
    const l = distance(u, v);
    if (curved) {
      const dot = (v.x - u.x) * (b.x - a.x) + (v.y - u.y) * (b.y - a.y);
      return l > 0 && dot >= Math.cos((5 * Math.PI) / 180) * l * g;
    }
    return (
      l > 0 &&
      Math.abs(cross(u, v, { x: u.x + b.x - a.x, y: u.y + b.y - a.y })) / l < 0.005 &&
      (v.x - u.x) * (b.x - a.x) + (v.y - u.y) * (b.y - a.y) > 0
    );
  });
}
function polygon(paths: IRPath[]) {
  const corners: PtMm[] = [];
  for (const p of paths)
    for (let i = 1; i < p.pts.length - 1; i++) {
      const [a, b, c] = p.pts.slice(i - 1, i + 2);
      if (Math.abs(cross(a, b, c)) > 0.01 * distance(a, c)) corners.push(b);
    }
  if (corners.length < 3 || corners.length > MAX_PRINTED_CORNERS) return;
  if (cross(corners[0], corners[1], corners[2]) < 0) corners.reverse();
  // Strict convexity and unique turns also exclude self-intersections.
  if (
    !corners.every((a, i) =>
      corners.every(
        (p, j) =>
          j === i ||
          j === (i + 1) % corners.length ||
          cross(a, corners[(i + 1) % corners.length], p) > 0,
      ),
    )
  )
    return;
  return corners;
}
function supports(paths: IRPath[], ring: PtMm[], rankOf: Set<number>) {
  return ring.every((a, i) => {
    const b = ring[(i + 1) % ring.length],
      l = distance(a, b);
    const spans = [];
    for (const p of paths)
      if (rankOf.has(p.id))
        for (let j = 1; j < p.pts.length; j++) {
          const u = p.pts[j - 1],
            v = p.pts[j];
          if (Math.max(Math.abs(cross(a, b, u)), Math.abs(cross(a, b, v))) / l > 0.01) continue;
          const pos = (t: PtMm) => ((t.x - a.x) * (b.x - a.x) + (t.y - a.y) * (b.y - a.y)) / l;
          const x = pos(u),
            y = pos(v);
          spans.push([Math.max(0, Math.min(x, y)), Math.min(l, Math.max(x, y))]);
        }
    let end = 0,
      covered = 0;
    for (const [x, y] of spans.sort((u, v) => u[0] - v[0])) {
      covered += Math.max(0, y - Math.max(end, x));
      end = Math.max(end, y);
    }
    return covered > l / 2;
  });
}
export function straightCut(paths: IRPath[], ranks: Set<string>, ids: Map<number, Set<string>>) {
  const outer = polygon(paths);
  if (!outer) return;
  // Every drawn segment and every dash space must stay on one finite side.
  const points = paths.flatMap((p) => p.pts);
  const followsCut = points.every((v, i) =>
    outer.some((a, j) => {
      const b = outer[(j + 1) % outer.length],
        l = distance(a, b);
      return [v, points[(i + 1) % points.length]].every(
        (q) =>
          Math.abs(cross(a, b, q)) <= 0.025 * l && distance(a, q) + distance(q, b) <= l + 0.025,
      );
    }),
  );
  if (!followsCut) return;
  const ok = [...ranks].some((s) =>
    supports(paths, outer, new Set(paths.filter((p) => ids.get(p.id)?.has(s)).map((p) => p.id))),
  );
  if (!ok) return;
  const min = outer.reduce(
    (m, v, i) =>
      v.x < outer[m].x - 0.01 || (Math.abs(v.x - outer[m].x) < 0.01 && v.y < outer[m].y) ? i : m,
    0,
  );
  return { outer: outer.slice(min).concat(outer.slice(0, min)), paths };
}
const rangeText = /^(\d+)\s*[-–—]\s*(\d+)$/;
export function isPrintedCutPage(texts: string[]) {
  return (
    new Set(texts.filter((t) => rangeText.test(t.trim()))).size >= 2 &&
    texts.some((t) => /\bcut\s+\d/i.test(t)) &&
    texts.some((t) => /^[A-Z]\s*[-–]\s*[A-Z]/.test(t.trim()))
  );
}
export function printedStrokeRuns(
  paths: IRPath[],
  styles: Style[],
  curved: boolean,
  consecutive = false,
) {
  const runs: IRPath[][] = [];
  let run: IRPath[] = [];
  for (const p of [...paths].sort(
    (a, b) => a.src.page - b.src.page || a.src.op - b.src.op || a.src.sub - b.src.sub,
  )) {
    const prev = run.at(-1);
    const valid =
      p.pts.length >= 2 &&
      !p.closed &&
      !p.background &&
      !styles[p.style].fill &&
      styles[p.style].widthMm > 0;
    if (
      prev &&
      (!valid ||
        p.src.file !== prev.src.file ||
        p.src.page !== prev.src.page ||
        (consecutive && p.id !== prev.id + 1) ||
        !joinsPrintedStrokes(prev, p, styles, curved))
    ) {
      runs.push(run);
      run = [];
    }
    if (valid) run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}
function rangesFor(d: PrintedCutInput, card: string[], curved: boolean): PrintedCutGroup[][] {
  const contains = curved ? pointInPoly : inside;

  const labels = d.texts.flatMap((t) => {
    const m = rangeText.exec(t.text.trim());
    if (!m) return [];
    const lo = card.indexOf(m[1]),
      hi = card.indexOf(m[2]);
    return lo >= 0 && hi > lo ? [{ t, lo, hi }] : [];
  });
  const eligible = new Set(
    [...new Set(labels.map((l) => l.t.src.page))].filter((page) =>
      isPrintedCutPage(d.texts.filter((t) => t.src.page === page).map((t) => t.text)),
    ),
  );
  if (!eligible.size || new Set(d.paths.map((p) => p.src.file)).size !== 1) return [];
  const roles = new Map<number, Set<string>>();
  for (const g of d.classes) {
    if (g.role !== 'size' || !g.sizeLabel || !g.evidence.some((e) => e.kind === 'legend-sample'))
      continue;
    for (const id of g.chains) {
      if (!curved || !roles.has(id)) roles.set(id, new Set());
      roles.get(id)!.add(g.sizeLabel);
    }
  }
  const edgeCounts = new Map(d.paths.map((p) => [p.id, p.pts.length - 1]));
  const ids = new Map<number, Set<string>>();
  for (const c of d.chains)
    if (roles.get(c.id))
      for (const { path, from, to } of c.ranges) {
        if (from !== 0 || to !== edgeCounts.get(path)) continue;
        if (!ids.has(path)) ids.set(path, new Set());
        for (const size of roles.get(c.id)!) ids.get(path)!.add(size);
      }
  const runs = printedStrokeRuns(d.paths, d.styles, curved);
  // Index run starts on a millimetre grid. Gaps must still pass the native pen and tangent test.
  const buckets = new Map<string, IRPath[][]>(),
    key = (p: PtMm, x = 0, y = 0) => [Math.floor(p.x / 8) + x, Math.floor(p.y / 8) + y].join(',');
  const maxSpace = Math.min(
    8,
    d.styles.reduce((n, style) => Math.max(n, dashSpace(style)), 0),
  );
  for (const r of runs) {
    const k = key(r[0].pts[0]);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  const groups = new Map<number, PrintedCutGroup[]>();
  for (const { t, lo, hi } of labels) {
    if (!eligible.has(t.src.page)) continue;
    const matches = new Map<string, PrintedCutGroup>(),
      reach = Math.ceil((maxSpace + 0.025) / 8);
    for (const r of runs) {
      if (
        !r.some(
          (p) =>
            (!curved || p.src.page === t.src.page) &&
            p.pts.slice(1, -1).some((v) => nearLabel(v, t.bbox)),
        )
      )
        continue;
      const ranks = new Set(
        r.flatMap((p) =>
          [...(ids.get(p.id) ?? [])].filter((s) => card.indexOf(s) >= lo && card.indexOf(s) <= hi),
        ),
      );
      if (!ranks.size) continue;
      let visited = 0;
      function walk(parts: IRPath[][]) {
        if (++visited > 2500) return;
        const last = parts.at(-1)!.at(-1)!;
        if (joinsPrintedStrokes(last, r[0], d.styles, curved)) {
          const outline = (curved ? curvedCut : straightCut)(parts.flat(), ranks, ids);
          if (!outline || !outline.outer.some((p) => nearLabel(p, t.bbox))) return;
          const { outer: ring, paths } = outline;
          const seeds = d.seeds.filter((s) => contains(s.at, ring));
          if (
            seeds.length !== 1 ||
            seeds[0].origin !== 'text' ||
            seeds[0].text?.src.page !== t.src.page ||
            d.texts.some((t) => /placement|template/i.test(t.text) && contains(t.anchor, ring)) ||
            !d.texts.some((t) => /\bcut\s+\d/i.test(t.text) && contains(t.anchor, ring))
          )
            return;
          const fingerprint = JSON.stringify(
            ring.map((p) => [p.x, p.y].map((v) => Math.round(v * 100))),
          );
          matches.set(fingerprint, {
            seed: seeds[0].id,
            name: seeds[0].text.text,
            lo,
            hi,
            outer: ring,
            paths: paths.map((p) => p.id),
            label: t.text,
          });
          return;
        }
        if (parts.length >= 6) return;
        const end = last.pts.at(-1)!;
        for (let x = -reach; x <= reach; x++)
          for (let y = -reach; y <= reach; y++)
            for (const s of buckets.get(key(end, x, y)) ?? []) {
              if (
                parts.includes(s) ||
                s[0].src.file !== r[0].src.file ||
                !joinsPrintedStrokes(last, s[0], d.styles, curved)
              )
                continue;
              walk([...parts, s]);
            }
      }
      walk([r]);
      if (visited > 2500) {
        matches.clear();
        break;
      }
    }
    if (!matches.size || (!curved && matches.size !== 1)) continue;
    const options = [...matches.values()],
      g = options[0];
    if (curved) {
      // Abandon highly ambiguous searches before doing pairwise perimeter comparisons.
      if ((options.length * (options.length - 1)) / 2 > 2500) continue;
      if (
        !options.every(
          (o, i) =>
            o.seed === g.seed &&
            options.slice(0, i).every((other) => samePrintedCurve(other.outer, o.outer)),
        )
      )
        continue;
      g.equivalentCurves = options.length;
    }
    if (!groups.has(g.seed)) groups.set(g.seed, []);
    groups.get(g.seed)!.push(g);
  }
  return [...groups.values()].filter((gs) => {
    gs.sort((a, b) => a.lo - b.lo);
    return (
      gs.length >= 2 &&
      gs[0].lo === 0 &&
      gs.at(-1)!.hi === card.length - 1 &&
      gs.every((g, i) => !i || g.lo === gs[i - 1].hi + 1)
    );
  });
}

/** Read straight and curved printed size groups. Preserve the established polygon for any
 * family whose labels already prove a complete straight-sided partition. */
export function readPrintedCuts(d: PrintedCutInput, card: string[]): PrintedCutGroup[][] {
  const polygons = rangesFor(d, card, false);
  const proven = new Set(polygons.map((g) => g[0].seed));
  return [...polygons, ...rangesFor(d, card, true).filter((g) => !proven.has(g[0].seed))];
}
