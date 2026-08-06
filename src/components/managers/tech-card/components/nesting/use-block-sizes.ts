// Размеры, закодированные в именах блоков DXF, — и разбиение разобранного файла по ним.
//
// Один DXF несёт всю градацию: BP_1_XS, BP_1_S, BP_1_M… Пока это не разделено, раскладка кладёт
// на полосу ВСЕ размеры сразу (и меряет длину, которая не относится ни к одному), а деталей
// кроя заводится по набору на каждый размер вместо одного набора на стиль.
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { useSizeNames, useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import type { PieceDTO } from 'lib/nesting/types';
import { deriveBlockSizes, sizeTokensOf, type BlockCode } from './block-code';

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
export function useDictionarySizeTokens(): Map<string, number[]> {
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
    return byToken;
  }, [sizeById]);
}

// Система размеров, в которой заведён размер: «xs_44ta_m» → «ta_m». Один токен («s») живёт в
// нескольких системах сразу, и выбирать между ними надо не жребием, а по тому, чем уже
// пользуется карточка.
function systemOf(name: string | undefined): string {
  const parts = (name ?? '').split('_');
  if (parts.length < 2) return '';
  return `${(parts[1] ?? '').replace(/\d+/g, '')}_${parts[2] ?? ''}`;
}

export type MissingSize = { token: string; sizeId: number; name: string };

// Размеры, которые есть В ФАЙЛЕ, но не заведены в карточке.
//
// Источник — токены, выведенные из структуры файла (deriveSizeTokens), а НЕ словарь: словарь
// сказал бы только, что такой размер вообще бывает, а вопрос стоит иначе — какие размеры несёт
// этот чертёж. Файл на один размер не даёт ни одного токена, и предлагать там нечего.
export function missingSizesIn(
  pieces: readonly PieceDTO[],
  dictTokens: ReadonlyMap<string, number[]>,
  cardSizeIds: readonly number[],
  sizeById: ReadonlyMap<number, string>,
): MissingSize[] {
  const inCard = new Set(cardSizeIds);
  // Системы, которыми карточка уже пользуется, — ими и разрешается неоднозначность токена.
  const cardSystems = new Set([...inCard].map((id) => systemOf(sizeById.get(id))));
  const covered = new Set<string>();
  for (const id of inCard) for (const t of sizeTokensOf(sizeById.get(id))) covered.add(t);

  const derived = new Set(
    [
      ...deriveBlockSizes(
        pieces.map((p) => p.blockName ?? ''),
        (t) => dictTokens.has(t),
      ).values(),
    ].map((raw) => raw.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()),
  );
  const found = new Map<number, MissingSize>();
  for (const token of derived) {
    if (covered.has(token)) continue; // такой размер в карточке уже есть
    const ids = dictTokens.get(token) ?? [];
    if (ids.length === 0) continue; // словарь такого размера не знает — предложить нечего
    const pick =
      ids.find((id) => cardSystems.has(systemOf(sizeById.get(id)))) ??
      (ids.length === 1 ? ids[0] : undefined);
    // Неоднозначный токен в системе, которой карточка не пользуется, оставляем человеку:
    // добавить не тот размер хуже, чем не добавить никакого.
    if (pick == null || inCard.has(pick)) continue;
    if (!found.has(pick))
      found.set(pick, { token, sizeId: pick, name: sizeById.get(pick) ?? `#${pick}` });
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
  // Порядок размеров, общий для всех потребителей: селектор, столбец «размеры», список групп.
  // Считается по СРЕДНЕЙ ПЛОЩАДИ деталей размера, а не по ряду карточки: градация монотонна,
  // XS мельче XL, — значит порядок выводится из тех же данных, что и всё остальное, и работает
  // для размеров, которых в карточке ещё нет.
  orderOfSize: Map<string, number>;
  // Токены, которые в ЭТОМ файле оказались размерами (очищенные). Ими сворачиваются к
  // идентичности старые алиасы, где размер записан прямо в имени: иначе читающая и пишущая
  // стороны разошлись бы, и «снять связь» удаляла бы не тот ключ.
  sizeTokenSet: Set<string>;
};

// Разбирает имена и раскладывает детали по размерам. Группы идут в порядке градации; группа ''
// (блоки без размерного хвоста) — последней: это остаток, а не размер.
export function splitPiecesBySize(
  pieces: readonly PieceDTO[],
  // Токены, которые ВООБЩЕ бывают размерами (весь словарь). Не ряд карточки: у карточки может
  // быть заведено M и L, а в файле лежать XS…XL — и тогда BP_S, BP_XS, BP_XL перестали бы быть
  // размерами и превратились в отдельные детали кроя вместо одной BP. Виды деталей обязаны
  // доставаться из ФАЙЛА, независимо от того, что успели завести в карточке.
  // Достаточно уметь отвечать «бывает ли такой токен размером» — подходит и Set, и Map словаря.
  dictTokens: { has(token: string): boolean },
): BlockSplit {
  // Что именно резать, решает структура файла, а не список токенов: см. deriveBlockSizes —
  // хвост обязан быть размером из словаря И меняться у своей основы, иначе «FP_L» слилась бы
  // с «FP_R» в одну деталь.
  const verdict = deriveBlockSizes(
    pieces.map((p) => p.blockName ?? ''),
    (t) => dictTokens.has(t),
  );

  const codeById = new Map<number, BlockCode>();
  const bySize = new Map<string, PieceDTO[]>();
  for (const p of pieces) {
    const raw = (p.blockName ?? '').trim();
    const size = verdict.get(raw) ?? '';
    const code: BlockCode = size
      ? { raw, identity: raw.slice(0, raw.length - size.length - 1), size }
      : { raw, identity: raw, size: '' };
    codeById.set(p.id, code);
    const list = bySize.get(code.size) ?? [];
    list.push(p);
    bySize.set(code.size, list);
  }

  // Порядок — по средней площади деталей размера. Ряд карточки для этого не годится: размеров
  // из файла в нём может не быть вовсе, а градация монотонна, так что площадь упорядочивает их
  // сама и без справочников.
  const meanArea = (ps: PieceDTO[]) =>
    ps.length === 0 ? 0 : ps.reduce((s, p) => s + p.areaCm2, 0) / ps.length;
  const groups = [...bySize.entries()]
    .map(([size, ps]) => ({ size, pieces: ps }))
    .sort((a, b) =>
      a.size === '' ? 1 : b.size === '' ? -1 : meanArea(a.pieces) - meanArea(b.pieces),
    );
  const orderOfSize = new Map(groups.map((g, i) => [g.size, g.size === '' ? 1e6 : i]));
  const sizeTokenSet = new Set(
    [...verdict.values()].map((raw) => raw.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()),
  );
  return { codeById, groups, orderOfSize, sizeTokenSet };
}
