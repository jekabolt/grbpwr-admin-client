import type { WorkSheet } from 'xlsx';
import { bytesFromBase64, MAX_TABLE_ROWS, type TableCell } from './file-view';

/** Столбцов больше не показываем: диапазон листа бывает раздут форматированием до XFD. */
const MAX_COLUMNS = 256;

/** `originRow` / `originCol`: где начинается диапазон листа, чтобы подпись D12 была правдой. */
export type Sheet = {
  name: string;
  rows: TableCell[][];
  totalRows: number;
  originRow?: number;
  originCol?: number;
};

/** Цвет текста по заливке. SheetJS не отдаёт шрифт, и белая шапка стала бы чёрной на тёмном. */
export function inkOn(fill: string): string {
  const n = parseInt(fill, 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance < 0.5 ? '#ffffff' : '#000000';
}

type CellStyle = { patternType?: string; fgColor?: { rgb?: string } };

function fillOf(style: unknown): string | undefined {
  const s = style as CellStyle | undefined;
  if (s?.patternType !== 'solid') return undefined;
  const rgb = s.fgColor?.rgb;
  // Цвет темы приходит без rgb: без него ячейка остаётся без заливки, а не с чужой.
  return rgb && /^[0-9a-f]{6,8}$/i.test(rgb) ? rgb.slice(-6) : undefined;
}

/** Значение формулы берётся из файла, как его сохранил Excel. `w` — текст с форматом ячейки. */
export function sheetRows(
  ws: WorkSheet,
  utils: typeof import('xlsx').utils,
): { rows: TableCell[][]; totalRows: number; originRow?: number; originCol?: number } {
  const ref = ws['!ref'];
  if (!ref) return { rows: [], totalRows: 0 };
  const range = utils.decode_range(ref);
  const totalRows = range.e.r - range.s.r + 1;
  const lastRow = Math.min(range.e.r, range.s.r + MAX_TABLE_ROWS - 1);
  const lastCol = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
  const rows: TableCell[][] = [];
  for (let r = range.s.r; r <= lastRow; r++) {
    const row: TableCell[] = [];
    for (let c = range.s.c; c <= lastCol; c++) {
      const cell = ws[utils.encode_cell({ r, c })];
      row.push({
        text: cell ? String(cell.w ?? cell.v ?? '') : '',
        numeric: cell?.t === 'n',
        fill: fillOf(cell?.s),
      });
    }
    rows.push(row);
  }
  return { rows, totalRows, originRow: range.s.r, originCol: range.s.c };
}

/** Библиотека большая, поэтому только динамический импорт: её грузит лишь открытие таблицы. */
export async function readSheets(base64: string): Promise<Sheet[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytesFromBase64(base64), { type: 'array', cellStyles: true });
  return wb.SheetNames.map((name) => ({ name, ...sheetRows(wb.Sheets[name], XLSX.utils) }));
}
