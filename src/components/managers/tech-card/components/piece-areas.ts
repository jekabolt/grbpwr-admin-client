import { adminService } from 'api/api';
import { extractFieldViolations } from 'utils/field-errors';
import type { DxfPieceAreaRow } from './nesting/dxf-consumption';
import { serverScopeKeyOfSheet } from './pattern-size-index';

// ПУБЛИКАЦИЯ ПЛОЩАДЕЙ ДЕТАЛЕЙ (Ф0, 0297) — то, из чего сервер выводит норму расхода сам.
//
// ЗАЧЕМ ЭТО ВООБЩЕ ЕДЕТ НА СЕРВЕР. Карточка может быть заполнена целиком — спецификация с ценами,
// разобранные выкройки, назначение каждой детали на ткань в рецепте — и всё равно стоить НОЛЬ:
// деньги считает только строка рецепта с явно вписанной нормой, а строка, привязанная к детали,
// нормы не несёт (T8). Не хватало ровно площади, и существовала она только здесь, в памяти
// вкладки, потому что DXF разбирает браузер и только браузер.
//
// ЧТО ЕДЕТ: площадь ОДНОГО ЭКЗЕМПЛЯРА контура. Количество на изделие живёт на детали, меняется
// отдельной правкой карточки и к геометрии файла отношения не имеет — умножает читатель. Отправить
// уже умноженное значило бы записать кратность внутрь геометрии и получить число, которое молча
// врёт после первой же правки «этой детали идёт две».
//
// ЧТО НЕ ЕДЕТ: отпечаток набора листов. Его считает СЕРВЕР по своим строкам, и именно поэтому
// заявить покрытие по файлам, которых нет, отсюда нельзя, а перезаливка любого листа делает площади
// устаревшими сама, без чьего-либо участия.

export type PublishPieceAreasResult =
  | { ok: true; stored: number }
  | { ok: false; reason: string };

/**
 * Публикует площади ОДНОГО скоупа ткани.
 *
 * Возвращает результат, а не бросает: замер — это то, что вкладка уже посчитала и показала. Сорванная
 * публикация не имеет права выглядеть как провал самого разбора.
 *
 * КОМПЛЕКТ ОБЯЗАН БЫТЬ ПОЛНЫМ, и проверяет это сервер: он сверяет присланные детали с привязками
 * блоков своего скоупа в обе стороны. Недостающая деталь занижает площадь изделия, заниженная
 * площадь занижает норму, и обнаруживается это на складе, а не на экране. Поэтому здесь нет и не
 * должно быть «отправим что нашлось».
 */
export async function publishPieceAreas(args: {
  techCardId: number;
  scopeKey: string;
  sheets: { lineKey?: string; fabricPurpose?: string; bomLineKey?: string }[];
  areas: DxfPieceAreaRow[];
  contourLayer: string;
  seamAllowanceMm: number;
  /** Детали, у которых контур заменён выпуклой оболочкой при раздутии припуском. */
  hulledPieceKeys?: Set<string>;
  /** Детали, у которых на слое было несколько совпадающих кандидатов. */
  ambiguousPieceKeys?: Set<string>;
}): Promise<PublishPieceAreasResult> {
  const scopeKey = args.scopeKey.trim();
  if (!scopeKey) return { ok: false, reason: 'не определён скоуп ткани' };
  const rows = args.areas.filter((a) => a.pieceLineKey && a.areaCm2 > 0);
  if (rows.length === 0) {
    return { ok: false, reason: 'разбор не дал ни одной площади — проверьте слой контура и связи блоков с деталями' };
  }
  // Листы ЭТОГО скоупа, названные так, как их хранит сервер. Он сверит набор со своим и откажет при
  // расхождении: площади, посчитанные по другому набору файлов, отвечали бы за файлы, которых никто
  // не читал.
  const sheetLineKeys = args.sheets
    .filter((sh) => serverScopeKeyOfSheet(sh) === scopeKey)
    .map((sh) => (sh.lineKey ?? '').trim())
    .filter(Boolean);
  if (sheetLineKeys.length === 0) {
    return { ok: false, reason: 'у этой ткани нет листов выкроек на сервере' };
  }
  try {
    const res = await adminService.SaveTechCardPieceAreas({
      techCardId: args.techCardId,
      scopeKey,
      sheetLineKeys,
      contourLayer: args.contourLayer,
      seamAllowanceMm: { value: String(args.seamAllowanceMm) },
      areas: rows.map((a) => ({
        pieceLineKey: a.pieceLineKey,
        sizeId: a.sizeId,
        areaCm2: { value: a.areaCm2.toFixed(2) },
        hulled: args.hulledPieceKeys?.has(a.pieceLineKey) ?? false,
        ambiguousPick: args.ambiguousPieceKeys?.has(a.pieceLineKey) ?? false,
      })),
    });
    return { ok: true, stored: Number(res?.stored ?? rows.length) };
  } catch (e) {
    const violations = extractFieldViolations(e);
    const first = violations.length > 0 ? violations[0].description : "";
    return { ok: false, reason: first || 'сервер не принял замер площадей' };
  }
}
