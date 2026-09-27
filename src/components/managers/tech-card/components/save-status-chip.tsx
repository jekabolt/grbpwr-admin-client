import { useRef, useState } from 'react';
import type { AutosaveStatus } from './design/autosave-contract';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { sameText, TEXT_SECTION_LABEL, type HistoryEntry, type TextSnapshot } from './save-history';
import type { FormErrorRow } from './stage-progress';
import type { MachineState } from './useTechCardAutosave';
import type { StagedChange } from './useTechCardStaging';

/**
 * ═══ СТАТУС СОХРАНЕНИЯ — ЧИП, КОТОРЫЙ НИКОГДА НЕ СОХРАНЯЕТ (волна 25.09 · T21 → 27.09 · O-60, D-59) ═══
 *
 * Кнопки «save» у сохранённой карточки нет: каждое действие уже ведёт к записи (useTechCardAutosave),
 * и чип говорит только, ГДЕ сейчас правки. Сам он не пишет ни в одном состоянии — ни щелчком, ни
 * раскрытием. Состояния:
 *   saved 18:42                    — серый, всё на сервере;
 *   unsaved / saving…              — синий: в полёте (дебаунс, запись);
 *   unsaved · 2 errors             — красный: форма не проходит проверку, и ничего не пишется;
 *   not saved · retrying           — красный: запись падает, автосейв повторяет её сам (5 / 15 / 45 с,
 *                                    потом каждые 30 с) и со следующей правкой — двери «retry» нет.
 *                                    Или ни одна запись не падала, а панель менялась, пока писалась
 *                                    (потолок `restaged`): поповер говорит именно это (O-60 r4).
 *   not saved                      — красный: сервер ОТКАЗАЛ самому телу (4xx, D-66). Повторов по
 *                                    таймеру нет — та же запись получила бы тот же отказ; она уходит
 *                                    снова со следующей правкой. Поповер — слова сервера как есть.
 * У этих состояний ОДНА дверь: щелчок по всему чипу раскрывает поповер — что ждёт записи, причина,
 * ИСТОРИЯ (откат текста к любому из последних сохранений). При `invalid` раскрытие — жест «покажи»:
 * ошибки тихой проверки выходят на поля (M-02), а ПЕРВАЯ строка поповера ведёт к первому полю
 * (→ вкладка) тем же путём, что строка предупреждений.
 *
 * Два состояния — не запись, а РЕШЕНИЕ человека, и слово чипа ведёт прямо к нему:
 *   unsaved · confirm the switch › — синий: смена purpose на auxiliary дошла до записи неподтверждённой
 *                                    (восстановленный черновик, подтверждение, которое не смогло
 *                                    записать карточку). Сама смена подтверждается в момент жеста, в
 *                                    диалоге перевода; здесь — страховка, и щелчок открывает ДИАЛОГ;
 *   conflict                       — красный: щелчок снова открывает модалку конфликта.
 * У этих двух `▾` рядом остаётся дверью того же поповера.
 *
 * ⌘S — невидимый явный flush: подсказки о нём здесь нет, органа на экране тоже.
 * Цвет никогда не несёт состояние один: у каждого тона своё слово (DESIGN.md, Monochrome Rule).
 */

type Tone = 'mut' | 'attention' | 'warn';
/** Why an `error` stands: a failed write, the `restaged` cap (O-60 r4) or a server refusal (D-66). */
type SaveCause = MachineState['cause'];

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

export function formatSavedAt(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? time
    : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase()} ${time}`;
}

function describe(
  status: AutosaveStatus,
  lastSavedAt: number | undefined,
  errorsCount: number | undefined,
  cause?: SaveCause,
): { label: string; tone: Tone } {
  switch (status) {
    case 'saving':
      return { label: 'saving…', tone: 'attention' };
    case 'dirty':
      return { label: 'unsaved', tone: 'attention' };
    case 'invalid': {
      const n = errorsCount ?? 0;
      return {
        label: n > 0 ? `unsaved · ${n} error${n === 1 ? '' : 's'}` : 'unsaved · check fields',
        tone: 'warn',
      };
    }
    case 'needs-confirm':
      return { label: 'unsaved · confirm the switch ›', tone: 'attention' };
    case 'conflict':
      return { label: 'conflict', tone: 'warn' };
    case 'error':
      // D-66: a refusal is not retried on a timer — «retrying» over it would be a promise nobody keeps.
      return { label: cause === 'refused' ? 'not saved' : 'not saved · retrying', tone: 'warn' };
    case 'saved':
    case 'idle':
    default:
      return { label: lastSavedAt ? `saved ${formatSavedAt(lastSavedAt)}` : 'saved', tone: 'mut' };
  }
}

/** One sentence for the popover head: the chip is four words, this is where the reason fits. */
function sentence(
  status: AutosaveStatus,
  message: string | undefined,
  errorsCount?: number,
  cause?: SaveCause,
) {
  switch (status) {
    case 'saving':
      return 'saving to the server…';
    case 'dirty':
      return 'changes are saved 2 seconds after you stop typing';
    case 'invalid':
      return errorsCount
        ? `${errorsCount} field${errorsCount === 1 ? ' does' : 's do'} not validate; nothing is saved until ${errorsCount === 1 ? 'it does' : 'they do'}`
        : 'a field does not validate; nothing is saved until it does';
    case 'needs-confirm':
      return 'everything else is saved; switching to auxiliary waits for your confirmation';
    case 'conflict':
      return message || 'someone saved this card meanwhile; autosave waits for your decision';
    case 'error':
      // O-60 r4: at the `restaged` cap no write failed — every one landed, and a panel kept moving.
      if (cause === 'restaged')
        return 'the card kept changing while it was being saved — it retries on its own';
      // D-66: the server's own sentence, as it is — it names the way out itself.
      if (cause === 'refused')
        return (
          message || 'the server refused the last save — it goes out again with your next change'
        );
      return message
        ? `the last save failed: ${message}; the card keeps retrying on its own`
        : 'the last save failed; the card keeps retrying on its own';
    default:
      return 'every change is saved on its own';
  }
}

export function SaveStatusChip({
  status,
  lastSavedAt,
  errorsCount,
  message,
  cause,
  bodyDirty,
  staged,
  history,
  currentText,
  canRestore,
  firstError,
  onRevealError,
  onOpenDetails,
  onConfirmSwitch,
  onOpenConflict,
  onRestore,
}: {
  status: AutosaveStatus;
  lastSavedAt?: number;
  errorsCount?: number;
  message?: string;
  /**
   * `error`: a failed write, the `restaged` cap (every write landed, a panel kept moving), or a server
   * refusal of the body (D-66: no timer, the next change sends it again).
   */
  cause?: SaveCause;
  bodyDirty: boolean;
  staged: StagedChange[];
  history: HistoryEntry[];
  currentText: TextSnapshot;
  canRestore: boolean;
  /** `invalid`: the first field that holds the write — the popover's first line walks to it. */
  firstError?: FormErrorRow;
  /** The walk to a field: its tab, focus, pulse — the one the warnings organ takes. */
  onRevealError: (path: string) => void;
  /** The popover opened: the operator is looking — publish what the quiet check found (M-02). */
  onOpenDetails?: () => void;
  /** `needs-confirm`: open the purpose-switch dialog. A dialog, never a write (D-59). */
  onConfirmSwitch: () => void;
  onOpenConflict: () => void;
  onRestore: (entry: HistoryEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  // The walk closes the popover and moves focus to the field; the popover must not take it back.
  const walking = useRef(false);
  if (status === 'off') return null;
  const { label, tone } = describe(status, lastSavedAt, errorsCount, cause);

  // A DECISION, never a save: the word itself leads to it. In every other state the whole chip is the
  // popover's door, and nothing in it writes.
  const decision =
    status === 'needs-confirm'
      ? { run: onConfirmSwitch, title: 'confirm the switch to auxiliary' }
      : status === 'conflict'
        ? { run: onOpenConflict, title: 'someone saved this card meanwhile: decide what to keep' }
        : null;
  const walk = status === 'invalid' ? firstError : undefined;

  const pendingCount = staged.length + (bodyDirty ? 1 : 0);
  const rows = [...history].reverse();

  return (
    <div className='inline-flex items-stretch' data-save-status={status}>
      {decision && (
        <button
          type='button'
          onClick={decision.run}
          title={decision.title}
          className={`flex items-stretch ${FOCUS}`}
        >
          <Pill tone={tone} className='cursor-pointer hover:bg-bgZebra'>
            {label}
          </Pill>
        </button>
      )}
      <GenericPopover
        title='saving'
        className='w-[300px]'
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) onOpenDetails?.();
        }}
        contentProps={{
          onCloseAutoFocus: (e) => {
            if (!walking.current) return;
            walking.current = false;
            e.preventDefault();
          },
        }}
        triggerProps={{
          className: `flex items-stretch ${decision ? '-ml-px' : ''} ${FOCUS}`,
          'aria-label': decision ? 'saving details and history' : `${label}, details and history`,
        }}
        openElement={
          <Pill tone={tone} className='cursor-pointer gap-1.5 hover:bg-bgZebra'>
            {!decision && <span>{label}</span>}
            <span aria-hidden>▾</span>
          </Pill>
        }
      >
        <div className='flex flex-col gap-2 py-0.5'>
          {walk && (
            <button
              type='button'
              data-save-first-error={walk.path}
              onClick={() => {
                walking.current = true;
                setOpen(false);
                onRevealError(walk.path);
              }}
              className={`flex w-full items-baseline gap-2 border-b border-hairline pb-1 text-left hover:bg-bgZebra ${FOCUS}`}
            >
              <span className='flex min-w-0 flex-1 flex-col'>
                <Text size='micro' component='span' className='truncate'>
                  {walk.path}
                </Text>
                <Text size='micro' variant='label' component='span'>
                  {walk.message || 'invalid'}
                </Text>
              </span>
              <Text size='micro' variant='label' component='span' className='shrink-0 underline'>
                → {walk.tab}
              </Text>
            </button>
          )}
          <Text size='micro' variant='label' component='p'>
            {sentence(status, message, errorsCount, cause)}
          </Text>

          {pendingCount > 0 && (
            <div>
              <GroupLabel flush>waiting to save</GroupLabel>
              {bodyDirty && (
                <div className='flex items-baseline justify-between gap-3 border-b border-hairline py-1 last:border-b-0'>
                  <Text size='micro'>card (header &amp; tabs)</Text>
                  <Text size='nano' variant='label' className='uppercase'>
                    form
                  </Text>
                </div>
              )}
              {staged.map((c) => (
                <div
                  key={c.key}
                  className='flex items-baseline justify-between gap-3 border-b border-hairline py-1 last:border-b-0'
                >
                  <Text size='micro'>{c.label}</Text>
                  <Text size='nano' variant='label' className='uppercase'>
                    staged
                  </Text>
                </div>
              ))}
            </div>
          )}

          <div>
            <GroupLabel flush>history</GroupLabel>
            {rows.length === 0 ? (
              <Text size='micro' variant='label' component='p' className='py-1'>
                nothing saved yet in this browser
              </Text>
            ) : (
              <ol className='flex flex-col'>
                {rows.map((e) => {
                  const current = sameText(e.values, currentText);
                  const what =
                    e.kind === 'opened'
                      ? 'as opened'
                      : e.sections.map((s) => TEXT_SECTION_LABEL[s]).join(', ') || 'saved';
                  return (
                    <li
                      key={`${e.at}-${e.lockVersion}`}
                      className='flex items-baseline gap-2 border-b border-hairline py-1 last:border-b-0'
                    >
                      <Text size='micro' className='shrink-0'>
                        {formatSavedAt(e.at)}
                      </Text>
                      <Text size='micro' variant='label' className='min-w-0 flex-1 truncate'>
                        {what}
                      </Text>
                      {current ? (
                        <Text size='nano' variant='label' className='shrink-0 uppercase'>
                          current
                        </Text>
                      ) : (
                        <Button
                          type='button'
                          variant='underline'
                          size='xs'
                          className='shrink-0'
                          disabled={!canRestore}
                          onClick={() => onRestore(e)}
                        >
                          restore
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <Text size='micro' variant='label' component='p' className='pt-1'>
              text sections only; panels with their own RPC are not covered
            </Text>
          </div>
        </div>
      </GenericPopover>
    </div>
  );
}
