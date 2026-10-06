import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';

import { pictureBenchKind } from '../bench-kinds';
import { readBench } from '../bench-slot';
import { isPictureHidden, isRunArchived, stampIsSet } from '../visibility';
import { standsOnBench } from './edit-chain';
import { runStatus } from './run-state';

/**
 * ═══ A DETAIL RUN'S PICTURE GOES INTO ITS SLOT BY ITSELF (82-INPUT-REDESIGN §8, 91-LIVE D1) ═══════
 *
 * A detail-only run (`views = ['detail']`, `detailSlotIds = [id]`, n = 1) names the slot it draws
 * for; the person picked that slot in `target ▾`. So the picture lands there without a press, as
 * the views' cut lands in the four sides (`ApplyFlatSlots`, §4.1) — and the slot, filled and fresh,
 * leaves the picker (`flatTargets`). The rule, pure, against the band as read:
 *   · the run is a finished (`done`) flat run, not archived, that names exactly ONE detail slot,
 *     and finished within `DETAIL_AUTO_MS` — an old run opened later is never written behind the
 *     person's back;
 *   · it is the NEWEST run for that slot: any later run naming the same slot (live, failed or
 *     done) owns it;
 *   · it brought exactly one picture that stands on the bench (visible, not replaced, a flat
 *     plate) — two (an edit already made) means somebody is working, and the door `slot ▾` stays;
 *   · that picture stands in no slot yet;
 *   · the slot still exists on the flat bench, and NOBODY TOUCHED IT since the run was asked for:
 *     its `setAt` is not later than the run's `createdAt`, and its occupant (if any) is not from a
 *     newer run. An occupant the person had before pressing (a stale detail they asked to redraw)
 *     is replaced — that is what the press asked for; one they placed, discarded or kept while the
 *     run was drawing is theirs (`kept` / `keptAt` too: a keep does not move `setAt`), and nothing
 *     is written;
 *   · an ARCHIVED newer run for the slot still owns it (archiving is presentational).
 * The write echoes the slot's rev (CAS): a write between this read and the server refuses it.
 */
export const DETAIL_AUTO_MS = 30 * 60_000;

export type DetailPlacement = {
  runId: number;
  slotId: number;
  pictureId: number;
  /** The rev of the slot as read — the CAS token of the write. */
  slotRev: number;
};

const at = (stamp: string | null | undefined): number =>
  stampIsSet(stamp) ? Date.parse(stamp as string) : NaN;

const isFlatRun = (run: Pick<common_DesignRun, 'kind'>) =>
  (run.kind ?? '').trim().toLowerCase() === 'flat';

/** The one detail slot a run draws for; 0 = not a detail-only run. */
export function detailRunSlot(run: Pick<common_DesignRun, 'params'>): number {
  const views = run.params?.views ?? [];
  const ids = (run.params?.detailSlotIds ?? []).filter((id) => (id ?? 0) > 0);
  if (views.length !== 1 || (views[0] ?? '').trim().toLowerCase() !== 'detail') return 0;
  return ids.length === 1 ? ids[0] : 0;
}

/** What one finished detail run would place now, or `null` — the reason is the rule above. */
export function detailPlacementOf(
  band: Pick<GetDesignBandResponse, 'runs' | 'bench'>,
  run: common_DesignRun,
  now = Date.now(),
): DetailPlacement | null {
  const runId = run.id ?? 0;
  if (runId <= 0 || !isFlatRun(run) || isRunArchived(run) || runStatus(run) !== 'done') return null;
  const slotId = detailRunSlot(run);
  if (slotId <= 0) return null;
  const finished = at(run.completedAt) || at(run.createdAt);
  if (!Number.isFinite(finished) || now - finished > DETAIL_AUTO_MS) return null;
  const asked = at(run.createdAt);
  if (!Number.isFinite(asked)) return null;

  // The newest run for this slot owns it — an archived one too (archiving is presentational).
  const newer = (band.runs ?? []).some(
    (r) => (r.id ?? 0) > runId && isFlatRun(r) && detailRunSlot(r) === slotId,
  );
  if (newer) return null;

  const pictures = (run.pictures ?? []).filter(
    (p) => (p.id ?? 0) > 0 && !isPictureHidden(p) && standsOnBench(p),
  );
  if (pictures.length !== 1) return null;
  const picture = pictures[0];
  if (pictureBenchKind(picture) !== 'flat') return null;
  const pictureId = picture.id ?? 0;
  if ((band.bench ?? []).some((row) => (row.pictureId ?? 0) === pictureId)) return null;

  const slot = readBench(band as GetDesignBandResponse, 'flat').details.find(
    (d) => (d.id ?? 0) === slotId,
  );
  if (!slot) return null;
  const touched = at(slot.setAt);
  const occupied = (slot.pictureId ?? 0) > 0;
  // A filled slot whose write time is unknown cannot be proven untouched — left to the person.
  if (occupied && !Number.isFinite(touched)) return null;
  if (Number.isFinite(touched) && touched > asked) return null;
  if (occupied && (slot.picture?.runId ?? 0) > runId) return null;
  // A stale occupant the person KEPT is theirs: the picker offered it un-kept, so the keep came
  // after the press (a keep does not move `setAt`).
  if (occupied && (!!slot.kept || at(slot.keptAt) > asked)) return null;

  return { runId, slotId, pictureId, slotRev: slot.slotRev ?? 0 };
}

/** Every placement the band asks for now, one per slot (the newest run per slot is the only one). */
export function detailPlacements(
  band: Pick<GetDesignBandResponse, 'runs' | 'bench'>,
  now = Date.now(),
): DetailPlacement[] {
  const out: DetailPlacement[] = [];
  for (const run of band.runs ?? []) {
    const p = detailPlacementOf(band, run, now);
    if (p) out.push(p);
  }
  return out;
}
