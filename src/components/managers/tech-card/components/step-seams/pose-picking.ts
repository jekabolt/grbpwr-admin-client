import type { Pt2 } from 'lib/assembly-skeleton/types';
import { orderedLayerKeys } from 'lib/assembly-skeleton/union';
import { withSeamLayer, type SeamLayer } from 'lib/seams';

import { insideRing } from './step-picture';
import { layersOf, type LayerInput, type LayerRow, type LayerStacking } from './step-result';

export type PosePieceRing = { piece: string; ring: readonly Pt2[] };

/** The exact bottom-to-top order of the PLACE picture's contours. */
export function posePieceOrder(
  layers: readonly string[],
  stacked: readonly (readonly string[])[],
  keys: readonly string[],
): string[] {
  const present = new Set(keys);
  return orderedLayerKeys(layers, stacked, keys).filter((piece) => present.has(piece));
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

/** PLACE's unsaved changes, as «done» will write them. */
export type PendingLayerEdits = {
  /** The flag on a piece's pose row, null = none. */
  layers?: ReadonlyMap<string, SeamLayer | null>;
  /** Poses moved by hand: the new host, and the flag a stored row of this piece already holds. */
  moved?: ReadonlyMap<string, { host: string; layer?: SeamLayer }>;
  /** Pieces whose pose row is removed. */
  dropped?: ReadonlySet<string>;
};

/**
 * The rows of a step as they will be read after «done», in the order they will be stored. «done»
 * attaches a moved pose at the end of its kind. A row that only changes its flag keeps its place,
 * because the order of rows moves pieces.
 */
export function pendingLayerRows(
  rows: readonly LayerRow[],
  { layers, moved, dropped }: PendingLayerEdits,
): LayerRow[] {
  const posed = new Map<string, LayerRow>();
  const keptSeams: LayerRow[] = [];
  const keptPoses: LayerRow[] = [];
  for (const row of rows) {
    if (!row.pose) {
      keptSeams.push(row);
      continue;
    }
    const piece = row.sideA[0]?.piece;
    if (piece != null) posed.set(piece, row);
    if (piece != null && (dropped?.has(piece) || moved?.has(piece))) continue;
    if (piece == null || !layers?.has(piece)) {
      keptPoses.push(row);
      continue;
    }
    const [first, ...rest] = row.sideA;
    keptPoses.push({
      ...row,
      sideA: [withSeamLayer(first, layers.get(piece)), ...rest],
      sideB: row.sideB.map((anchor) => withSeamLayer(anchor, null)),
    });
  }
  const movedPoses = [...(moved ?? [])].flatMap(([piece, pin]): LayerRow[] => {
    if (dropped?.has(piece)) return [];
    const layer = layers?.has(piece) ? layers.get(piece) : pin.layer;
    return [
      {
        key: posed.get(piece)?.key ?? `pending:${piece}`,
        pose: true,
        sideA: [{ piece, ...(layer ? { layer } : {}) }],
        sideB: [{ piece: pin.host }],
      },
    ];
  });
  return [...keptSeams, ...keptPoses, ...movedPoses];
}

/** What PLACE shows: the layer rule on the same input as the result, with the unsaved edits applied. */
export function pendingStacking(input: LayerInput, edits: PendingLayerEdits): LayerStacking {
  return layersOf(input.blocks, pendingLayerRows(input.rows, edits), input.order);
}
