import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

const KINDS = ['sample', 'materials', 'labour', 'outsourcing', 'other'];
const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// R&D / development-cost journal (task 14). Periodic spend on developing a style —
// deliberately NOT part of the product cost_price. 🔒 costing: the list is empty
// without costing:read (the tab is hidden), and add/delete need costing:write.
export function DevExpensesField({ techCardId }: { techCardId: number }) {
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const key = ['techCardDevExpenses', techCardId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => adminService.ListTechCardDevExpenses({ techCardId }),
  });

  const [form, setForm] = useState({
    kind: 'sample',
    description: '',
    amount: '',
    currency: 'EUR',
    incurredAt: '',
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
          incurredAt: form.incurredAt ? new Date(form.incurredAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm((f) => ({ ...f, description: '', amount: '', incurredAt: '' }));
      showMessage('Dev expense added', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add expense', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => adminService.DeleteTechCardDevExpense({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      showMessage('Dev expense removed', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to remove', 'error'),
  });

  const expenses = data?.expenses ?? [];
  const summary = data?.summary;

  if (isLoading) return <Text size='small'>loading…</Text>;

  return (
    <div className='flex flex-col gap-4'>
      <Text variant='inactive' size='small'>
        Periodic R&amp;D spend on developing this style — shown separately from the unit COGS and NOT
        folded into the product cost_price.
      </Text>

      {/* Summary */}
      {summary && (
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
              </Text>
            </div>
            {canWriteCosting && (
              <button
                type='button'
                className='text-textInactiveColor hover:text-error'
                onClick={() => e.id && del.mutate(e.id)}
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
              {CURRENCIES.map((c) => (
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
    </div>
  );
}
