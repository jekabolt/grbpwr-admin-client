import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';

import { AskModal } from '../core';
import { applyPlan, type SplitPiece } from '../render/apply-split';
import { benchSides } from '../render/model';
import { designKeys, useDesignWrites } from '../use-design-band';
import { ACTIVE_VIEWS, isActiveView, normaliseViewKey, viewLabel, type ActiveView } from '../views';
import { isPictureHidden } from '../visibility';

/**
 * ═══ APPLY FLAT SLOTS — THE CUT PIECES ON THE BENCH INTO THEIR SIDES, ONE PRESS (item 27) ════════
 *
 * Owner, verbatim: «в LATEST GENERATION в хедере если у нас засплитанная картинка сделай как CLEAR
 * THE INPUT ✕ только apply flat slots». The header action of FLAT's LATEST GENERATION, styled as
 * INPUT — REFERENCES' `clear the input ✕`: an underlined word (`underline`/`xs`, item 32).
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

/**
 * ═══ THE CUT GOES INTO THE SLOTS BY ITSELF (82-INPUT-REDESIGN §4.1) ═════════════════════════════
 * `views again` asks for the four slots to be drawn again, so the newest flat run's cut is applied
 * without a press — once per run (localStorage, best effort: a reload or a second tab does not do
 * it twice), only when its pieces cover all four sides, and only for a run that finished within
 * `AUTO_APPLY_MS` (an old run opened later is never written behind the person's back). A filled
 * side is overwritten; a refusal leaves the door `apply flat slots` as it always was.
 */
const AUTO_KEY = 'grbpwr.design.flat.autoapply';
const AUTO_APPLY_MS = 30 * 60_000;

function claimAutoApply(runId: number): boolean {
  if (runId <= 0) return false;
  let ids: number[] = [];
  try {
    const v = JSON.parse(window.localStorage.getItem(AUTO_KEY) || '[]') as unknown;
    if (Array.isArray(v)) ids = v.map(Number).filter((n) => n > 0);
  } catch {
    /* no storage — the press below still happens once in this mount */
  }
  if (ids.includes(runId)) return false;
  try {
    window.localStorage.setItem(AUTO_KEY, JSON.stringify([...ids, runId].slice(-200)));
  } catch {
    /* best effort */
  }
  return true;
}

export function autoApplies(
  run: Pick<common_DesignRun, 'id' | 'createdAt' | 'completedAt'> | null | undefined,
  usable: readonly SplitPiece[],
  now = Date.now(),
): boolean {
  if (!run || (run.id ?? 0) <= 0) return false;
  const views = new Set(usable.map((p) => p.view));
  if (!ACTIVE_VIEWS.every((v) => views.has(v))) return false;
  const at = Date.parse(run.completedAt || run.createdAt || '');
  return Number.isFinite(at) && now - at <= AUTO_APPLY_MS;
}

export function ApplyFlatSlots({
  band,
  techCardId,
  pieces,
  disabled,
  autoRun = null,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** The cut pieces standing on the bench, in the row's order. */
  pieces: readonly common_DesignPicture[];
  disabled?: boolean;
  /** The newest flat views run these pieces were cut from — applied once without a press. */
  autoRun?: common_DesignRun | null;
}): JSX.Element | null {
  const qc = useQueryClient();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const usable = useMemo(() => flatPiecesOf(pieces), [pieces]);
  const steps = useMemo(() => flatSlotSteps(band, usable), [band, usable]);

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

  const autoId = autoRun?.id ?? 0;
  const autoNow = !disabled && !busy && steps.length > 0 && autoApplies(autoRun, usable);
  useEffect(() => {
    if (!autoNow || !claimAutoApply(autoId)) return;
    void run(approve());
    // `run` and `approve` read this render's steps; the claim makes it once per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNow, autoId]);

  // Hidden while nothing would be written — but never mid-gesture, so the pending state stays seen.
  if (!steps.length && !busy) return null;

  const losing = steps.filter((s) => s.displaces);
  const words = (list: typeof steps) => list.map((s) => viewLabel(s.view)).join(', ');

  return (
    <>
      {/* Item 29: «APPLY FLAT SLOTS сделай не кнопкой а текст с подчеркиванием» — the underline
          variant, the same quiet word as the render bench's `put the N pieces into sides ▸`. */}
      <Button
        type='button'
        variant='underline'
        size='xs'
        className='text-labelColor hover:text-textColor'
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
