import {
  common_ProductionRun,
  common_ProductionRunCost,
  common_ProductionRunCostKind,
} from 'api/proto-http/admin';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { runCostKindOptions } from './options';
import { updateRunErrorMessage, useUpdateRunSection } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const isoToDate = (ts?: string) => (ts ? ts.slice(0, 10) : '');
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

type CostDraft = {
  kind: string;
  description: string;
  amount: string;
  currency: string;
  incurredAt: string;
  // Cost-document fields (Phase 9): the invoice behind the accrual. document_ref + ap_status are
  // editable; supplier/vat ride read-only through orig until a vendor picker lands.
  documentRef: string;
  apStatus: string;
  // The stored article this draft came from, if any — used to carry its server-folded
  // amountBase through an untouched save (see save()).
  orig?: common_ProductionRunCost;
};

// Actual cost articles of a run (phase 2). Moved off the create/edit modal onto the detail page
// (the modal is now meta-only) and saved via read-modify-write so it can't clobber the lines /
// marker sections. The server folds each article to base currency (amount_base) on read.
export function RunCosts({
  run,
  canEdit,
  canReadCosting,
  locked = false,
  onDirtyChange,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  canReadCosting: boolean;
  /**
   * Reports the unsaved-draft flag upwards: the "· unsaved" marker moved from this panel's own
   * heading onto the run conveyor. Pass a STABLE callback — it fires from an effect.
   */
  onDirtyChange?: (dirty: boolean) => void;
  // A received/closed run is immutable server-side (ErrProductionRunReceivedImmutable), and cost
  // articles are written through UpdateProductionRun — so every edit control here would produce a
  // guaranteed rejection. The list stays readable; only the writes go away.
  locked?: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const canEditCosts = canEdit && !locked;
  const [costs, setCosts] = useState<CostDraft[]>([]);
  // Sibling saves refetch the run — don't let that resync wipe an in-progress draft.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setCosts(
      (run.run?.costs ?? []).map((c) => ({
        kind: c.kind ?? 'PRODUCTION_RUN_COST_KIND_OTHER',
        description: c.description ?? '',
        amount: decimalToInput(c.amount),
        currency: c.currency ?? 'EUR',
        incurredAt: isoToDate(c.incurredAt),
        documentRef: c.documentRef ?? '',
        apStatus: c.apStatus ?? '',
        orig: c,
      })),
    );
  }, [run, dirty]);

  // Before the costing gate below: hooks may not sit behind an early return. The cleanup is
  // load-bearing — an unmounted editor has no draft left to save, and without it the conveyor
  // would keep promising unsaved cost articles that died with the component.
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // Cost articles are confidential — hidden entirely without costing:read (never a fake €0.00).
  if (!canReadCosting) return null;

  const patchCost = (i: number, patch: Partial<CostDraft>) => {
    setDirty(true);
    setCosts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };
  const addCost = () => {
    setDirty(true);
    setCosts((prev) => [
      ...prev,
      {
        kind: 'PRODUCTION_RUN_COST_KIND_MATERIALS',
        description: '',
        amount: '',
        currency: 'EUR',
        incurredAt: '',
        documentRef: '',
        apStatus: '',
      },
    ]);
  };

  const save = async () => {
    // A drafted article without an amount would silently vanish under the filter below —
    // refuse instead of reporting a lying "Costs saved".
    const incomplete = costs.some(
      (c) => !c.amount.trim() && (c.description.trim() || c.incurredAt),
    );
    if (incomplete) {
      showMessage('A cost article is missing its amount — fill or remove it', 'error');
      return;
    }
    const next: common_ProductionRunCost[] = costs
      .filter((c) => c.amount.trim())
      .map((c) => {
        // Untouched amount+currency keep the stored server-folded base amount — resending
        // undefined would re-fold EVERY article at today's FX rate on any unrelated edit.
        const untouched =
          c.orig &&
          decimalToInput(c.orig.amount) === c.amount &&
          (c.orig.currency ?? 'EUR') === c.currency;
        return {
          kind: c.kind as common_ProductionRunCostKind,
          description: c.description.trim(),
          amount: inputToDecimal(c.amount),
          currency: c.currency,
          amountBase: untouched ? c.orig?.amountBase : undefined, // unset → server folds via FX
          incurredAt: dateToIso(c.incurredAt),
          documentRef: c.documentRef.trim(),
          apStatus: c.apStatus,
          // Supplier/VAT ride through unchanged until their editors land (vendor picker, VAT calc).
          supplierId: c.orig?.supplierId ?? 0,
          vatRate: c.orig?.vatRate,
          vatAmount: c.orig?.vatAmount,
        };
      });
    try {
      await update.mutateAsync({
        id: run.id!,
        lockVersion: run.lockVersion ?? 0,
        patch: { costs: next },
      });
      setDirty(false);
      showMessage('Costs saved', 'success');
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          actual costs · начислено
          {locked ? (
            <span className='ml-2 lowercase text-labelColor'>· закрыто, правки невозможны</span>
          ) : null}
        </Text>
        {canEditCosts && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={addCost}
            >
              add cost
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              disabled={update.isPending}
              onClick={save}
            >
              {update.isPending ? 'saving…' : 'save costs'}
            </Button>
          </div>
        )}
      </div>

      {costs.length === 0 ? (
        <Text variant='inactive' size='small'>
          no cost articles yet
        </Text>
      ) : (
        costs.map((c, i) => (
          <div key={i} className='grid grid-cols-2 gap-2 sm:grid-cols-8'>
            <select
              className={cell}
              disabled={!canEditCosts}
              value={c.kind}
              onChange={(e) => patchCost(i, { kind: e.target.value })}
            >
              {runCostKindOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className={`${cell} sm:col-span-2`}
              placeholder='description'
              disabled={!canEditCosts}
              value={c.description}
              onChange={(e) => patchCost(i, { description: e.target.value })}
            />
            <input
              className={cell}
              inputMode='decimal'
              placeholder='amount'
              disabled={!canEditCosts}
              value={c.amount}
              onChange={(e) => patchCost(i, { amount: sanitizeDecimal(e.target.value) })}
            />
            <select
              className={cell}
              disabled={!canEditCosts}
              value={c.currency}
              onChange={(e) => patchCost(i, { currency: e.target.value })}
            >
              {EXPENSE_CURRENCIES.map((cur) => (
                <option key={cur.value} value={cur.value}>
                  {cur.value}
                </option>
              ))}
            </select>
            <input
              className={cell}
              placeholder='№ счёта / документа'
              disabled={!canEditCosts}
              value={c.documentRef}
              onChange={(e) => patchCost(i, { documentRef: e.target.value })}
              title='документ поставщика за этой статьёй — шаг от «начислено» к «оплачено»'
            />
            <select
              className={cell}
              disabled={!canEditCosts}
              value={c.apStatus}
              onChange={(e) => patchCost(i, { apStatus: e.target.value })}
              title='статус оплаты: начислено — счёта ещё нет; получен счёт; оплачено'
            >
              <option value=''>начислено</option>
              <option value='invoiced'>получен счёт</option>
              <option value='paid'>оплачено</option>
            </select>
            <div className='flex items-center gap-1'>
              <input
                className={cell}
                type='date'
                disabled={!canEditCosts}
                value={c.incurredAt}
                onChange={(e) => patchCost(i, { incurredAt: e.target.value })}
              />
              {canEditCosts ? (
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove cost'
                  onClick={() => {
                    setDirty(true);
                    setCosts((prev) => prev.filter((_, j) => j !== i));
                  }}
                >
                  ✕
                </Button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
