// WHERE A UNIT'S NAME SITS. The name box goes inside its biggest piece, clear of every outline
// (its own and the pieces lying on it) and never on another piece; one that fits nowhere inside
// goes under the unit.
// Pure: picture-space points in, one centre out.

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { insideRing, spotInside } from './step-picture';

type Box = { x0: number; y0: number; x1: number; y1: number };

const boxOf = (ring: readonly Pt2[]): Box => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};

const meets = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Liang–Barsky: does segment a→b touch the box? */
function segmentHitsBox(a: Pt2, b: Pt2, box: Box): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const tests: [number, number][] = [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dy, a[1] - box.y0],
    [dy, box.y1 - a[1]],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

const ringHitsBox = (ring: readonly Pt2[], box: Box) =>
  ring.some((a, i) => segmentHitsBox(a, ring[(i + 1) % ring.length], box));

/**
 * The centre of a `w`×`h` name box inside `ring`, crossing no outline of `ring` or `blockers`,
 * nearest the ring's own safe spot. None fits → centred under `unit` (the whole unit's box).
 */
export function nameSpot(
  ring: readonly Pt2[],
  blockers: readonly (readonly Pt2[])[],
  w: number,
  h: number,
  unit: readonly Pt2[] = ring,
): Pt2 {
  const b = boxOf(ring);
  const safe = spotInside(ring);
  const near = blockers.filter((other) => meets(boxOf(other), b));
  const fits = (c: Pt2) => {
    const box = { x0: c[0] - w / 2, y0: c[1] - h / 2, x1: c[0] + w / 2, y1: c[1] + h / 2 };
    if (box.x0 < b.x0 || box.x1 > b.x1 || box.y0 < b.y0 || box.y1 > b.y1) return false;
    if (!insideRing(c, ring)) return false;
    if (ringHitsBox(ring, box)) return false;
    return !near.some(
      (other) => insideRing(c, other) || (meets(boxOf(other), box) && ringHitsBox(other, box)),
    );
  };
  if (fits(safe)) return safe;
  const stepX = Math.max(2, (b.x1 - b.x0) / 24);
  const stepY = Math.max(2, h / 2);
  let best: Pt2 | null = null;
  let bestDistance = Infinity;
  for (let y = b.y0 + h / 2; y <= b.y1 - h / 2; y += stepY)
    for (let x = b.x0 + w / 2; x <= b.x1 - w / 2; x += stepX) {
      const distance = Math.hypot(x - safe[0], y - safe[1]);
      if (distance < bestDistance && fits([x, y])) {
        best = [x, y];
        bestDistance = distance;
      }
    }
  if (best) return best;
  const u = boxOf(unit);
  return [(u.x0 + u.x1) / 2, u.y1 + h / 2 + 2];
}
