import type { TaskFileContent } from '../../api/tasksService';
import {
  bytesFromBase64,
  decodeText,
  looksNumeric,
  MAX_TABLE_ROWS,
  parseDelimited,
} from './file-view';
import { readSheets, type Sheet } from './sheet';
import { openSheetBook, type SheetBook } from './sheet-edit';

export type SheetDoc = { sheets: Sheet[]; book: SheetBook | null };

/**
 * Разбор на один объект чтения. Две таблицы одного файла не разбирают его дважды, а новая запись
 * в кэше запроса значит новые байты.
 */
const parsed = new WeakMap<TaskFileContent, Promise<SheetDoc>>();

async function parse(fileName: string, data: TaskFileContent): Promise<SheetDoc> {
  const bytes = bytesFromBase64(data.content);
  const book = openSheetBook(fileName, bytes);
  if (/\.(csv|tsv)$/i.test(fileName) || !fileName.includes('.')) {
    const rows = parseDelimited(decodeText(bytes));
    const shown = rows.slice(0, MAX_TABLE_ROWS);
    return {
      book,
      sheets: [
        {
          name: '',
          totalRows: rows.length,
          rows: shown.map((row) =>
            row.map((value) => ({ text: value, numeric: looksNumeric(value) })),
          ),
        },
      ],
    };
  }
  return { book, sheets: await readSheets(data.content) };
}

export function loadSheetDoc(fileName: string, data: TaskFileContent): Promise<SheetDoc> {
  const known = parsed.get(data);
  if (known) return known;
  const next = parse(fileName, data);
  parsed.set(data, next);
  return next;
}

/** Сегодня — время, иначе день и месяц. */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (!iso || Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? `${pad(at.getHours())}:${pad(at.getMinutes())}`
    : `${pad(at.getDate())}.${pad(at.getMonth() + 1)}`;
}

/** `<name> copy.<ext>` */
export function copyName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)} copy${fileName.slice(dot)}` : `${fileName} copy`;
}

export function sheetByline(prefix: string, by: string, at: string): string {
  return [prefix + (by ? ` ${by}` : ''), formatWhen(at)].filter(Boolean).join(' · ');
}
