// PDF-ФАЙЛ ЛИСТА — из того же списка примитивов, что и экран: страница размером с лист (мм),
// FeatureMono вшит (Regular + Bold), только чёрный, линии штрихами. Файл СКАЧИВАЕТСЯ, а не
// уходит в диалог печати: диалог навязывает формат принтера, а лист сам знает свой размер.
//
// jsPDF грузится лениво: он нужен только в момент нажатия, а тянуть 300 КБ в чанк страницы ради
// кнопки — нет. Шрифты берутся из бандла (Vite отдаёт .ttf адресом) и кодируются в base64 здесь.
import boldTtf from '@/fonts/FeatureMono-Bold.ttf?url';
import regularTtf from '@/fonts/FeatureMono-Regular.ttf?url';
import type { PaperDoc } from './paper';

const FAMILY = 'FeatureMono';
/** Предел страницы PDF — 14 400 pt по каждой стороне; jsPDF молча обрезает лист крупнее. */
export const PDF_MAX_MM = Math.floor((14400 * 25.4) / 72);
/** Меньше этого по любой стороне файл не делается: лист превращается в точку. */
export const PDF_MIN_MM = 20;

/**
 * Свой размер файла: оператор задаёт ОДНУ сторону (ширину или высоту) в мм, вторая выводится из
 * пропорции листа. Лист не перенабирается — он масштабируется целиком, как вектор: координаты,
 * кегли, толщины линий, штрих. Перенабор под чужую ширину разложил бы шаги иначе, чем на экране.
 */
/** Форматы бумаги (книжно, мм). Пресет даёт страницу РОВНО этого формата, лист вписан по центру. */
export const PAPERS = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
} as const;
export type Paper = keyof typeof PAPERS;
export const isPaper = (v: string): v is Paper => v in PAPERS;

export type PdfTarget = { side: 'w' | 'h'; mm: number } | { paper: Paper };
export type PdfSize = {
  /** Страница файла, мм. */
  w: number;
  h: number;
  scale: number;
  custom: boolean;
  /** Лист на странице: сдвиг левого верхнего угла и размер после масштаба, мм. */
  ox: number;
  oy: number;
  sheetW: number;
  sheetH: number;
  /** Пресет формата и поворот страницы; у своей стороны — нет. */
  paper?: Paper;
  landscape?: boolean;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function pdfSize(doc: Pick<PaperDoc, 'w' | 'h'>, target: PdfTarget | null): PdfSize {
  if (!target)
    return {
      w: doc.w,
      h: doc.h,
      scale: 1,
      custom: false,
      ox: 0,
      oy: 0,
      sheetW: doc.w,
      sheetH: doc.h,
    };
  if ('paper' in target) {
    // Поворот — тот, при котором лист крупнее; поровну — книжно.
    const [pw, ph] = PAPERS[target.paper];
    const portrait = Math.min(pw / doc.w, ph / doc.h);
    const landscapeK = Math.min(ph / doc.w, pw / doc.h);
    const landscape = landscapeK > portrait;
    const scale = landscape ? landscapeK : portrait;
    const [w, h] = landscape ? [ph, pw] : [pw, ph];
    return {
      w,
      h,
      scale,
      custom: true,
      ox: (w - doc.w * scale) / 2,
      oy: (h - doc.h * scale) / 2,
      sheetW: round1(doc.w * scale),
      sheetH: round1(doc.h * scale),
      paper: target.paper,
      landscape,
    };
  }
  const scale = target.mm / (target.side === 'w' ? doc.w : doc.h);
  const [w, h] =
    target.side === 'w' ? [target.mm, round1(doc.h * scale)] : [round1(doc.w * scale), target.mm];
  return { w, h, scale, custom: true, ox: 0, oy: 0, sheetW: w, sheetH: h };
}

/** Что с размером не так — строкой для тулбара; null — файл можно делать. */
export function pdfSizeProblem(size: PdfSize): string | null {
  if (size.w > PDF_MAX_MM || size.h > PDF_MAX_MM)
    return `exceeds the PDF page limit of ${PDF_MAX_MM} mm`;
  if (size.w < PDF_MIN_MM || size.h < PDF_MIN_MM)
    return `each side must be at least ${PDF_MIN_MM} mm`;
  return null;
}

/** Имя файла: свой размер дописывается, чтобы два файла одной карточки не звались одинаково. */
export const pdfFileName = (doc: Pick<PaperDoc, 'fileStem'>, size: PdfSize) =>
  size.paper
    ? `${doc.fileStem}-${size.paper}.pdf`
    : size.custom
      ? `${doc.fileStem}-${size.w}x${size.h}mm.pdf`
      : `${doc.fileStem}.pdf`;

/** Самый мелкий кегль листа (pt) до масштаба — чтобы назвать, во что он превратится в файле. */
export function smallestTextPt(doc: PaperDoc): number | null {
  let min = Infinity;
  for (const p of doc.prims) if (p.k === 'text' && p.size < min) min = p.size;
  return Number.isFinite(min) ? min : null;
}

async function base64Of(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export async function exportPaperPdf(
  doc: PaperDoc,
  size: PdfSize = pdfSize(doc, null),
): Promise<void> {
  const problem = pdfSizeProblem(size);
  if (problem) throw new Error(`${size.w} × ${size.h} mm: ${problem}`);
  const k = size.scale;
  // Лист на странице: масштаб + сдвиг (пресет формата центрирует лист, своя сторона — 0).
  const X = (v: number) => v * k + size.ox;
  const Y = (v: number) => v * k + size.oy;
  const [{ jsPDF }, regular, bold] = await Promise.all([
    import('jspdf'),
    base64Of(regularTtf),
    base64Of(boldTtf),
  ]);
  const pdf = new jsPDF({
    orientation: size.w > size.h ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [size.w, size.h],
    compress: true,
  });
  pdf.addFileToVFS('FeatureMono-Regular.ttf', regular);
  pdf.addFont('FeatureMono-Regular.ttf', FAMILY, 'normal');
  pdf.addFileToVFS('FeatureMono-Bold.ttf', bold);
  pdf.addFont('FeatureMono-Bold.ttf', FAMILY, 'bold');
  pdf.setDrawColor('#000000');
  pdf.setFillColor('#000000');
  pdf.setTextColor('#000000');
  pdf.setLineJoin('miter');
  pdf.setLineCap('butt');

  for (const p of doc.prims) {
    switch (p.k) {
      case 'text':
        pdf.setFont(FAMILY, p.bold ? 'bold' : 'normal');
        pdf.setFontSize(p.size * k);
        pdf.text(p.s, X(p.x), Y(p.y), {
          align: p.align === 'right' ? 'right' : 'left',
          baseline: 'alphabetic',
        });
        break;
      case 'line':
        pdf.setLineWidth(p.w * k);
        pdf.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
        break;
      case 'rect':
        if (p.dashed) pdf.setLineDashPattern([k, k], 0);
        pdf.setLineWidth(p.sw * k);
        pdf.rect(X(p.x), Y(p.y), p.w * k, p.h * k, p.fill ? 'F' : 'S');
        if (p.dashed) pdf.setLineDashPattern([], 0);
        break;
      case 'poly': {
        if (p.pts.length < 2) break;
        pdf.setLineWidth(p.sw * k);
        pdf.setLineJoin(p.join === 'round' ? 'round' : 'miter');
        pdf.moveTo(X(p.pts[0][0]), Y(p.pts[0][1]));
        for (let i = 1; i < p.pts.length; i++) pdf.lineTo(X(p.pts[i][0]), Y(p.pts[i][1]));
        if (p.closed) pdf.close();
        if (p.fill) pdf.fill();
        else pdf.stroke();
        pdf.setLineJoin('miter');
        break;
      }
      case 'circle':
        pdf.setLineWidth(p.sw * k);
        // Пустой кружок («open») закрашен белым, чтобы перекрыть дорожку под собой.
        if (p.fill) pdf.circle(X(p.cx), Y(p.cy), p.r * k, 'F');
        else {
          pdf.setFillColor('#ffffff');
          pdf.circle(X(p.cx), Y(p.cy), p.r * k, 'FD');
          pdf.setFillColor('#000000');
        }
        break;
    }
  }
  pdf.save(pdfFileName(doc, size));
}
