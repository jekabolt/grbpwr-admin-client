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

export async function exportPaperPdf(doc: PaperDoc): Promise<void> {
  if (doc.w > PDF_MAX_MM || doc.h > PDF_MAX_MM)
    throw new Error(`sheet ${doc.w} × ${doc.h} mm exceeds the PDF page limit of ${PDF_MAX_MM} mm`);
  const [{ jsPDF }, regular, bold] = await Promise.all([
    import('jspdf'),
    base64Of(regularTtf),
    base64Of(boldTtf),
  ]);
  const pdf = new jsPDF({
    orientation: doc.w > doc.h ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [doc.w, doc.h],
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
        pdf.setFontSize(p.size);
        pdf.text(p.s, p.x, p.y, {
          align: p.align === 'right' ? 'right' : 'left',
          baseline: 'alphabetic',
        });
        break;
      case 'line':
        pdf.setLineWidth(p.w);
        pdf.line(p.x1, p.y1, p.x2, p.y2);
        break;
      case 'rect':
        if (p.dashed) pdf.setLineDashPattern([1, 1], 0);
        pdf.setLineWidth(p.sw);
        pdf.rect(p.x, p.y, p.w, p.h, p.fill ? 'F' : 'S');
        if (p.dashed) pdf.setLineDashPattern([], 0);
        break;
      case 'poly': {
        if (p.pts.length < 2) break;
        pdf.setLineWidth(p.sw);
        pdf.setLineJoin(p.join === 'round' ? 'round' : 'miter');
        pdf.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let i = 1; i < p.pts.length; i++) pdf.lineTo(p.pts[i][0], p.pts[i][1]);
        if (p.closed) pdf.close();
        if (p.fill) pdf.fill();
        else pdf.stroke();
        pdf.setLineJoin('miter');
        break;
      }
      case 'circle':
        pdf.setLineWidth(p.sw);
        // Пустой кружок («open») закрашен белым, чтобы перекрыть дорожку под собой.
        if (p.fill) pdf.circle(p.cx, p.cy, p.r, 'F');
        else {
          pdf.setFillColor('#ffffff');
          pdf.circle(p.cx, p.cy, p.r, 'FD');
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
  pdf.save(`${doc.fileStem}.pdf`);
}
