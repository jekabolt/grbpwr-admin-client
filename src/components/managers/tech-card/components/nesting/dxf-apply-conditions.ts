// УСЛОВИЯ ПЕРЕСЧЁТА «ПО ВЫКРОЙКАМ» — ОДНИМ КОДОМ НА ДИАЛОГ ПРИМЕНЕНИЯ И ПЕРЕСЧЁТ ПО ТЕКУЩИМ ДАННЫМ.
//
// Норма с источником 'dxf' хранит только числа: ни выбранный слой контура, ни припуск, ни ширину,
// по которым её считали, строка не помнит. Пересчёт по текущим данным (dxf-recheck.tsx) поэтому
// считает «как предложил бы диалог» — и его честность держится буквально на том, что «условия
// те же» значит «тот же код»: диалог (dxf-apply-dialog.tsx) строит свой список слоёв и прифилл
// припуска ЭТИМИ функциями, а не похожим куском рядом. Разойдись две реализации хоть порядком
// источников прифилла — и «расхождение нормы» стало бы разницей двух наших умолчаний.
import type { googletype_Decimal } from 'api/proto-http/admin';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { engineCmToMm } from './allowance-units';
import { buildAllowanceIndex } from './contour-allowance';
import {
  layerOptions,
  seamAllowancePrefill,
  type LayerOption,
  type SeamAllowancePrefill,
} from './contour-layer';
import type { DxfBundle, DxfIndex } from './dxf-geometry';

/**
 * Слои с замером припуска — ровно та выборка, из которой диалог строит селектор.
 *
 * Индекс замера строится по НЕОТФИЛЬТРОВАННОМУ разбору: на наборе, суженном до одного слоя,
 * второго контура блока нет по построению, и замер выродился бы в 'unknown' на каждом слое
 * (см. contour-layer.ts).
 */
export function applyLayerOptions(bundle: DxfBundle, index: DxfIndex): LayerOption[] {
  return layerOptions(bundle.pieces, index.split.codeById, buildAllowanceIndex(bundle.pieces));
}

/**
 * Прифилл припуска для выбранного слоя — порядок источников §5.5: замер файла → эталон карточки →
 * цех → умолчание раскладки. Сырые значения карточки (поле формы) и цеха (настройка) нормализуются
 * ЗДЕСЬ, одинаково для всех вызывающих: два места, по-разному читающие пустую строку, дали бы два
 * разных «умолчания».
 *
 * ПРИПУСК ЦЕХА ПРИХОДИТ `googletype_Decimal` (`{ value: '12' }`), А НЕ СТРОКОЙ, и приведения типом
 * тут мало. До этой правки оба вызывающих делали `as string | undefined` и отдавали объект в
 * `parseDecimalNumber`, который зовёт у входа `.trim()`: на карточке с ЗАПОЛНЕННЫМ припуском цеха
 * «по выкройкам» падало в рендере, а не считало норму. Не замечено было ровно потому, что настройка
 * пустая — тогда приходит `undefined` и всё работает. Остальной код репозитория читает эту настройку
 * через `decimalToInput` (construction-tab, operations-field), и теперь — одним местом здесь.
 *
 * Карточное значение читается `parseDecimalNumber`, а не `Number`: поле формы — свободный текст
 * (`z.string()`), и «12,5» с русской раскладки `Number` превратил бы в NaN, то есть эталон карточки
 * молча уступил бы цеху. Пустая строка остаётся ОТСУТСТВИЕМ, а ноль — заданным значением (см.
 * договор `seamAllowancePrefill`: «НОЛЬ — ЗАДАН»).
 */
export function applySeamPrefill(
  option: LayerOption | undefined,
  cardSeamRaw: number | string | null | undefined,
  workshopSeam: googletype_Decimal | undefined,
): SeamAllowancePrefill {
  const workshopMm = parseDecimalNumber(decimalToInput(workshopSeam));
  const cardMm =
    typeof cardSeamRaw === 'number' ? cardSeamRaw : parseDecimalNumber(cardSeamRaw ?? '');
  return seamAllowancePrefill({
    measured: option?.allowance ?? null,
    cardRequiredMm: Number.isFinite(cardMm) ? cardMm : null,
    workshopDefaultMm: Number.isFinite(workshopMm) ? workshopMm : null,
    fallbackMm: engineCmToMm(NEST_DEFAULTS.seamAllowanceCm),
  });
}

export type DxfApplyConditions = {
  /** Слой контура, который диалог подставил бы по умолчанию (index.contourLayer). */
  layer: string;
  option: LayerOption | undefined;
  prefill: SeamAllowancePrefill;
};

/**
 * Условия, с которыми диалог применения открылся бы СЕЙЧАС, до единого клика оператора: слой по
 * умолчанию и прифилл припуска под него. Ими пересчёт по текущим данным считает «сегодняшнее»
 * число — по определению теми же, что предложил бы диалог.
 *
 * ⚠ Слой по умолчанию (index.contourLayer) ранжируется по ВСЕЙ пачке карточки, не по деталям одной
 * ткани: DXF подкладки, загруженный ПОСЛЕ применения нормы верха, может сменить глобального
 * победителя — и пересчёт верха откажет или даст другое число, хотя выкройки верха не трогали.
 * Поэтому вызывающий обязан называть слой «сегодняшним слоем по умолчанию», а не «тем, которым
 * применяли».
 */
export function defaultApplyConditions(
  bundle: DxfBundle,
  index: DxfIndex,
  cardSeamRaw: number | string | null | undefined,
  workshopSeam: googletype_Decimal | undefined,
): DxfApplyConditions {
  const layers = applyLayerOptions(bundle, index);
  const layer = index.contourLayer || '';
  const option = layers.find((o) => o.layer === layer);
  return { layer, option, prefill: applySeamPrefill(option, cardSeamRaw, workshopSeam) };
}
