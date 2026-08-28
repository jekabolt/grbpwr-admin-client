// ТАБЛИЦА ЗАМЕТКИ: ОДИН РАЗБОР СИНТАКСИСА НА ДВА ПОТРЕБИТЕЛЯ.
//
// Таблицу читает разметчик (`ui/markdown/doc.tsx`) и правит панель заметки
// (`managers/files/note/format-edits.ts`). Это два
// разных вопроса к одному тексту — «как её показать» и «как в неё добавить столбец», — и написать
// на них два разбора значит завести две грамматики, которые разойдутся первой же правкой: кнопка
// поставит то, чего показ не понимает, и наоборот. Поэтому синтаксис живёт здесь, а оба
// потребителя импортируют его.
//
// ЧТО СЧИТАЕТСЯ ТАБЛИЦЕЙ. Ровно то же, что в GFM, и ни капли больше:
//
//     | шапка | вторая |
//     | ---   | :---:  |
//     | ячейка| ячейка |
//
// Опознаётся она НЕ по вертикальным чертам в строке, а по СТРОКЕ-РАЗДЕЛИТЕЛЮ под первой строкой.
// Черта — обычный знак препинания («12|15 см»), и абзац с ней таблицей становиться не должен;
// разделитель же не пишут случайно никогда.
//
// ВЕДУЩАЯ И ХВОСТОВАЯ ЧЕРТЫ НЕОБЯЗАТЕЛЬНЫ ПРИ ЧТЕНИИ и обязательны при записи: таблицы приносят
// готовыми из чужих редакторов, и половина из них пишет без крайних черт — не понять такую значит
// показать её абзацем с палками. Своя запись при этом остаётся одной формы, чтобы правки кнопкой
// не превращали документ в смесь двух стилей.
//
// `\|` ВНУТРИ ЯЧЕЙКИ — ЭТО ЧЕРТА, А НЕ ГРАНИЦА. Без экранирования ячейка с «12|15» рвала бы
// таблицу на лишний столбец, причём молча и только в показе.

export type TableAlign = 'left' | 'center' | 'right';

/**
 * Разобранная таблица. `header` и каждая строка `rows` ВСЕГДА одной длины с `align` — выравнивание
 * по ширине шапки делает разбор, чтобы ни один потребитель не проверял это у себя.
 */
export type TableModel = {
  header: string[];
  align: TableAlign[];
  rows: string[][];
};

/** Ячейки строки. Крайние черты снимаются, экранированные — остаются знаком внутри ячейки. */
export function splitCells(line: string): string[] {
  const raw = line.trim();
  // Разрез по чертам, перед которыми нет обратной косой. Заодно это единственное место, где
  // экранирование снимается: дальше по коду ячейка — уже текст, а не разметка.
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && raw[i + 1] === '|') {
      cur += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  // Крайние пустышки от ведущей и хвостовой черты — не столбцы. Снимаются ТОЛЬКО они: пустая
  // ячейка в середине законна и означает пустую ячейку.
  if (parts.length && raw.startsWith('|')) parts.shift();
  if (parts.length && /(^|[^\\])\|$/.test(raw)) parts.pop();
  return parts.map((p) => p.trim());
}

/** Черта внутри ячейки при записи. Обратная сторона `splitCells`. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/** Строка-разделитель шапки: `---`, `:---`, `---:`, `:---:` в каждой ячейке, и ячейка не одна на пустоте. */
export function isTableRule(line: string): boolean {
  if (!line.includes('-')) return false;
  const cells = splitCells(line);
  if (!cells.length) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

/** Строка, которая может быть строкой таблицы: в ней есть неэкранированная черта. */
export function isTableRow(line: string): boolean {
  return /(^|[^\\])\|/.test(line);
}

/** Выравнивание столбца из его ячейки разделителя. */
function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  // GFM: без двоеточий — по левому краю. Не «по умолчанию системы»: у таблицы заметки колонки
  // почти всегда словесные, и правый край, принятый в DataTable для цифр, читался бы как ошибка.
  return 'left';
}

/** Обратно — ячейка разделителя по выравниванию, шириной не меньше трёх знаков. */
function ruleCell(align: TableAlign, width: number): string {
  const inner = '-'.repeat(Math.max(3, width));
  if (align === 'center') return `:${inner.slice(2)}:`;
  if (align === 'right') return `${inner.slice(1)}:`;
  return inner;
}

/**
 * Разобрать блок строк в таблицу — или `null`, если это не она.
 *
 * ВТОРАЯ СТРОКА ОБЯЗАНА БЫТЬ РАЗДЕЛИТЕЛЕМ. Это и есть весь признак таблицы (см. шапку файла).
 *
 * ШИРИНА ТАБЛИЦЫ — ШИРИНА ШАПКИ. Строка длиннее обрезается, короче — дополняется пустыми
 * ячейками: в GFM так же, а потребителю с рваными строками работать нечем — «третий столбец»
 * должен значить одно и то же в каждой строке.
 */
export function parseTable(lines: string[]): TableModel | null {
  if (lines.length < 2) return null;
  if (!isTableRow(lines[0]) || !isTableRule(lines[1])) return null;
  const header = splitCells(lines[0]);
  const ruleCells = splitCells(lines[1]);
  if (!header.length || !ruleCells.length) return null;
  const width = header.length;
  const align: TableAlign[] = [];
  for (let i = 0; i < width; i += 1) align.push(alignOf(ruleCells[i] ?? '---'));
  const rows = lines.slice(2).map((l) => {
    const cells = splitCells(l);
    return Array.from({ length: width }, (_, i) => cells[i] ?? '');
  });
  return { header, align, rows };
}

/**
 * Таблица обратно в строки — ОДНОЙ формы, с выровненными по ширине столбцами.
 *
 * ШИРИНА СТОЛБЦОВ ВЫРАВНИВАЕТСЯ НЕ РАДИ КРАСОТЫ. Таблицу правят В ТЕКСТЕ, глядя на левую колонку
 * редактора, и рваная разметка там нечитаема: без выравнивания «третья ячейка второй строки» —
 * это то, что приходится считать глазами по чертам.
 *
 * Возвращаются и СМЕЩЕНИЯ ячеек: панели нужно поставить каретку в ту ячейку, которую человек
 * только что создал, а вычислять их вторым проходом снаружи значило бы повторить здешнюю
 * арифметику пробелов.
 */
export function serializeTable(t: TableModel): { lines: string[]; offsets: number[][] } {
  const width = t.header.length;
  const cellText = (c: string) => escapeCell(c);
  const widths = Array.from({ length: width }, (_, i) => {
    let w = cellText(t.header[i] ?? '').length;
    for (const r of t.rows) w = Math.max(w, cellText(r[i] ?? '').length);
    // Три знака — минимум разделителя; уже него столбец не бывает.
    return Math.max(3, w);
  });

  const line = (cells: string[]): { text: string; offsets: number[] } => {
    let text = '|';
    const offsets: number[] = [];
    for (let i = 0; i < width; i += 1) {
      const body = cellText(cells[i] ?? '');
      text += ' ';
      offsets.push(text.length);
      text += body.padEnd(widths[i]);
      text += ' |';
    }
    return { text, offsets };
  };

  const out: string[] = [];
  const offsets: number[][] = [];
  const head = line(t.header);
  out.push(head.text);
  offsets.push(head.offsets);
  // Разделитель ячеек своих не имеет: каретке в нём делать нечего, и смещения для него — те же,
  // что у шапки, только чтобы массивы шли строка в строку.
  out.push(`|${t.align.map((a, i) => ` ${ruleCell(a, widths[i])} `).join('|')}|`);
  offsets.push(head.offsets);
  for (const r of t.rows) {
    const l = line(r);
    out.push(l.text);
    offsets.push(l.offsets);
  }
  return { lines: out, offsets };
}

/** Пустая таблица заданного размера: шапка + `rows` строк тела. */
export function emptyTable(rows: number, cols: number): TableModel {
  const width = Math.max(1, Math.min(12, Math.trunc(cols) || 1));
  const height = Math.max(0, Math.min(50, Math.trunc(rows) || 0));
  return {
    header: Array.from({ length: width }, (_, i) => (i === 0 ? 'header' : 'header')),
    align: Array.from({ length: width }, () => 'left' as TableAlign),
    rows: Array.from({ length: height }, () => Array.from({ length: width }, () => '')),
  };
}
