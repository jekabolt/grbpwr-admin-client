// The strip panel's source of `seam_mm`: `seamLengthsMm(seamKey)`, per size. The reading itself is pure
// and lives in seam-side-length.ts; this is the card's pattern handed to it.
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { splitWire, type StoredSeam, type TechCardSeamWire } from 'lib/seams';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { useCardDxfPack } from '../nesting/card-dxf-pack';
import { findPiece, useDxfGeometry, useDxfIndex } from '../nesting/dxf-geometry';
import { pieceBlockRefs, pieceRefKey, rollGoodsScopes } from '../piece-block-refs';
import type { TechCardFormData } from '../schema';
import type { TopstitchLine, TopstitchOperation } from '../topstitch-lines';
import {
  lengthsBySizeId,
  seamLengthsReader,
  sideAnchorLengthsOf,
  type SeamLengthsMm,
} from './seam-side-length';
import { stripKeysOf, type CutStripLike } from './strip-pieces';

export type { SeamLengthsMm } from './seam-side-length';

const NOTHING: SeamLengthsMm = () => undefined;

/**
 * The function the strip panel takes. The pattern is parsed only for a card that has a `from_seam`
 * strip: until the parse lands, and on a card with no pattern, nothing is known, so the panel leaves
 * what is stored alone.
 */
export function useSeamLengthsMm(seams: readonly TechCardSeamWire[] | undefined): SeamLengthsMm {
  const rows = useMemo(() => splitWire(seams).seams, [seams]);
  return useStoredSeamLengthsMm(rows);
}

/** The live seam store variant used by the card-level sync immediately after an RPC echo. */
export function useStoredSeamLengthsMm(rows: readonly StoredSeam[]): SeamLengthsMm {
  const aliases = useWatch<TechCardFormData>({ name: 'pieceDxfAliases' });
  const bomItems = useWatch<TechCardFormData>({ name: 'bomItems' });
  const sizeIds = useWatch<TechCardFormData>({ name: 'sizeIds' }) as number[] | undefined;
  const strips = useWatch({ name: 'cutStrips' }) as readonly CutStripLike[] | undefined;
  const operations = useWatch({ name: 'operations' }) as readonly TopstitchOperation[] | undefined;
  const sizeNames = useSizeNames();
  const wanted =
    (strips ?? []).some((strip) => strip.lengthMode === 'from_seam' && !!strip.seamKey) ||
    (operations ?? []).some((operation) => (operation.topstitchLines ?? []).length > 0);
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, wanted);
  const index = useDxfIndex(geometry.data);
  const refs = useMemo(
    () => pieceBlockRefs((aliases ?? []) as never, rollGoodsScopes((bomItems ?? []) as never)),
    [aliases, bomItems],
  );
  const stripKeys = useMemo(() => stripKeysOf(strips ?? []), [strips]);
  return useMemo(() => {
    if (!index) return NOTHING;
    return seamLengthsReader({
      rows,
      stripKeys,
      find: (key, atSize) => findPiece(index, refs.get(pieceRefKey(key)) ?? [], atSize),
      sizeIds: (sizeIds ?? []).map(Number),
      sizeNames,
    });
  }, [index, rows, refs, stripKeys, sizeIds, sizeNames]);
}

export type TopstitchLengthsMm = (line: TopstitchLine) => ReadonlyMap<number, number> | undefined;

/** Pattern-backed reader for one-sided line anchors. `ready` separates loading from no pattern. */
export function useTopstitchLengthsMm(): {
  read: TopstitchLengthsMm;
  ready: boolean;
} {
  const aliases = useWatch<TechCardFormData>({ name: 'pieceDxfAliases' });
  const bomItems = useWatch<TechCardFormData>({ name: 'bomItems' });
  const sizeIds = useWatch<TechCardFormData>({ name: 'sizeIds' }) as number[] | undefined;
  const operations = useWatch({ name: 'operations' }) as readonly TopstitchOperation[] | undefined;
  const sizeNames = useSizeNames();
  const wanted = (operations ?? []).some(
    (operation) => (operation.topstitchLines ?? []).length > 0,
  );
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, wanted);
  const index = useDxfIndex(geometry.data);
  const refs = useMemo(
    () => pieceBlockRefs((aliases ?? []) as never, rollGoodsScopes((bomItems ?? []) as never)),
    [aliases, bomItems],
  );
  const read = useMemo<TopstitchLengthsMm>(() => {
    if (!index) return () => undefined;
    const cache = new Map<string, ReadonlyMap<number, number> | undefined>();
    return (line) => {
      if (cache.has(line.lineKey)) return cache.get(line.lineKey);
      const byToken = sideAnchorLengthsOf(
        { anchoredSize: line.anchoredSize ?? '', kind: 'partial' },
        line.parts,
        (key, atSize) => findPiece(index, refs.get(pieceRefKey(key)) ?? [], atSize),
      );
      const lengths = lengthsBySizeId(byToken, (sizeIds ?? []).map(Number), sizeNames);
      const known = lengths.size ? lengths : undefined;
      cache.set(line.lineKey, known);
      return known;
    };
  }, [index, refs, sizeIds, sizeNames]);
  return { read, ready: !wanted || !geometry.isLoading };
}
