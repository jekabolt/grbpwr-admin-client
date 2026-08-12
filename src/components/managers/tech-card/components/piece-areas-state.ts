// СОСТОЯНИЕ ЗАМЕРА ПЛОЩАДЕЙ ПО СКОУПАМ ТКАНИ — читается ТОЛЬКО из ответа сервера.
//
// Свежесть замера считает сервер и никто больше: он сверяет отпечаток источника (набор листов И
// привязки блок→деталь), посчитанный СЕЙЧАС, с тем, под которым мерили, и отдаёт `stale` прямо на
// чтении карточки. Своё, клиентское понятие свежести здесь было бы вторым правилом на тот же
// вопрос — и первым же расхождением превратилось бы в экран, который уверенно говорит «замерено» о
// замере, который сервер считает устаревшим (или наоборот).
//
// КЛЮЧ СКОУПА ЗДЕСЬ — СЕРВЕРНЫЙ. Клиент пишет назначение именем proto-энума
// («TECH_CARD_BOM_PURPOSE_MAIN»), сервер — строчным значением («main»); совпадает только РАЗБИЕНИЕ,
// не написание (см. pattern-size-index.ts). Поэтому всё сравнение идёт в серверных словах, а на
// клиентские ключи переводится один раз, у самого экрана.
import type {
  common_TechCardPieceAreaScope,
  common_TechCardSizePattern,
} from 'api/proto-http/admin';
import { isDxfUrl } from 'utils/pattern';
import type { FabricScope, RollGoodsLine } from './bom-purpose';
import { serverScopeKeyOfSheet, wireFabricPurpose } from './pattern-size-index';

type Measured = { pieces: number; contourLayer: string; seamMm: string };

export type ScopeAreaState =
  /** Замера нет вовсе — костингу нечем оценить расход по геометрии. */
  | { phase: 'none' }
  /** Замер есть и сервер считает его актуальным. */
  | ({ phase: 'fresh' } & Measured)
  /** Замер есть, но источник менялся после него: выкройки перезалили или переставили связи. */
  | ({ phase: 'stale' } & Measured)
  /** Замерена ЧАСТЬ скоупов группы — остальные сервер не знает вовсе. */
  | ({ phase: 'partial'; missing: number } & Measured);

/**
 * Состояние замера набора серверных скоупов (обычно — одного).
 *
 * Набор, а не один ключ: панель выкроек группирует листы по РАЗРЕШЁННОМУ скоупу, и на
 * полуразобранной карточке одна группа законно накрывает несколько серверных скоупов (часть листов
 * привязана к назначению, часть ещё к строке BOM).
 *
 * ОТВЕЧАТЬ «ЗАМЕРЕНО» МОЖНО ТОЛЬКО ЗА КАЖДЫЙ ЗАПРОШЕННЫЙ КЛЮЧ. Прежняя проверка «нашёлся хоть один
 * и ни один не протух» объявляла свежей группу, у которой замерен один скоуп из двух: на экране
 * зелёный ответ, в расчёте — половина деталей. Устаревший замер в любом из них устаревает ответ
 * целиком по той же причине.
 *
 * СЧИТАЮТСЯ РАЗЛИЧНЫЕ ДЕТАЛИ, А НЕ СТРОКИ. Градуированная деталь несёт строку на каждый размер, и
 * сумма строк («замерено 40») читалась бы как число деталей, которого на карточке нет.
 */
export function scopeAreaState(
  serverKeys: readonly string[],
  areaScopes: readonly common_TechCardPieceAreaScope[] | undefined,
): ScopeAreaState {
  const wanted = new Set(serverKeys.map((k) => k.trim()).filter(Boolean));
  if (wanted.size === 0) return { phase: 'none' };
  const mine = (areaScopes ?? []).filter((s) => wanted.has((s.scopeKey ?? '').trim()));
  if (mine.length === 0) return { phase: 'none' };
  const distinctPieces = new Set<string>();
  for (const s of mine) {
    for (const a of s.areas ?? []) {
      const key = (a.pieceLineKey ?? '').trim();
      if (key) distinctPieces.add(key);
    }
  }
  // Условия показываются по ПЕРВОМУ скоупу набора: одна транзакция замера пишет их на скоуп
  // целиком, и в обычном случае (набор из одного скоупа) это ровно те условия, что и были.
  const head = mine[0];
  const shape: Measured = {
    pieces: distinctPieces.size,
    contourLayer: (head.contourLayer ?? '').trim(),
    seamMm: (head.seamAllowanceMm?.value ?? '').trim(),
  };
  if (mine.some((s) => !!s.stale)) return { phase: 'stale', ...shape };
  const found = new Set(mine.map((s) => (s.scopeKey ?? '').trim()));
  const missing = [...wanted].filter((k) => !found.has(k)).length;
  return missing > 0 ? { phase: 'partial', missing, ...shape } : { phase: 'fresh', ...shape };
}

/**
 * Серверные ключи скоупа так, как их видят сами ЛИСТЫ этой группы.
 *
 * Считается по листам, а не по назначению группы, и это единственный честный способ: сервер
 * складывает площади под ключом, который выводит из СЫРОЙ привязки листа, а группа на экране
 * собрана по разрешённой. У разложенной карточки оба ответа совпадают; у полуразобранной — нет, и
 * тогда ключей два.
 */
export function serverScopeKeysOfSheets(
  sheets: readonly { fabricPurpose?: string; bomLineKey?: string }[],
): string[] {
  return [...new Set(sheets.map(serverScopeKeyOfSheet).filter(Boolean))];
}

/**
 * Серверный ключ скоупа СО СТОРОНЫ BOM — то есть тот, под которым слот будет искать площади.
 *
 * Именно он, а не ключ, вычитанный из листов: площади читает СЛОТ, и разложенный в назначение слот
 * ищет их под назначением. Замер, сложенный под ключом строки, такой слот не найдёт никогда.
 */
export function serverKeyOfScope(scope: FabricScope<RollGoodsLine>): string {
  return scope.byPurpose ? wireFabricPurpose(scope.key) : scope.key.trim();
}

/**
 * Скоупы ткани, у которых ЕСТЬ выкройки в DXF, но НЕТ ГОДНОГО замера площадей — то, из-за чего слот
 * с деталями остаётся без цены, когда нормы «на изделие» никто не вписал.
 *
 * УСТАРЕВШИЙ ЗАМЕР СЧИТАЕТСЯ ОТСУТСТВУЮЩИМ, и это не строгость ради строгости: `stale` означает, что
 * отпечаток источника разошёлся, то есть площади отвечают за другой набор файлов или другие связи.
 * Считать такой скоуп «замеренным» значило бы промолчать ровно там, где надо сказать «перемерьте».
 * Если сервер всё же посчитал по ним оценку, вызывающий это увидит сам — по `has_estimate`, — и
 * строку не покажет.
 *
 * Считается по ответу сервера (листы карточки + опубликованные скоупы площадей), потому что
 * спрашивает об этом вкладка костинга, у которой ни разбора DXF, ни рецептов колорвеев нет.
 * Возвращает СЕРВЕРНЫЕ ключи — называть их человеку должен вызывающий, у него есть BOM.
 */
export function unmeasuredDxfScopeKeys(
  sheets: readonly common_TechCardSizePattern[] | undefined,
  areaScopes: readonly common_TechCardPieceAreaScope[] | undefined,
): string[] {
  const measured = new Set(
    (areaScopes ?? [])
      .filter((s) => !s.stale)
      .map((s) => (s.scopeKey ?? '').trim())
      .filter(Boolean),
  );
  const withDxf = new Set<string>();
  for (const sh of sheets ?? []) {
    // PDF наследия сюда не считается: замерить площадь по нему нечем, и звать за этим на вкладку
    // выкроек значило бы требовать невозможного.
    if (!sh.url || !isDxfUrl(sh.url)) continue;
    const key = serverScopeKeyOfSheet(sh);
    if (key) withDxf.add(key);
  }
  return [...withDxf].filter((k) => !measured.has(k));
}
