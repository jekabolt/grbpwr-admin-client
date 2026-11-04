import { PieceTile } from '../piece-silhouette';
import type { FoundPiece } from '../nesting/dxf-geometry';

type Box = { w: number; h: number };

/** A strip's tile on the shelf and the tray: its rectangle, like any piece, and how many go in a garment. */
export function StripTileFace({
  name,
  qty,
  found,
  pxBox,
  className,
}: {
  name: string;
  qty: number;
  found: FoundPiece | null;
  pxBox?: Box;
  className?: string;
}) {
  return (
    <span data-cut-strip-tile className='contents'>
      <PieceTile found={found} name={`${name} ×${qty}`} pxBox={pxBox} className={className} />
    </span>
  );
}
