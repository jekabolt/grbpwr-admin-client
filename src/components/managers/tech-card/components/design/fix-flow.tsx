import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { liveLayerRev } from './bench-slot';
import { useFixContext } from './generation/fix-context';
import { fixSelectionOf, isRunLive, runStatus } from './generation/run-state';
import { useElapsed } from './generation/use-generation';
import { clockStamp } from './handles';
import { CompareModal } from './modals';
import { isPictureHidden } from './visibility';
import { normaliseViewKey } from './views';

/**
 * THE FIX CYCLE — «this side is not right; ask for it again from the bench» — from the door under a
 * slot to the plate that finally replaces the one standing there.
 *
 * IT IS A JOINING, NOT A NEW MECHANISM, and saying so is the whole point of this file. Every half of
 * it already existed and none of them were connected:
 *
 *   `generation/fix-context.tsx`   — the transient «a fix is armed for FRONT» state, the Esc that
 *                                    cancels it, and the chip the form draws. Mounted, and until now
 *                                    nothing anywhere CALLED `start()`.
 *   `generation/generation-form`   — already reads that state, already hides the views matrix and
 *                                    the layout switch while a fix is armed, and already sends the
 *                                    fix parameters.
 *   `modals/compare-modal.tsx`     — the two plates side by side and the compare-and-set that puts
 *                                    the new one in. Written, exported, and opened by nobody.
 *
 * So what is here is the missing middle: the door (`fix ▸` on a slot, wired by `bench.tsx`), the two
 * STATE STRIPS the prototype draws under a slot, and the multiple selection W-10 asks for.
 *
 * ONE SELECTION, TWO ADDRESSES. The wire states a fix as `fix_targets` (silhouette sides, by view
 * key) plus `fix_slot_ids` (details, by `design_bench_slot(id)`), and the contract is explicit that
 * they are ONE selection rather than two modes — a fix may name three sides and a cuff in one run.
 * The older scalar `fix_target` is still on the wire and still readable: `fixSelectionOf` below takes
 * the arrays when they carry anything and falls back to the scalar otherwise, which is the reading
 * rule the contract writes down. NOTHING HERE EVER WRITES THE SCALAR.
 *
 * THE STRIPS ADDRESS THE SLOT, NEVER THE PLATE (Г4/R10). The prototype's own defect was that both
 * bars were drawn inside a FILLED slot only, so unmarking the plate while a fix was in flight made
 * the whole promised flow evaporate — the answer landed in the history and nothing ever offered it
 * back. `FixBars` is therefore called by the empty slot too and says which of the two it is looking
 * at.
 *
 * NOTHING HERE DISPLACES BY ITSELF. A finished fix is announced, compared and then put in BY A
 * PERSON. A slot is exclusive and a version may already have frozen what stands there; a candidate
 * that walked in on its own would silently rewrite the composition a sheet was minted from.
 */

/* ─────────────────────────────── reading the band ─────────────────────────────── */

/** Every picture id that currently stands in some slot — a fix already placed is not a candidate. */
function slottedPictureIds(band: GetDesignBandResponse): Set<number> {
  const out = new Set<number>();
  for (const row of band.bench ?? []) {
    const id = row.pictureId ?? 0;
    if (id > 0) out.add(id);
  }
  return out;
}

/**
 * WHAT A RUN SAYS IT IS FIXING — re-exported, not re-implemented.
 *
 * The parse moved to `generation/run-state.ts`, the pure run-reader, because it has a SECOND reader
 * there: the history row's `fix:` caption and `expectedTileCount` ask the same question, and while
 * this file held the only copy they answered it from the old scalar alone — so a multi-slot fix
 * looked like an ordinary generation and reserved one tile for however many it had asked for.
 * The address stays here for the callers that already know it.
 */
export { fixSelectionOf };

/** Does this run's selection name the slot the caller is drawing? */
function fixAddresses(run: common_DesignRun, viewKey: string, slotId: number): boolean {
  const selection = fixSelectionOf(run);
  if (viewKey) return selection.views.includes(viewKey);
  return slotId > 0 && selection.slotIds.includes(slotId);
}

/** The run, if any, that is fixing this slot RIGHT NOW. */
export function runningFix(
  band: GetDesignBandResponse,
  viewKey: string,
  slotId = 0,
): common_DesignRun | null {
  if (!viewKey && !slotId) return null;
  return (
    (band.runs ?? []).find((run) => isRunLive(run) && fixAddresses(run, viewKey, slotId)) ?? null
  );
}

export type FixCandidate = { run: common_DesignRun; picture: common_DesignPicture };

/**
 * The newest finished fix of this slot whose answer is STILL ON OFFER.
 *
 * «Still on offer» is three conditions and each one is a different way the strip would otherwise
 * lie: the run finished (a failed one has nothing to show), the picture is not hidden (the hide verb
 * has no reveal hatch, so a hidden plate must not be reachable from here either), and the picture is
 * not already standing in a slot — which is exactly what happens the moment somebody presses
 * `put it in`, and is how the strip retires itself without storing a «dismissed» flag.
 */
export function fixCandidate(
  band: GetDesignBandResponse,
  viewKey: string,
  slotId = 0,
): FixCandidate | null {
  if (!viewKey && !slotId) return null;
  const placed = slottedPictureIds(band);
  const runs = (band.runs ?? [])
    .filter((run) => runStatus(run) === 'done' && fixAddresses(run, viewKey, slotId))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  for (const run of runs) {
    const selection = fixSelectionOf(run);
    const single = selection.views.length + selection.slotIds.length === 1;
    const free = (run.pictures ?? []).filter(
      (p) => (p.id ?? 0) > 0 && !isPictureHidden(p) && !placed.has(p.id!),
    );
    /**
     * WHICH OF SEVERAL ANSWERS IS THIS SLOT'S. A run that fixed exactly one slot has one ask, so
     * whatever it brought back is the answer to it. A run that fixed FOUR brought back four, and the
     * only thing on a picture that names a side is `ghost_view` — the server's own guess. So a
     * multi-slot run offers a plate here only when that guess names THIS side; otherwise the strip
     * stays quiet rather than offering one answer to three slots at once. Nothing is lost by the
     * silence: every picture is still in the run's row in the history with its own slot picker,
     * which is the gesture that exists precisely for «the guess was wrong».
     *
     * A DETAIL IN A MULTI-SLOT RUN THEREFORE GETS NO STRIP, and that is the same rule rather than an
     * omission: `ghost_view` cannot address one of several details, so nothing here can honestly
     * claim a plate is the cuff's rather than the pocket's.
     */
    const guessed = viewKey ? free.find((p) => normaliseViewKey(p.ghostView) === viewKey) : undefined;
    const picture = guessed ?? (single ? free[0] : undefined);
    if (picture) return { run, picture };
  }
  return null;
}

/**
 * WHAT A RUN ACTUALLY GETS, AND WHAT IT DOES NOT — the honest half of «pass them in already marked
 * up» (W-10).
 *
 * A callout drawn with `edit ▸` is a row of STROKE DATA in a `design_edit_layer`, not pixels in the
 * picture. A run's inputs are assembled server-side from the slots' PICTURES, so a layer that has
 * never been flattened is invisible to the model however loudly the screen shows it. The layer
 * becomes visible to a run only after `edit ▸ → save as picture` (`FlattenDesignEditLayer`), which
 * rasterises it into a NEW picture that can then stand in the slot.
 *
 * Returns the name of the trouble or null. `liveLayerRev` answers for the media the plate IS, so a
 * plate that was itself produced by flattening carries no layer and says nothing.
 */
export function unflattenedMarks(
  band: GetDesignBandResponse,
  picture: common_DesignPicture | null | undefined,
): boolean {
  return !!liveLayerRev(band.layers, picture?.media?.id);
}

/**
 * THE ARMED CHIP RETIRES WHEN ITS OWN RUN EXISTS — the successor state, not a cleanup.
 *
 * `fix: FRONT, BACK` is a QUESTION being composed; a live run stating that same selection is the
 * same question already paid for. Leaving both on screen keeps the generation form hiding its views
 * matrix for a request that has already been sent, so three organs describe a run that is not the
 * next one. The prototype clears `state.ui.fixCtx` at launch for exactly this reason
 * (`proto.html:4549`) and nothing on the receiving side of this client does it.
 *
 * THE MATCH IS EXACT, AND THE FIRST VERSION OF THIS WAS NOT — it retired the chip as soon as ANY
 * armed slot had a live run, which was measured wrong the moment a selection was more than one
 * slot: a fix of FRONT already in flight silently cancelled a freshly armed {FRONT, BACK, cuff}
 * before the human could press GENERATE, and the screen simply forgot what they had asked for.
 * The run started FROM this chip states exactly this selection, so exact is the only test that
 * distinguishes it from an unrelated neighbour.
 *
 * It is mounted ONCE by the bench rather than by each slot: a per-slot copy is what made the wrong
 * question ask-able in the first place, since one slot cannot see the selection it belongs to.
 */
export function useRetireArmedFix(band: GetDesignBandResponse): void {
  const { target, cancel } = useFixContext();
  useEffect(() => {
    if (!target) return;
    const sent = (band.runs ?? []).some((run) => {
      if (!isRunLive(run)) return false;
      const selection = fixSelectionOf(run);
      if (selection.views.length !== target.viewKeys.length) return false;
      if (selection.slotIds.length !== target.slotIds.length) return false;
      return (
        target.viewKeys.every((v) => selection.views.includes(v)) &&
        target.slotIds.every((id) => selection.slotIds.includes(id))
      );
    });
    if (sent) cancel();
  }, [band, target, cancel]);
}

/* ─────────────────────────────── the two state strips ─────────────────────────────── */

export function FixBars({
  band,
  techCardId,
  viewKey,
  slotId,
  label,
  slotRef,
  slotRev,
  current,
  emptySlot,
  disabled,
  onPutIn,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** The normalised silhouette key this slot answers to; '' for a detail, which uses `slotId`. */
  viewKey: string;
  /** `design_bench_slot(id)` for a detail; 0 for a side, which is addressed by its view key. */
  slotId?: number;
  label: string;
  slotRef: DesignBenchSlotRef;
  slotRev: number;
  current: common_DesignPicture | null;
  /** The slot has no plate right now — the strips say so rather than disappearing (Г4/R10). */
  emptySlot?: boolean;
  disabled?: boolean;
  /** The bench's own optimistic placement, so a fix lands through the SAME write as every other. */
  onPutIn: (pictureId: number) => void;
}): JSX.Element | null {
  const [compareOpen, setCompareOpen] = useState(false);
  const { target, cancel } = useFixContext();

  const running = useMemo(() => runningFix(band, viewKey, slotId), [band, viewKey, slotId]);
  const candidate = useMemo(() => fixCandidate(band, viewKey, slotId), [band, viewKey, slotId]);
  const elapsed = useElapsed(running?.startedAt ?? running?.createdAt);

  const armed =
    !!target &&
    (viewKey
      ? target.viewKeys.includes(viewKey)
      : !!slotId && target.slotIds.includes(slotId));

  if (!viewKey && !slotId) return null;
  if (!armed && !running && !candidate) return null;

  return (
    <div className='space-y-1'>
      {armed && !running && (
        <CalloutBox tone='note' className='bg-bgColor'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1'>
            <Text size='nano' variant='uppercase' tracking='label' component='span'>
              <b>fix armed</b>
            </Text>
            <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
              {target && target.labels.length > 1
                ? `in this run with ${target.labels.length - 1} more — press GENERATE in the form`
                : 'the generation form is asking for this one — press GENERATE there'}
            </Text>
            <Button variant='secondary' size='xs' onClick={cancel} disabled={disabled}>
              cancel
            </Button>
          </div>
        </CalloutBox>
      )}

      {running && (
        // Dashed, like the prototype's `.fixrun`: this is a promise, not a fact yet.
        <div className='border border-dashed border-textInactiveColor px-2 py-1'>
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            <b>fix is running</b>
            {elapsed ? ` · ${elapsed}` : ''} ·{' '}
            {emptySlot
              ? 'the slot is empty — the fix will offer itself here'
              : 'the plate stays — the card is printable'}
          </Text>
        </div>
      )}

      {candidate && (
        <CalloutBox tone='note' className='border-textColor bg-bgColor'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1'>
            <Text size='nano' variant='uppercase' tracking='label' component='span'>
              <b>fix is in</b>
            </Text>
            <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
              {[
                (candidate.run.ask ?? '').trim() ? `«${(candidate.run.ask ?? '').trim()}»` : '',
                clockStamp(candidate.run.completedAt ?? candidate.run.createdAt),
                (candidate.run.author ?? '').trim(),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <span className='flex flex-wrap items-center gap-1'>
              <Button variant='secondary' size='xs' onClick={() => setCompareOpen(true)}>
                compare ▸
              </Button>
              <Button
                variant='secondary'
                size='xs'
                disabled={disabled}
                onClick={() => onPutIn(candidate.picture.id ?? 0)}
              >
                put it in
              </Button>
            </span>
          </div>
          <CompareModal
            open={compareOpen}
            onOpenChange={setCompareOpen}
            techCardId={techCardId}
            slotLabel={label}
            slotRef={slotRef}
            slotRev={slotRev}
            current={current}
            candidate={candidate.picture}
            disabled={disabled}
          />
        </CalloutBox>
      )}
    </div>
  );
}

/* ─────────────────────────────── the multiple selection ─────────────────────────────── */

export type FixSelection = {
  keys: readonly string[];
  has: (key: string) => boolean;
  toggle: (key: string) => void;
  replace: (keys: readonly string[]) => void;
  clear: () => void;
};

/**
 * WHICH SLOTS A PERSON MEANS TO FIX — a transient tick list, and deliberately not persisted.
 *
 * It lives in the bench because the bench draws both the ticks and the bar that acts on them. It is
 * NOT the fix context: that one holds the selection a run is being composed FROM and is read by the
 * generation form; this one is the human's shortlist and is read by nothing outside this block. The
 * two are separate because they retire at different moments — the shortlist survives an armed fix
 * being cancelled, and a fix already sent survives the ticks being cleared.
 */
export function useFixSelection(): FixSelection {
  const [keys, setKeys] = useState<readonly string[]>([]);
  const has = useCallback((key: string) => keys.includes(key), [keys]);
  const toggle = useCallback(
    (key: string) =>
      setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])),
    [],
  );
  const replace = useCallback((next: readonly string[]) => setKeys([...next]), []);
  const clear = useCallback(() => setKeys([]), []);
  return useMemo(() => ({ keys, has, toggle, replace, clear }), [keys, has, toggle, replace]);
}

/**
 * One tickable slot, as the bench knows it — a side carries `viewKey`, a detail carries `slotId`,
 * and exactly one of the two is set. The TICK ITSELF is drawn by `bench-slot.tsx` from a plain
 * checkbox rather than by a component exported from here: the slot must not import this module, or
 * the band's cheapest organ would drag the fix context, the run readers and the compare dialog into
 * its own module graph.
 */
export type FixTargetSlot = {
  key: string;
  /** front | back | side_l | side_r, or '' for a detail. */
  viewKey: string;
  /** `design_bench_slot(id)` for a detail, or 0 for a side. */
  slotId: number;
  label: string;
  picture: common_DesignPicture;
};

/**
 * THE SELECTION BAR — a header row of FLAT SLOTS, next to the sheet bar and the mixed-provenance
 * warning, because it is a statement about the whole block and not about one slot.
 *
 * ONE RUN, THE WHOLE SELECTION. This is W-10 as the owner stated it — «select everything in FLAT
 * SLOTS and make one correction across it» — and it is expressible only because the wire carries
 * `fix_targets` and `fix_slot_ids` as lists. While the field was a scalar the honest performance of
 * this bar was three separate paid runs; it is now one, and the money says so.
 *
 * THE TICKS ARE CLEARED WHEN THE FIX IS ARMED, not when it comes back. What they mean is «this is
 * what I am about to ask for»; once the ask exists as a chip on the form, keeping them would leave
 * two organs claiming to hold the same pending intention, and cancelling one would not clear the
 * other.
 */
export function FixSelectionBar({
  band,
  targets,
  selection,
  disabled,
}: {
  band: GetDesignBandResponse;
  /** Every slot a fix may legally address, in bench order. */
  targets: readonly FixTargetSlot[];
  selection: FixSelection;
  disabled?: boolean;
}): JSX.Element | null {
  const { start } = useFixContext();

  const ticked = targets.filter((t) => selection.has(t.key));
  const marked = ticked.filter((t) => unflattenedMarks(band, t.picture));

  // One filled slot needs no shortlist — its own `fix ▸` is the shorter road. The bar appears when
  // there is actually something to choose between.
  if (targets.length < 2) return null;

  const armTicked = () => {
    if (!ticked.length || disabled) return;
    start({
      viewKeys: ticked.filter((t) => t.viewKey).map((t) => t.viewKey),
      slotIds: ticked.filter((t) => t.slotId > 0).map((t) => t.slotId),
      labels: ticked.map((t) => t.label),
    });
    selection.clear();
  };

  return (
    <CalloutBox tone='note' className='bg-bgColor'>
      <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1'>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          <b>fix</b>
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          {ticked.length
            ? `${ticked.length} of ${targets.length} slots ticked`
            : `tick what is not right — ${targets.length} slots can go into one fix`}
        </Text>
        <span className='ml-auto flex flex-wrap items-center gap-1'>
          <Button
            variant='secondary'
            size='xs'
            onClick={() => selection.replace(targets.map((t) => t.key))}
            disabled={ticked.length === targets.length}
          >
            select all
          </Button>
          <Button
            variant='secondary'
            size='xs'
            onClick={selection.clear}
            disabled={ticked.length === 0}
          >
            clear
          </Button>
          <Button
            variant='secondary'
            size='xs'
            onClick={armTicked}
            disabled={!!disabled || ticked.length === 0}
          >
            fix {ticked.length > 1 ? `${ticked.length} slots` : ticked[0]?.label ?? ''} ▸
          </Button>
        </span>
      </div>

      <Text size='nano' variant='label' component='p' className='mt-1'>
        A fix reads the PLATES in the slots, not the references. Every ticked slot goes into ONE run
        with one phrase — sides by their view, details by their own address — so a correction across
        the whole garment is paid for once.
      </Text>

      {marked.length > 0 && (
        // THE ONE THING THIS SCREEN MUST NOT LET SOMEBODY ASSUME. «Already marked up» is what W-10
        // asks for, and the marks live in an edit layer, not in the picture — see `unflattenedMarks`.
        <Text size='nano' component='p' className='mt-1 text-warning'>
          {marked.map((t) => t.label).join(', ')} carr{marked.length === 1 ? 'ies' : 'y'} edit ▸
          marks on a layer OVER the plate, and a run reads the plate. Flatten them first (edit ▸ →
          save as picture) or the model never sees those lines.
        </Text>
      )}
    </CalloutBox>
  );
}
