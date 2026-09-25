import type { AutosaveStatus } from './design/autosave-contract';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { sameText, TEXT_SECTION_LABEL, type HistoryEntry, type TextSnapshot } from './save-history';
import type { StagedChange } from './useTechCardStaging';

/**
 * ═══ СТАТУС СОХРАНЕНИЯ — ОДИН ЧИП ВМЕСТО «N UNSAVED CHANGES ▾» И КНОПКИ SAVE (волна 25.09 · T21) ═══
 *
 * Кнопки «save» в режиме правки больше нет: карточка сохраняется сама (useTechCardAutosave). Чип
 * говорит ОДНО слово о том, где сейчас правки, и когда человеку есть что сделать — сам становится
 * этой дверью:
 *   saved 18:42           — серый, всё на сервере;
 *   unsaved / saving…     — синий: в полёте (дебаунс, запись);
 *   unsaved · 2 errors    — красный, щелчок = явное сохранение: ошибки выходят на поля, фокус уходит
 *                           к первому (автосейв проверяет ТИХО и полям ничего не публикует, M-02);
 *   unsaved · save now    — синий, смена purpose ждёт явного сохранения с диалогом перевода;
 *   conflict              — красный, щелчок снова открывает модалку конфликта;
 *   not saved · retry     — красный, повторы исчерпаны, щелчок пробует снова.
 * `▾` рядом открывает то, что раньше открывал старый чип (что именно ждёт записи), и под ним —
 * ИСТОРИЮ: откат текста к любому из последних сохранений. Раскрытие поповера при `invalid` — тоже
 * «покажи»: ошибки выходят на поля без прыжка.
 *
 * Цвет никогда не несёт состояние один: у каждого тона своё слово (DESIGN.md, Monochrome Rule).
 */

type Tone = 'mut' | 'attention' | 'warn';

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
  retrying: boolean | undefined,
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
      return { label: 'unsaved · save now', tone: 'attention' };
    case 'conflict':
      return { label: 'conflict', tone: 'warn' };
    case 'error':
      return { label: retrying ? 'not saved · retrying' : 'not saved · retry', tone: 'warn' };
    case 'saved':
    case 'idle':
    default:
      return { label: lastSavedAt ? `saved ${formatSavedAt(lastSavedAt)}` : 'saved', tone: 'mut' };
  }
}

/** One sentence for the popover head: the chip is four words, this is where the reason fits. */
function sentence(status: AutosaveStatus, message: string | undefined, errorsCount?: number) {
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
      return message ? `the last save failed: ${message}` : 'the last save failed';
    default:
      return 'every change is saved on its own';
  }
}

export function SaveStatusChip({
  status,
  lastSavedAt,
  errorsCount,
  message,
  retrying,
  bodyDirty,
  staged,
  history,
  currentText,
  canRestore,
  onJumpToError,
  onOpenDetails,
  onSaveNow,
  onOpenConflict,
  onRestore,
}: {
  status: AutosaveStatus;
  lastSavedAt?: number;
  errorsCount?: number;
  message?: string;
  retrying?: boolean;
  bodyDirty: boolean;
  staged: StagedChange[];
  history: HistoryEntry[];
  currentText: TextSnapshot;
  canRestore: boolean;
  onJumpToError: () => void;
  /** The popover opened: the operator is looking — publish what the quiet check found (M-02). */
  onOpenDetails?: () => void;
  onSaveNow: () => void;
  onOpenConflict: () => void;
  onRestore: (entry: HistoryEntry) => void;
}) {
  if (status === 'off') return null;
  const { label, tone } = describe(status, lastSavedAt, errorsCount, retrying);

  // The chip IS the door when there is something for a human to do — and only then.
  const action =
    status === 'invalid'
      ? { run: onJumpToError, title: 'go to the first field with an error' }
      : status === 'needs-confirm'
        ? { run: onSaveNow, title: 'save now and confirm the switch to auxiliary' }
        : status === 'conflict'
          ? { run: onOpenConflict, title: 'someone saved this card meanwhile: decide what to keep' }
          : status === 'error' && !retrying
            ? { run: onSaveNow, title: 'try saving again' }
            : null;

  const pendingCount = staged.length + (bodyDirty ? 1 : 0);
  const rows = [...history].reverse();

  return (
    <div className='inline-flex items-stretch' data-save-status={status}>
      {action && (
        <button
          type='button'
          onClick={action.run}
          title={action.title}
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
        onOpenChange={(open) => {
          if (open) onOpenDetails?.();
        }}
        triggerProps={{
          className: `flex items-stretch ${action ? '-ml-px' : ''} ${FOCUS}`,
          'aria-label': action ? 'saving details and history' : `${label}, details and history`,
        }}
        openElement={
          <Pill tone={tone} className='cursor-pointer gap-1.5 hover:bg-bgZebra'>
            {!action && <span>{label}</span>}
            <span aria-hidden>▾</span>
          </Pill>
        }
      >
        <div className='flex flex-col gap-2 py-0.5'>
          <Text size='micro' variant='label' component='p'>
            {sentence(status, message, errorsCount)}
          </Text>

          {pendingCount > 0 && (
            <div>
              <GroupLabel flush>waiting to save</GroupLabel>
              {bodyDirty && (
                <div className='flex items-baseline justify-between gap-3 border-b border-hairline py-1'>
                  <Text size='micro'>card (header &amp; tabs)</Text>
                  <Text size='nano' variant='label' className='uppercase'>
                    form
                  </Text>
                </div>
              )}
              {staged.map((c) => (
                <div
                  key={c.key}
                  className='flex items-baseline justify-between gap-3 border-b border-hairline py-1'
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

          <Text size='nano' variant='label' component='p' className='uppercase'>
            ⌘S saves now
          </Text>
        </div>
      </GenericPopover>
    </div>
  );
}
