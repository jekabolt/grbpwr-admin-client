import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { warehouseKeys } from 'components/managers/materials/components/useWarehouse';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { inputToDecimal, parseDecimalNumber } from 'utils/decimal';
import { extractFieldViolations } from 'utils/field-errors';
import { SAMPLE_STAGING_PREFIX } from './sample-options';
import { todayISO } from './sample-panels';
import { sampleKeys, useDeleteSample } from './useSamples';
import { useTechCardStaging } from './useTechCardStaging';
import { wireInt } from './wire-int';

// Delete a sample nobody fitted (owner 16.10). The server refuses while any issued material is
// still charged to the sample — and create writes the BOM off automatically, so that is almost
// every sample. So the client first returns ALL outstanding stock (lot by lot), then deletes. A
// sample with a fitting is never sent to the server; a refusal is shown as the server words it.

type Outstanding = { materialId: number; lotId: number; qty: number };

/**
 * Net issued per (material, lot) over the sample's WHOLE ledger (every page, not the 50-row
 * window). Per lot, because a return goes back into the lot it came from — a return into «no lot»
 * would leave lots A and B depleted for ever.
 */
async function outstandingOf(sampleId: number): Promise<Outstanding[]> {
  const net = new Map<string, Outstanding>();
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const res = await adminService.ListMaterialMovements({
      limit,
      offset,
      materialId: 0,
      productionRunId: 0,
      sampleId,
      movementType: 'MATERIAL_MOVEMENT_TYPE_UNKNOWN',
      occurredFrom: '',
      occurredTo: '',
    });
    for (const m of res.movements ?? []) {
      const materialId = wireInt(m.materialId);
      const lotId = wireInt(m.lotId);
      const qty = parseDecimalNumber(m.quantity?.value ?? '0');
      if (!materialId || !Number.isFinite(qty)) continue;
      const sign =
        m.movementType === 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE'
          ? 1
          : m.movementType === 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE'
            ? -1
            : 0;
      if (!sign) continue;
      const key = `${materialId}:${lotId}`;
      const seat = net.get(key) ?? { materialId, lotId, qty: 0 };
      seat.qty += sign * Math.abs(qty);
      net.set(key, seat);
    }
    if (offset + limit >= (res.total ?? 0) || !(res.movements ?? []).length) break;
  }
  // The material's net is the truth (that is what the server's verdict checks); lots only say
  // where it goes back. A return booked without a lot (lot 0) still cancels lot A's issue, so the
  // per-material net is spread over the lots that are still positive — lot-tracked first, then
  // lot 0 — and never more than that net.
  const byMaterial = new Map<number, Outstanding[]>();
  for (const o of net.values())
    byMaterial.set(o.materialId, [...(byMaterial.get(o.materialId) ?? []), o]);
  const out: Outstanding[] = [];
  for (const [materialId, seats] of byMaterial) {
    let left = Number(seats.reduce((s, o) => s + o.qty, 0).toFixed(3));
    const positive = seats
      .filter((o) => o.qty > 0)
      .sort((a, b) => (a.lotId ? 0 : 1) - (b.lotId ? 0 : 1));
    for (const o of positive) {
      if (left <= 0) break;
      const qty = Number(Math.min(o.qty, left).toFixed(3));
      if (qty > 0) out.push({ materialId, lotId: o.lotId, qty });
      left = Number((left - qty).toFixed(3));
    }
  }
  return out;
}

/** The batch takes one line per material — so lots of one material go in successive batches. */
function batchesOf(lines: Outstanding[]): Outstanding[][] {
  const out: Outstanding[][] = [];
  for (const l of lines) {
    const seat = out.find((b) => !b.some((x) => x.materialId === l.materialId));
    if (seat) seat.push(l);
    else out.push([l]);
  }
  return out;
}

export function useDeleteUnfitted(techCardId: number) {
  const qc = useQueryClient();
  const del = useDeleteSample(techCardId);
  const [deletingId, setDeletingId] = useState(0);
  const staging = useTechCardStaging();

  const deleteUnfitted = async (
    sampleId: number,
    fittingCount: number,
    label: string,
  ): Promise<boolean> => {
    if (!sampleId || deletingId) return false;
    if (fittingCount > 0) {
      notify({
        sev: 'error',
        subject: `SAMPLE ${label}`,
        text: 'not deleted',
        bad: 'has fittings',
      });
      return false;
    }
    setDeletingId(sampleId);
    try {
      // Ask the server first: the fitting count above is this screen's cache. Only stock left out
      // may be cleared here — anything else (a fitting booked meanwhile, over-return) refuses
      // BEFORE a single unit goes back to the warehouse.
      const dry = await adminService.DeleteSample({ id: sampleId, dryRun: true });
      const other = (dry.blockers ?? []).filter((b) => b.reason !== 'material_outstanding');
      if (other.length) {
        notify({
          sev: 'error',
          subject: `SAMPLE ${label}`,
          text: 'not deleted',
          detail: other.map((b) => b.text?.trim() || b.reason).join(' · '),
        });
        qc.invalidateQueries({ queryKey: sampleKeys.all });
        return false;
      }
      const batches = batchesOf(await outstandingOf(sampleId));
      for (const batch of batches) {
        // A later batch failing stops here: the sample is NOT deleted, the error names it.
        try {
          await adminService.BatchIssueMaterialStock({
            lines: batch.map((l) => ({
              materialId: l.materialId,
              quantity: inputToDecimal(String(l.qty)),
              lotId: l.lotId,
              comment: '',
            })),
            productionRunId: 0,
            sampleId,
            isReturn: true,
            occurredAt: todayISO(),
            comment: 'sample deleted',
            productId: 0,
          });
        } finally {
          qc.invalidateQueries({ queryKey: warehouseKeys.all });
        }
      }
      // useDeleteSample invalidates samples, warehouse, dev expenses, economics and the card's
      // fittings (they live under the card's detail key).
      await del.mutateAsync(sampleId);
      // A staged edit of a deleted sample would 404 the card's next save.
      staging?.unstage(`${SAMPLE_STAGING_PREFIX}${sampleId}`);
      // The sample leaving the board is the receipt.
      return true;
    } catch (e) {
      // The server's own words (one violation per blocker) — never a blind retry.
      const blockers = extractFieldViolations(e).map((v) => v.description);
      notify({
        sev: 'error',
        subject: `SAMPLE ${label}`,
        text: 'not deleted',
        detail: blockers.length
          ? blockers.join(' · ')
          : e instanceof Error
            ? e.message
            : "couldn't delete the sample",
      });
      qc.invalidateQueries({ queryKey: sampleKeys.all });
      return false;
    } finally {
      setDeletingId(0);
    }
  };

  return { deleteUnfitted, deletingId };
}
