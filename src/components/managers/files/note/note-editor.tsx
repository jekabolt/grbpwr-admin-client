import {
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { AiPanel, useNoteAssistant, type AiRequest, type AiSuggestion } from './ai-panel';
import { FormatBar } from './format-bar';
import { MarkdownView } from './markdown-view';

/**
 * Правка заметки: полоса действий, поле во всю ширину и блок помощника.
 *
 * Правка — НЕ состояние по умолчанию (вариант md=v3): заметку в девяти случаях из десяти
 * открывают почитать, поэтому редактор появляется по ⌘E, а уходит по тому же ⌘E или по кнопке
 * «finish editing». Esc из правки НЕ выводит — см. развилку клавиш в `note-page.tsx`. Цена
 * названа в самом макете: пока не нажал, непонятно, что текст вообще правится, — поэтому кнопка
 * «edit ⌘E» стоит в шапке чтения, а не прячется в меню.
 *
 * ЗАМОРОЗКА ПИСАТЕЛЕЙ — ПРОПОМ. Никакого `fieldset[disabled]`: он глушит только клик и фокус, а
 * наведение и `pointerdown` продолжают работать, и «только чтение» получается наполовину. Здесь
 * режим чтения просто не даёт этому компоненту появиться.
 *
 * Полоса форматирования и вставка файла живут в `format-bar.tsx`: вся возня с кареткой в
 * управляемой `textarea` собрана там одним местом, а не размазана по обработчикам кнопок.
 */

/** Наименьшее выделение, которое считается «форматируй только это». Пара случайно задетых
 * символов — это не намерение, а промах мышью, и уходить в модель вместо всей заметки они не
 * должны. */
const MIN_SELECTION = 24;

/** Насколько блок должен отстоять от кромки показа, чтобы считаться видимым. Ноль означал бы
 * «виден» у блока, от которого на экране остался один пиксель. */
const EDGE = 12;

/** Сколько после колеса/тача по показу его `scroll` считается жестом даже при смене высоты. */
const GESTURE_MS = 800;
/** Сколько после щелчка по показу подводка показа под каретку молчит. */
const FROM_PANE_MS = 250;

/* ── ЗЕРКАЛО ПОЛЯ: ГДЕ В НЁМ СТОИТ СТРОКА N ──────────────────────────────────────────────────
 *
 * У `textarea` нет способа спросить «на какой высоте строка 42»: строки переносятся по ширине,
 * и «номер × высота строки» врёт на первом же длинном абзаце. Поэтому на время замера рядом с
 * полем ставится невидимый блок с теми же шрифтом, шириной, отступами и `pre-wrap`, а в начале
 * каждой строки — пустой `span`: его `offsetTop` и есть высота этой строки в поле. Замер стоит
 * одной раскладки на весь текст и кэшируется, пока не изменились текст или ширина поля.
 */

/** Что копируется в зеркало — всё, от чего зависят перенос строк и высота строки. */
const MIRRORED = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'font-feature-settings',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'tab-size',
  'text-indent',
  'text-transform',
  'text-rendering',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'overflow-wrap',
  'word-break',
  'white-space',
  'direction',
  'hyphens',
];

interface LineMap {
  /** Верх каждой строки исходника в координатах прокрутки поля; у нулевой — высота отступа. */
  tops: number[];
  /** Смещение начала каждой строки в тексте. */
  starts: number[];
  /** Низ текста в тех же координатах. */
  bottom: number;
}

function measureLines(area: HTMLTextAreaElement): LineMap {
  const cs = getComputedStyle(area);
  const m = document.createElement('div');
  for (const p of MIRRORED) m.style.setProperty(p, cs.getPropertyValue(p));
  m.style.setProperty('white-space', 'pre-wrap');
  m.style.boxSizing = 'border-box';
  m.style.border = '0';
  // Ширина — ПО `clientWidth`: без рамки и без полосы прокрутки, иначе зеркало переносило бы
  // строки позже поля.
  m.style.width = `${area.clientWidth}px`;
  m.style.height = 'auto';
  // `fixed`, а не `absolute`: зеркало в десятки тысяч пикселей высотой не должно на время замера
  // растягивать прокрутку страницы; для `offsetTop` меток оно всё равно остаётся их offsetParent.
  m.style.position = 'fixed';
  m.style.top = '0';
  m.style.left = '0';
  m.style.visibility = 'hidden';
  m.style.pointerEvents = 'none';
  m.style.overflow = 'hidden';
  const rows = area.value.split('\n');
  const marks: HTMLSpanElement[] = [];
  const starts: number[] = [];
  let at = 0;
  rows.forEach((row, i) => {
    const s = document.createElement('span');
    marks.push(s);
    starts.push(at);
    m.append(s, i < rows.length - 1 ? `${row}\n` : row);
    at += row.length + 1;
  });
  // Пустая последняя строка (текст кончается переводом) без содержимого не получает строчной
  // коробки, и низ текста считался бы на строку выше, чем в поле.
  marks[marks.length - 1].textContent = '\u200b';
  (area.parentElement ?? document.body).appendChild(m);
  const tops = marks.map((s) => s.offsetTop);
  const bottom = m.scrollHeight - (parseFloat(cs.paddingBottom) || 0);
  m.remove();
  return { tops, starts, bottom };
}

/** Сколько раз `needle` входит в `hay` (без наложений). */
function occurrences(hay: string, needle: string): number {
  let n = 0;
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

/** Текст показа ВНУТРИ блока до узла `stop` — чтобы отличить повторы слова. */
function renderedBefore(block: HTMLElement, stop: Node): string {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let out = '';
  for (let n = walker.nextNode(); n && n !== stop; n = walker.nextNode()) out += (n as Text).data;
  return out;
}

/** Строка блока показа, зажатая в строки поля: показ отстаёт от набора на кадр. */
function lineOf(block: HTMLElement, m: LineMap): number {
  const n = Number(block.dataset.mdLine);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(m.tops.length - 1, n));
}

/** Текстовый узел и смещение под точкой экрана — два имени одного API у разных движков. */
function pointHit(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

/** Где стояла каретка и куда было прокручено поле. Переживает выход в чтение — см. `caret`. */
export interface NoteCaret {
  start: number;
  end: number;
  scroll: number;
}

export interface NoteEditorHandle {
  /** Поставить фокус, и — если позиция передана — вернуть каретку и прокрутку туда же. */
  focus: (at?: NoteCaret | null) => void;
  /**
   * Снимок каретки ПЕРЕД уходом из правки.
   *
   * Читается снаружи и заранее, а не в уборке эффекта: поле к тому моменту уже отсоединено, и
   * `selectionStart` брать не с чего. Без снимка Esc и обратный ⌘E ставили каретку в НАЧАЛО
   * заметки — замерено: правил сороковую строку из шестидесяти, вернулся в позицию 0.
   */
  caret: () => NoteCaret | null;
  /**
   * Забрал ли редактор нажатие Esc себе.
   *
   * Esc на этом экране означает «выйти из правки», но пока открыт блок помощника он означает
   * другое — «закрой помощника». Без этой уступки Esc поверх готового предложения выкидывал бы
   * из правки И выбрасывал предложение заодно, а поверх работающего запроса — оставлял бы его
   * висеть в никуда.
   */
  consumeEscape: () => boolean;
}

export function NoteEditor({
  handleRef,
  name,
  onNameChange,
  value,
  onChange,
  dirty,
  saving,
  savedLabel,
  canSave,
  onSave,
  onLeaveEdit,
  sizeHint,
  banners,
}: {
  handleRef?: RefObject<NoteEditorHandle | null>;
  name: string;
  onNameChange: (next: string) => void;
  value: string;
  onChange: (next: string) => void;
  dirty: boolean;
  saving: boolean;
  /** «saved at 13:40» — время последней удачной записи; пусто, если её ещё не было. */
  savedLabel: string;
  canSave: boolean;
  onSave: () => void;
  onLeaveEdit: () => void;
  /** Слова про потолок содержимого, когда он близко или превышен. */
  sizeHint?: string;
  /** Баннеры страницы (черновик, конфликт, различия) — между полосой и полем, а не поверх
   * текста: конфликт обязан стоять там, где на него смотрят, прежде чем нажать «save». */
  banners?: React.ReactNode;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const { showMessage } = useSnackBarStore();
  const assistant = useNoteAssistant();

  const assistantOpen = assistant.state.kind !== 'idle';
  useImperativeHandle(
    handleRef,
    () => ({
      focus: (at) => {
        const area = areaRef.current;
        if (!area) return;
        area.focus();
        if (!at) return;
        // Позиция зажимается длиной ТЕКУЩЕГО текста: пока человек читал, заметку мог перечитать
        // фон и она могла стать короче. Каретка за пределами текста — это молчаливый прыжок в
        // конец, то есть тот же дефект, от которого снимок и заведён.
        const max = area.value.length;
        const start = Math.min(at.start, max);
        const end = Math.min(at.end, max);
        area.setSelectionRange(start, end);
        area.scrollTop = at.scroll;
      },
      caret: () => {
        const area = areaRef.current;
        if (!area) return null;
        return {
          start: area.selectionStart ?? 0,
          end: area.selectionEnd ?? 0,
          scroll: area.scrollTop,
        };
      },
      consumeEscape: () => {
        if (!assistantOpen) return false;
        assistant.dismiss();
        return true;
      },
    }),
    [assistant, assistantOpen],
  );

  /** Что уходит помощнику: выделение, если оно есть, иначе вся заметка. Это и есть тот
   * «select a piece of the text», который предлагает состояние `toolong`. */
  const buildRequest = useCallback((): AiRequest => {
    const area = areaRef.current;
    if (area) {
      const start = area.selectionStart ?? 0;
      const end = area.selectionEnd ?? 0;
      if (end - start >= MIN_SELECTION) {
        return { text: value.slice(start, end), range: { start, end } };
      }
    }
    return { text: value, range: null };
  }, [value]);

  const applySuggestion = useCallback(
    (s: AiSuggestion, edit: boolean) => {
      const previous = value;
      let next: string;

      if (!s.range) {
        // Пока помощник работал, человек мог дописывать — и предложение построено по ПРОШЛОЙ
        // версии буфера. Принять его тогда значит стереть эти дописанные строки, причём молча:
        // в колонке «how it is now» их нет, и заметить пропажу не по чему. Отказ обратим, потеря —
        // нет, поэтому здесь отказ.
        if (value !== s.before) {
          showMessage(
            'the text changed while the assistant was working — the suggestion is built on the previous version, ask again',
            'error',
          );
          return;
        }
        next = s.after;
      } else {
        // Буфер мог измениться, пока помощник работал. Вставлять по старым границам вслепую
        // нельзя: это разрезало бы текст посередине слова и выглядело бы как порча файла.
        const { start, end } = s.range;
        if (value.slice(start, end) === s.before) {
          next = value.slice(0, start) + s.after + value.slice(end);
        } else {
          const at = value.indexOf(s.before);
          if (at >= 0 && value.indexOf(s.before, at + 1) === -1) {
            next = value.slice(0, at) + s.after + value.slice(at + s.before.length);
          } else {
            showMessage(
              'the text changed while the assistant was working — there is nowhere to insert it',
              'error',
            );
            return;
          }
        }
      }

      onChange(next);
      // Панель НЕ закрывается: она и есть единственное место, где остался прежний текст. Пока
      // она на экране, принятое возвращается одной кнопкой — см. `applied` в `ai-panel.tsx`.
      assistant.applied(previous, next, s.scope);
      if (edit) areaRef.current?.focus();
    },
    [assistant, onChange, showMessage, value],
  );

  /** Возврат к тексту до принятия. Отказывает, если после принятия текст уже правили руками:
   * возврат обязан отменять СВОЁ действие, а не стирать набранное после него. */
  const revertSuggestion = useCallback(
    (previous: string, next: string) => {
      if (value !== next) {
        showMessage(
          'the text has already been edited since accepting — the revert would erase those edits, so it refuses',
          'error',
        );
        return;
      }
      onChange(previous);
      assistant.dismiss();
      areaRef.current?.focus();
    },
    [assistant, onChange, showMessage, value],
  );

  const working = assistant.state.kind === 'working';

  // Показ отстаёт от набора НА ОДИН КАДР ЗАНЯТОСТИ, а не на таймер: `useDeferredValue` отдаёт
  // старое значение, пока идёт ввод, и пересобирает разметку в свободную минуту. Потолок заметки
  // — 512 КиБ, и разбирать её на каждую букву значило бы платить набором за показ.
  const previewSource = useDeferredValue(value);

  /* ── ПОКАЗ ЕДЕТ ЗА КАРЕТКОЙ ────────────────────────────────────────────────────────────────
   *
   * Претензия владельца дословно: «если мы редактируем маркдаун, мы в превью должны перемещаться
   * в это же место». Две колонки прокручиваются каждая сама по себе, и на заметке длиннее экрана
   * показ рядом с полем перестаёт быть показом ТОГО, что правишь: правишь сороковую строку,
   * а справа стоит первая.
   *
   * СЧЁТ ИДЁТ ПО СТРОКЕ ИСХОДНИКА, А НЕ ПО ДОЛЕ ПРОКРУТКИ. Доля («поле прокручено на 30% — и
   * показ на 30%») врёт тем сильнее, чем больше в заметке картинок: строка `![…](/files/12)`
   * занимает в тексте одну строку, а в показе — половину экрана. Каждый блок разметки помечен
   * строкой, с которой он начался (`data-md-line` в `markdown-view.tsx`), и место ищется по ней.
   *
   * ДВИГАЕМ ТОЛЬКО КОГДА ФОКУС В ПОЛЕ. Иначе всякий раз, когда человек отложил клавиатуру и
   * читает показ, уводя его колесом, любая перерисовка возвращала бы прокрутку под каретку.
   *
   * ДВИГАЕМ ТОЛЬКО КОГДА БЛОК НЕ ВИДЕН ЦЕЛИКОМ. Подтягивать его к одному и тому же месту на
   * каждую букву значит трясти половину экрана во время набора.
   */
  const previewRef = useRef<HTMLDivElement>(null);

  /* ── И ОБРАТНО: ПОКАЗ ВЕДЁТ ПОЛЕ ─────────────────────────────────────────────────────────
   *
   * Просьба владельца дословно: «если скроллишь превьюшку, надо, чтобы и маркдаун скроллился;
   * и если где-то нажимаешь на превью, надо, чтобы курсор тоже туда — только в эдиторе».
   *
   * СЧЁТ ТОТ ЖЕ — ПО СТРОКЕ ИСХОДНИКА, только в другую сторону: верхний блок показа помечен
   * строкой, с которой начался, а где эта строка стоит в поле, отвечает зеркало (`measureLines`).
   *
   * ВНУТРИ БЛОКА — ДОЛЯ. Блок занимает строки [L, L′), и та доля, на которую он ушёл за верхнюю
   * кромку показа, переносится на его же строки в поле. Так прокрутка идёт плавно, а не
   * скачками от блока к блоку, и длинный абзац не «залипает» на одном месте.
   *
   * КАКОЙ `scroll` — ЖЕСТ. У показа он приходит и без человека: подводка под каретку ниже
   * прокручивает показ программно, а перерисовка (абзац вставлен, снимок доехал) меняет его
   * высоту — и браузер подрезает прокрутку или держит якорь. Тащить за таким `scroll` поле
   * значило бы двигать текст под кареткой посреди набора: вставил абзац — каретка уехала за
   * окно поля. Отличие — В ИСТОЧНИКЕ, А НЕ В УСТРОЙСТВЕ ВВОДА: программная подводка помечает
   * себя сама, а перерисовка всегда приходит с ИЗМЕНИВШЕЙСЯ ВЫСОТОЙ показа. Всё остальное —
   * колесо, ползунок, тач с инерцией, клавиатура — высоту не меняет и считается жестом.
   * Перечислять устройства ввода нельзя: ползунок в Safari и Firefox не шлёт показу
   * `pointerdown`, а инерция тача живёт дольше любого окна. Цена правила — первый `scroll`
   * после смены высоты пропускается; колесо и тач помечают себя ещё и напрямую, и у них этой
   * цены нет.
   *
   * ПЕТЛИ НЕТ ПО ПОСТРОЕНИЮ: поле ведёт показ только кареткой, а прокрутка поля каретку не
   * двигает. Единственный шов — щелчок по показу: он ставит каретку, и подводка под неё могла
   * бы дёрнуть показ из-под указателя (блок частично за кромкой); поэтому подводка знает, что
   * каретку поставил показ, и пропускает этот раз (`fromPane`).
   */
  const paneScrollByCode = useRef(false);
  const paneHeight = useRef(0);
  const wheelAt = useRef(0);
  const fromPane = useRef(0);
  const mirror = useRef<{ text: string; width: number; map: LineMap } | null>(null);
  /** Какой исходник сейчас НАРИСОВАН: показ отстаёт от поля на кадр (`useDeferredValue`), и
   * строки его блоков — строки этого текста, а не того, что уже в поле. */
  const rendered = useRef('');
  useLayoutEffect(() => {
    rendered.current = previewSource;
  }, [previewSource]);

  /** Программная прокрутка показа помечает свой `scroll`, и обратная подводка его пропускает. */
  const scrollPane = useCallback((pane: HTMLElement, to: number) => {
    const before = pane.scrollTop;
    pane.scrollTop = to;
    if (pane.scrollTop !== before) paneScrollByCode.current = true;
  }, []);

  const lines = useCallback((area: HTMLTextAreaElement): LineMap => {
    const c = mirror.current;
    if (c && c.text === area.value && c.width === area.clientWidth) return c.map;
    const map = measureLines(area);
    mirror.current = { text: area.value, width: area.clientWidth, map };
    return map;
  }, []);

  useEffect(() => {
    const pane = previewRef.current;
    if (!pane) return;
    const mark = () => {
      wheelAt.current = performance.now();
    };
    pane.addEventListener('wheel', mark, { passive: true });
    pane.addEventListener('touchmove', mark, { passive: true });
    // Шрифт мог доехать ПОСЛЕ первого замера: с ним переносы другие, и карта строк врёт.
    void document.fonts?.ready.then(() => {
      mirror.current = null;
    });
    return () => {
      pane.removeEventListener('wheel', mark);
      pane.removeEventListener('touchmove', mark);
    };
  }, []);

  const followPane = useCallback(() => {
    const area = areaRef.current;
    const pane = previewRef.current;
    if (!area || !pane) return;
    if (paneScrollByCode.current) {
      paneScrollByCode.current = false;
      return;
    }
    const height = pane.scrollHeight;
    const relayout = height !== paneHeight.current;
    paneHeight.current = height;
    if (relayout && performance.now() - wheelAt.current > GESTURE_MS) return;
    // Показ ещё не перерисован под текст поля — его строки про другой текст. Следующий `scroll`
    // придёт уже к свежему.
    if (rendered.current !== area.value) return;
    const blocks = Array.from(pane.querySelectorAll<HTMLElement>('[data-md-line]'));
    if (!blocks.length) return;
    const room = pane.scrollHeight - pane.clientHeight;
    if (room > 0 && pane.scrollTop >= room - 1) {
      // Докручено до конца — и поле в конец: последний блок мог начаться выше кромки, и доля
      // дала бы «почти конец» с хвостом текста за окном поля.
      area.scrollTop = area.scrollHeight;
      return;
    }
    const box = pane.getBoundingClientRect();
    // Верхний блок, ещё не ушедший целиком за кромку, — двоичным поиском: блоки идут по
    // порядку текста, и «низ ниже кромки» монотонен. Линейный обход на заметке в тысячу блоков
    // читал бы тысячу коробок на каждый кадр прокрутки.
    let lo = 0;
    let hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].getBoundingClientRect().bottom > box.top) hi = mid;
      else lo = mid + 1;
    }
    const i = lo;
    const r = blocks[i].getBoundingClientRect();
    const share = r.height > 0 ? Math.max(0, Math.min(1, (box.top - r.top) / r.height)) : 0;
    const m = lines(area);
    const line = lineOf(blocks[i], m);
    const next = i + 1 < blocks.length ? lineOf(blocks[i + 1], m) : m.tops.length;
    const from = m.tops[line];
    const to = next < m.tops.length ? m.tops[next] : m.bottom;
    area.scrollTop = from - m.tops[0] + share * (to - from);
  }, [lines]);

  const caretFromPane = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const area = areaRef.current;
      const pane = previewRef.current;
      const target = e.target as HTMLElement | null;
      // Портал: react всплывает по дереву КОМПОНЕНТОВ, и щелчок в просмотрщике снимков доходил
      // бы сюда — та же ловушка, что у двойного щелчка по описанию задачи.
      if (!area || !pane || !target || !e.currentTarget.contains(target)) return;
      // У ссылки, кнопки и снимка своё дело по щелчку; каретку ставит щелчок по тексту.
      if (target.closest('a, button, [role="button"], img, input, select, textarea')) return;
      // Человек выделяет текст показа (двойной щелчок, протяжка) — фокус не отнимаем.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && pane.contains(sel.anchorNode)) return;
      const blocks = Array.from(pane.querySelectorAll<HTMLElement>('[data-md-line]'));
      if (!blocks.length) return;
      let block = target.closest<HTMLElement>('[data-md-line]');
      if (!block) {
        // Щелчок в зазоре между блоками — к ближайшему блоку выше точки.
        block = blocks.filter((b) => b.getBoundingClientRect().top <= e.clientY).pop() ?? blocks[0];
      }
      const m = lines(area);
      const text = area.value;
      const line = lineOf(block, m);
      const i = blocks.indexOf(block);
      const nextLine = i + 1 < blocks.length ? lineOf(blocks[i + 1], m) : m.starts.length;
      const from = m.starts[line];
      const to = nextLine < m.starts.length ? m.starts[nextLine] : text.length;
      let pos = from;
      // ТОЧНЕЕ СТРОКИ БЛОКА: слово под щелчком ищется в исходнике этого же блока. Разметка
      // (`**`, `[`, `|`) стоит между словами, а не внутри них, и слово находится дословно.
      // Повторы различаются счётом: сколько раз слово встретилось в ПОКАЗЕ до точки щелчка,
      // столько его вхождений пропускается и в исходнике. Не нашлось — каретка в начало блока,
      // и это честно.
      const hit = pointHit(e.clientX, e.clientY);
      if (hit && hit.node.nodeType === Node.TEXT_NODE && block.contains(hit.node)) {
        const run = (hit.node as Text).data;
        const at0 = Math.min(hit.offset, run.length);
        let ws = at0;
        let we = at0;
        while (ws > 0 && !/\s/.test(run[ws - 1])) ws -= 1;
        while (we < run.length && !/\s/.test(run[we])) we += 1;
        const word = run.slice(ws, we);
        if (word) {
          let skip = occurrences(renderedBefore(block, hit.node) + run.slice(0, ws), word);
          let at = text.indexOf(word, from);
          while (at >= 0 && skip > 0) {
            at = text.indexOf(word, at + word.length);
            skip -= 1;
          }
          if (at >= 0 && at + word.length <= to) pos = at + (at0 - ws);
        }
      }
      let caretLine = line;
      for (let k = from; k < pos; k += 1) if (text.charCodeAt(k) === 10) caretLine += 1;
      fromPane.current = performance.now();
      area.focus({ preventScroll: true });
      area.setSelectionRange(pos, pos);
      // Строку каретки — в окно поля, если её там нет; не к кромке: под ней нужно видеть текст.
      const top = m.tops[caretLine] - m.tops[0];
      const bottom = (caretLine + 1 < m.tops.length ? m.tops[caretLine + 1] : m.bottom) - m.tops[0];
      if (top < area.scrollTop || bottom > area.scrollTop + area.clientHeight) {
        area.scrollTop = Math.max(0, top - area.clientHeight / 4);
      }
    },
    [lines],
  );

  const syncPreview = useCallback(() => {
    const area = areaRef.current;
    const pane = previewRef.current;
    if (!area || !pane) return;
    if (document.activeElement !== area) return;
    // Каретку только что поставил щелчок по показу — показ и так на месте, а подводка дёрнула
    // бы его из-под указателя (см. `fromPane`).
    if (performance.now() - fromPane.current < FROM_PANE_MS) return;
    const room = pane.scrollHeight - pane.clientHeight;
    if (room <= 0) return;

    const caret = area.selectionStart ?? 0;
    let line = 0;
    for (let i = 0; i < caret; i += 1) if (area.value.charCodeAt(i) === 10) line += 1;

    // Последний блок, начавшийся НЕ ПОЗЖЕ строки каретки: блоки идут в порядке текста, а помечены
    // строкой НАЧАЛА — каретка в середине длинного абзаца попадает в этот самый абзац.
    let target: HTMLElement | null = null;
    for (const el of Array.from(pane.querySelectorAll<HTMLElement>('[data-md-line]'))) {
      const at = Number(el.dataset.mdLine);
      if (!Number.isFinite(at) || at > line) break;
      target = el;
    }
    if (!target) {
      scrollPane(pane, 0);
      return;
    }

    const box = pane.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.top >= box.top + EDGE && r.bottom <= box.bottom - EDGE) return;
    // Блок встаёт НЕ у самой кромки: под ним нужно видеть, что идёт дальше, иначе показ выглядит
    // обрезанным ровно на том месте, ради которого он и подъехал.
    const top = r.top - box.top + pane.scrollTop;
    scrollPane(pane, Math.max(0, Math.min(room, top - pane.clientHeight / 4)));
  }, [scrollPane]);

  /*
   * СИГНАЛ ОДИН НА ВСЕ ТРИ СПОСОБА ДВИНУТЬ КАРЕТКУ — мышь, стрелки и сам набор.
   *
   * Слушатель вешается И НА ДОКУМЕНТ, И НА ПОЛЕ: chromium сообщает о движении каретки внутри
   * поля документу, firefox — самому полю. Обработчик тот же самый, и сработать дважды ему не
   * вредно: подводка идемпотентна (виден блок — она ничего не делает).
   *
   * Отдельного повода «текст изменился» здесь НЕТ намеренно. Подмена значения поля — хоть
   * набором, хоть пропом (принятое предложение помощника, восстановленный черновик) — сама
   * двигает каретку, и браузер сообщает об этом тем же событием; замерено, что подписка на показ
   * поверх этой ничего не добавляет, а лишний сторож у неотличимого случая — это код, который
   * никакая проба не удержит.
   */
  useEffect(() => {
    const area = areaRef.current;
    const onSelect = () => syncPreview();
    document.addEventListener('selectionchange', onSelect);
    area?.addEventListener('selectionchange', onSelect);
    return () => {
      document.removeEventListener('selectionchange', onSelect);
      area?.removeEventListener('selectionchange', onSelect);
    };
  }, [syncPreview]);

  return (
    <>
      <Toolbar>
        <label className='flex items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            name
          </Text>
          <Input
            name='noteName'
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
            className='w-[280px]'
          />
        </label>

        <Button
          size='sm'
          variant='secondary'
          onClick={() => assistant.run(buildRequest())}
          disabled={working || !value.trim()}
        >
          {working ? 'the assistant is reading…' : 'bring to markdown'}
        </Button>

        <ToolbarSpacer />

        {dirty ? (
          <Pill tone='attention'>not saved</Pill>
        ) : (
          <Pill tone='ok'>{savedLabel ? `saved at ${savedLabel}` : 'saved'}</Pill>
        )}
        <Button size='sm' variant='secondary' onClick={onLeaveEdit}>
          finish editing
        </Button>
        <Button size='sm' variant='main' onClick={onSave} disabled={!canSave || saving}>
          {saving ? 'saving…' : 'save ⌘s'}
        </Button>

        <div className='w-full'>
          <Text size='micro' variant='label'>
            ⌘e or “finish editing” — leave editing, ⌘s — save. the pane beside the text shows the
            note as it will read — pictures included — and follows the line you are editing. a note
            is the same kind of library file: topics, owners, access and the discussion live in its
            card.
            {sizeHint ? ` ${sizeHint}` : ''}
          </Text>
        </div>
      </Toolbar>

      {banners}

      <AiPanel
        state={assistant.state}
        stale={
          assistant.state.kind === 'ready' && !assistant.state.suggestion.range
            ? value !== assistant.state.suggestion.before
            : false
        }
        onCancel={assistant.cancel}
        onDismiss={assistant.dismiss}
        onAccept={applySuggestion}
        onRevert={revertSuggestion}
        onRetry={(req) => assistant.run(req)}
      />

      {/* Полоса форматирования и поле — ОДИН блок: белая заливка, внешний контур #ccc, а между
          ними волосяная линейка. Полоса своей коробкой была бы второй коробкой поверх первой,
          чего система не допускает; контур становится чернильным по фокусу внутри — тот же
          признак фокуса, что у любого поля админки. Во всю ширину вьюпорта, как и чтение:
          вариант md=v3 выбран целиком. */}
      <div className='border border-borderColor bg-bgColor focus-within:border-textColor'>
        <FormatBar areaRef={areaRef} value={value} onChange={onChange} />
        {/* ТЕКСТ И ТО, ВО ЧТО ОН ПРЕВРАЩАЕТСЯ, — РЯДОМ, А НЕ ПО ОЧЕРЕДИ.
            Разметка заметки существует ради картинок: снимок ткани, страница договора, чертёж.
            Пока они видны только в чтении, правка идёт вслепую — вставил `![…](/files/12)` и
            узнал, тот ли это файл, только выйдя из редактора и вернувшись обратно.

            ДВЕ КОЛОНКИ ТОЛЬКО НА ШИРОКОМ ЭКРАНЕ: на узком показ встаёт ПОД полем, потому что
            половина от узкой ширины — это уже не поле для письма. Колонки разделяет волосяная
            линейка — внутренняя линейка блока, а не вторая коробка внутри первой. */}
        <div className='grid lg:grid-cols-2'>
          <textarea
            ref={areaRef}
            name='noteContent'
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            className='block min-h-[60vh] w-full min-w-0 resize-y appearance-none rounded-none border-0 bg-bgColor px-3 py-2.5 text-textBaseSize leading-relaxed focus:outline-none lg:border-r lg:border-hairline'
          />
          {/* ВЫСОТА ПОКАЗА — ОТ ПОЛЯ, А НЕ ОТ СОДЕРЖИМОГО. Поле тянется мышью (`resize-y`), и
              показ, растущий вместе с длиной заметки, растянул бы общий блок на десять экранов.
              На широком экране он абсолютом занимает ровно высоту строки сетки и прокручивается
              сам; на узком у него свой потолок. */}
          <div className='relative min-w-0 border-t border-hairline lg:border-t-0'>
            <div
              ref={previewRef}
              onScroll={followPane}
              onClick={caretFromPane}
              className='max-h-[50vh] cursor-text overflow-y-auto px-3 py-2.5 lg:absolute lg:inset-0 lg:max-h-none'
            >
              {previewSource.trim() ? (
                // Граница ⌘A в правке вне поля (`note-page.tsx`): выделяется показ, а не страница.
                <div data-note-document=''>
                  <MarkdownView source={previewSource} />
                </div>
              ) : (
                <Text size='micro' variant='label'>
                  what you write will show up here
                </Text>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
