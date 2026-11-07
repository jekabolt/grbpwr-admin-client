// ОБЛАСТИ ЛЕНТЫ (R-11, редизайн): где на стороне стоит каждое значение, которое правится на месте.
//
// Чистые функции без React. Прямоугольники — в мм стороны (100 × 30 или вертикальной 30 × 100, как у
// `PaperDoc`), выведены из метрик `L` / `LV` движка (care-labels/layout.ts) и отчёта стороны
// (`CareSideReport.columns` у B, с y/h у вертикальной), а не нарисованы вторично: сдвинутся
// метрики — сдвинутся и двери. Движок не трогается, файлы ZIP те же. Ориентацию стороны несёт её
// припуск: `top` / `bottom` бывают только у вертикальной ленты.
import type { CareSideReport, Seam } from '../../care-labels/layout';
import { L, LV } from '../../care-labels/layout';
import type { PrintedPart } from '../../care-labels/label-parts';
import { QR_SIZE_MM } from '../../care-labels/qr';
import type { LineKey } from './label-lines';

/** 1 мм на экране при 96 dpi. */
export const PX_PER_MM = 96 / 25.4;

export type RectMm = { x0: number; y0: number; x1: number; y1: number };

export type Region = {
  /** Уникально на стороне: `product`, `composition:SHELL`. */
  key: string;
  line: LineKey;
  rect: RectMm;
  /** Колонка состава (B). */
  part?: PrintedPart;
};

/** Начало полезного поля стороны: припуск слева сдвигает всё на 10 мм. */
const originX = (seam: Seam) => (seam === 'left' ? L.SEAM : 0);

/** Вертикальная лента: припуск сверху (лицо) или снизу (изнанка). */
export const isVerticalSeam = (seam: Seam) => seam === 'top' || seam === 'bottom';

/** Полезная полоса вертикальной стороны по высоте — те же границы, что у движка. */
const verticalBand = (seam: Seam) => ({
  top: seam === 'top' ? L.SEAM + LV.MARGIN : LV.MARGIN,
  bottom: seam === 'bottom' ? LV.H - L.SEAM - LV.MARGIN : LV.H - LV.MARGIN,
});

/** Припуск шва стороны (10 мм у края, где лента вшита). */
export const seamRect = (seam: Seam): RectMm => {
  if (seam === 'top') return { x0: 0, y0: 0, x1: LV.W, y1: L.SEAM };
  if (seam === 'bottom') return { x0: 0, y0: LV.H - L.SEAM, x1: LV.W, y1: LV.H };
  return seam === 'left'
    ? { x0: 0, y0: 0, x1: L.SEAM, y1: L.H }
    : { x0: L.W - L.SEAM, y0: 0, x1: L.W, y1: L.H };
};

/** Пустой `MADE IN` рисуется экраном в этом слоте (в файл не идёт). */
const EMPTY_MADE_X0 = 58;

/** Что вертикальное лицо раскладывает по высоте: строк прозы и символов ухода. */
export type VerticalFaceFill = { proseLines: number; symbols: number };

/**
 * A-лицо: лого, шапка, проза, символы, MADE IN. `madeW` — ширина строки `MADE IN …` в мм
 * (замер шейпером); `null` — страны нет, слот под плейсхолдер. Вертикальной стороне нужны ещё
 * строки прозы и число символов: от них зависит, где стоят символы.
 */
export function aFaceRegions(
  seam: Seam,
  madeW: number | null,
  fill: VerticalFaceFill = { proseLines: 1, symbols: 0 },
): Region[] {
  if (isVerticalSeam(seam)) return aFaceRegionsVertical(seam, madeW, fill);
  const m = L.aFace;
  const ox = originX(seam);
  const right = ox + L.RIGHT + 0.5;
  const left = ox + m.x - 0.5;
  const madeX0 = madeW != null ? ox + L.RIGHT - madeW - 0.5 : ox + EMPTY_MADE_X0;
  const symX1 = Math.max(ox + m.symX + m.sym + 0.5, madeX0 - 1);
  return [
    {
      key: 'logo',
      line: 'logo',
      rect: {
        x0: ox + m.logoX - 1,
        y0: m.logoY - 1,
        x1: ox + m.logoX + m.logo + 1,
        y1: m.logoY + m.logo + 1,
      },
    },
    {
      key: 'product',
      line: 'product',
      rect: { x0: left, y0: 0.6, x1: right, y1: m.headBase + 1.4 },
    },
    {
      key: 'care-text',
      line: 'care-text',
      rect: {
        x0: left,
        y0: m.proseBase - 2.4,
        x1: right,
        y1: m.proseBase + (m.proseLines - 1) * m.proseStep + 0.9,
      },
    },
    {
      key: 'care-symbols',
      line: 'care-symbols',
      rect: {
        x0: ox + m.symX - 0.5,
        y0: m.symBottom - m.sym - 0.6,
        x1: symX1,
        y1: m.symBottom + 0.6,
      },
    },
    {
      key: 'made-in',
      line: 'made-in',
      rect: { x0: madeX0, y0: m.madeBase - 2.4, x1: right, y1: m.madeBase + 1.4 },
    },
  ];
}

/** Вертикальное лицо: лого сверху, шапка в три строки, проза, символы и MADE IN у нижнего края. */
function aFaceRegionsVertical(
  seam: Seam,
  madeW: number | null,
  { proseLines, symbols }: VerticalFaceFill,
): Region[] {
  const m = LV.aFace;
  const { top, bottom } = verticalBand(seam);
  const left = LV.MARGIN - 0.5;
  const right = LV.RIGHT + 0.5;
  const headBase = top + m.logo + m.contentGap;
  const headLast = headBase + 2 * m.headStep;
  const proseBase = headLast + m.proseGap;
  const madeBase = bottom - 1;
  const perRow = Math.floor((LV.RIGHT - LV.MARGIN - m.sym) / m.symStepMin) + 1;
  const rows = symbols > 0 && symbols <= m.symMax ? Math.min(2, Math.ceil(symbols / perRow)) : 1;
  const symBottom = madeBase - m.symGapToMade;
  const symTop = symBottom - (rows - 1) * m.symRowStep - m.sym;
  const madeX0 =
    madeW != null ? Math.max(left, LV.MARGIN + (LV.RIGHT - LV.MARGIN - madeW) / 2 - 0.5) : left;
  return [
    {
      key: 'logo',
      line: 'logo',
      rect: { x0: LV.MARGIN - 1, y0: top - 1, x1: LV.MARGIN + m.logo + 1, y1: top + m.logo + 1 },
    },
    {
      key: 'product',
      line: 'product',
      rect: { x0: left, y0: headBase - 2.4, x1: right, y1: headLast + 0.9 },
    },
    {
      key: 'care-text',
      line: 'care-text',
      rect: {
        x0: left,
        y0: proseBase - 2.4,
        x1: right,
        y1: proseBase + (Math.max(1, proseLines) - 1) * m.proseStep + 0.9,
      },
    },
    {
      key: 'care-symbols',
      line: 'care-symbols',
      rect: { x0: left, y0: symTop - 0.6, x1: right, y1: symBottom + 0.6 },
    },
    {
      key: 'made-in',
      line: 'made-in',
      rect: { x0: madeX0, y0: madeBase - 2.4, x1: LV.W - madeX0, y1: madeBase + 1.4 },
    },
  ];
}

/** A-изнанка: подпись QR (колонка кода; сам код лежит поверх), QR, адрес. */
export function aBackRegions(seam: Seam, addressLines: number): Region[] {
  if (isVerticalSeam(seam)) return aBackRegionsVertical(addressLines);
  const m = L.aBack;
  const ox = originX(seam);
  const capW = 2 * (m.qrX + QR_SIZE_MM / 2);
  const lines = Math.max(1, addressLines);
  return [
    {
      key: 'caption',
      line: 'caption',
      rect: { x0: ox + 0.4, y0: 0.6, x1: ox + capW, y1: L.H - 0.6 },
    },
    {
      key: 'qr',
      line: 'qr',
      rect: {
        x0: ox + m.qrX - 0.6,
        y0: m.qrY - 0.6,
        x1: ox + m.qrX + QR_SIZE_MM + 0.6,
        y1: m.qrY + QR_SIZE_MM + 0.6,
      },
    },
    {
      key: 'address',
      line: 'address',
      rect: {
        x0: ox + m.addrX - 0.6,
        y0: m.addrBase - 2.4,
        x1: ox + L.RIGHT + 0.5,
        y1: m.addrBase + (lines - 1) * m.addrStep + 0.9,
      },
    },
  ];
}

/** Вертикальная изнанка: подпись над и под QR (код лежит поверх), адрес ниже. */
function aBackRegionsVertical(addressLines: number): Region[] {
  const m = LV.aBack;
  const left = LV.MARGIN - 0.5;
  const right = LV.RIGHT + 0.5;
  const qx = (LV.W - QR_SIZE_MM) / 2;
  const lines = Math.max(1, addressLines);
  return [
    {
      key: 'caption',
      line: 'caption',
      rect: { x0: left, y0: 0.6, x1: right, y1: m.metaBase + 1.4 },
    },
    {
      key: 'qr',
      line: 'qr',
      rect: {
        x0: qx - 0.6,
        y0: m.qrY - 0.6,
        x1: qx + QR_SIZE_MM + 0.6,
        y1: m.qrY + QR_SIZE_MM + 0.6,
      },
    },
    {
      key: 'address',
      line: 'address',
      rect: {
        x0: left,
        y0: m.addrBase - 2.4,
        x1: right,
        y1: m.addrBase + (lines - 1) * m.addrStep + 0.9,
      },
    },
  ];
}

/**
 * Сторона B: каждая колонка части — своя дверь (правка состава с этой частью в фокусе). У
 * вертикальной ленты часть — блок во всю ширину, отчёт даёт его верх и высоту.
 */
export function bRegions(report: CareSideReport): Region[] {
  return report.columns.map((c) => ({
    key: `composition:${c.part}`,
    line: 'composition' as const,
    part: c.part,
    rect:
      c.y != null && c.h != null
        ? { x0: c.x - 0.8, y0: c.y - 0.6, x1: c.x + c.w + 0.8, y1: c.y + c.h + 0.6 }
        : { x0: c.x - 0.8, y0: 0.6, x1: c.x + c.w + 0.8, y1: L.H - 0.6 },
  }));
}

/** Состава нет вовсе (B не печатается): одна дверь на всё поле пустой ленты. */
export function bEmptyRegions(seam: Seam): Region[] {
  if (isVerticalSeam(seam)) {
    const { top, bottom } = verticalBand(seam);
    return [
      {
        key: 'composition',
        line: 'composition',
        rect: { x0: LV.MARGIN, y0: top, x1: LV.RIGHT, y1: bottom },
      },
    ];
  }
  const ox = originX(seam);
  return [
    {
      key: 'composition',
      line: 'composition',
      rect: { x0: ox + 2, y0: 2, x1: ox + L.RIGHT, y1: L.H - 2 },
    },
  ];
}

/** Прямоугольник в мм → пиксели ленты при зуме. */
export const pxOf = (r: RectMm, zoom: number) => {
  const k = PX_PER_MM * zoom;
  return { left: r.x0 * k, top: r.y0 * k, width: (r.x1 - r.x0) * k, height: (r.y1 - r.y0) * k };
};
