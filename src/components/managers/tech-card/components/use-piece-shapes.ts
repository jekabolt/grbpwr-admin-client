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
import { aliasIdentity } from './nesting/use-block-sizes';
import type { OrphanBlockCandidate } from './orphan-pieces';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
  type PieceAliasRow,
} from './piece-block-refs';
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
  /**
   * Сколько контуров в разобранных файлах и у скольких из них есть имя блока (null — разбора нет).
   * Ноль контуров — пустой файл (`*.usdz.dxf`); контуры без единого имени — файл, где деталь не
   * с чем сопоставить. Это два разных «не прочитать», и каждое говорится своими словами.
   */
  parsedPieces?: number | null;
  namedBlocks?: number | null;
  /** Current DXF identities that no live cut piece owns, ready for the inline relink picker. */
  unlinkedBlocks?: OrphanBlockCandidate[];
  /** Разбор идёт прямо сейчас — свой или заказанный соседним экраном: запрос-то один на пачку. */
  isLoading: boolean;
  error: Error | null;
};

export function usePieceShapes(enabled: boolean): PieceShapes {
  const pieceAliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as PieceAliasRow[];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const pieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ??
    []) as TechCardFormData['pieces'];
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
  const unlinkedBlocks = useMemo<OrphanBlockCandidate[]>(() => {
    if (!index || !geometry.data) return [];
    const livePieceKeys = new Set((pieces ?? []).map((piece) => pieceRefKey(piece.lineKey ?? '')));
    const linked = new Set<string>();
    for (const [pieceKey, refs] of refsByPiece) {
      if (!livePieceKeys.has(pieceKey)) continue;
      for (const ref of refs) {
        const identity = aliasIdentity(ref.block, index.split);
        if (identity) linked.add(`${ref.scopeKey}|${identity.toLowerCase()}`);
      }
    }

    const out: OrphanBlockCandidate[] = [];
    for (const [key, bySize] of index.byKey) {
      if (linked.has(key) || bySize.size === 0) continue;
      const sizes = [...bySize.keys()].sort(
        (a, b) => (index.split.orderOfSize.get(a) ?? 1e6) - (index.split.orderOfSize.get(b) ?? 1e6),
      );
      const list = bySize.get(sizes[Math.floor((sizes.length - 1) / 2)]) ?? [];
      const onLayer = list.filter((piece) => (piece.layer ?? '') === index.contourLayer);
      const piece = (onLayer.length > 0 ? onLayer : list)[0];
      if (!piece) continue;
      const code = index.split.codeById.get(piece.id);
      const block = (code?.identity ?? piece.blockName ?? '').trim();
      const scopeKey = geometry.data.scopeByFile.get(piece.fileIndex ?? -1) ?? '';
      if (!block || !scopeKey) continue;
      out.push({ key, scopeKey, block, piece });
    }
    return out;
  }, [index, geometry.data, pieces, refsByPiece]);

  return {
    shapeByKey,
    hasDxf: pack.length > 0,
    // Считается по ЖИВЫМ значениям, а не по размеру карты: ключ в ней заводит любая связь, в том
    // числе такая, чей блок в файлах не нашёлся, — и `size > 0` означал бы «контуры есть» ровно
    // там, где их нет ни одного.
    foundCount: shapeByKey ? [...shapeByKey.values()].filter(Boolean).length : 0,
    parsedPieces: geometry.data ? geometry.data.pieces.length : null,
    namedBlocks: index ? index.byKey.size : null,
    unlinkedBlocks,
    // isFetching, а не isLoading: разбор мог уже идти по заказу вкладки PATTERNS, и тогда
    // предлагать нажать «показать силуэты» бессмысленно — надо сказать «идёт».
    isLoading: geometry.isFetching,
    error: geometry.error,
  };
}
