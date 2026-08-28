import type { LibraryFile } from 'api/proto-http/admin';
import {
  emptyTable,
  isTableRow,
  parseTable,
  serializeTable,
  type TableModel,
} from 'ui/markdown/table';
import type { NoteFileInsert } from './file-picker';
import { fileCardPath } from './file-refs';

/**
 * ЧИСТЫЕ ПРАВКИ ТЕКСТА — ОТДЕЛЬНО ОТ КНОПОК, КОТОРЫЕ ИХ ЗОВУТ.
 *
 * Всё, что здесь лежит, — это `(text, start, end) => Edit`: ни одного обращения к DOM, ни одного
 * состояния, ни одной ссылки на react. Причина выноса ровно одна: это единственная часть панели,
 * которую можно ПРОВЕРИТЬ ТАБЛИЦЕЙ ВХОДА-ВЫХОДА, и держать её внутри компонента значило проверять
 * её только глазами в браузере — то есть не проверять.
 *
 * Правила самой разметки (почему жирный ЗАМЕНЯЕТ курсив, почему пробелы остаются снаружи, почему у
 * решётки обязателен пробел) описаны у соответствующих функций и в шапке `format-bar.tsx`.
 */

/** Одна замена в поле: что, на что и где оказаться после. Координаты — в тексте ПОЛЯ. */
export interface Edit {
  start: number;
  end: number;
  text: string;
  sel: [number, number];
}

export type Emphasis = '**' | '*';

/**
 * Пробелы по краям выделения остаются СНАРУЖИ разметки.
 *
 * Человек выделяет мышкой и почти всегда прихватывает пробел. `* текст *` наш разметчик курсивом
 * не считает (после звёздочки обязан идти непробел) — то есть кнопка выдавала бы разметку,
 * которая ею не является, и виновата была бы «панель», а не промах на полсимвола.
 */
export function trimEdges(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  return [s, e];
}

/**
 * Уже размеченный кусок вокруг выделения — или `null`.
 *
 * Две формы одного и того же: выделено вместе со звёздочками (`**жирно**`) и выделено внутри них
 * (`жирно`). Обе обязаны сниматься повторным нажатием, иначе кнопка умеет только наматывать.
 *
 * `**` проверяется ПЕРВЫМ: у `**жирно**` края подходят и под одиночную звёздочку, и порядок
 * здесь — единственное, что не даёт «курсиву» отгрызть по звёздочке от жирного.
 */
function emphasisAt(
  text: string,
  s: number,
  e: number,
): { marker: Emphasis; outer: [number, number]; inner: [number, number] } | null {
  for (const marker of ['**', '*'] as Emphasis[]) {
    const m = marker.length;
    const inner = text.slice(s, e);
    if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
      return { marker, outer: [s, e], inner: [s + m, e - m] };
    }
    if (s >= m && text.slice(s - m, s) === marker && text.slice(e, e + m) === marker) {
      return { marker, outer: [s - m, e + m], inner: [s, e] };
    }
  }
  return null;
}

export function emphasisEdit(text: string, start: number, end: number, want: Emphasis): Edit {
  const [s, e] = trimEdges(text, start, end);
  const found = emphasisAt(text, s, e);

  if (found) {
    const body = text.slice(found.inner[0], found.inner[1]);
    const at = found.outer[0];
    if (found.marker === want) {
      // Снять: то самое «нажал «bold» на жирном».
      return { start: at, end: found.outer[1], text: body, sel: [at, at + body.length] };
    }
    // Заменить, а не вложить — см. шапку `format-bar.tsx`.
    const next = `${want}${body}${want}`;
    return {
      start: at,
      end: found.outer[1],
      text: next,
      sel: [at + want.length, at + want.length + body.length],
    };
  }

  const body = text.slice(s, e);
  const next = `${want}${body}${want}`;
  // Пустое выделение — каретка встаёт МЕЖДУ звёздочками: дальше человек просто печатает.
  return { start: s, end: e, text: next, sel: [s + want.length, s + want.length + body.length] };
}

/**
 * Строки, которых касается выделение, целиком.
 *
 * Выделение, кончающееся ровно на переводе строки, следующую строку НЕ захватывает: иначе
 * протяжка мышью до начала следующего абзаца превращала бы в список и его.
 */
export function lineSpan(text: string, start: number, end: number): [number, number] {
  // `lastIndexOf('\n', -1)` в js ищет от НУЛЯ, а не «нигде»: у текста, начинающегося с пустой
  // строки, каретка в самом начале уезжала бы на вторую строку, и разметку получала бы она.
  const ls = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const e = end > start && text[end - 1] === '\n' ? end - 1 : end;
  let le = text.indexOf('\n', e);
  if (le === -1) le = text.length;
  return [ls, le];
}

/**
 * Построчная правка с сохранением места каретки.
 *
 * Пустое выделение (одна каретка) остаётся В СВОЕЙ СТРОКЕ и на своём месте относительно текста:
 * добавили «- » — каретка сдвинулась на два, а не уехала в конец абзаца. Непустое — выделяет
 * получившийся кусок целиком, чтобы было видно, что именно изменилось.
 */
export function replaceLines(
  text: string,
  start: number,
  end: number,
  mapLines: (lines: string[]) => string[],
): Edit {
  const [ls, le] = lineSpan(text, start, end);
  const lines = text.slice(ls, le).split('\n');
  const out = mapLines(lines);
  const next = out.join('\n');

  if (start !== end) return { start: ls, end: le, text: next, sel: [ls, ls + next.length] };

  let li = 0;
  let acc = ls;
  while (li < lines.length - 1 && acc + lines[li].length < start) {
    acc += lines[li].length + 1;
    li += 1;
  }
  const col = start - acc;
  let lineStart = ls;
  for (let k = 0; k < li; k += 1) lineStart += out[k].length + 1;
  const shifted = col + (out[li].length - lines[li].length);
  const caret = lineStart + Math.max(0, Math.min(out[li].length, shifted));
  return { start: ls, end: le, text: next, sel: [caret, caret] };
}

/**
 * Разметка НАЧАЛА строки — одна на строку: список, нумерация, цитата и заголовок сменяют друг
 * друга, а не наслаиваются («- 1. > текст» не значит ничего).
 *
 * У решётки требуется пробел (`\s+`, а не `\s*`) ровно затем, чтобы `#хештег` остался словом:
 * заголовком его не считает и разметчик, и съедать у него решётку при постановке пункта списка
 * было бы правкой текста, о которой никто не просил.
 */
const LINE_MARK = /^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s?|#{1,6}\s+)/;

const LIST_RE = {
  ul: /^\s*[-*+]\s+/,
  ol: /^\s*\d+[.)]\s+/,
  quote: /^\s*>\s?/,
} as const;

export function lineMarkEdit(
  text: string,
  start: number,
  end: number,
  kind: 'ul' | 'ol' | 'quote',
): Edit {
  return replaceLines(text, start, end, (lines) => {
    const meaningful = lines.filter((l) => l.trim());
    // Снимаем только если размечено ВСЁ выделенное: наполовину размеченный кусок кнопка
    // дописывает до конца, а не раздевает — это ближе к тому, зачем её нажали.
    const on = meaningful.length > 0 && meaningful.every((l) => LIST_RE[kind].test(l));
    // Пустая строка — это НАЧАЛО списка: человек встал на пустое место и нажал кнопку, чтобы
    // писать пункты. А вот пустая строка ВНУТРИ выделенного куска пунктом не становится: там
    // она разделитель, и «- » в ней было бы пустым пунктом, которого никто не просил.
    const blankOnly = meaningful.length === 0;
    let n = 0;
    return lines.map((l) => {
      if (on) return l.replace(LIST_RE[kind], '');
      if (!l.trim() && !blankOnly) return l;
      const bare = l.replace(LINE_MARK, '');
      n += 1;
      if (kind === 'ul') return `- ${bare}`;
      if (kind === 'ol') return `${n}. ${bare}`;
      return `> ${bare}`;
    });
  });
}

/**
 * Заголовок ходит по кругу: обычный → `#` → `##` → `###` → обычный.
 *
 * Одна кнопка вместо трёх, потому что уровней ровно три (больше разметчик не понимает) и в
 * заметке они выбираются на глаз, а не по номеру. Уровень читается по ПЕРВОЙ строке выделения и
 * применяется ко всем: разнобой внутри одного нажатия был бы непредсказуем.
 */
export function headingEdit(text: string, start: number, end: number): Edit {
  return replaceLines(text, start, end, (lines) => {
    const first = /^\s*(#{1,3})\s/.exec(lines[0]);
    const level = first ? first[1].length : 0;
    const next = level >= 3 ? 0 : level + 1;
    // Та же оговорка, что у списков: пустая строка получает решётку, если она и есть всё
    // выделение (человек начинает заголовок), и не получает — если она разделитель внутри.
    const blankOnly = lines.every((l) => !l.trim());
    return lines.map((l) => {
      if (!l.trim() && !blankOnly) return l;
      const bare = l.replace(LINE_MARK, '');
      return next === 0 ? bare : `${'#'.repeat(next)} ${bare}`;
    });
  });
}

const FENCE_LINE = /^\s*```/;

/**
 * ВЫДЕЛЕНО ТЕЛО ОГРАДЫ, А НЕ ОНА САМА — снять ограду вокруг, или `null`.
 *
 * После `fenceEdit` выделенным остаётся ТОЛЬКО ТЕЛО (`sel: [ls + 4, …]`), а ограда — снаружи
 * выделения. Повторное нажатие поэтому не находило ничего, что можно развернуть, и заворачивало
 * тело во ВТОРУЮ ограду: `код` превращался в ограду в ограде. Здесь тот же разворот, но по
 * СОСЕДЯМ span'а: строка над ним и строка под ним.
 *
 * ЧЁТНОСТЬ — ЕДИНСТВЕННОЕ, ЧТО ОТЛИЧАЕТ ТЕЛО ОТ ЗАЗОРА. У строки, стоящей МЕЖДУ двумя соседними
 * блоками кода, сверху и снизу тоже по ограде — и «разворот» склеил бы два разных блока в один,
 * молча. Строк-оград строго выше span'а нечётное число ровно тогда, когда последняя из них
 * ОТКРЫТА, то есть span действительно внутри неё.
 */
function fenceAround(text: string, start: number, end: number): Edit | null {
  const [ls, le] = lineSpan(text, start, end);
  if (ls === 0 || le >= text.length) return null;
  const aboveLines = text.slice(0, ls - 1).split('\n');
  const openLine = aboveLines[aboveLines.length - 1];
  const closeLine = text.slice(le + 1).split('\n')[0];
  if (!FENCE_LINE.test(openLine) || !FENCE_LINE.test(closeLine)) return null;
  if (aboveLines.filter((l) => FENCE_LINE.test(l)).length % 2 === 0) return null;

  const at = ls - 1 - openLine.length;
  const body = text.slice(ls, le);
  return {
    start: at,
    end: le + 1 + closeLine.length,
    text: body,
    sel: [at, at + body.length],
  };
}

/** Многострочный код — огорода на своих строках; она же снимается повторным нажатием. */
export function fenceEdit(text: string, start: number, end: number): Edit {
  const [ls, le] = lineSpan(text, start, end);
  const lines = text.slice(ls, le).split('\n');
  if (lines.length >= 2 && FENCE_LINE.test(lines[0]) && FENCE_LINE.test(lines[lines.length - 1])) {
    const body = lines.slice(1, -1).join('\n');
    return { start: ls, end: le, text: body, sel: [ls, ls + body.length] };
  }
  // Выделено тело уже поставленной ограды — разворот, а не вторая ограда поверх первой.
  const around = fenceAround(text, start, end);
  if (around) return around;
  const body = lines.join('\n');
  const next = `\`\`\`\n${body}\n\`\`\``;
  return { start: ls, end: le, text: next, sel: [ls + 4, ls + 4 + body.length] };
}

/**
 * Кнопка `code` целиком: ВСЕГДА ОГРАДА, инлайновых бэктиков она больше не ставит.
 *
 * Претензия владельца дословно: «кнопка CODE добавляет одинарные кавычки, но код хайлайтится
 * тройными». Разбирается она не как ошибка в развилке, а как отказ от самой развилки: у кнопки
 * один смысл — «это код блоком», — и он не должен зависеть от того, попал ли перевод строки в
 * выделение. Инлайновые бэктики остаются языку, а не панели: их набирают руками, и разметчик
 * их по-прежнему показывает.
 *
 * ── ЧЕТЫРЕ СЛУЧАЯ, И ПОРЯДОК МЕЖДУ НИМИ ЗНАЧИМ ──────────────────────────────────────────────
 *
 * 1. ТЕЛО УЖЕ ПОСТАВЛЕННОЙ ОГРАДЫ — разворот, и он проверяется ПЕРВЫМ. Иначе повторное нажатие
 *    заворачивало бы тело во ВТОРУЮ ограду: ограда в ограде.
 * 2. ХВОСТОВЫЕ ПЕРЕВОДЫ СТРОК СРЕЗАЮТСЯ. Тройной клик по строке — обычный способ выделить её
 *    целиком, и браузер кладёт в такое выделение хвостовой `\n`; без среза внутри ограды
 *    оставалась бы лишняя пустая строка.
 * 3. ПУСТОЕ ВЫДЕЛЕНИЕ — СТРОКА ЦЕЛИКОМ, а не разрез по каретке. Каретка стоит посреди слова
 *    чаще, чем на его краю, и разрез дал бы `wo` + ограда + `rd`, то есть порчу слова там, где
 *    просили «сделай эту строку кодом». Пустая строка даёт пустую ограду с кареткой внутри.
 * 4. НЕПУСТОЕ ВЫДЕЛЕНИЕ ОГОРАЖИВАЕТСЯ КАК ЕСТЬ, разрезая строку, если взято посередине:
 *    выделили `foo` в `bar foo baz` — получаете `bar`, ограду с `foo` и `baz`. Ограда обязана
 *    начинаться со своей строки (иначе разметчик её не увидит), поэтому переводы дописываются
 *    ровно с тех сторон, где строка продолжается.
 */
export function codeEdit(text: string, start: number, end: number): Edit {
  const around = fenceAround(text, start, end);
  if (around) return around;
  let e = end;
  while (e > start && text[e - 1] === '\n') e -= 1;
  // Выделение, уже совпадающее с целыми строками, идёт общей дорогой: там же живёт разворот
  // ограды, выделенной вместе с её строками (`fenceEdit`).
  const atLineStart = start === 0 || text[start - 1] === '\n';
  const atLineEnd = e === text.length || text[e] === '\n';
  if (start === e || (atLineStart && atLineEnd)) return fenceEdit(text, start, e);
  return fenceSelection(text, start, e);
}

/**
 * ОГРАДА ВОКРУГ КУСКА СТРОКИ — с разрезом самой строки.
 *
 * ПРОБЕЛЫ ПО КРАЯМ ВЫДЕЛЕНИЯ СЪЕДАЮТСЯ. Мышью выделяют «примерно», и без этого `bar ` осталось
 * бы с хвостовым пробелом, а ` baz` — с ведущим: в разметке этого не видно, а в тексте заметки
 * остаётся мусор, который потом кто-то вычищает руками.
 */
function fenceSelection(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s -= 1;
  while (e < text.length && (text[e] === ' ' || text[e] === '\t')) e += 1;
  const body = text.slice(start, end);
  const lead = s > 0 && text[s - 1] !== '\n' ? '\n' : '';
  const tail = e < text.length && text[e] !== '\n' ? '\n' : '';
  const next = `${lead}\`\`\`\n${body}\n\`\`\`${tail}`;
  const at = s + lead.length + 4;
  return { start: s, end: e, text: next, sel: [at, at + body.length] };
}

/* ── ТАБЛИЦА ─────────────────────────────────────────────────────────────────────────────────
 *
 * Просьба владельца: «нужен режим создания таблицы в эдите маркдауна». Режим, а не одна кнопка:
 * каркас поставить мало — таблицу потом наращивают строкой и столбцом, и делать это в тексте,
 * считая вертикальные черты глазами, невозможно.
 *
 * ВСЁ ЗДЕСЬ — ЧИСТЫЕ ПРАВКИ ТЕКСТА, как и остальное в этом файле: панель узнаёт, где стоит
 * каретка, а решение «что станет с текстом» принимается тут и проверяется таблицей
 * входа-выхода. Синтаксис — общий с разметчиком (`ui/markdown/table.ts`), второй грамматики нет.
 */

/** Что делает кнопка режима таблицы. Выравнивание — часть того же набора: оно живёт в
 * разделителе, то есть тоже правка текста, а не состояние экрана. */
export type TableOp = 'row+' | 'row-' | 'col+' | 'col-' | 'left' | 'center' | 'right';

/**
 * ТАБЛИЦА, В КОТОРОЙ СТОИТ КАРЕТКА, и её место в этой таблице.
 *
 * `row` — индекс В МОДЕЛИ: 0 это шапка, дальше строки тела. Каретка в строке-разделителе
 * считается стоящей в ШАПКЕ: разделитель — не строка данных, а место, где записано
 * выравнивание, и «столбец под кареткой» у него ровно тот же.
 */
export type TableSpot = {
  /** Границы блока таблицы в тексте. */
  start: number;
  end: number;
  model: TableModel;
  row: number;
  col: number;
};

/** Начало и конец строки с позицией `pos`. */
function lineAt(text: string, pos: number): [number, number] {
  const ls = pos === 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;
  let le = text.indexOf('\n', pos);
  if (le === -1) le = text.length;
  return [ls, le];
}

/**
 * Столбец под кареткой — по числу НЕЭКРАНИРОВАННЫХ черт слева от неё.
 *
 * Считается по строке, а не по разобранной модели: модель уже потеряла, где именно в строке
 * стояла каретка, а без этого «добавить столбец справа» некуда прицелить.
 */
function cellIndexAt(line: string, offset: number): number {
  let col = 0;
  for (let i = 0; i < offset && i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      i += 1;
      continue;
    }
    if (line[i] === '|') col += 1;
  }
  // Ведущая черта — не граница столбца, а край таблицы: без этой поправки каретка в первой
  // ячейке считалась бы стоящей во второй.
  return line.trimStart().startsWith('|') ? Math.max(0, col - 1) : col;
}

export function tableAt(text: string, pos: number): TableSpot | null {
  const lines = text.split('\n');
  // Номер строки и смещение её начала — одним проходом: второй раз резать текст незачем.
  let li = 0;
  let acc = 0;
  while (li < lines.length && acc + lines[li].length < pos) {
    acc += lines[li].length + 1;
    li += 1;
  }
  if (li >= lines.length) return null;
  const isRun = (k: number) => k >= 0 && k < lines.length && !!lines[k].trim() && isTableRow(lines[k]);
  if (!isRun(li)) return null;
  let from = li;
  while (isRun(from - 1)) from -= 1;
  let to = li;
  while (isRun(to + 1)) to += 1;
  const body = lines.slice(from, to + 1);
  const model = parseTable(body);
  if (!model) return null;

  let start = 0;
  for (let k = 0; k < from; k += 1) start += lines[k].length + 1;
  let end = start;
  for (let k = from; k <= to; k += 1) end += lines[k].length + (k < to ? 1 : 0);

  const within = li - from;
  // Разделитель (строка 1) считается шапкой — см. тип.
  const row = within <= 1 ? 0 : within - 1;
  const [ls] = lineAt(text, pos);
  const col = Math.min(model.header.length - 1, cellIndexAt(lines[li], pos - ls));
  return { start, end, model, row, col };
}

/**
 * Модель обратно в текст с кареткой в заданной ячейке.
 *
 * `select` ВЫДЕЛЯЕТ СОДЕРЖИМОЕ ячейки, а не ставит каретку перед ним. Нужен ровно там, где ячейка
 * приходит с заготовкой (`header` у нового столбца): набранное обязано заменять её сразу, иначе
 * человек получает «headerназвание» и правит это руками — то же самое прицеливание мышью, от
 * которого избавляет вся эта панель.
 */
function tableEditAt(
  spot: TableSpot,
  model: TableModel,
  row: number,
  col: number,
  select = false,
): Edit {
  const { lines, offsets } = serializeTable(model);
  const r = Math.max(0, Math.min(model.rows.length, row));
  const c = Math.max(0, Math.min(model.header.length - 1, col));
  // Строка модели → строка текста: шапка это 0, разделитель занимает 1, тело идёт с 2.
  const at = r === 0 ? 0 : r + 1;
  let off = spot.start;
  for (let k = 0; k < at; k += 1) off += lines[k].length + 1;
  const caret = off + (offsets[at]?.[c] ?? 0);
  const body = (r === 0 ? model.header[c] : model.rows[r - 1]?.[c]) ?? '';
  return {
    start: spot.start,
    end: spot.end,
    text: lines.join('\n'),
    sel: select ? [caret, caret + body.length] : [caret, caret],
  };
}

/**
 * ОДНА ОПЕРАЦИЯ РЕЖИМА ТАБЛИЦЫ. `null` — операция здесь невыразима, и панель обязана сказать это
 * словами, а не сделать вид, что нажатия не было.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: удаления ШАПКИ и последнего столбца. Таблица без шапки не таблица (разделитель
 * определяет её саму), а «удалить последний столбец» — это удалить таблицу; и то и другое делается
 * выделением и Delete, то есть обратимо ⌘Z, а кнопкой — нет.
 */
export function tableOpEdit(text: string, pos: number, op: TableOp): Edit | null {
  const spot = tableAt(text, pos);
  if (!spot) return null;
  const m = spot.model;
  const width = m.header.length;
  const next: TableModel = {
    header: [...m.header],
    align: [...m.align],
    rows: m.rows.map((r) => [...r]),
  };

  switch (op) {
    case 'col+': {
      const at = spot.col + 1;
      next.header.splice(at, 0, 'header');
      next.align.splice(at, 0, next.align[spot.col] ?? 'left');
      next.rows.forEach((r) => r.splice(at, 0, ''));
      // Каретка уезжает В ШАПКУ нового столбца и выделяет заготовку: первое, что делают со
      // столбцом, — называют его, а из тела название не набрать.
      return tableEditAt(spot, next, 0, at, true);
    }
    case 'col-': {
      if (width <= 1) return null;
      next.header.splice(spot.col, 1);
      next.align.splice(spot.col, 1);
      next.rows.forEach((r) => r.splice(spot.col, 1));
      return tableEditAt(spot, next, spot.row, Math.min(spot.col, next.header.length - 1));
    }
    case 'row+': {
      // Из шапки строка добавляется ПЕРВОЙ строкой тела, из тела — под текущей.
      const at = spot.row === 0 ? 0 : spot.row;
      next.rows.splice(at, 0, Array.from({ length: width }, () => ''));
      return tableEditAt(spot, next, at + 1, spot.col);
    }
    case 'row-': {
      if (spot.row === 0 || !next.rows.length) return null;
      next.rows.splice(spot.row - 1, 1);
      return tableEditAt(spot, next, Math.min(spot.row - 1, next.rows.length), spot.col);
    }
    default: {
      if (next.align[spot.col] === op) return null;
      next.align[spot.col] = op;
      return tableEditAt(spot, next, spot.row, spot.col);
    }
  }
}

/**
 * КАРКАС ТАБЛИЦЫ В КАРЕТКУ.
 *
 * Отбивается пустой строкой от текста ТОЙ ЖЕ функцией, что и галерея снимков (`leadPad`/
 * `tailPad`): таблица, приклеенная к абзацу сверху, у разметчика в таблицу не превращается —
 * её первая строка уедет в тот абзац.
 *
 * Каретка встаёт в ПЕРВУЮ ЯЧЕЙКУ ШАПКИ и выделяет слово `header`: первое, что делают с новой
 * таблицей, — называют столбцы, и набранное заменяет заготовку без второго прицеливания мышью.
 */
export function tableInsertEdit(
  text: string,
  start: number,
  end: number,
  rows: number,
  cols: number,
): Edit {
  const [s, e] = trimEdges(text, start, end);
  const { lines, offsets } = serializeTable(emptyTable(rows, cols));
  const lead = leadPad(text.slice(0, s));
  const body = lines.join('\n');
  const at = s + lead.length + (offsets[0]?.[0] ?? 0);
  return {
    start: s,
    end: e,
    text: `${lead}${body}${tailPad(text.slice(e))}`,
    sel: [at, at + 'header'.length],
  };
}

const LINK_LABEL = 'text';
const LINK_HREF = 'url';

/**
 * Ссылка. Выделили текст — он становится подписью, а выделенным оказывается ПЛЕЙСХОЛДЕР адреса:
 * набранное (или вставленное ⌘V) заменяет его сразу, без второго прицеливания мышью.
 */
export function linkEdit(text: string, start: number, end: number): Edit {
  const [s, e] = trimEdges(text, start, end);
  const label = text.slice(s, e) || LINK_LABEL;
  const next = `[${label}](${LINK_HREF})`;
  const hrefAt = s + label.length + 3;
  return {
    start: s,
    end: e,
    text: next,
    // Без выделения прицеливаться не во что — тогда выделяется подпись.
    sel: s === e ? [s + 1, s + 1 + label.length] : [hrefAt, hrefAt + LINK_HREF.length],
  };
}

/**
 * Показывать ли выбранный файл прямо в тексте.
 *
 * Тип решает сервер, а не список расширений в клиенте: пустой `url` при заполненном
 * `download_url` — это его ответ «в месте это не показывают» (svg и html исполнились бы на
 * origin бакета). Оба пустых — это выдача, которая ссылок не несёт вовсе, и делать из неё вывод
 * про файл нельзя: тогда решает только тип содержимого.
 */
export function insertsAsImage(f: LibraryFile): boolean {
  if (!(f.contentType ?? '').startsWith('image/')) return false;
  if (!f.url && f.downloadUrl) return false;
  return true;
}

/** Подпись ссылки: скобки в имени файла порвали бы саму ссылку, а экранирования у разметчика
 * нет. Разрушать нечего — имя чинится в подписи, файл остаётся собой. */
export function linkLabel(raw: string): string {
  return raw.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Кадр из медиатеки, готовый к вставке. Прото-типы сюда не тянутся: маппинг живёт у кнопки. */
export type MediaInsert = { id: number; url: string };

/**
 * Адрес медиа внутри токена разметки.
 *
 * У разметчика нет экранирования, а в url'е токена `![…](адрес)` ЗАПРЕЩЕНЫ закрывающая скобка и
 * пробел (`markdown-view.tsx`, `INLINE`: `[^)\s]*`). Адрес из бакета их обычно не содержит — но
 * «обычно» здесь мало: один снимок с пробелом в имени порвал бы токен, и картинка показалась бы
 * куском текста со скобками наружу. Открывающая скобка кодируется заодно: пара `%28`/`%29`
 * читается человеком как пара, а `(1%29` — как опечатка.
 */
function mediaHref(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
}

/**
 * ОТБИВКА ДО ПУСТОЙ СТРОКИ, А НЕ ДО ПЕРЕВОДА СТРОКИ.
 *
 * Абзац у разметчика — это ПРОБЕГ СМЕЖНЫХ НЕПУСТЫХ СТРОК (`markdown-view.tsx`), а галереей
 * становится только абзац, в котором нет ни одного слова. Один `\n` кладёт снимки на свою
 * строку, но НЕ отделяет их от текста выше: строки остаются смежными, абзац получается со
 * словами — и снимки выкладываются столбцом внутри текста вместо ряда. Разница видна только в
 * отрисовке, поэтому таблица строк её и не ловила.
 *
 * Считается по строкам, а не по символам: «перед кареткой уже есть перевод» ничего не значит,
 * если строка над ней непустая.
 */
function leadPad(before: string): string {
  if (!before) return '';
  const nl = before.lastIndexOf('\n');
  // Строка, в которой стоит каретка. Непустая — значит снимки обязаны уйти через пустую строку.
  if (before.slice(nl + 1).trim()) return '\n\n';
  if (nl < 0) return '';
  const rest = before.slice(0, nl);
  return rest.slice(rest.lastIndexOf('\n') + 1).trim() ? '\n' : '';
}

function tailPad(after: string): string {
  if (!after) return '';
  const nl = after.indexOf('\n');
  if ((nl < 0 ? after : after.slice(0, nl)).trim()) return '\n\n';
  if (nl < 0) return '';
  const rest = after.slice(nl + 1);
  const nl2 = rest.indexOf('\n');
  return (nl2 < 0 ? rest : rest.slice(0, nl2)).trim() ? '\n' : '';
}

/**
 * КАДРЫ ИЗ МЕДИАТЕКИ — СНИМКОМ, А НЕ СИНЕЙ СТРОЧКОЙ.
 *
 * ── ПОЧЕМУ ПРЯМАЯ ССЫЛКА, А НЕ АДРЕС КАРТОЧКИ ───────────────────────────────────────────────
 *
 * У файлов библиотеки в текст пишется `/files/{id}` — потому что их `url` подписан и живёт часы
 * (см. `file-refs.tsx`). У МЕДИА всё наоборот: `fullSize.mediaUrl` — постоянный публичный адрес
 * на CDN, тот же самый, которым медиатеку рисует и админка, и сторфронт. Второй вид ссылки,
 * разрешаемой при отрисовке, стоил бы ещё одного провайдера и запроса на документ, а взамен не
 * дал бы ничего: карточки-страницы у медиа нет, вести плашке некуда, а заметка, выгруженная
 * `.md`, теряла бы картинки.
 *
 * Цена названа прямо: удалят кадр из библиотеки — в заметке останется битая ссылка. Ссылка-по-id
 * ломалась бы от того же удаления так же, только дороже, а `NoteImage` при отказе загрузки
 * показывает ссылку, а не битый значок.
 *
 * ── ПОДПИСЬ, И ЧТО ПРОИСХОДИТ С ВЫДЕЛЕНИЕМ ──────────────────────────────────────────────────
 *
 * У медиа в API НЕТ ИМЕНИ — только id и адреса (имя не переживает загрузку в бакет). Поэтому
 * подписью служит выделенный текст, и только когда кадр РОВНО ОДИН: у пачки «выделение» одно на
 * всех, и раздать его нескольким снимкам значило бы соврать про каждого из них.
 *
 * ОТСЮДА РАЗНИЦА, КОТОРУЮ НАДО НАЗВАТЬ ВСЛУХ: выделенный текст в обоих случаях ЗАМЕЩАЕТСЯ
 * вставкой (это обычная семантика вставки поверх выделения, и ⌘Z её отменяет), но у ОДНОГО кадра
 * он при этом ПЕРЕЕЗЖАЕТ В ПОДПИСЬ, а у пачки — просто исчезает: подписи ему там не досталось бы
 * всё равно. То есть «выделил слово, вставил два кадра» стирает слово, а «выделил слово, вставил
 * один» превращает его в подпись. Разница молчаливая, поэтому она проверяется таблицей (M2 и M8)
 * и написана здесь: молчаливое различие в поведении — то, за что ловят потом.
 *
 * ── НЕСКОЛЬКО КАДРОВ — ОТДЕЛЬНЫЙ АБЗАЦ ──────────────────────────────────────────────────────
 *
 * Абзац, в котором нет ничего, кроме снимков, разметчик рисует ГАЛЕРЕЕЙ — рядом, а не столбцом
 * (`markdown-view.tsx`, `galleryLines`). Отсюда отбивка ДО ПУСТОЙ СТРОКИ по краям (`leadPad` /
 * `tailPad`): одного перевода мало — смежные непустые строки остаются ОДНИМ абзацем, и снимки
 * легли бы столбцом внутри текста.
 */
export function mediaEdit(text: string, start: number, end: number, items: MediaInsert[]): Edit {
  const [s, e] = trimEdges(text, start, end);
  // Пустой список — не правка. Возвращать что-то «на всякий случай» значило бы тронуть текст
  // в ответ на жест, которого не было.
  if (!items.length) return { start: s, end: s, text: '', sel: [s, s] };

  const token = (m: MediaInsert, label: string) => `![${label}](${mediaHref(m.url)})`;

  if (items.length === 1) {
    // ОДИН КАДР: выделение уходит в подпись (см. шапку). У пачки ниже оно просто замещается.
    const label = linkLabel(text.slice(s, e)) || `media ${items[0].id}`;
    const next = token(items[0], label);
    const at = s + next.length;
    return { start: s, end: e, text: next, sel: [at, at] };
  }

  // ПАЧКА: выделенный текст ЗАМЕЩАЕТСЯ галереей и в подпись не переезжает — одна подпись на
  // несколько снимков была бы неправдой про каждый из них, а у медиа своего имени нет.
  const body = items.map((m) => token(m, `media ${m.id}`)).join('\n');
  const next = `${leadPad(text.slice(0, s))}${body}${tailPad(text.slice(e))}`;
  const at = s + next.length;
  return { start: s, end: e, text: next, sel: [at, at] };
}

/**
 * ДВЕ КНОПКИ, ПОТОМУ ЧТО ЭТО ДВА РАЗНЫХ НАМЕРЕНИЯ.
 *
 * `file` вставляет ССЫЛКУ (картинке при этом ставит `!` сам — иначе снимок в заметке пришлось бы
 * объявлять руками, а он там нужен в девяти случаях из десяти). `preview` вставляет ПРЕВЬЮ чему
 * угодно: у pdf, эскиза, чертежа есть отрисованная миниатюра, и до сих пор добраться до неё из
 * текста было нечем — договор ложился синей строчкой, неотличимой от соседних сорока.
 *
 * Разница видна ДО клика: у кнопок разные подписи и разные окна, а не одно окно с галкой. Файл,
 * которому показать нечего, помечен в самом пикере («no preview») — тогда `!` даёт плашку со
 * ссылкой, и это честный исход, а не поломка.
 */
export function fileEdit(
  text: string,
  start: number,
  end: number,
  f: LibraryFile,
  insert: NoteFileInsert,
): Edit {
  const [s, e] = trimEdges(text, start, end);
  const selected = linkLabel(text.slice(s, e));
  const id = Number(f.id);
  const label = selected || linkLabel(f.fileName ?? '') || `file ${id}`;
  const asPicture = insert === 'preview' || insertsAsImage(f);
  // Файл без номера — это выдача, из которой ссылку собрать не из чего. `/files/NaN` выглядел
  // бы ссылкой и вёл бы в никуда, поэтому в текст уезжает одно имя.
  const next =
    Number.isSafeInteger(id) && id > 0
      ? `${asPicture ? '!' : ''}[${label}](${fileCardPath(id)})`
      : label;
  const at = s + next.length;
  return { start: s, end: e, text: next, sel: [at, at] };
}
