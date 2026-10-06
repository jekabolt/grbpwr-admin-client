import type { common_DesignBenchSlot } from 'api/proto-http/admin';

/**
 * ═══ A DETAIL DRAWN BEFORE THE VIEWS IT SHOULD AGREE WITH (82-INPUT-REDESIGN §5, owner 9) ════════
 *
 * SERVER TRUTH (owner 06.10, answer 6: «keep» is stored on the server, everybody sees it). The band
 * computes it on every flat detail slot (`GetDesignBand`, migration 0400):
 *   · `stale` — the detail's plate came out of a run older than the run of the FRONT (else BACK)
 *     plate; an uploaded detail or uploaded views are never stale. RAW: true even when kept;
 *   · `kept` — a person kept it against the CURRENT views run and the CURRENT plate; it clears by
 *     itself when either changes;
 *   · `stale_against_run_id` — the views run it is stale against, echoed back by `keep` (CAS).
 * The pill shows when `stale && !kept`; the run row lists such a detail again as `· stale`.
 */
export function staleShown(slot: common_DesignBenchSlot | null | undefined): boolean {
  return !!slot && (slot.pictureId ?? 0) > 0 && !!slot.stale && !slot.kept;
}

/** The refusals of `SetDesignDetailKept` in short words; `views_changed` re-reads the band. */
export const KEEP_REFUSAL_WORDS: Record<string, string> = {
  views_changed: 'the views changed meanwhile — look again',
  not_a_flat_detail: 'only a flat detail can be kept',
  detail_empty: 'the detail slot is empty',
  detail_not_stale: 'the detail is not stale any more',
};
