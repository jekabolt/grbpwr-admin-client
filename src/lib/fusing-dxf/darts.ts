import type { PieceDTO } from 'lib/nesting/types';
import type { PtMm } from 'lib/pattern-import/types';

function signedAreaCm2(points: readonly { x: number; y: number }[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

/**
 * Closed dart polygons accepted by the fusing DXF generator, in piece-local millimetres.
 * Open V paths are deliberately excluded because they do not enclose a cut-out polygon.
 */
export function fusingDartPolygons(piece: PieceDTO): PtMm[][] {
  return (piece.inner ?? []).flatMap((path) => {
    if (!path.closed || path.pts.length < 3) return [];
    const area = Math.abs(signedAreaCm2(path.pts));
    if (!(area > 0.05 && area < piece.areaCm2 * 0.15)) return [];
    const xs = path.pts.map((point) => point.x);
    const ys = path.pts.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    // The parser writes/reads drills as 1 × 1 cm closed squares; those are not dart holes.
    if (path.pts.length === 4 && Math.abs(width - 1) < 0.08 && Math.abs(height - 1) < 0.08)
      return [];
    return [path.pts.map((point) => ({ x: point.x * 10, y: point.y * 10 }))];
  });
}
