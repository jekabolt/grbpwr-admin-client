// Loop chaining: garment CAD frequently exports a piece boundary as loose LINE/ARC/SPLINE
// fragments. Open chains are greedily stitched end-to-end (either end, reversing as
// needed) while endpoints fall within tolChain; a residual gap < 5·tolChain closes with a
// straight segment, anything wider is dropped with a warning.
import type { Pt } from '../types';
import { dist } from '../geom/polygon';
import type { LayeredChain } from './transform';

export type ClosedLoop = { pts: Pt[]; layer: string };

export function chainLoops(
  chains: LayeredChain[],
  tolChain: number,
  warnings: string[],
): { loops: ClosedLoop[]; openDropped: number } {
  const loops: ClosedLoop[] = [];
  const open: LayeredChain[] = [];

  for (const c of chains) {
    if (c.closed && c.pts.length >= 3) loops.push({ pts: c.pts, layer: c.layer });
    else if (!c.closed) open.push(c);
  }

  const used = new Array<boolean>(open.length).fill(false);
  const closeTol = tolChain * 5;
  let openDropped = 0;

  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = [...open[i].pts];
    const layer = open[i].layer;

    // Greedy growth from the tail. Among ALL candidates within tolerance the NEAREST
    // endpoint wins — first-match takes the wrong branch at a Y junction and the piece
    // dies later as an unclosable loop.
    let grew = true;
    while (grew) {
      grew = false;
      const tail = pts[pts.length - 1];
      let bestJ = -1;
      let bestRev = false;
      let bestD = Infinity;
      for (let j = 0; j < open.length; j++) {
        if (used[j]) continue;
        const cand = open[j].pts;
        const dHead = dist(tail, cand[0]);
        if (dHead <= tolChain && dHead < bestD) {
          bestD = dHead;
          bestJ = j;
          bestRev = false;
        }
        const dTail = dist(tail, cand[cand.length - 1]);
        if (dTail <= tolChain && dTail < bestD) {
          bestD = dTail;
          bestJ = j;
          bestRev = true;
        }
      }
      if (bestJ < 0) break;
      const cand = open[bestJ].pts;
      pts = pts.concat(bestRev ? [...cand].reverse().slice(1) : cand.slice(1));
      used[bestJ] = true;
      grew = true;
      // Closed the loop? Stop growing.
      if (pts.length >= 3 && dist(pts[0], pts[pts.length - 1]) <= tolChain) break;
    }

    if (pts.length < 3) {
      openDropped++;
      continue;
    }
    const gap = dist(pts[0], pts[pts.length - 1]);
    if (gap <= closeTol) {
      // Snap shut; drop the duplicate endpoint when it exactly re-hits the start.
      if (gap <= tolChain) pts.pop();
      loops.push({ pts, layer });
    } else {
      openDropped++;
    }
  }

  if (openDropped > 0) {
    warnings.push(`${openDropped} open contours dropped (grainlines, notches, markings)`);
  }
  return { loops, openDropped };
}
