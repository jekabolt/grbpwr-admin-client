import { area } from 'lib/nesting/geom/polygon';
import type { PieceDTO, Pt } from 'lib/nesting/types';

import { buildAllowanceIndex } from './contour-allowance';
import { layerOptions, seamLineLayer } from './contour-layer';

type PieceCode = { identity: string; size: string };

/** The measured seam layer, with a converter manifest as the exact-file fallback. */
export function sewingLineLayer(
  pieces: readonly PieceDTO[],
  codeById: ReadonlyMap<number, PieceCode>,
): string | null {
  if (!pieces.length) return null;
  const measured = seamLineLayer(layerOptions(pieces, codeById, buildAllowanceIndex(pieces)));
  if (measured) return measured;
  return (
    pieces.find((piece) => piece.manifest?.seamLayer.trim())?.manifest?.seamLayer.trim() ?? null
  );
}

const blockKey = (piece: PieceDTO) => (piece.blockName?.trim() || piece.name.trim()).toLowerCase();

const sameFile = (left: PieceDTO, right: PieceDTO) =>
  left.fileIndex != null || right.fileIndex != null
    ? left.fileIndex === right.fileIndex
    : left.source === right.source;

const largestUsableRing = (rings: readonly Pt[][], cutArea: number): Pt[] | null => {
  const candidates = rings
    .filter((ring) => ring.length >= 3)
    .map((ring) => ({ ring, area: area(ring) }))
    .filter((candidate) => candidate.area > 1e-8 && candidate.area < cutArea - 1e-8)
    .sort((left, right) => right.area - left.area);
  return candidates[0]?.ring.map((point) => ({ ...point })) ?? null;
};

/** The piece's own sewing contour in the cut outline's piece-local cm frame. */
export function pieceNetOutline(
  piece: PieceDTO,
  pieces: readonly PieceDTO[],
  measuredSeamLayer: string | null,
): Pt[] | null {
  const seamLayer = piece.manifest?.seamLayer.trim() || measuredSeamLayer?.trim();
  if (!seamLayer) return null;

  const cutArea = area(piece.poly);
  const inner = largestUsableRing(
    (piece.inner ?? [])
      .filter((path) => path.closed && path.layer === seamLayer)
      .map((path) => path.pts),
    cutArea,
  );
  if (inner) return inner;

  if (piece.originX == null || piece.originY == null) return null;
  const key = blockKey(piece);
  if (!key) return null;
  const siblings = pieces
    .filter(
      (candidate) =>
        candidate !== piece &&
        candidate.layer === seamLayer &&
        blockKey(candidate) === key &&
        sameFile(candidate, piece) &&
        candidate.originX != null &&
        candidate.originY != null,
    )
    .map((candidate) =>
      candidate.poly.map((point) => ({
        x: candidate.originX! + point.x - piece.originX!,
        y: candidate.originY! + point.y - piece.originY!,
      })),
    );
  return largestUsableRing(siblings, cutArea);
}
