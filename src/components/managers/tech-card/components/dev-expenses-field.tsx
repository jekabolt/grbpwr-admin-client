import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardDevExpense } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useStyleEconomics } from 'components/managers/page/useStyleEconomics';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { SamplePicker } from './sample-picker';
import { sampleKeys, useSamples } from './useSamples';

const KINDS = ['sample', 'materials', 'labour', 'outsourcing', 'other'];
const KIND_ITEMS = KINDS.map((k) => ({ value: k, label: k }));
const CURRENCY_ITEMS = EXPENSE_CURRENCIES.map((c) => ({ value: c.value, label: c.value }));

export const devExpenseKeys = {
  list: (techCardId?: number) => ['techCardDevExpenses', techCardId ?? 0] as const,
};

// The card's R&D ledger + its server rollup. Exported so the costing strip can show "R&D spent"
// without a second request — same query key, so react-query serves both from one fetch.
export function useDevExpenses(techCardId?: number) {
  return useQuery({
    queryKey: devExpenseKeys.list(techCardId),
    queryFn: () => adminService.ListTechCardDevExpenses({ techCardId: techCardId ?? 0 }),
    enabled: !!techCardId,
  });
}

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

const shortDate = (ts?: string) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '';

// A labelled control at reference field density, for the add-expense Toolbar.
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-0.5 ${className ?? ''}`}>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
  );
}

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
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const key = devExpenseKeys.list(techCardId);

  const { data, isLoading } = useDevExpenses(techCardId);

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
    () => expenses.reduce((sum, e) => sum + num(e.amountBase?.value), 0),
    [expenses],
  );
  const scopedHasUnconverted = scoped && expenses.some((e) => !e.amountBase?.value);

  const totalBaseNum = num(summary?.totalBase?.value);
  // Where the money went, first: by-kind totals with their share of the ledger.
  const byKind = (summary?.byKind ?? [])
    .map((b) => ({ kind: b.kind ?? '—', amount: num(b.amountBase?.value) }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // "recovered at N units" needs a per-unit margin, which the tech card does not own — it comes
  // from the style's realised sales (GetStyleEconomics: gross margin ÷ units sold). No sales or
  // no unit cost → the cell reads `—` rather than inventing a payback.
  const { data: econData } = useStyleEconomics(techCardId, canReadCosting && !scoped);
  const sales = econData?.economics?.sales;
  const unitsSold = sales?.unitsSold ?? 0;
  const unitMargin =
    sales?.hasCost && unitsSold > 0 ? num(sales?.grossMargin?.value) / unitsSold : 0;
  const recoveredAtUnits =
    totalBaseNum > 0 && unitMargin > 0 ? Math.ceil(totalBaseNum / unitMargin) : undefined;

  // Sortable ledger — amount is the column people actually scan (spec 16.4). Base amount is what
  // sorts: a mixed-currency ledger cannot be ordered by its raw figures.
  const [sort, setSort] = useState<{ by: 'date' | 'amount'; dir: 'asc' | 'desc' }>({
    by: 'date',
    dir: 'desc',
  });
  const sortedExpenses = useMemo(() => {
    const rows = [...expenses];
    const sign = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sort.by === 'amount') return (num(a.amountBase?.value) - num(b.amountBase?.value)) * sign;
      const at = a.incurredAt ? new Date(a.incurredAt).getTime() : 0;
      const bt = b.incurredAt ? new Date(b.incurredAt).getTime() : 0;
      return (at - bt) * sign;
    });
    return rows;
  }, [expenses, sort]);
  const toggleSort = (by: 'date' | 'amount') =>
    setSort((s) => ({ by, dir: s.by === by && s.dir === 'desc' ? 'asc' : 'desc' }));
  const sortMark = (by: 'date' | 'amount') =>
    sort.by === by ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : '';

  if (isLoading) return <Text size='micro'>loading…</Text>;

  return (
    <div className='flex flex-col gap-3'>
      <Text size='micro' variant='label'>
        {scoped
          ? 'R&D spend attributed to this sample — part of the style dev cost, shown separately from the unit COGS.'
          : 'Periodic R&D spend on developing this style — amortised style spend, deliberately outside the product COGS and never folded into cost_price.'}
      </Text>

      {/* Summary first: "why is R&D €310" answered before you scroll to the ledger. */}
      {scoped ? (
        expenses.length > 0 && (
          <StatGrid min={130}>
            <Stat
              label='sample dev cost'
              big
              value={scopedTotal > 0 ? scopedTotal.toFixed(2) : '—'}
              sub={scopedHasUnconverted ? 'partial — some rows have no FX rate' : 'base currency'}
            />
          </StatGrid>
        )
      ) : (
        <StatGrid min={130}>
          {byKind.map((b) => (
            <Stat
              key={b.kind}
              label={b.kind}
              value={b.amount.toFixed(2)}
              sub={totalBaseNum > 0 ? `${Math.round((b.amount / totalBaseNum) * 100)}%` : undefined}
            />
          ))}
          <Stat
            label='total'
            big
            value={totalBaseNum > 0 ? totalBaseNum.toFixed(2) : '—'}
            sub={summary?.hasUnconverted ? 'partial — missing FX rate' : 'base currency'}
          />
          <Stat
            label='recovered at'
            value={recoveredAtUnits != null ? String(recoveredAtUnits) : '—'}
            sub={recoveredAtUnits != null ? 'units sold, at margin' : 'needs sales + a unit cost'}
          />
          <Stat
            label='per unit'
            value={decimalToInput(summary?.unitCostWithDev) || '—'}
            sub={
              (summary?.orderQty ?? 0) > 0
                ? `unit cost + dev ÷ ${summary?.orderQty}`
                : 'reference, not COGS'
            }
          />
        </StatGrid>
      )}

      {/* Ledger */}
      <GroupLabel>{scoped ? 'expenses' : 'ledger'}</GroupLabel>
      {expenses.length === 0 ? (
        <Text size='micro' variant='label'>
          no development expenses recorded
        </Text>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>
                <button type='button' onClick={() => toggleSort('date')}>
                  date{sortMark('date')}
                </button>
              </th>
              <th>description</th>
              <th>kind</th>
              {!scoped && <th>sample</th>}
              <th>amount</th>
              <th>
                <button type='button' onClick={() => toggleSort('amount')}>
                  base{sortMark('amount')}
                </button>
              </th>
              {canWriteCosting && <th aria-label='actions' />}
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.map((e) => (
              <tr key={e.id}>
                <td>{shortDate(e.incurredAt) || <EmptyCell />}</td>
                <td>{e.description || <EmptyCell />}</td>
                <td className='uppercase'>{e.kind || <EmptyCell />}</td>
                {!scoped && (
                  <td>
                    {e.sampleId ? (
                      `#${sampleNumberById.get(e.sampleId) || e.sampleId}`
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                )}
                <td>
                  {decimalToInput(e.amount) || '—'} {e.currency}
                </td>
                <td>
                  {e.amountBase?.value ? (
                    decimalToInput(e.amountBase)
                  ) : (
                    <Pill tone='warn'>no FX</Pill>
                  )}
                </td>
                {canWriteCosting && (
                  <td>
                    <button
                      type='button'
                      className='text-labelColor hover:text-error'
                      onClick={() => setPendingDelete(e)}
                      aria-label='remove'
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <TotalRow>
              <td>total</td>
              <td />
              <td />
              {!scoped && <td />}
              <td />
              <td>
                {scoped
                  ? scopedTotal > 0
                    ? scopedTotal.toFixed(2)
                    : '—'
                  : totalBaseNum > 0
                    ? totalBaseNum.toFixed(2)
                    : '—'}
              </td>
              {canWriteCosting && <td />}
            </TotalRow>
          </tfoot>
        </DataTable>
      )}
      <Text size='micro' variant='label'>
        dev is a period R&amp;D cost, amortised for information only — NOT folded into unit COGS.
      </Text>

      {/* Add row */}
      {canWriteCosting && (
        <Toolbar className='items-end'>
          <Field label='kind' className='w-[110px]'>
            <Select
              name='dev-expense-kind'
              items={KIND_ITEMS}
              value={form.kind}
              onValueChange={(v: string) => setForm((f) => ({ ...f, kind: v }))}
              placeholder='kind'
              fullWidth
            />
          </Field>
          <Field label='description' className='min-w-[160px] flex-1'>
            <Input
              name='dev-expense-description'
              placeholder='what was bought'
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
          <Field label='amount' className='w-[90px]'>
            <Input
              name='dev-expense-amount'
              type='number'
              step='0.01'
              min='0'
              value={form.amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
            />
          </Field>
          <Field label='currency' className='w-[90px]'>
            <Select
              name='dev-expense-currency'
              items={CURRENCY_ITEMS}
              value={form.currency}
              onValueChange={(v: string) => setForm((f) => ({ ...f, currency: v }))}
              placeholder='cur'
              fullWidth
            />
          </Field>
          <Field label='date' className='w-[130px]'>
            <Input
              name='dev-expense-date'
              type='date'
              value={form.incurredAt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, incurredAt: e.target.value }))
              }
            />
          </Field>
          {/* Attribute the expense to a specific sample (optional). Hidden when the panel is
              already scoped to one sample. */}
          {!scoped && (
            <Field label='sample' className='w-[190px]'>
              <SamplePicker
                techCardId={techCardId}
                value={form.sampleId}
                onChange={(sampleId) => setForm((f) => ({ ...f, sampleId }))}
              />
            </Field>
          )}
          <Button
            type='button'
            variant='main'
            size='sm'
            disabled={!form.amount.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending ? 'adding…' : 'add'}
          </Button>
        </Toolbar>
      )}

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => pendingDelete?.id && del.mutate(pendingDelete.id)}
        title='remove dev expense?'
        confirmLabel='remove'
        width='sm'
      >
        <Text size='micro'>
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
