// pieces · UXHOOKS (D3) — no piece closes across a missing page accepted as blank.
//
// A hole (`Sheet.holes`, assemble/holes.ts) is a tile cell nobody printed: every line that runs
// into it is cut at the neighbour's edge. Whatever closes such a piece there — a tile frame left as
// a wall, a continuity / derived closure, the region running through the hole into the next
// piece — closes it across geometry the file does not carry. So after the fill (and the
// operator's piece edits) every CLOSED candidate is held to the holes:
//   cut-line      one of its wall chains ends inside the hole's paper (grown by 1 mm): a line of
//                 its outline is cut by the hole;
//   through-hole  its outline runs into the part of the cell no page covers.
// Such a candidate goes back to the leak it is (`leakAt` on the cut, `hole` says why) — the pieces
// step asks as for any leak. An outline the operator closed himself near the hole (an operator
// bridge within 10 mm of the cell) is his answer and stays.
import type {
  BoxMm,
  ChainSet,
  PieceCandidate,
  PieceFamily,
  PtMm,
  SheetHole,
} from 'lib/pattern-import/types';

import { HOLE_END_TOL_MM } from 'lib/pattern-import/assemble/holes';

/** An operator bridge this close to a hole's paper is the operator closing that piece (mm). */
const OPERATOR_NEAR_MM = 10;

const grow = (b: BoxMm, m: number): BoxMm => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});
const inBox = (b: BoxMm, p: PtMm) =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/** A point of segment ab inside box b (Liang–Barsky clip), or null. */
function segInBox(a: PtMm, c: PtMm, b: BoxMm): PtMm | null {
  let t0 = 0;
  let t1 = 1;
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - b.minX],
    [dx, b.maxX - a.x],
    [-dy, a.y - b.minY],
    [dy, b.maxY - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  const t = (t0 + t1) / 2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Per hole, the chains that end inside its paper (the lines it cuts), with the ends. */
export function holeCuts(
  set: Pick<ChainSet, 'chains'>,
  holes: readonly SheetHole[],
): { hole: SheetHole; ends: Map<number, PtMm[]> }[] {
  return holes.map((hole) => {
    const zone = grow(hole.box, HOLE_END_TOL_MM);
    const ends = new Map<number, PtMm[]>();
    for (const c of set.chains) {
      if (c.closed || c.pts.length < 2) continue;
      for (const v of [c.pts[0], c.pts[c.pts.length - 1]])
        if (inBox(zone, v)) ends.set(c.id, [...(ends.get(c.id) ?? []), v]);
    }
    return { hole, ends };
  });
}

/** Chains ending inside each hole (the manifest's `chainEnds`). */
export const holeChainEnds = (set: Pick<ChainSet, 'chains'>, holes: readonly SheetHole[]) =>
  holeCuts(set, holes).map((h) => [...h.ends.values()].reduce((n, e) => n + e.length, 0));

const centroid = (pts: readonly PtMm[]) => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, pts.length), y: y / Math.max(1, pts.length) };
};

/** Why this closed candidate must not close across one of the holes (null = it may). */
export function holeHit(
  c: Pick<PieceCandidate, 'outcome' | 'outer' | 'walls' | 'derived'>,
  cuts: ReturnType<typeof holeCuts>,
): { hole: SheetHole; why: 'cut-line' | 'through-hole'; at: PtMm } | null {
  if (c.outcome !== 'closed' || c.outer.length < 3) return null;
  for (const { hole, ends } of cuts) {
    const near = grow(hole.box, OPERATOR_NEAR_MM);
    if (c.derived?.some((d) => d.kind === 'operator-bridge' && d.pts.some((p) => inBox(near, p))))
      continue;
    const cut = c.walls.filter((id) => ends.has(id));
    if (cut.length) {
      const m = centroid(c.outer);
      let at = ends.get(cut[0])![0];
      let bd = Infinity;
      for (const id of cut)
        for (const v of ends.get(id)!) {
          const d = Math.hypot(v.x - m.x, v.y - m.y);
          if (d < bd) {
            bd = d;
            at = v;
          }
        }
      return { hole, why: 'cut-line', at };
    }
    if (hole.open) {
      // every outline edge (the closing one too), not only its vertices: a long straight edge
      // may cross the uncovered part with both ends outside it
      const deep = grow(hole.open, -0.5);
      if (deep.minX < deep.maxX && deep.minY < deep.maxY) {
        const n = c.outer.length;
        for (let k = 0; k < n; k++) {
          const at = segInBox(c.outer[k], c.outer[(k + 1) % n], deep);
          if (at) return { hole, why: 'through-hole', at };
        }
      }
    }
  }
  return null;
}

/**
 * The families with every candidate that closes across a hole turned back into a leak. Families
 * untouched by any hole are returned as they were (same objects).
 */
export function holeGuard(
  families: PieceFamily[],
  set: Pick<ChainSet, 'chains'>,
  holes: readonly SheetHole[] | undefined,
): PieceFamily[] {
  if (!holes?.length) return families;
  const cuts = holeCuts(set, holes);
  return families.map((f) => {
    let changed = false;
    const candidates = f.candidates.map((c) => {
      const hit = holeHit(c, cuts);
      if (!hit) return c;
      changed = true;
      const out: PieceCandidate = {
        seed: c.seed,
        rank: c.rank,
        outer: [],
        walls: [],
        inside: [],
        textsInside: [],
        outcome: 'leak',
        areaMm2: 0,
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        sourceCoverage: 0,
        p95Mm: 0,
        ...(c.rankFrom ? { rankFrom: c.rankFrom } : {}),
        leakAt: hit.at,
        hole: {
          sheet: hit.hole.sheet,
          row: hit.hole.row,
          col: hit.hole.col,
          why: hit.why,
          was: c.outcome,
          areaMm2: c.areaMm2,
        },
      };
      return out;
    });
    return changed ? { ...f, candidates } : f;
  });
}
