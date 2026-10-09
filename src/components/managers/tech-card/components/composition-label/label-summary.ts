// СТРОКИ СОСТАВНИКА КАК ТЕКСТ — одна выводка для блока на вкладке и для тех-пака (I-17). Блок
// рисует их с дверями правки, тех-пак печатает таблицей «строка · на ленте · откуда»; что именно
// стоит в строке (SKU, имя цвета, состав по частям, подпись QR, адрес), решается только здесь.
import type { CareLabelColorway, CareLabelData, CareLabelSize } from '../../care-labels/adapter';
import { variantSku } from '../../care-labels/adapter';
import { labelComposition } from '../../care-labels/composition-override';
import type { FiberDict, PartComposition } from '../../care-labels/composition-resolver';
import { LABEL_PART_NAME } from '../../care-labels/label-parts';
import { COMPANY_ADDRESS, QR_CAPTION } from '../../care-labels/layout';
import { qrLink } from '../../care-labels/use-care-label-prefs';
import type { LineKey } from './label-lines';

/** Имя строки и откуда она выводится, пока её не переопределили. */
export const LINE_META: Record<LineKey, { name: string; source: string }> = {
  logo: { name: 'logo', source: 'brand' },
  product: { name: 'product line', source: 'colourway' },
  'care-symbols': { name: 'care symbols', source: 'style care' },
  'care-text': { name: 'care text', source: 'dictionary' },
  'made-in': { name: 'made in', source: 'colourway' },
  composition: { name: 'composition', source: 'BOM' },
  qr: { name: 'qr link', source: 'storefront' },
  caption: { name: 'back caption', source: 'brand' },
  address: { name: 'address', source: 'company' },
};

/** SKU варианта на ленте: базовый + порядковый номер размера; без номера — базовый. */
export function labelSku(cw: CareLabelColorway, size: CareLabelSize | undefined): string {
  if (!size) return '';
  return size.skuOrd != null && cw.baseSku ? variantSku(cw.baseSku, size.skuOrd) : cw.baseSku;
}

/** Состав по частям, EN: `SHELL` · `55% cotton  45% linen`. NOTE (фраза ст. 12) не строка состава. */
export function compositionPartTexts(
  parts: readonly PartComposition[],
  fibers: FiberDict,
): { part: string; name: string; text: string }[] {
  return parts
    .filter((p) => p.part !== 'NOTE')
    .map((p) => ({
      part: p.part,
      name: LABEL_PART_NAME[p.part],
      text: p.fibers
        .map((f) => {
          const fib = fibers.get(f.code);
          return `${f.percent}% ${fib?.translations.en || fib?.name || f.code}`;
        })
        .join('  '),
    }));
}

/** Подпись QR и адрес: переопределение карточки, иначе константы ленты. */
export const captionLines = (data: CareLabelData | null | undefined): readonly string[] =>
  data?.label.caption.length ? data.label.caption : QR_CAPTION;
export const addressLines = (data: CareLabelData | null | undefined): readonly string[] =>
  data?.label.address.length ? data.label.address : COMPANY_ADDRESS;

/** Пример ссылки QR для варианта (колорвей × размер). */
export function qrExample(
  data: CareLabelData,
  cw: CareLabelColorway,
  size: CareLabelSize | undefined,
): string {
  if (!size) return '';
  return qrLink(data.label.qr, {
    base_sku: cw.baseSku,
    sku: size.skuOrd != null && cw.baseSku ? variantSku(cw.baseSku, size.skuOrd) : '',
    size: size.name,
    colorway_id: cw.id,
    style: data.styleNumber,
  });
}

export type SummaryLine = {
  line: LineKey;
  name: string;
  source: string;
  overridden: boolean;
  /** Строки значения; пусто — на ленте этой строки нет (печатается «—»). */
  value: string[];
};

export type CompositionLabelSummary = {
  colorway: CareLabelColorway;
  /** Коды символов ухода в порядке словаря (тех-пак рисует их картинками). */
  careCodes: string[];
  lines: SummaryLine[];
};

/**
 * Строки составника одного колорвея, как их напечатает лента. Размер на ленте свой у каждого
 * варианта, поэтому строка продукта называет весь размерный ряд, а пример QR — первый размер.
 */
export function compositionLabelSummary(
  data: CareLabelData,
  colorwayId: number,
): CompositionLabelSummary | null {
  const cw = data.colorways.find((c) => c.id === colorwayId) ?? data.colorways[0];
  if (!cw) return null;
  const size = data.sizes[0];
  const parts = labelComposition({
    colorwayId: cw.id,
    bom: data.bom,
    usages: cw.usages,
    materials: data.materials,
    fibers: data.fibers,
    override: cw.fiberOverride,
  }).parts;
  const caption = captionLines(data);
  const address = addressLines(data);
  const L = (line: LineKey, value: readonly string[], overridden: boolean): SummaryLine => ({
    line,
    ...LINE_META[line],
    overridden,
    value: value.filter(Boolean),
  });
  const sizes = data.sizes.map((s) => s.label).join(' · ');
  return {
    colorway: cw,
    careCodes: data.care.codes,
    lines: [
      L(
        'logo',
        [
          data.label.logoMediaId > 0
            ? `custom SVG · media #${data.label.logoMediaId}`
            : 'GRBPWR mark',
        ],
        data.label.logoMediaId > 0,
      ),
      L(
        'product',
        [`${cw.baseSku || 'no SKU'} / ${cw.colourName.toUpperCase() || '—'} / [${sizes || '—'}]`],
        cw.colourNameOverridden,
      ),
      L('care-symbols', data.care.codes.length ? [data.care.codes.join(' ')] : [], false),
      L('care-text', data.care.prose, data.care.proseOverridden),
      L('made-in', cw.countryName ? [`MADE IN ${cw.countryName.toUpperCase()}`] : [], false),
      L(
        'composition',
        compositionPartTexts(parts, data.fibers).map((p) => `${p.name}  ${p.text}`),
        !!cw.fiberOverride?.length,
      ),
      L('qr', [qrExample(data, cw, size)], data.label.qr.qrPreset !== 'storefront'),
      L('caption', caption, data.label.caption.length > 0),
      L('address', address, data.label.address.length > 0),
    ],
  };
}
