import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Employee, EmployeeInsert, OpexRecurring } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useCostingFxRates, useOpexRecurring } from 'components/managers/opex/utils/hooks';
import {
  currentMonth,
  formatMoney,
  latestRateToBase,
  opexCurrencyOptions,
  opexCurrencySymbol,
} from 'components/managers/opex/utils/options';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import { useArchiveEmployee, useEmployees, useUpsertEmployee } from './utils/hooks';

// Employee registry (gap-07 v2 A): the people a salary OPEX template can point at. Costing-gated
// like OPEX (the backend requires costing:read to list and costing:write to edit). This screen is a
// people directory first — who is on the team, since when, in what role — and a salary-coverage
// dashboard second: it cross-references the OPEX recurring templates to show, per person, whether
// their salary is actually being booked as a cost, or whether the registry is tracking someone we
// are silently not paying through OPEX. default_monthly_cost is only a template pre-fill hint, never
// a booked figure — the OPEX journal stays the single source of truth for cost.

// Column limits mirror the backend (dto.ConvertPbEmployeeToEntity / g25-09): an over-long value must
// be a clean client-side error, not a backend InvalidArgument surfaced as a failed save.
const MAX_NAME = 191;
const MAX_ROLE = 64;
const MAX_NOTE = 255;

const fieldCls =
  'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize text-textColor focus:border-textColor focus:outline-none';

const day = (v?: string) => (v ? v.slice(0, 10) : '');
const toMonth = (v?: string) => (v ? v.slice(0, 7) : '');

// Today as YYYY-MM-DD from local wall-clock parts (new Date() is available in the app runtime; only
// workflow scripts forbid it). YYYY-MM-DD compares lexicographically, so string `<` is a real date
// comparison — no Date parsing needed for the employment-window checks.
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Whole months between two YYYY-MM-DD dates, floored (so a partial final month doesn't round up).
function monthsBetween(startISO: string, endISO: string): number {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  if (!sy || !ey) return 0;
  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) months -= 1;
  return months;
}

// Human tenure ("1y 3mo") from employment start to end-or-today. Empty when no start on file.
function tenureLabel(start?: string, end?: string): string {
  const s = day(start);
  if (!s) return '';
  let months = monthsBetween(s, day(end) || todayISO());
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y > 0 && m > 0) return `${y}y ${m}mo`;
  if (y > 0) return `${y}y`;
  if (m > 0) return `${m}mo`;
  return '<1mo';
}

// Compact date label ("15 Jan 2026"); UTC formatting so a negative-offset timezone can't render the
// previous day.
function fmtDate(iso?: string): string {
  const d = day(iso);
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  if (!y || !m || !dd) return d;
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// An employee whose employment_end is in the past has left, even if not archived.
const hasLeft = (e?: EmployeeInsert) => {
  const end = day(e?.employmentEnd);
  return !!end && end < todayISO();
};

// Is a salary template booking a line in the current month? (active_from ≤ now ≤ active_to|open) —
// mirrors recurring-tab's own activeThisMonth so the "booked / month" figure here matches OPEX.
function activeThisMonth(r: OpexRecurring): boolean {
  const from = toMonth(r.recurring?.activeFrom);
  const to = toMonth(r.recurring?.activeTo);
  const now = currentMonth();
  if (!from || from > now) return false;
  if (to && to < now) return false;
  return true;
}

// What OPEX says about a person's salary, derived by cross-referencing the (non-archived) recurring
// templates linked to their id. `activeTemplates` are the ones booking cost this month (the real
// figure); `linkedButInactive` are linked templates that are future-dated or already ended.
type SalaryInfo = {
  activeTemplates: OpexRecurring[];
  linkedButInactive: OpexRecurring[];
  bookedBase: number; // sum of active templates folded to base currency
  uncosted: number; // active templates whose currency has no FX rate today (excluded from bookedBase)
};

export function Employees() {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyUnbooked, setOnlyUnbooked] = useState(false);

  const { data, isLoading, isError, refetch } = useEmployees(showArchived);
  const rows = useMemo(() => data?.employees ?? [], [data]);

  // Salary cross-reference: non-archived recurring templates that carry an employee link, plus the
  // costing FX rates used to fold each into the base currency. Both are OPEX/costing data, gated the
  // same way — only fetch the rates when the caller can read costing.
  const { data: recurringData } = useOpexRecurring(false);
  const { data: fxData } = useCostingFxRates(canReadCosting);
  const fxRates = useMemo(() => fxData?.rates ?? [], [fxData]);

  const salaryByEmployee = useMemo(() => {
    const linked = new Map<number, OpexRecurring[]>();
    for (const t of recurringData?.recurring ?? []) {
      const eid = t.recurring?.employeeId;
      if (t.archived || !eid) continue;
      const list = linked.get(eid) ?? [];
      list.push(t);
      linked.set(eid, list);
    }
    const map = new Map<number, SalaryInfo>();
    for (const [eid, templates] of linked) {
      const info: SalaryInfo = {
        activeTemplates: [],
        linkedButInactive: [],
        bookedBase: 0,
        uncosted: 0,
      };
      for (const t of templates) {
        if (!activeThisMonth(t)) {
          info.linkedButInactive.push(t);
          continue;
        }
        info.activeTemplates.push(t);
        const amount = Number(decimalToInput(t.recurring?.amount)) || 0;
        const rate = latestRateToBase(fxRates, t.recurring?.currency || '', base);
        if (rate == null) info.uncosted += 1;
        else info.bookedBase += amount * rate;
      }
      map.set(eid, info);
    }
    return map;
  }, [recurringData, fxRates, base]);

  // Existing role titles, offered as a datalist so the same title is spelled the same way twice.
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const role = r.employee?.role?.trim();
      if (role) set.add(role);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Team summary over the visible, still-active people: headcount, salary actually booked this month
  // (base currency), and how many active people have no salary template booking a cost at all.
  const summary = useMemo(() => {
    let headcount = 0;
    let bookedBase = 0;
    let uncosted = 0;
    let unbooked = 0;
    for (const r of rows) {
      if (r.archived) continue;
      headcount += 1;
      const info = r.id ? salaryByEmployee.get(r.id) : undefined;
      if (info && info.activeTemplates.length > 0) {
        bookedBase += info.bookedBase;
        uncosted += info.uncosted;
      } else if (!hasLeft(r.employee)) {
        // Someone who has left is expected to have no active salary; only flag current staff.
        unbooked += 1;
      }
    }
    return { headcount, bookedBase, uncosted, unbooked };
  }, [rows, salaryByEmployee]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.employee?.fullName ?? ''} ${r.employee?.role ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (onlyUnbooked) {
        if (r.archived || hasLeft(r.employee)) return false;
        const info = r.id ? salaryByEmployee.get(r.id) : undefined;
        if (info && info.activeTemplates.length > 0) return false;
      }
      return true;
    });
  }, [rows, query, onlyUnbooked, salaryByEmployee]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | undefined>();
  const [archiving, setArchiving] = useState<Employee | undefined>();

  const archive = useArchiveEmployee();
  const confirmArchive = () => {
    if (!archiving?.id) return;
    archive.mutate(archiving.id, {
      onSuccess: () => showMessage('Employee archived', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive', 'error'),
      onSettled: () => setArchiving(undefined),
    });
  };

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const archivingInfo = archiving?.id ? salaryByEmployee.get(archiving.id) : undefined;

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          employees
        </Text>
        {canWriteCosting && canReadCosting && (
          <Button type='button' variant='main' size='lg' className='uppercase' onClick={openAdd}>
            + employee
          </Button>
        )}
      </div>

      {/* Registry is costing data: without costing:read the backend refuses the list. Say so rather
          than render an empty/failed screen (mirrors the OPEX page). */}
      {!canReadCosting ? (
        <Text variant='inactive' size='small'>
          The employee registry requires costing access — ask an admin for the costing section.
        </Text>
      ) : (
        <>
          {rows.length > 0 && (
            <div className='grid grid-cols-1 gap-px border border-textInactiveColor bg-textInactiveColor sm:grid-cols-3'>
              <StatTile label='current team' value={String(summary.headcount)} />
              <StatTile
                label={`salary booked / month · ${base}`}
                value={`${opexCurrencySymbol(base)}${formatMoney(summary.bookedBase)}`}
                sub={
                  summary.uncosted > 0
                    ? `${summary.uncosted} template(s) uncosted (excluded) !`
                    : 'from active OPEX salary templates'
                }
                alert={summary.uncosted > 0}
              />
              <StatTile
                label='no salary booked'
                value={String(summary.unbooked)}
                sub={
                  summary.unbooked > 0 ? 'active people not booked in OPEX' : 'everyone is covered'
                }
                alert={summary.unbooked > 0}
              />
            </div>
          )}

          {/* controls */}
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <input
              className={`${fieldCls} w-auto min-w-52 grow`}
              placeholder='search name or role'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={onlyUnbooked}
                onChange={(e) => setOnlyUnbooked(e.target.checked)}
              />
              <Text size='small'>only missing salary</Text>
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <Text size='small'>show archived</Text>
            </label>
          </div>

          {isLoading ? (
            <Text variant='inactive' size='small'>
              loading…
            </Text>
          ) : isError ? (
            <div className='flex items-center gap-3'>
              <Text variant='error' size='small'>
                failed to load employees
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
                no employees yet
              </Text>
              <Text variant='inactive' size='small'>
                The registry lists the people behind your salary costs. Add someone here, then link
                an OPEX “salaries” template to them so their monthly cost is booked automatically.
                The default monthly cost you set is only a pre-fill hint for that template — never a
                booked figure on its own.
              </Text>
              {canWriteCosting && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='mt-1 uppercase'
                  onClick={openAdd}
                >
                  + employee
                </Button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <Text variant='inactive' size='small'>
              no employees match the current filters
            </Text>
          ) : (
            <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
              {filtered.map((r) => (
                <EmployeeCard
                  key={r.id}
                  row={r}
                  base={base}
                  salary={r.id ? salaryByEmployee.get(r.id) : undefined}
                  canWrite={canWriteCosting}
                  onEdit={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                  onArchive={() => setArchiving(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <EmployeeFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        base={base}
        roleOptions={roleOptions}
      />

      <ConfirmationModal
        open={archiving != null}
        onOpenChange={(v) => !v && setArchiving(undefined)}
        onConfirm={confirmArchive}
        title='archive employee?'
        confirmLabel='archive'
        confirmDisabled={archive.isPending}
      >
        <div className='flex flex-col gap-2'>
          <Text size='small'>
            Archive “{archiving?.employee?.fullName}”? They stop appearing in the salary-template
            picker and this list (unless you show archived).
          </Text>
          {archivingInfo && archivingInfo.activeTemplates.length > 0 && (
            <Text size='small' variant='error'>
              Heads up: {archivingInfo.activeTemplates.length} linked salary template(s) stay active
              and KEEP booking their cost every month. If this person has left, archive those
              templates in OPEX too.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className='flex flex-col gap-1 bg-bgColor p-3'>
      <Text size='small' variant='inactive' className='uppercase'>
        {label}
      </Text>
      <Text size='large'>{value}</Text>
      {sub && (
        <Text size='small' variant={alert ? 'error' : 'inactive'}>
          {sub}
        </Text>
      )}
    </div>
  );
}

function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  const cls =
    tone === 'warn' ? 'border-error text-error' : 'border-textInactiveColor text-textInactiveColor';
  return <span className={`border px-1.5 py-0.5 text-small uppercase ${cls}`}>{children}</span>;
}

function EmployeeCard({
  row,
  base,
  salary,
  canWrite,
  onEdit,
  onArchive,
}: {
  row: Employee;
  base: string;
  salary?: SalaryInfo;
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const e = row.employee;
  const left = hasLeft(e);
  const booked = (salary?.activeTemplates.length ?? 0) > 0;
  const defaultCost = decimalToInput(e?.defaultMonthlyCost);
  const tenure = tenureLabel(e?.employmentStart, e?.employmentEnd);

  return (
    <div
      className={`flex flex-col gap-2 border border-textInactiveColor p-3 ${
        row.archived ? 'opacity-60' : ''
      }`}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-col'>
          <Text className='truncate'>{e?.fullName || '—'}</Text>
          <div className='mt-0.5 flex flex-wrap items-center gap-1'>
            {e?.role && <Chip>{e.role}</Chip>}
            {row.archived ? (
              <Chip>archived</Chip>
            ) : left ? (
              <Chip tone='warn'>left</Chip>
            ) : (
              <Chip>active</Chip>
            )}
            {/* Anomaly: a departed/archived person whose salary template is still booking cost. */}
            {(left || row.archived) && booked && <Chip tone='warn'>still booking !</Chip>}
            {/* Current staff with no salary template booking a cost — the actionable gap. */}
            {!row.archived && !left && !booked && <Chip tone='warn'>no salary</Chip>}
            {booked && (salary?.uncosted ?? 0) > 0 && <Chip tone='warn'>uncosted !</Chip>}
          </div>
        </div>
        <div className='shrink-0 text-right'>
          {booked ? (
            <>
              <Text>
                {opexCurrencySymbol(base)}
                {formatMoney(salary?.bookedBase ?? 0)}
              </Text>
              <Text size='small' variant='inactive'>
                booked / mo
              </Text>
            </>
          ) : defaultCost ? (
            <>
              <Text variant='inactive'>
                {opexCurrencySymbol(e?.defaultCurrency || base)}
                {formatMoney(Number(defaultCost) || 0)}
              </Text>
              <Text size='small' variant='inactive'>
                default (hint)
              </Text>
            </>
          ) : null}
        </div>
      </div>

      <Text size='small' variant='inactive'>
        {e?.employmentStart ? fmtDate(e.employmentStart) : 'start —'} →{' '}
        {e?.employmentEnd ? fmtDate(e.employmentEnd) : 'present'}
        {tenure ? ` · ${tenure}` : ''}
      </Text>

      {/* Salary detail: what's booked, or a nudge toward booking it. */}
      {booked ? (
        <Text size='small' variant='inactive'>
          booked via{' '}
          {salary?.activeTemplates
            .map(
              (t) =>
                `${t.recurring?.label || 'salary'} (${opexCurrencySymbol(t.recurring?.currency)}${formatMoney(
                  Number(decimalToInput(t.recurring?.amount)) || 0,
                )} ${t.recurring?.currency || ''})`,
            )
            .join(', ')}
        </Text>
      ) : (salary?.linkedButInactive.length ?? 0) > 0 ? (
        <Text size='small' variant='inactive'>
          a linked salary template is not booking this month (future-dated or ended) —{' '}
          <Link to={`${ROUTES.opex}?view=recurring`} className='underline'>
            review in OPEX
          </Link>
        </Text>
      ) : !row.archived && !left ? (
        <Text size='small' variant='inactive'>
          no salary booked —{' '}
          <Link to={`${ROUTES.opex}?view=recurring`} className='underline'>
            add a salaries template
          </Link>{' '}
          linked to this person
        </Text>
      ) : null}

      {e?.note && (
        <Text size='small' variant='inactive' className='truncate'>
          {e.note}
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

type Draft = {
  fullName: string;
  role: string;
  employmentStart: string;
  employmentEnd: string;
  defaultCurrency: string;
  defaultMonthlyCost: string;
  note: string;
};

const makeEmptyDraft = (base: string): Draft => ({
  fullName: '',
  role: '',
  employmentStart: '',
  employmentEnd: '',
  defaultCurrency: base,
  defaultMonthlyCost: '',
  note: '',
});

function EmployeeFormModal({
  open,
  onOpenChange,
  existing,
  base,
  roleOptions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Employee;
  base: string;
  roleOptions: string[];
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertEmployee();
  const [d, setD] = useState<Draft>(makeEmptyDraft(base));

  useEffect(() => {
    if (!open) return;
    const e = existing?.employee;
    setD(
      e
        ? {
            fullName: e.fullName ?? '',
            role: e.role ?? '',
            employmentStart: day(e.employmentStart),
            employmentEnd: day(e.employmentEnd),
            defaultCurrency: e.defaultCurrency || base,
            defaultMonthlyCost: decimalToInput(e.defaultMonthlyCost),
            note: e.note ?? '',
          }
        : makeEmptyDraft(base),
    );
  }, [existing, open, base]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const name = d.fullName.trim();
    if (!name) {
      showMessage('Enter a name', 'error');
      return;
    }
    if (name.length > MAX_NAME) {
      showMessage(`Name must be at most ${MAX_NAME} characters`, 'error');
      return;
    }
    if (d.role.trim().length > MAX_ROLE) {
      showMessage(`Role must be at most ${MAX_ROLE} characters`, 'error');
      return;
    }
    if (d.note.trim().length > MAX_NOTE) {
      showMessage(`Note must be at most ${MAX_NOTE} characters`, 'error');
      return;
    }
    if (d.defaultMonthlyCost.trim()) {
      const n = parseDecimalNumber(d.defaultMonthlyCost);
      if (!Number.isFinite(n) || n < 0) {
        showMessage('Default monthly cost must be a non-negative number', 'error');
        return;
      }
    }
    // YYYY-MM-DD strings compare lexicographically.
    if (d.employmentEnd && d.employmentStart && d.employmentEnd < d.employmentStart) {
      showMessage('End date is before the start date', 'error');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: existing?.id ?? 0,
        employee: {
          fullName: name,
          role: d.role.trim(),
          employmentStart: d.employmentStart,
          employmentEnd: d.employmentEnd,
          defaultCurrency: d.defaultCurrency,
          defaultMonthlyCost: d.defaultMonthlyCost.trim()
            ? { value: normalizeDecimalInput(d.defaultMonthlyCost) }
            : undefined,
          note: d.note.trim(),
        },
      });
      showMessage(existing ? 'Employee saved' : 'Employee added', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save employee', 'error');
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {existing ? 'edit employee' : 'add employee'}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            employee registry entry
          </DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>
            <label className='flex flex-col gap-1'>
              <Text size='small' variant='label'>
                full name *
              </Text>
              <input
                className={fieldCls}
                value={d.fullName}
                maxLength={MAX_NAME}
                autoFocus
                onChange={(e) => set({ fullName: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small' variant='label'>
                role
              </Text>
              <input
                className={fieldCls}
                value={d.role}
                maxLength={MAX_ROLE}
                list='employee-roles'
                onChange={(e) => set({ role: e.target.value })}
                placeholder='e.g. seamstress, pattern maker'
              />
              <datalist id='employee-roles'>
                {roleOptions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <div className='grid grid-cols-2 gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small' variant='label'>
                  employment from
                </Text>
                <input
                  className={fieldCls}
                  type='date'
                  value={d.employmentStart}
                  max={d.employmentEnd || undefined}
                  onChange={(e) => set({ employmentStart: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <div className='flex items-center justify-between gap-2'>
                  <Text size='small' variant='label'>
                    to (optional)
                  </Text>
                  {d.employmentEnd ? (
                    <button
                      type='button'
                      className='text-small uppercase text-textInactiveColor underline hover:text-textColor'
                      onClick={() => set({ employmentEnd: '' })}
                    >
                      clear
                    </button>
                  ) : (
                    <button
                      type='button'
                      className='text-small uppercase text-textInactiveColor underline hover:text-textColor'
                      onClick={() => set({ employmentEnd: todayISO() })}
                    >
                      ended today
                    </button>
                  )}
                </div>
                <input
                  className={fieldCls}
                  type='date'
                  value={d.employmentEnd}
                  min={d.employmentStart || undefined}
                  onChange={(e) => set({ employmentEnd: e.target.value })}
                />
              </label>
            </div>
            <div className='grid grid-cols-[1fr_7rem] gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small' variant='label'>
                  default monthly cost
                </Text>
                <input
                  className={fieldCls}
                  type='number'
                  step='0.01'
                  min='0'
                  inputMode='decimal'
                  placeholder='0.00'
                  value={d.defaultMonthlyCost}
                  onChange={(e) => set({ defaultMonthlyCost: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small' variant='label'>
                  currency
                </Text>
                <select
                  className={fieldCls}
                  value={d.defaultCurrency}
                  onChange={(e) => set({ defaultCurrency: e.target.value })}
                >
                  {opexCurrencyOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Text variant='inactive' size='small'>
              Default monthly cost only pre-fills a salary OPEX template when you link this person
              to one — it is never itself a booked cost.
            </Text>
            <label className='flex flex-col gap-1'>
              <Text size='small' variant='label'>
                note (optional)
              </Text>
              <input
                className={fieldCls}
                value={d.note}
                maxLength={MAX_NOTE}
                onChange={(e) => set({ note: e.target.value })}
                placeholder='e.g. night shift, contractor'
              />
            </label>
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
