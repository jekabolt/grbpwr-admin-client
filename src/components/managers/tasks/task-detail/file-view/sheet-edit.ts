import { unzipSync, zipSync, type Unzipped } from 'fflate';
import { columnLabel, detectDelimiter, parseDelimited } from './file-view';

/**
 * ПРАВКА ЯЧЕЕК ПРЯМО В БАЙТАХ ФАЙЛА. Чистый модуль: ни React, ни DOM, ни SheetJS.
 *
 * SheetJS здесь запрещён сознательно: его запись пересобирает книгу и теряет стили, ширины и всё,
 * чего не понимает. Поэтому xlsx открывается как zip, правится ровно один лист, строкой по месту,
 * а все остальные части уходят обратно теми же байтами.
 *
 * ГЛАВНОЕ ПРАВИЛО: неверный итог хуже отсутствия кнопки. Всё, в чём модуль не уверен (незнакомая
 * функция, общая формула, цикл, чужой лист, итог файла не сходится с пересчётом), становится
 * «только просмотр», а не догадкой.
 */

export const EDITABLE_EXTENSIONS = ['xlsx', 'csv'] as const;

/** Что показать и можно ли менять. `input` — то, что лежит в поле ввода. */
export interface BookCell {
  input: string;
  locked: boolean;
  /** Текст формулы со знаком `=`. */
  formula?: string;
}

export interface BookSheet {
  name: string;
  editable: boolean;
}

/** Правки одного листа: адрес A1 → то, что набрано. */
export type SheetEdits = ReadonlyMap<string, string>;

export interface SheetBook {
  format: 'xlsx' | 'csv';
  sheets: BookSheet[];
  cell(sheet: number, addr: string): BookCell;
  /** Набранное значит то же, что лежит в файле: `7,5` для ячейки `7.5` правкой не считается. */
  sameValue(sheet: number, addr: string, text: string): boolean;
  /** Пересчитанные значения всех формул листа. Для csv всегда пусто. */
  recalc(sheet: number, edits: SheetEdits): Map<string, number>;
  /** Новые байты файла. Бросает `SheetEditError` и не отдаёт сомнительный результат. */
  apply(edits: ReadonlyMap<number, SheetEdits>): Uint8Array;
}

export class SheetEditError extends Error {}

/**
 * Файл, который можно править, или `null`: тогда он только просматривается. Отказ здесь штатный
 * (`.xls`, шифрованный файл, незнакомая кодировка), поэтому это значение, а не исключение.
 */
export function openSheetBook(fileName: string, bytes: Uint8Array): SheetBook | null {
  const name = fileName.toLowerCase();
  try {
    if (name.endsWith('.xlsx')) return openXlsx(bytes);
    if (name.endsWith('.csv')) return openCsv(bytes);
  } catch {
    return null;
  }
  return null;
}

export type CellAddress = { r: number; c: number };

/** `D12` → `{ r: 11, c: 3 }`, строка и колонка с нуля. */
export function parseAddress(addr: string): CellAddress | null {
  const m = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(addr);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

export function addressOf(r: number, c: number): string {
  return `${columnLabel(c)}${r + 1}`;
}

/* ────────────────────────────── значение ячейки ────────────────────────────── */

type Typed =
  | { kind: 'empty' }
  | { kind: 'number'; value: string }
  | { kind: 'text'; value: string };

const NUMBER = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

/**
 * Что значит набранный текст. Запятая становится точкой, ведущие нули и больше 15 значащих цифр
 * остаются текстом: артикул и штрихкод числом не испортить.
 */
export function classifyInput(text: string): Typed {
  if (text === '') return { kind: 'empty' };
  const trimmed = text.trim();
  if (NUMBER.test(trimmed)) {
    const digits = trimmed.replace(/^-/, '').replace(/[.,]/, '').replace(/^0+/, '');
    if (digits.length <= 15)
      return { kind: 'number', value: String(Number(trimmed.replace(',', '.'))) };
  }
  return { kind: 'text', value: text };
}

function numberValue(text: string): number | null {
  const t = classifyInput(text);
  return t.kind === 'number' ? Number(t.value) : null;
}

/* ────────────────────────────── XML строками ────────────────────────────── */

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g, (whole, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return NAMED[name] ?? whole;
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Символы, которых XML 1.0 не допускает вовсе, вырезаются, а `_x0041_` не должен стать `A`. */
function escapeText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/_x([0-9a-fA-F]{4})_/g, '_x005F_x$1_')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  );
}

function needsPreserve(text: string): boolean {
  return /^\s|\s$|\s\s|[\n\r\t]/.test(text);
}

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = m[2] ?? m[3] ?? '';
  }
  return out;
}

function withoutAttr(raw: string, name: string): string {
  return raw.replace(new RegExp(`\\s+${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`), '');
}

/** Текст `<t>` без фонетики `<rPh>`: её SheetJS и Excel в ячейке не показывают. */
function textOfRuns(xml: string): string {
  let out = '';
  for (const m of xml
    .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    .matchAll(/<t(?:\s[^>]*)?(?:\/>|>([^<]*)<\/t>)/g)) {
    out += decodeXml(m[1] ?? '');
  }
  return out;
}

/* ────────────────────────────── разбор листа ────────────────────────────── */

type RawCell = {
  addr: string;
  r: number;
  c: number;
  start: number;
  end: number;
  /** Сырой текст атрибутов открывающего тега. */
  attrs: string;
  openEnd: number;
  type: string;
  style: string | undefined;
  hasOther: boolean;
  /** `plain` = обычная формула; общая и формула массива движку не по силам. */
  formula?: { text: string; end: number; plain: boolean };
  valueSpan?: { start: number; end: number };
  value?: string;
  inline?: string;
};

type RawRow = {
  r: number;
  start: number;
  end: number;
  openEnd: number;
  selfClosed: boolean;
  attrs: string;
  cells: RawCell[];
};

type ScannedSheet = {
  rows: RawRow[];
  dataStart: number;
  dataEnd: number;
  /** Куда встают новые строки: перед `</sheetData>`; `-1` у `<sheetData/>`. */
  dataClose: number;
};

const TAG = /<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const CHILD_F = /<f(\s(?:[^>"']|"[^"]*"|'[^']*')*?)?(?:\/>|>([^<]*)<\/f>)/;
const CHILD_V = /<v(?:\s[^>]*)?(?:\/>|>([^<]*)<\/v>)/;
const CHILD_IS = /<is(?:\s[^>]*)?>[\s\S]*?<\/is>|<is\s*\/>/;

/** Null: разметка, которую строкой разбирать нельзя. Правки такого листа не будет. */
function scanSheet(xml: string): ScannedSheet | null {
  const open = /<sheetData(\s[^>]*?)?(\/?)>/.exec(xml);
  if (!open) return null;
  const dataStart = open.index;
  const afterOpen = dataStart + open[0].length;
  if (open[2] === '/') {
    return { rows: [], dataStart, dataEnd: afterOpen, dataClose: -1 };
  }
  const dataClose = xml.indexOf('</sheetData>', afterOpen);
  if (dataClose < 0) return null;
  const body = xml.slice(afterOpen, dataClose);
  if (body.includes('<!--') || body.includes('<![CDATA[') || body.includes('<?')) return null;

  const rows: RawRow[] = [];
  let row: RawRow | null = null;
  const tag = new RegExp(TAG.source, 'g');
  tag.lastIndex = afterOpen;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) !== null && m.index < dataClose) {
    const [whole, closing, name, rawAttrs, selfClose] = m;
    const end = m.index + whole.length;
    if (name === 'row' && !closing) {
      const r = Number(attrsOf(rawAttrs).r) - 1;
      if (!Number.isInteger(r) || r < 0) return null;
      const last = rows[rows.length - 1];
      if (last && last.r >= r) return null;
      row = {
        r,
        start: m.index,
        end,
        openEnd: end,
        selfClosed: selfClose === '/',
        attrs: rawAttrs,
        cells: [],
      };
      rows.push(row);
      if (row.selfClosed) row = null;
    } else if (name === 'row' && closing) {
      if (!row) return null;
      row.end = end;
      row = null;
    } else if (name === 'c' && !closing) {
      if (!row) return null;
      const attrs = attrsOf(rawAttrs);
      const at = parseAddress(attrs.r ?? '');
      if (!at || at.r !== row.r) return null;
      const lastCell = row.cells[row.cells.length - 1];
      if (lastCell && lastCell.c >= at.c) return null;
      const cell: RawCell = {
        addr: attrs.r,
        r: at.r,
        c: at.c,
        start: m.index,
        end,
        attrs: rawAttrs,
        openEnd: end,
        type: attrs.t ?? 'n',
        style: attrs.s,
        hasOther: false,
      };
      if (selfClose !== '/') {
        const close = xml.indexOf('</c>', end);
        if (close < 0 || close > dataClose) return null;
        cell.end = close + 4;
        readChildren(xml, cell, end, close);
        tag.lastIndex = cell.end;
      }
      row.cells.push(cell);
    } else {
      // Всё остальное внутри sheetData (префиксы `x:c`, расширения) строкой не правится.
      return null;
    }
  }
  if (row) return null;
  return { rows, dataStart, dataEnd: dataClose + '</sheetData>'.length, dataClose };
}

function readChildren(xml: string, cell: RawCell, from: number, to: number) {
  const inner = xml.slice(from, to);
  let rest = inner;
  const f = CHILD_F.exec(inner);
  if (f) {
    const attrs = attrsOf(f[1] ?? '');
    cell.formula = {
      text: f[2] === undefined ? '' : decodeXml(f[2]),
      end: from + f.index + f[0].length,
      plain: !attrs.t || attrs.t === 'normal',
    };
    rest = rest.replace(f[0], '');
  }
  const v = CHILD_V.exec(inner);
  if (v) {
    cell.value = decodeXml(v[1] ?? '');
    cell.valueSpan = { start: from + v.index, end: from + v.index + v[0].length };
    rest = rest.replace(v[0], '');
  }
  const is = CHILD_IS.exec(inner);
  if (is) {
    cell.inline = textOfRuns(is[0]);
    rest = rest.replace(is[0], '');
  }
  if (rest.trim() !== '') cell.hasOther = true;
}

/* ────────────────────────────── формулы ────────────────────────────── */

type RangeRef = { r1: number; c1: number; r2: number; c2: number };

const REF = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/;

function parseRefCell(text: string): CellAddress | null {
  const m = REF.exec(text);
  return m ? parseAddress(`${m[1]}${m[2]}`) : null;
}

/** Только `SUM` по ячейкам и диапазонам этого листа; всё остальное даёт `null`. */
export function parseSum(formula: string): RangeRef[] | null {
  const m = /^\s*SUM\(([^()]*)\)\s*$/.exec(formula);
  if (!m || !m[1].trim()) return null;
  const out: RangeRef[] = [];
  for (const raw of m[1].split(',')) {
    const parts = raw.trim().split(':');
    if (parts.length > 2) return null;
    const a = parseRefCell(parts[0]);
    const b = parts.length === 2 ? parseRefCell(parts[1]) : a;
    if (!a || !b) return null;
    out.push({
      r1: Math.min(a.r, b.r),
      c1: Math.min(a.c, b.c),
      r2: Math.max(a.r, b.r),
      c2: Math.max(a.c, b.c),
    });
  }
  return out;
}

/** 15 значащих цифр, как считает Excel: `0.1 + 0.2` не становится итогом с хвостом. */
function tidy(value: number): number {
  return Number(value.toPrecision(15));
}

/**
 * Итог `SUM`, `null` при переполнении: в файл нельзя записать `Infinity`, Excel показал бы `#NUM!`.
 * Сумма в пределах накопленной ошибки округления и есть ноль.
 */
function settledSum(total: number, magnitude: number, count: number): number | null {
  const bound = magnitude * count;
  if (!Number.isFinite(bound)) return null;
  return Math.abs(total) <= (bound * Number.EPSILON) / 2 ? 0 : tidy(total);
}

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/* ────────────────────────────── xlsx: книга ────────────────────────────── */

type XlsxSheet = {
  name: string;
  part: string;
  editable: boolean;
  xml: string;
  scan: ScannedSheet | null;
  byAddr: Map<string, RawCell>;
  formulas: Map<string, RangeRef[]>;
  locked: Set<string>;
  /** Индекс стиля столбца для новой ячейки. */
  colStyles: { min: number; max: number; style: string }[];
  dates: boolean[];
};

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ENCODER = new TextEncoder();

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Текст части, если он возвращается теми же байтами; иначе `null`. */
function partText(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null;
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) return null;
  const decl = /^<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/.exec(text);
  if (decl && decl[1].toLowerCase() !== 'utf-8') return null;
  return sameBytes(ENCODER.encode(text), bytes) ? text : null;
}

/** Больше распакованных байт не читаем: файл на 10 МБ может развернуться в гигабайты. */
const MAX_UNZIPPED = 256 * 1024 * 1024;

function unzipBook(bytes: Uint8Array): Unzipped {
  let total = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      if (total > MAX_UNZIPPED) throw new SheetEditError('too large');
      return true;
    },
  });
}

function resolveTarget(target: string, base: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

type Rel = { id: string; type: string; target: string };

function relsOf(xml: string): Rel[] {
  const out: Rel[] = [];
  for (const m of xml.matchAll(/<Relationship\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const a = attrsOf(m[1]);
    if (a.Id && a.Target && a.TargetMode !== 'External') {
      out.push({ id: a.Id, type: a.Type ?? '', target: decodeXml(a.Target) });
    }
  }
  return out;
}

function sharedStringsOf(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    out.push(textOfRuns(m[1] ?? ''));
  }
  return out;
}

const BUILTIN_DATE = (id: number) =>
  (id >= 14 && id <= 22) ||
  (id >= 27 && id <= 36) ||
  (id >= 45 && id <= 47) ||
  (id >= 50 && id <= 58);

/** Формат с датой или временем: кавычки, `[Red]`, `_x`, `*x`, `\x` не считаются, `[h]` считается. */
export function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/[\\_*]./g, '');
  if (/\[(?:h+|m+|s+)\]/i.test(bare)) return true;
  return /[ymdhs]/i.test(bare.replace(/\[[^\]]*\]/g, ''));
}

/** Для каждого индекса стиля: дата ли это. */
function dateStylesOf(xml: string | null): boolean[] {
  if (!xml) return [];
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const a = attrsOf(m[1]);
    custom.set(Number(a.numFmtId), decodeXml(a.formatCode ?? ''));
  }
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) return [];
  const out: boolean[] = [];
  for (const m of block[1].matchAll(/<xf\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const id = Number(attrsOf(m[1]).numFmtId ?? 0);
    const code = custom.get(id);
    out.push(code !== undefined ? isDateFormat(code) : BUILTIN_DATE(id));
  }
  return out;
}

function openXlsx(bytes: Uint8Array): SheetBook | null {
  const parts = unzipBook(bytes);
  const workbook = partText(parts['xl/workbook.xml']);
  const wbRels = partText(parts['xl/_rels/workbook.xml.rels']);
  if (!workbook || !wbRels) return null;
  const rels = relsOf(wbRels);
  const relOfType = (suffix: string) => rels.find((r) => r.type.endsWith(suffix));
  const partOf = (rel: Rel | undefined) =>
    rel ? parts[resolveTarget(rel.target, 'xl/workbook.xml')] : undefined;

  const sharedRel = relOfType('/sharedStrings');
  const shared = sharedRel ? sharedStringsOf(partText(partOf(sharedRel))) : [];
  const dates = dateStylesOf(partText(partOf(relOfType('/styles'))));
  const hasNames = /<definedName\b(?![^>]*name\s*=\s*["']_xlnm\.)/.test(workbook);

  const sheets: XlsxSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const a = attrsOf(m[1]);
    const rid = Object.entries(a).find(([key]) => /(^|:)id$/.test(key) && key !== 'sheetId')?.[1];
    const rel = rels.find((r) => r.id === rid);
    const part = rel ? resolveTarget(rel.target, 'xl/workbook.xml') : '';
    sheets.push(readSheet(decodeXml(a.name ?? ''), part, rel, parts, shared, dates));
  }
  if (sheets.length === 0) return null;

  // Лист, ссылающийся на другой лист, устарел бы от чужой правки: пересчитать его здесь нечем.
  // Имя из книги может вести на чужой лист, не показывая `!` в самой формуле.
  const anyFormula = (test: (formula: NonNullable<RawCell['formula']>) => boolean) =>
    sheets.some((s) => [...s.byAddr.values()].some((c) => c.formula && test(c.formula)));
  const crossSheet = anyFormula((f) => f.text.includes('!'));
  const namedRisk = hasNames && anyFormula((f) => !f.plain || !parseSum(f.text));
  if (crossSheet || namedRisk) sheets.forEach((s) => (s.editable = false));

  return xlsxBook(sheets, parts);
}

function readSheet(
  name: string,
  part: string,
  rel: Rel | undefined,
  parts: Unzipped,
  shared: string[],
  dates: boolean[],
): XlsxSheet {
  const sheet: XlsxSheet = {
    name,
    part,
    editable: false,
    xml: '',
    scan: null,
    byAddr: new Map(),
    formulas: new Map(),
    locked: new Set(),
    colStyles: [],
    dates,
  };
  if (!rel || !rel.type.endsWith('/worksheet')) return sheet;
  const xml = partText(parts[part]);
  if (!xml) return sheet;
  sheet.xml = xml;
  const scan = scanSheet(xml);
  if (!scan) return sheet;
  sheet.scan = scan;

  let ok = !/<tableParts\b/.test(xml) && !/<sheetProtection\b/.test(xml);
  for (const row of scan.rows) {
    for (const cell of row.cells) {
      sheet.byAddr.set(cell.addr, cell);
      if (cell.type === 's' && cell.value !== undefined) {
        cell.inline = shared[Number(cell.value)] ?? '';
      }
      if (cell.formula) {
        sheet.locked.add(cell.addr);
        const refs = cell.formula.plain ? parseSum(cell.formula.text) : null;
        if (refs) sheet.formulas.set(cell.addr, refs);
        else ok = false;
      }
      if (cell.type === 'b' || cell.type === 'e' || cell.type === 'd' || cell.hasOther) {
        sheet.locked.add(cell.addr);
      }
      if (cell.style !== undefined && dates[Number(cell.style)]) sheet.locked.add(cell.addr);
      // Поле ввода однострочное: перевод строки в нём пропал бы молча.
      if (cell.inline !== undefined && /[\r\n]/.test(cell.inline)) sheet.locked.add(cell.addr);
    }
  }
  for (const m of xml.matchAll(/<mergeCell\b[^>]*\bref\s*=\s*["']([A-Z]+\d+):([A-Z]+\d+)["']/g)) {
    const a = parseAddress(m[1]);
    const b = parseAddress(m[2]);
    if (!a || !b) continue;
    for (let r = a.r; r <= b.r; r++) {
      for (let c = a.c; c <= b.c; c++) {
        if (r !== a.r || c !== a.c) sheet.locked.add(addressOf(r, c));
      }
    }
  }
  for (const m of xml.matchAll(/<col\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const a = attrsOf(m[1]);
    if (a.style !== undefined) {
      sheet.colStyles.push({ min: Number(a.min) - 1, max: Number(a.max) - 1, style: a.style });
    }
  }
  sheet.editable = ok && formulasAgree(sheet);
  return sheet;
}

/* ────────────────────────────── xlsx: пересчёт ────────────────────────────── */

/** Значение обычной ячейки для `SUM`: текст и пустота не считаются; ошибка даёт `null`. */
function plainNumber(cell: RawCell): number | null | 'bad' {
  if (cell.type === 'e' || cell.type === 'd') return 'bad';
  if (cell.type !== 'n') return null;
  if (cell.value === undefined || cell.value === '') return null;
  const n = Number(cell.value);
  return Number.isFinite(n) ? n : 'bad';
}

function firstRowAt(rows: RawRow[], r: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].r < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function computeAll(sheet: XlsxSheet, edits: SheetEdits): Map<string, number> | null {
  const scan = sheet.scan;
  if (!scan) return null;
  const done = new Map<string, number>();
  const visiting = new Set<string>();

  const valueOf = (addr: string): number | null | 'bad' => {
    if (sheet.formulas.has(addr)) return evaluate(addr);
    const edit = edits.get(addr);
    if (edit !== undefined) return numberValue(edit);
    const cell = sheet.byAddr.get(addr);
    return cell ? plainNumber(cell) : null;
  };

  const evaluate = (addr: string): number | 'bad' => {
    const known = done.get(addr);
    if (known !== undefined) return known;
    if (visiting.has(addr)) return 'bad';
    visiting.add(addr);
    let total = 0;
    let magnitude = 0;
    let count = 0;
    const add = (v: number) => {
      total += v;
      magnitude += Math.abs(v);
      count += 1;
    };
    for (const range of sheet.formulas.get(addr) ?? []) {
      // По существующим ячейкам, а не по адресам: `A:XFD` на миллион строк не повод зависнуть.
      for (let i = firstRowAt(scan.rows, range.r1); i < scan.rows.length; i++) {
        const row = scan.rows[i];
        if (row.r > range.r2) break;
        for (const cell of row.cells) {
          if (cell.c < range.c1 || cell.c > range.c2) continue;
          const v = valueOf(cell.addr);
          if (v === 'bad') return 'bad';
          if (v !== null) add(v);
        }
      }
      // Правка ячейки, которой в файле ещё нет.
      for (const [editAddr, text] of edits) {
        if (sheet.byAddr.has(editAddr)) continue;
        const at = parseAddress(editAddr);
        if (!at || at.r < range.r1 || at.r > range.r2 || at.c < range.c1 || at.c > range.c2)
          continue;
        const v = numberValue(text);
        if (v !== null) add(v);
      }
    }
    visiting.delete(addr);
    const value = settledSum(total, magnitude, count);
    if (value === null) return 'bad';
    done.set(addr, value);
    return value;
  };

  for (const addr of sheet.formulas.keys()) {
    if (evaluate(addr) === 'bad') return null;
  }
  return done;
}

/** Если значения файла не сходятся с нашим счётом, движок чего-то не понимает: правки нет. */
function formulasAgree(sheet: XlsxSheet): boolean {
  const values = computeAll(sheet, new Map());
  if (!values) return false;
  for (const [addr, value] of values) {
    const cached = sheet.byAddr.get(addr)?.value;
    const type = sheet.byAddr.get(addr)?.type;
    if (type === 'e' || type === 'b') return false;
    if (cached === undefined || cached === '') continue;
    const n = Number(cached);
    if (!Number.isFinite(n) || !closeEnough(n, value)) return false;
  }
  return true;
}

/* ────────────────────────────── xlsx: запись ────────────────────────────── */

type Splice = { start: number; end: number; text: string };

function cellMarkup(attrs: string, typed: Typed): string {
  const bare = withoutAttr(attrs, 't');
  if (typed.kind === 'empty') return `<c${bare}/>`;
  if (typed.kind === 'number') return `<c${bare}><v>${typed.value}</v></c>`;
  const space = needsPreserve(typed.value) ? ' xml:space="preserve"' : '';
  return `<c${bare} t="inlineStr"><is><t${space}>${escapeText(typed.value)}</t></is></c>`;
}

function newCellStyle(sheet: XlsxSheet, row: RawRow | undefined, c: number): string | undefined {
  if (row) {
    const a = attrsOf(row.attrs);
    if (a.s !== undefined && a.customFormat !== undefined && a.customFormat !== '0') return a.s;
  }
  return sheet.colStyles.find((col) => c >= col.min && c <= col.max)?.style;
}

/** Новая ячейка с датой от столбца или строки: число в ней Excel прочитал бы датой. */
function isLocked(sheet: XlsxSheet, addr: string): boolean {
  if (sheet.locked.has(addr)) return true;
  if (sheet.byAddr.has(addr) || !sheet.scan) return false;
  const at = parseAddress(addr);
  if (!at) return false;
  const row = sheet.scan.rows[firstRowAt(sheet.scan.rows, at.r)];
  const style = newCellStyle(sheet, row?.r === at.r ? row : undefined, at.c);
  return style !== undefined && !!sheet.dates[Number(style)];
}

function newCellAttrs(sheet: XlsxSheet, row: RawRow | undefined, at: CellAddress): string {
  const style = newCellStyle(sheet, row, at.c);
  return ` r="${addressOf(at.r, at.c)}"${style !== undefined ? ` s="${style}"` : ''}`;
}

function extendSpans(attrs: string, c: number): string {
  return attrs.replace(/\bspans\s*=\s*"(\d+):(\d+)"/, (whole, a, b) => {
    const lo = Math.min(Number(a), c + 1);
    const hi = Math.max(Number(b), c + 1);
    return lo === Number(a) && hi === Number(b) ? whole : `spans="${lo}:${hi}"`;
  });
}

function applySplices(xml: string, splices: Splice[]): string {
  const ordered = splices
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.start - b.start || a.i - b.i);
  let out = '';
  let at = 0;
  for (const s of ordered) {
    out += xml.slice(at, s.start) + s.text;
    at = s.end;
  }
  return out + xml.slice(at);
}

/** Правка значения формулы. `<f>` не трогается; `t="str"` снимается, только если он устарел. */
function formulaSplices(cell: RawCell, value: number, out: Splice[]) {
  const cached = cell.value === undefined || cell.value === '' ? null : Number(cell.value);
  if (cached !== null && cached === value && cell.type === 'n') return;
  if (cell.valueSpan) {
    out.push({ ...cell.valueSpan, text: `<v>${value}</v>` });
  } else if (cell.formula) {
    out.push({ start: cell.formula.end, end: cell.formula.end, text: `<v>${value}</v>` });
  }
  if (cell.type !== 'n') {
    const bare = withoutAttr(cell.attrs, 't');
    out.push({ start: cell.start, end: cell.openEnd, text: `<c${bare}>` });
  }
}

function dimensionSplice(xml: string, edited: CellAddress[]): Splice | null {
  const m = /(<dimension\b[^>]*\bref\s*=\s*")([^"]*)(")/.exec(xml);
  if (!m || edited.length === 0) return null;
  const [a, b = a] = m[2].split(':');
  const from = parseAddress(a.replace(/\$/g, ''));
  const to = parseAddress(b.replace(/\$/g, ''));
  if (!from || !to) return null;
  let { r: r1, c: c1 } = from;
  let { r: r2, c: c2 } = to;
  for (const e of edited) {
    r1 = Math.min(r1, e.r);
    c1 = Math.min(c1, e.c);
    r2 = Math.max(r2, e.r);
    c2 = Math.max(c2, e.c);
  }
  const ref = `${addressOf(r1, c1)}:${addressOf(r2, c2)}`;
  if (ref === m[2] || (m[2] === addressOf(r1, c1) && r1 === r2 && c1 === c2)) return null;
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length, text: ref };
}

function sheetAfter(sheet: XlsxSheet, edits: SheetEdits): string {
  const scan = sheet.scan;
  if (!scan || !sheet.editable) throw new SheetEditError('not editable');
  const values = computeAll(sheet, edits);
  if (!values) throw new SheetEditError('not computed');

  const splices: Splice[] = [];
  const rowsByR = new Map(scan.rows.map((row) => [row.r, row]));
  const newInRow = new Map<number, { at: CellAddress; typed: Typed }[]>();
  const grown: CellAddress[] = [];

  const ordered = [...edits.entries()]
    .map(([addr, text]) => {
      const at = parseAddress(addr);
      if (!at) throw new SheetEditError('bad address');
      if (isLocked(sheet, addr)) throw new SheetEditError('locked cell');
      return { addr, at, typed: classifyInput(text) };
    })
    .sort((a, b) => a.at.r - b.at.r || a.at.c - b.at.c);

  for (const { addr, at, typed } of ordered) {
    const cell = sheet.byAddr.get(addr);
    if (cell) {
      splices.push({ start: cell.start, end: cell.end, text: cellMarkup(cell.attrs, typed) });
      continue;
    }
    if (typed.kind === 'empty') continue;
    const list = newInRow.get(at.r) ?? [];
    list.push({ at, typed });
    newInRow.set(at.r, list);
    grown.push(at);
  }

  const missingRows: { r: number; text: string }[] = [];
  for (const [r, list] of newInRow) {
    const row = rowsByR.get(r);
    if (!row) {
      const cells = list
        .map((n) => cellMarkup(newCellAttrs(sheet, undefined, n.at), n.typed))
        .join('');
      missingRows.push({ r, text: `<row r="${r + 1}">${cells}</row>` });
      continue;
    }
    const maxC = list[list.length - 1].at.c;
    const minC = list[0].at.c;
    const attrs = extendSpans(extendSpans(row.attrs, minC), maxC);
    if (row.selfClosed) {
      const bare = attrs.replace(/\s*$/, '');
      const cells = list.map((n) => cellMarkup(newCellAttrs(sheet, row, n.at), n.typed)).join('');
      splices.push({ start: row.start, end: row.end, text: `<row${bare}>${cells}</row>` });
      continue;
    }
    if (attrs !== row.attrs) {
      splices.push({ start: row.start, end: row.openEnd, text: `<row${attrs}>` });
    }
    for (const n of list) {
      const next = row.cells.find((c) => c.c > n.at.c);
      const position = next ? next.start : row.end - '</row>'.length;
      const text = cellMarkup(newCellAttrs(sheet, row, n.at), n.typed);
      splices.push({ start: position, end: position, text });
    }
  }

  missingRows.sort((a, b) => a.r - b.r);
  if (scan.dataClose < 0) {
    const text = `<sheetData>${missingRows.map((m) => m.text).join('')}</sheetData>`;
    if (missingRows.length) splices.push({ start: scan.dataStart, end: scan.dataEnd, text });
  } else {
    for (const m of missingRows) {
      const next = scan.rows.find((row) => row.r > m.r);
      const position = next ? next.start : scan.dataClose;
      splices.push({ start: position, end: position, text: m.text });
    }
  }

  for (const [addr, value] of values) {
    const cell = sheet.byAddr.get(addr);
    if (cell) formulaSplices(cell, value, splices);
  }

  const dimension = dimensionSplice(sheet.xml, grown);
  if (dimension) splices.push(dimension);
  return applySplices(sheet.xml, splices);
}

/** Запись читается обратно тем же разбором: то, что не сходится, не уходит на сервер. */
function verifySheet(sheet: XlsxSheet, edits: SheetEdits, next: string) {
  const scan = scanSheet(next);
  if (!scan) throw new SheetEditError('not verified');
  const byAddr = new Map<string, RawCell>();
  for (const row of scan.rows) for (const cell of row.cells) byAddr.set(cell.addr, cell);

  const values = computeAll(sheet, edits);
  if (!values) throw new SheetEditError('not verified');
  for (const [addr, value] of values) {
    const cell = byAddr.get(addr);
    if (!cell || cell.formula?.text !== sheet.byAddr.get(addr)?.formula?.text) {
      throw new SheetEditError('not verified');
    }
    if (Number(cell.value) !== value) throw new SheetEditError('not verified');
  }
  for (const [addr, text] of edits) {
    const typed = classifyInput(text);
    const cell = byAddr.get(addr);
    if (typed.kind === 'empty') {
      if (cell && (cell.value !== undefined || cell.inline !== undefined)) {
        throw new SheetEditError('not verified');
      }
    } else if (typed.kind === 'number') {
      if (cell?.value !== typed.value) throw new SheetEditError('not verified');
    } else if (cell?.inline !== sanitized(typed.value)) {
      throw new SheetEditError('not verified');
    }
  }
}

function sanitized(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}

function xlsxBook(sheets: XlsxSheet[], parts: Unzipped): SheetBook {
  const cellOf = (sheet: XlsxSheet, addr: string): BookCell => {
    const raw = sheet.byAddr.get(addr);
    const locked = !sheet.editable || isLocked(sheet, addr);
    if (!raw) return { input: '', locked };
    if (raw.formula) {
      return {
        input: raw.value ?? '',
        locked: true,
        formula: raw.formula.text ? `=${raw.formula.text}` : undefined,
      };
    }
    if (raw.inline !== undefined) return { input: raw.inline, locked };
    return { input: raw.value ?? '', locked };
  };

  return {
    format: 'xlsx',
    sheets: sheets.map((s) => ({ name: s.name, editable: s.editable })),
    cell: (index, addr) => {
      const sheet = sheets[index];
      return sheet ? cellOf(sheet, addr) : { input: '', locked: true };
    },
    sameValue: (index, addr, text) => {
      const sheet = sheets[index];
      if (!sheet) return true;
      const before = cellOf(sheet, addr).input;
      if (before === text) return true;
      const raw = sheet.byAddr.get(addr);
      if (raw?.inline !== undefined) return false;
      const a = classifyInput(before);
      const b = classifyInput(text);
      return a.kind === 'number' && b.kind === 'number' && a.value === b.value;
    },
    recalc: (index, edits) => {
      const sheet = sheets[index];
      return (sheet && computeAll(sheet, edits)) ?? new Map();
    },
    apply: (edits) => {
      const output: Unzipped = {};
      const next = new Map<string, Uint8Array>();
      for (const [index, sheetEdits] of edits) {
        const sheet = sheets[index];
        if (!sheet) throw new SheetEditError('no sheet');
        const xml = sheetAfter(sheet, sheetEdits);
        verifySheet(sheet, sheetEdits, xml);
        next.set(sheet.part, ENCODER.encode(xml));
      }
      // Порядок частей сохраняется: `[Content_Types].xml` остаётся там, где был.
      for (const name of Object.keys(parts)) output[name] = next.get(name) ?? parts[name];
      return zipSync(output);
    },
  };
}

/* ────────────────────────────── csv ────────────────────────────── */

type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1251';

let cp1251: Map<number, number> | null = null;

function cp1251Table(): Map<number, number> {
  if (cp1251) return cp1251;
  const table = new Map<number, number>();
  const bytes = new Uint8Array(256).map((_, i) => i);
  const text = new TextDecoder('windows-1251').decode(bytes);
  Array.from(text).forEach((ch, byte) => table.set(ch.codePointAt(0) ?? 0, byte));
  cp1251 = table;
  return table;
}

function encodeCsv(text: string, encoding: CsvEncoding): Uint8Array {
  if (encoding === 'utf-8') return ENCODER.encode(text);
  if (encoding === 'windows-1251') {
    const table = cp1251Table();
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const byte = table.get(text.charCodeAt(i));
      if (byte === undefined) throw new SheetEditError('character not in file encoding');
      out[i] = byte;
    }
    return out;
  }
  const out = new Uint8Array(text.length * 2);
  const little = encoding === 'utf-16le';
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    out[i * 2] = little ? unit & 255 : unit >> 8;
    out[i * 2 + 1] = little ? unit >> 8 : unit & 255;
  }
  return out;
}

type CsvField = { start: number; end: number; quoted: boolean; text: string };
type CsvRow = { fields: CsvField[]; end: number };

/** Тот же автомат, что `parseDelimited`, но с местом каждого поля в тексте. */
function scanCsv(text: string, delimiter: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let fields: CsvField[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  let started = false;
  let fieldStart = 0;

  const endCell = (end: number) => {
    fields.push({ start: fieldStart, end, quoted: wasQuoted, text: cell });
    cell = '';
    wasQuoted = false;
  };
  const endRow = (end: number) => {
    endCell(end);
    rows.push({ fields, end });
    fields = [];
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
      wasQuoted = true;
      started = true;
    } else if (ch === delimiter) {
      started = true;
      endCell(i);
      fieldStart = i + 1;
    } else if (ch === '\n' || ch === '\r') {
      const end = i;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow(end);
      fieldStart = i + 1;
    } else {
      started = true;
      cell += ch;
    }
  }
  if (started) endRow(text.length);
  return rows;
}

function sameRows(a: CsvRow[], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, r) => row.fields.length === b[r].length && row.fields.every((f, c) => f.text === b[r][c]),
  );
}

function csvField(text: string, delimiter: string, quoted: boolean): string {
  const need = quoted || text.includes(delimiter) || /["\r\n]/.test(text);
  return need ? `"${text.replace(/"/g, '""')}"` : text;
}

function detectCsvEncoding(bytes: Uint8Array): { encoding: CsvEncoding; bom: number } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', bom: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', bom: 2 };
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    UTF8.decode(bytes);
    return { encoding: 'utf-8', bom };
  } catch {
    return { encoding: 'windows-1251', bom: 0 };
  }
}

function openCsv(bytes: Uint8Array): SheetBook | null {
  if (bytes.length === 0) return null;
  const { encoding, bom } = detectCsvEncoding(bytes);
  const prefix = bytes.subarray(0, bom);
  const body = bytes.subarray(bom);
  const text = new TextDecoder(encoding, { ignoreBOM: true }).decode(body);
  if (text.includes('\u0000')) return null;
  // Байты должны вернуться точно: иначе правка одной ячейки переписала бы весь файл.
  if (!sameBytes(encodeCsv(text, encoding), body)) return null;

  const delimiter = detectDelimiter(text);
  const rows = scanCsv(text, delimiter);
  if (!sameRows(rows, parseDelimited(text))) return null;

  const fieldAt = (addr: string): { at: CellAddress; field?: CsvField; row?: CsvRow } | null => {
    const at = parseAddress(addr);
    if (!at) return null;
    const row = rows[at.r];
    return { at, row, field: row?.fields[at.c] };
  };

  return {
    format: 'csv',
    sheets: [{ name: '', editable: true }],
    cell: (_, addr) => {
      const found = fieldAt(addr);
      if (!found) return { input: '', locked: true };
      const input = found.field?.text ?? '';
      return { input, locked: !found.row || /[\r\n]/.test(input) };
    },
    sameValue: (_, addr, value) => (fieldAt(addr)?.field?.text ?? '') === value,
    recalc: () => new Map(),
    apply: (edits) => {
      const sheetEdits = edits.get(0);
      if (!sheetEdits) throw new SheetEditError('no edits');
      const splices: Splice[] = [];
      const padded = new Map<number, Map<number, string>>();
      for (const [addr, value] of sheetEdits) {
        const found = fieldAt(addr);
        if (!found?.row) throw new SheetEditError('bad address');
        if (found.field) {
          const piece = csvField(value, delimiter, found.field.quoted);
          splices.push({ start: found.field.start, end: found.field.end, text: piece });
        } else if (value !== '') {
          const list = padded.get(found.at.r) ?? new Map<number, string>();
          list.set(found.at.c, value);
          padded.set(found.at.r, list);
        }
      }
      for (const [r, cells] of padded) {
        const row = rows[r];
        const last = Math.max(...cells.keys());
        let tail = '';
        for (let c = row.fields.length; c <= last; c++) {
          tail += delimiter + csvField(cells.get(c) ?? '', delimiter, false);
        }
        splices.push({ start: row.end, end: row.end, text: tail });
      }
      const next = encodeCsv(applySplices(text, splices), encoding);
      const out = new Uint8Array(prefix.length + next.length);
      out.set(prefix);
      out.set(next, prefix.length);
      return out;
    },
  };
}
