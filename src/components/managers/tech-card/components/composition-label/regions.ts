// ОБЛАСТИ ЛЕНТЫ (R-11, редизайн): где на стороне стоит каждое значение, которое правится на месте.
//
// Чистые функции без React. Прямоугольники — в мм стороны 100 × 30 (как у `PaperDoc`), выведены из
// метрик `L` движка (care-labels/layout.ts) и отчёта стороны (`CareSideReport.columns` у B), а не
// нарисованы вторично: сдвинется `L` — сдвинутся и двери. Движок не трогается, файлы ZIP те же.
import type { CareSideReport, Seam } from '../../care-labels/layout';
import { L } from '../../care-labels/layout';
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

/** Припуск шва стороны (10 мм у края, где лента вшита). */
export const seamRect = (seam: Seam): RectMm =>
  seam === 'left'
    ? { x0: 0, y0: 0, x1: L.SEAM, y1: L.H }
    : { x0: L.W - L.SEAM, y0: 0, x1: L.W, y1: L.H };

/** Пустой `MADE IN` рисуется экраном в этом слоте (в файл не идёт). */
const EMPTY_MADE_X0 = 58;

/**
 * A-лицо: лого, шапка, проза, символы, MADE IN. `madeW` — ширина строки `MADE IN …` в мм
 * (замер шейпером); `null` — страны нет, слот под плейсхолдер.
 */
export function aFaceRegions(seam: Seam, madeW: number | null): Region[] {
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

/** A-изнанка: подпись QR (колонка кода; сам код лежит поверх), QR, адрес. */
export function aBackRegions(seam: Seam, addressLines: number): Region[] {
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

/** Сторона B: каждая колонка части — своя дверь (правка состава с этой частью в фокусе). */
export function bRegions(report: CareSideReport): Region[] {
  return report.columns.map((c) => ({
    key: `composition:${c.part}`,
    line: 'composition' as const,
    part: c.part,
    rect: { x0: c.x - 0.8, y0: 0.6, x1: c.x + c.w + 0.8, y1: L.H - 0.6 },
  }));
}

/** Состава нет вовсе (B не печатается): одна дверь на всё поле пустой ленты. */
export function bEmptyRegions(seam: Seam): Region[] {
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
