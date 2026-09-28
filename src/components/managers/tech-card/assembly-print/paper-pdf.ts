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
export type PdfTarget = { side: 'w' | 'h'; mm: number };
export type PdfSize = { w: number; h: number; scale: number; custom: boolean };

const round1 = (v: number) => Math.round(v * 10) / 10;

export function pdfSize(doc: Pick<PaperDoc, 'w' | 'h'>, target: PdfTarget | null): PdfSize {
  if (!target) return { w: doc.w, h: doc.h, scale: 1, custom: false };
  const scale = target.mm / (target.side === 'w' ? doc.w : doc.h);
  return target.side === 'w'
    ? { w: target.mm, h: round1(doc.h * scale), scale, custom: true }
    : { w: round1(doc.w * scale), h: target.mm, scale, custom: true };
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
  size.custom ? `${doc.fileStem}-${size.w}x${size.h}mm.pdf` : `${doc.fileStem}.pdf`;

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
        pdf.text(p.s, p.x * k, p.y * k, {
          align: p.align === 'right' ? 'right' : 'left',
          baseline: 'alphabetic',
        });
        break;
      case 'line':
        pdf.setLineWidth(p.w * k);
        pdf.line(p.x1 * k, p.y1 * k, p.x2 * k, p.y2 * k);
        break;
      case 'rect':
        if (p.dashed) pdf.setLineDashPattern([k, k], 0);
        pdf.setLineWidth(p.sw * k);
        pdf.rect(p.x * k, p.y * k, p.w * k, p.h * k, p.fill ? 'F' : 'S');
        if (p.dashed) pdf.setLineDashPattern([], 0);
        break;
      case 'poly': {
        if (p.pts.length < 2) break;
        pdf.setLineWidth(p.sw * k);
        pdf.setLineJoin(p.join === 'round' ? 'round' : 'miter');
        pdf.moveTo(p.pts[0][0] * k, p.pts[0][1] * k);
        for (let i = 1; i < p.pts.length; i++) pdf.lineTo(p.pts[i][0] * k, p.pts[i][1] * k);
        if (p.closed) pdf.close();
        if (p.fill) pdf.fill();
        else pdf.stroke();
        pdf.setLineJoin('miter');
        break;
      }
      case 'circle':
        pdf.setLineWidth(p.sw * k);
        // Пустой кружок («open») закрашен белым, чтобы перекрыть дорожку под собой.
        if (p.fill) pdf.circle(p.cx * k, p.cy * k, p.r * k, 'F');
        else {
          pdf.setFillColor('#ffffff');
          pdf.circle(p.cx * k, p.cy * k, p.r * k, 'FD');
          pdf.setFillColor('#000000');
        }
        break;
      case 'path': {
        const sw = p.sw ?? 0;
        if (!p.fill && sw <= 0) break;
        for (const c of p.d) {
          if (c[0] === 'M') pdf.moveTo(c[1], c[2]);
          else if (c[0] === 'L') pdf.lineTo(c[1], c[2]);
          else if (c[0] === 'C') pdf.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
          else pdf.close();
        }
        if (sw > 0) {
          pdf.setLineWidth(sw);
          pdf.setLineJoin(p.join === 'round' ? 'round' : 'miter');
        }
        const evenOdd = p.fillRule === 'evenodd';
        if (p.fill && sw > 0) {
          if (evenOdd) pdf.fillStrokeEvenOdd();
          else pdf.fillStroke();
        } else if (p.fill) {
          if (evenOdd) pdf.fillEvenOdd();
          else pdf.fill();
        } else pdf.stroke();
        pdf.setLineJoin('miter');
        break;
      }
    }
  }
  pdf.save(pdfFileName(doc, size));
}
