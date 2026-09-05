import type { common_DesignRun } from 'api/proto-http/admin';
import type { JSX, ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { isRunLive } from '../generation/run-state';
import { clockStamp, runHandle } from '../handles';

/**
 * ═══ WHAT THE MODEL GETS — ONE MARKUP, FOUR SUPPLIERS ═══════════════════════════════════════════
 *
 * The contract (§B) is literal: «ONE organ for every step. It prints `parts[]` in the order they
 * are sent: a line per part, an `origin` pill, a thumbnail and provenance for pictures, and a
 * `NOT SENT` block with a REASON for what is left out. Between steps only the COMPOSITION of
 * `parts[]` differs, never the markup.»
 *
 * WHAT THIS FILE IS, AND IS NOT. It is the MARKUP and nothing else: the shell, the line, the
 * not-sent block, the sent-text block, the copy block, the doors. It holds no state, reads no wire
 * and subscribes to no form. The SUPPLIERS stay where their dependencies live — the flat arm reads
 * the FORM (`modals/what-model-gets-modal.tsx`), the render / 3D / recolour arms read the BAND
 * (`render/what-model-gets.tsx`), the moodboard draft reads the board (`head/construction-draft`).
 * Folding the suppliers into one component would hand it two unrelated dependency sets and a prop
 * bag half-empty in every direction; folding the MARKUP into one place is what the contract asks
 * for, and it is what makes «this looks different on 3D» a bug rather than a style.
 *
 * ⚠ NO `useWatch`, NO `useFormContext` HERE, EVER. The render arm is mounted by composers that are
 * not inside a form (a print root, a harness) and `useFormContext` answers `null` there. A hook in
 * a shared part would crash every arm for the sake of one; a supplier that wants a live form value
 * subscribes to it at home and hands the value down.
 */

/** The four origins the contract names, plus nothing. A part is one of these or it is not a part. */
export type WmgOrigin = 'typed' | 'pasted' | 'linked' | 'recipe';

export type Say = (message: string, type: 'error' | 'success') => void;

/**
 * THE SHELL. `width='lg'`, no decision buttons (L-7): the dialog decides nothing, so it has no
 * «close» pair — the ✕ in the head is the one way out, and the footer keeps the one sentence every
 * arm must say. `intro` is the arm's own first paragraph — what this list IS (the flat payload, the
 * card's contribution to a profile, the facts a server reads) — because that sentence is the one
 * thing that legitimately differs by step.
 */
export function WmgShell({
  open,
  onOpenChange,
  kindWord,
  intro,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «flat», «fabric render», «3D», «on model», «moodboard draft» — spelled once by the arm. */
  kindWord: string;
  intro: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      /* Required by the primitive's contract; with `hideActions` nothing calls it — ✕ closes. */
      onConfirm={() => onOpenChange(false)}
      width='lg'
      title={`what the model gets — ${kindWord}`}
      hideActions
      footerHint='nothing here is editable — every fact is edited at its own field'
    >
      <div className='space-y-stack'>
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            {intro}
          </Text>
        </CalloutBox>
        {children}
      </div>
    </ConfirmationModal>
  );
}

/**
 * A GROUP OF PARTS: a label, a right-edge count or state, the lines, and an optional footnote.
 * `data-*` attributes pass through to the wrapper so a probe can address the group by name.
 */
export function WmgGroup({
  label,
  aside,
  flush,
  note,
  children,
  ...rest
}: {
  label: ReactNode;
  aside?: ReactNode;
  flush?: boolean;
  /** One quiet sentence under the lines — where a role is given, what comes back, and so on. */
  note?: ReactNode;
  children: ReactNode;
  [data: `data-${string}`]: string | number | undefined;
}): JSX.Element {
  return (
    <div {...rest}>
      <GroupLabel
        flush={flush}
        action={
          aside ? (
            <Text size='micro' variant='label' component='span' className='normal-case'>
              {aside}
            </Text>
          ) : undefined
        }
      >
        {label}
      </GroupLabel>
      {children}
      {note ? (
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          {note}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * ONE LINE OF THE INVENTORY — one part, as it travels.
 *
 *   [thumb | lead]  [№]  NAME  (origin)  text…
 *
 * `thumb` — a picture part. `''` draws the white mat with the word «no image» in it: the part IS a
 *   picture and the picture is not here, which is a fact about the card and must be visible. Leave
 *   it `undefined` for a part that is words, and the column is not drawn at all.
 * `lead` — a non-picture leader (a colour swatch) in the thumbnail's place.
 * `number` — the part's ordinal IN THE DISPATCH, for arms that number their pictures (flat).
 *   `null` draws the outlined dash: on the card, not in the dispatch.
 * `origin` — the contract's pill. Omit only for a line that is not a part (an empty slot).
 *
 * Remaining `data-*` attributes land on the row: the arms' probe anchors (`data-sent-cloths`,
 * `data-input-side`) live on the line, not on a wrapper around it.
 */
export function InventoryLine({
  name,
  number,
  thumb,
  lead,
  origin,
  text,
  className,
  ...rest
}: {
  name: ReactNode;
  number?: number | null;
  thumb?: string;
  lead?: ReactNode;
  origin?: WmgOrigin;
  text: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | number | undefined;
}): JSX.Element {
  return (
    <div
      {...rest}
      className={`flex items-center gap-2 border-b border-hairline py-1${className ? ` ${className}` : ''}`}
    >
      {lead !== undefined ? (
        <span className='shrink-0'>{lead}</span>
      ) : thumb !== undefined ? (
        /* the mat under a picture is white (R-12); emptiness is named by a WORD — the neighbouring
           text speaks of the part, not of the picture, so a silent white frame would read as «a
           white picture» */
        <span className='relative block h-10 w-8 shrink-0 border border-borderColor bg-bgColor'>
          {thumb ? (
            <img src={thumb} alt='' loading='lazy' className='h-full w-full object-contain' />
          ) : (
            <span className='absolute inset-0 flex items-center justify-center px-0.5 text-center'>
              <Text size='nano' variant='label' component='span'>
                no image
              </Text>
            </span>
          )}
        </span>
      ) : null}
      {number !== undefined ? (
        <span
          className={
            number !== null
              ? 'flex h-4 w-4 shrink-0 items-center justify-center bg-textColor text-bgColor'
              : 'flex h-4 w-4 shrink-0 items-center justify-center border border-borderColor'
          }
        >
          <Text size='nano' component='span'>
            {number ?? '—'}
          </Text>
        </span>
      ) : null}
      <Text size='nano' variant='uppercase' component='span' className='w-[92px] shrink-0'>
        {name}
      </Text>
      {origin ? (
        <span className='shrink-0' data-origin={origin}>
          <Pill tone='mut'>{origin}</Pill>
        </span>
      ) : null}
      <Text size='micro' component='span' className='min-w-0 flex-1'>
        {text}
      </Text>
    </div>
  );
}

/** One thing the model does NOT get, and WHY. `door` walks to where the thing lives, if anywhere. */
export type NotSentItem = {
  label: string;
  reason: string;
  door?: () => void;
};

/**
 * NOT SENT — the half of the inventory that is easiest to be wrong about. Each item is a LINE with
 * its reason printed beside it (the contract: «with a reason»), drawn with the same primitive as
 * the parts above so the eye reads one list, not a list and a chip row. A hover-only reason was a
 * reason nobody read before paying.
 */
export function NotSent({
  items,
  aside = 'what a model would have no knowledge of',
  note,
}: {
  items: readonly NotSentItem[];
  aside?: ReactNode;
  note?: ReactNode;
}): JSX.Element {
  return (
    <WmgGroup label='not sent' aside={aside} note={note} data-wmg-not-sent={items.length}>
      {items.map((item) => (
        <InventoryLine
          key={item.label}
          name={item.label}
          text={
            <span className='flex flex-wrap items-baseline gap-x-2'>
              <span className='text-labelColor'>{item.reason}</span>
              {item.door ? (
                <Button variant='secondary' size='xs' onClick={item.door}>
                  where ▸
                </Button>
              ) : null}
            </span>
          }
        />
      ))}
    </WmgGroup>
  );
}

/**
 * THE TEXT AS THE SERVER KEPT IT — `run.prompt` (or a text run's `output_text`) of the newest run
 * of THIS door's kind, verbatim, scrolling inside its own frame.
 *
 * ⚠ AN EMPTY TEXT MEANS TWO DIFFERENT THINGS and the contract forbids collapsing them: either no
 * worker has picked the run up yet (a live row), or the run predates the column (migration 0352 —
 * historical rows are empty FOREVER, the text was never kept). «Not dispatched yet» over an old
 * finished run would be a lie about history, so the two are told apart by the run's state.
 */
export function WordsAsSent({
  run,
  text,
  kindWord,
  label = 'words as sent',
  noun = 'sent text',
  caveat,
  whenNone,
  ...rest
}: {
  run: common_DesignRun | null;
  /** The text to show, already trimmed — the arm decides which column it is reading. */
  text: string;
  /** «flat», «render» — names the run kind in «no … run yet». */
  kindWord: string;
  label?: string;
  /** «sent text» / «answer» — what an empty row is missing. */
  noun?: string;
  /** Spoken under the text: what exactly this text is (base instruction vs byte-for-byte). */
  caveat?: ReactNode;
  /** What to say when there is no run of this kind at all. */
  whenNone?: ReactNode;
  [data: `data-${string}`]: string | number | undefined;
}): JSX.Element {
  return (
    <WmgGroup
      label={label}
      aside={run ? `${runHandle(run.id)} · ${clockStamp(run.createdAt)}` : undefined}
      {...rest}
    >
      {!run ? (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {whenNone ??
            `no ${kindWord} run yet — the server keeps the ${noun} on the run, and this panel shows the latest run’s copy.`}
        </Text>
      ) : text ? (
        <>
          {/* A PANEL FILL, NOT A SECOND BOX: a tint inside the block, never a bordered rectangle
              (a box in a box). Paragraphs long, so it scrolls INSIDE its own frame — wrapped and
              broken, never widening the page. */}
          <pre className='max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
            {text}
          </pre>
          {caveat ? (
            <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
              {caveat}
            </Text>
          ) : null}
        </>
      ) : isRunLive(run) ? (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {runHandle(run.id)} has not been dispatched yet — the worker writes the {noun} the moment
          it picks the run up.
        </Text>
      ) : (
        /* A FINISHED run with no text is HISTORY, not a pending dispatch: rows older than the
           column never kept their text (and a run refused before dispatch never had one). */
        <Text size='micro' variant='label' component='p' className='normal-case'>
          no {noun} on record for {runHandle(run.id)} — the run predates the record or never reached
          dispatch; older runs never kept their text.
        </Text>
      )}
    </WmgGroup>
  );
}

/** Where a fact is edited. Drawn as a row of secondary doors under the copy block. */
export type WmgDoor = { label: string; onClick: () => void };

/**
 * THE SAME FACTS AS PLAIN TEXT — «copy as text» hands the inventory to a studio outside — and,
 * under it, the doors to the fields the facts came from. Nothing here is editable; the doors lead
 * to where it is.
 */
export function CopyWords({
  words,
  say,
  doors,
}: {
  words: string;
  say: Say;
  doors?: readonly WmgDoor[];
}): JSX.Element {
  return (
    <div>
      <GroupLabel
        action={
          <Button variant='secondary' size='xs' onClick={() => copyText(words, say)}>
            copy as text
          </Button>
        }
      >
        words
      </GroupLabel>
      <pre className='overflow-x-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
        {words}
      </pre>
      {doors && doors.length > 0 ? (
        <div className='mt-1 flex flex-wrap gap-1.5'>
          {doors.map((door) => (
            <Button key={door.label} variant='secondary' size='xs' onClick={door.onClick}>
              {door.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * `navigator.clipboard`, NEVER `document.execCommand('copy')`. execCommand writes wherever the
 * document's SELECTION is at that moment, and these dialogs open over a form — the last thing that
 * took a selection was somebody's text field, and the copy would silently land there instead. That
 * has happened in this repo before.
 */
export async function copyText(words: string, say: Say): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    say('this browser does not offer the clipboard — select the text and copy it', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(words);
    say('copied as text', 'success');
  } catch {
    say('the browser refused the clipboard — select the text and copy it', 'error');
  }
}

/**
 * THE NEWEST RUN OF ONE KIND — newest by id, not by array position: the band's page order is a
 * server detail no panel has business trusting. `null` when the card has none of that kind.
 */
export function latestRunOfKind(
  runs: readonly common_DesignRun[] | undefined,
  kind: string,
): common_DesignRun | null {
  let best: common_DesignRun | null = null;
  for (const run of runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== kind) continue;
    if ((run.id ?? 0) > (best?.id ?? 0)) best = run;
  }
  return best;
}
