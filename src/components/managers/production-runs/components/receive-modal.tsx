import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_ProductionRun, common_ProductionRunInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { useReceiveProductionRun, useSaveProductionRun } from './useProductionRuns';

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
export function ReceiveModal({
  open,
  onOpenChange,
  run,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run?: common_ProductionRun;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const { canWriteCosting } = usePermissions();
  const save = useSaveProductionRun();
  const receive = useReceiveProductionRun();

  const [rows, setRows] = useState<Row[]>([]);
  // Setting cost_price is a costing write — off (and disabled) without costing:write.
  const [updateCostPrice, setUpdateCostPrice] = useState(false);
  const busy = save.isPending || receive.isPending;

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

  // Reset per-run state whenever the modal opens for a (different) run. Sort by product then size
  // so lines group contiguously by colour-model; received defaults to planned ("everything came in"
  // is one click).
  useEffect(() => {
    if (!open) return;
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
    const insert: common_ProductionRunInsert = {
      ...run.run,
      lines: rows.map((r) => ({
        productId: r.productId,
        sizeId: r.sizeId,
        plannedQty: r.plannedQty,
        receivedQty: Number(r.received) || 0,
        defectQty: Number(r.defect) || 0,
      })),
    };
    try {
      // 1) persist the counted quantities, 2) post stock into each line's product + opt. cost_price.
      await save.mutateAsync({ id: run.id, run: insert });
      const res = await receive.mutateAsync({ runId: run.id, updateCostPrice });
      showMessage(
        res.costPriceUpdated
          ? 'Run received · product cost updated'
          : 'Run received · stock posted',
        'success',
      );
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to receive run', 'error');
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
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
            {groups.map((g) => (
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

            {canWriteCosting && (
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
              Приёмка приходует сток по каждой строке в её продукт и переводит партию в received —
              после этого её нельзя удалить.
            </Text>
          </div>

          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button type='button' variant='main' size='lg' disabled={busy} onClick={submit}>
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
      <input
        className={`${cell} w-20`}
        type='number'
        min='0'
        value={received}
        onChange={(e) => onReceived(e.target.value)}
      />
      <input
        className={`${cell} w-20`}
        type='number'
        min='0'
        value={defect}
        onChange={(e) => onDefect(e.target.value)}
      />
    </>
  );
}
