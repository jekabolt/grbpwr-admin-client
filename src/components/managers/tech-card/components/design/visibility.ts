import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

/**
 * THE visibility selector of the DESIGN band. There is exactly one, and every reader — bench,
 * input strips, pickers, upload shelf, print — goes through it.
 *
 * ONE PERSISTENT WORD OF INVISIBILITY, AND IT IS `hidden`. `DesignPicture.hidden_at` is the only
 * stored fact that takes a picture out of sight, it is reversible, and it destroys nothing. The
 * server owns the guard that decides whether a picture MAY be hidden at all; this module owns the
 * reading.
 *
 * `archived` IS NOT A SECOND REGISTER. Archiving a run collapses its ROW in the feed and puts a
 * badge on the run — it does not hide a single picture. A plate from an archived run standing in a
 * bench slot keeps standing there, keeps its thumbnail and keeps its provenance; the slot simply
 * says «run 8 · archived». The moment archive starts filtering pictures we own two registers of
 * invisibility, and the state «a slot points at a run that exists nowhere» becomes reachable. That
 * is why the two live in one file with one vocabulary and neither is expressed in terms of the
 * other.
 *
 * THE HIDDEN COUNTERS COME IN A PAIR, AND THE PAIR IS NOT FOLDABLE. The band answers `hidden_by_run`
 * AND `hidden_by_batch`, because an uploaded picture has `run_id = 0`: folding the two would make
 * «run 0» a magic key meaning «everything ever uploaded». Both readers below name their register in
 * their own name, and no function here takes a bare «producer id».
 *
 * Three things deliberately absent from the dictionary, so nobody adds a third register by
 * accident:
 *  - collapsed feed rows and pagination are TRANSIENT UI, not visibility;
 *  - a moodboard tile is MEMBERSHIP IN THE DOCUMENT — a «hidden» moodboard tile does not exist;
 *  - erasing bytes is a different storey with its own guard (GetMediaUsage), not built here.
 *
 * Pure functions only: no state, no queries, no React.
 */

/** The proto zero instant. An unset Timestamp reaches us as one of four spellings — see below. */
const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

/**
 * Is a wire Timestamp actually set?
 *
 * FOUR spellings are real and all four mean «no»: the key is absent (`undefined`), the gateway
 * marshals an unpopulated message as an explicit `null` (EmitUnpopulated) even though the generated
 * type says `string | undefined`, a hand-built payload carries `''`, and a stored zero instant
 * serialises as `0001-01-01T00:00:00Z`. A presence test that knows only `undefined` reports every
 * hidden picture as visible on a live response.
 */
export function stampIsSet(stamp?: string | null): boolean {
  return !!stamp && stamp !== ZERO_TIMESTAMP;
}

export type PictureVisibility = Pick<common_DesignPicture, 'id' | 'hiddenAt'>;
export type RunVisibility = Pick<common_DesignRun, 'id' | 'archivedAt'>;

export function isPictureHidden(picture: PictureVisibility): boolean {
  return stampIsSet(picture.hiddenAt);
}

export function isRunArchived(run: RunVisibility): boolean {
  return stampIsSet(run.archivedAt);
}

export function countHiddenPictures(pictures: readonly PictureVisibility[]): number {
  return pictures.reduce((n, p) => n + (isPictureHidden(p) ? 1 : 0), 0);
}

export function countArchivedRuns(runs: readonly RunVisibility[]): number {
  return runs.reduce((n, r) => n + (isRunArchived(r) ? 1 : 0), 0);
}

/**
 * The pictures a feed row shows — a run row or an upload-shelf row, the rule is the same.
 *
 * `revealHidden` is that row's own «· k hidden ▸» toggle and nothing else: it is transient UI,
 * scoped to ONE row, and it never reaches a picker (see selectPickablePictures). Note that the
 * run's archived flag is not consulted here at all — an archived run's pictures are live.
 */
export function selectVisiblePictures<T extends PictureVisibility>(
  pictures: readonly T[],
  options?: { revealHidden?: boolean },
): T[] {
  if (options?.revealHidden) return [...pictures];
  return pictures.filter((p) => !isPictureHidden(p));
}

/**
 * The pictures an input strip, a slot picker or a mint composition may offer.
 *
 * Deliberately WITHOUT a reveal escape hatch: a hidden picture must not be reachable from any
 * picker, and a boolean parameter here is exactly how it would become reachable. The row toggle is
 * a different question asked by a different organ.
 */
export function selectPickablePictures<T extends PictureVisibility>(pictures: readonly T[]): T[] {
  return pictures.filter((p) => !isPictureHidden(p));
}

/**
 * The run rows the feed shows. Archived rows are collapsed OUT until the section's own toggle asks
 * for them — the only place in the band where `archived` filters anything, and it filters ROWS,
 * never pictures.
 *
 * DEAD PATH IN THIS WAVE, AND SAID SO ON PURPOSE: the generative machine is cut, there is no
 * GENERATE button, the run-history section is ABSENT rather than empty, and beta will hold zero
 * runs. The live path tonight is batch → picture → slot. Kept because the rule is the same one the
 * shelf reads for its own rows, and because archive is exactly the sort of thing that gets
 * re-implemented differently when it is deleted and reintroduced.
 */
export function selectHistoryRuns<T extends RunVisibility>(
  runs: readonly T[],
  options?: { showArchived?: boolean },
): T[] {
  if (options?.showArchived) return [...runs];
  return runs.filter((r) => !isRunArchived(r));
}

/**
 * The two hidden-count aggregates of the band, read by the register they belong to.
 *
 * They are computed over the WHOLE producer, not over the loaded page — which is the point: a
 * collapsed row must state its own total, and counting the pictures the page happened to ship would
 * make the header lie by exactly the amount that is off screen.
 */
export type HiddenAggregates = Pick<GetDesignBandResponse, 'hiddenByRun' | 'hiddenByBatch'>;

export function hiddenCountOfRun(aggregates: HiddenAggregates, runId: number): number {
  return aggregates.hiddenByRun?.[String(runId)] ?? 0;
}

export function hiddenCountOfBatch(aggregates: HiddenAggregates, batchId: number): number {
  return aggregates.hiddenByBatch?.[String(batchId)] ?? 0;
}

/**
 * Why this picture cannot be hidden — the four server preconditions of HideDesignPicture, read
 * client-side so the ✕ is ABSENT rather than drawn-and-refused.
 *
 * The strings are the server's own error codes, so a refusal that slips through anyway (a race:
 * someone puts the picture in a slot between render and click) names the same reason the UI would
 * have named, instead of a second vocabulary for one fact.
 */
export type HideBlockReason = 'in_slot' | 'in_version' | 'live_run_input' | 'live_crop_parent';

/**
 * What the caller must gather for the guard. Sets, not arrays, because the caller holds one band
 * response and asks this per tile — a linear scan per tile is O(pictures × slots) on a card with
 * hundreds of pictures.
 */
export type HideGuard = {
  /** Picture ids standing in a bench slot right now. */
  slotPictureIds: ReadonlySet<number>;
  /** Picture ids frozen as a plate of ANY minted sheet version. */
  versionPlatePictureIds: ReadonlySet<number>;
  /** Picture ids listed in the input snapshot of a run that is pending or running. */
  liveRunInputPictureIds: ReadonlySet<number>;
  /** Picture ids that are the `derived_from` parent of a picture that still exists. */
  cropParentPictureIds: ReadonlySet<number>;
};

export function hideBlockReason(pictureId: number, guard: HideGuard): HideBlockReason | null {
  // Order matches the server's, so the reason a human reads is the reason the server would give.
  if (guard.slotPictureIds.has(pictureId)) return 'in_slot';
  if (guard.versionPlatePictureIds.has(pictureId)) return 'in_version';
  if (guard.liveRunInputPictureIds.has(pictureId)) return 'live_run_input';
  if (guard.cropParentPictureIds.has(pictureId)) return 'live_crop_parent';
  return null;
}

/**
 * May the ✕ be drawn on this tile at all? An already-hidden picture answers `false` — its control
 * is `unhide`, which no guard blocks: un-hiding can never break a slot or a frozen version.
 */
export function canOfferHide(picture: PictureVisibility, guard: HideGuard): boolean {
  if (isPictureHidden(picture)) return false;
  return hideBlockReason(picture.id ?? 0, guard) === null;
}

/** An empty guard, for a caller that has not loaded the band yet. Blocks nothing. */
export function emptyHideGuard(): HideGuard {
  return {
    slotPictureIds: new Set(),
    versionPlatePictureIds: new Set(),
    liveRunInputPictureIds: new Set(),
    cropParentPictureIds: new Set(),
  };
}
