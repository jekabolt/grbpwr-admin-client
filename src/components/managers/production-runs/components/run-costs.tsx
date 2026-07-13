import {
  common_ProductionRun,
  common_ProductionRunCost,
  common_ProductionRunCostKind,
} from 'api/proto-http/admin';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { runCostKindOptions } from './options';
import { useUpdateRunSection } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const isoToDate = (ts?: string) => (ts ? ts.slice(0, 10) : '');
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

type CostDraft = {
  kind: string;
  description: string;
  amount: string;
  currency: string;
  incurredAt: string;
};

// Actual cost articles of a run (phase 2). Moved off the create/edit modal onto the detail page
// (the modal is now meta-only) and saved via read-modify-write so it can't clobber the lines /
// marker sections. The server folds each article to base currency (amount_base) on read.
export function RunCosts({
  run,
  canEdit,
  canReadCosting,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  canReadCosting: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const [costs, setCosts] = useState<CostDraft[]>([]);

  useEffect(() => {
    setCosts(
      (run.run?.costs ?? []).map((c) => ({
        kind: c.kind ?? 'PRODUCTION_RUN_COST_KIND_OTHER',
        description: c.description ?? '',
        amount: decimalToInput(c.amount),
        currency: c.currency ?? 'EUR',
        incurredAt: isoToDate(c.incurredAt),
      })),
    );
  }, [run]);

  // Cost articles are confidential — hidden entirely without costing:read (never a fake €0.00).
  if (!canReadCosting) return null;

  const patchCost = (i: number, patch: Partial<CostDraft>) =>
    setCosts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCost = () =>
    setCosts((prev) => [
      ...prev,
      {
        kind: 'PRODUCTION_RUN_COST_KIND_MATERIALS',
        description: '',
        amount: '',
        currency: 'EUR',
        incurredAt: '',
      },
    ]);

  const save = async () => {
    const next: common_ProductionRunCost[] = costs
      .filter((c) => c.amount.trim())
      .map((c) => ({
        kind: c.kind as common_ProductionRunCostKind,
        description: c.description.trim(),
        amount: inputToDecimal(c.amount),
        currency: c.currency,
        amountBase: undefined, // server folds to base via FX
        incurredAt: dateToIso(c.incurredAt),
      }));
    try {
      await update.mutateAsync({ id: run.id!, patch: { costs: next } });
      showMessage('Costs saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save costs', 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-4'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          actual costs
        </Text>
        {canEdit && (
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
          <div key={i} className='grid grid-cols-2 gap-2 sm:grid-cols-6'>
            <select
              className={cell}
              disabled={!canEdit}
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
              disabled={!canEdit}
              value={c.description}
              onChange={(e) => patchCost(i, { description: e.target.value })}
            />
            <input
              className={cell}
              inputMode='decimal'
              placeholder='amount'
              disabled={!canEdit}
              value={c.amount}
              onChange={(e) => patchCost(i, { amount: sanitizeDecimal(e.target.value) })}
            />
            <select
              className={cell}
              disabled={!canEdit}
              value={c.currency}
              onChange={(e) => patchCost(i, { currency: e.target.value })}
            >
              {CURRENCIES.map((cur) => (
                <option key={cur.value} value={cur.value}>
                  {cur.value}
                </option>
              ))}
            </select>
            <div className='flex items-center gap-1'>
              <input
                className={cell}
                type='date'
                disabled={!canEdit}
                value={c.incurredAt}
                onChange={(e) => patchCost(i, { incurredAt: e.target.value })}
              />
              {canEdit ? (
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove cost'
                  onClick={() => setCosts((prev) => prev.filter((_, j) => j !== i))}
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
