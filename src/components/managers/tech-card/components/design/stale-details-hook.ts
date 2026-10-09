import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_DesignBenchSlot } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useState } from 'react';

import { errorInfoReason } from './generation/refusal';
import { KEEP_REFUSAL_WORDS } from './stale-details';
import { designKeys, rereadBandNow } from './use-design-band';

/**
 * `keep` ON A STALE DETAIL — `SetDesignDetailKept` with the views run the screen saw (CAS). Aborted
 * `views_changed`: the views moved meanwhile — the band is re-read and the pill shows what is true
 * now. One write per slot at a time.
 */
export function useKeepStale(techCardId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const keep = useCallback(
    async (slot: common_DesignBenchSlot, on = true) => {
      const slotId = slot.id ?? 0;
      if (techCardId <= 0 || slotId <= 0) return;
      setBusy((b) => new Set(b).add(slotId));
      try {
        await adminService.SetDesignDetailKept({
          techCardId,
          slotId,
          keep: on,
          againstRunId: slot.staleAgainstRunId ?? 0,
        });
        await qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
      } catch (e) {
        const reason = errorInfoReason(e) ?? '';
        if (reason === 'views_changed') await rereadBandNow(qc, techCardId).catch(() => undefined);
        else void qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
        showMessage(
          `not kept — ${KEEP_REFUSAL_WORDS[reason] ?? ((e instanceof Error && e.message) || 'the keep did not go through')}`,
          'error',
        );
      } finally {
        setBusy((b) => {
          const next = new Set(b);
          next.delete(slotId);
          return next;
        });
      }
    },
    [qc, techCardId, showMessage],
  );
  return { keep, busy };
}
