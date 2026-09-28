import { useEffect, useRef, useState, type JSX } from 'react';

import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { EnhanceRefusal, enhanceText, type EnhanceRequest } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';
import Textarea from 'ui/components/text-area';
import { extractFieldViolations, transportRefusal } from 'utils/field-errors';

import { recentMenu } from '../card-recent';
import { ideasFor, insertIdea } from '../ideas';
import {
  answeredIdeas,
  fetchServerIdeas,
  ideasContext,
  ideasMenu,
  serverIdeasOff,
  suggestRequest,
  type IdeasMenu,
  type ServerIdeasInput,
  type ServerIdeasState,
} from '../ideas-server';
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
 *    Phase 3 (C-15): where the band names the assistant (`serverIdeas`), a press also asks
 *    `SuggestPrompts` — «thinking…», then its phrases above one hairline, the fixed list below as
 *    «more». Any failure is the fixed list alone, silently (`../ideas-server.ts`). Same door.
 *  · IMPROVE — `enhanceText` in mode `steer`, field `other` (20-PROMPTS §3.8, D9): not a grammar fix
 *    but the text rewritten as a short, concrete, visual phrase for THIS field of THIS tool. The
 *    request names the pair (`workflow` = `workflowKey`, `fieldKey`) — the server takes the tool and
 *    the field from its own table by it and refuses STEER without a known pair; the context is the
 *    «Tool: … / This field: …» text the Ideas door sends (`improveContext`), as data. A server older
 *    than the mode refuses it and is asked once more in `improve`, silently — only on a proven enum
 *    skew (`steerRefused`); any other 400 is said in its own words. Locked while the text
 *    is blank (the RPC refuses blank text) and while a request is out. The answer REPLACES the text
 *    only if the text is still the one that was sent; a text edited meanwhile is left alone.
 *  · RECENTLY USED ▾ — the texts this field was generated with (`../recent.ts`), newest first; a
 *    pick replaces the text. The field only reads the list; the panel remembers on submit.
 *    Phase 3 (C-16): the card's own past texts (`cardRecent`, from the band's runs) stand above
 *    one hairline as «on this card», this browser's below as «in this browser»; an empty group is
 *    not drawn, and a text both lists hold stays in the browser's.
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
  /**
   * The tile's title («Change a Color»): the «Tool:» line of Improve's context when the band names
   * no Ideas assistant (with one, `serverIdeas.context` already carries it). Absent = the hint alone.
   */
  workflowTitle?: string;
  /** Hard cap on the text; the counter shows near it. Default 2000. */
  maxLength?: number;
  disabled?: boolean;
  /**
   * What the server's Ideas are asked with (C-15). Present ONLY where the band names the assistant's
   * model (`suggest_prompts_model` non-empty); absent = the fixed list alone and no call, ever.
   */
  serverIdeas?: ServerIdeasInput;
  /**
   * This field's past texts ON THIS CARD, newest first (C-16, `cardRecentTexts` over the band's
   * runs): the «on this card» group of Recently used, above the browser's own list. Absent = none.
   */
  cardRecent?: readonly string[];
};

type Replaced = { before: string; after: string };

const NO_TEXTS: readonly string[] = Object.freeze([]);

/**
 * WHAT IMPROVE IS TOLD ABOUT THE FIELD — the same «Tool: … / This field: …» text the Ideas door asks
 * with (20-PROMPTS §3.8). The server names the tool and the field from its own table by the
 * `workflow` / `fieldKey` pair and reads this only as data about the card; the bare hint is the
 * last resort.
 */
export function improveContext(opts: {
  serverIdeas?: ServerIdeasInput;
  workflowTitle?: string;
  hint?: string;
}): string | undefined {
  if (opts.serverIdeas?.context) return opts.serverIdeas.context;
  if (opts.workflowTitle?.trim())
    return ideasContext({ workflowTitle: opts.workflowTitle.trim(), hint: opts.hint });
  return opts.hint;
}

/**
 * A server older than `ENHANCE_TEXT_MODE_STEER` refuses it as InvalidArgument (400), and ONLY that
 * proven enum skew is retried in `improve` (Codex review of PR-03, MAJOR):
 *  · a field violation on `mode` («unknown_mode», or «required» where the gateway dropped the
 *    unknown name);
 *  · a detail-free 400 that the repository's ONE transport classifier (`transportRefusal`, the
 *    canonical `proto: (line …)` prefix of the strict protojson gateway) calls a parse refusal AND
 *    that names the member (`ENHANCE_TEXT_MODE_STEER`) or the `mode` field
 *    (`proto: (line 1:32): invalid value for enum field mode: "ENHANCE_TEXT_MODE_STEER"`).
 * Prose is never proof (Codex review r2, MAJOR): a business 400 «selected mode is outside the enabled
 * model enum» has both words and no protojson prefix — it is the request's own refusal. Everything
 * else is said in its own words, never retried: a detail-free 400 of any other shape (a content
 * refusal, or a message naming the member without the protojson prefix), a violation on another
 * field (a too-long text), and above all a violation on `workflow` / `field_key` — that server KNOWS
 * steer and does not know this tool/field pair, so `improve` would only hide the mismatch.
 */
const STEER_PAIR_FIELDS = new Set(['workflow', 'field_key', 'fieldKey']);
/** protojson names the field it could not read: `enum field mode: …` / `unknown field "mode"`. */
const STEER_MODE_FIELD = /\bfield "?mode\b/;

function steerRefused(error: unknown): boolean {
  if ((error as { status?: number } | null)?.status !== 400) return false;
  const violations = extractFieldViolations(error);
  if (violations.some((v) => STEER_PAIR_FIELDS.has(v.field))) return false;
  if (violations.some((v) => v.field === 'mode')) return true;
  if (violations.length > 0) return false;
  const parse = transportRefusal(error);
  if (parse === null) return false;
  return parse.includes('ENHANCE_TEXT_MODE_STEER') || STEER_MODE_FIELD.test(parse);
}

/**
 * Improve's call: `steer` for this tool/field pair, and ONCE `improve` when the server does not know
 * `steer` yet. The retry drops the pair: a server that old does not know those fields either, and
 * its strict gateway would refuse the unknown name before it read the mode.
 */
export async function steerText(req: Omit<EnhanceRequest, 'mode'>): Promise<string> {
  try {
    return await enhanceText({ ...req, mode: 'steer' });
  } catch (e) {
    if (!steerRefused(e)) throw e;
    return enhanceText({ ...req, mode: 'improve', workflow: undefined, fieldKey: undefined });
  }
}

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
  workflowTitle,
  maxLength = 2000,
  disabled,
  serverIdeas,
  cardRecent = NO_TEXTS,
}: PromptFieldProps): JSX.Element {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const { showMessage } = useSnackBarStore();
  const ideas = ideasFor(workflowKey, fieldKey);
  const recent = useRecentText(recentTextKey(workflowKey, fieldKey));

  const [ideasOpen, setIdeasOpen] = useState(false);
  const [server, setServer] = useState<ServerIdeasState>({ status: 'off' });
  /** Bumped by every open and close of the Ideas menu: an answer for an older opening is ignored. */
  const ideasTicket = useRef(0);
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
      ideasTicket.current += 1;
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

  /**
   * THE IDEAS DOOR. Opening shows the fixed list at once; where the band names the assistant, it
   * also asks the server — once per question (the answer is cached for the page), never on mount.
   * Closing only makes a late answer stale: the request cannot be aborted (the generated client
   * takes no signal), and its answer still lands in the cache for the next press.
   */
  const openIdeas = (open: boolean) => {
    if (disabled) return;
    setIdeasOpen(open);
    const mine = ++ideasTicket.current;
    if (!open) return;
    if (!serverIdeas || serverIdeasOff()) {
      setServer({ status: 'off' });
      return;
    }
    const req = suggestRequest(workflowKey, fieldKey, serverIdeas, latest.current.value);
    const ready = answeredIdeas(req);
    if (ready) {
      setServer({ status: 'done', ideas: ready });
      return;
    }
    setServer({ status: 'thinking' });
    fetchServerIdeas(req).then(
      (ideas) => ideasTicket.current === mine && setServer({ status: 'done', ideas }),
      () => ideasTicket.current === mine && setServer({ status: 'failed' }),
    );
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
        await steerText({
          text: before,
          field: 'other',
          workflow: workflowKey,
          fieldKey,
          context: improveContext({ serverIdeas, workflowTitle, hint }),
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
            ? 'the configured model is not served by its provider — check the route in admin → AI providers'
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
      // `!`: the Button's variant sets `text-textColor` and cva does not merge classes, so a plain
      // `text-bgColor` lost to it and the open door read black on black unless hovered.
      open && 'bg-textColor !text-bgColor',
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
            onOpenChange={openIdeas}
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
            <IdeasMenuBody
              menu={ideasMenu(ideas, server, serverIdeas?.mediaIds.length ?? 0)}
              onPick={insert}
            />
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
              : 'make it short and concrete for this field, same meaning'
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
            <RecentMenuBody menu={recentMenu(cardRecent, recent.items)} onPick={pickRecent} />
          </GenericPopover>
        </span>
      </div>
    </div>
  );
}

/**
 * A group's name inside a menu: quieter than the popover's own ruled head (10px bold uppercase) —
 * grey, small, lowercase, no rule of its own. The hairline between two groups is the divider.
 */
export function MenuGroupLabel({ children }: { children: string }): JSX.Element {
  return (
    <p aria-hidden className='px-2.5 pb-0.5 pt-1.5 text-micro text-labelColor'>
      {children}
    </p>
  );
}

/**
 * THE IDEAS MENU (C-15), drawn from `ideasMenu`'s data: the server's group — «thinking…» while the
 * call is out, then its phrases — above one hairline, the fixed list below it as «more». With no
 * server group the fixed list stands alone and unlabelled, exactly as in phase 2.
 */
export function IdeasMenuBody({
  menu,
  onPick,
}: {
  menu: IdeasMenu;
  onPick: (idea: string) => void;
}): JSX.Element {
  const { server, more } = menu;
  return (
    <div className='flex flex-col py-1' data-ideas-menu=''>
      {server && (
        <div
          role='group'
          aria-label={server.label}
          data-ideas-group='server'
          className='flex flex-col'
        >
          <MenuGroupLabel>{server.label}</MenuGroupLabel>
          {server.thinking ? (
            // A row that says the answer is coming — not a spinner, not a control.
            <p role='status' className='px-2.5 py-2 text-textBaseSize text-labelColor'>
              thinking…
            </p>
          ) : (
            server.ideas.map((idea) => (
              <button key={idea} type='button' onClick={() => onPick(idea)} className={MENU_ROW}>
                {idea}
              </button>
            ))
          )}
        </div>
      )}
      {more.length > 0 && (
        <div
          role='group'
          aria-label={server ? 'more' : 'ideas'}
          data-ideas-group='static'
          className={cn('flex flex-col', server && 'mt-1 border-t border-hairline pt-1')}
        >
          {server && <MenuGroupLabel>more</MenuGroupLabel>}
          {more.map((idea) => (
            <button key={idea} type='button' onClick={() => onPick(idea)} className={MENU_ROW}>
              {idea}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * THE RECENTLY USED MENU (C-16): «on this card» (the band's runs) above one hairline, «in this
 * browser» below. An empty group is not drawn; the browser's list alone stands unlabelled, as in
 * phase 2; both empty is the «nothing yet» line.
 */
export function RecentMenuBody({
  menu,
  onPick,
}: {
  menu: { card: readonly string[]; browser: readonly string[] };
  onPick: (text: string) => void;
}): JSX.Element {
  const { card, browser } = menu;
  if (card.length === 0 && browser.length === 0)
    return (
      <p className='px-2.5 py-2 text-micro text-labelColor' data-recent-menu=''>
        Nothing yet. Texts you generate with appear here.
      </p>
    );
  const row = (text: string) => (
    <button
      key={text}
      type='button'
      title={text}
      onClick={() => onPick(text)}
      className={cn(MENU_ROW, 'line-clamp-2')}
    >
      {text}
    </button>
  );
  return (
    <div className='flex flex-col py-1' data-recent-menu=''>
      {card.length > 0 && (
        <div
          role='group'
          aria-label='on this card'
          data-recent-group='card'
          className='flex flex-col'
        >
          <MenuGroupLabel>on this card</MenuGroupLabel>
          {card.map(row)}
        </div>
      )}
      {browser.length > 0 && (
        <div
          role='group'
          aria-label={card.length > 0 ? 'in this browser' : 'recently used'}
          data-recent-group='browser'
          className={cn('flex flex-col', card.length > 0 && 'mt-1 border-t border-hairline pt-1')}
        >
          {card.length > 0 && <MenuGroupLabel>in this browser</MenuGroupLabel>}
          {browser.map(row)}
        </div>
      )}
    </div>
  );
}
