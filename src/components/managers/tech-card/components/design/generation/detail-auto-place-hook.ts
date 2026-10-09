import { useQueryClient } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useEffect, useMemo } from 'react';

import { COLORWAY_NONE } from '../bench-kinds';
import { designKeys, useDesignWrites } from '../use-design-band';
import { detailPlacementOf, detailPlacements } from './detail-auto-place';

/**
 * Claimed in this tab: one automatic attempt per run, ever (a refusal leaves `slot ▾`). Memory
 * only — nothing is stored; a second tab finds the picture already in its slot (no placement), or
 * loses the CAS race on the slot's rev.
 */
const claimed = new Set<number>();

/**
 * THE DETAIL RUNS' PICTURES INTO THEIR SLOTS (`detail-auto-place.ts`). Mounted by FLAT's workbench;
 * `off` on a read-only card or a server that does not speak the band. Each write re-plans on the
 * freshest band in the cache first: a slot that moved since this render is left alone.
 */
export function useDetailAutoPlace(
  band: GetDesignBandResponse,
  techCardId: number,
  off: boolean,
): void {
  const qc = useQueryClient();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const due = useMemo(() => (off ? [] : detailPlacements(band)), [band, off]);
  const key = due.map((p) => `${p.runId}:${p.slotId}:${p.pictureId}:${p.slotRev}`).join(',');

  useEffect(() => {
    if (!due.length || techCardId <= 0) return;
    void (async () => {
      for (const p of due) {
        if (claimed.has(p.runId)) continue;
        const fresh = qc.getQueryData<GetDesignBandResponse>(designKeys.band(techCardId)) ?? band;
        const run = (fresh.runs ?? []).find((r) => (r.id ?? 0) === p.runId);
        const now = run ? detailPlacementOf(fresh, run) : null;
        if (
          !now ||
          now.slotId !== p.slotId ||
          now.pictureId !== p.pictureId ||
          now.slotRev !== p.slotRev
        ) {
          continue;
        }
        claimed.add(p.runId);
        try {
          await setBenchSlot.mutateAsync({
            // A minted id names its bench and its colourway — neither is sent (`slot-picker.tsx`).
            slot: { slotId: p.slotId, kind: undefined, colorwayId: COLORWAY_NONE },
            pictureId: p.pictureId,
            expectedSlotRev: p.slotRev,
            // Nobody pressed anything: a refusal is not shouted; `slot ▾` stays on the tile.
            silent: true,
          });
        } catch {
          void qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
        }
      }
    })();
    // `due` is read through `key`; `band` is only the fallback when the cache holds nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, techCardId]);
}
