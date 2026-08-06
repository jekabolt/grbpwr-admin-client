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
import type { Placement, Pt, RotationDeg, UnplacedPiece } from '../types';
import { SCALE } from '../geom/clipper';
import type { Flip, NfpCache, NfpPaths, PreparedPiece, Variant } from './nfp';

// Ген несёт ВАРИАНТ детали (поворот + хиральность) прямо в себе — тем самым он структурно
// подходит под Variant, и кэш NFP спрашивается как nfps.get(q.piece, q, g.piece, g), без
// промежуточного объекта на каждого соседа.
export type Gene = Variant & {
  piece: PreparedPiece;
  instance: number;
  // ХИРАЛЬНОСТЬ экземпляра — вход задачи, а не переменная поиска (Ф1.2). Парная деталь это
  // ровно n левых и n правых: сколько зеркал, решает задание (NestPieceConfig.flippedQuantity),
  // и «перевернуть ещё одну» — это не улучшение раскладки, а другой комплект кроя. К тому же
  // менять зеркала местами между экземплярами одной детали бессмысленно: набор фигур на полосе
  // от этого не меняется. Поэтому GA крутит порядок и повороты, а flip не трогает вовсе.
  flip: Flip;
  // Rotations in which this piece fits the fabric width — the GA mutates within this set.
  allowedRots: readonly RotationDeg[];
};

export type PlacedGene = Gene & { x: number; y: number };

export type PlacementResult = {
  placements: Placement[];
  usedLengthCm: number;
  // Genes this order could not place. Empty is the normal case; a non-empty list is the
  // honest alternative to the old behaviour, which laid the piece down overlapping and let
  // usedLength grow as though it had gone somewhere legal.
  unplaced: UnplacedPiece[];
};

type Neighbour = { nfp: NfpPaths; ox: number; oy: number };

// Point-vs-loops (NonZero winding), in the region's own frame. Returns true when the
// point is STRICTLY inside — on-boundary is contact, which is legal. Boundary detection
// short-circuits per LOOP, which is exact for the convex-parts representation (a point on
// one part's boundary and strictly inside another part is still caught by the other
// part's own winding pass, because each part is tested as its own loop set).
function strictlyInsideLoops(
  paths: readonly NfpPaths['paths'][number][],
  boxes: readonly NfpPaths['boxes'][number][],
  px: number,
  py: number,
): boolean {
  for (let pi = 0; pi < paths.length; pi++) {
    const b = boxes[pi];
    // A closed loop cannot wind around a point outside its bbox.
    if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) continue;
    const path = paths[pi];
    const n = path.length;
    let w = 0;
    let onBoundary = false;
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
        onBoundary = true; // contact with THIS loop — but another loop may still claim it
        break;
      }
      if (a.y <= py) {
        if (d.y > py && cross > 0) w++;
      } else if (d.y <= py && cross < 0) w--;
    }
    if (!onBoundary && w !== 0) return true;
  }
  return false;
}

// ACCEPTANCE runs against the raw convex Minkowski parts — the authority — not the
// clipper union (candidates-only; see nest/nfp.ts header: the union can carry bites up
// to 1.09 cm deep that clipper's own Difference agrees with, so it must never decide
// feasibility).
function feasible(neighbours: readonly Neighbour[], cx: number, cy: number): boolean {
  for (const nb of neighbours) {
    if (strictlyInsideLoops(nb.nfp.parts, nb.nfp.partBoxes, cx - nb.ox, cy - nb.oy)) return false;
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

// How many verifier rejections to absorb before giving up on a gene's candidate list.
const MAX_VERIFY = 64;

// Squared distance from point p to segment uv (cm).
function pointSegDist2(px: number, py: number, ux: number, uy: number, vx: number, vy: number): number {
  const dx = vx - ux;
  const dy = vy - uy;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ux) * dx + (py - uy) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ux + t * dx;
  const qy = uy + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

// True-contour clearance between two placed contours (cm), early-exiting as soon as it
// is provably below `limit`. Boundary-to-boundary distance only — pieces are never
// nested by the placer, so a containment case cannot arise from a BL placement.
function contoursClearBy(
  a: readonly Pt[],
  ax: number,
  ay: number,
  b: readonly Pt[],
  bx: number,
  by: number,
  limit: number,
): boolean {
  const lim2 = limit * limit;
  for (let i = 0; i < a.length; i++) {
    const p1x = a[i].x + ax;
    const p1y = a[i].y + ay;
    const p2 = a[(i + 1) % a.length];
    const p2x = p2.x + ax;
    const p2y = p2.y + ay;
    for (let j = 0; j < b.length; j++) {
      const q1x = b[j].x + bx;
      const q1y = b[j].y + by;
      const q2 = b[(j + 1) % b.length];
      const q2x = q2.x + bx;
      const q2y = q2.y + by;
      // Segment crossing ⇒ distance 0.
      const d1 = (p2x - p1x) * (q1y - p1y) - (p2y - p1y) * (q1x - p1x);
      const d2 = (p2x - p1x) * (q2y - p1y) - (p2y - p1y) * (q2x - p1x);
      const d3 = (q2x - q1x) * (p1y - q1y) - (q2y - q1y) * (p1x - q1x);
      const d4 = (q2x - q1x) * (p2y - q1y) - (q2y - q1y) * (p2x - q1x);
      if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0) return false;
      if (
        pointSegDist2(p1x, p1y, q1x, q1y, q2x, q2y) < lim2 ||
        pointSegDist2(p2x, p2y, q1x, q1y, q2x, q2y) < lim2 ||
        pointSegDist2(q1x, q1y, p1x, p1y, p2x, p2y) < lim2 ||
        pointSegDist2(q2x, q2y, p1x, p1y, p2x, p2y) < lim2
      ) {
        return false;
      }
    }
  }
  return true;
}

// Best position for one gene against fixed neighbours: the (len, y, x)-minimal candidate
// that passes every winding test AND the caller's verifier. Coordinates are int units;
// returns null when no candidate is feasible (caller falls back to the frontier).
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
  verify?: (cx: number, cy: number) => boolean,
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
  let verified = 0;
  for (const i of idx) {
    const cx = cands[2 * i];
    const cy = cands[2 * i + 1];
    if (cx === prevX && cy === prevY) continue; // sorted duplicates are adjacent
    prevX = cx;
    prevY = cy;
    if (!feasible(neighbours, cx, cy)) continue;
    // Final authority: the promise itself (true-contour clearance), checked on the few
    // candidates that survive the NFP filters. Every NFP-derived proxy — union, raw
    // convex parts, simplified contours — was measured accepting positions whose true
    // clearance was short (parts and simplified contours touching at an accepted
    // contact point), so the accepted position is verified against what the marker
    // actually promises rather than against a model of it.
    if (verify && !verify(cx, cy)) {
      verified++;
      if (verified > MAX_VERIFY) return null; // pathological pocket — fall back
      continue;
    }
    return { x: cx, y: cy, len: lenOf(i) };
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
  const unplaced: UnplacedPiece[] = [];
  let usedLength = 0; // int units
  const m = Math.round(edgeMarginCm * SCALE);
  const W = Math.round(fabricWidthCm * SCALE);
  const L = Math.round(lMaxCm * SCALE);

  for (const g of genes) {
    if (abort?.()) return null;
    const b = g.piece.boundsAt[g.flip][g.rot];
    const bMinX = Math.round(b.minX * SCALE);
    const bMaxX = Math.round(b.maxX * SCALE);
    const bMinY = Math.round(b.minY * SCALE);
    const bMaxY = Math.round(b.maxY * SCALE);
    const xLo = m - bMinX;
    const xHi = L - m - bMaxX;
    const yLo = m - bMinY;
    const yHi = W - m - bMaxY;
    if (yLo > yHi || xLo > xHi) {
      // Two different failures, and they must not share a word. yLo > yHi is «шире полосы в
      // этом повороте» — prep filters pieces that fit in NO rotation, so reaching it means the
      // GA chose a rotation this piece cannot wear. xLo > xHi is «длиннее полосы», i.e. lMax
      // was under-budgeted; reporting that as a width problem would send the operator to look
      // at the fabric width, which is not the thing that is wrong.
      unplaced.push({
        pieceId: g.piece.id,
        instance: g.instance,
        reason: yLo > yHi ? 'width' : 'no-space',
      });
      continue;
    }

    const neighbours: Neighbour[] = placed.map((q) => ({
      nfp: nfps.get(q.piece, q, g.piece, g),
      ox: q.x,
      oy: q.y,
    }));

    // True-contour verifier for this gene against everything already placed (cm frame),
    // bbox-prefiltered so only genuinely near neighbours are measured.
    const gap = nfps.verifyGapCm;
    const gPoly = g.piece.polyAt[g.flip][g.rot];
    const verify = (cx: number, cy: number): boolean => {
      const px = cx / SCALE;
      const py = cy / SCALE;
      for (const q of placed) {
        const qb = q.piece.boundsAt[q.flip][q.rot];
        const qx = q.x / SCALE;
        const qy = q.y / SCALE;
        if (
          px + b.minX - gap > qx + qb.maxX ||
          px + b.maxX + gap < qx + qb.minX ||
          py + b.minY - gap > qy + qb.maxY ||
          py + b.maxY + gap < qy + qb.minY
        ) {
          continue; // bboxes farther apart than the gap — cannot violate
        }
        if (!contoursClearBy(gPoly, px, py, q.piece.polyAt[q.flip][q.rot], qx, qy, gap)) return false;
      }
      return true;
    };

    const best = bestPositionFor(g, neighbours, xLo, xHi, yLo, yHi, usedLength, bMaxX, m, verify);

    // Fallback: no candidate was feasible (constructible when the only pocket corners
    // are NFP×NFP intersections, which the candidate set skips). The frontier start is
    // VALIDATED like any candidate and pushed right until it clears every neighbour —
    // an unvalidated frontier was measured landing strictly inside two forbidden
    // regions at once on a constructed case.
    // Clamped to the strip: an unclamped frontier start could already sit past xHi, and the
    // first feasibility test would then «seat» the piece off the end of the fabric.
    let x = best ? best.x : Math.min(xHi, Math.max(xLo, usedLength + m - bMinX));
    const y = best ? best.y : yLo;
    let seated = !!best;
    if (!best) {
      const step = Math.max(1, Math.round((bMaxX - bMinX) / 4));
      let guard = 0;
      for (;;) {
        if (feasible(neighbours, x, y) && verify(x, y)) {
          seated = true;
          break;
        }
        // The strip's right edge and the step guard are BOTH terminal, and neither may end
        // in a placement. The old loop exited on `x >= xHi` or on the guard and then pushed
        // the piece regardless — an overlapping placement whose length the marker счёл
        // честной. A run that reaches here has nothing true to say except «не влезло».
        if (x >= xHi || guard >= 4096) break;
        x = Math.min(xHi, x + step);
        guard++;
      }
    }
    if (!seated) {
      unplaced.push({ pieceId: g.piece.id, instance: g.instance, reason: 'no-space' });
      continue;
    }
    placed.push({ ...g, x, y });
    usedLength = Math.max(usedLength, x + bMaxX + m);
  }

  return toResult(placed, usedLength, unplaced);
}

function toResult(
  placed: readonly PlacedGene[],
  usedLength: number,
  unplaced: UnplacedPiece[] = [],
): PlacementResult {
  return {
    placements: placed.map((p) => ({
      pieceId: p.piece.id,
      instance: p.instance,
      rot: p.rot,
      // Пишется ВСЕГДА, а не только у зеркальных: результат движка полон по построению, и
      // «поля нет» в нём не должно значить ничего. Необязательным флаг остаётся только в типе
      // — ради тех, кто строит Placement сам (сохранённый маркер, ручной редактор).
      flipped: p.flip === 1,
      x: p.x / SCALE,
      y: p.y / SCALE,
    })),
    usedLengthCm: usedLength / SCALE,
    unplaced,
  };
}

// Deterministic post-GA compaction: re-place each piece (x-ascending order) against ALL
// other pieces held fixed, accepting a strictly better (len, y, x). Holes that opened
// after a piece was originally placed get filled; repeats until a pass moves nothing or
// the pass cap is hit. DELIBERATELY no wall-clock deadline: a clock-truncated pass made
// same-seed results machine-dependent (verified: the 500 ms floor changed the output)
// for a measured gain of ≤0.008 cm — the iteration cap alone keeps the cost bounded.
// Pure integer math, same candidate machinery as placement.
//
// CANCELLATION (Ф0) is a different question from the clock, and conflating the two is what
// left this the longest uninterruptible tail in the engine: «стоп» was checked once BEFORE
// compaction and never again, so a stop pressed at second 3 of a 40-second compaction was
// answered at second 40 (in the UI, by killing the worker after 1.5 s and throwing the run
// away).
//
// The function is ASYNC for one reason, and it is the whole reason: in the worker `cancel`
// arrives as a MESSAGE, and a message cannot be dispatched while the worker sits inside
// synchronous code. A cancel flag polled from a synchronous loop is therefore invariantly
// false no matter how often it is polled — the first version of this fix polled 390 times
// per run and could not have observed a single cancel. The queue has to be drained, so the
// loop yields, and only then does the poll mean anything.
//
// Yielding cannot move the RESULT: nothing in here reads a clock, so a run nobody cancelled
// walks exactly the passes it walked before and produces the same marker. That is precisely
// the distinction the "no wall-clock deadline" rule above is protecting — truncating by TIME
// makes output machine-dependent; pausing and resuming does not.
export async function compactPlacements(
  genes: readonly PlacedGene[],
  fabricWidthCm: number,
  edgeMarginCm: number,
  lMaxCm: number,
  nfps: NfpCache,
  maxPasses = 3,
  isCancelled?: () => boolean,
): Promise<PlacementResult> {
  const m = Math.round(edgeMarginCm * SCALE);
  const W = Math.round(fabricWidthCm * SCALE);
  const L = Math.round(lMaxCm * SCALE);
  const work = genes.map((g) => ({ ...g }));

  const extent = (p: PlacedGene): number =>
    p.x + Math.round(p.piece.boundsAt[p.flip][p.rot].maxX * SCALE) + m;

  // Drain the message queue every ~16 ms so a posted cancel can actually be delivered. Time
  // decides only WHEN to yield, never what the pass does — see the header.
  let lastYield = Date.now();
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    const order = work.map((_, i) => i).sort((i, j) => work[i].x - work[j].x || i - j);
    for (const i of order) {
      if (isCancelled && Date.now() - lastYield >= 16) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = Date.now();
      }
      // Polled per piece, not per pass: one pass over 130 instances is seconds long, and a
      // stop must not have to wait for it. Every piece in `work` holds a position that was
      // feasible when it was written, so returning mid-pass returns a valid marker.
      if (isCancelled?.()) return finish();
      const g = work[i];
      const b = g.piece.boundsAt[g.flip][g.rot];
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
        neighbours.push({ nfp: nfps.get(q.piece, q, g.piece, g), ox: q.x, oy: q.y });
      }

      const cur = {
        len: Math.max(othersLen, g.x + bMaxX + m),
        y: g.y,
        x: g.x,
      };
      // Same true-contour authority as placement (see placeOrder): a compaction move is
      // only accepted when the moved piece really clears every other by the promised gap.
      const gap = nfps.verifyGapCm;
      const gPoly = g.piece.polyAt[g.flip][g.rot];
      const verify = (cx: number, cy: number): boolean => {
        const px = cx / SCALE;
        const py = cy / SCALE;
        for (let j = 0; j < work.length; j++) {
          if (j === i) continue;
          const q = work[j];
          const qb = q.piece.boundsAt[q.flip][q.rot];
          const qx = q.x / SCALE;
          const qy = q.y / SCALE;
          if (
            px + b.minX - gap > qx + qb.maxX ||
            px + b.maxX + gap < qx + qb.minX ||
            py + b.minY - gap > qy + qb.maxY ||
            py + b.maxY + gap < qy + qb.minY
          ) {
            continue;
          }
          if (!contoursClearBy(gPoly, px, py, q.piece.polyAt[q.flip][q.rot], qx, qy, gap)) return false;
        }
        return true;
      };
      const best = bestPositionFor(g, neighbours, xLo, xHi, yLo, yHi, othersLen, bMaxX, m, verify);
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
