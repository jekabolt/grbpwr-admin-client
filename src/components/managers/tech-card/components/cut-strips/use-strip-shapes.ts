import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { pieceRefKey } from '../piece-block-refs';
import type { PieceShapeMap } from '../use-piece-shapes';
import {
  drawnSizeToken,
  stripDrawingsOf,
  type BomLineLike,
  type CutStripLike,
} from './strip-pieces';

/**
 * The assembly's contours with each strip's rectangle added. Only the assembly reads this: the raw
 * map feeds the unit pictures and the skeleton, which keep sewing cloth alone.
 */
export function useShapesWithStrips(shapes: PieceShapeMap): PieceShapeMap {
  const strips = useWatch({ name: 'cutStrips' }) as readonly CutStripLike[] | undefined;
  const bomItems = useWatch({ name: 'bomItems' }) as readonly BomLineLike[] | undefined;
  const baseSizeId = useWatch({ name: 'baseSampleSizeId' }) as number | undefined;
  const sizeNames = useSizeNames();
  return useMemo(() => {
    if (!shapes || !strips?.length) return shapes;
    const drawings = stripDrawingsOf(strips, bomItems ?? [], {
      sizeToken: drawnSizeToken(shapes.values()),
      sizeNames,
      baseSizeId: Number(baseSizeId) || undefined,
    });
    if (drawings.length === 0) return shapes;
    const all = new Map(shapes);
    for (const { key, found } of drawings) all.set(pieceRefKey(key), found);
    return all;
  }, [shapes, strips, bomItems, baseSizeId, sizeNames]);
}
