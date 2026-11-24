import type { ChainSet, PieceCandidate, Seed, Sheet, SizeRun } from 'lib/pattern-import/types';
import { bboxOf, pointInPoly, signedArea, segNearest } from './geom';
import { readLegendPolygons } from './legend-polygons';
import { readPrintedCuts } from './printed-cut-ranges';

/** Apply source-supported printed cuts to candidates still leaking after grade repair. */
export function applyPrintedCuts(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  cands: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
  operatorExcluded: ReadonlySet<number> = excluded,
) {
  const data = { ...sheet, classes: set.classes, chains: set.chains, seeds };
  const sizes = run.sizes.map((s) => s.label);
  const groups = [...readPrintedCuts(data, sizes), ...readLegendPolygons(data, sizes, cands)];
  for (const group of groups)
    for (const g of group) {
      const leaks = cands
        .get(g.seed)
        ?.filter((c) => c.outcome === 'leak' && !c.hole && c.rank >= g.lo && c.rank <= g.hi);
      if (!leaks?.length) continue;
      const paths = new Set(g.paths);
      const confirming = new Set(g.polygonSource?.confirmationPaths);
      // A repeated, explicitly closed PDF boundary can be rectangular enough to have been
      // set aside as a frame by flood geometry. This reader has independently confirmed
      // both complete legend pens and every previously closed size in the piece.
      const veto = g.confirmedClosedPaths ? operatorExcluded : excluded;
      if (
        confirming.size &&
        set.chains.some((ch) => veto.has(ch.id) && ch.ranges.some((r) => confirming.has(r.path)))
      )
        continue;
      const touched = set.chains.filter((c) => c.ranges.some((r) => paths.has(r.path)));
      if (touched.some((c) => veto.has(c.id))) continue;
      const walls = touched.filter((c) => c.ranges.every((r) => paths.has(r.path)));
      if (!walls.length) continue;
      const wallIds = new Set(walls.map((c) => c.id));
      const outer = g.outer,
        bbox = bboxOf(outer);
      const inside = set.chains
        .filter(
          (c) =>
            !wallIds.has(c.id) &&
            c.pts.length > 1 &&
            c.pts.every(
              (p) =>
                p.x >= bbox.minX &&
                p.x <= bbox.maxX &&
                p.y >= bbox.minY &&
                p.y <= bbox.maxY &&
                pointInPoly(p, outer),
            ),
        )
        .map((c) => c.id);
      const textsInside = sheet.texts
        .filter((t) =>
          pointInPoly(
            { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
            outer,
          ),
        )
        .map((t) => t.id);
      const distances = outer
        .map((p) => {
          let nearest = Infinity;
          for (const c of walls)
            for (let i = 1; i < c.pts.length; i++)
              nearest = Math.min(nearest, segNearest(p, c.pts[i - 1], c.pts[i]).d);
          return nearest;
        })
        .sort((a, b) => a - b);
      for (const c of leaks) {
        Object.assign(c, {
          outer,
          walls: [...wallIds],
          inside,
          textsInside,
          bbox,
          areaMm2: Math.abs(signedArea(outer)),
          rankFrom: g.polygonSource
            ? g.polygonSource.reference === g.label
              ? 'legend-polygon'
              : 'shared-polygon'
            : 'printed-range',
          ...(g.polygonSource ? { polygonSource: g.polygonSource } : {}),
          outcome: 'closed',
          derived: [],
          sourceCoverage: 1,
          p95Mm: distances[Math.ceil(0.95 * distances.length) - 1],
        });
        delete c.leakAt;
        delete c.repair;
        delete c.gradeHint;
        delete c.gradeRefusal;
        delete c.gradeTryWhy;
        if (c.nest?.state === 'refused') c.nest = { ...c.nest, state: 'unchecked' };
      }
    }
}
