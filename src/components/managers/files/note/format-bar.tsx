import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button } from 'ui/components/button';
import { NoteFilePicker, type NoteFileInsert } from './file-picker';
import {
  codeEdit,
  emphasisEdit,
  fileEdit,
  headingEdit,
  lineMarkEdit,
  linkEdit,
  mediaEdit,
  type Edit,
  type MediaInsert,
} from './format-edits';

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
 *
 * ── ГДЕ ЛЕЖИТ САМА ПРАВКА ───────────────────────────────────────────────────────────────────
 *
 * Всё, что считает НОВЫЙ ТЕКСТ, вынесено в `format-edits.ts`: там чистые `(text,start,end) => Edit`
 * без DOM и без состояния, и там же они проверяются таблицей входа-выхода. Здесь остаётся ровно
 * то, что без браузера не проверить: каретка, стопка отмены и кнопки.
 */

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
  //
  // У медиатеки своего состояния здесь НЕТ: `MediaSelector` держит своё окно сам и получает
  // кнопку через Radix `asChild`. Заводить рядом второй `picker`-флаг значило бы дублировать
  // состояние, которым уже владеет чужой компонент.
  const [picker, setPicker] = useState<NoteFileInsert | null>(null);
  const pending = useRef<{ value: string; sel: [number, number] } | null>(null);
  const { showMessage } = useSnackBarStore();

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
    // `preventScroll` — см. ниже в `apply`: голый `focus()` уносит прокрутку СТРАНИЦЫ.
    area.focus({ preventScroll: true });
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

      // ФОКУС БЕЗ ПРОКРУТКИ. Голый `focus()` по умолчанию тянет элемент в зону видимости и уводит
      // за собой скроллер СТРАНИЦЫ. Пока поле прокручивается внутри себя, каретку показывает оно
      // само и странице двигаться незачем; как только текст помещается в поле целиком, показать
      // каретку может только страница — и заметка прыгает под руками (замерено: поле 1800px,
      // вьюпорт 900, сдвиг 478px). Каретки это не касается: её ставит `setSelectionRange` ниже.
      area.focus({ preventScroll: true });
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

  /**
   * Выбранные кадры — в текст.
   *
   * Кадр без единого адреса вставить нечем: `![…]()` показался бы битой картинкой, а молчаливый
   * пропуск означал бы «нажал add all на трёх, в тексте два». Поэтому отброшенное называется
   * вслух, а не исчезает.
   */
  const insertMedia = (media: common_MediaFull[]) => {
    const items: MediaInsert[] = [];
    let lost = 0;
    for (const m of media) {
      const id = Number(m.id);
      const url = m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl || '';
      if (!url || !Number.isSafeInteger(id) || id <= 0) {
        lost += 1;
        continue;
      }
      items.push({ id, url });
    }
    if (lost) showMessage(`${lost} of ${media.length} have no address and stayed out`, 'error');
    if (!items.length) return;
    apply((t, s, e) => mediaEdit(t, s, e, items));
  };

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
      run: () => apply(codeEdit),
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

        {/* СНИМКИ ИЗ МЕДИАТЕКИ, С МУЛЬТИВЫБОРОМ. Библиотека файлов и медиатека — два разных
            хранилища, и до сих пор из текста заметки был достижим только первый.

            Видео здесь скрыто (`showVideos={false}`) намеренно: разметчик заметки умеет только
            `<img>`, и вставленный ролик показался бы битой картинкой — то есть кнопка предлагала
            бы то, что тут же ломается. */}
        <MediaSelector
          label='media'
          purpose='a picture in the text'
          allowMultiple
          showVideos={false}
          saveSelectedMedia={insertMedia}
          trigger={
            <Button
              type='button'
              size='xs'
              variant='secondary'
              title='insert pictures from the media library: pick several, they will stand as a gallery'
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            >
              media
            </Button>
          }
        />
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
