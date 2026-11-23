import type { ChainSet, IRPath, PieceCandidate, PtMm, Seed, Sheet, SizeRun, Style } from '../types';
import { stampedPanel } from './stamped-panel';
import { bboxOf, dist, pointInPoly, segNearest, signedArea } from './geom';

type Stroke = { path: IRPath; gap: number; wall: number };
const head = (p: IRPath) => p.pts[0];
const tail = (p: IRPath) => p.pts[p.pts.length - 1];
function facing(a: PtMm, b: PtMm, c: PtMm, d: PtMm) {
  const u = dist(a, b) * dist(c, d);
  return u > 0 && ((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y)) / u > 0.85;
}
function gapAgrees(a: Stroke, b: Stroke) {
  const p = a.path,
    q = b.path,
    u = tail(p),
    v = head(q),
    gap = dist(u, v);
  if (!a.gap && !b.gap) return false;
  const expected = a.gap ? a.gap / 2 : b.gap;
  if (Math.abs(gap / expected - 1) > 0.08) return false;
  return facing(p.pts[p.pts.length - 2], u, u, v) && facing(u, v, v, q.pts[1]);
}
/** Keep a directed loop only when every painted path has a unique predecessor and successor. */
export function phaseLoops(strokes: Stroke[]) {
  const edges = new Map<Stroke, Stroke[]>(),
    ins = new Map<Stroke, number>();
  for (const a of strokes) {
    const options = strokes.filter((b) => a !== b && gapAgrees(a, b));
    edges.set(a, options);
    for (const b of options) ins.set(b, (ins.get(b) ?? 0) + 1);
  }
  const seen = new Set<Stroke>(),
    loops: Stroke[][] = [];
  for (const first of strokes) {
    let p = first;
    const cycle: Stroke[] = [];
    while (!seen.has(p)) {
      seen.add(p);
      const next = edges.get(p)!;
      if (next.length !== 1 || ins.get(p) !== 1) break;
      cycle.push(p);
      p = next[0];
      if (p === first) {
        if (cycle.length >= 6) loops.push(cycle);
        break;
      }
    }
  }
  return loops;
}
function matches(style: Style, sample: Style) {
  const d = style.dash,
    r = sample.dash!;
  return (
    d &&
    (d.length === 2 || d.length === 4) &&
    d.every(
      (x, i) => Math.abs(x / r[i % 2] - 1) < 0.27 && Math.abs(x / d[1] - r[i % 2] / r[1]) < 0.025,
    )
  );
}
export function restoreFoldPanels(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  groups: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
  measure: (candidate: PieceCandidate, paths: ReadonlySet<number>) => void,
) {
  const ignored = new Set(set.classes.filter((c) => c.role === 'ignore').flatMap((c) => c.chains));
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  for (const seed of seeds) {
    const family = groups.get(seed.id);
    if (!family?.length || family.some((c) => c.outcome !== 'closed')) continue;
    if (
      !sheet.texts.some(
        (t) => /^fold$/i.test(t.text.trim()) && pointInPoly(t.anchor, family[0].outer),
      )
    )
      continue;
    const big = family.at(-1)!.bbox;
    const local: Stroke[] = [];
    const owners = new Map<number, number>();
    const veto = new Set<number>();
    for (const ch of set.chains)
      for (const r of ch.ranges) {
        if (excluded.has(ch.id)) veto.add(r.path);
        else owners.set(r.path, ch.id);
      }
    for (const p of sheet.paths) {
      if (p.background || p.pts.length < 2 || veto.has(p.id)) continue;
      const mid = p.pts[Math.floor(p.pts.length / 2)];
      if (
        mid.x < big.minX - 8 ||
        mid.x > big.maxX + 8 ||
        mid.y < big.minY - 8 ||
        mid.y > big.maxY + 8
      )
        continue;
      local.push({ path: p, gap: 0, wall: owners.get(p.id) ?? -1 });
    }
    const unresolved: { candidate: PieceCandidate; alternatives: PtMm[]; ids: number[] }[] = [];
    let proved = 0;
    for (const c of family) {
      if (!c.walls.some((w) => ignored.has(w))) continue;
      const cls = set.classes.find((cl) => cl.id === run.sizes[c.rank].classId);
      const key = cls?.evidence.find((e) => e.kind === 'legend-sample');
      if (key?.kind !== 'legend-sample') continue;
      const sample = paths.get(set.chains[key.chain]?.ranges[0]?.path);
      if (!sample) continue;
      const pen = sheet.styles[sample.style],
        r = pen.dash;
      if (!r && cls) {
        const neighbor = (rank: number) => {
          const evidence = set.classes
            .find((k) => k.id === run.sizes[rank]?.classId)
            ?.evidence.find((e) => e.kind === 'legend-sample');
          const p =
            evidence?.kind === 'legend-sample' &&
            paths.get(set.chains[evidence.chain].ranges[0]?.path);
          return p ? sheet.styles[p.style] : undefined;
        };
        let l = c.rank - 1,
          h = c.rank + 1;
        while (l >= 0 && !neighbor(l)?.dash) l--;
        while (h < run.sizes.length && !neighbor(h)?.dash) h++;
        const lower = neighbor(l),
          upper = neighbor(h);
        if (!lower?.dash || !upper?.dash) continue;
        const marks = set.chains[key.chain].ranges.flatMap((r) => paths.get(r.path) ?? []);
        const hit = stampedPanel(
          local.map((s) => s.path),
          sheet.styles,
          marks,
          lower,
          upper,
          c.outer,
          sheet.paths,
        );
        if (hit && 'alternatives' in hit) {
          unresolved.push({ candidate: c, ...hit });
          continue;
        }
        if (
          !hit ||
          !pointInPoly(seed.at, hit.pts) ||
          seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, hit.pts))
        )
          continue;
        const signed = signedArea(hit.pts);
        c.outer = signed < 0 ? hit.pts.reverse() : hit.pts;
        c.walls = Array.from(new Set(hit.ids.flatMap((id) => owners.get(id) ?? [])));
        c.bbox = bboxOf(c.outer);
        c.areaMm2 = Math.abs(signed);

        c.rankFrom = 'class';
        delete c.derived;
        delete c.repair;
        c.foldPanelPaths = hit.ids;
        measure(c, new Set(hit.ids));
        proved++;
        continue;
      }
      if (!r || (r.length !== 2 && !(r.length === 4 && r[0] === r[2] && r[1] === r[3]))) continue;
      const strokes: Stroke[] = [];
      const used = new Set<number>();
      for (const s of local) {
        const p = s.path,
          style = sheet.styles[p.style];
        if (
          p.closed ||
          used.has(p.id) ||
          p.src.file !== sample.src.file ||
          style.fill ||
          style.layer !== pen.layer ||
          style.widthMm !== pen.widthMm ||
          String(style.strokeRgb) !== String(pen.strokeRgb)
        )
          continue;
        if (matches(style, pen)) s.gap = style.dash![1];
        else if (!style.dash?.length && p.pts.length >= 3 && dist(head(p), tail(p)) < 1.6 * r[0])
          s.gap = 0;
        else continue;
        used.add(p.id);
        strokes.push(s);
      }
      const cycles = phaseLoops(strokes).filter((q) => {
        const pts = q.flatMap((s) => s.path.pts);
        return (
          pointInPoly(seed.at, pts) &&
          !seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, pts)) &&
          q.some((s) => c.walls.includes(s.wall)) &&
          pts.every((p) =>
            c.outer.some((a, i) => segNearest(p, a, c.outer[(i + 1) % c.outer.length]).d < 3),
          )
        );
      });
      if (cycles.length !== 1) continue;
      const cycle = cycles[0],
        pts = cycle.flatMap((s) => s.path.pts),
        area = signedArea(pts);
      c.outer = area < 0 ? pts.reverse() : pts;
      c.walls = Array.from(
        new Set((area < 0 ? cycle.reverse() : cycle).map((s) => s.wall).filter((id) => id >= 0)),
      );
      c.bbox = bboxOf(c.outer);
      c.areaMm2 = Math.abs(area);

      c.rankFrom = 'class';
      c.foldPanelPaths = cycle.map((s) => s.path.id);
      delete c.derived;
      delete c.repair;
      measure(c, new Set(c.foldPanelPaths));
      proved++;
    }
    if (proved >= 2)
      for (const { candidate: c, ids, alternatives } of unresolved) {
        family[family.indexOf(c)] = {
          seed: c.seed,
          rank: c.rank,
          outcome: 'refused',
          gradeRefusal: 'grade-ambiguous',
          rankFrom: 'class',
          outer: [],
          walls: [],
          inside: [],
          textsInside: [],
          bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          areaMm2: 0,
          sourceCoverage: 0,
          p95Mm: 0,
          foldPanelPaths: ids,
          foldPanelAlternatives: alternatives,
        };
      }
  }
}
