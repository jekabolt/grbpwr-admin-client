// Размеры, закодированные в именах блоков DXF, — и разбиение разобранного файла по ним.
//
// Один DXF несёт всю градацию: BP_1_XS, BP_1_S, BP_1_M… Пока это не разделено, раскладка кладёт
// на полосу ВСЕ размеры сразу (и меряет длину, которая не относится ни к одному), а деталей
// кроя заводится по набору на каждый размер вместо одного набора на стиль.
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import type { PieceDTO } from 'lib/nesting/types';
import { deriveBlockSizes, sizeTokensOf } from './block-code';
import { manifestFactsOf } from './manifest-facts';

// Чистая половина (splitPiecesBySize, aliasIdentity) живёт в split-pieces.ts: публичному вьюеру
// выкроек нужна она БЕЗ хуков словаря этого файла. Реэкспорт сохраняет всех прежних импортёров.
export { aliasIdentity, splitPiecesBySize } from './split-pieces';
export type { BlockSplit, SizeGroup } from './split-pieces';

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

// РАЗМЕР ИЗ МАНИФЕСТА ДОВЕРЕН, ТОЛЬКО ЕСЛИ ОН ИЗ СИСТЕМЫ РАЗМЕРОВ ЭТОЙ КАРТОЧКИ (F14 MAJOR 4).
// Манифест сверен с ЧЕРТЕЖОМ, но не с карточкой: файл, сконвертированный для другой карточки (тот же
// стиль, другой сезон или другая система размеров) и залитый сюда через «+ DXF», молча дописал бы
// ряд ЧУЖИМИ id. Правило то же, что у пути по токенам: неоднозначность решает система, которой
// карточка уже пользуется. Карточка без размеров ничему не противоречит — там манифест верен.
function manifestSizeTrusted(
  sizeId: number,
  cardSystems: ReadonlySet<string>,
  sizeById: ReadonlyMap<number, string>,
): boolean {
  if (cardSystems.size === 0) return true;
  const name = sizeById.get(sizeId);
  return name != null && cardSystems.has(systemOf(name));
}

/** Manifest sizes refused because they are outside this card's size system(s): their names. */
export function foreignManifestSizes(
  pieces: readonly PieceDTO[],
  cardSizeIds: readonly number[],
  sizeById: ReadonlyMap<number, string>,
): string[] {
  const inCard = new Set(cardSizeIds);
  const cardSystems = new Set([...inCard].map((id) => systemOf(sizeById.get(id))));
  const out = new Map<number, string>();
  for (const p of pieces) {
    const m = manifestFactsOf(p);
    if (!m || m.sizeId <= 0 || inCard.has(m.sizeId) || out.has(m.sizeId)) continue;
    if (!manifestSizeTrusted(m.sizeId, cardSystems, sizeById))
      out.set(m.sizeId, sizeById.get(m.sizeId) ?? `#${m.sizeId}`);
  }
  return [...out.values()];
}

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

  // Блоки файла с манифестом в вывод не идут — их размеры заявлены, а не выведены (тот же отсев,
  // что в splitPiecesBySize: три входа deriveBlockSizes обязаны видеть один и тот же набор имён).
  // Исключение — блок, чей заявленный размер вне системы карточки (manifestSizeTrusted): заявке
  // не верим, и его размер выводится по имени, как у чужого файла.
  const trustedManifest = (p: PieceDTO) => {
    const m = manifestFactsOf(p);
    return (
      !!m &&
      (m.sizeId <= 0 ||
        inCard.has(m.sizeId) ||
        manifestSizeTrusted(m.sizeId, cardSystems, sizeById))
    );
  };
  const derived = new Set(
    [
      ...deriveBlockSizes(
        pieces.filter((p) => !trustedManifest(p)).map((p) => p.blockName ?? ''),
        (t) => dictTokens.has(t),
      ).values(),
    ].map((raw) => raw.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()),
  );
  const found = new Map<number, MissingSize>();
  // РАЗМЕРЫ ИЗ МАНИФЕСТА (F6b) — уже id размеров карточки, выбранные человеком в мастере
  // конвертации. Угадывать по токену нечего, и одноразмерный файл (вывод по структуре там молчит —
  // хвостов меньше двух) называет свой размер так же, как многоразмерный.
  for (const p of pieces) {
    const m = manifestFactsOf(p);
    if (!m || m.sizeId <= 0 || inCard.has(m.sizeId) || found.has(m.sizeId)) continue;
    if (!manifestSizeTrusted(m.sizeId, cardSystems, sizeById)) continue; // → вывод по имени выше
    const name = sizeById.get(m.sizeId);
    if (name == null) continue; // словарь такого размера не знает — заводить нечего
    found.set(m.sizeId, {
      token: m.size.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase(),
      sizeId: m.sizeId,
      name,
    });
  }
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
