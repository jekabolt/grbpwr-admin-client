// КОНТУР ПО ДЕТАЛИ КРОЯ — одна сборка на карточку для всех, кто печатает имена деталей.
//
// Арифметика здесь не «удобная», а ОБЩАЯ: та же пачка (card-dxf-pack.ts), тот же индекс, те же
// связи (piece-block-refs.ts) и тот же findPiece, которыми рисует плитки вкладка деталей кроя.
// Своя эвристика у любого читателя разошлась бы молча — одна и та же деталь получила бы на одном
// экране один силуэт, на другом другой, и заметить это было бы нечем. Раньше эту цепочку держал
// приватно рецепт колорвея; вкладка сборки стала вторым читателем, и цепочка переехала сюда
// целиком, а не была переписана рядом.
//
// `enabled` — это АРМИРОВАНИЕ, а не «нужны ли данные» (см. шапку useDxfGeometry): false означает
// «сами ничего не качаем, но уже разобранную соседом пачку рисуем сразу», true — «этот экран
// заказал разбор». Поэтому пассивный читатель на холодной карточке не стоит ни одного запроса.
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { findPiece, useDxfGeometry, useDxfIndex, type FoundPiece } from './nesting/dxf-geometry';
import { pieceBlockRefs, rollGoodsScopes, type PieceAliasRow } from './piece-block-refs';
import type { TechCardFormData } from './schema';

/** Ключ — `pieceRefKey(lineKey)` детали. Читатели обязаны сворачивать ключ тем же правилом. */
export type PieceShapeMap = Map<string, FoundPiece | null> | null;

export type PieceShapes = {
  /**
   * Контуры деталей. null — разбора НЕТ ВОВСЕ (кэш холодный или не разобралось): «карта пустая» и
   * «карты ещё нет» — разные ответы, и второй не должен читаться как «ни одна деталь не найдена».
   */
  shapeByKey: PieceShapeMap;
  /** У карточки вообще есть DXF. Без них силуэты предлагать нечем — и не надо. */
  hasDxf: boolean;
  /**
   * Сколько деталей реально получили контур. Ноль при готовом разборе — это ОТВЕТ, а не пустота:
   * файлы разобраны, но ни одна деталь кроя не сопоставлена с блоком, — и сказать это надо вслух,
   * иначе экран, за который заплатили скачиванием, молча остаётся вчерашним.
   */
  foundCount: number;
  /** Разбор идёт прямо сейчас — свой или заказанный соседним экраном: запрос-то один на пачку. */
  isLoading: boolean;
  error: Error | null;
};

export function usePieceShapes(enabled: boolean): PieceShapes {
  const pieceAliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as PieceAliasRow[];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, enabled);
  const index = useDxfIndex(geometry.data);
  const scopes = useMemo(() => rollGoodsScopes(bomItems ?? []), [bomItems]);
  const refsByPiece = useMemo(() => pieceBlockRefs(pieceAliases, scopes), [pieceAliases, scopes]);
  // Ссылка на карту СТАБИЛЬНА, пока не поменялись разбор или связи: её тянут пропом через рельс из
  // двадцати строк и редактор, который перерисовывается на каждый символ, и пересборка карты на
  // каждый рендер обнулила бы memo у PieceShape в каждой строке.
  const shapeByKey = useMemo(() => {
    if (!index) return null;
    const m = new Map<string, FoundPiece | null>();
    for (const [key, refs] of refsByPiece) m.set(key, findPiece(index, refs));
    return m;
  }, [index, refsByPiece]);

  return {
    shapeByKey,
    hasDxf: pack.length > 0,
    // Считается по ЖИВЫМ значениям, а не по размеру карты: ключ в ней заводит любая связь, в том
    // числе такая, чей блок в файлах не нашёлся, — и `size > 0` означал бы «контуры есть» ровно
    // там, где их нет ни одного.
    foundCount: shapeByKey ? [...shapeByKey.values()].filter(Boolean).length : 0,
    // isFetching, а не isLoading: разбор мог уже идти по заказу вкладки PATTERNS, и тогда
    // предлагать нажать «показать силуэты» бессмысленно — надо сказать «идёт».
    isLoading: geometry.isFetching,
    error: geometry.error,
  };
}
