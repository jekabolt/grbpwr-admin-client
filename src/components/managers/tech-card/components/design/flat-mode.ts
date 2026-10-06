import type {
  common_DesignFlatParams,
  common_DesignFlatStructureRef,
  common_DesignJoins,
  common_DesignRun,
  common_DesignRunParams,
} from 'api/proto-http/admin';

/**
 * ═══ THE THREE FLAT MODES (flat-consistency 81-FINAL-MODES, 06.10) ═════════════════════════════
 *
 *   photos     — the default: the kept reference photos (+ the join list in words when there is
 *                one); one sheet. GENERATE runs it with no decision asked.
 *   hand_flat  — «from my flat»: the card's own TECHNICAL flats are redrawn cleanly, the photos only
 *                give the fit; no join list. One sheet. One flat per role, front_flat / back_flat.
 *   straps     — «straps & openings»: the photos route with the designer-CONFIRMED join list; one
 *                sheet. The server refuses it (free) until the list is confirmed at its current rev.
 *
 * The server owns the count (`requested_outputs`) and every refusal — the client never assumes a
 * number of sheets. Absent `params.flat` IS photos, so photos sends nothing: the wire stays as it was
 * for every run that does not ask for a mode.
 *
 * A RERUN sends its parent's params whole (`latest-generation.tsx` retry), so the block travels by
 * itself; a FIX must copy it from the plate's run (`flatParamsForFix`) — a different block on a rerun
 * or fix is `mode_not_for_this_run`, and a fix without it would quietly redraw in the photos mode.
 */
export type FlatMode = 'photos' | 'hand_flat' | 'straps';

export const DEFAULT_FLAT_MODE: FlatMode = 'photos';

export const FLAT_MODE_WORD: Record<FlatMode, string> = {
  photos: 'photos',
  hand_flat: 'from my flat',
  straps: 'straps & openings',
};

export type StructureRole = 'front_flat' | 'back_flat';

export type StructurePick = { mediaId: number; role: StructureRole };

/** The mode a run was asked in; '' and anything unknown read as photos. */
export function flatModeOf(params: common_DesignRunParams | null | undefined): FlatMode {
  const m = (params?.flat?.mode ?? '').trim();
  return m === 'hand_flat' || m === 'straps' ? m : 'photos';
}

/** The wire block for a NEW press. Photos sends nothing (absent = photos). */
export function flatParamsFor(
  mode: FlatMode,
  structure: readonly StructurePick[],
): common_DesignFlatParams | undefined {
  if (mode === 'photos') return undefined;
  const structureRefs: common_DesignFlatStructureRef[] =
    mode === 'hand_flat'
      ? [...structure]
          .sort((a, b) => (a.role === b.role ? 0 : a.role === 'front_flat' ? -1 : 1))
          .map((s) => ({ mediaId: s.mediaId, role: s.role }))
      : [];
  return { mode, structureRefs };
}

/**
 * THE FIX CARRIES ITS PLATE'S MODE. A fix redraws a picture of an earlier run; the server checks the
 * block against that run, so it is copied verbatim — mode and structure flats — never re-derived
 * from what the row shows now. A plate from a run without the block gets none (photos).
 */
export function flatParamsForFix(
  plateRun: common_DesignRun | null | undefined,
): common_DesignFlatParams | undefined {
  const flat = plateRun?.params?.flat;
  if (!flat) return undefined;
  return {
    mode: flat.mode ?? '',
    structureRefs: (flat.structureRefs ?? []).map((r) => ({
      mediaId: r.mediaId ?? 0,
      role: r.role ?? '',
    })),
  };
}

/**
 * One flat per role. Picking a role on one tile takes it from any other tile; picking the role a
 * tile already has clears it.
 */
export function pickStructure(
  picks: readonly StructurePick[],
  mediaId: number,
  role: StructureRole,
): StructurePick[] {
  const had = picks.find((p) => p.mediaId === mediaId)?.role === role;
  const rest = picks.filter((p) => p.mediaId !== mediaId && p.role !== role);
  return had ? rest : [...rest, { mediaId, role }];
}

/** The first two flats as front and back — what choosing «from my flat» starts with. */
export function autoStructure(mediaIds: readonly number[]): StructurePick[] {
  const ids = mediaIds.filter((id) => id > 0);
  const out: StructurePick[] = [];
  if (ids[0]) out.push({ mediaId: ids[0], role: 'front_flat' });
  if (ids[1]) out.push({ mediaId: ids[1], role: 'back_flat' });
  return out;
}

/** The picks whose flat is still on the card. */
export function liveStructure(
  picks: readonly StructurePick[],
  mediaIds: readonly number[],
): StructurePick[] {
  const on = new Set(mediaIds);
  return picks.filter((p) => on.has(p.mediaId));
}

/**
 * THE LIST ASKS FOR «STRAPS & OPENINGS»: a strap or an opening that continues into another part of
 * the garment (a strap running over the shoulder into the back edge). Since 82 it picks the route.
 */
export function suggestsStraps(joins: common_DesignJoins | null | undefined): boolean {
  const items = joins?.items ?? [];
  return items.some((it) => {
    const kind = (it.kind ?? '').trim();
    return (kind === 'strap' || kind === 'opening') && (it.continuesInto ?? []).length > 0;
  });
}

/** The list is usable and confirmed at the rev it carries now (the server clears it on any save). */
export function joinsConfirmed(joins: common_DesignJoins | null | undefined): boolean {
  return (
    !!joins && !!joins.confirmed && (joins.items ?? []).length + (joins.absences ?? []).length > 0
  );
}

/**
 * A REFUSED PRESS IN SHORT HUMAN WORDS (ErrorInfo.reason). All of these are free — the server
 * refuses before it books anything.
 */
export const FLAT_REFUSAL_WORDS: Record<string, string> = {
  flat_forbidden: 'a mode only goes with a flat run',
  unknown_flat_mode: 'unknown mode',
  structure_forbidden: 'flats go only with “from my flat”',
  structure_required: 'pick a front or back flat',
  structure_malformed: 'one flat per side',
  structure_not_on_card: 'that flat is not on this card',
  structure_gone: 'that flat was removed',
  joins_unconfirmed: 'answer the construction questions first',
  views_first: 'generate the views first',
  mode_not_for_this_run: 'this mode draws all the views on one picture only',
  too_many_pictures: 'too many pictures for one run',
  role_reserved: 'that role is reserved for flats',
};

export function flatRefusalWords(
  reason: string | undefined,
  meta?: Record<string, string>,
): string | null {
  // The confirmation was made against other photos or another garment note (server `stale`).
  if (reason === 'joins_unconfirmed' && meta?.reason === 'stale')
    return 'the photos changed — one more look';
  return reason ? FLAT_REFUSAL_WORDS[reason] ?? null : null;
}

/**
 * THE MOOD PICTURES — the card's moodboard pictures whose role is `mood`: a flat run's reference on
 * one of them travels as `mood` («a DIFFERENT garment; style mood only»), whatever reference role it
 * carries (server `designFlatMoodRoles`). The first non-empty role per picture counts, as the
 * server's `designBoardRoles` reads it.
 */
export function moodPictureIds(
  board: readonly { mediaId?: number; role?: string }[] | null | undefined,
): Set<number> {
  const role = new Map<number, string>();
  for (const m of board ?? []) {
    const id = m?.mediaId ?? 0;
    const r = (m?.role ?? '').trim();
    if (id > 0 && r && !role.has(id)) role.set(id, r);
  }
  return new Set([...role].filter(([, r]) => r === 'mood').map(([id]) => id));
}
