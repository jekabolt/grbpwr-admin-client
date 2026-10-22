// Print 1:1 on a print-shop paper roll: the pattern's pieces for the chosen sizes × copies, laid
// out across the roll's printable width and cut into sheets no longer than the roll profile allows.
// A sheet break always falls between pieces, and every sheet carries its own test square and title
// line, so the shop can print and check each sheet on its own.
//
// CONTRACT between the print dialog (UI) and the layout engine. The UI codes against these
// signatures only; the engine fills in the bodies.
import type { ExportDeps, ExportResult } from './formats';
import type { PatternDrawing } from './drawing';

/** One paper roll as the user set it for this print. */
export type RollSpec = {
  /** Roll width as sold, cm (61, 91.4, 106.7, 111.8, 152.4 …). */
  widthCm: number;
  /** Longest sheet the shop prints, m. Default 3. Never above the PDF page limit (5.08 m). */
  maxSheetM: number;
  /** Dead edge the printer leaves on each side, mm. Default 5. Printable width = width − 2·edge. */
  edgeMm: number;
};

export const ROLL_DEFAULTS: Omit<RollSpec, 'widthCm'> = { maxSheetM: 3, edgeMm: 5 };
export const STOCK_ROLL_WIDTHS_CM = [61, 91.4, 106.7, 111.8, 152.4] as const;

/** Copies per size, e.g. { XS: 1, M: 2 }. Sizes with 0 copies are left out of the print. */
export type SizeCopies = Record<string, number>;

/** What the DXF offers to print: its sizes and the piece count per size. */
export type RollPrintSource = {
  sizes: { size: string; pieces: number }[];
  title: string;
  warnings: string[];
};

export type RollSheet = {
  /** The sheet as it lands on the PDF page: page width = roll width, test square + title drawn. */
  drawing: PatternDrawing;
  lengthMm: number;
};

export type RollPrintPlan = {
  sheets: RollSheet[];
  /** Paper used, mm (sum of sheet lengths). */
  lengthMm: number;
  /** Pieces laid / pieces asked for. */
  placed: number;
  total: number;
  /** Piece labels (`FRONT · M`) that fit the printable width in no orientation. */
  tooWide: string[];
  /** Piece labels longer than one sheet in every orientation. */
  tooLong: string[];
  warnings: string[];
};

/** Read the DXF once: sizes and piece counts for step 1 of the dialog. */
export function readRollPrintSource(_dxf: ArrayBuffer, _fileName: string): RollPrintSource {
  throw new Error('roll print: not implemented');
}

/**
 * Lay the chosen sizes × copies onto the roll. Async: the engine may run the nesting worker.
 * `signal` aborts a stale run when the user changes a number.
 */
export async function planRollPrint(
  _dxf: ArrayBuffer,
  _fileName: string,
  _copies: SizeCopies,
  _roll: RollSpec,
  _signal?: AbortSignal,
): Promise<RollPrintPlan> {
  throw new Error('roll print: not implemented');
}

/** The PDF: one page per sheet, page width = roll width exactly, 1:1. */
export function exportRollPrint(
  _plan: RollPrintPlan,
  _title: string,
  _roll: RollSpec,
  _deps: ExportDeps,
): ExportResult {
  throw new Error('roll print: not implemented');
}

/** File name the dialog shows in its toast: `SS25-004_print_roll91.4.pdf`. */
export const rollPrintFileName = (title: string, roll: RollSpec): string =>
  `${title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pattern'}_print_roll${roll.widthCm}.pdf`;
