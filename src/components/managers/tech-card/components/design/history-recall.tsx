import type {
  GetDesignBandResponse,
  common_DesignMoodCallout,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnnotationSurface, type SurfaceCallout } from 'ui/components/annotation/surface';
import {
  annotationColorFromWire,
  annotationKindFromWire,
} from 'ui/components/annotation/wire';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { InertDoor } from './bench-slot';
import { serverSpeaksDesign } from './capability';
import { runHandle } from './handles';
import { decimalToNumber, readBudget } from './generation/money';
import { Thumb, thumbUrl } from './generation/thumb';
import { viewsLine } from './generation/run-state';
import { useStartRun } from './generation/use-generation';
import { viewLabel } from './views';

/**
 * RECALLING A PAST RUN — «show me what I asked that time, I may want it again».
 *
 * W-7 in the owner's words: pick a previous generation and the INPUT — REFERENCES block shows OUR
 * PROMPT — the pictures that were fed, their descriptions and the markup — in case we want to rerun
 * it. So the gesture lives on the history row and the ANSWER is drawn wherever this component is
 * mounted, which is meant to be inside the references block.
 *
 * NOTHING ON THE CARD IS TOUCHED BY RECALLING. This is a viewer over a frozen snapshot, not a
 * restore: it does not re-tick views, does not re-attach references, does not rewrite the
 * description. A «restore» would silently overwrite the card the human is standing in, and the
 * moment they then generated, the history would show inputs that never existed together.
 *
 * THE RERUN IS THE SERVER'S JOB, AND WHAT TRAVELS IS A RUN NUMBER. `rerun_of_run_id` names the row
 * to repeat and the server re-reads THAT ROW'S own frozen snapshot to assemble the new run's
 * inputs. The alternative — this client rebuilding the inputs out of the snapshot and posting them
 * as a fresh request — is refused on purpose: inputs a caller supplies are a claim, and the history
 * would be able to assert a composition that was never fed to anything.
 *
 * WHAT DOES TRAVEL FROM HERE IS THE QUESTION, NOT THE INPUTS: `params` (the views and layout that
 * run asked for) and `ask` (the delta phrase, editable — the contract calls a rerun with a new
 * phrase the ordinary case, and it is what makes this a rerun rather than a replay). The two are
 * client-written by design; the inputs never are.
 *
 * WHY A MODULE STORE. Exactly the reason `history-question.ts` gives: the history row and the
 * references block are siblings under a composer neither of them owns, and a selection that has to
 * cross that seam needs no provider and no common parent to do it.
 */

/* ────────────────────────────── the selection ────────────────────────────── */

const recalled = new Map<number, common_DesignRun>();
/** How many display hosts are mounted for a card — see `useRecallHostMounted`. */
const hosts = new Map<number, number>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Select a past run, or clear the selection with `null`.
 *
 * THE ROW ITSELF IS STORED, not its id, and that is not laziness: `DesignInputSnapshot` is frozen
 * at launch and can never change afterwards, so the copy the history was already given is exactly
 * as true as anything `GetDesignRun` would hand back. Re-reading would buy a request and no fact.
 */
export function recallDesignRun(techCardId: number, run: common_DesignRun | null): void {
  if (!techCardId || techCardId <= 0) return;
  const current = recalled.get(techCardId) ?? null;
  const next = run ?? null;
  if (current === next) return;
  if (next) recalled.set(techCardId, next);
  else recalled.delete(techCardId);
  emit();
}

export function useRecalledRun(techCardId: number): common_DesignRun | null {
  return useSyncExternalStore(
    subscribe,
    () => recalled.get(techCardId) ?? null,
    () => null,
  );
}

/**
 * IS THE PROMPT BEING SHOWN SOMEWHERE ELSE ON THIS SCREEN?
 *
 * The owner puts the recalled prompt in INPUT — REFERENCES, and that block belongs to another
 * organ. Until it mounts one, the history draws the panel itself rather than offering a selection
 * whose result appears nowhere — a gesture with no visible answer reads as broken. A host announces
 * itself on mount, so the fallback disappears the moment the real home exists; the history is never
 * asked to guess by looking at the DOM.
 */
export function useRecallHostMounted(techCardId: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hosts.get(techCardId) ?? 0) > 0,
    () => false,
  );
}

function useRegisterRecallHost(techCardId: number, active: boolean): void {
  useLayoutEffect(() => {
    if (!active || !techCardId || techCardId <= 0) return;
    hosts.set(techCardId, (hosts.get(techCardId) ?? 0) + 1);
    emit();
    return () => {
      const left = (hosts.get(techCardId) ?? 1) - 1;
      if (left > 0) hosts.set(techCardId, left);
      else hosts.delete(techCardId);
      emit();
    };
  }, [techCardId, active]);
}

/* ────────────────────────────── the panel ────────────────────────────── */

function PromptRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-2 border-b border-hairline py-1 last:border-b-0'>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='w-24 shrink-0 uppercase tracking-label'
      >
        {k}
      </Text>
      <span className='min-w-0 flex-1 break-words text-micro'>{children}</span>
    </div>
  );
}

const NOTHING = (
  <Text size='micro' variant='label' component='span'>
    —
  </Text>
);

/** Frame fraction from the wire's decimal, with a stated fallback rather than a silent 0. */
function frac(d: Parameters<typeof decimalToNumber>[0], fallback = 0): number {
  const n = decimalToNumber(d);
  return n === null ? fallback : n;
}

/**
 * A FROZEN CALLOUT, DRAWN BY THE SAME PRIMITIVE THAT DREW IT LIVE.
 *
 * `DesignMoodCallout.annotation` is the very `TechCardAnnotation` the card stores, at the same
 * coordinate precision, so the recalled markup is the markup — not a paraphrase of it. Mapping it
 * to a view model by hand here rather than through the form's `annotationFromWire` is deliberate:
 * that path decodes INTO the editable form shape (decimal strings, piece keys, an editable text),
 * and nothing here is editable. What is needed is the read-only view model, and this is the whole
 * of it.
 *
 * THE WORDS COME FROM THE CALLOUT, NOT FROM THE ANNOTATION. The contract leaves
 * `annotation.text` empty on purpose and keeps the composed words one level up — the same
 * arrangement `DesignSheetCallout` uses — so reading `annotation.text` here would draw every
 * callout blank.
 */
function surfaceCallouts(callouts?: common_DesignMoodCallout[] | null): SurfaceCallout[] {
  return (callouts ?? [])
    .map((callout, i): SurfaceCallout | null => {
      const shape = callout.annotation;
      // Unset geometry is a readable state — the callout carried no shape, or predates the field.
      // It is NOT a zero-area mark at the top-left corner, so it is dropped from the drawing and
      // its words are still listed beside the picture.
      if (!shape) return null;
      const text = (callout.text ?? '').trim();
      return {
        key: `${callout.mediaId ?? 0}-${i}`,
        kind: annotationKindFromWire(shape.kind),
        points: (shape.points ?? []).map((point) => ({ x: frac(point.x), y: frac(point.y) })),
        // A callout whose label was never placed falls back to the centre of the frame so it stays
        // visible instead of hiding in the corner.
        label: { x: frac(shape.labelX, 0.5), y: frac(shape.labelY, 0.5) },
        number: i + 1,
        // THE DRAWING CARRIES THE NUMBER, THE LIST BESIDE IT CARRIES THE WORDS — `hasText` is
        // exactly the contract for «there is text whose home is elsewhere», and the fitting screen
        // uses it the same way. Words on the overlay as well would print them twice, and the plate
        // is absolutely positioned yet still counts toward its container's width — so the size of
        // the frame would follow the length of somebody's note.
        text: '',
        hasText: !!text,
        color: annotationColorFromWire(shape.color),
        dashed: !!shape.dashed,
        filled: !!shape.filled,
      };
    })
    .filter((c): c is SurfaceCallout => !!c);
}

/**
 * ONE FROZEN INPUT PICTURE. When the snapshot kept markup on it, the markup is drawn ON the picture
 * by the read-only annotation surface — passing no write callbacks is what makes it read-only, and
 * `frozen` says so a second time rather than relying on the absence of a prop. Without markup the
 * cheap thumbnail is enough and the surface is not mounted at all.
 */
function FrozenInputPicture({
  media,
  gone,
  alt,
  callouts,
}: {
  media?: Parameters<typeof Thumb>[0]['media'];
  gone?: boolean;
  alt?: string;
  callouts: SurfaceCallout[];
}) {
  const src = thumbUrl(media);
  // THE SAME HEIGHT WHETHER OR NOT THERE IS MARKUP. A 56px thumbnail beside a 120px annotated one
  // makes the column look like two different lists; the height is what the eye reads down.
  if (!callouts.length || !src) {
    return <Thumb media={media} gone={gone} alt={alt} className='h-[120px] w-[96px]' />;
  }
  // NO LEGEND UNDER THE FRAME. The surface's own legend lists PINS only, and the words of every
  // callout are already listed beside the picture — so it would print half of them twice, and at
  // this width its unbreakable rows push the column 4px wider than the space it was given
  // (measured: clientWidth 150, scrollWidth 154).
  // THE FRAME IS SIZED BY HEIGHT AND KEEPS THE PICTURE'S OWN RATIO — its width follows from the
  // file. A fixed-width frame would letterbox, and a fitted frame whose ratio is not the picture's
  // puts every marker somewhere the human never put it: the callouts are FRACTIONS OF THE FRAME, so
  // frame ≠ picture means the same fraction is a different place. That is why the wrapper states no
  // width of its own either — a column narrower than the frame it holds reports the difference as
  // overflow, and the row starts pushing its neighbour (measured: 150 wide holding 154).
  return (
    <div className='shrink-0'>
      <AnnotationSurface src={src} alt={alt} callouts={callouts} heightPx={120} frozen />
    </div>
  );
}

/**
 * The recalled run's prompt: what was asked, the words, the reference pictures with their roles and
 * notes, and the moodboard markup the model was read.
 *
 * IT IS NOT A BLOCK. No border, no fill, no `Section` — it is a `GroupLabel` and ruled rows, so it
 * can stand inside INPUT — REFERENCES without putting a box inside a box (DESIGN.md §5).
 */
export function RecalledRunPrompt({
  techCardId,
  band,
  disabled,
  host = true,
}: {
  techCardId: number;
  /**
   * The band, when the mounting screen has one. Only the MONEY is read from it, and only to refuse
   * a rerun the day's cap would refuse anyway — without it the door stays live and the server's own
   * refusal is what speaks.
   */
  band?: GetDesignBandResponse;
  disabled?: boolean;
  /**
   * `false` for the history's own fallback copy, so it does not announce itself as the home of the
   * prompt and hide the very panel it is standing in for.
   */
  host?: boolean;
}) {
  useRegisterRecallHost(techCardId, host);
  const run = useRecalledRun(techCardId);
  const speaks = serverSpeaksDesign();
  const startRun = useStartRun(techCardId);
  /**
   * THE DELTA PHRASE OF THE RERUN, KEYED BY THE RUN IT BELONGS TO. Held as a pair rather than
   * synced by an effect: recalling a different run must not carry the phrase typed for the previous
   * one into a paid request, and a keyed value cannot lag the way an effect can.
   */
  const [draft, setDraft] = useState<{ runId: number; text: string } | null>(null);
  const budget = useMemo(() => readBudget(band?.budget), [band?.budget]);

  const runId = run?.id ?? 0;
  const kind = (run?.kind ?? '').trim().toLowerCase();
  const askValue = draft && draft.runId === runId ? draft.text : (run?.ask ?? '').trim();

  if (!run) return null;

  const inputs = run.inputs;
  const refs = inputs?.refs ?? [];
  const callouts = inputs?.mood?.callouts ?? [];
  const moodNote = (inputs?.mood?.note ?? '').trim();
  const slots = inputs?.slots ?? [];
  const handle = runHandle(run.id) || 'this run';
  const moodMarks = surfaceCallouts(callouts);
  /** What was asked for, kept in one place so the refusal below and the request narrow together. */
  const params = run.params;

  /**
   * WHY A RERUN IS REFUSED, IN THE ORDER THE REFUSALS MATTER. `vector` and `draft_idea` are named
   * rather than lumped into «cannot»: the first has a door of its own on this contract and the
   * second has no picture inputs to repeat at all, and a reader deserves to know which.
   */
  const rerunWhy = !speaks
    ? 'this server does not speak the design band yet'
    : disabled
      ? 'this card is read-only'
      : !runId
        ? 'this row has no number to repeat'
        : kind === 'draft_idea'
          ? 'a text run has no picture inputs to repeat'
          : kind !== 'flat' && kind !== 'render' && kind !== 'threed'
            ? `a ${kind || 'run'} is started from its own screen, not from here`
            : !params
              ? 'this row did not keep what was asked for, so there is nothing to repeat it with'
              : budget?.exhausted
                ? `daily budget reached — ${budget.line}`
                : null;

  return (
    <>
      <GroupLabel
        action={
          <button
            type='button'
            onClick={() => recallDesignRun(techCardId, null)}
            className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
          >
            clear
          </button>
        }
      >
        recalled — {handle}
      </GroupLabel>

      <Text size='nano' variant='label' component='p'>
        launch-time copies of what {handle} was given. Nothing on this card has been changed by
        looking at them — the references above are still the ones a NEW run would be given.
      </Text>

      <PromptRow k='asked'>{(run.ask ?? '').trim() || NOTHING}</PromptRow>
      <PromptRow k='words'>
        {/* THE DESCRIPTION AS IT READ AT LAUNCH — `inputs.garment_note`, the run's own frozen copy
            of the card's `garment_description`. Never the card's CURRENT description: the card has
            one and it is a different fact, and showing it here would make an old run look as
            though it had been told today's words. */}
        {(inputs?.garmentNote ?? '').trim() || NOTHING}
      </PromptRow>
      <PromptRow k='views · layout'>{viewsLine(run.params) || NOTHING}</PromptRow>

      {refs.length > 0 && (
        <>
          <GroupLabel>the pictures it was given</GroupLabel>
          {refs.map((ref, i) => {
            const marks = surfaceCallouts(ref.callouts);
            return (
              <div
                key={`${ref.mediaId ?? 0}-${i}`}
                className='flex items-start gap-2 border-b border-hairline py-1 last:border-b-0'
              >
                <FrozenInputPicture
                  media={ref.media}
                  gone={!!ref.deleted}
                  alt={(ref.role ?? '').trim()}
                  callouts={marks}
                />
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='w-16 shrink-0 uppercase tracking-label'
                >
                  {viewLabel(ref.role) || 'no role'}
                </Text>
                <span className='min-w-0 flex-1 break-words text-micro'>
                  {(ref.note ?? '').trim() || (
                    <Text size='micro' variant='label' component='span'>
                      no note
                    </Text>
                  )}
                  {/* THE MARKUP'S WORDS STAND BESIDE THE PICTURE, numbered to match the drawing.
                      Not in the surface's own legend: that one lists PINS only, so half of what was
                      said would be missing from it at exactly the size this is read at. */}
                  {(ref.callouts ?? []).map((callout, j) => (
                    <Text
                      key={`${callout.mediaId ?? 0}-${j}`}
                      size='nano'
                      variant='label'
                      component='p'
                      className='break-words'
                    >
                      {j + 1}. {(callout.text ?? '').trim() || 'no words'}
                      {!callout.annotation && ' · no shape kept'}
                    </Text>
                  ))}
                </span>
                {ref.deleted && <Pill tone='mut'>gone from the card</Pill>}
              </div>
            );
          })}
        </>
      )}

      {slots.length > 0 && (
        <>
          <GroupLabel>the plates it was given</GroupLabel>
          {slots.map((slot, i) => (
            <div
              key={`${slot.slotId ?? 0}-${slot.viewKey ?? ''}-${i}`}
              className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'
            >
              <Thumb
                media={slot.media}
                gone={!!slot.deleted}
                alt={(slot.viewKey ?? '').trim()}
                className='h-14 w-11'
              />
              <Text
                size='micro'
                variant='label'
                component='span'
                className='w-16 shrink-0 uppercase tracking-label'
              >
                {(slot.detailName ?? '').trim() || viewLabel(slot.viewKey)}
              </Text>
              {slot.deleted && <Pill tone='mut'>gone from the card</Pill>}
            </div>
          ))}
        </>
      )}

      {(moodNote || callouts.length > 0) && (
        <>
          <GroupLabel>the board it was read</GroupLabel>
          {moodNote && (
            <Text size='micro' component='p' className='break-words py-1'>
              {moodNote}
            </Text>
          )}
          {/* THE BOARD'S MARKUP IS LISTED AND NOT DRAWN, and the reason is in the snapshot rather
              than in this organ: `DesignMoodSnapshot` freezes each callout's words and its shape,
              but NOT the board picture it stood on — there is no resolved media to draw it over.
              Joining today's board to fill the hole would show a shape over an image the run may
              never have been given. The shapes are still frozen and are stated as kept. */}
          {callouts.map((callout, i) => (
            <Text
              key={`${callout.mediaId ?? 0}-${i}`}
              size='micro'
              variant='label'
              component='p'
              className='break-words'
            >
              · {(callout.text ?? '').trim() || 'no text'}
              {callout.annotation ? '' : ' · no shape kept'}
            </Text>
          ))}
          {moodMarks.length > 0 && (
            <Text size='nano' variant='label' component='p'>
              {moodMarks.length} of these kept their shape — the board picture they stood on is not
              part of the snapshot, so the shapes are not redrawn here.
            </Text>
          )}
        </>
      )}

      {/* ── the rerun ── */}
      <GroupLabel>run it again</GroupLabel>
      <div className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-24 shrink-0 uppercase tracking-label'
        >
          ask
        </Text>
        <Input
          name='design-rerun-ask'
          value={askValue}
          disabled={!!rerunWhy}
          placeholder="what to change this time — becomes the new run's caption"
          className='max-w-[420px]'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft({ runId, text: e.target.value })
          }
        />
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          it starts as {handle}&apos;s own phrase — a rerun with a new one is the ordinary case
        </Text>
      </div>

      <div className='flex flex-wrap items-center gap-2 pt-1'>
        {/* `|| !params` is not belt-and-braces: it is what narrows `params` to a real request for
            the branch below, so the button cannot be built out of a shape the refusal above already
            called missing. */}
        {rerunWhy || !params ? (
          <InertDoor
            label='rerun this run ▸'
            reason={rerunWhy ?? 'this row did not keep what was asked for'}
          />
        ) : (
          <Button
            variant='secondary'
            size='xs'
            disabled={startRun.isPending}
            onClick={() =>
              startRun.start(
                {
                  // THE RUN NUMBER IS THE WHOLE OF WHAT NAMES THE INPUTS. The server re-reads
                  // THIS run's frozen snapshot; nothing about the references, the description or
                  // the board is composed here, and that is what keeps the history evidence
                  // rather than a list of claims.
                  rerunOfRunId: runId,
                  // The QUESTION travels as always — it is client-written by the contract. It is
                  // this run's own question, because «run it again» is a statement about this run
                  // and not about whatever the form happens to be asking now.
                  kind: kind as 'flat' | 'render' | 'threed',
                  ask: askValue,
                  params,
                },
                // The selection is cleared once the row is FILED, not on the click: a failed start
                // must leave the prompt on screen to press again.
                () => recallDesignRun(techCardId, null),
              )
            }
            title={`repeat ${handle} with the inputs it actually had`}
          >
            {startRun.isPending ? 'starting…' : 'rerun this run ▸'}
          </Button>
        )}
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          the server repeats what {handle} was given, not what the card holds now — that is why a
          run number travels and a copy of the inputs does not.
        </Text>
        {budget && (
          <Text size='micro' variant='label' component='span' className='ml-auto'>
            {budget.line}
          </Text>
        )}
      </div>
    </>
  );
}
