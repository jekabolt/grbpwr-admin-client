import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { NoteFilePicker, type NoteFileInsert } from './file-picker';
import { fileCardPath } from './file-refs';

/**
 * ПОЛОСА ФОРМАТИРОВАНИЯ НАД ТЕКСТОМ.
 *
 * ── ГЛАВНОЕ: КАРЕТКА ────────────────────────────────────────────────────────────────────────
 *
 * Всё здесь работает ПО ВЫДЕЛЕНИЮ И ПО ПОЗИЦИИ КАРЕТКИ. Это не удобство, а единственный
 * работающий вариант: панель, дописывающая разметку в конец, в управляемой `textarea` читается
 * человеком как «съело текст» — он видит, что нажатие что-то сделало, но не там, где смотрел.
 *
 * Механика ровно из трёх шагов, и все три нужны:
 *
 * 1. `execCommand('insertText')` — правка идёт ЧЕРЕЗ САМО ПОЛЕ, как будто её набрали. Способ
 *    старый и объявлен устаревшим, но он единственный, который кладёт правку в НАТИВНУЮ СТОПКУ
 *    ОТМЕНЫ: замерено на стенде — после нажатия «bold» ⌘Z возвращает текст ровно на шаг
 *    назад. Через `setRangeText` ⌘Z не делает НИЧЕГО: правка скриптом в стопку не попадает и
 *    обнуляет то, что там было, — то есть человек теряет и отмену своего набора тоже.
 * 2. `setRangeText` — запасной путь: если `execCommand` отказал или сделал не то (проверяется
 *    сравнением с ожидаемой строкой, а не доверием к возвращённому `true`), поле приводится к
 *    исходному виду и правится вторым способом. Пустая вставка (снятие разметки) идёт только
 *    им: `insertText` пустой строкой в разных сборках означает разное.
 * 3. `useLayoutEffect` — позиция каретки выставляется ещё раз, ПОСЛЕ того как react применил
 *    новое значение. Это страховка от первых двух: стоит любому звену в цепочке (нормализация
 *    текста в `onChange`, чужой контролируемый враппер, ещё одна перерисовка между) переписать
 *    `value` — и каретка уезжает в конец, причём молча. Эффект сверяет `area.value` с тем, что
 *    он же и вставил, и чужую перерисовку не трогает.
 *
 * ── ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ ───────────────────────────────────────────────────────────────────
 *
 * Жирный поверх курсива не ВКЛАДЫВАЕТСЯ, а ЗАМЕНЯЕТ его. Причина в разметчике: `***текст***` он
 * не понимает вовсе (у него жирный — это `**` без звёздочек внутри), и «нажал «bold» на
 * курсиве» дало бы строку, показанную со звёздочками наружу. Кнопка обязана оставлять текст,
 * который её же разметчик покажет.
 */

/** Одна замена в поле: что, на что и где оказаться после. Координаты — в тексте ПОЛЯ. */
interface Edit {
  start: number;
  end: number;
  text: string;
  sel: [number, number];
}

type Emphasis = '**' | '*';

/**
 * Пробелы по краям выделения остаются СНАРУЖИ разметки.
 *
 * Человек выделяет мышкой и почти всегда прихватывает пробел. `* текст *` наш разметчик курсивом
 * не считает (после звёздочки обязан идти непробел) — то есть кнопка выдавала бы разметку,
 * которая ею не является, и виновата была бы «панель», а не промах на полсимвола.
 */
function trimEdges(text: string, start: number, end: number): [number, number] {
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

function emphasisEdit(text: string, start: number, end: number, want: Emphasis): Edit {
  const [s, e] = trimEdges(text, start, end);
  const found = emphasisAt(text, s, e);

  if (found) {
    const body = text.slice(found.inner[0], found.inner[1]);
    const at = found.outer[0];
    if (found.marker === want) {
      // Снять: то самое «нажал «bold» на жирном».
      return { start: at, end: found.outer[1], text: body, sel: [at, at + body.length] };
    }
    // Заменить, а не вложить — см. шапку файла.
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

/** Тот же приём для `code`, но своей осью: код с жирным не конфликтует. */
function inlineCodeEdit(text: string, start: number, end: number): Edit {
  const [s, e] = trimEdges(text, start, end);
  const inner = text.slice(s, e);
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
function lineSpan(text: string, start: number, end: number): [number, number] {
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
function replaceLines(
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

function lineMarkEdit(text: string, start: number, end: number, kind: 'ul' | 'ol' | 'quote'): Edit {
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
function headingEdit(text: string, start: number, end: number): Edit {
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

/** Многострочный код — огорода на своих строках; она же снимается повторным нажатием. */
function fenceEdit(text: string, start: number, end: number): Edit {
  const [ls, le] = lineSpan(text, start, end);
  const lines = text.slice(ls, le).split('\n');
  if (lines.length >= 2 && /^\s*```/.test(lines[0]) && /^\s*```/.test(lines[lines.length - 1])) {
    const body = lines.slice(1, -1).join('\n');
    return { start: ls, end: le, text: body, sel: [ls, ls + body.length] };
  }
  const body = lines.join('\n');
  const next = `\`\`\`\n${body}\n\`\`\``;
  return { start: ls, end: le, text: next, sel: [ls + 4, ls + 4 + body.length] };
}

const LINK_LABEL = 'text';
const LINK_HREF = 'url';

/**
 * Ссылка. Выделили текст — он становится подписью, а выделенным оказывается ПЛЕЙСХОЛДЕР адреса:
 * набранное (или вставленное ⌘V) заменяет его сразу, без второго прицеливания мышью.
 */
function linkEdit(text: string, start: number, end: number): Edit {
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
function insertsAsImage(f: LibraryFile): boolean {
  if (!(f.contentType ?? '').startsWith('image/')) return false;
  if (!f.url && f.downloadUrl) return false;
  return true;
}

/** Подпись ссылки: скобки в имени файла порвали бы саму ссылку, а экранирования у разметчика
 * нет. Разрушать нечего — имя чинится в подписи, файл остаётся собой. */
function linkLabel(raw: string): string {
  return raw.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
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
function fileEdit(
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

export function FormatBar({
  areaRef,
  value,
  onChange,
}: {
  areaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  // Какое окно открыто и, значит, чем станет выбранный файл. `null` — закрыто.
  const [picker, setPicker] = useState<NoteFileInsert | null>(null);
  const pending = useRef<{ value: string; sel: [number, number] } | null>(null);

  useLayoutEffect(() => {
    const p = pending.current;
    const area = areaRef.current;
    if (!p || !area) return;
    // ТОЛЬКО СВОЯ перерисовка. Значение разошлось — значит текст с тех пор поехал дальше
    // (набор, помощник, восстановление черновика), и ставить туда каретку было бы уже враньём.
    if (area.value !== p.value) return;
    pending.current = null;
    if (area.selectionStart !== p.sel[0] || area.selectionEnd !== p.sel[1]) {
      area.setSelectionRange(p.sel[0], p.sel[1]);
    }
    area.focus();
  }, [areaRef, value]);

  const apply = useCallback(
    (make: (text: string, start: number, end: number) => Edit) => {
      const area = areaRef.current;
      if (!area) return;
      // Текст берётся ИЗ ПОЛЯ, а не из пропа: координаты выделения — это координаты в узле, и
      // считать их по чужой копии строки значит однажды промахнуться на длину расхождения.
      const text = area.value;
      const edit = make(text, area.selectionStart ?? 0, area.selectionEnd ?? 0);

      const expected = text.slice(0, edit.start) + edit.text + text.slice(edit.end);

      area.focus();
      let done = false;
      if (edit.text !== '') {
        area.setSelectionRange(edit.start, edit.end);
        try {
          done = document.execCommand('insertText', false, edit.text);
        } catch {
          done = false;
        }
        // Возвращённому `true` веры нет: команда объявлена устаревшей, и «сделал» от «сказал,
        // что сделал» отличается только сравнением с ожидаемой строкой.
        if (done && area.value !== expected) done = false;
      }
      if (!done) {
        // Команда могла что-то успеть до того, как разошлась с ожиданием. Правка вторым
        // способом по СТАРЫМ координатам поверх уже изменённого текста была бы промахом
        // ровно того сорта, от которого весь этот файл, — поэтому сначала откат к исходному.
        if (area.value !== text) {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value',
          )?.set;
          setter?.call(area, text);
        }
        area.setRangeText(edit.text, edit.start, edit.end, 'preserve');
      }

      area.setSelectionRange(edit.sel[0], edit.sel[1]);
      pending.current = { value: area.value, sel: edit.sel };
      // Зовётся ВСЕГДА, даже когда `execCommand` уже поднял свой `input` и react состояние
      // обновил: второй вызов с тем же значением react отбрасывает сам, а без него запасной
      // путь остался бы без единственного места, где о правке узнаёт страница.
      onChange(area.value);
    },
    [areaRef, onChange],
  );

  const actions: { label: string; title: string; run: () => void }[] = [
    {
      label: 'bold',
      title: 'bold — **text**. pressing again removes it',
      run: () => apply((t, s, e) => emphasisEdit(t, s, e, '**')),
    },
    {
      label: 'italic',
      title: 'italic — *text*. pressing again removes it',
      run: () => apply((t, s, e) => emphasisEdit(t, s, e, '*')),
    },
    {
      label: 'heading',
      title: 'heading round the circle: # → ## → ### → plain text',
      run: () => apply(headingEdit),
    },
    {
      label: 'list',
      title: 'bulleted list — “- item”',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'ul')),
    },
    {
      label: 'numbering',
      title: 'numbered list — “1. item”',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'ol')),
    },
    {
      label: 'quote',
      title: 'quote — “> line”',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'quote')),
    },
    {
      label: 'code',
      title: 'code: a selection on one line — `like this`, on several — a ``` fence',
      run: () =>
        apply((t, s, e) =>
          t.slice(s, e).includes('\n') ? fenceEdit(t, s, e) : inlineCodeEdit(t, s, e),
        ),
    },
    {
      label: 'link',
      title: 'link — [label](url)',
      run: () => apply(linkEdit),
    },
  ];

  return (
    <>
      <div className='flex flex-wrap items-center gap-1 border-b border-hairline px-1.5 py-1.5'>
        {actions.map((a) => (
          <Button
            key={a.label}
            type='button'
            size='xs'
            variant='secondary'
            title={a.title}
            // ФОКУС НЕ УХОДИТ ИЗ ПОЛЯ. Без этого нажатие сначала снимает фокус с `textarea`, и в
            // части браузеров вместе с ним схлопывается видимое выделение — человек видит, как
            // подсветка пропала ПЕРЕД тем, как что-то произошло.
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            onClick={a.run}
          >
            {a.label}
          </Button>
        ))}

        <Button
          type='button'
          size='xs'
          variant='secondary'
          title='insert a link to a library file; a picture will stand shown inside the text'
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          onClick={() => setPicker('link')}
        >
          file
        </Button>

        <Button
          type='button'
          size='xs'
          variant='secondary'
          title='insert a library file as a preview: a picture as itself, a pdf and a drawing as their rendered thumbnail'
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          onClick={() => setPicker('preview')}
        >
          preview
        </Button>
      </div>

      {picker && (
        <NoteFilePicker
          insert={picker}
          onPick={(f) => apply((t, s, e) => fileEdit(t, s, e, f, picker))}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
