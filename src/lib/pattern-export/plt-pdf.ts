// PLT / HP-GL → PDF at its physical size (1:1), one sheet or tiled A4.
//
// The file is READ by the pattern import's own HP-GL adapter (lib/pattern-import/adapters/hpgl:
// tokenizer, interpreter with IP/SC scaling, PE, arcs, labels) — never by a second parser here,
// so "what the import sees" and "what the print shows" are one reading of the file. Its output is
// mm, y-up, one style per pen ("pen N"); this module only flips it onto paper and colours pens.
import { assertFiniteDoc } from 'lib/pattern-import/adapters/budget';
import { makeExtractHpgl } from 'lib/pattern-import/adapters/hpgl';
import { tokenize } from 'lib/pattern-import/adapters/hpgl/tokenize';
import { latin1 } from 'lib/pattern-import/adapters/sniff/sniff';
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
  /** Plotter units per mm the sheet was read with. */
  unitsPerMm: number;
  /** The file scales its own coordinates (IP / SC): user units → plotter units as it says. */
  selfScaled: { ip: boolean; sc: boolean };
  /** RO applied to the whole drawing, degrees CCW (0 = none). */
  rotationDeg: number;
  /** Pens used, with how many pen-down runs each drew. */
  pens: { pen: number; runs: number; rgb: Rgb }[];
};

export type PltReadOptions = {
  /** File name, for the page furniture and the download name. */
  name?: string;
  /** Plotter units per mm (HP-GL standard 40). */
  unitsPerMm?: number;
};

/** Past this the drawing is not a pattern: refused before any page is planned. */
export const PLT_MAX_SIDE_MM = 20_000;

// RO (plot rotation) — the import reader ignores it (warning only). A 1:1 print cannot: a rotated
// drawing printed unrotated is a different garment on the table. Supported when the file sets ONE
// rotation before anything is drawn (how plot files use it); the whole drawing is then turned here,
// after extraction. Any other use of RO is refused rather than printed silently wrong.
const DRAWS = new Set([
  'PD',
  'PA',
  'PR',
  'PE',
  'LB',
  'CI',
  'AA',
  'AR',
  'AT',
  'RT',
  'BZ',
  'BR',
  'EA',
  'ER',
  'RA',
  'RR',
  'EW',
  'WG',
]);
function scanCommands(u: Uint8Array): { ro: number; ip: boolean; sc: boolean } {
  const { cmds } = tokenize(latin1(u));
  let ro: number | null = null;
  let drawn = false;
  let ip = false;
  let sc = false;
  for (const c of cmds) {
    if (c.op === 'IP' && c.args.length) ip = true;
    if (c.op === 'SC' && c.args.length) sc = true;
    if (c.op === 'IN') {
      if (drawn && ro)
        throw new Error(
          'RO is reset by IN after drawing — a multi-rotation plot file is not supported',
        );
      // IN resets the rotation to 0; before any drawing that simply cancels an earlier RO.
      if (!drawn) ro = null;
      continue;
    }
    if (c.op === 'RO') {
      const a = ((Math.round(c.args[0] ?? 0) % 360) + 360) % 360;
      if (a % 90 !== 0)
        throw new Error(`RO ${c.args[0]}: only 0/90/180/270 are valid plot rotations`);
      if (drawn && a !== (ro ?? 0))
        throw new Error(
          `RO ${c.args[0]} changes the rotation after drawing has started — not supported; refusing rather than printing it unrotated`,
        );
      ro = a;
      continue;
    }
    if (DRAWS.has(c.op)) drawn = true;
  }
  return { ro: ro ?? 0, ip, sc };
}

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
  const unitsPerMm = opts.unitsPerMm ?? 40;
  if (!(Number.isFinite(unitsPerMm) && unitsPerMm > 0))
    throw new Error(`plotter units per mm must be a positive number (got ${unitsPerMm})`);
  const scan = scanCommands(new Uint8Array(buf));
  const doc = await makeExtractHpgl({ unitsPerMm })(
    { id: 'plt', name, bytes: buf },
    { sagittaMm: 0.05, keepFills: true },
  );
  // Damaged numbers (1e400 → Infinity, NaN) are refused here, before any extent is planned.
  assertFiniteDoc(doc);
  const page: IRPage = doc.pages[0];
  const ro = scan.ro;
  const rad = (ro * Math.PI) / 180;
  const [cr, sr] = [Math.round(Math.cos(rad)), Math.round(Math.sin(rad))];
  // RO turns the coordinate system CCW; for a 1:1 print only the turn matters (the sheet is
  // trimmed to the drawing), so the origin it turns about is irrelevant.
  const rot = (x: number, y: number): [number, number] =>
    ro ? [x * cr - y * sr, x * sr + y * cr] : [x, y];
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
  for (const p of page.paths) for (const q of p.pts) grow(...rot(q.x, q.y));
  for (const t of page.texts)
    for (const [x, y] of [
      [t.bbox.minX, t.bbox.minY],
      [t.bbox.maxX, t.bbox.minY],
      [t.bbox.maxX, t.bbox.maxY],
      [t.bbox.minX, t.bbox.maxY],
    ])
      grow(...rot(x, y));
  if (!Number.isFinite(minX)) throw new Error('the file draws nothing');
  if (!Number.isFinite(maxX - minX) || !Number.isFinite(maxY - minY))
    throw new Error('the drawing has no finite size — the file is damaged');
  if (maxX - minX > PLT_MAX_SIDE_MM || maxY - minY > PLT_MAX_SIDE_MM)
    throw new Error(
      `the drawing is ${Math.round(maxX - minX)} × ${Math.round(maxY - minY)} mm at ${+unitsPerMm.toFixed(3)} plotter units/mm — over the ${PLT_MAX_SIDE_MM / 1000} m limit; check the units`,
    );

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
      pts: p.pts.map((q) => {
        const [x, y] = rot(q.x, q.y);
        return [X(x), Y(y)] as [number, number];
      }),
      closed: p.closed,
      widthMm: ink.widthMm,
      rgb: ink.rgb,
      dashMm: st?.dash ?? null,
    });
  }
  const texts: SheetText[] = page.texts.map((t) => {
    const [ax, ay] = rot(t.anchor.x, t.anchor.y);
    return {
      text: t.text,
      x: X(ax),
      y: Y(ay),
      // IRText.fontSizeMm = cap height / 0.7; Helvetica's cap height is ~0.72 em.
      sizeMm: t.fontSizeMm,
      rotationDeg: t.rotationDeg + ro,
    };
  });
  // The reader's own "RO ignored" warning is answered here.
  const warnings = doc.warnings.filter((w) => !(ro && /^RO /.test(w)));
  if (ro) warnings.push(`RO ${ro}: the drawing is turned ${ro}° as the file asks`);
  return {
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    lines,
    texts,
    title: name,
    warnings,
    unitsPerMm,
    selfScaled: { ip: scan.ip, sc: scan.sc },
    rotationDeg: ro,
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
