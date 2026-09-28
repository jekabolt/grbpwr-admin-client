// PDF-ФАЙЛ ЛИСТА — из того же списка примитивов, что и экран: страница размером с лист (мм),
// FeatureMono вшит (Regular + Bold), только чёрный, линии штрихами. Файл СКАЧИВАЕТСЯ, а не
// уходит в диалог печати: диалог навязывает формат принтера, а лист сам знает свой размер.
//
// jsPDF грузится лениво: он нужен только в момент нажатия, а тянуть 300 КБ в чанк страницы ради
// кнопки — нет. Шрифты берутся из бандла (Vite отдаёт .ttf адресом) и кодируются в base64 здесь.
import boldTtf from '@/fonts/FeatureMono-Bold.ttf?url';
import regularTtf from '@/fonts/FeatureMono-Regular.ttf?url';
import type { PaperDoc, Prim } from './paper';

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
// Свои ключи, не унаследованные: `?size=constructor` не должен стать форматом бумаги.
export const isPaper = (v: string): v is Paper => Object.prototype.hasOwnProperty.call(PAPERS, v);

export type PdfTarget = { side: 'w' | 'h'; mm: number } | { paper: Paper };

/**
 * Страница файла. Лист (после масштаба) лежит на ней со сдвигом `tx/ty`: точка листа v → v·scale + t.
 * У разбивки на несколько страниц содержимое обрезано окном `clip`, а в полях — `furniture`:
 * подпись страницы и уголки обреза (примитивы в мм страницы, без масштаба).
 */
export type Tile = {
  tx: number;
  ty: number;
  clip: [x: number, y: number, w: number, h: number] | null;
  furniture: Prim[];
};

export type PdfSize = {
  /** Страница файла, мм. */
  w: number;
  h: number;
  scale: number;
  custom: boolean;
  /** Лист после масштаба, мм. */
  sheetW: number;
  sheetH: number;
  /** Страницы файла по порядку: строки сверху вниз, в строке слева направо. */
  tiles: Tile[];
  cols: number;
  rows: number;
  /** Пресет формата и поворот страницы; у своей стороны — нет. */
  paper?: Paper;
  landscape?: boolean;
};

/**
 * Пол масштаба пресета: не мельче, чем на один формат вниз (A3 → A4 = 1/√2, кегль 10 → 7,1 pt).
 * Лист, который на одну страницу формата влезает только мельче, раскладывается на несколько
 * страниц этого формата в этом масштабе — иначе длинная ведомость на A4 печатается кеглем 2–3 pt.
 */
export const PRESET_MIN_SCALE = Math.SQRT1_2;
/** Поля страницы разбивки, мм: непечатаемая кромка принтера + подпись и уголки обреза. */
export const TILE_MARGIN = 10;

const round1 = (v: number) => Math.round(v * 10) / 10;

const single = (w: number, h: number, scale: number, tx: number, ty: number) => ({
  w,
  h,
  scale,
  sheetW: 0,
  sheetH: 0,
  tiles: [{ tx, ty, clip: null, furniture: [] }] as Tile[],
  cols: 1,
  rows: 1,
});

/** Подпись и уголки обреза одной страницы разбивки — в её полях, не поверх содержимого. */
function tileFurniture(
  paper: Paper,
  cw: number,
  ch: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
): Prim[] {
  const M = TILE_MARGIN;
  // Подпись — 7 pt, ~140 мм: влезает и в A4 книжно (190 мм между полями).
  const out: Prim[] = [
    {
      k: 'text',
      // Правее уголка: штрих обреза не должен идти по первой букве подписи.
      x: M + 8,
      y: M - 3,
      s: `${paper} · PAGE ${row * cols + col + 1} OF ${cols * rows} · ROW ${row + 1} OF ${rows} · COLUMN ${col + 1} OF ${cols} · TRIM AT THE CORNER MARKS, BUTT AND TAPE`,
      size: 7,
    },
  ];
  // Уголки: по два штриха от каждого угла окна наружу, в поле; окно — ровно граница обреза.
  for (const [x, y, dx, dy] of [
    [M, M, -1, -1],
    [M + cw, M, 1, -1],
    [M, M + ch, -1, 1],
    [M + cw, M + ch, 1, 1],
  ] as const) {
    out.push({ k: 'line', x1: x + dx * 1.5, y1: y, x2: x + dx * 6, y2: y, w: 0.2 });
    out.push({ k: 'line', x1: x, y1: y + dy * 1.5, x2: x, y2: y + dy * 6, w: 0.2 });
  }
  return out;
}

export function pdfSize(doc: Pick<PaperDoc, 'w' | 'h'>, target: PdfTarget | null): PdfSize {
  if (!target)
    return { ...single(doc.w, doc.h, 1, 0, 0), custom: false, sheetW: doc.w, sheetH: doc.h };
  if ('paper' in target) {
    // Поворот — тот, при котором лист крупнее; поровну — книжно.
    const [pw, ph] = PAPERS[target.paper];
    const portrait = Math.min(pw / doc.w, ph / doc.h);
    const landscapeK = Math.min(ph / doc.w, pw / doc.h);
    const landscape = landscapeK > portrait;
    const fit = landscape ? landscapeK : portrait;
    if (fit >= PRESET_MIN_SCALE) {
      const [w, h] = landscape ? [ph, pw] : [pw, ph];
      return {
        ...single(w, h, fit, (w - doc.w * fit) / 2, (h - doc.h * fit) / 2),
        custom: true,
        sheetW: round1(doc.w * fit),
        sheetH: round1(doc.h * fit),
        paper: target.paper,
        landscape,
      };
    }
    // Разбивка: масштаб — пол, поворот — тот, где страниц меньше (поровну — книжно).
    const scale = PRESET_MIN_SCALE;
    const Sw = doc.w * scale;
    const Sh = doc.h * scale;
    const M = TILE_MARGIN;
    const grid = (w: number, h: number) => {
      const cw = w - 2 * M;
      const ch = h - 2 * M;
      const cols = Math.max(1, Math.ceil(Sw / cw - 1e-9));
      const rows = Math.max(1, Math.ceil(Sh / ch - 1e-9));
      return { w, h, cw, ch, cols, rows };
    };
    const P = grid(pw, ph);
    const L = grid(ph, pw);
    const turned = L.cols * L.rows < P.cols * P.rows;
    const g = turned ? L : P;
    // Лист по центру всей сетки, чтобы пустое поровну легло по краям, а не в последний столбец.
    const ox = M + (g.cols * g.cw - Sw) / 2;
    const oy = M + (g.rows * g.ch - Sh) / 2;
    const tiles: Tile[] = [];
    for (let row = 0; row < g.rows; row++)
      for (let col = 0; col < g.cols; col++)
        tiles.push({
          tx: ox - col * g.cw,
          ty: oy - row * g.ch,
          clip: [M, M, g.cw, g.ch],
          furniture: tileFurniture(target.paper, g.cw, g.ch, col, row, g.cols, g.rows),
        });
    return {
      w: g.w,
      h: g.h,
      scale,
      custom: true,
      sheetW: round1(Sw),
      sheetH: round1(Sh),
      tiles,
      cols: g.cols,
      rows: g.rows,
      paper: target.paper,
      landscape: turned,
    };
  }
  const scale = target.mm / (target.side === 'w' ? doc.w : doc.h);
  const [w, h] =
    target.side === 'w' ? [target.mm, round1(doc.h * scale)] : [round1(doc.w * scale), target.mm];
  return { ...single(w, h, scale, 0, 0), custom: true, sheetW: w, sheetH: h };
}

/** Что подвал листа пишет о бумаге: формат и, у разбивки, число страниц. */
export const paperNote = (size: PdfSize) =>
  size.paper
    ? size.tiles.length > 1
      ? `${size.tiles.length} × ${size.paper} PAGES`
      : size.paper
    : undefined;

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
    ? `${doc.fileStem}-${size.paper}${size.tiles.length > 1 ? `-${size.tiles.length}pages` : ''}.pdf`
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

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

/** Примитивы листа на странице: точка v → v·k + t; кегли, толщины и штрих — × k. */
function drawPrims(pdf: Pdf, prims: Prim[], k: number, tx: number, ty: number) {
  const X = (v: number) => v * k + tx;
  const Y = (v: number) => v * k + ty;
  for (const p of prims) {
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
      case 'path': {
        const sw = p.sw ?? 0;
        if (!p.fill && sw <= 0) break;
        for (const c of p.d) {
          if (c[0] === 'M') pdf.moveTo(X(c[1]), Y(c[2]));
          else if (c[0] === 'L') pdf.lineTo(X(c[1]), Y(c[2]));
          else if (c[0] === 'C') pdf.curveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6]));
          else pdf.close();
        }
        if (sw > 0) {
          pdf.setLineWidth(sw * k);
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
}

export async function exportPaperPdf(
  doc: PaperDoc,
  size: PdfSize = pdfSize(doc, null),
): Promise<void> {
  const problem = pdfSizeProblem(size);
  if (problem) throw new Error(`${size.w} × ${size.h} mm: ${problem}`);
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

  size.tiles.forEach((t, i) => {
    if (i > 0) pdf.addPage([size.w, size.h], size.w > size.h ? 'landscape' : 'portrait');
    if (t.clip) {
      // Окно обреза: всё, что за ним, принадлежит соседней странице разбивки.
      pdf.saveGraphicsState();
      pdf.rect(t.clip[0], t.clip[1], t.clip[2], t.clip[3], null);
      pdf.clip();
      pdf.discardPath();
    }
    drawPrims(pdf, doc.prims, size.scale, t.tx, t.ty);
    if (t.clip) pdf.restoreGraphicsState();
    drawPrims(pdf, t.furniture, 1, 0, 0);
  });
  pdf.save(pdfFileName(doc, size));
}
