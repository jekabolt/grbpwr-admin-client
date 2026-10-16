// A drawing sheet (mm, y-down) → PDF at 1:1: one page the size of the sheet, or tiled onto A4
// with overlap, registration marks, row/column labels and a page-1 map with a 100 × 100 mm test
// square (tiles.ts holds the plan; this file only draws it).
//
// Not the assembly-print typesetter (tech-card/assembly-print/paper-pdf.ts) on purpose: that one
// SCALES the sheet to fit a paper preset (floor 1/√2), downloads straight away and loads its font
// through Vite asset URLs. A pattern print must never scale, the caller needs the bytes (preview,
// node probe), and Helvetica — a PDF base font — needs no font file at all.
//
// jsPDF is loaded lazily: ~300 KB only when someone actually makes a PDF.
import { planTiles, type PaperName, type TilePlan } from './tiles';

export type Rgb = [number, number, number];

/** A stroked polyline in sheet mm (y-down, origin top-left). */
export type SheetLine = {
  pts: [number, number][];
  closed: boolean;
  widthMm: number;
  rgb: Rgb;
  dashMm?: number[] | null;
};

/** Baseline-left text; rotation CCW as seen on paper. */
export type SheetText = {
  text: string;
  x: number;
  y: number;
  sizeMm: number;
  rotationDeg: number;
  rgb?: Rgb;
};

export type PrintSheet = {
  widthMm: number;
  heightMm: number;
  lines: SheetLine[];
  texts: SheetText[];
  /** Printed in the page furniture ("pattern.plt"). */
  title: string;
};

export type SheetPdfMode = 'sheet' | 'a4';

export type SheetPdfOptions = {
  paper?: PaperName;
  overlapMm?: number;
  marginMm?: number;
};

export type SheetPdfResult = {
  bytes: Uint8Array;
  pages: number;
  /** Tiled mode only (1 × 1 for a single sheet). */
  cols: number;
  rows: number;
  plan: TilePlan | null;
  pageWmm: number;
  pageHmm: number;
};

/** jsPDF's hard page limit: 14 400 pt per side. */
export const PDF_PAGE_MAX_MM = Math.floor((14400 * 25.4) / 72);
const PT_PER_MM = 72 / 25.4;
const BLACK: Rgb = [0, 0, 0];
const GREY: Rgb = [120, 120, 120];
const SHEET_MARGIN = 15;
const SQUARE = 100;

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

type Bbox = [number, number, number, number];
function bboxOf(l: SheetLine): Bbox {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of l.pts) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

function drawContent(
  pdf: Pdf,
  sheet: PrintSheet,
  boxes: Bbox[],
  ox: number,
  oy: number,
  view: Bbox | null,
) {
  let rgbKey = '';
  let width = -1;
  let dashed = false;
  sheet.lines.forEach((l, i) => {
    if (l.pts.length < 2) return;
    const b = boxes[i];
    if (view && (b[2] < view[0] || b[0] > view[2] || b[3] < view[1] || b[1] > view[3])) return;
    const k = l.rgb.join(',');
    if (k !== rgbKey) {
      pdf.setDrawColor(l.rgb[0], l.rgb[1], l.rgb[2]);
      rgbKey = k;
    }
    if (l.widthMm !== width) {
      pdf.setLineWidth(l.widthMm);
      width = l.widthMm;
    }
    const dash = l.dashMm && l.dashMm.length ? l.dashMm : null;
    if (dash || dashed) {
      pdf.setLineDashPattern(dash ?? [], 0);
      dashed = !!dash;
    }
    pdf.moveTo(l.pts[0][0] + ox, l.pts[0][1] + oy);
    for (let j = 1; j < l.pts.length; j++) pdf.lineTo(l.pts[j][0] + ox, l.pts[j][1] + oy);
    if (l.closed) pdf.close();
    pdf.stroke();
  });
  if (dashed) pdf.setLineDashPattern([], 0);
  for (const t of sheet.texts) {
    // Rotated labels reach far from their anchor: cull only what is clearly elsewhere.
    const reach = t.sizeMm * (t.text.length + 2);
    if (
      view &&
      (t.x > view[2] + reach ||
        t.x < view[0] - reach ||
        t.y > view[3] + reach ||
        t.y < view[1] - reach)
    )
      continue;
    const c = t.rgb ?? BLACK;
    pdf.setTextColor(c[0], c[1], c[2]);
    pdf.setFontSize(t.sizeMm * PT_PER_MM);
    pdf.text(t.text, t.x + ox, t.y + oy, { angle: t.rotationDeg, baseline: 'alphabetic' });
  }
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
}

function text(
  pdf: Pdf,
  s: string,
  x: number,
  y: number,
  pt: number,
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; angle?: number; rgb?: Rgb } = {},
) {
  pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  pdf.setFontSize(pt);
  const c = opts.rgb ?? BLACK;
  pdf.setTextColor(c[0], c[1], c[2]);
  pdf.text(s, x, y, {
    align: opts.align ?? 'left',
    angle: opts.angle ?? 0,
    baseline: 'alphabetic',
  });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
}

/** The 100 × 100 mm check square with its caption, top-left at (x, y). */
function testSquare(pdf: Pdf, x: number, y: number) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, SQUARE, SQUARE, 'S');
  pdf.setLineWidth(0.15);
  for (let i = 10; i < SQUARE; i += 10) {
    pdf.line(x + i, y, x + i, y + (i % 50 === 0 ? 6 : 3));
    pdf.line(x, y + i, (i % 50 === 0 ? 6 : 3) + x, y + i);
  }
  text(pdf, 'TEST SQUARE 100 x 100 mm', x + SQUARE / 2, y + SQUARE / 2 - 2, 10, {
    bold: true,
    align: 'center',
  });
  text(
    pdf,
    'measure before cutting: print at 100 % / actual size,',
    x + SQUARE / 2,
    y + SQUARE / 2 + 4,
    7,
    { align: 'center' },
  );
  text(pdf, 'never "fit to page"', x + SQUARE / 2, y + SQUARE / 2 + 8, 7, { align: 'center' });
}

/** Registration mark: crosshair + circle. */
function mark(pdf: Pdf, x: number, y: number) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.15);
  pdf.line(x - 4, y, x + 4, y);
  pdf.line(x, y - 4, x, y + 4);
  pdf.circle(x, y, 2.5, 'S');
}

function clipTo(pdf: Pdf, x: number, y: number, w: number, h: number) {
  pdf.saveGraphicsState();
  pdf.rect(x, y, w, h, null);
  pdf.clip();
  pdf.discardPath();
}

async function newPdf(w: number, h: number): Promise<Pdf> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: w > h ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [w, h],
    compress: true,
  });
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  pdf.setFont('helvetica', 'normal');
  return pdf;
}

function finish(pdf: Pdf): Uint8Array {
  return new Uint8Array(pdf.output('arraybuffer'));
}

/** Can the sheet go on ONE page (with its margin and the test-square band)? */
export function sheetFitsOnePage(sheet: Pick<PrintSheet, 'widthMm' | 'heightMm'>): boolean {
  const w = Math.max(sheet.widthMm, SQUARE) + 2 * SHEET_MARGIN;
  const h = sheet.heightMm + 2 * SHEET_MARGIN + SQUARE + 20;
  return w <= PDF_PAGE_MAX_MM && h <= PDF_PAGE_MAX_MM;
}

export async function sheetToPdf(
  sheet: PrintSheet,
  mode: SheetPdfMode,
  opts: SheetPdfOptions = {},
): Promise<SheetPdfResult> {
  if (mode === 'sheet') {
    const boxes = sheet.lines.map(bboxOf);
    if (!sheetFitsOnePage(sheet))
      throw new Error(
        `${Math.round(sheet.widthMm)} x ${Math.round(sheet.heightMm)} mm does not fit one PDF page (limit ${PDF_PAGE_MAX_MM} mm per side) — use the tiled A4 mode`,
      );
    const M = SHEET_MARGIN;
    const w = Math.max(sheet.widthMm, SQUARE) + 2 * M;
    const h = sheet.heightMm + 2 * M + SQUARE + 20;
    const pdf = await newPdf(w, h);
    text(
      pdf,
      `${sheet.title} - 1:1, ${Math.round(sheet.widthMm)} x ${Math.round(sheet.heightMm)} mm`,
      M,
      M - 5,
      8,
    );
    drawContent(pdf, sheet, boxes, M, M, null);
    testSquare(pdf, M, M + sheet.heightMm + 20);
    return { bytes: finish(pdf), pages: 1, cols: 1, rows: 1, plan: null, pageWmm: w, pageHmm: h };
  }

  // Pad the drawing so a line lying on its very edge is not half-clipped by the first window.
  const PAD = 5;
  const padded: PrintSheet = {
    ...sheet,
    widthMm: sheet.widthMm + 2 * PAD,
    heightMm: sheet.heightMm + 2 * PAD,
    lines: sheet.lines.map((l) => ({
      ...l,
      pts: l.pts.map(([x, y]) => [x + PAD, y + PAD] as [number, number]),
    })),
    texts: sheet.texts.map((t) => ({ ...t, x: t.x + PAD, y: t.y + PAD })),
  };
  return tiled(padded, opts);
}

async function tiled(sheet: PrintSheet, opts: SheetPdfOptions): Promise<SheetPdfResult> {
  const boxes = sheet.lines.map(bboxOf);
  const plan = planTiles(sheet.widthMm, sheet.heightMm, {
    paper: opts.paper ?? 'A4',
    marginMm: opts.marginMm,
    overlapMm: opts.overlapMm,
  });
  const { pageW, pageH, margin: M, winW, winH, overlap } = plan;
  const total = plan.tiles.length + 1;

  // Page 1 — the map: the whole sheet scaled into the top, tile grid over it, test square below.
  const [mapW, mapH] = [210, 297];
  const pdf = await newPdf(mapW, mapH);
  text(pdf, `${sheet.title}`, 10, 14, 11, { bold: true });
  text(
    pdf,
    `1:1 print on ${plan.tiles.length} x ${plan.paper}${plan.landscape ? ' landscape' : ''} (${plan.cols} columns x ${plan.rows} rows) - sheet ${Math.round(sheet.widthMm)} x ${Math.round(sheet.heightMm)} mm - page 1 of ${total}`,
    10,
    20,
    7.5,
  );
  text(
    pdf,
    `Assemble: overlap neighbouring pages by ${overlap} mm so the (+) registration marks coincide; columns A, B, C... left to right, rows 1, 2, 3... top to bottom.`,
    10,
    25,
    7,
  );
  const area = { x: 10, y: 32, w: mapW - 20, h: mapH - 32 - SQUARE - 25 };
  const k = Math.min(area.w / sheet.widthMm, area.h / sheet.heightMm);
  const mx = area.x + (area.w - sheet.widthMm * k) / 2;
  const my = area.y;
  const small: PrintSheet = {
    ...sheet,
    lines: sheet.lines.map((l) => ({
      ...l,
      pts: l.pts.map(([x, y]) => [x * k, y * k] as [number, number]),
      widthMm: Math.min(l.widthMm, 0.15),
      dashMm: null,
    })),
    texts: [],
  };
  drawContent(pdf, small, small.lines.map(bboxOf), mx, my, null);
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(...GREY);
  for (const t of plan.tiles) {
    const x0 = mx + t.sx * k;
    const y0 = my + t.sy * k;
    const w = Math.min(winW, sheet.widthMm - t.sx) * k;
    const h = Math.min(winH, sheet.heightMm - t.sy) * k;
    pdf.rect(x0, y0, w, h, 'S');
    text(pdf, t.label, x0 + 1.5, y0 + 4, Math.max(5, Math.min(9, w * 0.4)), {
      bold: true,
      rgb: GREY,
    });
  }
  pdf.setDrawColor(0, 0, 0);
  testSquare(pdf, (mapW - SQUARE) / 2, mapH - SQUARE - 15);

  // Tiles.
  plan.tiles.forEach((t, i) => {
    pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
    const ox = M - t.sx;
    const oy = M - t.sy;
    clipTo(pdf, M, M, winW, winH);
    drawContent(pdf, sheet, boxes, ox, oy, [t.sx, t.sy, t.sx + winW, t.sy + winH]);
    for (const m of plan.marks) {
      if (m.x < t.sx - 5 || m.x > t.sx + winW + 5 || m.y < t.sy - 5 || m.y > t.sy + winH + 5)
        continue;
      mark(pdf, m.x + ox, m.y + oy);
    }
    pdf.restoreGraphicsState();

    // Overlap edges: where the next page's window begins.
    pdf.setDrawColor(...GREY);
    pdf.setLineWidth(0.15);
    pdf.setLineDashPattern([2, 2], 0);
    if (t.col < plan.cols - 1) pdf.line(M + winW - overlap, M, M + winW - overlap, M + winH);
    if (t.row < plan.rows - 1) pdf.line(M, M + winH - overlap, M + winW, M + winH - overlap);
    pdf.setLineDashPattern([], 0);
    // Window frame (trim / alignment reference).
    pdf.setLineWidth(0.1);
    pdf.rect(M, M, winW, winH, 'S');
    pdf.setDrawColor(0, 0, 0);

    // Furniture in the margins.
    text(pdf, t.label, M, M - 3, 10, { bold: true });
    text(
      pdf,
      `${sheet.title} - page ${i + 2} of ${total} - column ${t.label.replace(/\d+$/, '')} of ${plan.cols}, row ${t.row + 1} of ${plan.rows} - 1:1, overlap ${overlap} mm`,
      M + 10,
      M - 3,
      6.5,
    );
    const nb = (c: number, r: number) =>
      plan.tiles.find((x) => x.col === c && x.row === r)?.label ?? null;
    const right = nb(t.col + 1, t.row);
    const left = nb(t.col - 1, t.row);
    const below = nb(t.col, t.row + 1);
    const above = nb(t.col, t.row - 1);
    if (right)
      text(pdf, `${right} >`, pageW - M / 2 + 1.2, M + winH / 2, 7, { angle: -90, bold: true });
    if (left) text(pdf, `< ${left}`, M / 2 - 1.2, M + winH / 2, 7, { angle: 90, bold: true });
    if (below)
      text(pdf, `v ${below}`, M + winW / 2, pageH - M / 2 + 2, 7, { align: 'center', bold: true });
    if (above) text(pdf, `^ ${above}`, M + winW / 2 + 30, M - 3, 6.5, { bold: true });
  });

  return {
    bytes: finish(pdf),
    pages: total,
    cols: plan.cols,
    rows: plan.rows,
    plan,
    pageWmm: pageW,
    pageHmm: pageH,
  };
}
