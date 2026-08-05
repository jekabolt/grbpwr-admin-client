// Bottom-left-with-length-priority placement of one GA individual (SVGnest's scoring:
// resulting marker length first, then lowest y, then lowest x — pure BL staircases).
//
// Frame: strip along +X (practically unbounded — Lmax is a safe upper bound so length
// never causes a miss), fabric width along +Y ∈ [0, W]. The inner-fit region of a piece
// is an analytic rectangle (the bin is a rectangle), so only piece-piece NFPs matter.
// Gap is pre-baked: NFPs come from gap-inflated contours; the IFP uses the ORIGINAL
// bounds inset by edgeMargin, keeping selvedge clearance independent of gap.
//
// NO boolean geometry runs here. The previous implementation subtracted every placed
// neighbour's NFP from the IFP with one Clipper.Difference per gene; at 20+ neighbours
// that call was both the wall-clock wall (seconds per generation) and — worse — clipper2
// occasionally returned a region vertex DEEP INSIDE a forbidden zone (measured: a real
// 0.011 cm² piece overlap on a 20-instance marker). Instead, the optimum is found over
// an explicit candidate set and every candidate is verified with exact integer winding
// tests against each neighbour's NFP:
//   - the four IFP corners;
//   - every translated NFP boundary vertex (clamped-out if outside the IFP);
//   - every intersection of an NFP boundary with the four IFP border lines.
// The optimum of (len, y, x) over the true feasible region sits at one of its vertices;
// region vertices are IFP corners, NFP vertices, NFP×IFP-edge and NFP×NFP intersections.
// The last class (wedged-between-two-pieces points) is deliberately skipped for cost —
// measured on the benchmark set it changes used length by <1% while tripling placement
// time. A candidate that fails the winding test is simply skipped, so correctness never
// depends on candidate completeness — only quality does.
import type { Placement, RotationDeg } from '../types';
import { SCALE } from '../geom/clipper';
import type { NfpCache, NfpPaths, PreparedPiece } from './nfp';

export type Gene = {
  piece: PreparedPiece;
  instance: number;
  rot: RotationDeg;
  // Rotations in which this piece fits the fabric width — the GA mutates within this set.
  allowedRots: readonly RotationDeg[];
};

export type PlacedGene = Gene & { x: number; y: number };

export type PlacementResult = {
  placements: Placement[];
  usedLengthCm: number;
};

type Neighbour = { nfp: NfpPaths; ox: number; oy: number };

// Point-vs-region (NonZero winding over the region's paths), in the region's own frame.
// Returns true when the point is STRICTLY inside — on-boundary is contact, which is legal.
function strictlyInside(nfp: NfpPaths, px: number, py: number): boolean {
  let w = 0;
  for (let pi = 0; pi < nfp.paths.length; pi++) {
    const b = nfp.boxes[pi];
    // A closed loop cannot wind around a point outside its bbox.
    if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) continue;
    const path = nfp.paths[pi];
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const a = path[i];
      const d = path[(i + 1) % n];
      const cross = (d.x - a.x) * (py - a.y) - (px - a.x) * (d.y - a.y);
      if (
        cross === 0 &&
        px >= Math.min(a.x, d.x) &&
        px <= Math.max(a.x, d.x) &&
        py >= Math.min(a.y, d.y) &&
        py <= Math.max(a.y, d.y)
      ) {
        return false; // exactly on a boundary — contact, allowed
      }
      if (a.y <= py) {
        if (d.y > py && cross > 0) w++;
      } else if (d.y <= py && cross < 0) w--;
    }
  }
  return w !== 0;
}

function feasible(neighbours: readonly Neighbour[], cx: number, cy: number): boolean {
  for (const nb of neighbours) {
    if (strictlyInside(nb.nfp, cx - nb.ox, cy - nb.oy)) return false;
  }
  return true;
}

// Intersections of segment (a→d, translated by ox/oy) with the vertical line x=X inside
// [y0,y1], and with the horizontal line y=Y inside [x0,x1] — candidate generators for the
// IFP border. Rounded to int; a rounding nudge into a forbidden region only loses that
// one candidate (the winding test rejects it), never correctness.
function addLineHits(
  out: number[],
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  xLo: number,
  xHi: number,
  yLo: number,
  yHi: number,
): void {
  const sx = dx - ax;
  const sy = dy - ay;
  if (sx !== 0) {
    for (const X of [xLo, xHi]) {
      const t = (X - ax) / sx;
      if (t >= 0 && t <= 1) {
        const y = Math.round(ay + t * sy);
        if (y >= yLo && y <= yHi) out.push(X, y);
      }
    }
  }
  if (sy !== 0) {
    for (const Y of [yLo, yHi]) {
      const t = (Y - ay) / sy;
      if (t >= 0 && t <= 1) {
        const x = Math.round(ax + t * sx);
        if (x >= xLo && x <= xHi) out.push(x, Y);
      }
    }
  }
}

// Best position for one gene against fixed neighbours: the (len, y, x)-minimal candidate
// that passes every winding test. Coordinates are int units; returns null when no
// candidate is feasible (caller falls back to the frontier).
function bestPositionFor(
  g: Gene,
  neighbours: readonly Neighbour[],
  xLo: number,
  xHi: number,
  yLo: number,
  yHi: number,
  usedLength: number,
  bMaxX: number,
  marginInt: number,
): { x: number; y: number; len: number } | null {
  // Candidate coordinate pairs, flat [x0,y0, x1,y1, …].
  const cands: number[] = [xLo, yLo, xHi, yLo, xLo, yHi, xHi, yHi];
  for (const nb of neighbours) {
    for (const path of nb.nfp.paths) {
      const n = path.length;
      for (let i = 0; i < n; i++) {
        const vx = path[i].x + nb.ox;
        const vy = path[i].y + nb.oy;
        if (vx >= xLo && vx <= xHi && vy >= yLo && vy <= yHi) cands.push(vx, vy);
        const w = path[(i + 1) % n];
        addLineHits(cands, vx, vy, w.x + nb.ox, w.y + nb.oy, xLo, xHi, yLo, yHi);
      }
    }
  }

  // Order-defining score, packed for a numeric sort: len is the dominant key; y and x
  // break ties. Sorting index pairs keeps the flat layout allocation-light.
  const count = cands.length / 2;
  const idx: number[] = new Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  const lenOf = (i: number): number => Math.max(usedLength, cands[2 * i] + bMaxX + marginInt);
  idx.sort((i, j) => {
    const li = lenOf(i);
    const lj = lenOf(j);
    if (li !== lj) return li - lj;
    const yi = cands[2 * i + 1];
    const yj = cands[2 * j + 1];
    if (yi !== yj) return yi - yj;
    return cands[2 * i] - cands[2 * j];
  });

  let prevX = NaN;
  let prevY = NaN;
  for (const i of idx) {
    const cx = cands[2 * i];
    const cy = cands[2 * i + 1];
    if (cx === prevX && cy === prevY) continue; // sorted duplicates are adjacent
    prevX = cx;
    prevY = cy;
    if (feasible(neighbours, cx, cy)) return { x: cx, y: cy, len: lenOf(i) };
  }
  return null;
}

// `abort` is polled per gene; a true return DISCARDS the individual (null) — a partial
// placement would score shorter than a full one and win the GA with a fake marker.
export function placeOrder(
  genes: readonly Gene[],
  fabricWidthCm: number,
  edgeMarginCm: number,
  lMaxCm: number,
  nfps: NfpCache,
  abort?: () => boolean,
): PlacementResult | null {
  const placed: PlacedGene[] = [];
  let usedLength = 0; // int units
  const m = Math.round(edgeMarginCm * SCALE);
  const W = Math.round(fabricWidthCm * SCALE);
  const L = Math.round(lMaxCm * SCALE);

  for (const g of genes) {
    if (abort?.()) return null;
    const b = g.piece.boundsAt[g.rot];
    const bMinX = Math.round(b.minX * SCALE);
    const bMaxX = Math.round(b.maxX * SCALE);
    const bMinY = Math.round(b.minY * SCALE);
    const bMaxY = Math.round(b.maxY * SCALE);
    const xLo = m - bMinX;
    const xHi = L - m - bMaxX;
    const yLo = m - bMinY;
    const yHi = W - m - bMaxY;
    if (yLo > yHi || xLo > xHi) continue; // cannot fit the width in this rotation — prep filters these

    const neighbours: Neighbour[] = placed.map((q) => ({
      nfp: nfps.get(q.piece, q.rot, g.piece, g.rot),
      ox: q.x,
      oy: q.y,
    }));

    const best = bestPositionFor(g, neighbours, xLo, xHi, yLo, yHi, usedLength, bMaxX, m);

    // The Lmax bound makes a candidate feasible in practice; a numeric fluke falls back
    // to the frontier so the individual still evaluates.
    const x = best ? best.x : usedLength + m - bMinX;
    const y = best ? best.y : yLo;
    placed.push({ ...g, x, y });
    usedLength = Math.max(usedLength, x + bMaxX + m);
  }

  return toResult(placed, usedLength);
}

function toResult(placed: readonly PlacedGene[], usedLength: number): PlacementResult {
  return {
    placements: placed.map((p) => ({
      pieceId: p.piece.id,
      instance: p.instance,
      rot: p.rot,
      x: p.x / SCALE,
      y: p.y / SCALE,
    })),
    usedLengthCm: usedLength / SCALE,
  };
}

// Deterministic post-GA compaction: re-place each piece (x-ascending order) against ALL
// other pieces held fixed, accepting a strictly better (len, y, x). Holes that opened
// after a piece was originally placed get filled; repeats until a pass moves nothing,
// the pass cap is hit, or the deadline passes. Pure integer math, same candidate
// machinery as placement — the result stays verified-overlap-free by construction.
export function compactPlacements(
  genes: readonly PlacedGene[],
  fabricWidthCm: number,
  edgeMarginCm: number,
  lMaxCm: number,
  nfps: NfpCache,
  deadlineMs: number,
  maxPasses = 3,
): PlacementResult {
  const m = Math.round(edgeMarginCm * SCALE);
  const W = Math.round(fabricWidthCm * SCALE);
  const L = Math.round(lMaxCm * SCALE);
  const work = genes.map((g) => ({ ...g }));

  const extent = (p: PlacedGene): number => p.x + Math.round(p.piece.boundsAt[p.rot].maxX * SCALE) + m;

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    const order = work.map((_, i) => i).sort((i, j) => work[i].x - work[j].x || i - j);
    for (const i of order) {
      if (Date.now() > deadlineMs) return finish();
      const g = work[i];
      const b = g.piece.boundsAt[g.rot];
      const bMinX = Math.round(b.minX * SCALE);
      const bMaxX = Math.round(b.maxX * SCALE);
      const bMinY = Math.round(b.minY * SCALE);
      const bMaxY = Math.round(b.maxY * SCALE);
      const xLo = m - bMinX;
      const xHi = L - m - bMaxX;
      const yLo = m - bMinY;
      const yHi = W - m - bMaxY;
      if (yLo > yHi || xLo > xHi) continue;

      let othersLen = 0;
      const neighbours: Neighbour[] = [];
      for (let j = 0; j < work.length; j++) {
        if (j === i) continue;
        const q = work[j];
        othersLen = Math.max(othersLen, extent(q));
        neighbours.push({ nfp: nfps.get(q.piece, q.rot, g.piece, g.rot), ox: q.x, oy: q.y });
      }

      const cur = {
        len: Math.max(othersLen, g.x + bMaxX + m),
        y: g.y,
        x: g.x,
      };
      const best = bestPositionFor(g, neighbours, xLo, xHi, yLo, yHi, othersLen, bMaxX, m);
      if (!best) continue;
      const better =
        best.len < cur.len ||
        (best.len === cur.len && (best.y < cur.y || (best.y === cur.y && best.x < cur.x)));
      if (better) {
        g.x = best.x;
        g.y = best.y;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return finish();

  function finish(): PlacementResult {
    let used = 0;
    for (const p of work) used = Math.max(used, extent(p));
    return toResult(work, used);
  }
}
