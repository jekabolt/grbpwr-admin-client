import type { Chain, LineClass, Feature, NotchFeature, PieceCandidate } from '../types';
import { PATIMPORT } from '../types';
import { type FoldEdge, FOLD_TOL_MM } from './fold';
import { dist, pointInPolygon } from './geom';

/** A notch class touching the end of each size-labelled fold belongs to that size. A larger
 * half may have every smaller size's corner on its own side seam. Looking up the nearest
 * cut there would copy all of those notches into that larger size. */
export function labelledFoldNotches(
  edges: ReadonlyMap<number, FoldEdge>,
  candidates: readonly Pick<PieceCandidate, 'rank' | 'outer'>[],
  set: {
    classes: ReadonlyArray<Pick<LineClass, 'role' | 'chains'>>;
    chains: ReadonlyArray<Pick<Chain, 'id' | 'pts' | 'closed' | 'ranges' | 'lengthMm'>>;
  },
): ((features: Feature[], rank: number) => Feature[]) | null {
  const ids = new Set(set.classes.filter((k) => k.role === 'notch').flatMap((k) => k.chains));
  const ticks = set.chains.filter(
    (ch) =>
      ids.has(ch.id) &&
      !ch.closed &&
      ch.pts.length === 2 &&
      ch.ranges.length &&
      ch.lengthMm >= PATIMPORT.notchMinMm &&
      ch.lengthMm <= PATIMPORT.notchMaxMm,
  );
  const paths = new Set<number>();
  const assigned = new Map<number, NotchFeature[]>();
  for (const end of ['a', 'b'] as const) {
    const series: NotchFeature[] = [];
    for (const c of candidates) {
      const edge = edges.get(c.rank);
      if (!edge) break;
      const at = edge[end];
      const matches = ticks.filter((ch) => ch.pts.some((p) => dist(p, at) < FOLD_TOL_MM));
      if (matches.length !== 1) break;
      const [ch] = matches;
      const tip = dist(ch.pts[0], at) < dist(ch.pts[1], at) ? ch.pts[1] : ch.pts[0];
      if (!pointInPolygon(tip, c.outer)) break;
      // All marks in the series are the same translated stroke on the same fold endpoint.
      const first = series[0];
      if (
        first &&
        Math.hypot(
          tip.x - at.x - first.seg[1].x + first.at.x,
          tip.y - at.y - first.seg[1].y + first.at.y,
        ) > FOLD_TOL_MM
      )
        break;
      series.push({
        kind: 'notch',
        origin: 'detected',
        at,
        seg: [at, tip],
        depthMm: dist(at, tip),
        ranges: ch.ranges,
        confidence: 1,
      });
    }
    if (series.length !== candidates.length) continue;
    const seriesPaths = series.flatMap((n) => n.ranges.map((r) => r.path));
    if (new Set(seriesPaths).size !== seriesPaths.length) continue;
    series.forEach((n, i) => {
      for (const r of n.ranges) paths.add(r.path);
      const rank = candidates[i].rank;
      assigned.set(rank, [...(assigned.get(rank) ?? []), n]);
    });
  }
  if (!paths.size) return null;
  return (features, rank) => [
    ...features.filter(
      (f) =>
        !(
          f.kind === 'notch' &&
          f.origin === 'detected' &&
          f.ranges.length &&
          f.ranges.every((r) => paths.has(r.path))
        ),
    ),
    ...(assigned.get(rank) ?? []),
  ];
}
