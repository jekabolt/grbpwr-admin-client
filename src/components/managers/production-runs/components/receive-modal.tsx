import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_ProductionRun, common_ProductionRunInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { useReceiveProductionRun, useSaveProductionRun } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

type Row = { sizeId: number; plannedQty: number; received: string; defect: string };

// Receiving is two steps against the contract: persist received/defect quantities on the run
// (UpdateProductionRun), then post stock + optionally set cost_price (ReceiveProductionRun).
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
  const { data: techCard } = useTechCard(open ? run?.run?.techCardId : undefined);
  const linkedProducts = techCard?.techCard?.productIds ?? [];

  const [rows, setRows] = useState<Row[]>([]);
  const [productId, setProductId] = useState('');
  // Setting cost_price is a costing write — off (and disabled) without costing:write.
  const [updateCostPrice, setUpdateCostPrice] = useState(false);
  const busy = save.isPending || receive.isPending;

  // Reset ALL per-run state when the modal opens for a (different) run — otherwise the target
  // productId / checkbox leak across runs and stock could post to the wrong product.
  useEffect(() => {
    if (!open) return;
    setRows(
      (run?.run?.sizes ?? []).map((s) => ({
        sizeId: s.sizeId ?? 0,
        plannedQty: s.plannedQty ?? 0,
        received: s.receivedQty != null ? String(s.receivedQty) : String(s.plannedQty ?? 0),
        defect: s.defectQty != null ? String(s.defectQty) : '0',
      })),
    );
    setProductId('');
    setUpdateCostPrice(canWriteCosting);
  }, [run, open, canWriteCosting]);

  useEffect(() => {
    if (open && linkedProducts.length > 0) setProductId((p) => p || String(linkedProducts[0]));
  }, [open, linkedProducts]);

  const submit = async () => {
    const pid = Number(productId) || 0;
    if (!pid) {
      showMessage('Target product id is required', 'error');
      return;
    }
    if (!run?.id || !run.run) return;
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
      sizes: rows.map((r) => ({
        sizeId: r.sizeId,
        plannedQty: r.plannedQty,
        receivedQty: Number(r.received) || 0,
        defectQty: Number(r.defect) || 0,
      })),
    };
    try {
      // 1) persist the counted quantities, 2) post stock + optional cost_price.
      await save.mutateAsync({ id: run.id, run: insert });
      const res = await receive.mutateAsync({
        runId: run.id,
        productId: pid,
        updateCostPrice,
      });
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
            Count received and defect units per size, then post stock.
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
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
              {rows.map((r, i) => (
                <RowInputs
                  key={r.sizeId}
                  label={findInDictionary(dictionary, r.sizeId, 'size') || String(r.sizeId)}
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

            <label className='flex flex-col gap-1 border-t border-textInactiveColor pt-3'>
              <Text size='small'>target product id (stock is posted here) *</Text>
              <input
                className={cell}
                type='number'
                min='0'
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              />
              {linkedProducts.length > 0 ? (
                <Text variant='inactive' size='small'>
                  linked to this tech card: {linkedProducts.join(', ')}
                </Text>
              ) : null}
            </label>

            {canWriteCosting && (
              <label className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={updateCostPrice}
                  onChange={(e) => setUpdateCostPrice(e.target.checked)}
                />
                <Text size='small'>
                  set product cost_price from this run’s actual unit cost
                  {run?.plannedUnitCost?.value
                    ? ` (planned ${decimalToInput(run.plannedUnitCost)} ${run.plannedCurrency || ''})`
                    : ''}
                </Text>
              </label>
            )}

            <Text variant='inactive' size='small'>
              Приёмка приходует сток и переводит партию в received — после этого её нельзя удалить.
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
