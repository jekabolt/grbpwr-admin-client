// HOW PAGE 05 SPLITS ONTO PAPER, as numbers and with no DOM: the sheet is a fixed box that clips, so
// a row has to be placed before it can be cut. Column widths are fixed for the same reason: the words
// wrap where this file expects. The page watches the real boxes and asks for a tighter plan when an
// estimate falls short.
import type { PrintOrient } from 'components/managers/print/scope';
import type { SewnQrLine, SewnTableRow } from './derive-labels';
import { BODY_PX, chunksOf } from './sheet';

/** The flat of the mockup. */
export const LABEL_FLAT_PX = { w: 210, h: 238 } as const;
/** 84 px on a 96 dpi sheet is 22 mm on paper, over the 17 mm the factory's scanners need. */
export const LABEL_QR_PX = 84;
export const QR_TITLE_PX = 150;
export const QR_COL_GAP_PX = 10;
export const QR_ROW_GAP_PX = 6;
export const LABEL_BLOCK_GAP_PX = 14;

// # item location attachment fold size material qty step
export const LABEL_TABLE_COLS: Record<PrintOrient, readonly number[]> = {
  land: [30, 95, 115, 115, 65, 60, 120, 35, 130],
  port: [28, 78, 85, 85, 50, 52, 90, 34, 100],
};

// The same table with a note last. The note takes its room from the words, the sheet stays as wide.
export const LABEL_TABLE_NOTE_COLS: Record<PrintOrient, readonly number[]> = {
  land: [28, 80, 96, 96, 56, 56, 105, 32, 110, 105],
  port: [26, 65, 72, 72, 46, 48, 76, 30, 82, 85],
};

/** A note column only when a row has a note: a card without notes prints the table it always did. */
export const labelTableCols = (
  orient: PrintOrient,
  table: readonly SewnTableRow[],
): readonly number[] =>
  (table.some((row) => row.note) ? LABEL_TABLE_NOTE_COLS : LABEL_TABLE_COLS)[orient];

const HEADER_PX = 42;
const TABLE_HEAD_PX = 26;
const QR_HEAD_PX = 30;
const SIZES_PX = 18 + QR_ROW_GAP_PX;
const QR_LINE_PX = LABEL_QR_PX + QR_ROW_GAP_PX;
const CHAR_PX = 7.3;
const LINE_PX = 18;
const CELL_X_PX = 12;
const CELL_Y_PX = 9;
const TAPES_PX: Record<PrintOrient, number> = { land: 172, port: 310 };

export type QrGridRow =
  | { kind: 'sizes'; key: string; labels: string[] }
  | { kind: 'qr'; key: string; title: string; cells: SewnQrLine['cells'] };

export type LabelSheetPlan = {
  flat: boolean;
  rows: SewnTableRow[];
  qr: QrGridRow[];
  tapes: boolean;
};

/** How many QR fit beside the line's title. */
export const qrColumns = (orient: PrintOrient): number =>
  Math.floor((BODY_PX[orient].w - QR_TITLE_PX) / (LABEL_QR_PX + QR_COL_GAP_PX));

/** Lines a text takes in a column: greedy by words, CJK twice as wide, a long word breaks. */
function linesIn(text: string, columnPx: number): number {
  const fit = Math.max(1, Math.floor((columnPx - CELL_X_PX) / CHAR_PX));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const width = [...word].reduce(
      (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1),
      0,
    );
    if (used > 0 && used + 1 + width > fit) {
      lines += 1;
      used = 0;
    }
    used += used > 0 ? width + 1 : width;
    while (used > fit) {
      lines += 1;
      used -= fit;
    }
  }
  return lines;
}

function rowPx(row: SewnTableRow, cols: readonly number[]): number {
  const cells = [
    '',
    row.item,
    row.location,
    row.attachment,
    row.fold,
    row.size,
    row.material,
    '',
    row.step,
    row.note,
  ];
  return CELL_Y_PX + LINE_PX * Math.max(...cols.map((width, i) => linesIn(cells[i], width)));
}

/** The grid in rows: a long size run breaks into segments, each under its own row of sizes. */
function qrGridRows(lines: readonly SewnQrLine[], columns: number): QrGridRow[][] {
  return lines.flatMap((line) =>
    chunksOf(line.cells, columns).map((cells, index) => {
      const key = `${line.key}-${index}`;
      const row: QrGridRow = { kind: 'qr', key, title: line.title, cells };
      return line.perSize
        ? [
            { kind: 'sizes' as const, key: `${key}-sizes`, labels: cells.map((c) => c.sizeLabel) },
            row,
          ]
        : [row];
    }),
  );
}

const sameLabels = (row: QrGridRow | undefined, labels: string[]) =>
  row?.kind === 'qr' &&
  row.cells.length === labels.length &&
  row.cells.every((cell, i) => cell.sizeLabel === labels[i]);

export function planLabelSheets(
  sewn: { table: readonly SewnTableRow[]; qr: readonly SewnQrLine[] },
  orient: PrintOrient,
  tight = 0,
): LabelSheetPlan[] {
  const land = orient === 'land';
  const cols = labelTableCols(orient, sewn.table);
  const full = (BODY_PX[orient].h - HEADER_PX) * (1 - tight * 0.08);
  let sheet: LabelSheetPlan = { flat: true, rows: [], qr: [], tapes: false };
  const sheets = [sheet];
  const open = () => {
    sheet = { flat: false, rows: [], qr: [], tapes: false };
    sheets.push(sheet);
  };

  // On a landscape sheet the table stands beside the flat; on a portrait one, under it.
  let used = land ? TABLE_HEAD_PX : LABEL_FLAT_PX.h + LABEL_BLOCK_GAP_PX + TABLE_HEAD_PX;
  for (const row of sewn.table) {
    const height = rowPx(row, cols);
    if (used + height > full && sheet.rows.length > 0) {
      open();
      used = TABLE_HEAD_PX;
    }
    sheet.rows.push(row);
    used += height;
  }
  if (sheet.flat) used = Math.max(used, LABEL_FLAT_PX.h);

  for (const group of qrGridRows(sewn.qr, qrColumns(orient))) {
    const head = group[0];
    const needsSizes = head.kind === 'sizes' && !sameLabels(sheet.qr.at(-1), head.labels);
    const rows = needsSizes ? group : group.filter((row) => row.kind === 'qr');
    const chrome = sheet.qr.length ? 0 : LABEL_BLOCK_GAP_PX + QR_HEAD_PX;
    const height = rows.reduce((sum, row) => sum + (row.kind === 'qr' ? QR_LINE_PX : SIZES_PX), 0);
    if (used + chrome + height > full && (sheet.qr.length || sheet.rows.length)) {
      open();
      used = 0;
      sheet.qr.push(...group);
      used += QR_HEAD_PX + group.reduce((s, r) => s + (r.kind === 'qr' ? QR_LINE_PX : SIZES_PX), 0);
      continue;
    }
    sheet.qr.push(...rows);
    used += chrome + height;
  }

  // The tapes stay when the last sheet has room for them; they never open a sheet of their own.
  sheet.tapes = used + LABEL_BLOCK_GAP_PX + TAPES_PX[orient] <= full;
  return sheets;
}
