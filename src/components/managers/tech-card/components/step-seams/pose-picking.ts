import type { Pt2 } from 'lib/assembly-skeleton/types';
import { orderedLayerKeys } from 'lib/assembly-skeleton/union';

import { insideRing } from './step-picture';

export type PosePieceRing = { piece: string; ring: readonly Pt2[] };

/** The exact bottom-to-top paint order used by the PLACE picture. */
export function posePieceOrder(
  layers: readonly string[],
  stacked: readonly (readonly string[])[],
  keys: readonly string[],
  lower: readonly string[],
): string[] {
  const present = new Set(keys);
  const ordered = orderedLayerKeys(layers, stacked, keys).filter((piece) => present.has(piece));
  const lowerSet = new Set(lower);
  return [
    ...ordered.filter((piece) => lowerSet.has(piece)),
    ...ordered.filter((piece) => !lowerSet.has(piece)),
  ];
}

/** Pieces below `point`, topmost first, from rings supplied in their paint order. */
export function piecesUnder(point: Pt2, bottomToTop: readonly PosePieceRing[]): string[] {
  return bottomToTop.reduceRight<string[]>((hits, piece) => {
    if (insideRing(point, piece.ring)) hits.push(piece.piece);
    return hits;
  }, []);
}

export type LayerHit = { piece: string; at: Pt2 };

/** Top-first hit, cycling down while repeated clicks stay within `tolerance` screen pixels. */
export function cycleLayerHit(
  hits: readonly string[],
  at: Pt2,
  previous: LayerHit | null,
  tolerance = 4,
): string | null {
  if (!hits.length) return null;
  const sameSpot =
    previous && Math.hypot(at[0] - previous.at[0], at[1] - previous.at[1]) <= tolerance;
  const previousIndex = sameSpot ? hits.indexOf(previous.piece) : -1;
  return hits[(previousIndex + 1) % hits.length];
}

/** A snap marker exists only as part of the current drag. */
export function snapAtDuringDrag(drag: { snap: { at: Pt2 } | null } | null): Pt2 | null {
  return drag?.snap?.at ?? null;
}

/** One layer switch in the order PLACE applies it: under / over a host, or cleared (`null`). */
export type PendingLayerClaim = { piece: string; host?: string; under: boolean | null };

/**
 * The paint order, lower pieces and [under, over] claims PLACE shows: the shared result with the
 * unsaved switches applied in order, so the canvas draws exactly what «done» will save.
 */
export function pendingStacking(
  base: {
    layers: readonly string[];
    lower: readonly string[];
    stacked: readonly (readonly [string, string])[];
  },
  claims: readonly PendingLayerClaim[],
): { layers: string[]; lower: string[]; stacked: [string, string][] } {
  const order = [...base.layers];
  const lower = new Set(base.lower);
  let stacked = base.stacked.map(([u, o]) => [u, o] as [string, string]);
  for (const { piece, host, under } of claims) {
    if (under === null) {
      lower.delete(piece);
      stacked = stacked.filter(([u]) => u !== piece);
      continue;
    }
    if (!host) continue;
    const from = order.indexOf(piece);
    if (from < 0 || !order.includes(host)) continue;
    order.splice(from, 1);
    const at = order.indexOf(host);
    order.splice(under ? at : at + 1, 0, piece);
    if (under) lower.add(piece);
    else lower.delete(piece);
    stacked = stacked.filter(
      ([u, o]) => !((u === piece && o === host) || (u === host && o === piece)),
    );
    stacked.push(under ? [piece, host] : [host, piece]);
  }
  return { layers: order, lower: order.filter((piece) => lower.has(piece)), stacked };
}
