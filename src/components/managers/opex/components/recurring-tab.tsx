import * as DialogPrimitives from '@radix-ui/react-dialog';
import { CostingFxRate, OpexRecurring } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useEmployees } from 'components/managers/employees/utils/hooks';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
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
  formatMoney,
  latestRateToBase,
  monthLabelShort,
  opexCategoryLabel,
  opexCurrencySymbol,
} from '../utils/options';
import { AmountInput, CategorySelect, CurrencySelect, Field, fieldCls } from './fields';
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

// Recurring templates (screen H2) as scannable cards. A worker materialises each into a monthly line
// from active_from to min(this month, active_to). Adding goes through the guided wizard; editing a
// template affects future materialisations only (past booked months are frozen), so the edit modal
// stays available inline.
export function RecurringTab() {
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

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
  const { data: fxData } = useCostingFxRates(true);
  const fxRates = fxData?.rates ?? [];

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
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <Text size='small'>show archived</Text>
        </label>
        {canWriteCosting && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => setWizardOpen(true)}
          >
            + template
          </Button>
        )}
      </div>

      {/* run-rate summary */}
      {runRate.active > 0 && (
        <div className='flex flex-wrap items-baseline justify-between gap-2 border border-textInactiveColor p-4'>
          <div className='flex flex-col gap-1'>
            <Text size='small' variant='inactive' className='uppercase'>
              recurring / month · {base}
            </Text>
            <Text size='large'>
              {opexCurrencySymbol(base)}
              {formatMoney(runRate.total)}
            </Text>
          </div>
          <Text size='small' variant={runRate.uncosted > 0 ? 'error' : 'inactive'}>
            {runRate.active} active template{runRate.active === 1 ? '' : 's'}
            {runRate.uncosted > 0 ? ` · ${runRate.uncosted} uncosted (excluded) !` : ''}
          </Text>
        </div>
      )}

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load templates
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className='flex flex-col items-start gap-2 border border-dashed border-textInactiveColor p-6'>
          <Text variant='uppercase' size='small'>
            no recurring templates
          </Text>
          <Text variant='inactive' size='small'>
            Recurring templates book a fixed cost (salary, rent, subscription) into every month
            automatically, so you never re-enter it. Add one and it starts materialising from its
            active-from month.
          </Text>
          {canWriteCosting && (
            <Button
              type='button'
              variant='main'
              size='lg'
              className='mt-1 uppercase'
              onClick={() => setWizardOpen(true)}
            >
              + template
            </Button>
          )}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
          {rows.map((r) => (
            <RecurringCard
              key={r.id}
              row={r}
              base={base}
              fxRates={fxRates}
              employeeName={
                r.recurring?.employeeId ? employeeName.get(r.recurring.employeeId) : undefined
              }
              canWrite={canWriteCosting}
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
      >
        <Text size='small'>
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
  employeeName,
  canWrite,
  onEdit,
  onArchive,
}: {
  row: OpexRecurring;
  base: string;
  fxRates: CostingFxRate[];
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
    <div
      className={`flex flex-col gap-2 border border-textInactiveColor p-3 ${
        row.archived ? 'opacity-60' : ''
      }`}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-col'>
          <Text className='truncate'>{ins?.label || '—'}</Text>
          <div className='mt-0.5 flex flex-wrap items-center gap-1'>
            <Chip>{opexCategoryLabel(ins?.category)}</Chip>
            {employeeName && <Chip>{employeeName}</Chip>}
            {row.archived ? (
              <Chip>archived</Chip>
            ) : future ? (
              <Chip>scheduled</Chip>
            ) : activeNow ? (
              <Chip>active</Chip>
            ) : (
              <Chip>ended</Chip>
            )}
          </div>
        </div>
        <div className='shrink-0 text-right'>
          <Text>
            {opexCurrencySymbol(ins?.currency)}
            {formatMoney(amount)} {ins?.currency}
          </Text>
          {!sameCurrency &&
            (rate == null ? (
              <Text variant='error' size='small'>
                uncosted !
              </Text>
            ) : (
              <Text variant='inactive' size='small'>
                ≈ {opexCurrencySymbol(base)}
                {formatMoney(amount * rate)} {base}
              </Text>
            ))}
        </div>
      </div>

      <Text size='small' variant='inactive'>
        {monthLabelShort(toMonth(ins?.activeFrom)) || '—'} →{' '}
        {ins?.activeTo ? monthLabelShort(toMonth(ins.activeTo)) : 'open'}
      </Text>

      {ins?.note && (
        <Text size='small' variant='inactive' className='truncate'>
          {ins.note}
        </Text>
      )}

      {canWrite && !row.archived && (
        <div className='flex items-center gap-3 border-t border-textInactiveColor/40 pt-2'>
          <button
            type='button'
            className='text-textBaseSize uppercase underline hover:text-textColor'
            onClick={onEdit}
          >
            edit
          </button>
          <button
            type='button'
            className='text-textBaseSize uppercase text-textInactiveColor hover:text-error'
            onClick={onArchive}
          >
            archive
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className='border border-textInactiveColor px-1.5 py-0.5 text-small uppercase text-textInactiveColor'>
      {children}
    </span>
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

// Edit an existing recurring template. Editing affects only months the worker has not yet booked;
// already-materialised months stay frozen. Creation of new templates goes through the wizard.
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
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              edit template
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            recurring opex template
          </DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>
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
                  {/* A linked employee since archived is no longer in the list — keep it selectable
                      so editing the template doesn't silently drop the link. */}
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
                <input
                  className={fieldCls}
                  type='month'
                  value={d.activeFrom}
                  onChange={(e) => set({ activeFrom: e.target.value })}
                />
              </Field>
              <Field label='active to (optional)'>
                <input
                  className={fieldCls}
                  type='month'
                  value={d.activeTo}
                  min={d.activeFrom}
                  onChange={(e) => set({ activeTo: e.target.value })}
                />
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
          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={upsert.isPending}
              onClick={submit}
            >
              {upsert.isPending ? 'saving…' : 'save'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
