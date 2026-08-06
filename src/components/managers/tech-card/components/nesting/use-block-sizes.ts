// Размеры, закодированные в именах блоков DXF, — и разбиение разобранного файла по ним.
//
// Один DXF несёт всю градацию: BP_1_XS, BP_1_S, BP_1_M… Пока это не разделено, раскладка кладёт
// на полосу ВСЕ размеры сразу (и меряет длину, которая не относится ни к одному), а деталей
// кроя заводится по набору на каждый размер вместо одного набора на стиль.
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { useSizeNames, useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import type { PieceDTO } from 'lib/nesting/types';
import { sizeRank, splitBlockSize, sizeTokensOf, type BlockCode } from './block-code';

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

// Размеры, которые есть в ФАЙЛЕ, но не заведены в размерный ряд карточки.
//
// Отдельная функция, потому что опознаются они по ВСЕМУ словарю размеров, а не по ряду
// карточки: пока размера нет в ряду, `useSizeTokens` его хвостом не считает, и увидеть его
// нельзя в принципе — блок просто остаётся с полным именем, а деталь двоится (BP_1_XS и
// BP_1_M становятся разными строками вместо одной BP_1).
//
// Но РЕЗАТЬ по словарю нельзя: «FP_L» — это левая полочка, а «L» есть в словаре как размер.
// Поэтому машина только показывает находку, а добавляет размер в карточку человек. Ровно та же
// сделка, что и во всём диалоге: предлагает машина, решает человек.
export function useDictionarySizeTokens(): Map<string, number> {
  const sizeById = useSizeNames();
  return useMemo(() => {
    const byToken = new Map<string, number[]>();
    for (const [id, name] of sizeById) {
      for (const t of sizeTokensOf(name)) {
        const list = byToken.get(t) ?? [];
        list.push(id);
        byToken.set(t, list);
      }
    }
    // Только однозначные: токен, ведущий на два размера, опознанием не является.
    const out = new Map<string, number>();
    for (const [t, ids] of byToken) if (ids.length === 1) out.set(t, ids[0]);
    return out;
  }, [sizeById]);
}

// Хвостовой токен имени блока, очищенный до букв и цифр. Без всякой проверки — это кандидат,
// а не размер.
function tailToken(block: string): string {
  const parts = block.trim().split('_');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

export type MissingSize = { token: string; sizeId: number; name: string };

export function missingSizesIn(
  pieces: readonly PieceDTO[],
  dictTokens: ReadonlyMap<string, number>,
  cardSizeIds: readonly number[],
  sizeById: ReadonlyMap<number, string>,
): MissingSize[] {
  const inCard = new Set(cardSizeIds);
  const found = new Map<number, MissingSize>();
  for (const p of pieces) {
    const t = tailToken(p.blockName ?? '');
    if (!t) continue;
    const id = dictTokens.get(t);
    if (id == null || inCard.has(id)) continue;
    if (!found.has(id)) found.set(id, { token: t, sizeId: id, name: sizeById.get(id) ?? `#${id}` });
  }
  return [...found.values()];
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
  // Отрезаем хвост, ТОЛЬКО если файл действительно градуированный — то есть если размерных
  // хвостов в нём встретилось хотя бы два РАЗНЫХ.
  //
  // Иначе цена ошибки несимметрична. В файле на один размер блок «FP_L» — это левая полочка, и
  // «L» там модификатор, а не размер; отрезав его, мы слили бы левую полочку с деталью «FP» —
  // одна деталь кроя на две физических, то есть не та ткань на раскройном столе, ровно та
  // ошибка, ради которой диалог и существует. А НЕ отрезав в односайзовом файле, мы всего лишь
  // просим оператора сопоставить блоки ещё раз для следующего файла: связей станет по одной на
  // файл, что скучно, но верно.
  const graded = new Set<string>();
  for (const p of pieces) {
    const s = splitBlockSize(p.blockName ?? '', sizeTokens).size;
    if (s) graded.add(s.toLowerCase());
    if (graded.size > 1) break;
  }
  const effective = graded.size > 1 ? sizeTokens : new Map<string, number>();

  const codeById = new Map<number, BlockCode>();
  const bySize = new Map<string, PieceDTO[]>();
  for (const p of pieces) {
    const code = splitBlockSize(p.blockName ?? '', effective);
    codeById.set(p.id, code);
    const list = bySize.get(code.size) ?? [];
    list.push(p);
    bySize.set(code.size, list);
  }
  const rank = (size: string) => sizeRank(size, sizeTokens);
  const groups = [...bySize.entries()]
    .map(([size, ps]) => ({ size, pieces: ps }))
    .sort((a, b) => rank(a.size) - rank(b.size));
  return { codeById, groups };
}
