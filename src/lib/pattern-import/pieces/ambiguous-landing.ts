import { PATIMPORT, type ChainSet, type PtMm } from '../types';
import { overlayAt, OVERLAY_MIN_PENS, type OverlayLines } from '../sizes/overlay';
import { dist, resample, SegGrid, segNearest } from './geom';

/** An own line first borrowed a stretch, then arrived at two incompatible onward cuts. */
export type AmbiguousLanding = {
  owner: number;
  from: PtMm;
  junction: PtMm;
  walkedMm: number;
  reachMm: number;
};

/** If another fill still joins the same endpoints, verify that section against the source pens. */
export function unsupportedLanding(
  outer: PtMm[],
  walls: number[],
  refused: AmbiguousLanding[],
  rank: number,
  overlay: OverlayLines | null,
  set: ChainSet,
  ownAndCommon: number[],
): PtMm | undefined {
  const relevant = refused.filter((t) => walls.includes(t.owner));
  if (!relevant.length) return;
  const pts = resample(outer, PATIMPORT.snapMm, true);
  if (pts.length < 3) return;
  const index = new SegGrid(4);
  for (const id of ownAndCommon) {
    const c = set.chains[id];
    if (c) index.addPolyline(id, c.pts, c.closed);
  }
  const closest = (p: PtMm) => {
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (dist(p, pts[i]) < dist(p, pts[best])) best = i;
    return best;
  };
  for (const t of relevant) {
    const from = closest(t.from),
      to = closest(t.junction);
    if (from === to || dist(pts[from], t.from) > t.reachMm || dist(pts[to], t.junction) > t.reachMm)
      continue;
    const forward = (to - from + pts.length) % pts.length,
      back = pts.length - forward;
    // The known length selects which side of the ring connects the disputed endpoints.
    const step = PATIMPORT.snapMm;
    const dir =
      Math.abs(forward * step - t.walkedMm) <= Math.abs(back * step - t.walkedMm) ? 1 : -1;
    let seen = 0,
      supported = 0;
    for (let i = from; i !== to; i = (i + dir + pts.length) % pts.length) {
      const p = pts[i];
      let own = false;
      index.near(p, step, (id, j) => {
        const ch = set.chains[id];
        if (segNearest(p, ch.pts[j], ch.pts[(j + 1) % ch.pts.length]).d <= step) own = true;
      });
      seen++;
      if (own) {
        supported++;
        continue;
      }
      const q = pts[(i + dir + pts.length) % pts.length],
        l = dist(p, q);
      if (
        l &&
        overlay &&
        overlayAt(p, { x: (q.x - p.x) / l, y: (q.y - p.y) / l }, overlay, rank).ranks.size >=
          OVERLAY_MIN_PENS
      )
        supported++;
    }
    if (supported < seen * PATIMPORT.coverageBlock) return t.from;
  }
}
