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
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Progress } from 'ui/components/progress';
import { Row } from 'ui/components/row';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { HelpMark, noFx } from './costing-vocab';
import { SamplePicker } from './sample-picker';
import { sampleKeys, useSamples } from './useSamples';
import { devExpenseKeys } from './useStyleReadViews';

// The server's kind vocabulary — these strings travel to the API — and its operator-facing face.
// The label map is used in all three places a kind is shown (the breakdown list, the ledger column,
// the composer's select), so one expense never reads «materials» in one and «MATERIALS» in another.
const KIND_RU: Record<string, string> = {
  sample: 'samples',
  materials: 'materials',
  labour: 'labour',
  outsourcing: 'outsourcing',
  other: 'other',
};
const KINDS = ['sample', 'materials', 'labour', 'outsourcing', 'other'];
const KIND_ITEMS = KINDS.map((k) => ({ value: k, label: KIND_RU[k] ?? k }));
const kindLabel = (kind?: string) => (kind ? KIND_RU[kind] ?? kind : '');
const CURRENCY_ITEMS = EXPENSE_CURRENCIES.map((c) => ({ value: c.value, label: c.value }));

// Defined in the keys-only leaf module so the production-run mutations can invalidate it without
// importing this component. Re-exported here because this is where callers have always found it.
export { devExpenseKeys };

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
  ts ? new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : '';

// A labelled control at reference field density, for the add-expense composer.
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

// The one headline number of a column: figure, its unit, and the sentence saying what was measured.
// Not a Stat cell — a Stat cell is a box, and this section is already the block.
function BigFigure({ value, unit, sub }: { value: string; unit?: string; sub?: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <div className='flex items-baseline gap-1'>
        <Text size='statBig' component='span'>
          {value}
        </Text>
        {unit && (
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            {unit}
          </Text>
        )}
      </div>
      {sub && (
        <Text size='micro' variant='label'>
          {sub}
        </Text>
      )}
    </div>
  );
}

// Sorting a ledger is a READ action, and the whole tech-card form is wrapped in
// `<fieldset disabled>` on a RELEASED card — a `<button>` header would silently stop sorting
// exactly where the archive is read most. Same escape as costing-vocab's HelpMark: a `<span>` is
// not a form control, so `fieldset[disabled]` cannot reach it; the keydown handler is what makes
// it a real control rather than a mouse-only one.
function SortHeader({
  label,
  active,
  dir,
  onToggle,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onToggle: () => void;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className='cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
    >
      {label}
      {active ? (dir === 'desc' ? ' ▾' : ' ▴') : ''}
    </span>
  );
}

// R&D / development-cost journal (task 14). Periodic spend on developing a style —
// deliberately NOT part of the product cost_price. 🔒 costing: the list is empty
// without costing:read (the tab is hidden), and add/delete need costing:write.
//
// DELIBERATE — this panel does NOT stage into the card's one save (phase 19, same reasoning as
// roles-field). It is a ledger, not a draft: «add an expense» IS the commit — the row appears, the
// totals move, the sample's composed cost changes. Staging it would mean pressing add wrote nothing
// and showed nothing until the operator found the header save, which is a worse card than the one
// phase 19 is fixing. Delete is the same in reverse, and it is destructive and confirmed: nothing
// about it is a draft edit. Do not "fix" this into the staged model.
//
// scopedSampleId turns this into a sample sub-panel (W3.5): the list is filtered to that
// sample, the composer is locked to it (kind defaults to `sample`, no picker), and the summary
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

  // Per-card sample numbers for labelling rows (`образец #N` rather than the DB id). Cached from
  // the samples tab, so this is usually free. Skipped in scoped mode where the sample is implied.
  const { data: samplesData } = useSamples(scoped ? undefined : techCardId);
  const sampleNumberById = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of samplesData?.samples ?? []) if (s.id != null) m.set(s.id, s.number ?? 0);
    return m;
  }, [samplesData]);

  const blankForm = () => ({
    kind: 'sample',
    description: '',
    amount: '',
    currency: 'EUR',
    incurredAt: '',
    sampleId: scopedSampleId ?? 0,
  });
  const [form, setForm] = useState(blankForm);
  // The composer is a modal, not a permanent strip: an expense is logged rarely, and six inline
  // fields cost the section its whole width every time someone comes here to READ the ledger.
  const [addOpen, setAddOpen] = useState(false);
  const closeAdd = () => {
    setAddOpen(false);
    setForm(blankForm());
  };

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
      // Close HERE, not on confirm (closeOnConfirm={false}): a backend rejection must leave the
      // filled form standing instead of dismissing the dialog and wiping what was typed.
      closeAdd();
      showMessage('expense added', 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : "couldn't add the expense", 'error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => adminService.DeleteTechCardDevExpense({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: sampleKeys.all });
      showMessage('expense deleted', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : "couldn't delete", 'error'),
  });

  // Deleting a financial record is immediate and permanent server-side (no undo) — confirm first,
  // same as every other destructive delete in this app (materials/, order/, tech-cards list).
  const [pendingDelete, setPendingDelete] = useState<common_TechCardDevExpense | null>(null);

  const allExpenses = data?.expenses ?? [];
  const expenses = scoped ? allExpenses.filter((e) => e.sampleId === scopedSampleId) : allExpenses;
  const summary = data?.summary;
  // In scoped mode the card summary is misleading — subtotal just this sample's rows.
  // Uncosted rows (no FX rate → no amountBase) parse to NaN; count them as 0 so one such row
  // doesn't poison the whole sum into '—' (the partial flag already says it's incomplete).
  const scopedTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + num(e.amountBase?.value), 0),
    [expenses],
  );
  const scopedHasUnconverted = scoped && expenses.some((e) => !e.amountBase?.value);

  const totalBaseNum = num(summary?.totalBase?.value);
  // Planned units come from the SERVER rollup (summary.order_qty), not from the card form. The card
  // used to carry a made-up "typical" size run; that field is gone — the planned quantity of a style
  // is the sum of what its real production runs plan. If the server sends no quantity, there is no
  // run to amortise over and the panel says so instead of dividing by zero.
  const plannedUnits = summary?.orderQty ?? 0;
  // Where the money went: by-kind totals with their share of the ledger. A list, not a second grid
  // of stat cells — five kinds are five numbers, and five numbers are a list.
  const byKind = (summary?.byKind ?? [])
    .map((b) => ({ kind: b.kind ?? '—', amount: num(b.amountBase?.value) }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // ⚠ THIS IS NOT THE break-even AT THE TOP OF THE TAB, and the two are allowed to disagree.
  //   costing-field.tsx  R&D ÷ (net catalogue retail − unit cost)  → the PLANNED payback, priced
  //                      off the colourways' catalogue prices, available before a single sale.
  //   here               R&D ÷ (realised gross margin ÷ units sold) → the payback at the margin the
  //                      style ACTUALLY earns (GetStyleEconomics), available only once it has sold.
  // Both used to be labelled «break-even», 700px apart, with nothing on screen naming the
  // difference. Everything this column prints therefore says «at the actual margin» out loud, and
  // the ? next to the group label states the split.
  const { data: econData } = useStyleEconomics(techCardId, canReadCosting && !scoped);
  const sales = econData?.economics?.sales;
  const unitsSold = sales?.unitsSold ?? 0;
  const unitMargin =
    sales?.hasCost && unitsSold > 0 ? num(sales?.grossMargin?.value) / unitsSold : 0;
  const recoveredAtUnits =
    totalBaseNum > 0 && unitMargin > 0 ? Math.ceil(totalBaseNum / unitMargin) : undefined;

  // Each unavailable input gets its OWN sentence: «нет данных» sends people to the wrong screen.
  const breakEvenBasis = (): string => {
    if (!(totalBaseNum > 0)) return 'no development expenses yet';
    if (!sales) return 'no sales data for the style';
    if (!sales.hasCost) return "the sold garments have no cost — the margin can't be computed";
    if (unitsSold <= 0) return "the style hasn't sold yet — there is no actual margin";
    if (!(unitMargin > 0)) return 'the actual sales margin is not positive';
    return `at the actual margin of ${unitMargin.toFixed(2)} per sold garment`;
  };

  const perUnit = plannedUnits > 0 ? totalBaseNum / plannedUnits : undefined;
  const coverPct =
    recoveredAtUnits != null && plannedUnits > 0
      ? (recoveredAtUnits / plannedUnits) * 100
      : undefined;

  // Sortable ledger — the base amount is what sorts, because a mixed-currency ledger cannot be
  // ordered by its raw figures.
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
  // `undefined`, а не `'none'`, для неактивной колонки: по шаблону ARIA sortable table атрибут
  // висит ТОЛЬКО на той колонке, по которой сейчас сортируют, и «aria-sort="none"» на второй
  // объявляет её несортированной наравне с активной — скринридер перестаёт понимать, какая из двух
  // задаёт порядок. React выбрасывает атрибут целиком, когда значение `undefined`.
  const ariaSort = (by: 'date' | 'amount'): 'ascending' | 'descending' | undefined =>
    sort.by === by ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined;

  if (isLoading) return <Text size='micro'>loading…</Text>;

  return (
    <div className='flex flex-col gap-3'>
      {scoped ? (
        <>
          <Text size='micro' variant='label'>
            development expenses attributed to this sample — part of the style's R&amp;D, outside
            the garment's unit cost.
          </Text>
          {expenses.length > 0 && (
            <div>
              <GroupLabel flush>put into the sample</GroupLabel>
              <BigFigure
                value={scopedTotal > 0 ? scopedTotal.toFixed(2) : '—'}
                sub={
                  scopedHasUnconverted
                    ? `incomplete — for some lines, ${noFx()}`
                    : 'in the base currency'
                }
              />
            </div>
          )}
        </>
      ) : (
        /* Two questions, two columns: what went in, and when it comes back. Everything that used
           to be nine stat cells lives inside one of the two. */
        <div className='grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2'>
          <div>
            <GroupLabel flush>put into the style</GroupLabel>
            <BigFigure
              value={totalBaseNum > 0 ? totalBaseNum.toFixed(2) : '—'}
              sub={
                totalBaseNum <= 0
                  ? 'no development expenses yet'
                  : summary?.hasUnconverted
                    ? `incomplete — for some lines, ${noFx()}`
                    : 'in the base currency'
              }
            />
            {byKind.length > 0 && (
              <div className='mt-2 flex flex-col'>
                {byKind.map((b) => (
                  <Row
                    key={b.kind}
                    label={
                      <span className='flex items-baseline gap-1.5'>
                        <span>{kindLabel(b.kind)}</span>
                        {totalBaseNum > 0 && (
                          <Text size='micro' variant='label' component='span'>
                            {`${Math.round((b.amount / totalBaseNum) * 100)}%`}
                          </Text>
                        )}
                      </span>
                    }
                    value={b.amount.toFixed(2)}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <GroupLabel
              flush
              action={
                <HelpMark title='when it pays back'>
                  Computed from the ACTUAL margin of the pieces sold. The break-even at the top of
                  the tab is from the catalogue retail, that is, the plan. The figures disagree
                  legitimately: one is about how the style sells, the other about how it was
                  conceived.
                </HelpMark>
              }
            >
              when it pays back
            </GroupLabel>
            <BigFigure
              value={recoveredAtUnits != null ? String(recoveredAtUnits) : '—'}
              unit={recoveredAtUnits != null ? 'pcs' : undefined}
              sub={breakEvenBasis()}
            />
            {coverPct != null && (
              <div className='mt-2 flex flex-col gap-0.5'>
                <Progress value={coverPct} />
                <Text size='micro' variant='label'>
                  {coverPct <= 100
                    ? `${recoveredAtUnits} of ${plannedUnits} planned pcs`
                    : `${recoveredAtUnits} pcs against a plan of ${plannedUnits} — the planned quantity doesn't pay back R&D`}
                </Text>
              </div>
            )}
            <div className='mt-2 flex flex-col'>
              <Row
                label='at the actual sales margin'
                value={unitMargin > 0 ? unitMargin.toFixed(2) : '—'}
              />
              <Row
                label={plannedUnits > 0 ? `per garment at ${plannedUnits} pcs` : 'per garment'}
                value={perUnit != null ? perUnit.toFixed(2) : '—'}
                tone={plannedUnits > 0 ? undefined : 'label'}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <GroupLabel flush>{scoped ? 'expenses' : 'ledger'}</GroupLabel>
        {expenses.length === 0 ? (
          <Text size='micro' variant='label'>
            no development expenses yet
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th aria-sort={ariaSort('date')}>
                  <SortHeader
                    label='date'
                    active={sort.by === 'date'}
                    dir={sort.dir}
                    onToggle={() => toggleSort('date')}
                  />
                </th>
                <th>description</th>
                <th>kind</th>
                {!scoped && <th>sample</th>}
                <th>amount</th>
                <th aria-sort={ariaSort('amount')}>
                  <SortHeader
                    label='base'
                    active={sort.by === 'amount'}
                    dir={sort.dir}
                    onToggle={() => toggleSort('amount')}
                  />
                </th>
                {canWriteCosting && <th aria-label='actions' />}
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((e) => (
                <tr key={e.id}>
                  <td>{shortDate(e.incurredAt) || <EmptyCell />}</td>
                  <td>{e.description || <EmptyCell />}</td>
                  <td>{kindLabel(e.kind) || <EmptyCell />}</td>
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
                      <Pill tone='warn'>{noFx(e.currency)}</Pill>
                    )}
                  </td>
                  {canWriteCosting && (
                    <td>
                      <button
                        type='button'
                        className='text-labelColor hover:text-error'
                        onClick={() => setPendingDelete(e)}
                        aria-label='delete'
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
      </div>

      {/* One trigger where the six-field strip used to be. Still a <button>, so a RELEASED card's
          `fieldset[disabled]` keeps disabling it — a frozen card must not gain the ability to log
          spend it did not have. Everything above stays readable. */}
      {canWriteCosting && (
        <div>
          <Button type='button' variant='secondary' size='sm' onClick={() => setAddOpen(true)}>
            add an expense
          </Button>
        </div>
      )}

      <ConfirmationModal
        open={addOpen}
        onOpenChange={(open) => (open ? setAddOpen(true) : closeAdd())}
        onConfirm={() => add.mutate()}
        closeOnConfirm={false}
        title='add an expense'
        confirmLabel={add.isPending ? 'adding…' : 'add'}
        confirmDisabled={!form.amount.trim() || add.isPending}
        width='md'
      >
        <div className='flex flex-col gap-2 lg:min-w-[500px]'>
          <div className='grid grid-cols-2 gap-2'>
            <Field label='kind'>
              <Select
                name='dev-expense-kind'
                items={KIND_ITEMS}
                value={form.kind}
                onValueChange={(v: string) => setForm((f) => ({ ...f, kind: v }))}
                placeholder='kind'
                fullWidth
              />
            </Field>
            <Field label='date'>
              <Input
                name='dev-expense-date'
                type='date'
                value={form.incurredAt}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm((f) => ({ ...f, incurredAt: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label='description'>
            <Input
              name='dev-expense-description'
              placeholder='what was bought'
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
          <div className={`grid grid-cols-2 gap-2 ${scoped ? '' : 'sm:grid-cols-3'}`}>
            <Field label='amount'>
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
            <Field label='currency'>
              <Select
                name='dev-expense-currency'
                items={CURRENCY_ITEMS}
                value={form.currency}
                onValueChange={(v: string) => setForm((f) => ({ ...f, currency: v }))}
                placeholder='currency'
                fullWidth
              />
            </Field>
            {/* Attribution to a specific sample is optional, and hidden when the panel is already
                scoped to one. */}
            {!scoped && (
              <Field label='sample'>
                <SamplePicker
                  techCardId={techCardId}
                  value={form.sampleId}
                  onChange={(sampleId) => setForm((f) => ({ ...f, sampleId }))}
                />
              </Field>
            )}
          </div>
          <Text size='micro' variant='label'>
            the expense lands in the style's R&amp;D and does NOT change the garment's unit cost /
            COGS — only the break-even moves. attribution to a sample additionally enters that
            sample's cost.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => pendingDelete?.id && del.mutate(pendingDelete.id)}
        title='delete the expense?'
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro'>
          The “{kindLabel(pendingDelete?.kind) || '—'}” expense
          {pendingDelete?.description ? ` — “${pendingDelete.description}”` : ''}
          {pendingDelete
            ? ` (${decimalToInput(pendingDelete.amount)} ${pendingDelete.currency})`
            : ''}{' '}
          will be deleted permanently. This can't be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
