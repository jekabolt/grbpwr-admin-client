import {
  PATIMPORT,
  type ChainSet,
  type IRPath,
  type PieceCandidate,
  type PtMm,
  type Seed,
  type Sheet,
  type SizeRun,
} from '../types';
import { bboxOf, dist, pointInPoly, quantile, resample, segNearest, signedArea } from './geom';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
import { insideWithin, ringDistance } from './gfit/checks';

function centroid(pts: PtMm[]): PtMm | undefined {
  let sum = 0,
    x = 0,
    y = 0;
  const o = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i],
      b = pts[i + 1],
      ax = a.x - o.x,
      ay = a.y - o.y,
      bx = b.x - o.x,
      by = b.y - o.y;
    const w = ax * by - ay * bx;
    x += (ax + bx) * w;
    y += (ay + by) * w;
    sum += w;
  }
  if (Math.abs(sum) > 1e-12) return { x: o.x + x / (3 * sum), y: o.y + y / (3 * sum) };
}

const reach = 4.5; // maximum keyed fragment pitch used by size recovery
/** Only reciprocal links, with a unique straight continuation for a deficient endpoint.
 * Every visible mark must belong to the same simple cycle. */
export function maskedMarkLoop(paths: IRPath[]) {
  if (!paths.some((p) => p.visibleFill?.length === 0) || !paths.some((p) => p.visibleFill?.length))
    return;
  const ink = paths.filter((p) => p.visibleFill?.length !== 0);
  const pts: PtMm[] = [];
  for (const p of ink) {
    const pt = centroid(p.visibleFill ?? p.pts);
    if (!pt) return;
    pts.push(pt);
  }
  if (pts.length < 6) return;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => x + ',' + y;
  for (const [i, p] of pts.entries()) {
    const k = key(Math.floor(p.x / reach), Math.floor(p.y / reach));
    const group = grid.get(k) ?? [];
    group.push(i);
    grid.set(k, group);
  }
  const near = pts.map((p, i) => {
    const x0 = Math.floor(p.x / reach),
      y0 = Math.floor(p.y / reach),
      items: { j: number; d: number }[] = [];
    for (let x = x0 - 1; x <= x0 + 1; x++)
      for (let y = y0 - 1; y <= y0 + 1; y++)
        for (const j of grid.get(key(x, y)) ?? []) {
          const d = dist(p, pts[j]);
          if (j !== i && d <= reach) items.push({ j, d });
        }
    return items.sort((a, b) => a.d - b.d);
  });
  if (near.some((l) => l.length < 2 || l[0].d < 1e-6 || (l[2] && l[2].d - l[1].d < 1e-6))) return;
  const links = near.map((l, i) =>
    l
      .slice(0, 2)
      .map((v) => v.j)
      .filter((j) => near[j].slice(0, 2).some((v) => v.j === i)),
  );
  if (links.some((l) => !l.length)) return;
  const ports = links.map((l) => l.length === 1);
  const faces = (i: number, j: number) => {
    const a = pts[links[i][0]],
      b = pts[i],
      c = pts[j];
    return (
      ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (dist(a, b) * dist(b, c)) > 0.96
    );
  };
  const mates = ports.map((port, i) =>
    port
      ? near[i]
          .filter(({ j }) => ports[j] && j !== links[i][0] && faces(i, j) && faces(j, i))
          .map((v) => v.j)
      : [],
  );
  for (let i = 0; i < ports.length; i++)
    if (ports[i]) {
      if (mates[i].length !== 1 || mates[mates[i][0]].length !== 1) return;
      links[i].push(mates[i][0]);
    }
  const order: number[] = [],
    seen = new Set<number>();
  let prev = -1,
    cur = 0;
  while (!seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    const next = links[cur].find((j) => j !== prev)!;
    prev = cur;
    cur = next;
  }
  if (cur !== 0 || order.length !== pts.length) return;
  const outer: PtMm[] = [];
  const at = (i: number) => order[(i + order.length) % order.length];
  for (let i = 0; i < order.length; i++) {
    outer.push(pts[at(i)]);
    if (!ink[at(i)].visibleFill?.length || !ink[at(i + 1)].visibleFill?.length) continue;
    // Only add a corner where both printed limbs meet within both clipped marks.
    const a = pts[at(i - 2)],
      b = pts[at(i - 1)],
      c = pts[at(i + 2)],
      d = pts[at(i + 3)];
    const ux = b.x - a.x,
      uy = b.y - a.y,
      vx = d.x - c.x,
      vy = d.y - c.y,
      det = ux * vy - uy * vx;
    if (Math.abs(det) < 0.35 * dist(a, b) * dist(c, d)) continue;
    const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det;
    const q = { x: a.x + t * ux, y: a.y + t * uy };
    const onInk = (k: number) => {
      const ring = ink[at(k)].visibleFill!;
      return (
        pointInPoly(q, ring) ||
        ring.some((p, j) => segNearest(q, p, ring[(j + 1) % ring.length]).d <= PATIMPORT.sagittaMm)
      );
    };
    if (onInk(i) && onInk(i + 1)) outer.push(q);
  }
  if (ringSelfIntersects(outer)) return;
  if (signedArea(outer) < 0) outer.reverse();
  return { outer, ink };
}

export function restoreMaskedMarkLoops(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  cands: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  if (!sheet.paths.some((p) => p.visibleFill?.length === 0)) return;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  for (const row of set.classes) {
    if (
      row.role !== 'size' ||
      set.classes.some((r) => r !== row && r.role === 'size' && r.sizeLabel === row.sizeLabel) ||
      !row.evidence.some((e) => e.kind === 'legend-sample' && e.label === row.sizeLabel)
    )
      continue;
    const rank = run.sizes.findIndex((s) => s.label === row.sizeLabel);
    const pending = seeds.filter((s) =>
      cands.get(s.id)?.some((c) => c.rank === rank && c.outcome === 'leak' && !c.hole),
    );
    if (!pending.length) continue;
    const options = new Map<
      number,
      { wall: number; loop: NonNullable<ReturnType<typeof maskedMarkLoop>>; errs: number[] }[]
    >();
    for (const id of row.chains) {
      const ch = set.chains[id];
      if (
        excluded.has(id) ||
        !ch?.motif?.length ||
        ch.closed ||
        ch.ranges.length < 6 ||
        dist(ch.pts[0], ch.pts[ch.pts.length - 1]) > reach
      )
        continue;
      if (set.classes.some((r) => r !== row && r.chains.includes(id))) continue;
      const marks: IRPath[] = [];
      for (const r of ch.ranges) {
        const p = paths.get(r.path),
          s = p && sheet.styles[p.style];
        if (
          !p?.closed ||
          p.background ||
          p.unknownFill ||
          !s?.fill ||
          s.widthMm !== 0 ||
          r.from !== 0 ||
          r.to !== p.pts.length
        )
          break;
        marks.push(p);
      }
      if (marks.length !== ch.ranges.length || new Set(marks).size !== marks.length) continue;
      const loop = maskedMarkLoop(marks);
      if (!loop) continue;
      const owners = seeds.filter((s) => pointInPoly(s.at, loop.outer));
      if (owners.length !== 1 || !pending.includes(owners[0])) continue;
      const seed = owners[0],
        cells = cands.get(seed.id)!;
      const a = cells.find((c) => c.rank === rank - 1),
        b = cells.find((c) => c.rank === rank + 1);
      const area = signedArea(loop.outer);
      if (
        a?.outcome !== 'closed' ||
        b?.outcome !== 'closed' ||
        area <= a.areaMm2 ||
        area >= b.areaMm2 ||
        !insideWithin(resample(a.outer, 0.5, true), loop.outer) ||
        !insideWithin(resample(loop.outer, 0.5, true), b.outer)
      )
        continue;
      // Agreement with the originally identified pen, including its dashed closing interval.
      const measure = ringDistance(ch.pts);
      const errs = resample(loop.outer, 0.5, true).map((p) => measure(p));
      if (errs.filter((d) => d <= PATIMPORT.snapMm).length < PATIMPORT.coverageBlock * errs.length)
        continue;
      if (quantile(errs, 0.95) > PATIMPORT.hausdorffP95VectorMm) continue;
      const matches = options.get(seed.id) ?? [];
      matches.push({ wall: id, loop, errs });
      options.set(seed.id, matches);
    }
    for (const [seed, matches] of options) {
      if (matches.length !== 1) continue;
      const { wall, loop, errs } = matches[0],
        c = cands.get(seed)!.find((v) => v.rank === rank)!;
      const { outer } = loop,
        bbox = bboxOf(outer);
      const contains = (p: PtMm) =>
        p.x >= bbox.minX &&
        p.x <= bbox.maxX &&
        p.y >= bbox.minY &&
        p.y <= bbox.maxY &&
        pointInPoly(p, outer);
      Object.assign(c, {
        outer,
        bbox,
        areaMm2: signedArea(outer),
        walls: [wall],
        outcome: 'closed',
        rankFrom: 'class',
        p95Mm: quantile(errs, 0.95),
        sourceCoverage: errs.filter((d) => d <= PATIMPORT.snapMm).length / errs.length,
        visibleMarks: loop.ink.map((p) => p.id),
        inside: set.chains
          .filter((ch) => ch.id !== wall && ch.pts.length > 1 && ch.pts.every(contains))
          .map((ch) => ch.id),
        textsInside: sheet.texts.filter((t) => contains(t.anchor)).map((t) => t.id),
      });
      delete c.leakAt;
      delete c.gradeRefusal;
      delete c.gradeHint;
      delete c.gradeDetail;
      delete c.nest;
    }
  }
}
