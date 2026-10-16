// PLT / HP-GL → PDF at its physical size (1:1), one sheet or tiled A4.
//
// The file is READ by the pattern import's own HP-GL adapter (lib/pattern-import/adapters/hpgl:
// tokenizer, interpreter with IP/SC scaling, PE, arcs, labels) — never by a second parser here,
// so "what the import sees" and "what the print shows" are one reading of the file. Its output is
// mm, y-up, one style per pen ("pen N"); this module only flips it onto paper and colours pens.
import { makeExtractHpgl } from 'lib/pattern-import/adapters/hpgl';
import type { IRPage } from 'lib/pattern-import/types';
import {
  sheetToPdf,
  type PrintSheet,
  type Rgb,
  type SheetLine,
  type SheetPdfMode,
  type SheetPdfOptions,
  type SheetPdfResult,
  type SheetText,
} from './sheet-pdf';

/** Pen colours on paper — the PLT dialect of hpgl.ts: 1 cut, 2 drawn lines/text, 3 notches. */
const PEN_INK: Record<number, { rgb: Rgb; widthMm: number }> = {
  1: { rgb: [0, 0, 0], widthMm: 0.3 },
  2: { rgb: [40, 80, 190], widthMm: 0.2 },
  3: { rgb: [210, 30, 40], widthMm: 0.25 },
};
const OTHER_PEN = { rgb: [90, 90, 90] as Rgb, widthMm: 0.2 };

export type PltSheet = PrintSheet & {
  warnings: string[];
  /** Pens used, with how many pen-down runs each drew. */
  pens: { pen: number; runs: number; rgb: Rgb }[];
};

export type PltReadOptions = {
  /** File name, for the page furniture and the download name. */
  name?: string;
  /** Plotter units per mm (HP-GL standard 40). */
  unitsPerMm?: number;
};

const penOfLayer = (layer: string | null) => {
  const m = layer ? /^pen (-?\d+)$/.exec(layer) : null;
  return m ? Number(m[1]) : 1;
};

/** Read a PLT into a print sheet (mm, y-down, trimmed to the drawing). Throws on non-HP-GL. */
export async function readPltSheet(
  bytes: ArrayBuffer | Uint8Array,
  opts: PltReadOptions = {},
): Promise<PltSheet> {
  const buf =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : bytes;
  const name = opts.name ?? 'drawing.plt';
  const doc = await makeExtractHpgl({ unitsPerMm: opts.unitsPerMm })(
    { id: 'plt', name, bytes: buf },
    { sagittaMm: 0.05, keepFills: true },
  );
  const page: IRPage = doc.pages[0];
  const styles = new Map(page.styles.map((s) => [s.id, s]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of page.paths) for (const q of p.pts) grow(q.x, q.y);
  for (const t of page.texts) {
    grow(t.bbox.minX, t.bbox.minY);
    grow(t.bbox.maxX, t.bbox.maxY);
  }
  if (!Number.isFinite(minX)) throw new Error('the file draws nothing');

  const X = (x: number) => x - minX;
  const Y = (y: number) => maxY - y; // y-up → y-down
  const runs = new Map<number, number>();
  const lines: SheetLine[] = [];
  for (const p of page.paths) {
    const st = styles.get(p.style);
    const pen = penOfLayer(st?.layer ?? null);
    runs.set(pen, (runs.get(pen) ?? 0) + 1);
    const ink = PEN_INK[pen] ?? OTHER_PEN;
    lines.push({
      pts: p.pts.map((q) => [X(q.x), Y(q.y)] as [number, number]),
      closed: p.closed,
      widthMm: ink.widthMm,
      rgb: ink.rgb,
      dashMm: st?.dash ?? null,
    });
  }
  const texts: SheetText[] = page.texts.map((t) => ({
    text: t.text,
    x: X(t.anchor.x),
    y: Y(t.anchor.y),
    // IRText.fontSizeMm = cap height / 0.7; Helvetica's cap height is ~0.72 em.
    sizeMm: t.fontSizeMm,
    rotationDeg: t.rotationDeg,
  }));
  return {
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    lines,
    texts,
    title: name,
    warnings: doc.warnings,
    pens: [...runs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pen, n]) => ({ pen, runs: n, rgb: (PEN_INK[pen] ?? OTHER_PEN).rgb })),
  };
}

export type PltPdfResult = SheetPdfResult & {
  sheet: PltSheet;
  fileName: string;
};

/**
 * PLT bytes → PDF bytes at 1:1. `mode`: 'sheet' = one page the size of the drawing (+ margin and
 * a test square; refused past the PDF page limit of 5080 mm), 'a4' = tiled A4 with a page-1 map.
 */
export async function pltToPdf(
  bytes: ArrayBuffer | Uint8Array,
  mode: SheetPdfMode = 'a4',
  opts: PltReadOptions & SheetPdfOptions = {},
): Promise<PltPdfResult> {
  const sheet = await readPltSheet(bytes, opts);
  const res = await sheetToPdf(sheet, mode, opts);
  const stem = (opts.name ?? 'drawing.plt').replace(/\.[^.]+$/, '') || 'drawing';
  const fileName =
    mode === 'sheet'
      ? `${stem}-1to1.pdf`
      : `${stem}-1to1-${res.pages - 1}x${res.plan?.paper ?? 'A4'}.pdf`;
  return { ...res, sheet, fileName };
}
