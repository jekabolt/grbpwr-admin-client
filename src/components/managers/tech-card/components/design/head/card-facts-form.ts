import type { common_Category } from 'api/proto-http/admin';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import { detailKeyLabel } from '../../tech-card-options';
import type { CardFacts } from '../core/card-facts';
import { categoryChain, fitLabel, fitsForTopCategory, topCategoryName } from '../fit-vocabulary';

/**
 * ═══ ФАКТЫ КАРТОЧКИ ИЗ ФОРМЫ — ОДИН ЧИТАТЕЛЬ ДЛЯ ВСЕХ КНОПОК `ai ✦` (волна 25.09, DEEP-03) ═══════
 *
 * `core/card-facts.ts` — композитор строк (порядок, лимит, обрезка), и он нарочно не читает форму.
 * Здесь — обратная половина: ОДНО чтение формы в `CardFacts`. Без него каждая кнопка `ai ✦`
 * (DESCRIPTION, SILHOUETTE, FABRIC) собирала бы факты сама и отдавала модели разное про одну
 * карточку.
 *
 * `isBoard` приходит пропом, а не импортом `isBoardRow`: этот файл читают и доска
 * (`mood-board.tsx`), и GENERAL INFORMATION, а импорт доски отсюда завёл бы цикл
 * `mood-board → card-facts-form → mood-board`. Правило «что стоит на доске» по-прежнему одно — его
 * передаёт тот, кто им владеет.
 */

/**
 * ПУТЬ КАТЕГОРИИ ПО СЛОВАРЮ — лист вверх до верхней категории, имена в порядке пути:
 * `bottoms › pants › cargo`. Прогулка по `parentId` одна на админку — `categoryChain` словаря
 * посадок (`../fit-vocabulary.ts`, её же читает CARD DETAILS); здесь только имена. Имени нет —
 * `#id`, а не пропуск: путь, потерявший звено молча, выглядел бы другой категорией.
 */
export function categoryPathOf(
  categories: readonly common_Category[] | undefined,
  leafId: number | null | undefined,
): string[] {
  if (!leafId || leafId <= 0) return [];
  return categoryChain(categories, leafId).map((c) => (c.name ?? '').trim() || `#${c.id}`);
}

/**
 * ═══ НЕСЁТ ЛИ ВЕЩЬ ПОСАДКУ — ПРАВИЛО CARD DETAILS, НЕ ВТОРОЕ (волна 25.09, T02 × D-07) ══════════
 *
 * CARD DETAILS прячет FIT у aux-карты и у верхних категорий accessories · shoes · bags · objects
 * (`fitsForTopCategory` → `null`), а у остальных предлагает посадки СЕМЕЙСТВА. Два читателя здесь
 * обязаны знать то же самое: GENERAL INFORMATION (печать посадки) и черновик construction, который
 * с этой волны ПИШЕТ посадку сам в пустое поле, — иначе он вписал бы `relaxed` сумке в поле, которого
 * человек не видит, и оно уехало бы в UpdateStyle.
 *
 * `null` — посадки у вещи нет; массив — ключи, которые вещь может нести. Категории нет или словарь
 * её не знает — весь словарь (так же решает CARD DETAILS).
 */
export function fitKeysFor(
  categories: readonly common_Category[] | undefined,
  categoryId: number | null | undefined,
  isAux: boolean,
): readonly string[] | null {
  if (isAux) return null;
  const choices = fitsForTopCategory(topCategoryName(categories, categoryId));
  return choices ? choices.map((c) => c.key) : null;
}

/** `fitKeysFor` над живой формой и словарём. Ссылка стабильна, пока не сменились категория/purpose. */
export function useFitKeys(): readonly string[] | null {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const isAux = useWatch({ control, name: 'purpose' }) === 'TECH_CARD_PURPOSE_AUXILIARY';
  return useMemo(
    () => fitKeysFor(dictionary?.categories, categoryId, isAux),
    [dictionary?.categories, categoryId, isAux],
  );
}

type BoardRowLike = { mediaId: number; kind?: string };
type CalloutLike = { mediaId?: number; description?: string | null };
type DetailLike = { key?: string; text?: string | null };
type BomLike = { name?: string | null; composition?: string | null };

/** Аспекты, которые GENERAL INFORMATION правит своими полями, — в контексте они стоят именами. */
const GENERAL_KEYS = new Set(['silhouette', 'fabric']);

/** Факты карточки в том виде, в каком их ждёт `cardFactsContext`. */
export function useCardFacts(isBoard: (row: BoardRowLike) => boolean): CardFacts {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  // Посадка уходит модели СЛОВОМ (`fitLabel`, как её печатает сторфронт и как её отдаёт NOTE в
  // CARD DETAILS) и не уходит вовсе, когда вещь посадки не несёт (`useFitKeys`).
  const fitShown = useFitKeys() !== null;
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const details = (useWatch({ control, name: 'details' }) ?? []) as DetailLike[];
  const board = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardRowLike[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as CalloutLike[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLike[];

  return useMemo(() => {
    const text = (key: string) => (details.find((d) => d.key === key)?.text ?? '').trim();
    const boardIds = new Set(
      board
        .filter(isBoard)
        .map((r) => Number(r.mediaId) || 0)
        .filter((id) => id > 0),
    );
    return {
      categoryPath: categoryPathOf(dictionary?.categories, categoryId).join(' › '),
      fit: fitShown ? fitLabel(fit) : '',
      concept,
      silhouette: text('silhouette'),
      fabric: text('fabric'),
      aspects: details
        .filter((d) => d.key && !GENERAL_KEYS.has(d.key) && (d.text ?? '').trim())
        .map((d) => [detailKeyLabel(d.key), (d.text ?? '').trim()] as [string, string]),
      callouts: callouts
        .filter((c) => boardIds.has(c.mediaId ?? 0))
        .map((c) => (c.description ?? '').trim())
        .filter(Boolean),
      // Состав привязанной строки — снимок каталога в JSON; модели уходит его читаемая проекция
      // (та же, что на бумаге), а неразборный снимок не уходит вовсе.
      materials: bomItems
        .map((b) =>
          [(b.name ?? '').trim(), formatCompositionCell(b.composition ?? '')]
            .filter(Boolean)
            .join(' · '),
        )
        .filter(Boolean),
    };
  }, [
    dictionary?.categories,
    categoryId,
    fit,
    fitShown,
    concept,
    details,
    board,
    callouts,
    bomItems,
    isBoard,
  ]);
}
