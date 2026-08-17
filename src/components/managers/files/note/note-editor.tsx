import { useCallback, useImperativeHandle, useRef, type RefObject } from 'react';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { AiPanel, useNoteAssistant, type AiRequest, type AiSuggestion } from './ai-panel';
import { FormatBar } from './format-bar';

/**
 * Правка заметки: полоса действий, поле во всю ширину и блок помощника.
 *
 * Правка — НЕ состояние по умолчанию (вариант md=v3): заметку в девяти случаях из десяти
 * открывают почитать, поэтому редактор появляется по ⌘E и уходит по Esc. Цена названа в самом
 * макете: пока не нажал, непонятно, что текст вообще правится, — поэтому кнопка «edit ⌘E»
 * стоит в шапке чтения, а не прячется в меню.
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
            esc — leave editing, ⌘s — save. a note is the same kind of library file: topics, owners,
            access and the discussion live in its card.
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
        <textarea
          ref={areaRef}
          name='noteContent'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
          className='block min-h-[60vh] w-full resize-y appearance-none rounded-none border-0 bg-bgColor px-3 py-2.5 text-textBaseSize leading-relaxed focus:outline-none'
        />
      </div>
    </>
  );
}
