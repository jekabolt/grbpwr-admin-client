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
import { ulid } from 'utils/ulid';
import { materialLabel } from './aux-run-plan';
import { receiptErrorMessage, usePostRunReceipt } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

type Row = {
  lineKey: string;
  productId: number;
  sizeId: number;
  plannedQty: number;
  // Cumulative rollups over the run's EARLIER receipts (server-maintained since Phase 5) — shown
  // as context; the inputs below count THIS delivery only.
  alreadyGood: number;
  alreadyDefect: number;
  received: string;
  defect: string;
  // Phase 7: where this line's defect units go — 'scrap' (default; recorded, cost resolved by the
  // ledger) or 'seconds' (booked into the product's B-grade stock at zero cost, not sellable yet).
  disposition: string;
};

// Receiving is ONE atomic command now (Phase 4, receipt v1): the counted good/defect quantities
// travel in PostProductionRunReceipt per line (by the plan lines' stable line_key), and the server
// records the receipt, posts stock, freezes the valuation and closes the run in a single
// transaction. The old two-step (stamp counts, then receive) could leave counts saved with no stock
// posted; that state is no longer reachable. The idempotency key is minted per modal open, so a
// network retry of the same count REPLAYS the original success instead of double-booking.
// Auxiliary runs (NF-07 / B-3) go through the same command; the single product-less line's good
// qty is booked into the tech card's output_material_id in the MATERIAL warehouse, and cost_price
// is a no-op (there is no product).
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
  const receive = usePostRunReceipt();

  const [rows, setRows] = useState<Row[]>([]);
  // Setting cost_price is a costing write — off (and disabled) without costing:write.
  const [updateCostPrice, setUpdateCostPrice] = useState(false);
  // Phase 5: checked = this receipt DECLARES THE RUN COMPLETE (the Phase 4 semantics, and the
  // default); unchecked books a partial delivery and leaves the run open for further receipts.
  const [finalReceipt, setFinalReceipt] = useState(true);
  // The command's identity: one key per USER INTENT (per modal open), not per attempt — a retry of
  // the same count must replay, a fresh open is a fresh intent.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const busy = receive.isPending;

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

  // What stays undelivered if THIS delivery lands as entered — the final-receipt hint names it.
  const remainderAfterThis = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + Math.max(0, r.plannedQty - r.alreadyGood - (Number(r.received) || 0)),
        0,
      ),
    [rows],
  );

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
    // Sort by product then size so lines group contiguously by colour-model. The inputs count
    // THIS delivery: they default to the REMAINDER (planned − already received across earlier
    // receipts) — on a virgin run that IS the plan, so "everything came in" stays one click, and
    // on a partially received run the cumulative rollup is context, never a pre-filled double-book.
    setRows(
      (run?.run?.lines ?? [])
        .map((l) => {
          const alreadyGood = l.receivedQty ?? 0;
          return {
            lineKey: l.lineKey ?? '',
            productId: l.productId ?? 0,
            sizeId: l.sizeId ?? 0,
            plannedQty: l.plannedQty ?? 0,
            alreadyGood,
            alreadyDefect: l.defectQty ?? 0,
            received: String(Math.max(0, (l.plannedQty ?? 0) - alreadyGood)),
            defect: '0',
            disposition: 'scrap',
          };
        })
        .sort((a, b) => a.productId - b.productId || a.sizeId - b.sizeId),
    );
    setUpdateCostPrice(canWriteCosting);
    setFinalReceipt(true);
    setIdempotencyKey(ulid());
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
      // NF-06: a line with GOOD units is booked into its own product — it must have one. A
      // defect-only count on an unpublished colour-model is fine (recorded, never stocked).
      const orphans = rows.filter((r) => (Number(r.received) || 0) > 0 && !r.productId);
      if (orphans.length > 0) {
        showMessage(
          `${orphans.length} line(s) have no product — publish the product or set received to 0`,
          'error',
        );
        return;
      }
    }
    // Guard the counts: no negatives. There is deliberately NO `defect <= good` rule — the two are
    // disjoint counts (2 good + 8 defective is a legitimate outcome of a bad batch), and the server
    // imposes no such constraint either (its rate is defect / (good + defect)).
    for (const r of rows) {
      const rec = Number(r.received);
      const def = Number(r.defect);
      if (!Number.isFinite(rec) || rec < 0 || !Number.isFinite(def) || def < 0) {
        showMessage('Количества «принято годных» / «брак» должны быть нулём или больше', 'error');
        return;
      }
    }
    // Only counted lines carry a receipt fact. Nothing counted at all = nothing to receive.
    const counted = rows
      .filter((r) => (Number(r.received) || 0) > 0 || (Number(r.defect) || 0) > 0)
      .map((r) => ({
        lineKey: r.lineKey,
        goodQty: Number(r.received) || 0,
        defectQty: Number(r.defect) || 0,
        // The disposition matters only with defects; scrap is the server default either way.
        defectDisposition: Number(r.defect) > 0 ? r.disposition || 'scrap' : 'scrap',
      }));
    const isPartiallyReceived = run.run.status === 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED';
    if (counted.length === 0 && !(finalReceipt && isPartiallyReceived)) {
      // The one legal empty receipt is the FINAL short-close of a partially received run — the
      // operator declares the series complete without a last delivery.
      showMessage(
        'Ничего не посчитано — введите годные и/или брак хотя бы по одной строке',
        'error',
      );
      return;
    }
    if (counted.some((l) => !l.lineKey)) {
      // Every stored line carries a key since 0230; a keyless row means a stale pre-deploy read.
      showMessage('Партия прочитана до обновления — обновите страницу и попробуйте снова', 'error');
      return;
    }
    // All-scrap is a real outcome now: the run closes with the defect recorded and NOTHING posted
    // to stock. Say it plainly instead of refusing.
    const allScrap = counted.every((l) => l.goodQty === 0);
    try {
      // ONE command: counts + stock + valuation + status in a single transaction, idempotent by
      // the per-open key. The lock version is the one the operator counted against — a run edited
      // since is refused (409 → «обновите страницу») rather than counted onto someone else's grid.
      const res = await receive.mutateAsync({
        runId: run.id,
        lines: counted,
        idempotencyKey,
        expectedLockVersion: run.lockVersion ?? 0,
        updateCostPrice: isAux ? false : updateCostPrice,
        partial: !finalReceipt,
      });
      showMessage(
        !finalReceipt
          ? 'Поставка принята: партия остаётся открытой для следующих приёмок'
          : isAux
            ? 'Run received · material stock posted'
            : counted.length === 0
              ? 'Партия закрыта: остаток объявлен непришедшим'
              : allScrap
                ? 'Партия принята: весь выпуск брак, сток не пополнялся'
                : res.costPriceUpdated
                  ? 'Run received · product cost updated'
                  : 'Run received · stock posted',
        'success',
      );
      onOpenChange(false);
    } catch (e) {
      showMessage(receiptErrorMessage(e), 'error');
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
            Count the GOOD units and the defective ones per line, then post the good ones as stock
            into each line's product. Брак НЕ списывает материалы второй раз — ткань уже в стоимости
            партии; scrap разрешается учётом при закрытии серии, seconds уходят в B-сток той же
            модели.
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
            {rows.length === 0 ? (
              <Text variant='inactive' size='small'>
                no lines planned — plan quantities on the run page first
              </Text>
            ) : null}

            {/* The two columns mean different things to the server and the old neutral headings
                («received» / «defect») invited the reading "received = everything that arrived,
                of which N are bad". It is not: received_qty is what gets POSTED TO STOCK, and a
                defect count entered on top of a received count that already included it inflates
                the warehouse by exactly the defective units. Say so where the numbers are typed. */}
            {rows.length > 0 ? (
              <Text variant='inactive' size='small'>
                «принято годных» — единицы, которые уйдут на склад и в продажу; именно это число
                постится в сток. «брак (не попадёт на склад)» — отдельный счётчик, он НЕ входит в
                годные: сервер считает процент брака как брак / (годные + брак), а стоимость брака
                поглощается себестоимостью годных единиц.
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
                    принято годных
                  </Text>
                  <Text variant='uppercase' size='small' title='не попадёт на склад'>
                    брак
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
                  <div className='grid grid-cols-[1fr_auto_auto_auto] items-center gap-2'>
                    <Text variant='uppercase' size='small'>
                      size
                    </Text>
                    <Text variant='uppercase' size='small'>
                      принято годных
                    </Text>
                    <Text variant='uppercase' size='small' title='не попадёт в A-сток'>
                      брак
                    </Text>
                    <Text
                      variant='uppercase'
                      size='small'
                      title='scrap — списание по правилу учёта; seconds — B-сток той же модели (уценка, пока не продаётся)'
                    >
                      судьба брака
                    </Text>
                    {g.items.map(({ r, i }) => (
                      <RowInputs
                        key={`${r.productId}-${r.sizeId}`}
                        label={String(findInDictionary(dictionary, r.sizeId, 'size') || r.sizeId)}
                        planned={r.plannedQty}
                        alreadyGood={r.alreadyGood}
                        alreadyDefect={r.alreadyDefect}
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
                        disposition={r.disposition}
                        canSeconds={!!r.productId && !!r.sizeId}
                        onDisposition={(v) =>
                          setRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], disposition: v };
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}

            {/* Phase 5: partial vs final. Checked (default) = the Phase 4 semantics — this receipt
                declares the run complete. Unchecked books this delivery and keeps the run open. */}
            <label className='flex items-center gap-2 border-t border-textInactiveColor pt-3'>
              <input
                type='checkbox'
                checked={finalReceipt}
                onChange={(e) => setFinalReceipt(e.target.checked)}
              />
              <Text size='small'>
                финальная приёмка — партия объявляется полностью принятой
                {finalReceipt && remainderAfterThis > 0
                  ? ` (остаток ${remainderAfterThis} шт. будет закрыт как непришедший)`
                  : ''}
              </Text>
            </label>
            {!finalReceipt ? (
              <Text variant='inactive' size='small'>
                частичная приёмка: эта поставка бронируется на склад, партия останется открытой —
                следующие поставки принимаются той же кнопкой, финальная приёмка закроет серию.
              </Text>
            ) : null}

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
                ? 'Receiving posts the GOOD quantity into the material warehouse (the defect count is recorded, not stocked) in one atomic step.'
                : 'Receiving posts the GOOD quantity of each line into its own product (the defect count is recorded, not stocked) in one atomic step. Финальная приёмка переводит партию в received — после этого её нельзя удалить. Если весь выпуск брак — партия закроется приёмкой брака, сток не изменится.'}
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
              {busy ? 'receiving…' : finalReceipt ? 'receive' : 'принять поставку'}
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
  alreadyGood = 0,
  alreadyDefect = 0,
  received,
  defect,
  onReceived,
  onDefect,
  disposition,
  canSeconds,
  onDisposition,
}: {
  label: string;
  planned: number;
  alreadyGood?: number;
  alreadyDefect?: number;
  received: string;
  defect: string;
  onReceived: (v: string) => void;
  onDefect: (v: string) => void;
  disposition?: string;
  canSeconds?: boolean;
  onDisposition?: (v: string) => void;
}) {
  return (
    <>
      <Text size='small'>
        {label}{' '}
        <span className='text-textInactiveColor'>
          · plan {planned}
          {alreadyGood > 0 || alreadyDefect > 0
            ? ` · уже принято ${alreadyGood}${alreadyDefect > 0 ? ` (+${alreadyDefect} брак)` : ''} · осталось ${Math.max(0, planned - alreadyGood)}`
            : ''}
        </span>
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
      {onDisposition ? (
        // Enabled only when defects are counted; scrap is the default and the only choice the
        // ledger resolves on its own (seconds need a published product+size — the server refuses
        // otherwise with an actionable message).
        <select
          className={`${cell} w-28`}
          value={disposition || 'scrap'}
          disabled={(Number(defect) || 0) === 0}
          onChange={(e) => onDisposition(e.target.value)}
        >
          <option value='scrap'>scrap</option>
          {/* seconds books B-grade stock — impossible on a product-less planning line; hiding the
              option beats the server's opaque refusal (final-review) */}
          {canSeconds ? <option value='seconds'>seconds → B</option> : null}
        </select>
      ) : null}
    </>
  );
}
