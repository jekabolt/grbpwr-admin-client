import {
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
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

  const syncPreview = useCallback(() => {
    const area = areaRef.current;
    const pane = previewRef.current;
    if (!area || !pane) return;
    if (document.activeElement !== area) return;
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
      pane.scrollTop = 0;
      return;
    }

    const box = pane.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.top >= box.top + EDGE && r.bottom <= box.bottom - EDGE) return;
    // Блок встаёт НЕ у самой кромки: под ним нужно видеть, что идёт дальше, иначе показ выглядит
    // обрезанным ровно на том месте, ради которого он и подъехал.
    const top = r.top - box.top + pane.scrollTop;
    pane.scrollTop = Math.max(0, Math.min(room, top - pane.clientHeight / 4));
  }, []);

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
              className='max-h-[50vh] overflow-y-auto px-3 py-2.5 lg:absolute lg:inset-0 lg:max-h-none'
            >
              {previewSource.trim() ? (
                <MarkdownView source={previewSource} />
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
