import type {
  common_DesignFlatParams,
  common_DesignFlatStructureRef,
  common_DesignRun,
  common_DesignRunParams,
} from 'api/proto-http/admin';

/**
 * ═══ THE FLAT MODES (flat-consistency 81-FINAL-MODES, 06.10; straps retired 07.10, M7) ══════════
 *
 *   photos     — the default: the roled reference photos; one sheet. GENERATE runs it with no
 *                decision asked.
 *   hand_flat  — «from my flat»: the card's own TECHNICAL flats are redrawn cleanly, the photos only
 *                give the fit. One sheet. One flat per role, front_flat / back_flat.
 *   straps     — RETIRED (owner 07.10, 100-CONSTRUCTION-DEADEND): it was photos + the confirmed join
 *                list, and the list no longer reaches the image model. A press never sends it (the
 *                server refuses a new one, `mode_retired`); only an old run in the history reads it.
 *
 * The server owns the count (`requested_outputs`) and every refusal — the client never assumes a
 * number of sheets. Absent `params.flat` IS photos, so photos sends nothing: the wire stays as it was
 * for every run that does not ask for a mode.
 *
 * A RERUN sends its parent's params whole (`latest-generation.tsx` retry), so the block travels by
 * itself; a FIX must copy it from the plate's run (`flatParamsForFix`) — a different block on a rerun
 * or fix is `mode_not_for_this_run`, and a fix without it would quietly redraw in the photos mode.
 */
/** The modes a press may send. */
export type FlatMode = 'photos' | 'hand_flat';

/** The mode a stored run carries — an old run may still say `straps` (retired 07.10). */
export type RunFlatMode = FlatMode | 'straps';

export const DEFAULT_FLAT_MODE: FlatMode = 'photos';

/** The history's word for a run's mode. */
export const FLAT_MODE_WORD: Record<RunFlatMode, string> = {
  photos: 'photos',
  hand_flat: 'from my flat',
  straps: 'straps & openings',
};

export type StructureRole = 'front_flat' | 'back_flat';

export type StructurePick = { mediaId: number; role: StructureRole };

/** The mode a run was asked in; '' and anything unknown read as photos. */
export function flatModeOf(params: common_DesignRunParams | null | undefined): RunFlatMode {
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
  mode_retired: 'that mode was retired',
  flat_run_in_flight: 'a flat run is already drawing',
  views_first: 'generate the views first',
  mode_not_for_this_run: 'this mode draws all the views on one picture only',
  too_many_pictures: 'too many pictures for one run',
  role_reserved: 'that role is reserved for flats',
};

export function flatRefusalWords(reason: string | undefined): string | null {
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
