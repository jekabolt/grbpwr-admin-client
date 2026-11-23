import type { ChainSet, PieceCandidate, Seed, Sheet, SizeRun } from '../types';
import { dashPanelLoops } from './dash-panel';
import { bboxOf, dist, pointInPoly, segNearest, signedArea } from './geom';

/** At a shared straight side several flood faces can contain the label. The
 * unique closed loop of this rank's own rings determines the entire cut. */
export function restoreRingPanels(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  candidates: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  for (const size of run.sizes) {
    const cls = set.classes.find((c) => c.id === size.classId);
    const panels = cls?.chains
      .map((id) => set.chains[id])
      .filter((c) => c.ringBoundary && !excluded.has(c.id));
    if (!panels?.length) continue;
    const smallerClass = set.classes.find(
      (cls) => cls.id === run.sizes.find((s) => s.rank === size.rank - 1)?.classId,
    );
    const loops = smallerClass && dashPanelLoops(sheet, set, smallerClass, excluded);
    for (const seed of seeds) {
      const family = candidates.get(seed.id);
      const c = family?.find((c) => c.rank === size.rank),
        lower = family?.find((c) => c.rank === size.rank - 1);
      if (c?.outcome !== 'closed' || lower?.outcome !== 'closed' || c.derived?.length) continue;
      const matches = panels.filter((ch) => pointInPoly(seed.at, ch.ringBoundary!.pts));
      if (matches.length !== 1) continue;
      const ch = matches[0];
      if (seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, ch.ringBoundary!.pts))) continue;
      const [a, b] = ch.ringBoundary!.side;
      const near = lower.outer.filter((p) => segNearest(p, a, b).d < 0.1);
      if (!near.some((p) => near.some((q) => dist(p, q) > 0.5 * dist(a, b)))) continue;
      const pts = ch.ringBoundary!.pts.slice(),
        area = signedArea(pts);
      c.outer = area < 0 ? pts.reverse() : pts;
      c.areaMm2 = Math.abs(area);
      c.bbox = bboxOf(c.outer);
      c.walls = [ch.id];
      c.rankFrom = 'class';
      c.sourceCoverage = 1;
      c.p95Mm = 0;
      if (!loops || lower.derived?.length) continue;
      const owned = loops.filter(
        (loop) =>
          loop.walls.some((w) => lower.walls.includes(w)) &&
          pointInPoly(seed.at, loop.pts) &&
          !seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, loop.pts)) &&
          loop.pts.some((p, i) => {
            const q = loop.pts[(i + 1) % loop.pts.length];
            return (
              dist(p, q) > 0.5 * dist(a, b) &&
              segNearest(p, a, b).d < 0.1 &&
              segNearest(q, a, b).d < 0.1
            );
          }),
      );
      if (owned.length !== 1) continue;
      const loop = owned[0],
        signed = signedArea(loop.pts);
      lower.outer = signed < 0 ? loop.pts.slice().reverse() : loop.pts;
      lower.walls = signed < 0 ? loop.walls.slice().reverse() : loop.walls;
      lower.areaMm2 = Math.abs(signed);
      lower.bbox = bboxOf(lower.outer);
      lower.rankFrom = 'class';
      lower.sourceCoverage = 1;
      lower.p95Mm = 0;
    }
  }
}
