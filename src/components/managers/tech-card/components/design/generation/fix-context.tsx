import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { readBench } from '../bench-slot';
import { MarkedPlatesModal, markedPlatesOf } from '../fix-markup';
import { viewLabel } from '../views';

/**
 * FIX MODE — «generate this side again, from the bench rather than from the references».
 *
 * It is transient state shared by two organs that must not own it: the BENCH asks for a fix (the
 * `fix ▸` door sits under a slot), and the GENERATION FORM carries it out. Neither can hold it —
 * the bench would have to reach into the form, the form would have to know which slot asked — so it
 * lives above both, exactly like `pick-mode.tsx`, and for exactly the same reason.
 *
 * IT IS NOT PART OF THE CARD. A fix context that survived a reload would be a screen that looks
 * broken for reasons no field explains, so it dies on Esc and on unmount and is never persisted.
 *
 * WHAT A FIX ACTUALLY CHANGES, and why the form cannot simply add a checkbox: `params.fix_targets`
 * replaces the whole question. The views matrix and the layout switch are NOT drawn while a fix is
 * armed, because a fix asks for the SIDES ALREADY ON THE BENCH — leaving them on screen would make
 * three organs lie at once (the ticks, the count and the price line), each of them about a request
 * the server is not being sent. The prototype notes the same rule as П4.
 *
 * IT IS A SELECTION, NOT ONE SIDE — and that is the shape of the wire rather than a convenience.
 * `DesignRunParams` carries `fix_targets` (silhouette view keys) and `fix_slot_ids` (details, by
 * address) as ONE selection: «select everything in FLAT SLOTS» is W-10, and it was unexpressible
 * while the field was a scalar — three marked-up plates and one correction across them would have
 * been three paid runs.
 *
 * WHY THE DETAILS TRAVEL AS IDS. A bare view key cannot tell two details apart, and this list is
 * frozen into the run's history where an ambiguous target could never be repaired afterwards. The
 * scalar `fix_target` still exists on the wire and is deliberately NOT written by anything here: it
 * is what already-frozen rows say, and a reader takes the array when it is non-empty and falls back
 * to the scalar otherwise.
 */

export type FixTarget = {
  /** front | back | side_l | side_r — normalised, as the wire spells them. May be empty. */
  viewKeys: string[];
  /** `design_bench_slot(id)` of every detail in the selection. May be empty. */
  slotIds: number[];
  /** What to say out loud, in the order the bench draws them: FRONT, SIDE L, cuff. */
  labels: string[];
};

type FixContextValue = {
  target: FixTarget | null;
  start: (target: FixTarget) => void;
  cancel: () => void;
};

/**
 * DEFAULT IS INERT, and that is deliberate. An organ rendered outside the provider reports «no fix
 * armed» and draws nothing, rather than throwing — the same failure posture `capability.tsx` takes.
 * A bench mounted without the provider therefore has a `fix ▸` that quietly does nothing, which is
 * the mount error showing itself as silence rather than as a crash.
 */
const FixCtx = createContext<FixContextValue>({
  target: null,
  start: () => {},
  cancel: () => {},
});

export function FixContextProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<FixTarget | null>(null);
  const cancel = useCallback(() => setTarget(null), []);

  // Esc cancels, and the bar promises it in words — so it has to be true even when focus is nowhere
  // in particular. Same document-level listener, same reason, as pick mode's.
  //
  // ESC BELONGS TO THE TOPMOST LAYER. A dialog can stand open OVER an armed fix — the marked-plates
  // preview, a compare, the vector editor — and the press that closes it must not ALSO throw away
  // the selection underneath: this listener runs in the capture phase, i.e. before the dialog's
  // own handling, and without the guard one Esc did both at once (measured on the probe stand —
  // closing the preview silently degraded the armed fix into an ordinary front+back run).
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        e.stopPropagation();
        setTarget(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [target]);

  const value = useMemo<FixContextValue>(
    () => ({ target, start: setTarget, cancel }),
    [target, cancel],
  );

  return <FixCtx.Provider value={value}>{children}</FixCtx.Provider>;
}

export function useFixContext(): FixContextValue {
  return useContext(FixCtx);
}

/**
 * THE FIX BAR — what the run is about to be given, said before it is paid for.
 *
 * It names the OTHER filled slots because those are the inputs: a fix reads the bench, not the
 * references, and the difference decides what comes back. `none filled` is stated rather than
 * hidden — a fix with an empty bench is a legal request and a bad one, and the human should see
 * which of the two they are making.
 */
export function FixContext({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId?: number;
  disabled?: boolean;
}) {
  const { target, cancel } = useFixContext();
  // ABOVE the early return, or the hook count changes with the armed state and React #310 takes the
  // whole tree down — this screen has already paid an evening for exactly that.
  const [marksOpen, setMarksOpen] = useState(false);
  if (!target) return null;

  const bench = readBench(band);
  const others = bench.sides
    .filter((s) => !target.viewKeys.includes(s.view) && (s.slot?.pictureId ?? 0) > 0)
    .map((s) => viewLabel(s.view));

  // The slots of THIS selection whose plates carry a live edit layer — those marks travel (W-10).
  const marked = markedPlatesOf(band, target);

  return (
    <CalloutBox tone='note' className='bg-bgColor'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <Text size='micro' component='span' className='uppercase tracking-label'>
          {/* Каждая выбранная сторона названа. «fix: 3 slots» звучит короче и не даёт проверить
              состав ровно там, где за него сейчас заплатят. */}
          <b>fix: {target.labels.join(', ')}</b>
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          inputs: the slots ({others.length ? others.join(', ') : 'none filled'}) — the same
          GENERATE and the same money; what comes back lands in the history and displaces nothing by
          itself.
        </Text>
        <span className='ml-auto'>
          <Button variant='secondary' size='xs' onClick={cancel} disabled={disabled}>
            cancel fix
          </Button>
        </span>
      </div>

      {/* THE MARKED PLATES ARE NAMED WHERE THE MONEY IS ABOUT TO BE SPENT, and they can be SEEN —
          a count alone asks the human to pay for files nobody showed them. The rasters travel in
          `extra_input_media_ids`, taken fresh at launch; `fix-markup.tsx` holds the whole story. */}
      {marked.length > 0 && (
        <div className='mt-1 flex flex-wrap items-baseline gap-2'>
          <Text size='nano' variant='label' component='span' className='min-w-0'>
            {marked.map((p) => p.label).join(', ')} go{marked.length === 1 ? 'es' : ''} in already
            marked up — plate + edit ▸ marks as one extra picture each, pressed in at GENERATE.
          </Text>
          {!!techCardId && (
            <>
              <Button variant='secondary' size='xs' onClick={() => setMarksOpen(true)}>
                see what travels ▸
              </Button>
              <MarkedPlatesModal
                open={marksOpen}
                onOpenChange={setMarksOpen}
                techCardId={techCardId}
                band={band}
                sel={target}
              />
            </>
          )}
        </div>
      )}
    </CalloutBox>
  );
}
