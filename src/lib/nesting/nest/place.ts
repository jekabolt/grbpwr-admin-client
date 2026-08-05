// Bottom-left-with-length-priority placement of one GA individual (SVGnest's scoring:
// resulting marker length first, then lowest y, then lowest x — pure BL staircases).
//
// Frame: strip along +X (practically unbounded — Lmax is a safe upper bound so length
// never causes a miss), fabric width along +Y ∈ [0, W]. The inner-fit region of a piece
// is an analytic rectangle (the bin is a rectangle), so only piece-piece NFPs need
// Clipper. Gap is pre-baked: NFPs come from gap/2-inflated contours; the IFP uses the
// ORIGINAL bounds inset by edgeMargin, keeping selvedge clearance independent of gap.
import type { Placement, RotationDeg } from '../types';
import { feasibleRegion, translatePath64 } from '../geom/clipper';
import type { NfpCache, PreparedPiece } from './nfp';

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
  let usedLength = 0;
  const m = edgeMarginCm;

  for (const g of genes) {
    if (abort?.()) return null;
    const b = g.piece.boundsAt[g.rot];
    const xLo = m - b.minX;
    const xHi = lMaxCm - m - b.maxX;
    const yLo = m - b.minY;
    const yHi = fabricWidthCm - m - b.maxY;
    if (yLo > yHi || xLo > xHi) continue; // cannot fit the width in this rotation — prep filters these

    const ifpRect = [
      { x: xLo, y: yLo },
      { x: xHi, y: yLo },
      { x: xHi, y: yHi },
      { x: xLo, y: yHi },
    ];

    const forbidden = placed.map((q) => {
      const paths = nfps.get(q.piece, q.rot, g.piece, g.rot);
      return paths.map((p) => translatePath64(p, q.x, q.y));
    });

    const region = feasibleRegion(ifpRect, forbidden.flat());

    let best: { x: number; y: number; len: number } | null = null;
    for (const path of region) {
      for (const v of path) {
        const len = Math.max(usedLength, v.x + b.maxX + m);
        if (
          !best ||
          len < best.len - 1e-9 ||
          (Math.abs(len - best.len) <= 1e-9 && (v.y < best.y - 1e-9 || (Math.abs(v.y - best.y) <= 1e-9 && v.x < best.x)))
        ) {
          best = { x: v.x, y: v.y, len };
        }
      }
    }

    // The Lmax bound makes the region non-empty in practice; a numeric fluke falls back
    // to the frontier so the individual still evaluates.
    const x = best ? best.x : usedLength + m - b.minX;
    const y = best ? best.y : yLo;
    placed.push({ ...g, x, y });
    usedLength = Math.max(usedLength, x + b.maxX + m);
  }

  return {
    placements: placed.map((p) => ({
      pieceId: p.piece.id,
      instance: p.instance,
      rot: p.rot,
      x: p.x,
      y: p.y,
    })),
    usedLengthCm: usedLength,
  };
}
