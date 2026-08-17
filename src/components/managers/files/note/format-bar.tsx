import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { NoteFilePicker } from './file-picker';
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
 * Механика ровно из двух шагов, и оба нужны:
 *
 * 1. `setRangeText` — правка идёт ЧЕРЕЗ САМО ПОЛЕ, а не через пересборку строки. Он двигает
 *    выделение сам, и, что важнее, после него `area.value` уже равен тому, что мы отдадим в
 *    `onChange`: react на перерисовке видит совпадение и НЕ трогает `value` узла, поэтому и
 *    сбрасывать каретку ему нечем.
 * 2. `useLayoutEffect` — та же позиция выставляется ещё раз, ПОСЛЕ того как react применил
 *    новое значение. Это страховка от первого шага: стоит любому звену в цепочке (нормализация
 *    текста в `onChange`, чужой контролируемый враппер, ещё одна перерисовка между) переписать
 *    `value` — и каретка уезжает в конец, причём молча. Эффект сверяет `area.value` с тем, что
 *    он же и вставил, и правит позицию только если это его перерисовка.
 *
 * Цена, названная вслух: `setRangeText` — правка скриптом, и НАТИВНАЯ ОТМЕНА (⌘Z) на неё не
 * распространяется; браузер откатит последнее, что человек набрал руками, а нажатие кнопки
 * панели в стопке отмены не окажется. Замерено в chromium на стенде (`caret-probe`).
 *
 * ── ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ ───────────────────────────────────────────────────────────────────
 *
 * Жирный поверх курсива не ВКЛАДЫВАЕТСЯ, а ЗАМЕНЯЕТ его. Причина в разметчике: `***текст***` он
 * не понимает вовсе (у него жирный — это `**` без звёздочек внутри), и «нажал жирный на
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
      // Снять: то самое «нажал жирный на жирном».
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
  const ls = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
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

/** Разметка НАЧАЛА строки — одна на строку: список, нумерация, цитата и заголовок сменяют друг
 * друга, а не наслаиваются («- 1. > текст» не значит ничего). */
const LINE_MARK = /^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s?|#{1,6}\s*)/;

const LIST_RE = {
  ul: /^\s*[-*+]\s+/,
  ol: /^\s*\d+[.)]\s+/,
  quote: /^\s*>\s?/,
} as const;

function lineMarkEdit(
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
    let n = 0;
    return lines.map((l) => {
      if (on) return l.replace(LIST_RE[kind], '');
      // Пустая строка внутри выделения пунктом не становится: «- » в пустой строке — это
      // пустой пункт, которого никто не просил.
      if (!l.trim()) return l;
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
    return lines.map((l) => {
      if (!l.trim()) return l;
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

const LINK_LABEL = 'текст';
const LINK_HREF = 'адрес';

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

function fileEdit(text: string, start: number, end: number, f: LibraryFile): Edit {
  const [s, e] = trimEdges(text, start, end);
  const selected = linkLabel(text.slice(s, e));
  const label = selected || linkLabel(f.fileName ?? '') || `файл ${f.id}`;
  const next = `${insertsAsImage(f) ? '!' : ''}[${label}](${fileCardPath(Number(f.id))})`;
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
  const [pickerOpen, setPickerOpen] = useState(false);
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

      area.focus();
      area.setRangeText(edit.text, edit.start, edit.end, 'preserve');
      area.setSelectionRange(edit.sel[0], edit.sel[1]);
      pending.current = { value: area.value, sel: edit.sel };
      onChange(area.value);
    },
    [areaRef, onChange],
  );

  const actions: { label: string; title: string; run: () => void }[] = [
    {
      label: 'жирный',
      title: 'жирный — **текст**. повторное нажатие снимает',
      run: () => apply((t, s, e) => emphasisEdit(t, s, e, '**')),
    },
    {
      label: 'курсив',
      title: 'курсив — *текст*. повторное нажатие снимает',
      run: () => apply((t, s, e) => emphasisEdit(t, s, e, '*')),
    },
    {
      label: 'заголовок',
      title: 'заголовок по кругу: # → ## → ### → обычный текст',
      run: () => apply(headingEdit),
    },
    {
      label: 'список',
      title: 'маркированный список — «- пункт»',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'ul')),
    },
    {
      label: 'нумерация',
      title: 'нумерованный список — «1. пункт»',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'ol')),
    },
    {
      label: 'цитата',
      title: 'цитата — «> строка»',
      run: () => apply((t, s, e) => lineMarkEdit(t, s, e, 'quote')),
    },
    {
      label: 'код',
      title: 'код: выделение в одну строку — `так`, в несколько — огорода ```',
      run: () =>
        apply((t, s, e) => (t.slice(s, e).includes('\n') ? fenceEdit(t, s, e) : inlineCodeEdit(t, s, e))),
    },
    {
      label: 'ссылка',
      title: 'ссылка — [подпись](адрес)',
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
          title='вставить ссылку на файл библиотеки; картинка встанет показом в тексте'
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          onClick={() => setPickerOpen(true)}
        >
          файл
        </Button>
      </div>

      {pickerOpen && (
        <NoteFilePicker
          onPick={(f) => apply((t, s, e) => fileEdit(t, s, e, f))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
