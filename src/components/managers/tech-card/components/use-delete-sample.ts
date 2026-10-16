import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { warehouseKeys } from 'components/managers/materials/components/useWarehouse';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { inputToDecimal, parseDecimalNumber } from 'utils/decimal';
import { extractFieldViolations } from 'utils/field-errors';
import { todayISO } from './sample-panels';
import { sampleKeys, useDeleteSample } from './useSamples';
import { wireInt } from './wire-int';

// Delete a sample nobody fitted (owner 16.10). The server refuses while any issued material is
// still charged to the sample — and create writes the BOM off automatically, so that is almost
// every sample. So the client first returns ALL outstanding stock in ONE batch, then deletes. A
// sample with a fitting is never sent to the server; a refusal is shown as the server words it.

/** Net issued per material over the sample's WHOLE ledger (every page, not the 50-row window). */
async function outstandingOf(sampleId: number): Promise<Map<number, number>> {
  const net = new Map<number, number>();
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
      const id = wireInt(m.materialId);
      const qty = parseDecimalNumber(m.quantity?.value ?? '0');
      if (!id || !Number.isFinite(qty)) continue;
      if (m.movementType === 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE')
        net.set(id, (net.get(id) ?? 0) + Math.abs(qty));
      else if (m.movementType === 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE')
        net.set(id, (net.get(id) ?? 0) - Math.abs(qty));
    }
    if (offset + limit >= (res.total ?? 0) || !(res.movements ?? []).length) break;
  }
  return net;
}

export function useDeleteUnfitted(techCardId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const del = useDeleteSample(techCardId);
  const [deletingId, setDeletingId] = useState(0);

  const deleteUnfitted = async (
    sampleId: number,
    fittingCount: number,
    label: string,
  ): Promise<boolean> => {
    if (!sampleId || deletingId) return false;
    if (fittingCount > 0) {
      showMessage(`sample ${label} has fittings — it stays`, 'error');
      return false;
    }
    setDeletingId(sampleId);
    try {
      const lines = [...(await outstandingOf(sampleId)).entries()]
        .map(([materialId, qty]) => ({ materialId, qty: Number(qty.toFixed(3)) }))
        .filter((l) => l.qty > 0);
      if (lines.length) {
        await adminService.BatchIssueMaterialStock({
          lines: lines.map((l) => ({
            materialId: l.materialId,
            quantity: inputToDecimal(String(l.qty)),
            lotId: 0,
            comment: '',
          })),
          productionRunId: 0,
          sampleId,
          isReturn: true,
          occurredAt: todayISO(),
          comment: 'sample deleted',
          productId: 0,
        });
        qc.invalidateQueries({ queryKey: warehouseKeys.all });
      }
      // useDeleteSample invalidates samples, warehouse, dev expenses, economics and the card's
      // fittings (they live under the card's detail key).
      await del.mutateAsync(sampleId);
      showMessage(`sample ${label} deleted`, 'success');
      return true;
    } catch (e) {
      // The server's own words (one violation per blocker) — never a blind retry.
      const blockers = extractFieldViolations(e).map((v) => v.description);
      showMessage(
        blockers.length
          ? blockers.join(' · ')
          : e instanceof Error
            ? e.message
            : "couldn't delete the sample",
        'error',
      );
      qc.invalidateQueries({ queryKey: sampleKeys.all });
      return false;
    } finally {
      setDeletingId(0);
    }
  };

  return { deleteUnfitted, deletingId };
}
