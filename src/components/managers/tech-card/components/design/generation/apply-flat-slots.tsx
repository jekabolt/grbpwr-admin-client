import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';

import { AskModal } from '../core';
import { applyPlan, type SplitPiece } from '../render/apply-split';
import { benchSides } from '../render/model';
import { designKeys, useDesignWrites } from '../use-design-band';
import { isActiveView, normaliseViewKey, viewLabel, type ActiveView } from '../views';
import { isPictureHidden } from '../visibility';

/**
 * ═══ APPLY FLAT SLOTS — THE CUT PIECES ON THE BENCH INTO THEIR SIDES, ONE PRESS (item 27) ════════
 *
 * Owner, verbatim: «в LATEST GENERATION в хедере если у нас засплитанная картинка сделай как CLEAR
 * THE INPUT ✕ только apply flat slots». The header action of FLAT's LATEST GENERATION, styled as
 * INPUT — REFERENCES' `clear the input ✕` (`secondary`/`xs`).
 *
 * The plan is the render bench's (`applyPlan`, W4 / E-6), read over the FLAT bench, PLACES ONLY: a
 * side the cut does not name is left as it is (the owner asked to put pieces in, not to empty the
 * slots). A piece whose view is not one of the four sides (a detail, a retired three-quarter) is
 * skipped; of two pieces naming one side the first in the row's order wins, as `piecesOf` does.
 *   · nothing to place (no piece names a side, or every piece already stands in its side) → no door;
 *   · a side holding another picture → asked once, by name, before any write;
 *   · in flight → the door is locked and pending until the last write's band re-read has landed
 *     (TF4: `setBenchSlot` settles on the refetch), so a second press never echoes a stale rev;
 *   · a side whose occupant changed after the person approved → the gesture stops and asks again;
 *   · a refused write → the gesture stops, and stays pending until the band is read again.
 * Each side is its own write (the server has no batch verb); the write's own toast names a refusal. The flat bench carries no colourway, so the
 * write spells `kind: 'flat'` with colourway 0 (invariant 4).
 */
export function flatPiecesOf(pieces: readonly common_DesignPicture[]): SplitPiece[] {
  const seen = new Set<string>();
  const out: SplitPiece[] = [];
  for (const picture of pieces) {
    if (isPictureHidden(picture) || (picture.id ?? 0) <= 0) continue;
    const view = normaliseViewKey(picture.ghostView);
    if (!isActiveView(view) || seen.has(view)) continue;
    seen.add(view);
    out.push({ view: view as ActiveView, picture });
  }
  return out;
}

/** The writes the door would make against this band: places only. */
export function flatSlotSteps(band: GetDesignBandResponse, pieces: SplitPiece[]) {
  return applyPlan(benchSides(band, 'flat'), pieces).filter((s) => s.act === 'place');
}

export function ApplyFlatSlots({
  band,
  techCardId,
  pieces,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** The cut pieces standing on the bench, in the row's order. */
  pieces: readonly common_DesignPicture[];
  disabled?: boolean;
}): JSX.Element | null {
  const qc = useQueryClient();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const usable = useMemo(() => flatPiecesOf(pieces), [pieces]);
  const steps = useMemo(() => flatSlotSteps(band, usable), [band, usable]);

  // Hidden while nothing would be written — but never mid-gesture, so the pending state stays seen.
  if (!steps.length && !busy) return null;

  /**
   * `approved` — WHAT THE PERSON AGREED TO LOSE, per side: the occupant's id (0 = an empty side) as
   * the screen showed it when they pressed or confirmed. Each write re-plans on the band the last
   * write re-read (TF4), and a side whose occupant is no longer the approved one (another operator
   * filled or changed it meanwhile) stops the gesture and asks again: nothing is replaced unseen.
   * A refused write stops it too, and the door stays pending until the band is read again — the
   * next press must echo the side's new rev, not the one that was just refused.
   */
  const run = async (approved: ReadonlyMap<ActiveView, number>) => {
    if (busy) return;
    setBusy(true);
    let reask = false;
    try {
      for (const [view, occupant] of approved) {
        const fresh = qc.getQueryData<GetDesignBandResponse>(designKeys.band(techCardId)) ?? band;
        const step = flatSlotSteps(fresh, usable).find((s) => s.view === view);
        if (!step) continue;
        if ((step.displaces?.id ?? 0) !== occupant) {
          reask = true;
          break;
        }
        try {
          await setBenchSlot.mutateAsync({
            slot: { viewKey: step.view, kind: 'flat', colorwayId: 0 },
            pictureId: step.pictureId,
            expectedSlotRev: step.slotRev,
          });
        } catch {
          // The write's own `onError` says why. Stop, and hold until the re-read has landed.
          await qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
          break;
        }
      }
    } finally {
      setBusy(false);
    }
    if (reask) setAsking(true);
  };
  const approve = () => new Map(steps.map((s) => [s.view, s.displaces?.id ?? 0] as const));

  const losing = steps.filter((s) => s.displaces);
  const words = (list: typeof steps) => list.map((s) => viewLabel(s.view)).join(', ');

  return (
    <>
      <Button
        type='button'
        variant='secondary'
        size='xs'
        data-apply-flat-slots={steps.length}
        loading={busy}
        disabled={disabled || busy}
        title={
          losing.length
            ? `${words(steps)} take the pieces; ${words(losing)} ${losing.length === 1 ? 'holds' : 'hold'} another flat — you are asked first`
            : `${words(steps)} take the pieces`
        }
        onClick={() => (losing.length ? setAsking(true) : void run(approve()))}
      >
        apply flat slots
      </Button>
      <AskModal
        open={asking}
        onClose={() => setAsking(false)}
        title='replace flats in the slots?'
        verb='apply flat slots'
        note={null}
        onDo={() => {
          setAsking(false);
          void run(approve());
        }}
        sentence={
          <span className='block normal-case'>
            <b>{words(steps)}</b> take the pieces.{' '}
            {losing.length > 0 && (
              <>
                <b>{words(losing)}</b>{' '}
                {losing.length === 1 ? 'holds another flat' : 'hold other flats'} now, and{' '}
                {losing.length === 1 ? 'it leaves its slot' : 'they leave their slots'}.{' '}
              </>
            )}
            Nothing is deleted.
          </span>
        }
      />
    </>
  );
}
