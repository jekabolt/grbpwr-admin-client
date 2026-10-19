import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  BatchIssueMaterialStockRequest,
  common_Fitting,
  common_MaterialMovement,
  common_MaterialStockRow,
  common_AdminColorwayRef,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useIssueMaterialStock,
  useMaterialMovements,
  useMaterialStock,
  warehouseKeys,
} from 'components/managers/materials/components/useWarehouse';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button, GroupLabel, Row, Text } from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber } from 'utils/decimal';
import { wireInt } from './schema';
import { sampleKeys } from './useSamples';

// ---------------------------------------------------------------------------
// Sample write-off (10.5 → samples-lite). Nobody issues one material at a time when a sample is
// sewn — the whole BOM goes out at once, through BatchIssueMaterialStock: ONE atomic call, every
// line lands or none does.
// Pre-filled by default (owner 16.10, reverses «nothing is pre-filled»): every linked BOM line goes
// out at min(spec, on hand) when the sample is created; shortfalls surface as warnings, not errors.
// ---------------------------------------------------------------------------

/** One line as the batch will see it — after the per-material fold below. */
export type WriteoffLine = {
  key: string;
  materialId: number;
  label: string;
  unit: string;
  quantity: string;
  /** >1 when several sheet rows carried the same material and were folded into this line. */
  mergedRows?: number;
};

/** A line of a POSTED batch, paired with the movement it produced. Nothing here can have failed. */
export type WriteoffPostedLine = WriteoffLine & { movement?: common_MaterialMovement };

/** Binary by construction: the batch is atomic, so either every line posted or none did. */
export type WriteoffOutcome =
  | { ok: true; lines: WriteoffPostedLine[] }
  | { ok: false; error: string };

export function todayISO(): string {
  // Local wall-clock date (not toISOString) — mirrors the warehouse movement modals so a
  // write-off is dated the operator's "today", not a UTC day-off around midnight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// The colourway's GARMENT-LEVEL usage of a BOM line (piece-level usages are per-piece norms, not the
// line's). A real colourway answers only for itself; the `sample` colourway (0) borrows the first
// colourway that has a garment-level usage for the line.
function garmentUsage(
  techCard: common_TechCard | undefined,
  bomItemId: number,
  colorwayId: number,
): common_TechCardColorwayUsage | undefined {
  if (!bomItemId) return undefined;
  const usageOf = (cw: common_AdminColorwayRef) =>
    (cw.usages ?? []).find(
      (u) =>
        wireInt(u.bomItemId) === bomItemId &&
        !(u.pieceLineKey ?? '').trim() &&
        u.pieceIndex === undefined &&
        !wireInt(u.pieceId),
    );
  const colorways = techCard?.colorways ?? [];
  if (colorwayId > 0) {
    const own = colorways.find((cw) => wireInt(cw.colorwayId) === colorwayId);
    return own ? usageOf(own) : undefined;
  }
  for (const cw of colorways) {
    const u = usageOf(cw);
    if (u) return u;
  }
  return undefined;
}

/** The article a line is cut from in this colourway: the usage's pinned material, else the line's. */
export function lineMaterialId(
  techCard: common_TechCard | undefined,
  bomItem: common_TechCardBomItem,
  colorwayId: number,
): number {
  return (
    wireInt(garmentUsage(techCard, wireInt(bomItem.id), colorwayId)?.materialId) ||
    wireInt(bomItem.materialId)
  );
}

// The spec quantity of one BOM line: the colourway's garment-level consumption norm. A per-size
// recipe answers only for the size ('' when that size has none); otherwise the scalar norm. ''
// when there is no recipe.
export function specQuantity(
  techCard: common_TechCard | undefined,
  bomItemId: number,
  colorwayId: number,
  sizeId: number,
): string {
  const usage = garmentUsage(techCard, bomItemId, colorwayId);
  if (!usage) return '';
  const sizes = usage.sizeConsumptions ?? [];
  if (sizes.length) {
    const bySize = sizeId ? sizes.find((s) => wireInt(s.sizeId) === sizeId) : undefined;
    return decimalToInput(bySize?.consumption);
  }
  return decimalToInput(usage.consumption) || decimalToInput(usage.quantity) || '';
}

/**
 * The warehouse's stock rows keyed by a COERCED material id. Material.id is int64, which
 * grpc-gateway serialises as a STRING while the generated type claims `number` — keying on the raw
 * value builds a Map of "12" that `.get(12)` can never hit.
 */
export function useStockIndex() {
  const { data, isLoading, isError, isSuccess, refetch } = useMaterialStock({
    withStockOnly: false,
  });
  const rowByMaterial = useMemo(() => {
    const m = new Map<number, common_MaterialStockRow>();
    for (const r of data?.rows ?? []) {
      const id = wireInt(r.material?.id);
      if (id) m.set(id, r);
    }
    return m;
  }, [data]);
  const baseCurrency = (data?.rows ?? []).find((r) => r.baseCurrency)?.baseCurrency ?? '';
  return {
    rowByMaterial,
    rows: data?.rows ?? [],
    baseCurrency,
    isLoading,
    isError,
    isSuccess,
    refetch,
  };
}

export const stockOnHand = (r?: common_MaterialStockRow): number =>
  parseDecimalNumber(decimalToInput(r?.onHand));
// Sum two sheet quantities, rounding back to 3 decimals to undo float noise only.
function addQuantities(a: string, b: string): string {
  const sum = (parseDecimalNumber(a) || 0) + (parseDecimalNumber(b) || 0);
  return Number.isFinite(sum) ? String(Number(sum.toFixed(3))) : a;
}

/**
 * Fold the lines by material. BatchIssueMaterialStock rejects a duplicate materialId across lines
 * BEFORE it writes anything, and a BOM legitimately carries one catalog material on two lines.
 */
export function mergeWriteoffLines(lines: WriteoffLine[]): WriteoffLine[] {
  const out: WriteoffLine[] = [];
  const seatOf = new Map<number, number>();
  for (const l of lines) {
    const seat = seatOf.get(l.materialId);
    if (seat === undefined) {
      seatOf.set(l.materialId, out.length);
      out.push({ ...l });
      continue;
    }
    const prev = out[seat];
    out[seat] = {
      ...prev,
      quantity: addQuantities(prev.quantity, l.quantity),
      label: prev.label === l.label ? prev.label : `${prev.label} + ${l.label}`,
      mergedRows: (prev.mergedRows ?? 1) + 1,
    };
  }
  return out;
}

// The batch write; invalidates the same two trees a single issue does — balances move, and so does
// the sample's composed cost.
function useBatchIssueMaterialStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: BatchIssueMaterialStockRequest) => adminService.BatchIssueMaterialStock(req),
    onSuccess: (_res, req) => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
      if (req.sampleId) qc.invalidateQueries({ queryKey: sampleKeys.all });
    },
  });
}

/**
 * The whole write-off in ONE atomic call. Never throws: a rejection resolves to `{ ok: false }` and
 * means the ledger is untouched, so the caller has nothing to reconcile and can re-send as-is.
 */
export function useWriteoffBatch() {
  const batch = useBatchIssueMaterialStock();
  const run = async (
    sampleId: number,
    lines: WriteoffLine[],
    comment: string,
  ): Promise<WriteoffOutcome> => {
    const merged = mergeWriteoffLines(lines);
    try {
      const res = await batch.mutateAsync({
        lines: merged.map((l) => ({
          materialId: l.materialId,
          quantity: inputToDecimal(l.quantity),
          lotId: 0,
          comment: '',
        })),
        productionRunId: 0,
        sampleId,
        isReturn: false,
        occurredAt: todayISO(),
        comment,
        productId: 0,
      });
      // Movements come back in the order the lines were sent, so index pairing is the contract.
      const movements = res.movements ?? [];
      return { ok: true, lines: merged.map((l, i) => ({ ...l, movement: movements[i] })) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'the write-off was rejected' };
    }
  };
  return { run, isPending: batch.isPending };
}

/**
 * Net quantity and cost of every material issued to a sample (issues minus returns), read off the
 * ledger — the amount actually consumed, folded by material. Same filter/limit as MovementsList so
 * react-query serves both from one request.
 */
export function useSampleIssued(sampleId: number) {
  const { data, isLoading } = useMaterialMovements({ sampleId }, 50);
  return useMemo(() => {
    const byMaterial = new Map<number, { qty: number; cost: number }>();
    let firstAt = '';
    for (const page of data?.pages ?? []) {
      for (const m of page.movements) {
        const id = wireInt(m.materialId);
        const qty = parseDecimalNumber(decimalToInput(m.quantity));
        if (!id || !Number.isFinite(qty)) continue;
        const isReturn = m.movementType === 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE';
        const signed = isReturn ? -Math.abs(qty) : Math.abs(qty);
        const unitCost = parseDecimalNumber(decimalToInput(m.unitCostBase));
        const seat = byMaterial.get(id) ?? { qty: 0, cost: 0 };
        seat.qty += signed;
        if (Number.isFinite(unitCost)) seat.cost += signed * unitCost;
        byMaterial.set(id, seat);
        if (!isReturn && m.occurredAt && (!firstAt || m.occurredAt < firstAt))
          firstAt = m.occurredAt;
      }
    }
    return { byMaterial, firstAt, isLoading, count: data?.pages?.[0]?.total ?? 0 };
  }, [data, isLoading]);
}

/**
 * Return material from the sample to stock — half of the answer to a refused delete: the server
 * deletes a sample only when its net consumption of every material is zero. Shows the OUTSTANDING
 * balance per material (issued minus returned), the same predicate the server measures by.
 */
export function SampleReturns({
  sampleId,
  canEdit,
  scrapped,
}: {
  sampleId: number;
  canEdit: boolean;
  /** A scrapped sample takes no return (checkSampleOpen) — no button that only answers an error. */
  scrapped: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const issue = useIssueMaterialStock();
  const { data } = useMaterialMovements({ sampleId }, 50);
  const { data: matData } = useMaterials('', true);
  const [pending, setPending] = useState(0);

  const materialInfo = useMemo(() => {
    const map = new Map<number, { label: string; unit: string }>();
    (matData?.materials ?? []).forEach((m) => {
      if (!m.id) return;
      map.set(Number(m.id), {
        label: `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`,
        unit: (m.unit ?? '').trim(),
      });
    });
    return map;
  }, [matData]);

  // Across every loaded page. The window can only UNDER-count (returns are newer than their issue),
  // so a return from here can never exceed what stock will accept.
  const outstanding = useMemo(() => {
    const net = new Map<number, number>();
    for (const p of data?.pages ?? []) {
      for (const m of p.movements) {
        const id = m.materialId ?? 0;
        const qty = parseDecimalNumber(m.quantity?.value ?? '0');
        if (!id || !Number.isFinite(qty)) continue;
        if (m.movementType === 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE')
          net.set(id, (net.get(id) ?? 0) + qty);
        else if (m.movementType === 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE')
          net.set(id, (net.get(id) ?? 0) - qty);
      }
    }
    return [...net.entries()]
      .map(([materialId, qty]) => ({ materialId, qty: Number(qty.toFixed(3)) }))
      .filter((r) => r.qty > 0)
      .sort((a, b) =>
        (materialInfo.get(a.materialId)?.label ?? '').localeCompare(
          materialInfo.get(b.materialId)?.label ?? '',
        ),
      );
  }, [data, materialInfo]);

  if (outstanding.length === 0) return null;

  const returnAll = async (materialId: number, qty: number) => {
    setPending(materialId);
    try {
      await issue.mutateAsync({
        materialId,
        quantity: inputToDecimal(String(qty)),
        productionRunId: 0,
        sampleId,
        isReturn: true,
        occurredAt: todayISO(),
        comment: 'return from the sample',
        productId: 0,
        lotId: 0,
      });
      showMessage('the material is back in stock', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "couldn't return the material", 'error');
    } finally {
      setPending(0);
    }
  };

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel>on the sample</GroupLabel>
      {outstanding.map((r) => {
        const info = materialInfo.get(r.materialId);
        return (
          <Row
            key={r.materialId}
            label={
              <Text size='micro' component='span'>
                {info?.label ?? `material #${r.materialId}`}
              </Text>
            }
            value={
              <span className='flex items-center gap-2'>
                <Text size='micro' variant='label' component='span'>
                  {info?.unit ? `${r.qty} ${info.unit}` : r.qty}
                </Text>
                {canEdit && !scrapped && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    // One return at a time: two in a row would both count from ONE balance.
                    disabled={pending !== 0}
                    onClick={() => returnAll(r.materialId, r.qty)}
                  >
                    {pending === r.materialId ? 'returning…' : 'return to stock'}
                  </Button>
                )}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

// Verdict → Pill tone. Approved is done (green), rejected is broken (red), needs-rework is
// mid-flight and waiting on a human (blue — never amber).
export function verdictTone(v?: string): 'ok' | 'warn' | 'attention' | 'mut' {
  if (v === 'FITTING_VERDICT_APPROVED') return 'ok';
  if (v === 'FITTING_VERDICT_REJECTED') return 'warn';
  if (v === 'FITTING_VERDICT_NEEDS_REWORK' || v === 'FITTING_VERDICT_PENDING') return 'attention';
  return 'mut';
}

/** Unresolved change requests across a sample's fittings. */
export function openChangeRequests(fittings: common_Fitting[]): number {
  return fittings.reduce(
    (n, f) => n + (f.fitting?.changeRequests ?? []).filter((c) => !c.resolved).length,
    0,
  );
}

/** Fittings newest first, by fitting date (the list order is not a contract). */
export function fittingsNewestFirst(fittings: common_Fitting[]): common_Fitting[] {
  return [...fittings].sort((a, b) =>
    (b.fitting?.fittingDate ?? '').localeCompare(a.fitting?.fittingDate ?? ''),
  );
}
