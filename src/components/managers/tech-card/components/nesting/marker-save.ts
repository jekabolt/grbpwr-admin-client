// ЗАПИСЬ ПОСЧИТАННОГО ЗАДАНИЯ В РАСКЛАДКУ — один писатель на всех, кто считает БЕЗ МОДАЛКИ.
//
// Заданий, посчитанных планировщиком (`batch-marker-plan`), теперь два заказчика: очередь раскроя
// партии (вкладка костинга) и «раскладка комплекта» на карточке ткани в рецепте колорвея. Пэйлоад
// `SaveTechCardMarker` — это тридцать полей, из которых половина хранит УСЛОВИЯ СЪЁМКИ (припуск,
// слой, долевая, политика переворота, кромка), и вторая копия этого списка разошлась бы с первой
// молча: пропущенное поле сервер читает как «сохрани что было» либо как «не записано», а на экране
// раскладка всё равно выглядит нормой. Поэтому список ровно один и живёт здесь.
//
// ЧТО ОСТАЁТСЯ ПАРАМЕТРОМ — только `provenanceNote`: чем именно снята эта геометрия. Строка уезжает
// В САМ БЛОБ, а не только на экран, потому что раскладку открывают через месяцы, и «настил на одно
// изделие» против «настил партии» — это разница между нормой с запасом и реальным раскроем.
//
// МОДАЛКА СЮДА НЕ ХОДИТ, и это не недоделка: у неё нет `MarkerJob` (состав, слой, припуск и ширина
// там — состояние формы, которое оператор правит руками), и приведение её к заданию означало бы
// переписать модалку, а не переиспользовать код.
import { adminService } from 'api/api';
import type { common_TechCardMarkerInsert } from 'api/proto-http/admin';
import { allowsFlip, NEST_DEFAULTS, type NestResult } from 'lib/nesting/types';
import type { MarkerJob } from './batch-marker-plan';
import { buildMarkerLayout, dec, legacyPairOf } from './marker-io';

export type MarkerSaveArgs = {
  job: MarkerJob;
  result: NestResult;
  /** Адрес листа по его имени — провенанс детали в блобе (ключ — имя листа, см. dxf-by-scope). */
  urlBySource: Map<string, string>;
  /**
   * Чем снята геометрия, СЛОВАМИ и в блоб. Обязательна: раскладка без этой строки не отвечает на
   * вопрос «это норма с запасом или реальный настил», а по числам эти два случая неразличимы.
   */
  provenanceNote: string;
};

export function markerInsertFromJob({
  job,
  result,
  urlBySource,
  provenanceNote,
}: MarkerSaveArgs): common_TechCardMarkerInsert {
  const composition = job.composition;
  // КОЛИЧЕСТВО ДЕТАЛИ НА ОДНО ИЗДЕЛИЕ — здесь всегда 1, и это не упрощение. Блоб хранит именно
  // «сколько раз эта деталь кроится на изделие», а тираж состава сервер накладывает сам (деталь с
  // size_id — q своего размера, деталь без него — total_units). Задание дублей на изделие не
  // заводит: их источник — ручная правка в модалке, которой на этом пути нет.
  const perSetQty = new Map<number, number>(job.config.pieces.map((p) => [p.pieceId, 1]));
  const layout = buildMarkerLayout({
    pieces: job.pieces,
    perSetQty,
    urlBySource,
    result: {
      ...result,
      warnings: [
        ...result.warnings,
        job.seamAllowanceMm > 0
          ? `seam allowance: ${job.seamAllowanceMm.toFixed(1)} mm (${job.seamAllowanceWhy}) — the CUT contour was saved`
          : 'seam allowance: 0 — the SEAM LINE was nested, consumption is understated against the cut',
        provenanceNote,
      ],
    },
    unit: job.detectedUnit,
    config: {
      targetLengthCm: undefined,
      // Ступень упрощения, которую движок ВЗЯЛ, а не которую просили: он грубит её сам, когда
      // задание не тянет запрошенную точность, и записать запрос значило бы соврать тому, кто
      // попробует воспроизвести этот маркер.
      rdpEpsCm: result.telemetry?.rdpEpsCm ?? NEST_DEFAULTS.rdpEpsCm,
      timeBudgetMs: job.config.timeBudgetMs,
    },
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
    parseWarnings: job.parseWarnings,
    composition,
    // ДЕТАЛЬ КРОЯ ЗА КАЖДЫМ КОНТУРОМ — тем же правилом, что у модалки (piece-selection.ts). Без
    // него сохранённая раскладка держится на ИМЕНИ БЛОКА и перестаёт сходиться после
    // переименования детали, а раскладки этого пути становятся НОРМАМИ уже сегодня.
    pieceLineKeyById: job.pieceLineKeyById as Map<number, string>,
    // Размер градации каждой детали. Нужен смешанному настилу (сервер отвергает деталь, чей размер
    // не назван в составе), и buildMarkerLayout сам решает, писать ли его: у однородного состава
    // блоб обязан остаться байт в байт прежним.
    sizeIdByPieceId: job.sizeIdByPieceId,
  });
  const pair = legacyPairOf(composition);
  return {
    // СОГЛАСИЕ СОХРАНИТЬ НЕПОЛНУЮ УКЛАДКУ (0299) — даётся ВСЕГДА, и это осознанно.
    //
    // Поле НЕ ОПИСЫВАЕТ раскладку: колонку сервер выводит сам из пары placed_count/total_count и с
    // запроса её не копирует. То есть `true` на полной укладке хранит обычную раскладку, а
    // пересчёт, уложивший всё, снимает признак сам собой. Это ПОЛИТИКА («неполная укладка
    // сохраняется черновиком, а не выбрасывается»), а не суждение о конкретном результате.
    isDraft: true,
    // ВЛАДЕЛЕЦ РАСКЛАДКИ — решение планировщика, а не этого места. Размерная норма карточная (0):
    // прогонная нормой быть не может (chk_tcm_run_not_norm) и умирает вместе с прогоном.
    productionRunId: job.productionRunId,
    sizeId: pair.sizeId,
    // Имя выдал ПЛАНИРОВЩИК: только он видит разом все задания и все сегодняшние раскладки
    // карточки, а уникальность у сервера — (карточка, прогон, размер, имя), и её нарушение
    // приходит отказом ПОСЛЕ полностью оплаченного прогона.
    name: job.markerName,
    source: 'auto',
    bomLineKey: job.bomLineKey,
    colorwayId: job.colorwayId,
    fabricWidthCm: dec(job.widthCm),
    gapCm: dec(job.config.gapCm),
    edgeMarginCm: dec(job.config.edgeMarginCm),
    selvedgeCm: dec(job.selvedgeCm),
    allowCrossGrain: job.config.allowCrossGrain,
    seamAllowanceMm: dec(job.seamAllowanceMm),
    // `undefined` = «не мерялось», и это НЕ ноль: на выдуманном нуле костинг посчитал бы расход по
    // контуру, который на самом деле уже раздут.
    contourAllowanceMm: job.contourAllowanceMm != null ? dec(job.contourAllowanceMm) : undefined,
    contourLayer: job.contourLayer,
    grainLayer: job.grainLayer,
    // Политика переворота, ПОД КОТОРОЙ ШЁЛ ПОИСК. Выводить её из геометрии нельзя: «ни одна деталь
    // не перевёрнута» не значит «переворот был запрещён».
    allowFlip: allowsFlip(job.direction),
    sets: pair.sets,
    usedLengthCm: dec(result.usedLengthCm),
    efficiencyPct: dec(Math.min(100, result.efficiency * 100)),
    placedCount: result.placedCount,
    totalCount: result.totalCount,
    layout,
  };
}

/**
 * Записать задание. Возвращает id раскладки.
 *
 * Пересъёмка ЗАМЕЩАЕТ прежнюю раскладку по id (`job.replaces`) — иначе на карточке копились бы
 * близнецы, и «какая из них норма» решал бы календарь.
 */
export async function saveMarkerJob(techCardId: number, args: MarkerSaveArgs): Promise<number> {
  const res = await adminService.SaveTechCardMarker({
    id: args.job.replaces?.id ?? 0,
    techCardId,
    marker: markerInsertFromJob(args),
  });
  return Number((res as { id?: number })?.id ?? 0);
}
