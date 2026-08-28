import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { mediaFromClipboard } from 'components/managers/media/utils/usePasteFiles';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button } from 'ui/components/button';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { NoteFilePicker, type NoteFileInsert } from './file-picker';
import {
  codeEdit,
  emphasisEdit,
  fileEdit,
  headingEdit,
  lineMarkEdit,
  linkEdit,
  mediaEdit,
  tableAt,
  tableInsertEdit,
  tableOpEdit,
  type Edit,
  type MediaInsert,
  type TableOp,
} from './format-edits';
import type { TableAlign } from 'ui/markdown/table';

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

  /**
   * РЕЖИМ ТАБЛИЦЫ: каретка стоит в таблице — значит стоит и полоса её правки.
   *
   * ХРАНИТСЯ ТОЛЬКО ВЫВЕДЕННОЕ (есть ли таблица и как выровнен её столбец), а не сама позиция
   * каретки. `selectionchange` приходит на каждое движение стрелкой и на каждую букву; заведи мы
   * тут позицию состоянием — панель перерисовывалась бы на каждый символ. Выведенное же меняется
   * редко: вошли в таблицу, вышли, перешли в другой столбец.
   *
   * ПОДПИСКА СВОЯ, А НЕ ПРОП СВЕРХУ, и это осознанно. Каретку слушает ещё и редактор — для
   * синхронной прокрутки показа, — но прокрутка работает БЕЗ состояния, ссылкой на узел; отдай
   * мы позицию пропом, каждое движение каретки перерисовывало бы вместе с панелью и показ
   * заметки, то есть самый дорогой узел экрана.
   */
  const [tableSpot, setTableSpot] = useState<{ align: TableAlign; inHeader: boolean } | null>(null);
  useEffect(() => {
    const read = () => {
      const area = areaRef.current;
      if (!area || document.activeElement !== area) {
        setTableSpot((cur) => (cur === null ? cur : null));
        return;
      }
      const spot = tableAt(area.value, area.selectionStart ?? 0);
      const next = spot
        ? { align: spot.model.align[spot.col] ?? 'left', inHeader: spot.row === 0 }
        : null;
      setTableSpot((cur) =>
        cur?.align === next?.align && cur?.inHeader === next?.inHeader ? cur : next,
      );
    };
    read();
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
    // `value` в зависимостях НЕ СЛУЧАЙНО: правка текста меняет таблицу под кареткой, а
    // `selectionchange` на неё не приходит — вставили столбец, а полоса осталась бы вчерашней.
  }, [areaRef, value]);

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
    (make: (text: string, start: number, end: number) => Edit | null) => {
      const area = areaRef.current;
      if (!area) return;
      // Текст берётся ИЗ ПОЛЯ, а не из пропа: координаты выделения — это координаты в узле, и
      // считать их по чужой копии строки значит однажды промахнуться на длину расхождения.
      const text = area.value;
      const edit = make(text, area.selectionStart ?? 0, area.selectionEnd ?? 0);
      // `null` — ОТКАЗ ПРАВКИ, а не её отсутствие. Операция режима таблицы бывает невыразима
      // (шапку не удалить, последний столбец не удалить), и молчаливый выход здесь читался бы
      // как сломанная кнопка; словами отказывается вызывающий, у него есть причина.
      if (!edit) return;

      const expected = text.slice(0, edit.start) + edit.text + text.slice(edit.end);

      // ФОКУС БЕЗ ПРОКРУТКИ. Голый `focus()` по умолчанию тянет элемент в зону видимости и уводит
      // за собой скроллер СТРАНИЦЫ. Пока поле прокручивается внутри себя, каретку показывает оно
      // само и странице двигаться незачем; как только текст помещается в поле целиком, показать
      // каретку может только страница — и заметка прыгает под руками (замерено: поле 1800px,
      // вьюпорт 900, сдвиг 478px). Каретки это не касается: её ставит `setSelectionRange` ниже.
      area.focus({ preventScroll: true });
      let done = false;
      /**
       * `execCommand` ПИШЕТ ТУДА, ГДЕ ВЫДЕЛЕНИЕ, А НЕ ТУДА, КОМУ АДРЕСОВАНО.
       *
       * Претензия владельца дословно: «в тасках, когда таску создаёшь и хочешь сделать аттач
       * медиа, оно ссылку может не в то поле закинуть». Воспроизведено на стенде
       * (`media-tray-probe`, раздел 3) и прослежено до знака: в момент вставки в фокусе стоит
       * КНОПКА, `insertText` возвращает `true`, а разметка появляется В ПОЛЕ ЗАГОЛОВКА — там,
       * где осталось выделение документа с момента, когда модалка открылась и сама поставила
       * туда каретку.
       *
       * ПОЧЕМУ ФОКУС НЕ ДОЕХАЛ. Правка приходит из диалога выбора медиа, и в этот момент диалог
       * ЕЩЁ ОТКРЫТ: у Radix свой захват фокуса, и `focus()` на поле снаружи он отменяет
       * немедленно, синхронно в том же событии. Ждать закрытия нельзя — правка обязана лечь в
       * текст сразу, — а `preventScroll` тут ни при чём: не доезжает сам фокус.
       *
       * ЧЕМ ЭТО ХУЖЕ ПРОСТО НЕСРАБОТАВШЕЙ КНОПКИ. Запасной путь (`setRangeText` ниже) всё равно
       * кладёт текст куда надо, поэтому со стороны панель выглядит исправной — а в чужом поле
       * молча остаётся ВТОРАЯ копия ссылки. Её замечают, только сохранив карточку.
       *
       * Поэтому команда зовётся ТОЛЬКО когда фокус действительно стоит в нашем поле. Иначе —
       * сразу запасной путь: он адресует правку узлу (`area.setRangeText`), а не выделению, и
       * промахнуться мимо поля не может по построению. Цена — потеря нативной истории отмены
       * для этой вставки, и она платится только в диалоговом случае.
       */
      if (edit.text !== '' && document.activeElement === area) {
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

  /* ── ⌘V КАРТИНКОЙ ПРЯМО В ТЕКСТ ─────────────────────────────────────────────────────────────
   *
   * Просьба владельца: «если ты прямо в маркдауне во время редактирования жмёшь ⌘V картинкой, она
   * сразу в модалку аплоуда и сразу инлайн — без того, чтобы нажимать кнопку медиа».
   *
   * Дорога та же, что у кнопки: приёмная модалка (превью → кроп → подтверждение) и та же
   * `insertMedia`, что и у выбора из библиотеки. Значит и разметка получается та же — второго
   * способа вставить снимок в заметку не заводится.
   *
   * ПОЧЕМУ СЛУШАТЕЛЬ СВОЙ, А НЕ `usePasteFiles`. Тот хук намеренно НЕ ТРОГАЕТ текстовые поля:
   * человек, копирующий формулировку из соседней карточки, обязан получить текст, а не картинку.
   * Это правило остаётся; здесь описано ровно одно исключение из него, и описано оно двумя
   * условиями сразу:
   *
   *   1. вставка пришла ИМЕННО В ЭТО ПОЛЕ (`e.target === area`), а не в соседнее;
   *   2. в буфере НЕТ ТЕКСТА — только файлы.
   *
   * Второе важнее первого. Копирование из ворда, фигмы и половины редакторов кладёт в буфер и
   * текст, и картинку одновременно; проверять «есть ли картинка» значило бы отнимать обычную
   * вставку текста у всех, кто копирует из таких мест. Скриншот же (⌘⇧4, вырезка из окна) текста
   * с собой не несёт — это и есть тот случай, ради которого просили.
   */
  const intake = useMediaIntake({
    accept: 'image',
    purpose: 'picture in the note',
    // Видео сюда не берётся по той же причине, по какой его нет у кнопки: разметчик заметки
    // умеет только `<img>`, и вставленный ролик показался бы битой картинкой.
    onMedia: insertMedia,
  });
  const openIntake = intake.openFiles;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const area = areaRef.current;
      if (!area || e.target !== area) return;
      const data = e.clipboardData;
      if (!data) return;
      // Текст в буфере — вставка остаётся вставкой текста, и мы даже не смотрим, что там ещё.
      if (data.getData('text/plain') !== '') return;
      const files = mediaFromClipboard(data, 'image');
      if (!files.length) return;
      // Гасим родную вставку: без этого браузер положил бы в текст имя файла или пустоту.
      e.preventDefault();
      openIntake(files);
    };
    // Слушатель на документе, а не на узле: поле пересоздаётся переключателем «пишу ↔ смотрю»
    // (правка задачи), и подписка на узел пережила бы не каждое такое переключение.
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [areaRef, openIntake]);

  /**
   * Операция режима таблицы. ОТКАЗ ПРОИЗНОСИТСЯ СЛОВАМИ: `tableOpEdit` возвращает `null` там, где
   * операция невыразима, и молчаливое бездействие кнопки читалось бы как поломка.
   */
  const runTableOp = useCallback(
    (op: TableOp) => {
      const area = areaRef.current;
      if (!area) return;
      const at = area.selectionStart ?? 0;
      if (!tableOpEdit(area.value, at, op)) {
        showMessage(TABLE_REFUSALS[op], 'error');
        return;
      }
      apply((t, s2) => tableOpEdit(t, s2, op));
    },
    [apply, areaRef, showMessage],
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

        <TableSizePicker
          onPick={(rows, cols) => apply((t, s2, e) => tableInsertEdit(t, s2, e, rows, cols))}
        />

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

      {/* ── ПОЛОСА РЕЖИМА ТАБЛИЦЫ ──────────────────────────────────────────────────────────
          Стоит ОТДЕЛЬНОЙ строкой и только пока каретка в таблице. Постоянно висящие «+ row» и
          «align» на панели заметки, где таблиц обычно нет вовсе, — это шесть кнопок, которые
          девять раз из десяти означают «неприменимо»; кнопка, которая почти всегда отказывает,
          хуже отсутствующей.

          Полоса — вторая строка ОДНОГО блока, а не своя коробка: коробка внутри коробки в этой
          системе запрещена, и волосяная линейка сверху выражает ту же вложенность. */}
      {tableSpot && (
        <div className='flex flex-wrap items-center gap-1 border-b border-hairline px-1.5 py-1.5'>
          <Text size='micro' variant='label' component='span' className='mr-1 uppercase'>
            table
          </Text>
          {TABLE_ACTIONS.map((a) => (
            <Button
              key={a.op}
              type='button'
              size='xs'
              variant='secondary'
              title={a.title}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() => runTableOp(a.op)}
            >
              {a.label}
            </Button>
          ))}
          <Text size='micro' variant='label' component='span' className='mx-1 uppercase'>
            align
          </Text>
          {TABLE_ALIGNS.map((a) => (
            <Button
              key={a.op}
              type='button'
              size='xs'
              // Выравнивание столбца — СОСТОЯНИЕ, а не действие: нажатая кнопка показывает, как
              // столбец выровнен сейчас. Иначе три кнопки подряд выглядят как три одинаковых
              // действия, и «а как сейчас» приходится читать в тексте разделителя.
              variant={tableSpot.align === a.op ? 'main' : 'secondary'}
              title={a.title}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() => runTableOp(a.op)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {picker && (
        <NoteFilePicker
          insert={picker}
          onPick={(f) => apply((t, s, e) => fileEdit(t, s, e, f, picker))}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Приёмка вставленного в поле: рисуется всегда, показывается только с непустой очередью. */}
      {intake.dialog}
    </>
  );
}

/** Кнопки строения таблицы. Порядок — как читают: сначала строки, потом столбцы. */
const TABLE_ACTIONS: { op: TableOp; label: string; title: string }[] = [
  {
    op: 'row+',
    label: '+ row',
    title: 'a row under the one the caret is in (from the header — the first body row)',
  },
  { op: 'row-', label: '− row', title: 'remove the row the caret is in' },
  { op: 'col+', label: '+ col', title: 'a column to the right of the one the caret is in' },
  { op: 'col-', label: '− col', title: 'remove the column the caret is in' },
];

const TABLE_ALIGNS: { op: TableOp; label: string; title: string }[] = [
  { op: 'left', label: 'left', title: 'align this column left' },
  { op: 'center', label: 'center', title: 'align this column centre' },
  { op: 'right', label: 'right', title: 'align this column right — for digits' },
];

/**
 * ПОЧЕМУ ОПЕРАЦИЯ ОТКАЗАЛА — словами и по делу. Общая фраза «нельзя» здесь не годится: у каждого
 * отказа своя причина, и человек, услышавший её, знает, что делать дальше (выделить и удалить).
 */
const TABLE_REFUSALS: Record<TableOp, string> = {
  'row+': 'there is nowhere to add a row here',
  'row-':
    'the header row stays: a table without it is not a table — select it and delete it as text',
  'col+': 'there is nowhere to add a column here',
  'col-':
    'the last column stays: removing it would remove the table — select it and delete it as text',
  left: 'this column is already aligned that way',
  center: 'this column is already aligned that way',
  right: 'this column is already aligned that way',
};

const PICK_MAX = 6;

/**
 * ВЫБОР РАЗМЕРА ТАБЛИЦЫ СЕТКОЙ, а не двумя полями с числами.
 *
 * Сетка отвечает на вопрос в тех же единицах, в которых он задан («вот такая»), и не требует
 * набирать цифры там, где рука уже на мыши. Потолок 6×6 — не ограничение таблицы, а граница
 * УДОБНОГО жеста: дальше строки и столбцы добираются полосой режима, которая для того и есть.
 */
function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const rows = hover?.r ?? 0;
  const cols = hover?.c ?? 0;
  return (
    <GenericPopover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setHover(null);
      }}
      title='table'
      triggerProps={{ onMouseDown: (e: React.MouseEvent) => e.preventDefault() }}
      openElement={
        <Button
          type='button'
          size='xs'
          variant='secondary'
          title='insert a table: pick the size, then rows and columns are added by the strip that appears when the caret is inside it'
          asChild
        >
          <span>table</span>
        </Button>
      }
    >
      <div className='space-y-1.5'>
        {/* Клетка — не `<button>`: весь выбор делает ОДИН клик, а полсотни кнопок в сетке
            означали бы полсотни остановок табуляции ради жеста, который целиком мышиный.
            Клавиатурный путь у таблицы свой — размер по умолчанию нажатием Enter на подписи ниже. */}
        <div
          className='grid w-fit grid-cols-6 gap-px bg-hairline p-px'
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: PICK_MAX * PICK_MAX }, (_, i) => {
            const r = Math.floor(i / PICK_MAX) + 1;
            const c = (i % PICK_MAX) + 1;
            const on = r <= rows && c <= cols;
            return (
              <span
                key={i}
                role='button'
                tabIndex={-1}
                aria-label={`${c} × ${r}`}
                className={`size-4 cursor-pointer ${on ? 'bg-textColor' : 'bg-bgColor'}`}
                onMouseEnter={() => setHover({ r, c })}
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setHover(null);
                  // СТРОК В ТЕЛЕ — на одну меньше выбранного: верхний ряд сетки это ШАПКА,
                  // и таблица «2×3» из шапки и двух строк — то, что человек видит в сетке.
                  onPick(Math.max(0, r - 1), c);
                }}
              />
            );
          })}
        </div>
        <Text size='micro' variant='label' component='p'>
          {hover ? `${cols} × ${rows} — the top row is the header` : 'pick the size'}
        </Text>
      </div>
    </GenericPopover>
  );
}
