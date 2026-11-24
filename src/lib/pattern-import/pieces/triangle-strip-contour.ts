// A keyed chain can stop at a tile seam even though the same triangle pen continues on
// the adjoining tile. Follow the original paint order, retaining every size-assigned strip.
import type { ChainSet, IRPath, PieceCandidate, PtMm, Seed, Sheet, SizeRun } from '../types';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
import { bboxOf, dist, pointInPoly, segNearest, signedArea, simplify } from './geom';
import { readTriangleRing, triangleLegend, triangleStamp } from './triangle-mark-loop';

type Mark = { p: IRPath; at: PtMm; own: boolean };
function printedCycle(marks: Mark[], pitch: number) {
  const strips: Mark[][] = [];
  for (const m of marks) {
    let strip = strips.at(-1);
    const last = strip?.at(-1);
    if (
      !strip ||
      !last ||
      m.p.src.page !== last.p.src.page ||
      m.p.src.op - last.p.src.op > 16 ||
      dist(m.at, last.at) > 1.55 * pitch
    ) {
      strip = [];
      strips.push(strip);
    }
    strip.push(m);
  }
  const eligible = strips.filter((strip) => strip.some((m) => m.own) || strip.length >= 3);
  const start = eligible.findIndex((strip) => strip.some((m) => m.own));
  if (start < 0) return;
  const links = eligible.map((s) =>
    eligible.flatMap((r, i) => (dist(s.at(-1)!.at, r[0].at) <= 1.55 * pitch ? [i] : [])),
  );
  let i = start;
  const seen = new Set<number>(),
    chosen: Mark[] = [];
  while (!seen.has(i)) {
    seen.add(i);
    chosen.push(...eligible[i]);
    if (links[i].length !== 1) return;
    i = links[i][0];
    if (links.filter((m) => m.includes(i)).length !== 1) return;
  }
  if (i !== start || eligible.some((r, j) => !seen.has(j) && r.some((m) => m.own))) return;
  return chosen;
}

export function restoreTriangleStripContours(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  cells: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
  measure: (candidate: PieceCandidate, paths: ReadonlySet<number>) => void,
) {
  if (
    excluded.size ||
    sheet.missing.length ||
    sheet.holes?.length ||
    set.assigned?.length ||
    new Set(sheet.poses.map((p) => p.file)).size !== 1
  )
    return;
  for (const size of run.sizes) {
    const pending = seeds.flatMap((seed) => {
      const f = cells.get(seed.id),
        c = f?.find((q) => q.rank === size.rank);
      if (!f || c?.outcome !== 'leak' || c.hole) return [];
      const lo = f.find((q) => q.rank === size.rank - 1),
        hi = f.find((q) => q.rank === size.rank + 1);
      return lo?.outcome === 'closed' && hi?.outcome === 'closed' ? [{ seed, f, c, lo, hi }] : [];
    });
    if (!pending.length) continue;
    const pen = triangleLegend(sheet, set, run, size.rank);
    if (
      !pen ||
      pen.sampleMarks.filter((p) => p.visibleMotif && !p.background).length <
        pen.sampleMarks.length * 0.8 ||
      pen.cls.evidence.some(
        (e) => e.kind === 'legend-sample' && (e.nestingOnly || e.label !== size.label),
      )
    )
      continue;
    const { pitch, width, height, cls } = pen;
    const paper = sheet.paths.filter((p) => {
      const style = pen.styles.get(p.style);
      return (
        p.visibleMotif &&
        !p.background &&
        p.closed &&
        style?.fill &&
        style.layer === pen.penStyle.layer &&
        style.strokeRgb?.join() === pen.penStyle.strokeRgb?.join()
      );
    });
    const normal = new Set(
      paper.filter((p) => p.pts.length === 3 && triangleStamp(p, width, height)).map((p) => p.id),
    );
    for (const { seed, f, c, lo, hi } of pending) {
      const bounds = bboxOf([...lo.outer, ...hi.outer]);
      const nearby = (p: PtMm) =>
        p.x >= bounds.minX - pitch &&
        p.x <= bounds.maxX + pitch &&
        p.y >= bounds.minY - pitch &&
        p.y <= bounds.maxY + pitch;
      const walls = cls.chains.filter((id) => {
        const ch = set.chains[id];
        return !ch.closed && ch.ranges.length >= 6 && ch.pts.every(nearby);
      });
      if (!walls.length) continue;
      const own = new Set(walls.flatMap((id) => set.chains[id].ranges.map((r) => r.path)));
      const marks: Mark[] = [];
      for (const p of paper) {
        if (!own.has(p.id) && !normal.has(p.id)) continue;
        const b = bboxOf(p.pts),
          at = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
        if (nearby(at)) marks.push({ p, at, own: own.has(p.id) });
      }
      if (marks.filter((m) => m.own).length !== own.size) continue;
      marks.sort((a, b) => a.p.src.page - b.p.src.page || a.p.src.op - b.p.src.op);
      const cycle = printedCycle(marks, pitch);
      if (!cycle || cycle.length < 40 || own.size < cycle.length * 0.75) continue;
      const ring = readTriangleRing(
        cycle.map((m) => m.p),
        pitch,
        width,
        height,
      );
      if (!ring || ringSelfIntersects(ring)) continue;
      if (signedArea(ring) < 0) ring.reverse();
      const outer = simplify([...ring, ring[0]], 0.02).slice(0, -1);
      const areaMm2 = signedArea(outer);
      if (
        areaMm2 <= lo.areaMm2 ||
        areaMm2 >= hi.areaMm2 ||
        ringSelfIntersects(outer) ||
        !pointInPoly(seed.at, outer) ||
        seeds.some((s) => s !== seed && pointInPoly(s.at, outer))
      )
        continue;
      const offset = cycle.flatMap((m) => {
        const axis = triangleStamp(m.p, width, height);
        return axis
          ? [
              Math.min(
                ...outer.map((p, i) => segNearest(axis.p, p, outer[(i + 1) % outer.length]).d),
              ),
            ]
          : [];
      });
      if (offset.length < cycle.length * 0.9 || offset.some((d) => d > 0.15)) continue;
      const next: PieceCandidate = {
        ...c,
        outer,
        bbox: bboxOf(outer),
        areaMm2,
        walls,
        rankFrom: 'printed-motif',
        outcome: 'closed',
        printedMotif: { key: pen.sampleMarks.map((p) => p.id), paths: cycle.map((m) => m.p.id) },
      };
      delete next.gradeHint;
      delete next.gradeRefusal;
      delete next.gradeDetail;
      delete next.nest;
      delete next.leakAt;
      measure(next, new Set(next.printedMotif!.paths));
      f[f.indexOf(c)] = next;
    }
  }
}
