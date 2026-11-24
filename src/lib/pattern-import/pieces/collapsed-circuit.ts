import type { PtMm } from 'lib/pattern-import/types';

import { bboxOf, dist, resample, SegGrid, segNearest } from './geom';
import type { WallItem } from './snap';

/** The two joins can project onto the same copy of a closed wall's seam after an entire
 * revolution. Restore that wall only if the flood traced it in full, in both directions of
 * the distance check, and no second closed wall fits the same trace. */
export function collapsedCircuit(
  raster: PtMm[],
  walls: WallItem[],
  item: number,
  forward: boolean,
  stepMm: number,
  reachMm: number,
): PtMm[] | undefined {
  const within = (points: PtMm[], ring: PtMm[]): boolean => {
    const grid = new SegGrid(4);
    grid.addPolyline(0, ring, true);
    const near = (p: PtMm) => {
      let found = false;
      grid.near(p, reachMm, (_k, i) => {
        if (!found && segNearest(p, ring[i], ring[(i + 1) % ring.length]).d <= reachMm)
          found = true;
      });
      return found;
    };
    return points.every(near) && resample(points, stepMm, true).every(near);
  };
  const traceBox = bboxOf(raster);
  const matches = (wall: WallItem) => {
    if (!wall.closed || wall.chain < 0 || wall.pts.length < 3) return false;
    const box = bboxOf(wall.pts);
    if (
      Math.abs(traceBox.minX - box.minX) > reachMm ||
      Math.abs(traceBox.minY - box.minY) > reachMm ||
      Math.abs(traceBox.maxX - box.maxX) > reachMm ||
      Math.abs(traceBox.maxY - box.maxY) > reachMm
    )
      return false;
    return within(raster, wall.pts) && within(wall.pts, raster);
  };
  if (!matches(walls[item]) || walls.some((wall, i) => i !== item && matches(wall))) return;
  const ring = [...walls[item].pts];
  if (dist(ring[0], ring[ring.length - 1]) < 1e-6) ring.pop();
  return forward ? ring : ring.reverse();
}
