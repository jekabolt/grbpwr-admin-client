import type { ChainSet, IRPath, PieceCandidate, PtMm, Seed, Sheet, SizeRun, Style } from '../types';
import { bboxOf, dist, pointInPoly, segIntersect, segNearest, signedArea } from './geom';
import { selfIntersects } from './gfit/checks';
import { fullyVisibleSourcePath } from './source-visibility';

type Mark = { points: PtMm[]; ids: number[]; turn: boolean; mask?: PtMm[] };
function along(a: PtMm, b: PtMm, c: PtMm, d: PtMm) {
  return ((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y)) / (dist(a, b) * dist(c, d));
}
function edgeDistance(q: PtMm, poly: PtMm[]) {
  return Math.min(...poly.map((a, i) => segNearest(q, a, poly[(i + 1) % poly.length]).d));
}
/** Two clipped impressions meet on a common mask seam. At an acute tip one
 * stroke can extend beyond the seam, or be clipped down to its cap. */
export function splitTurns(paths: IRPath[], styles: Style[]) {
  const turns: Mark[] = [];
  for (let i = 0; i < paths.length; i++)
    for (const b of paths.slice(i + 1)) {
      const a = paths[i],
        ma = styles[a.style].clipPolygon!,
        mb = styles[b.style].clipPolygon!;
      if (a.src.page !== b.src.page || a.style === b.style || dist(ma[0], mb[0]) > 22) continue;
      const points: PtMm[] = [];
      for (let j = 0; j < ma.length; j++) {
        const u = ma[j],
          v = ma[(j + 1) % ma.length];
        if (
          !mb.some(
            (x, k) =>
              dist(u, x) < 0.012 &&
              [mb[(k + 1) % mb.length], mb[(k + mb.length - 1) % mb.length]].some(
                (y) => dist(y, v) < 0.012,
              ),
          )
        )
          continue;
        const hits = (p: IRPath) =>
          p.pts.flatMap((x, k) => {
            const cross = k ? segIntersect(p.pts[k - 1], x, u, v) : null;
            if (cross) return [cross.p];
            const near = segNearest(x, u, v);
            return near.d < 0.006 ? [near.q] : [];
          });
        for (const x of hits(a))
          for (const y of hits(b)) {
            if (dist(x, y) > 0.012) continue;
            const q = { x: (x.x + y.x) / 2, y: (x.y + y.y) / 2 };
            if (points.every((p) => dist(p, q) > 0.012)) points.push(q);
          }
      }
      if (points.length === 1)
        turns.push({ points, ids: [a.id, b.id], turn: true, mask: [...ma, ...mb] });
    }
  return turns;
}

type PrintedGap = { pts: PtMm[]; ids: number[]; turn: boolean };
function penAxis(p: IRPath, fraction: number) {
  const a = p.pts[0],
    b = p.pts.at(-1)!,
    l = dist(a, b);
  if (!l || p.pts.length < 3) return;
  const nx = (a.y - b.y) / l,
    ny = (b.x - a.x) / l,
    tip = p.pts.at(-2)!;
  const h = ((tip.x - a.x) * nx + (tip.y - a.y) * ny) * fraction;
  return { a: { x: a.x + h * nx, y: a.y + h * ny }, b: { x: b.x + h * nx, y: b.y + h * ny } };
}
export function printedGaps(body: IRPath[], glyphs: IRPath[], sample: IRPath[], pitch: number) {
  const out = new Map<string, PrintedGap>();
  const first = sample.find((p) => !p.closed),
    print = sample.find((p) => p.closed);
  if (!first || !print) return out;
  const base = penAxis(print, 0),
    raised = penAxis(print, 1);
  if (!base || !raised) return out;
  const dx = raised.a.x - base.a.x,
    dy = raised.a.y - base.a.y;
  const fraction =
    ((first.pts[0].x - base.a.x) * dx + (first.pts[0].y - base.a.y) * dy) / (dx * dx + dy * dy);
  if (!(fraction > 0 && fraction < 1)) return out;
  const marks = [...body, ...glyphs].sort((a, b) => a.src.page - b.src.page || a.src.op - b.src.op);
  for (let i = 0; i + 3 < marks.length; i++) {
    const [a, f, g, b] = marks.slice(i, i + 4);
    if (a.closed || b.closed || !f.closed || !g.closed || a.src.page !== b.src.page) continue;
    const p = a.pts.at(-2)!,
      q = a.pts.at(-1)!,
      next = b.pts[0];
    if (dist(q, next) > pitch) continue;
    if (along(p, q, next, b.pts[1]) > 0.97) {
      const pair = [f, g].map((mark) => {
        const v = penAxis(mark, fraction);
        if (
          !v ||
          along(q, next, v.a, v.b) < 0.98 ||
          Math.abs(dist(v.a, v.b) / dist(base.a, base.b) - 1) > 0.22
        )
          return;
        const mid = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 },
          nearest = segNearest(mid, q, next);
        if (nearest.d < 0.12 && nearest.u > 0.05 && nearest.u < 0.95) return { mid, t: nearest.u };
      });
      const [x, y] = pair;
      if (x && y && y.t - x.t > 0.2)
        out.set(a.id + ',' + b.id, { pts: [x.mid, y.mid], ids: [f.id, g.id], turn: false });
      continue;
    }
    const witnesses = [f, g].map((x) => {
      const v = penAxis(x, fraction);
      if (!v || along(v.a, v.b, next, b.pts[1]) < 0.99) return;
      const u = { x: q.x - p.x, y: q.y - p.y },
        w = { x: v.b.x - v.a.x, y: v.b.y - v.a.y };
      const den = u.x * w.y - u.y * w.x;
      if (!den) return;
      const t = ((v.a.x - q.x) * w.y - (v.a.y - q.y) * w.x) / den;
      const at = { x: q.x + t * u.x, y: q.y + t * u.y };
      if (
        t < 0 ||
        dist(at, q) > pitch / 2 ||
        along(at, v.b, v.a, v.b) < 0.98 ||
        dist(at, next) > pitch
      )
        return;
      return { at, mid: { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 } };
    });
    const [x, y] = witnesses;
    if (x && y && dist(x.at, y.at) < 0.035 && dist(x.at, x.mid) < dist(x.at, y.mid))
      out.set(a.id + ',' + b.id, { pts: [x.at, x.mid, y.mid], ids: [f.id, g.id], turn: true });
  }
  return out;
}
/** Both directions of the printed sequence must agree. Isolated dart marks
 * cannot extend a side; a second compatible predecessor or successor vetoes it. */
export function stampedCycle(
  body: IRPath[],
  turns: Mark[],
  length: number,
  pitch: number,
  gaps = new Map<string, PrintedGap>(),
) {
  if (turns.length < 3) return;
  const marks: Mark[] = [
    ...turns,
    ...body.map((p) => ({ points: p.pts, ids: [p.id], turn: false })),
  ];
  const edges = marks.map((a, i) =>
    marks.flatMap((b, j) => {
      if (i === j || (a.turn && b.turn)) return [];
      const p = a.points.at(-1)!,
        q = b.points[0],
        d = dist(p, q);
      if (d <= 0) return [];
      if (!a.turn && !b.turn) {
        const scale = (dist(a.points[0], p) + dist(q, b.points.at(-1)!)) / (2 * length);
        if (Math.abs(d / (scale * (pitch - length)) - 1) > 0.12) return [];
      } else {
        const turn = a.turn ? a : b,
          tip = turn.points[0],
          end = a.turn ? q : p;
        const ux = (end.x - tip.x) / d,
          uy = (end.y - tip.y) / d;
        const reach = turn.mask
          ? Math.max(...turn.mask.map((v) => (v.x - tip.x) * ux + (v.y - tip.y) * uy)) +
            (pitch - length) * 1.25
          : 1.25 * pitch;
        if (d > reach || d > 2.1 * pitch) return [];
      }
      if (gaps.get(a.ids[0] + ',' + b.ids[0])?.turn) return [j];
      if (!a.turn && along(a.points.at(-2)!, p, p, q) < 0.975) return [];
      if (!b.turn && along(p, q, q, b.points[1]) < 0.975) return [];
      return [j];
    }),
  );
  // A turn joins the free ends of printed runs. A mark with its regular
  // predecessor or successor already present cannot be skipped at a corner.
  const regularIncoming = new Set(
    edges
      .slice(turns.length)
      .flat()
      .filter((j) => !marks[j].turn),
  );
  for (let i = 0; i < edges.length; i++) {
    if (marks[i].turn) edges[i] = edges[i].filter((j) => !regularIncoming.has(j));
    else if (edges[i].some((j) => !marks[j].turn))
      edges[i] = edges[i].filter((j) => !marks[j].turn);
  }
  const incoming = marks.map(() => 0);
  for (const e of edges) for (const j of e) incoming[j]++;
  const seen = new Set<number>(),
    pts: PtMm[] = [],
    ids: number[] = [];
  let k = 0;
  while (!seen.has(k)) {
    if (edges[k].length !== 1 || incoming[k] !== 1) return;
    seen.add(k);
    pts.push(...marks[k].points);
    ids.push(...marks[k].ids);
    const j = edges[k][0],
      bend = gaps.get(marks[k].ids[0] + ',' + marks[j].ids[0]);
    if (bend) {
      pts.push(...bend.pts);
      ids.push(...bend.ids);
    }
    k = j;
  }
  if (k !== 0 || turns.some((_, i) => !seen.has(i)) || selfIntersects(pts)) return;
  return { pts, ids };
}
function matchesDash(a: Style, b: Style) {
  return (
    a.dash &&
    b.dash &&
    a.dash.length === b.dash.length &&
    a.widthMm === b.widthMm &&
    a.dash.every((v, i) => Math.abs(v / a.dash![0] - b.dash![i] / b.dash![0]) < 0.015)
  );
}
function operations(p: IRPath) {
  return [p.src, ...(p.paintCopies ?? []).map((c) => c.src)];
}
export function restoreBracketedStamps(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  groups: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
  measure: (c: PieceCandidate, paths: ReadonlySet<number>) => void,
) {
  if (sheet.missing.length || sheet.holes?.length || sheet.refused?.length || set.assigned?.length)
    return;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const owners = new Map<number, Set<number>>();
  for (const chain of set.chains)
    for (const r of chain.ranges) {
      const ids = owners.get(r.path) ?? new Set<number>();
      ids.add(chain.id);
      owners.set(r.path, ids);
    }
  const keys = run.sizes.map((size) => {
    const ev = set.classes
      .find((c) => c.id === size.classId)
      ?.evidence.filter((e) => e.kind === 'legend-sample');
    if (ev?.length !== 1 || ev[0].kind !== 'legend-sample' || excluded.has(ev[0].chain)) return;
    return {
      chain: ev[0].chain,
      paths: set.chains[ev[0].chain].ranges.flatMap((r) => paths.get(r.path) ?? []),
    };
  });
  const witness = (c: PieceCandidate, rank: number, seed: Seed) => {
    const key = keys[rank]?.paths[0];
    if (!key) return;
    const hits = c.walls.flatMap((id) => {
      const ch = set.chains[id];
      if (!ch || excluded.has(id) || ch.ranges.length !== 1) return [];
      const p = paths.get(ch.ranges[0].path);
      return p &&
        fullyVisibleSourcePath(p) &&
        matchesDash(sheet.styles[p.style], sheet.styles[key.style]) &&
        pointInPoly(seed.at, p.pts)
        ? [{ p, id }]
        : [];
    });
    if (hits.length === 1) return hits[0];
  };
  for (const seed of seeds) {
    const family = groups.get(seed.id);
    if (!family) continue;
    for (let rank = 1; rank < run.sizes.length - 1; rank++) {
      const c = family[rank],
        lo = family[rank - 1],
        hi = family[rank + 1];
      if (
        !c ||
        [lo, c, hi].some((v) => v?.outcome !== 'closed') ||
        !c.walls.some((id) => lo.walls.includes(id))
      )
        continue;
      const key = keys[rank]?.paths;
      if (!key?.length) continue;
      const bars = key.filter((p) => !p.closed);
      if (
        bars.length < 3 ||
        key.length !== 3 * bars.length ||
        bars.some((p) => p.pts.length !== 2 || sheet.styles[p.style].dash) ||
        key.some((p) => p.closed && !sheet.styles[p.style].fill)
      )
        continue;
      bars.sort((a, b) => a.src.op - b.src.op);
      const length = dist(bars[0].pts[0], bars[0].pts[1]),
        pitch = dist(bars[0].pts[0], bars[1].pts[0]);
      if (
        !length ||
        pitch <= length ||
        bars.slice(1).some((p, i) => Math.abs(dist(p.pts[0], bars[i].pts[0]) / pitch - 1) > 0.06)
      )
        continue;
      const a = witness(lo, rank - 1, seed),
        b = witness(hi, rank + 1, seed);
      if (
        !a ||
        !b ||
        !lo.walls.some((id) => id !== a.id && c.walls.includes(id)) ||
        !c.walls.includes(a.id) ||
        a.p.src.file !== b.p.src.file
      )
        continue;
      const spans = new Map<number, [number, number]>();
      for (const start of operations(a.p)) {
        const end = operations(b.p).find(
          (s) => s.page === start.page && s.file === start.file && s.op > start.op,
        );
        if (end) spans.set(start.page, [start.op, end.op]);
      }
      const pen = sheet.styles[bars[0].style],
        body: IRPath[] = [],
        masked: IRPath[] = [],
        glyphs: IRPath[] = [];
      for (const p of sheet.paths) {
        if (
          p.background ||
          p.src.file !== a.p.src.file ||
          p.pts.length < 2 ||
          Array.from(owners.get(p.id) ?? []).some((id) => excluded.has(id))
        )
          continue;
        const span = spans.get(p.src.page),
          st = sheet.styles[p.style];
        if (
          !span ||
          p.src.op <= span[0] ||
          p.src.op >= span[1] ||
          st.dash ||
          (!st.fill && st.widthMm !== pen.widthMm) ||
          st.layer !== pen.layer ||
          String(st.strokeRgb) !== String(pen.strokeRgb)
        )
          continue;
        if (edgeDistance(p.pts[0], a.p.pts) > pitch || edgeDistance(p.pts[0], b.p.pts) > pitch)
          continue;
        if (p.closed) {
          if (st.fill && !st.clipPolygon) glyphs.push(p);
          continue;
        }
        if (st.fill) continue;
        if (st.clipPolygon) masked.push(p);
        else if (Math.abs(dist(p.pts[0], p.pts.at(-1)!) / length - 1) < 0.23) body.push(p);
      }
      const loop = stampedCycle(
        body,
        splitTurns(masked, sheet.styles),
        length,
        pitch,
        printedGaps(body, glyphs, key, pitch),
      );
      if (
        !loop ||
        !pointInPoly(seed.at, loop.pts) ||
        seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, loop.pts))
      )
        continue;
      const apply = (target: PieceCandidate, pts: PtMm[], ids: number[], walls: number[]) => {
        const area = signedArea(pts);
        target.outer = area < 0 ? pts.slice().reverse() : pts.slice();
        target.areaMm2 = Math.abs(area);
        target.bbox = bboxOf(pts);
        target.walls = walls;
        target.derived = [];
        delete target.repair;
        measure(target, new Set(ids));
      };
      apply(c, loop.pts, loop.ids, [
        ...new Set(loop.ids.flatMap((id) => Array.from(owners.get(id) ?? []))),
      ]);
      c.stampedBand = { paths: loop.ids, brackets: [a.p.id, b.p.id] };
      // A fully visible lower outline has its own keyed stroke. Drop the
      // stamped rank's corner only when that very operation polluted its cut.
      if (lo.walls.some((id) => id !== a.id && c.walls.includes(id))) {
        apply(lo, a.p.pts, [a.p.id], [a.id]);
        lo.sourceOutline = {
          path: a.p.id,
          key: keys[rank - 1]!.chain,
        };
      }
    }
  }
}
