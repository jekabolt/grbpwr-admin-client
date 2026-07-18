import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardDevExpense } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { SamplePicker } from './sample-picker';
import { sampleKeys, useSamples } from './useSamples';

const KINDS = ['sample', 'materials', 'labour', 'outsourcing', 'other'];
const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// R&D / development-cost journal (task 14). Periodic spend on developing a style —
// deliberately NOT part of the product cost_price. 🔒 costing: the list is empty
// without costing:read (the tab is hidden), and add/delete need costing:write.
//
// scopedSampleId turns this into a sample sub-panel (W3.5): the list is filtered to that
// sample, the add-row is locked to it (kind defaults to `sample`, no picker), and the summary
// becomes a sample-scoped subtotal instead of the whole card's dev cost.
export function DevExpensesField({
  techCardId,
  scopedSampleId,
}: {
  techCardId: number;
  scopedSampleId?: number;
}) {
  const scoped = !!scopedSampleId;
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const key = ['techCardDevExpenses', techCardId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => adminService.ListTechCardDevExpenses({ techCardId }),
  });

  // Per-card sample numbers for labelling rows (`sample #N` rather than the DB id). Cached from
  // the samples tab, so this is usually free. Skipped in scoped mode where the sample is implied.
  const { data: samplesData } = useSamples(scoped ? undefined : techCardId);
  const sampleNumberById = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of samplesData?.samples ?? []) if (s.id != null) m.set(s.id, s.number ?? 0);
    return m;
  }, [samplesData]);

  const [form, setForm] = useState({
    kind: 'sample',
    description: '',
    amount: '',
    currency: 'EUR',
    incurredAt: '',
    sampleId: scopedSampleId ?? 0,
  });

  const add = useMutation({
    mutationFn: () =>
      adminService.AddTechCardDevExpense({
        expense: {
          techCardId,
          kind: form.kind,
          description: form.description.trim(),
          amount: { value: form.amount.trim() },
          currency: form.currency,
          fittingId: 0,
          sampleId: scopedSampleId ?? form.sampleId ?? 0,
          incurredAt: form.incurredAt ? new Date(form.incurredAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      // A sample-attributed expense changes that sample's composed cost (GetSample.manualBase) —
      // refresh the sample tree too, or the "cost: … + manual …" line above stays stale.
      qc.invalidateQueries({ queryKey: sampleKeys.all });
      // Keep the picked sample/kind for the next entry; only clear the per-row fields.
      setForm((f) => ({ ...f, description: '', amount: '', incurredAt: '' }));
      showMessage('Dev expense added', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add expense', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => adminService.DeleteTechCardDevExpense({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: sampleKeys.all });
      showMessage('Dev expense removed', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to remove', 'error'),
  });

  // Deleting a financial record is immediate and permanent server-side (no undo) — confirm first,
  // same as every other destructive delete in this app (materials/, order/, tech-cards list).
  const [pendingDelete, setPendingDelete] = useState<common_TechCardDevExpense | null>(null);

  const allExpenses = data?.expenses ?? [];
  const expenses = scoped ? allExpenses.filter((e) => e.sampleId === scopedSampleId) : allExpenses;
  const summary = data?.summary;
  // In scoped mode the card summary is misleading — subtotal just this sample's rows.
  // Uncosted rows (no FX rate → no amountBase) parse to NaN; count them as 0 so one such row
  // doesn't poison the whole sum into '—' (the ⚠ partial flag already says it's incomplete).
  const scopedTotal = useMemo(
    () =>
      expenses.reduce((sum, e) => {
        const n = parseDecimalNumber(e.amountBase?.value);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [expenses],
  );
  const scopedHasUnconverted = scoped && expenses.some((e) => !e.amountBase?.value);

  if (isLoading) return <Text size='small'>loading…</Text>;

  return (
    <div className='flex flex-col gap-4'>
      <Text variant='inactive' size='small'>
        {scoped
          ? 'R&D spend attributed to this sample — part of the style dev cost, shown separately from the unit COGS.'
          : 'Periodic R&D spend on developing this style — shown separately from the unit COGS and NOT folded into the product cost_price.'}
      </Text>

      {/* Summary */}
      {scoped
        ? expenses.length > 0 && (
            <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
              <Text size='small'>
                sample dev cost (EUR): {scopedTotal ? scopedTotal.toFixed(2) : '—'}
                {scopedHasUnconverted ? ' ⚠ partial (some rows have no FX rate)' : ''}
              </Text>
            </div>
          )
        : summary && (
            <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
              <Text size='small'>
                total dev cost (EUR): {decimalToInput(summary.totalBase) || '—'}
                {summary.hasUnconverted ? ' ⚠ partial (some rows have no FX rate)' : ''}
              </Text>
              {(summary.byKind ?? []).length > 0 && (
                <Text variant='inactive' size='small'>
                  {(summary.byKind ?? [])
                    .map((b) => `${b.kind}: ${decimalToInput(b.amountBase) || '—'}`)
                    .join(' · ')}
                </Text>
              )}
              {summary.unitCostWithDev?.value && (
                <Text variant='inactive' size='small'>
                  unit cost incl. dev (reference, {summary.orderQty || 0} units):{' '}
                  {decimalToInput(summary.unitCostWithDev)} — amortised, not the COGS
                </Text>
              )}
            </div>
          )}

      {/* List */}
      <div className='flex flex-col gap-1'>
        {expenses.length === 0 && (
          <Text variant='inactive' size='small'>
            no development expenses recorded
          </Text>
        )}
        {expenses.map((e) => (
          <div
            key={e.id}
            className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor p-2'
          >
            <div className='flex flex-col'>
              <Text size='small'>
                <span className='uppercase'>{e.kind}</span> · {e.description || '—'}
              </Text>
              <Text variant='inactive' size='small'>
                {decimalToInput(e.amount)} {e.currency}
                {e.amountBase?.value ? ` (€${decimalToInput(e.amountBase)})` : ' (no FX)'}
                {e.incurredAt ? ` · ${new Date(e.incurredAt).toLocaleDateString()}` : ''}
                {e.fittingId ? ` · fitting #${e.fittingId}` : ''}
                {!scoped && e.sampleId
                  ? ` · sample #${sampleNumberById.get(e.sampleId) || e.sampleId}`
                  : ''}
              </Text>
            </div>
            {canWriteCosting && (
              <button
                type='button'
                className='text-textInactiveColor hover:text-error'
                onClick={() => setPendingDelete(e)}
                aria-label='remove'
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {canWriteCosting && (
        <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
          <Text variant='uppercase' size='small'>
            add expense
          </Text>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
            <select
              className={cell}
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className={`${cell} col-span-2`}
              placeholder='description'
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <input
              className={cell}
              type='number'
              step='0.01'
              min='0'
              placeholder='amount'
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <select
              className={cell}
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {EXPENSE_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
            <input
              className={cell}
              type='date'
              value={form.incurredAt}
              onChange={(e) => setForm((f) => ({ ...f, incurredAt: e.target.value }))}
            />
          </div>
          {/* Attribute the expense to a specific sample (optional). Hidden when the panel is
              already scoped to one sample. */}
          {!scoped && (
            <div className='sm:w-1/2'>
              <SamplePicker
                techCardId={techCardId}
                value={form.sampleId}
                onChange={(sampleId) => setForm((f) => ({ ...f, sampleId }))}
              />
            </div>
          )}
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='self-start uppercase'
            disabled={!form.amount.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending ? 'adding…' : 'add'}
          </Button>
        </div>
      )}

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => pendingDelete?.id && del.mutate(pendingDelete.id)}
        title='remove dev expense?'
        confirmLabel='remove'
      >
        <Text size='small'>
          Permanently delete this {pendingDelete?.kind ?? ''} expense
          {pendingDelete?.description ? ` — "${pendingDelete.description}"` : ''}
          {pendingDelete
            ? ` (${decimalToInput(pendingDelete.amount)} ${pendingDelete.currency})`
            : ''}
          ? This cannot be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
