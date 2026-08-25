import type { LibraryFile } from 'api/proto-http/admin';
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
 * ГОЛАЯ ПАРА ``` `` ``` РЯДОМ С КАРЕТКОЙ — или `null`.
 *
 * Пустое выделение даёт пару с кареткой МЕЖДУ кавычками, и снять её умел только тот случай, когда
 * каретка там и осталась. А она законно оказывается ПОСЛЕ пары: восстановление каретки выходит
 * досрочно при любой чужой перерисовке (`format-bar.tsx`, `useLayoutEffect`), да и стрелка вправо
 * — обычное движение. Следующее нажатие оборачивало пару ещё раз, и в тексте появлялись четыре
 * кавычки, которых разметчик не показывает никогда. Отсюда три положения каретки вместо одного:
 * внутри пары, сразу после неё, сразу перед ней.
 *
 * «ГОЛАЯ» — ЭТО РОВНО ДВА БЭКТИКА: соседние символы бэктиками быть не должны. Без этой проверки
 * каретка у края ограды ``` ``` ``` отгрызала бы от неё два символа — то есть кнопка ломала бы
 * разметку, которую сама же и поставила.
 */
function barePairAt(text: string, c: number): [number, number] | null {
  const spots: [number, number][] = [
    [c - 1, c + 1], // вокруг каретки
    [c - 2, c], // сразу перед кареткой
    [c, c + 2], // сразу после каретки
  ];
  for (const [a, b] of spots) {
    if (a < 0 || b > text.length) continue;
    if (text[a] !== '`' || text[b - 1] !== '`') continue;
    if (text[a - 1] === '`' || text[b] === '`') continue;
    return [a, b];
  }
  return null;
}

/** Тот же приём для `code`, но своей осью: код с жирным не конфликтует. */
export function inlineCodeEdit(text: string, start: number, end: number): Edit {
  const [s, e] = trimEdges(text, start, end);
  const inner = text.slice(s, e);
  if (s === e) {
    // Пустое выделение: сначала попытка СНЯТЬ пару, и только потом — поставить новую.
    const pair = barePairAt(text, s);
    if (pair) return { start: pair[0], end: pair[1], text: '', sel: [pair[0], pair[0]] };
  }
  if (inner.length >= 2 && inner.startsWith('`') && inner.endsWith('`')) {
    const body = inner.slice(1, -1);
    return { start: s, end: e, text: body, sel: [s, s + body.length] };
  }
  if (s >= 1 && text[s - 1] === '`' && text[e] === '`') {
    return { start: s - 1, end: e + 1, text: inner, sel: [s - 1, s - 1 + inner.length] };
  }
  const next = `\`${inner}\``;
  return { start: s, end: e, text: next, sel: [s + 1, s + 1 + inner.length] };
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
 * Кнопка `code` целиком: одна чистая функция вместо развилки, написанной прямо в обработчике.
 *
 * Развилка стояла в `actions` (`t.slice(s,e).includes('\n') ? fenceEdit : inlineCodeEdit`) — то
 * есть в единственном месте панели, куда таблица входа-выхода не дотягивается.
 *
 * ── ПОРЯДОК ЗДЕСЬ ЗНАЧИМ ────────────────────────────────────────────────────────────────────
 *
 * 1. ТЕЛО УЖЕ ПОСТАВЛЕННОЙ ОГРАДЫ проверяется ПЕРВЫМ — до всякого ветвления по переводу строки.
 *    Однострочное тело (`code` из одной строки) до ветвления не дожило бы: в нём нет `\n`, и оно
 *    уехало бы в `inlineCodeEdit`, то есть получило бы бэктики ВНУТРИ ограды.
 * 2. ХВОСТОВЫЕ ПЕРЕВОДЫ СТРОК СРЕЗАЮТСЯ до проверки на многострочность. Тройной клик по строке —
 *    обычный способ выделить её целиком, и браузер кладёт в такое выделение хвостовой `\n`:
 *    строка считалась многострочным куском и получала ограду вместо бэктиков. Срез правит именно
 *    выделение, а не текст: за границей `end` ничего не меняется.
 */
export function codeEdit(text: string, start: number, end: number): Edit {
  const around = fenceAround(text, start, end);
  if (around) return around;
  let e = end;
  while (e > start && text[e - 1] === '\n') e -= 1;
  return text.slice(start, e).includes('\n')
    ? fenceEdit(text, start, e)
    : inlineCodeEdit(text, start, e);
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
 * ── ПОДПИСЬ ─────────────────────────────────────────────────────────────────────────────────
 *
 * У медиа в API НЕТ ИМЕНИ — только id и адреса (имя не переживает загрузку в бакет). Поэтому
 * подписью служит выделенный текст, и только когда кадр РОВНО ОДИН: у пачки «выделение» одно на
 * всех, и раздать его нескольким снимкам значило бы соврать про каждого из них.
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
    const label = linkLabel(text.slice(s, e)) || `media ${items[0].id}`;
    const next = token(items[0], label);
    const at = s + next.length;
    return { start: s, end: e, text: next, sel: [at, at] };
  }

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
