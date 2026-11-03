/**
 * Чистая часть просмотра вложения в задаче: что делать с файлом и как прочитать его байты.
 * Байты приходят с бэка (`GetTaskFileContent`): из бакета браузер читать не может, у него нет CORS.
 */

export type TaskFileView = 'sheet' | 'delimited' | 'text' | 'html' | 'as-is' | 'download';

export type TableCell = { text: string; numeric: boolean; fill?: string };

/** Сверх этого таблица не рисуется: сто тысяч строк в DOM вешают вкладку. */
export const MAX_TABLE_ROWS = 5000;

const SHEET_EXT = new Set(['xlsx', 'xls', 'xlsm']);
const DELIMITED_EXT = new Set(['csv', 'tsv']);
const HTML_EXT = new Set(['html', 'htm']);
const TEXT_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'json',
  'xml',
  'yaml',
  'yml',
  'ini',
  'conf',
]);
const AS_IS_EXT = new Set([
  'pdf',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'mp4',
  'mov',
  'webm',
]);

export function taskFileViewOf(fileName?: string, contentType?: string): TaskFileView {
  const name = (fileName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  const ct = (contentType ?? '').split(';')[0].trim().toLowerCase();

  // Расширение первым: бакет часто отдаёт csv как text/plain, а то и octet-stream.
  if (SHEET_EXT.has(ext)) return 'sheet';
  if (DELIMITED_EXT.has(ext)) return 'delimited';
  if (HTML_EXT.has(ext)) return 'html';
  if (TEXT_EXT.has(ext)) return 'text';
  if (AS_IS_EXT.has(ext)) return 'as-is';

  if (ct === 'application/vnd.ms-excel' || ct.includes('spreadsheetml')) return 'sheet';
  if (ct === 'text/csv' || ct === 'text/tab-separated-values') return 'delimited';
  if (ct === 'text/html') return 'html';
  if (ct === 'application/pdf' || /^(image|video|audio)\//.test(ct)) return 'as-is';
  if (ct.startsWith('text/') || ct === 'application/json') return 'text';
  return 'download';
}

export function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** UTF-8, а что им не является — windows-1251: так csv сохраняет русский Excel. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Разделитель первой строки, кавычки не считаются: русский Excel пишет `;`. */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  counts.forEach((n, d) => {
    if (n > (counts.get(best) ?? 0)) best = d;
  });
  return best;
}

/** RFC 4180. Значения остаются строками: дату или артикул приведением не испортить. */
export function parseDelimited(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      started = true;
    } else if (ch === delimiter) {
      started = true;
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      started = true;
      cell += ch;
    }
  }
  // Последний перевод строки новой строки таблицы не начинает.
  if (started) endRow();
  return rows;
}

/** A…Z, AA…: подписи колонок как в Excel. */
export function columnLabel(index: number): string {
  let label = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    label = String.fromCharCode(65 + (n % 26)) + label;
  }
  return label;
}

export function looksNumeric(value: string): boolean {
  return /^-?\d[\d\s.,]*%?$/.test(value.trim());
}

const HTML_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";

/**
 * Документ для `<iframe sandbox="" srcdoc>`. Скрипты и same-origin снимает sandbox, а CSP закрывает
 * то, что sandbox пропускает: файл не может сходить в сеть и этим сообщить, кто его открыл.
 *
 * Через DOMParser, а не заменой по строке: `<head>` в комментарии увёл бы CSP в комментарий, а CSP
 * работает только для того, что идёт после неё. DOMParser ничего не запускает и не грузит.
 * meta refresh вырезан: sandbox не мешает кадру уйти по нему на чужой адрес.
 */
export function sandboxedHtml(source: string): string {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('meta[http-equiv]').forEach((m) => m.remove());
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = HTML_CSP;
  doc.head.prepend(csp);
  const doctype = doc.doctype ? `<!doctype ${doc.doctype.name}>` : '';
  return doctype + doc.documentElement.outerHTML;
}
