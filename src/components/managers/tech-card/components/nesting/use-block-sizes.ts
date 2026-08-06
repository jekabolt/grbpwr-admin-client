// Размеры, закодированные в именах блоков DXF, — и разбиение разобранного файла по ним.
//
// Один DXF несёт всю градацию: BP_1_XS, BP_1_S, BP_1_M… Пока это не разделено, раскладка кладёт
// на полосу ВСЕ размеры сразу (и меряет длину, которая не относится ни к одному), а деталей
// кроя заводится по набору на каждый размер вместо одного набора на стиль.
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { useSizeNames, useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import type { PieceDTO } from 'lib/nesting/types';
import { splitBlockSize, sizeTokensOf, type BlockCode } from './block-code';

// Токены, которые в конце имени блока считаются размером, вместе с их местом в градации.
// Только размерный ряд ЭТОЙ карточки: см. block-code.ts — «L» обязан быть размером лишь там, где
// размер L существует. Порядок берём у размерного ряда, а не у файла: XS, S, M, L, XL читается,
// а порядок появления блоков в DXF — нет.
export function useSizeTokens(): Map<string, number> {
  const sizeIds = (useWatch({ name: 'sizeIds' }) ?? []) as number[];
  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  return useMemo(() => {
    const out = new Map<string, number>();
    orderSizes(sizeIds).forEach((id, i) => {
      for (const t of sizeTokensOf(sizeById.get(id))) if (!out.has(t)) out.set(t, i);
    });
    return out;
  }, [sizeIds, sizeById, orderSizes]);
}

export type SizeGroup = {
  // Размер, как он написан в файле; '' — блоки без размерного хвоста.
  size: string;
  pieces: PieceDTO[];
};

export type BlockSplit = {
  // Разбор имени по каждой детали, по её id.
  codeById: Map<number, BlockCode>;
  groups: SizeGroup[];
};

// Разбирает имена и раскладывает детали по размерам. Группы идут в порядке градации; группа ''
// (блоки без размерного хвоста) — последней: это остаток, а не размер.
export function splitPiecesBySize(
  pieces: readonly PieceDTO[],
  sizeTokens: ReadonlyMap<string, number>,
): BlockSplit {
  const codeById = new Map<number, BlockCode>();
  const bySize = new Map<string, PieceDTO[]>();
  for (const p of pieces) {
    const code = splitBlockSize(p.blockName ?? '', sizeTokens);
    codeById.set(p.id, code);
    const list = bySize.get(code.size) ?? [];
    list.push(p);
    bySize.set(code.size, list);
  }
  const rank = (size: string) =>
    size === '' ? Number.MAX_SAFE_INTEGER : (sizeTokens.get(size.toLowerCase()) ?? 1e6);
  const groups = [...bySize.entries()]
    .map(([size, ps]) => ({ size, pieces: ps }))
    .sort((a, b) => rank(a.size) - rank(b.size));
  return { codeById, groups };
}
