import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_Material, common_ProductionRun } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { materialLabel } from './aux-run-plan';
import {
  updateRunErrorMessage,
  useReceiveProductionRun,
  useUpdateRunSection,
} from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

type Row = {
  productId: number;
  sizeId: number;
  plannedQty: number;
  received: string;
  defect: string;
};

// Receiving is two steps against the contract: persist received/defect on each run LINE
// (UpdateProductionRun), then post stock into each line's own product + optionally set its
// cost_price (ReceiveProductionRun — NF-06, no run-level product).
// Auxiliary runs (NF-07 / B-3) reuse the same two steps, but the single product-less line's
// received qty is booked into the tech card's output_material_id in the MATERIAL warehouse: no
// per-product grouping, no orphan guard, and cost_price is a no-op (there is no product).
export function ReceiveModal({
  open,
  onOpenChange,
  run,
  isAux = false,
  outputMaterialId = 0,
  outputMaterial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run?: common_ProductionRun;
  isAux?: boolean;
  outputMaterialId?: number;
  outputMaterial?: common_Material;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const { canWriteCosting } = usePermissions();
  const update = useUpdateRunSection();
  const receive = useReceiveProductionRun();

  const [rows, setRows] = useState<Row[]>([]);
  // Setting cost_price is a costing write — off (and disabled) without costing:write.
  const [updateCostPrice, setUpdateCostPrice] = useState(false);
  const busy = update.isPending || receive.isPending;

  // Group rows by product (colour-model) for display, keeping each row's flat index for handlers.
  const groups = useMemo(() => {
    const out: { productId: number; items: { r: Row; i: number }[] }[] = [];
    rows.forEach((r, i) => {
      const g = out.find((x) => x.productId === r.productId);
      if (g) g.items.push({ r, i });
      else out.push({ productId: r.productId, items: [{ r, i }] });
    });
    return out;
  }, [rows]);

  // The aux run is a single product-less line; find its flat index for the received/defect inputs.
  const auxIdx = useMemo(() => {
    const i = rows.findIndex((r) => !r.productId);
    return i >= 0 ? i : 0;
  }, [rows]);
  const auxDest = materialLabel(outputMaterial, outputMaterialId);
  const auxUnit = outputMaterial?.unit?.trim();

  // Reset per-run state on the CLOSED → OPEN transition only. The naive [run, open] deps
  // re-ran mid-flow — step 1's own invalidation refetches `run` on the detail page and the
  // reset silently re-checked updateCostPrice against the user's explicit choice.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    // Sort by product then size so lines group contiguously by colour-model; received defaults
    // to planned ("everything came in" is one click).
    setRows(
      (run?.run?.lines ?? [])
        .map((l) => ({
          productId: l.productId ?? 0,
          sizeId: l.sizeId ?? 0,
          plannedQty: l.plannedQty ?? 0,
          received: l.receivedQty != null ? String(l.receivedQty) : String(l.plannedQty ?? 0),
          defect: l.defectQty != null ? String(l.defectQty) : '0',
        }))
        .sort((a, b) => a.productId - b.productId || a.sizeId - b.sizeId),
    );
    setUpdateCostPrice(canWriteCosting);
  }, [run, open, canWriteCosting]);

  const submit = async () => {
    if (!run?.id || !run.run) return;
    if (isAux) {
      // NF-07: aux receive books into output_material_id — the card must name one, or the RPC
      // fails with FailedPrecondition.
      if (!outputMaterialId) {
        showMessage('Set an output material on the tech card before receiving', 'error');
        return;
      }
    } else {
      // NF-06: a line with received > 0 is booked into its own product — it must have one. Publish
      // the colour-model as a product (or zero its received qty) before receiving.
      const orphans = rows.filter((r) => (Number(r.received) || 0) > 0 && !r.productId);
      if (orphans.length > 0) {
        showMessage(
          `${orphans.length} line(s) have no product — publish the product or set received to 0`,
          'error',
        );
        return;
      }
    }
    // Guard the counts: no negatives, and defects can't exceed what was received.
    for (const r of rows) {
      const rec = Number(r.received);
      const def = Number(r.defect);
      if (!Number.isFinite(rec) || rec < 0 || !Number.isFinite(def) || def < 0) {
        showMessage('Received / defect quantities must be zero or more', 'error');
        return;
      }
      if (def > rec) {
        showMessage('Defect quantity cannot exceed received quantity', 'error');
        return;
      }
    }
    // The receive RPC requires at least one counted unit — catch it before step 1
    // stamps quantities on a run that then can't be received.
    if (!rows.some((r) => (Number(r.received) || 0) > 0)) {
      showMessage('Nothing to receive — every received quantity is 0', 'error');
      return;
    }
    // Step 1 persists counts via read-modify-write like every other section: merge this
    // modal's received/defect into the FRESHLY fetched lines by (product, size) — the `run`
    // prop can be a stale list-cache snapshot and a full-replace from it would silently
    // undo lines/costs/marker edits saved after that snapshot.
    const counted = new Map(rows.map((r) => [`${r.productId}:${r.sizeId}`, r]));
    try {
      await update.mutateAsync({
        id: run.id,
        patch: {},
        mergeLines: (freshLines) =>
          freshLines.map((l) => {
            const r = counted.get(`${l.productId ?? 0}:${l.sizeId ?? 0}`);
            return r
              ? { ...l, receivedQty: Number(r.received) || 0, defectQty: Number(r.defect) || 0 }
              : l;
          }),
      });
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
      return;
    }
    try {
      // Step 2 posts stock into each line's product (or the output material for aux) + optionally
      // sets cost_price (no-op for aux).
      const res = await receive.mutateAsync({
        runId: run.id,
        updateCostPrice: isAux ? false : updateCostPrice,
      });
      showMessage(
        isAux
          ? 'Run received · material stock posted'
          : res.costPriceUpdated
            ? 'Run received · product cost updated'
            : 'Run received · stock posted',
        'success',
      );
      onOpenChange(false);
    } catch (e) {
      // The counts from step 1 ARE saved — say so, or the user can't tell what state the run is in.
      showMessage(
        `Counts saved, but stock was NOT posted: ${
          e instanceof Error ? e.message : 'receive failed'
        } — fix and press receive again`,
        'error',
      );
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              receive PR-{run?.id}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Count received and defect units per line, then post stock into each line's product.
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
            {rows.length === 0 ? (
              <Text variant='inactive' size='small'>
                no lines planned — plan quantities on the run page first
              </Text>
            ) : null}

            {isAux && rows.length > 0 ? (
              <div className='flex flex-col gap-1'>
                <Text size='small'>
                  → {auxDest || 'output material'}
                  {auxUnit ? ` · ${auxUnit}` : ''} · booked into the material warehouse
                </Text>
                <div className='grid grid-cols-[1fr_auto_auto] items-center gap-2'>
                  <Text variant='uppercase' size='small'>
                    quantity
                  </Text>
                  <Text variant='uppercase' size='small'>
                    received
                  </Text>
                  <Text variant='uppercase' size='small'>
                    defect
                  </Text>
                  <RowInputs
                    label={auxUnit || 'units'}
                    planned={rows[auxIdx]?.plannedQty ?? 0}
                    received={rows[auxIdx]?.received ?? '0'}
                    defect={rows[auxIdx]?.defect ?? '0'}
                    onReceived={(v) =>
                      setRows((prev) => {
                        const next = [...prev];
                        next[auxIdx] = { ...next[auxIdx], received: v };
                        return next;
                      })
                    }
                    onDefect={(v) =>
                      setRows((prev) => {
                        const next = [...prev];
                        next[auxIdx] = { ...next[auxIdx], defect: v };
                        return next;
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            {!isAux &&
              groups.map((g) => (
                <div key={g.productId} className='flex flex-col gap-1'>
                  <Text size='small'>
                    {g.productId
                      ? `#${g.productId}`
                      : '(unassigned — publish a product to book stock)'}
                  </Text>
                  <div className='grid grid-cols-[1fr_auto_auto] items-center gap-2'>
                    <Text variant='uppercase' size='small'>
                      size
                    </Text>
                    <Text variant='uppercase' size='small'>
                      received
                    </Text>
                    <Text variant='uppercase' size='small'>
                      defect
                    </Text>
                    {g.items.map(({ r, i }) => (
                      <RowInputs
                        key={`${r.productId}-${r.sizeId}`}
                        label={String(findInDictionary(dictionary, r.sizeId, 'size') || r.sizeId)}
                        planned={r.plannedQty}
                        received={r.received}
                        defect={r.defect}
                        onReceived={(v) =>
                          setRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], received: v };
                            return next;
                          })
                        }
                        onDefect={(v) =>
                          setRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], defect: v };
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}

            {!isAux && canWriteCosting && (
              <label className='flex items-center gap-2 border-t border-textInactiveColor pt-3'>
                <input
                  type='checkbox'
                  checked={updateCostPrice}
                  onChange={(e) => setUpdateCostPrice(e.target.checked)}
                />
                <Text size='small'>
                  set each product’s cost_price from this run’s actual unit cost
                  {run?.plannedUnitCost?.value
                    ? ` (planned ${decimalToInput(run.plannedUnitCost)} ${run.plannedCurrency || ''})`
                    : ''}
                </Text>
              </label>
            )}

            <Text variant='inactive' size='small'>
              {isAux
                ? 'Приёмка приходует выпуск в склад материала (output material) и переводит партию в received — после этого её нельзя удалить.'
                : 'Приёмка приходует сток по каждой строке в её продукт и переводит партию в received — после этого её нельзя удалить.'}
            </Text>
          </div>

          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={busy || rows.length === 0}
              onClick={submit}
            >
              {busy ? 'receiving…' : 'receive'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}

function RowInputs({
  label,
  planned,
  received,
  defect,
  onReceived,
  onDefect,
}: {
  label: string;
  planned: number;
  received: string;
  defect: string;
  onReceived: (v: string) => void;
  onDefect: (v: string) => void;
}) {
  return (
    <>
      <Text size='small'>
        {label} <span className='text-textInactiveColor'>· plan {planned}</span>
      </Text>
      {/* Whole units only — sanitize to digits like the lines grid; a typed "1.5" would
          otherwise pass the >= 0 guard and 400 on the integer proto field mid-flow. */}
      <input
        className={`${cell} w-20`}
        inputMode='numeric'
        value={received}
        onChange={(e) => onReceived(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <input
        className={`${cell} w-20`}
        inputMode='numeric'
        value={defect}
        onChange={(e) => onDefect(e.target.value.replace(/[^0-9]/g, ''))}
      />
    </>
  );
}
