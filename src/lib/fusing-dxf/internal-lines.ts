import type { PieceDTO } from 'lib/nesting/types';
import type { FuseInternalLine } from './dxf';
import { signedArea } from './geometry';

/**
 * A contour piece's internal lines in piece-local millimetres, in the file's own order: what a drawn
 * zone rides between sizes (mapFuseSpecToSize). The cut contour's own layer and the sewing line are
 * contours, not internal lines: the contour already leads the mapping, and a sewing ring's vertex
 * count changes from size to size, so its vertices do not pair up. A closed path enclosing most of
 * the piece is the other outline (the cut line when the contour is the sewing line) and is skipped
 * for the same reason.
 */
export function fusingInternalLines(
  piece: PieceDTO,
  measuredSeamLayer: string | null,
): FuseInternalLine[] {
  const contours = new Set(
    [piece.layer, piece.manifest?.seamLayer, measuredSeamLayer]
      .map((layer) => layer?.trim() ?? '')
      .filter(Boolean),
  );
  const pieceArea = Math.abs(signedArea(piece.poly));
  return (piece.inner ?? [])
    .filter(
      (path) =>
        path.pts.length >= 2 &&
        !contours.has(path.layer.trim()) &&
        !(path.closed && Math.abs(signedArea(path.pts)) > pieceArea / 2),
    )
    .map((path) => ({
      layer: path.layer,
      closed: path.closed,
      points: path.pts.map((point) => ({ x: point.x * 10, y: point.y * 10 })),
    }));
}
