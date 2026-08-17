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
 * макете: пока не нажал, непонятно, что текст вообще правится, — поэтому кнопка «править ⌘E»
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

export interface NoteEditorHandle {
  focus: () => void;
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
  /** «сохранено в 13:40» — время последней удачной записи; пусто, если её ещё не было. */
  savedLabel: string;
  canSave: boolean;
  onSave: () => void;
  onLeaveEdit: () => void;
  /** Слова про потолок содержимого, когда он близко или превышен. */
  sizeHint?: string;
  /** Баннеры страницы (черновик, конфликт, различия) — между полосой и полем, а не поверх
   * текста: конфликт обязан стоять там, где на него смотрят, прежде чем нажать «сохранить». */
  banners?: React.ReactNode;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const { showMessage } = useSnackBarStore();
  const assistant = useNoteAssistant();

  const assistantOpen = assistant.state.kind !== 'idle';
  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => areaRef.current?.focus(),
      consumeEscape: () => {
        if (!assistantOpen) return false;
        assistant.dismiss();
        return true;
      },
    }),
    [assistant, assistantOpen],
  );

  /** Что уходит помощнику: выделение, если оно есть, иначе вся заметка. Это и есть тот
   * «выделите кусок», который предлагает состояние `toolong`. */
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
      if (!s.range) {
        // Пока помощник работал, человек мог дописывать — и предложение построено по ПРОШЛОЙ
        // версии буфера. Принять его тогда значит стереть эти дописанные строки, причём молча:
        // в колонке «как сейчас» их нет, и заметить пропажу не по чему. Отказ обратим, потеря —
        // нет, поэтому здесь отказ.
        if (value !== s.before) {
          showMessage(
            'текст изменился, пока помощник работал — предложение построено по прошлой версии, попросите ещё раз',
            'error',
          );
          return;
        }
        onChange(s.after);
      } else {
        // Буфер мог измениться, пока помощник работал. Вставлять по старым границам вслепую
        // нельзя: это разрезало бы текст посередине слова и выглядело бы как порча файла.
        const { start, end } = s.range;
        if (value.slice(start, end) === s.before) {
          onChange(value.slice(0, start) + s.after + value.slice(end));
        } else {
          const at = value.indexOf(s.before);
          if (at >= 0 && value.indexOf(s.before, at + 1) === -1) {
            onChange(value.slice(0, at) + s.after + value.slice(at + s.before.length));
          } else {
            showMessage('текст изменился, пока помощник работал — вставлять некуда', 'error');
            return;
          }
        }
      }
      assistant.dismiss();
      if (edit) areaRef.current?.focus();
    },
    [assistant, onChange, showMessage, value],
  );

  const working = assistant.state.kind === 'working';

  return (
    <>
      <Toolbar>
        <label className='flex items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            имя
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
          {working ? 'помощник читает…' : 'привести к markdown'}
        </Button>

        <ToolbarSpacer />

        {dirty ? (
          <Pill tone='attention'>не сохранено</Pill>
        ) : (
          <Pill tone='ok'>{savedLabel ? `сохранено в ${savedLabel}` : 'сохранено'}</Pill>
        )}
        <Button size='sm' variant='secondary' onClick={onLeaveEdit}>
          закончить правку
        </Button>
        <Button size='sm' variant='main' onClick={onSave} disabled={!canSave || saving}>
          {saving ? 'сохраняем…' : 'сохранить ⌘s'}
        </Button>

        <div className='w-full'>
          <Text size='micro' variant='label'>
            esc — выйти из правки, ⌘s — сохранить. заметка — такой же файл библиотеки: темы,
            владельцы, доступ и обсуждение живут в её карточке.
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
