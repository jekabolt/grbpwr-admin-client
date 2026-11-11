import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { pieceRefKey } from '../piece-block-refs';
import type { PieceShapeMap } from '../use-piece-shapes';
import { goneSeamKeys, withSeamGone } from './lengths';
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
  // The seam rows with writes in flight laid over: a strip on a stale or rejected seam has no length.
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const sizeNames = useSizeNames();
  return useMemo(() => {
    if (!shapes || !strips?.length) return shapes;
    const gone = goneSeamKeys(rowsOf({ server, pending }));
    const measured = strips.map((strip) => withSeamGone(strip, gone));
    const drawings = stripDrawingsOf(measured, bomItems ?? [], {
      sizeToken: drawnSizeToken(shapes.values()),
      sizeNames,
      baseSizeId: Number(baseSizeId) || undefined,
    });
    if (drawings.length === 0) return shapes;
    const all = new Map(shapes);
    for (const { key, found } of drawings) all.set(pieceRefKey(key), found);
    return all;
  }, [shapes, strips, server, pending, bomItems, baseSizeId, sizeNames]);
}
