import { CostingFxRate, OpexRecurring } from 'api/proto-http/admin';
import { useEmployees } from 'components/managers/employees/utils/hooks';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import {
  monthToApi,
  useArchiveOpexRecurring,
  useCostingFxRates,
  useOpexRecurring,
  useUpsertOpexRecurring,
} from '../utils/hooks';
import {
  currentMonth,
  latestRateToBase,
  money,
  monthLabelShort,
  opexCategoryLabel,
} from '../utils/options';
import { AmountInput, CategorySelect, CurrencySelect, Field, fieldCls, MonthInput } from './fields';
import { OpexWizard } from './opex-wizard';

const toMonth = (v?: string) => (v ? v.slice(0, 7) : '');

// Is a template booking a line in the current month? (active_from ≤ now ≤ active_to|open) — used for
// the monthly run-rate figure, which should reflect only what is being booked right now.
const activeThisMonth = (r: OpexRecurring) => {
  const from = toMonth(r.recurring?.activeFrom);
  const to = toMonth(r.recurring?.activeTo);
  const now = currentMonth();
  if (!from || from > now) return false;
  if (to && to < now) return false;
  return true;
};

// opxRec v1 (keep) — recurring templates (screen H2) as a two-column card grid, restyled onto
// tokens + Pills. A worker materialises each into a monthly line from active_from to min(this month,
// active_to). Editing a template affects future materialisations only (past booked months frozen),
// so the edit modal stays available inline. Figures mask (opxGate v2) when `canRead` is false.
export function RecurringTab({
  base,
  canWrite,
  canRead,
}: {
  base: string;
  canWrite: boolean;
  canRead: boolean;
}) {
  const { showMessage } = useSnackBarStore();

  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, isError, refetch } = useOpexRecurring(showArchived);
  const archive = useArchiveOpexRecurring();
  const rows = useMemo(() => data?.recurring ?? [], [data]);

  // Resolve employee names for linked salary templates, and FX for the base-currency run-rate.
  const { data: employeeData } = useEmployees(false);
  const employeeName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employeeData?.employees ?? [])
      if (e.id) m.set(e.id, e.employee?.fullName || `employee #${e.id}`);
    return m;
  }, [employeeData]);
  const { data: fxData } = useCostingFxRates(canRead);
  const fxRates = useMemo(() => fxData?.rates ?? [], [fxData]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<OpexRecurring | undefined>();
  const [archiving, setArchiving] = useState<OpexRecurring | undefined>();

  // Monthly run-rate: fold every template active this month to base. Templates whose currency has no
  // FX rate can't be folded — counted separately so the figure is honest, not silently short.
  const runRate = useMemo(() => {
    let total = 0;
    let uncosted = 0;
    let active = 0;
    for (const r of rows) {
      if (r.archived || !activeThisMonth(r)) continue;
      active += 1;
      const amount = Number(decimalToInput(r.recurring?.amount)) || 0;
      const rate = latestRateToBase(fxRates, r.recurring?.currency || '', base);
      if (rate == null) uncosted += 1;
      else total += amount * rate;
    }
    return { total, uncosted, active };
  }, [rows, fxRates, base]);

  const confirmArchive = () => {
    if (!archiving?.id) return;
    archive.mutate(archiving.id, {
      onSuccess: () => showMessage('Template archived', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive', 'error'),
      onSettled: () => setArchiving(undefined),
    });
  };

  return (
    <div className='flex flex-col gap-3'>
      <Toolbar>
        <label className='flex cursor-pointer items-center gap-1.5'>
          <CheckboxCommon
            name='show-archived'
            checked={showArchived}
            onChange={(v: boolean) => setShowArchived(v)}
          />
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            show archived
          </Text>
        </label>
        <ToolbarSpacer />
        {canWrite && (
          <Button type='button' variant='main' size='sm' onClick={() => setWizardOpen(true)}>
            + template
          </Button>
        )}
      </Toolbar>

      {runRate.active > 0 && (
        <StatGrid min={150}>
          <Stat
            label={`recurring / month · ${base}`}
            value={money(runRate.total, base, canRead)}
            sub={
              runRate.uncosted > 0 ? `${runRate.uncosted} uncosted (excluded)` : 'booked every month'
            }
            tone={runRate.uncosted > 0 ? 'down' : undefined}
          />
          <Stat
            label='active templates'
            value={String(runRate.active)}
            sub={`${rows.length} on file`}
          />
        </StatGrid>
      )}

      {isLoading && rows.length === 0 ? (
        <Text variant='label' size='micro' component='span'>
          loading…
        </Text>
      ) : isError ? (
        <CalloutBox tone='error' className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span'>
            <b>failed to load templates</b>
          </Text>
          <Button variant='underline' size='xs' className='ml-auto' onClick={() => refetch()}>
            retry
          </Button>
        </CalloutBox>
      ) : rows.length === 0 ? (
        <CalloutBox tone='note' className='flex flex-col items-start gap-2 border-dashed'>
          <Text size='micro' variant='label' tracking='label' component='span' className='font-bold uppercase'>
            no recurring templates
          </Text>
          <Text size='micro' variant='label' component='span'>
            Recurring templates book a fixed cost (salary, rent, subscription) into every month
            automatically, so you never re-enter it. Add one and it starts materialising from its
            active-from month.
          </Text>
          {canWrite && (
            <Button type='button' variant='main' size='sm' className='mt-1' onClick={() => setWizardOpen(true)}>
              + template
            </Button>
          )}
        </CalloutBox>
      ) : (
        <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-2'>
          {rows.map((r) => (
            <RecurringCard
              key={r.id}
              row={r}
              base={base}
              fxRates={fxRates}
              canRead={canRead}
              employeeName={
                r.recurring?.employeeId ? employeeName.get(r.recurring.employeeId) : undefined
              }
              canWrite={canWrite}
              onEdit={() => setEditing(r)}
              onArchive={() => setArchiving(r)}
            />
          ))}
        </div>
      )}

      <OpexWizard open={wizardOpen} onOpenChange={setWizardOpen} defaultKind='recurring' />

      <RecurringFormModal
        open={editing != null}
        onOpenChange={(v) => !v && setEditing(undefined)}
        existing={editing}
      />

      <ConfirmationModal
        open={archiving != null}
        onOpenChange={(v) => !v && setArchiving(undefined)}
        onConfirm={confirmArchive}
        title='archive template?'
        confirmLabel='archive'
        confirmDisabled={archive.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text size='micro' variant='label' component='span'>
          Archive “{archiving?.recurring?.label}”? It stops materialising into future months. Months
          it already booked stay in place.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

function RecurringCard({
  row,
  base,
  fxRates,
  canRead,
  employeeName,
  canWrite,
  onEdit,
  onArchive,
}: {
  row: OpexRecurring;
  base: string;
  fxRates: CostingFxRate[];
  canRead: boolean;
  employeeName?: string;
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const ins = row.recurring;
  const amount = Number(decimalToInput(ins?.amount)) || 0;
  const sameCurrency = (ins?.currency || '').toUpperCase() === base;
  const rate = latestRateToBase(fxRates, ins?.currency || '', base);
  const activeNow = !row.archived && activeThisMonth(row);
  const future = !row.archived && toMonth(ins?.activeFrom) > currentMonth();

  return (
    <div className={cn('flex flex-col gap-2 border border-borderColor bg-bgColor p-2.5', row.archived && 'opacity-60')}>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-col gap-1'>
          <Text component='span' className='truncate font-medium'>
            {ins?.label || '—'}
          </Text>
          <div className='flex flex-wrap items-center gap-1'>
            <Pill tone='mut'>{opexCategoryLabel(ins?.category)}</Pill>
            {employeeName && <Pill tone='mut'>{employeeName}</Pill>}
            {row.archived ? (
              <Pill tone='mut'>archived</Pill>
            ) : future ? (
              <Pill tone='attention'>scheduled</Pill>
            ) : activeNow ? (
              <Pill tone='ok'>active</Pill>
            ) : (
              <Pill tone='mut'>ended</Pill>
            )}
          </div>
        </div>
        <div className='flex shrink-0 flex-col items-end gap-0.5'>
          <Text component='span' className='tabular-nums'>
            {money(amount, ins?.currency, canRead)}
          </Text>
          {!sameCurrency &&
            (rate == null ? (
              <Pill tone='warn'>uncosted</Pill>
            ) : (
              <Text size='micro' variant='label' component='span' className='tabular-nums'>
                ≈ {money(amount * rate, base, canRead)}
              </Text>
            ))}
        </div>
      </div>

      <Text size='micro' variant='label' component='span'>
        {monthLabelShort(toMonth(ins?.activeFrom)) || '—'} →{' '}
        {ins?.activeTo ? monthLabelShort(toMonth(ins.activeTo)) : 'open'}
      </Text>

      {ins?.note && (
        <Text size='micro' variant='label' component='span' className='truncate'>
          {ins.note}
        </Text>
      )}

      {canWrite && !row.archived && (
        <div className='flex items-center gap-3 border-t border-hairline pt-2'>
          <Button variant='underline' size='xs' onClick={onEdit}>
            edit
          </Button>
          <Button variant='underline' size='xs' className='text-labelColor' onClick={onArchive}>
            archive
          </Button>
        </div>
      )}
    </div>
  );
}

type Draft = {
  label: string;
  category: string;
  amount: string;
  currency: string;
  activeFrom: string;
  activeTo: string;
  note: string;
  employeeId: number;
};

// opxRecEdit v1 (keep) — edit an existing recurring template, now on the shared ConfirmationModal
// shell. Editing affects only months the worker has not yet booked; already-materialised months
// stay frozen. Creation of new templates goes through the wizard.
function RecurringFormModal({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: OpexRecurring;
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertOpexRecurring();
  const { data: employeeData } = useEmployees(false, open);
  const employees = employeeData?.employees ?? [];

  const emptyDraft: Draft = {
    label: '',
    category: 'salaries',
    amount: '',
    currency: 'EUR',
    activeFrom: '',
    activeTo: '',
    note: '',
    employeeId: 0,
  };
  const [d, setD] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    const ins = existing?.recurring;
    setD(
      ins
        ? {
            label: ins.label ?? '',
            category: ins.category ?? 'other',
            amount: decimalToInput(ins.amount),
            currency: ins.currency ?? 'EUR',
            activeFrom: toMonth(ins.activeFrom),
            activeTo: toMonth(ins.activeTo),
            note: ins.note ?? '',
            employeeId: ins.employeeId ?? 0,
          }
        : emptyDraft,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, open]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!d.label.trim() || !d.amount.trim() || !d.activeFrom) {
      showMessage('Enter a label, amount and active-from month', 'error');
      return;
    }
    const amountNum = parseDecimalNumber(d.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      showMessage('Amount must be a non-negative number', 'error');
      return;
    }
    // YYYY-MM strings compare lexicographically, so this is a real month comparison.
    if (d.activeTo && d.activeTo < d.activeFrom) {
      showMessage('Active-to month is before active-from', 'error');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: existing?.id ?? 0,
        recurring: {
          label: d.label.trim(),
          category: d.category.trim() || 'other',
          amount: { value: normalizeDecimalInput(d.amount) },
          currency: d.currency,
          activeFrom: monthToApi(d.activeFrom),
          activeTo: d.activeTo ? monthToApi(d.activeTo) : '',
          note: d.note.trim(),
          employeeId: d.employeeId || 0,
        },
      });
      showMessage('Template saved', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save template', 'error');
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title='edit template'
      confirmLabel='save'
      confirmDisabled={upsert.isPending}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2.5'>
        <Field label='label'>
          <input
            className={fieldCls}
            value={d.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder='e.g. Adobe CC'
          />
        </Field>
        <Field label='category'>
          <CategorySelect value={d.category} onChange={(v) => set({ category: v })} />
        </Field>
        {employees.length > 0 || d.employeeId > 0 ? (
          <Field label='employee (optional — salary link)'>
            <select
              className={fieldCls}
              value={d.employeeId || 0}
              onChange={(e) => set({ employeeId: Number(e.target.value) || 0 })}
            >
              <option value={0}>— none —</option>
              {/* A linked employee since archived is no longer in the list — keep it selectable so
                  editing the template doesn't silently drop the link. */}
              {d.employeeId > 0 && !employees.some((e) => e.id === d.employeeId) ? (
                <option value={d.employeeId}>employee #{d.employeeId}</option>
              ) : null}
              {employees.map((e) => (
                <option key={e.id} value={e.id ?? 0}>
                  {e.employee?.fullName || `employee #${e.id}`}
                  {e.employee?.role ? ` · ${e.employee.role}` : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className='grid grid-cols-[1fr_7rem] gap-2'>
          <Field label='amount'>
            <AmountInput value={d.amount} onChange={(v) => set({ amount: v })} />
          </Field>
          <Field label='currency'>
            <CurrencySelect value={d.currency} onChange={(v) => set({ currency: v })} />
          </Field>
        </div>
        <div className='grid grid-cols-2 gap-2'>
          <Field label='active from'>
            <MonthInput value={d.activeFrom} onChange={(v) => set({ activeFrom: v })} />
          </Field>
          <Field label='active to (optional)'>
            <MonthInput value={d.activeTo} min={d.activeFrom} onChange={(v) => set({ activeTo: v })} />
          </Field>
        </div>
        <Field label='note (optional)'>
          <input
            className={fieldCls}
            value={d.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>
      </div>
    </ConfirmationModal>
  );
}
