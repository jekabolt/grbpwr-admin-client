import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  FabricDirectionGapCard,
  FabricDirectionGapExclusion,
  FabricDirectionGapLine,
  ListTechCardFabricDirectionGapsResponse,
} from 'api/proto-http/admin';
import { techCardKeys } from './useTechCardQuery';

// Reads for кампания Д1 — the fill-in of НАПРАВЛЕНИЕ ТКАНИ across the portfolio
// (ListTechCardFabricDirectionGaps, Ф1.8). `fabric_direction` sits on a BOM line and fed nothing
// until Ф1; now an unset direction REFUSES the save of any раскладка whose layout carries a 180° or
// a mirror on that cloth. This report is the worklist and the release gate.

export type GapReport = ListTechCardFabricDirectionGapsResponse;
export type GapCard = FabricDirectionGapCard;
export type GapLine = FabricDirectionGapLine;
export type GapExclusion = FabricDirectionGapExclusion;

/**
 * THE campaign number, and the reason no screen may print `totalLines` on its own.
 *
 * A default call DEFERS released cards — it does not clear them. A released card is frozen only
 * until somebody re-opens it to draft, which is one ordinary edit, and its unset lines come back
 * with it. So the honest count is always `total_lines + excluded_lines`, which the server keeps
 * priced even when it withholds the rows themselves. With `include_inactive` the excluded side is
 * empty and this sum degrades to `total_lines` — i.e. the SAME number in both modes, which is what
 * lets the headline stay put while the operator toggles the filter under it.
 */
export function openLines(report?: GapReport): number {
  return (report?.totalLines ?? 0) + (report?.excludedLines ?? 0);
}

/** Cards behind {@link openLines}, counted the same way and for the same reason. */
export function openCards(report?: GapReport): number {
  return (report?.totalCards ?? 0) + (report?.excludedCards ?? 0);
}

/**
 * The worklist itself. Keyed on `includeInactive` rather than filtered client-side on one wide
 * read: the `excluded` breakdown is the SERVER's account of what its own scope withheld, and
 * re-deriving "which of these cards would have been deferred" here would be that rule restated in a
 * second place, free to disagree with the first.
 */
export function useFabricDirectionGaps(includeInactive: boolean, enabled = true) {
  return useQuery({
    queryKey: [...techCardKeys.fabricDirectionGaps(), 'report', includeInactive],
    queryFn: () =>
      adminService.ListTechCardFabricDirectionGaps({
        techCardId: undefined,
        includeInactive,
        countsOnly: undefined,
      }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The bounded form: `(counts_only, include_inactive) = (true, true)`, which is the shape the
 * contract nominates for the go/no-go. Used for the toolbar chip's counter, where the unbounded
 * read would grow with the portfolio to render one number.
 */
export function useFabricDirectionGapCounts(enabled = true) {
  return useQuery({
    queryKey: [...techCardKeys.fabricDirectionGaps(), 'counts'],
    queryFn: () =>
      adminService.ListTechCardFabricDirectionGaps({
        techCardId: undefined,
        includeInactive: true,
        countsOnly: true,
      }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Re-check ONE card after fixing it — what `tech_card_id` exists for. Deliberately not a hook: it
 * is fired per tile, on a click, and its answer belongs to that tile rather than to a cache the
 * whole worklist reads.
 *
 * `include_inactive` is forced ON. A targeted re-check must answer "does this card still have unset
 * lines", and the default scope would answer "clean" for a released card purely by declining to
 * look at it — the one wrong answer this call can give.
 */
export function recheckFabricDirectionGaps(techCardId: number): Promise<GapReport> {
  return adminService.ListTechCardFabricDirectionGaps({
    techCardId,
    includeInactive: true,
    countsOnly: undefined,
  });
}
