import { useEffect, useRef, useState, type JSX } from 'react';

import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { EnhanceRefusal, enhanceText } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';
import Textarea from 'ui/components/text-area';

import { ideasFor, insertIdea } from '../ideas';
import { recentTextKey, useRecentText } from '../recent';

/**
 * ═══ A PLAYGROUND PROMPT — ONE BOX, THREE QUIET DOORS UNDER THE TEXT (C-02, owner ref 1.png) ═════
 *
 * The owner pointed at one reference for every prompt of the tab: the text, and under it
 * `Ideas` · `Improve` on the left and `Recently used ⌄` on the right. The LAYOUT is taken from it;
 * the LOOK is the admin's (DESIGN.md): a white, square box with a 1px edge that turns ink while the
 * text has focus, the three doors as the system's small secondary buttons inside the box's own
 * footer, so text and doors read as one input rather than a field with a toolbar parked under it.
 *
 *  · IDEAS ▾ — a short fixed list per workflow and field (`../ideas.ts`); a pick is INSERTED AT THE
 *    CARET (`setRangeText`), joined to what is there with `, `, and the caret lands after it so
 *    typing continues. No Ideas list for this field → no door (never an empty menu).
 *  · IMPROVE — `enhanceText` in mode `improve`, field `other`, `hint` as context. Locked while the
 *    text is blank (the RPC refuses blank text) and while a request is out. The answer REPLACES the
 *    text only if the text is still the one that was sent; a text edited meanwhile is left alone.
 *  · RECENTLY USED ▾ — the texts this field was generated with (`../recent.ts`), newest first; a
 *    pick replaces the text. The field only reads the list; the panel remembers on submit.
 *
 * ONE UNDO FOR BOTH REPLACEMENTS. Improve and a recent pick both swap the whole text, so for ten
 * seconds `undo ↶` stands in the footer and puts the previous text back; typing over the new text
 * retires it (the undo would otherwise erase the typing). Same window and chip as `AiEnhance`.
 */

const UNDO_WINDOW_MS = 10_000;
/** The counter appears once the text has used this share of `maxLength`. */
const COUNTER_FROM = 0.8;

export type PromptFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** Accessible name of the text box (the section title usually). */
  label: string;
  placeholder?: string;
  /** Grid key of the workflow (`change_color`) — keys Ideas and Recently used. */
  workflowKey: string;
  /** Registry key of this prompt inside the workflow (`garment`) — keys Ideas and Recently used. */
  fieldKey: string;
  /** Context for Improve: what this text is for («the garment to recolour in a photo»). */
  hint?: string;
  /** Hard cap on the text; the counter shows near it. Default 2000. */
  maxLength?: number;
  disabled?: boolean;
};

type Replaced = { before: string; after: string };

const MENU_ROW =
  'w-full px-2.5 py-2 text-left text-textBaseSize hover:bg-bgSecondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';

export function PromptField({
  value,
  onChange,
  label,
  placeholder,
  workflowKey,
  fieldKey,
  hint,
  maxLength = 2000,
  disabled,
}: PromptFieldProps): JSX.Element {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const { showMessage } = useSnackBarStore();
  const ideas = ideasFor(workflowKey, fieldKey);
  const recent = useRecentText(recentTextKey(workflowKey, fieldKey));

  const [ideasOpen, setIdeasOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<Replaced | null>(null);
  const undoTimer = useRef<number | null>(null);
  /** The newest props, for the answer that lands after an await. */
  const latest = useRef({ value, disabled });
  latest.current = { value, disabled };
  /**
   * Where the caret goes once the menu that made a pick has closed. Radix returns focus to the
   * trigger on close; after a pick the person means to keep writing, so the close hands focus to
   * the text instead, caret after what arrived. `null` = the menu closed without a pick (Escape,
   * click outside): focus goes back to the trigger as usual.
   */
  const caretAfterClose = useRef<number | null>(null);
  const onCloseAutoFocus = (e: Event) => {
    const caret = caretAfterClose.current;
    caretAfterClose.current = null;
    const node = box.current;
    if (caret === null || !node) return;
    e.preventDefault();
    node.focus();
    node.setSelectionRange(caret, caret);
  };
  /** Bumped on unmount and on every new request: an older answer finds itself stale. */
  const ticket = useRef(0);

  const clearUndoTimer = () => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
  };

  // Typing over the replacement retires the undo: putting the old text back now would erase it.
  useEffect(() => {
    if (prev && value !== prev.after) {
      setPrev(null);
      clearUndoTimer();
    }
  }, [value, prev]);

  useEffect(
    () => () => {
      ticket.current += 1;
      clearUndoTimer();
    },
    [],
  );

  const replaceWith = (after: string) => {
    const before = latest.current.value;
    const next = after.slice(0, maxLength);
    if (next === before) return;
    onChange(next);
    clearUndoTimer();
    if (before.trim()) {
      setPrev({ before, after: next });
      undoTimer.current = window.setTimeout(() => setPrev(null), UNDO_WINDOW_MS);
    } else {
      setPrev(null);
    }
  };

  const undo = () => {
    if (!prev || disabled) return;
    onChange(prev.before);
    setPrev(null);
    clearUndoTimer();
    box.current?.focus();
  };

  const insert = (idea: string) => {
    setIdeasOpen(false);
    const el = box.current;
    if (disabled) return;
    const current = latest.current.value;
    // The caret survives the blur the menu caused (selection is kept on a blurred textarea); with no
    // element yet, the idea goes at the end.
    const start = el ? el.selectionStart ?? current.length : current.length;
    const end = el ? el.selectionEnd ?? start : start;
    const { text, caret } = insertIdea(current, idea, start, end);
    if (text.length > maxLength) {
      showMessage(`no room for that idea: the text is capped at ${maxLength} characters`, 'error');
      return;
    }
    onChange(text);
    caretAfterClose.current = caret;
  };

  const improve = async () => {
    const before = value;
    if (!before.trim() || busy || disabled) return;
    const mine = ++ticket.current;
    setBusy(true);
    try {
      const after = (
        await enhanceText({
          text: before,
          mode: 'improve',
          field: 'other',
          context: hint,
          maxRunes: maxLength,
        })
      ).trim();
      if (ticket.current !== mine) return;
      const now = latest.current;
      if (now.disabled || now.value !== before) {
        showMessage(
          now.disabled ? 'not applied: the field is locked' : 'not applied: the text changed',
          'success',
        );
        return;
      }
      if (!after) {
        showMessage('the model returned nothing, the text is unchanged', 'error');
        return;
      }
      replaceWith(after);
    } catch (e) {
      if (ticket.current !== mine) return;
      const reason = e instanceof EnhanceRefusal ? e.reason : 'OTHER';
      showMessage(
        reason === 'AI_NOT_CONFIGURED'
          ? 'AI is off on this server'
          : reason === 'AI_MODEL_UNAVAILABLE'
            ? 'the AI model is unavailable right now'
            : `could not improve: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      );
    } finally {
      if (ticket.current === mine) setBusy(false);
    }
  };

  const pickRecent = (text: string) => {
    setRecentOpen(false);
    if (disabled) return;
    replaceWith(text);
    caretAfterClose.current = Math.min(text.length, maxLength);
  };

  const length = value.length;
  const showCounter = length >= Math.floor(maxLength * COUNTER_FROM);
  const empty = !value.trim();
  const name = `pg-${workflowKey}-${fieldKey}`;

  // The two menu doors share one trigger skin: the system's `xs` secondary button. A press does not
  // take focus from the text, so the caret the Ideas pick needs is still there.
  const triggerProps = (aria: string) => ({
    'aria-label': aria,
    disabled,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    className:
      'flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
  });
  const doorSkin = (open: boolean) =>
    cn(
      disabled && 'pointer-events-none border-textInactiveColor text-textInactiveColor',
      open && 'bg-textColor text-bgColor',
    );

  return (
    <div
      data-prompt-field={`${workflowKey}.${fieldKey}`}
      className={cn(
        'border bg-bgColor transition-colors',
        disabled ? 'border-borderColor' : 'border-borderColor focus-within:border-textColor',
      )}
    >
      <Textarea
        ref={box}
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        aria-label={label}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.currentTarget.value.slice(0, maxLength))
        }
        // The box draws the edge; the text area inside it draws none. More air than a form input:
        // this is the one place on the tab where a person writes sentences.
        className='border-0 px-2.5 pb-1 pt-2'
      />

      <div className='flex flex-wrap items-center gap-2 px-2.5 pb-2 pt-1'>
        {ideas.length > 0 && (
          <GenericPopover
            open={ideasOpen}
            onOpenChange={(o) => !disabled && setIdeasOpen(o)}
            title='ideas'
            noTail
            className='w-[300px]'
            contentProps={{ align: 'start', side: 'bottom', sideOffset: 4, onCloseAutoFocus }}
            triggerProps={triggerProps('ideas')}
            openElement={
              <Button asChild variant='secondary' size='xs' className={doorSkin(ideasOpen)}>
                <span>ideas ▾</span>
              </Button>
            }
          >
            <div role='group' aria-label='ideas' className='flex flex-col py-1'>
              {ideas.map((idea) => (
                <button key={idea} type='button' onClick={() => insert(idea)} className={MENU_ROW}>
                  {idea}
                </button>
              ))}
            </div>
          </GenericPopover>
        )}

        <Button
          variant='secondary'
          size='xs'
          disabled={disabled || empty || busy}
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          onClick={improve}
          title={
            empty
              ? 'write something first, then improve it'
              : 'fix errors and make the text clearer, same meaning'
          }
        >
          {busy ? 'improving…' : 'improve'}
        </Button>

        {prev && (
          <Chip
            onClick={undo}
            disabled={disabled}
            title='put the previous text back'
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          >
            undo ↶
          </Chip>
        )}

        <span className='ml-auto flex items-center gap-3'>
          {showCounter && (
            <span
              className={cn('text-micro', length >= maxLength ? 'text-error' : 'text-labelColor')}
              aria-live='polite'
            >
              {length} / {maxLength}
            </span>
          )}
          <GenericPopover
            open={recentOpen}
            onOpenChange={(o) => !disabled && setRecentOpen(o)}
            title='recently used'
            noTail
            className='w-[320px]'
            contentProps={{ align: 'end', side: 'bottom', sideOffset: 4, onCloseAutoFocus }}
            triggerProps={triggerProps('recently used')}
            openElement={
              <Button asChild variant='secondary' size='xs' className={doorSkin(recentOpen)}>
                <span>recently used ▾</span>
              </Button>
            }
          >
            {recent.items.length === 0 ? (
              <p className='px-2.5 py-2 text-micro text-labelColor'>
                Nothing yet. Texts you generate with appear here.
              </p>
            ) : (
              <div role='group' aria-label='recently used' className='flex flex-col py-1'>
                {recent.items.map((text) => (
                  <button
                    key={text}
                    type='button'
                    title={text}
                    onClick={() => pickRecent(text)}
                    className={cn(MENU_ROW, 'line-clamp-2')}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
          </GenericPopover>
        </span>
      </div>
    </div>
  );
}
