import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetDesignBandResponse, common_DesignJoins } from 'api/proto-http/admin';
import { useEffect } from 'react';

import { designKeys } from './use-design-band';

/**
 * ═══ THE JOIN LIST — A SILENT BACKGROUND READ FOR PARTS (M7, owner 07.10) ═══════════════════════
 *
 * The construction is gone from the flat (100-CONSTRUCTION-DEADEND): the join list is not sent to
 * the image model, GENERATE neither waits for it nor asks its questions, and there is no screen that
 * shows or edits it. What stays is its one remaining reader — the PARTS labeller, which names the
 * painted pieces from the card's list (server `designPartsVocabulary`) until M6 moves PARTS off it.
 *
 * So the list is still READ from the photos once per card per session, from the FLAT step, the
 * first time the card has roled photos and no list — in the background, never locking anything. A
 * failed read is silent: PARTS labels without the list. The server answers a list it already has
 * without a model call (`force: false`).
 */

/** Cards whose read was started this session (a page reload asks again). */
const asked = new Set<number>();
/** The read's own request, until it answers: no second read beside it. */
const inflight = new Set<number>();

function putJoins(qc: QueryClient, card: number, joins: common_DesignJoins | undefined) {
  if (!joins) return;
  qc.setQueryData<GetDesignBandResponse>(designKeys.band(card), (old) =>
    old ? { ...old, joins } : old,
  );
}

async function readJoins(qc: QueryClient, card: number): Promise<void> {
  if (inflight.has(card)) return;
  inflight.add(card);
  try {
    const r = await adminService.GenerateDesignJoins({ techCardId: card, force: false });
    putJoins(qc, card, r.joins);
  } catch {
    // Silent: nothing waits for the list any more; PARTS labels without it.
  } finally {
    inflight.delete(card);
  }
}

/**
 * THE READ, FROM THE RUN ROW: the first visit with roled photos and no list reads it — once per card
 * per session. Returns nothing: the row shows nothing about it.
 */
export function useJoinsRead(card: number, band: GetDesignBandResponse, writesOff: boolean): void {
  const qc = useQueryClient();
  const photos = (band.references ?? []).filter(
    (r) => (r.mediaId ?? 0) > 0 && !!(r.role ?? '').trim(),
  ).length;
  useEffect(() => {
    if (writesOff || band.joins || photos === 0 || card <= 0 || asked.has(card)) return;
    asked.add(card);
    void readJoins(qc, card);
  }, [writesOff, band.joins, photos, card, qc]);
}
