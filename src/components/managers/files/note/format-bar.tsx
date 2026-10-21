import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import {
  FilePicker,
  type NoteFileInsert,
} from 'components/managers/tasks/components/file-attachments';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { mediaFromClipboard } from 'components/managers/media/utils/usePasteFiles';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button, buttonVariants, GenericPopover, Text } from 'ui';
import {
  codeEdit,
  emphasisEdit,
  fileEdit,
  headingEdit,
  lineMarkEdit,
  linkEdit,
  mediaEdit,
  pastedHref,
  pastedLinkEdit,
  tableAt,
  tableInsertEdit,
  tableOpEdit,
  type Edit,
  type MediaInsert,
  type TableOp,
} from './format-edits';
import type { TableAlign } from 'components/shared/markdown/table';

/** Пункт меню «•••» телефонной полосы, который приносит редактор (rename, preview, tidy, wrap). */
export interface FormatMenuItem {
  label: string;
  run: () => void;
  /** Переключатель: пункт показывает своё состояние галочкой. */
  on?: boolean;
  disabled?: boolean;
}

/**
 * ФОКУС НЕ УХОДИТ ИЗ ПОЛЯ — и на тач-экране тоже. `mousedown` на телефоне приходит
 * совместимым событием после касания, и гасить его одного мало: глушим и `pointerdown`,
 * иначе клавиатура iOS прячется на каждое нажатие «B», а выделение схлопывается.
 */
const KEEP_FOCUS = {
  onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
};

/** Ряд телефонной полосы и строки её меню. */
const PHONE_TOOL = 'min-h-11 min-w-11 shrink-0';
const MENU_ITEM =
  'flex min-h-11 w-full items-center justify-between border-b border-hairline px-1 text-left text-control uppercase tracking-label last:border-b-0 hover:bg-bgSecondary disabled:opacity-50';

/** Мак: отмена — ⌘Z; Ctrl+Z там в поле не значит ничего, и отнимать его незачем. */
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

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
  compact,
  onTogglePreview,
  phone,
}: {
  areaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /**
   * ТЕЛЕФОН (<md): ОДИН прокручиваемый вбок ряд над клавиатурой — B, I, H, list, link, code,
   * file и «•••». Остальное уходит в меню: сначала пункты редактора `lead`, потом свои
   * (numbering, quote, table, media), потом `tail`. Логика правок та же — меняется раскладка.
   */
  phone?: {
    lead: FormatMenuItem[];
    tail: FormatMenuItem[];
    /**
     * РЯД В ПОТОКЕ, а не над клавиатурой: стоит там, где его отрисовали (лист правки блока сам
     * занимает видимый вьюпорт, и ряду незачем ловить клавиатуру отдельно). Меню — вниз.
     */
    inFlow?: boolean;
  };
  /**
   * КОМПАКТНАЯ ПОЛОСА ПОД ПОЛЕМ (форма заведения задачи): пять частых инструментов и «⋯»,
   * который раскрывает остальные. Логика правок та же — меняется только раскладка.
   */
  compact?: boolean;
  /** Компактная полоса держит у себя и переключатель показа разметки (одно «preview»). */
  onTogglePreview?: () => void;
}) {
  const [moreTools, setMoreTools] = useState(false);
  // Какое окно открыто и, значит, чем станет выбранный файл. `null` — закрыто.
  //
  // У медиатеки своего состояния здесь НЕТ: `MediaSelector` держит своё окно сам и получает
  // кнопку через Radix `asChild`. Заводить рядом второй `picker`-флаг значило бы дублировать
  // состояние, которым уже владеет чужой компонент.
  const [picker, setPicker] = useState<NoteFileInsert | null>(null);
  const pending = useRef<{ value: string; sel: [number, number] } | null>(null);
  const { showMessage } = useSnackBarStore();
  const [phoneMenu, setPhoneMenu] = useState(false);
  /** Скрытый триггер медиатеки для меню «•••»: `MediaSelector` держит своё окно сам и открывается
   * только своей кнопкой, а кнопка внутри меню умерла бы вместе с закрытым меню — и окно с ней. */
  const mediaHost = useRef<HTMLSpanElement>(null);

  /* ── РЯД НАД КЛАВИАТУРОЙ ─────────────────────────────────────────────────────────────────────
   *
   * `fixed; bottom: 0` на iOS стоит у низа ВЁРСТОЧНОГО вьюпорта, то есть ЗА клавиатурой: она
   * сжимает только видимый (`visualViewport`). Поэтому низ ряда ставится по видимому —
   * `offsetTop + height` в координатах вёрстки — и переставляется на его `resize`/`scroll`.
   * Без клавиатуры видимый совпадает с вёрсточным, и ряд стоит внизу экрана правки.
   * Пишется прямо в узел, а не состоянием: `scroll` видимого вьюпорта идёт на каждый кадр
   * прокрутки, и перерисовывать на него полосу незачем.
   */
  const phoneBar = useRef<HTMLDivElement>(null);
  const isPhone = !!phone;
  const inFlow = !!phone?.inFlow;
  useEffect(() => {
    const vv = window.visualViewport;
    const bar = phoneBar.current;
    if (!isPhone || inFlow || !vv || !bar) return;
    const place = () => {
      bar.style.top = `${vv.offsetTop + vv.height}px`;
      bar.style.bottom = 'auto';
      bar.style.transform = 'translateY(-100%)';
    };
    place();
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, [inFlow, isPhone]);

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

  /* ── ⌘V АДРЕСОМ — ГОТОВАЯ ССЫЛКА ────────────────────────────────────────────────────────────
   *
   * Просьба владельца дословно: «когда в эдитмоде маркдауна вставляешь ссылку, она автоматом
   * форматится как ссылка по названию домена, например https://www.etsy.com/listing/… = etsy.
   * так же сделай поддержку cmd z».
   *
   * Что считается адресом и чем подписывается — `pastedHref` / `pastedLinkEdit` в
   * `format-edits.ts`; там же сказано, где адрес остаётся текстом (внутри ссылки, в коде).
   *
   * ДВА ШАГА В СТОПКЕ ОТМЕНЫ, А НЕ ОДИН. Сначала адрес ложится КАК ЕСТЬ — так, как его положила
   * бы сама вставка, — и лишь вторым шагом заменяется ссылкой. Оба шага идут через `apply`, то
   * есть через `execCommand`, а между ними меняется выделение — для браузера это два разных
   * набора, и ⌘Z снимает их по одному: первое нажатие возвращает голый адрес (это и есть «не
   * хочу ссылку»), второе убирает вставку вовсе. Одним шагом ⌘Z умел бы только «вставки не
   * было», и за адресом текстом пришлось бы вставлять второй раз и править разметку руками.
   * Замерено на стенде (`format-bar-probe`, раздел 6).
   *
   * ПОСЛЕ ⌘Z КАРЕТКА СХЛОПЫВАЕТСЯ. Родная отмена возвращает и выделение, каким оно было перед
   * шагом, — то есть весь адрес выделенным, и следующая клавиша (пробел после адреса — самое
   * частое) стирала бы его целиком. Поэтому ⌘Z над НЕТРОНУТОЙ ссылкой перехватывается: та же
   * родная отмена (`execCommand('undo')`), затем каретка в конец адреса. Стопка не трогается —
   * второе ⌘Z и ⇧⌘Z работают как родные. «Нетронутой» значит: текст поля совпадает с тем, каким
   * его оставила вставка; после любой правки перехвата нет, и ⌘Z целиком родной. Помнится
   * только ПОСЛЕДНЯЯ вставка: откат сквозь две подряд оставит первый адрес выделенным — редко
   * и не страшно, а стопка на каждую вставку стоила бы ровно того, чего здесь избегают.
   */
  const autolink = useRef<{ linked: string; bare: string; start: number; href: string } | null>(
    null,
  );

  const pasteHref = useCallback(
    (area: HTMLTextAreaElement, href: string): boolean => {
      const edit = pastedLinkEdit(
        area.value,
        area.selectionStart ?? 0,
        area.selectionEnd ?? 0,
        href,
      );
      if (!edit) return false;
      const bareEnd = edit.start + href.length;
      apply(() => ({ start: edit.start, end: edit.end, text: href, sel: [edit.start, bareEnd] }));
      const bare = area.value;
      // Первый шаг лёг не так, как ждали, — второй строился бы на чужих координатах. Адрес уже в
      // тексте, и на этом честно всё: родная вставка своё сделала бы точно так же.
      if (bare.slice(edit.start, bareEnd) !== href) return true;
      apply(() => ({ start: edit.start, end: bareEnd, text: edit.text, sel: edit.sel }));
      autolink.current = { linked: area.value, bare, start: edit.start, href };
      return true;
    },
    [apply],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const area = areaRef.current;
      const last = autolink.current;
      if (!area || !last || e.target !== area) return;
      if (!(IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return;
      if (e.shiftKey || e.altKey) return;
      // `code` рядом с `key`: на русской раскладке физическая Z приходит как «я».
      if (e.code !== 'KeyZ' && e.key.toLowerCase() !== 'z') return;
      if (area.value !== last.linked) return;
      try {
        document.execCommand('undo');
      } catch {
        /* ниже — по состоянию поля, а не по возвращённому значению */
      }
      // Текст не изменился — родной отмены у этой сборки нет, и жест отдаётся браузеру как есть.
      // Класть голый адрес своей правкой нельзя: она легла бы В стопку новым шагом, и следующее
      // ⌘Z возвращало бы ссылку — отмена ходила бы по кругу и до «вставки не было» не доходила.
      if (area.value === last.linked) return;
      e.preventDefault();
      const bareEnd = last.start + last.href.length;
      if (area.value === last.bare) area.setSelectionRange(bareEnd, bareEnd);
      onChange(area.value);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [areaRef, onChange]);

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
      const plain = data.getData('text/plain');
      if (plain !== '') {
        // Текст в буфере — вставка остаётся вставкой текста, и мы даже не смотрим, что там ещё.
        // Одно исключение — ровно один адрес; что с ним делается, описано у `pasteHref`.
        const href = pastedHref(plain);
        if (href && pasteHref(area, href)) e.preventDefault();
        return;
      }
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
  }, [areaRef, openIntake, pasteHref]);

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

  /* ── ПОЛОСА РЕЖИМА ТАБЛИЦЫ ──────────────────────────────────────────────────────────────
   * Стоит ОТДЕЛЬНОЙ строкой и только пока каретка в таблице. Постоянно висящие «+ row» и
   * «align» на панели заметки, где таблиц обычно нет вовсе, — это шесть кнопок, которые
   * девять раз из десяти означают «неприменимо»; кнопка, которая почти всегда отказывает,
   * хуже отсутствующей.
   *
   * Полоса — вторая строка ОДНОГО блока, а не своя коробка: коробка внутри коробки в этой
   * системе запрещена, и волосяная линейка сверху выражает ту же вложенность. На телефоне она
   * едет над клавиатурой вместе с рядом форматирования и листается вбок, как и он. */
  const tableBar = tableSpot && (
    <div
      className={cn(
        'flex items-center gap-1 border-b border-hairline px-1.5 py-1.5',
        phone ? 'overflow-x-auto bg-bgColor' : 'flex-wrap',
      )}
    >
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
  );

  /** Ряд телефона: над клавиатурой — порталом в `body`, в потоке — там, где отрисован. */
  const placePhoneRow = (row: React.ReactNode) => (inFlow ? row : createPortal(row, document.body));

  return (
    <>
      {phone ? null : compact ? (
        <>
          <div className='flex border-t border-hairline'>
            {PRIMARY_TOOLS.map((t) => {
              const a = actions.find((x) => x.label === t.label);
              if (!a) return null;
              return (
                <Button
                  key={t.label}
                  type='button'
                  variant='default'
                  aria-label={t.label}
                  title={a.title}
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={a.run}
                  className={TOOL_CELL}
                >
                  <span className={t.className}>{t.glyph}</span>
                </Button>
              );
            })}
            <Button
              type='button'
              variant='default'
              aria-label='more formatting'
              aria-expanded={moreTools}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() => setMoreTools((v) => !v)}
              className={cn(TOOL_CELL, moreTools && 'bg-textColor text-bgColor')}
            >
              ⋯
            </Button>
          </div>
          {moreTools && (
            <div className='grid grid-cols-4 border-t border-hairline'>
              {MORE_TOOLS.map((label) => {
                const a = actions.find((x) => x.label === label);
                if (!a) return null;
                return (
                  <Button
                    key={label}
                    type='button'
                    variant='default'
                    title={a.title}
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onClick={a.run}
                    className={MORE_CELL}
                  >
                    {label}
                  </Button>
                );
              })}
              <TableSizePicker
                cellClassName={MORE_CELL}
                onPick={(rows, cols) => apply((t, s2, e) => tableInsertEdit(t, s2, e, rows, cols))}
              />
              <Button
                type='button'
                variant='default'
                title='file link'
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                onClick={() => setPicker('link')}
                className={MORE_CELL}
              >
                file
              </Button>
              <MediaSelector
                label='media'
                purpose='a picture in the text'
                allowMultiple
                showVideos={false}
                saveSelectedMedia={insertMedia}
                trigger={
                  <Button
                    type='button'
                    variant='default'
                    title='media gallery'
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    className={MORE_CELL}
                  >
                    media
                  </Button>
                }
              />
              {onTogglePreview && (
                <Button
                  type='button'
                  variant='default'
                  aria-label='preview markdown'
                  onClick={onTogglePreview}
                  className={MORE_CELL}
                >
                  preview
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
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
            title='file link'
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            onClick={() => setPicker('link')}
          >
            file
          </Button>

          <Button
            type='button'
            size='xs'
            variant='secondary'
            title='file preview'
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
                title='media gallery'
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              >
                media
              </Button>
            }
          />
        </div>
      )}

      {!phone && tableBar}

      {/* ── ТЕЛЕФОН: ОДИН РЯД НАД КЛАВИАТУРОЙ ───────────────────────────────────────────────
          Порталом в `body`: `fixed` внутри предка с `transform` встал бы не к экрану, а к
          предку. Слой `--z-dock` — над страницей, под навигацией и модалками.
          В ПОТОКЕ (`inFlow`) — тот же ряд без портала, на своём месте в листе блока. */}
      {phone &&
        placePhoneRow(
          <div
            ref={phoneBar}
            className={cn(
              'border-borderColor bg-pageBg md:hidden',
              inFlow ? 'border-b' : 'fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t',
            )}
          >
            {tableBar}
            {/* «•••» ПРИБИТ СПРАВА, вне прокрутки: в нём rename, wrap lines, add below, delete —
                уехав за край ряда, он пропадал из виду (жалоба владельца по скриншоту 375px). */}
            <div className='flex items-center'>
              <div className='flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1.5 pl-2 pr-1.5'>
                {PHONE_TOOLS.map((t) => {
                  const a = actions.find((x) => x.label === t.label);
                  if (!a) return null;
                  return (
                    <Button
                      key={t.label}
                      type='button'
                      size='sm'
                      variant='secondary'
                      aria-label={t.label}
                      {...KEEP_FOCUS}
                      onClick={a.run}
                      className={PHONE_TOOL}
                    >
                      <span className={t.className}>{t.glyph}</span>
                    </Button>
                  );
                })}
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  {...KEEP_FOCUS}
                  onClick={() => setPicker('link')}
                  className={PHONE_TOOL}
                >
                  file
                </Button>
              </div>
              <div className='flex-none border-l border-borderColor py-1.5 pl-1.5 pr-2'>
                <GenericPopover
                  open={phoneMenu}
                  onOpenChange={setPhoneMenu}
                  noTail
                  className='w-56'
                  // Меню не забирает фокус у поля: клавиатура остаётся, каретка — на месте.
                  contentProps={{
                    side: inFlow ? 'bottom' : 'top',
                    align: 'end',
                    onOpenAutoFocus: (e: Event) => e.preventDefault(),
                    onCloseAutoFocus: (e: Event) => e.preventDefault(),
                  }}
                  triggerProps={{
                    'aria-label': 'more formatting',
                    ...KEEP_FOCUS,
                    className: cn(
                      buttonVariants({ variant: 'secondary', size: 'sm' }),
                      PHONE_TOOL,
                      'flex items-center justify-center',
                    ),
                  }}
                  openElement={<span aria-hidden>•••</span>}
                >
                  <div role='menu' className='flex flex-col'>
                    {[
                      ...phone.lead,
                      ...PHONE_MORE.map((label) => ({
                        label,
                        run: actions.find((x) => x.label === label)?.run ?? (() => {}),
                      })),
                      {
                        label: 'table',
                        // Сетка выбора размера живёт на наведении и на телефоне не работает:
                        // здесь вставляется шапка и две строки на три столбца, дальше — полоса
                        // режима таблицы.
                        run: () => apply((t, s2, e) => tableInsertEdit(t, s2, e, 2, 3)),
                      },
                      {
                        label: 'media',
                        run: () => mediaHost.current?.querySelector('button')?.click(),
                      },
                      ...phone.tail,
                    ].map((item: FormatMenuItem) => (
                      <Button
                        key={item.label}
                        type='button'
                        role={item.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
                        aria-checked={item.on}
                        disabled={item.disabled}
                        {...KEEP_FOCUS}
                        onClick={() => {
                          setPhoneMenu(false);
                          item.run();
                        }}
                        className={MENU_ITEM}
                      >
                        <span>{item.label}</span>
                        {item.on && <span aria-hidden>✓</span>}
                      </Button>
                    ))}
                  </div>
                </GenericPopover>
              </div>
            </div>
          </div>,
        )}
      {phone && (
        <span ref={mediaHost} className='hidden'>
          <MediaSelector
            label='media'
            purpose='a picture in the text'
            allowMultiple
            showVideos={false}
            saveSelectedMedia={insertMedia}
            trigger={
              <Button type='button' size='xs' variant='secondary'>
                media
              </Button>
            }
          />
        </span>
      )}

      {picker && (
        <FilePicker
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

/** Компактная полоса: пять частых инструментов, остальное — под «⋯». */
const PRIMARY_TOOLS: { label: string; glyph: string; className?: string }[] = [
  { label: 'bold', glyph: 'B', className: 'font-bold' },
  { label: 'italic', glyph: 'I', className: 'italic' },
  { label: 'list', glyph: '•' },
  { label: 'numbering', glyph: '1.' },
  { label: 'link', glyph: 'link' },
];
const MORE_TOOLS = ['heading', 'quote', 'code'];
/** Телефонный ряд над клавиатурой; остальное — в «•••» (`PHONE_MORE` и пункты редактора). */
const PHONE_TOOLS: { label: string; glyph: string; className?: string }[] = [
  { label: 'bold', glyph: 'B', className: 'font-bold' },
  { label: 'italic', glyph: 'I', className: 'italic' },
  { label: 'heading', glyph: 'H' },
  { label: 'list', glyph: 'list' },
  { label: 'link', glyph: 'link' },
  { label: 'code', glyph: 'code' },
];
const PHONE_MORE = ['numbering', 'quote'];
const TOOL_CELL = 'min-h-11 flex-1 border-r border-hairline text-micro last:border-r-0 md:min-h-8';
const MORE_CELL =
  'flex min-h-11 w-full items-center justify-center border-r border-b border-hairline text-micro uppercase tracking-label md:min-h-8';

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
function TableSizePicker({
  onPick,
  cellClassName,
}: {
  onPick: (rows: number, cols: number) => void;
  /** В компактной полосе триггер — клетка сетки, а не кнопка-рамка. */
  cellClassName?: string;
}) {
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
      triggerProps={{
        onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
        ...(cellClassName ? { className: cellClassName } : {}),
      }}
      openElement={
        cellClassName ? (
          <span>table</span>
        ) : (
          <Button type='button' size='xs' variant='secondary' title='table' asChild>
            <span>table</span>
          </Button>
        )
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
