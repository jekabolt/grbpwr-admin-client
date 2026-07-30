import { Employee, EmployeeInsert, OpexRecurring, OpexRecurringInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useCostingFxRates, useOpexRecurring } from 'components/managers/opex/utils/hooks';
import {
  currentMonth,
  formatMoney,
  latestRateToBase,
  monthLabelShort,
  opexCurrencyOptions,
} from 'components/managers/opex/utils/options';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import SelectComponent from 'ui/components/select';
import { SkeletonLine } from 'ui/components/skeleton';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { SectionHeader } from 'ui/components/section-header';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import {
  useArchiveEmployee,
  useEmployees,
  useUpsertEmployee,
  useUpsertSalaryTemplate,
} from './utils/hooks';

/**
 * empList v2 — the registry is a CARD GRID: each person is a white card (bg-bgColor) on the gray
 * page ground. A card carries name (+ anomaly chips) · lifecycle status · employment window ·
 * cost/month. Clicking a card opens the edit form — the only per-person surface.
 *
 * empFilters v3 — no search/status controls: the grid is SEGMENTED BY ROLE. Each role is a
 * section header with a count; the empty-role bucket reads red as an anomaly.
 *
 * empKpi v1 / empAnomaly v1 — a 3-tile StatGrid (head-count · salary run-rate in base · left) and
 * the OPEX salary cross-reference are ported verbatim: default_monthly_cost is only a template
 * pre-fill hint, the OpexRecurring journal stays the single source of truth for booked cost. The
 * anomaly logic (no salary / still booking / uncosted) now renders as row chips instead of on cards.
 *
 * empSalary v3 — the "create salary template" action lives HERE (was a link out to OPEX): from the
 * edit form we upsert an OpexRecurring (category 'salaries', employee_id set) prefilled from the
 * person's default cost / currency / employment start.
 *
 * empArchive v3 — the primary lifecycle action is "mark as left" (sets employment_end via
 * UpsertEmployee); hard-archive stays available but demoted to a quiet underline.
 */

// Column limits mirror the backend (dto.ConvertPbEmployeeToEntity / g25-09): an over-long value must
// be a clean client-side error, not a backend InvalidArgument surfaced as a failed save.
const MAX_NAME = 191;
const MAX_ROLE = 64;
const MAX_NOTE = 255;

const NO_ROLE = '__none__';

const day = (v?: string) => (v ? v.slice(0, 10) : '');
const toMonth = (v?: string) => (v ? v.slice(0, 7) : '');
const monthFirst = (v?: string) => {
  const m = toMonth(v);
  return m ? `${m}-01` : '';
};

// value + currency CODE, per the design's money rule (never a symbol; right-aligned in the card
// footer).
const money = (n: number, code?: string) => `${formatMoney(n)} ${(code || '').toUpperCase()}`.trim();

// Today as YYYY-MM-DD from local wall-clock parts. YYYY-MM-DD compares lexicographically, so string
// `<` is a real date comparison — no Date parsing needed for the employment-window checks.
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Whole months between two YYYY-MM-DD dates, floored (a partial final month doesn't round up).
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

// What OPEX says about a person's salary, from the (non-archived) recurring templates linked to
// their id. `activeTemplates` book cost this month (the real figure); `linkedButInactive` are linked
// but future-dated or ended; `uncosted` counts active templates whose currency has no FX rate today.
type SalaryInfo = {
  activeTemplates: OpexRecurring[];
  linkedButInactive: OpexRecurring[];
  bookedBase: number;
  uncosted: number;
};

type RoleGroup = { key: string; label: string; isNoRole: boolean; employees: Employee[] };

export function Employees() {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  // empFilters v3 dropped the show-archived toggle: the registry lists current + departed staff.
  const { data, isLoading, isError, refetch } = useEmployees(false);
  const rows = useMemo(() => data?.employees ?? [], [data]);

  // Salary cross-reference: non-archived recurring templates carrying an employee link, plus the
  // costing FX rates used to fold each into base. Both are costing data — only fetch rates when the
  // caller can read costing.
  const { data: recurringData } = useOpexRecurring(false);
  const { data: fxData } = useCostingFxRates(canReadCosting);
  const fxRates = useMemo(() => fxData?.rates ?? [], [fxData]);
  const recurring = useMemo(() => recurringData?.recurring ?? [], [recurringData]);

  const salaryByEmployee = useMemo(() => {
    const linked = new Map<number, OpexRecurring[]>();
    for (const t of recurring) {
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
  }, [recurring, fxRates, base]);

  // Existing role titles, offered as a datalist so the same title is spelled the same way twice.
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const role = r.employee?.role?.trim();
      if (role) set.add(role);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // empKpi v1: head-count (current staff), salary actually booked this month (base), and how many
  // people have left. Uncosted active templates and current staff with no salary booked are surfaced
  // in the subs so the strip stays 3 tiles.
  const summary = useMemo(() => {
    let headcount = 0;
    let left = 0;
    let bookedBase = 0;
    let uncosted = 0;
    let unbooked = 0;
    for (const r of rows) {
      const info = r.id ? salaryByEmployee.get(r.id) : undefined;
      if (hasLeft(r.employee)) {
        left += 1;
        continue;
      }
      headcount += 1;
      if (info && info.activeTemplates.length > 0) {
        bookedBase += info.bookedBase;
        uncosted += info.uncosted;
      } else {
        unbooked += 1;
      }
    }
    return { headcount, left, bookedBase, uncosted, unbooked };
  }, [rows, salaryByEmployee]);

  // empFilters v3: bucket by role, roles A→Z, the empty-role bucket last. Within a role, current
  // staff first then departed, each alphabetical.
  const groups = useMemo<RoleGroup[]>(() => {
    const map = new Map<string, Employee[]>();
    for (const r of rows) {
      const key = r.employee?.role?.trim() || NO_ROLE;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === NO_ROLE) return 1;
      if (b === NO_ROLE) return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({
      key,
      label: key === NO_ROLE ? 'no role' : key,
      isNoRole: key === NO_ROLE,
      employees: map.get(key)!.slice().sort((a, b) => {
        const la = hasLeft(a.employee) ? 1 : 0;
        const lb = hasLeft(b.employee) ? 1 : 0;
        if (la !== lb) return la - lb;
        return (a.employee?.fullName ?? '').localeCompare(b.employee?.fullName ?? '');
      }),
    }));
  }, [rows]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | undefined>();
  const [leaving, setLeaving] = useState<Employee | undefined>();
  const [archiving, setArchiving] = useState<Employee | undefined>();

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (r: Employee) => {
    setEditing(r);
    setFormOpen(true);
  };
  // Lifecycle actions leave the form and open their own small modal — never a nested dialog.
  const onMarkLeft = (r: Employee) => {
    setFormOpen(false);
    setLeaving(r);
  };
  const onArchive = (r: Employee) => {
    setFormOpen(false);
    setArchiving(r);
  };

  // empArchive v3: "mark as left" = UpsertEmployee with employment_end set. Upsert replaces the row,
  // so every existing field is sent back alongside the new end date.
  const upsertLeave = useUpsertEmployee();
  const [leaveDate, setLeaveDate] = useState(todayISO());
  useEffect(() => {
    if (leaving) setLeaveDate(day(leaving.employee?.employmentEnd) || todayISO());
  }, [leaving]);
  const confirmLeave = () => {
    if (!leaving?.id || !leaving.employee) return;
    const start = day(leaving.employee.employmentStart);
    if (start && leaveDate < start) {
      showMessage('Leave date is before the employment start', 'error');
      return;
    }
    upsertLeave.mutate(
      { id: leaving.id, employee: { ...leaving.employee, employmentEnd: leaveDate } },
      {
        onSuccess: () =>
          showMessage(`${leaving.employee?.fullName || 'Employee'} marked as left`, 'success'),
        onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save', 'error'),
        onSettled: () => setLeaving(undefined),
      },
    );
  };

  const archive = useArchiveEmployee();
  const confirmArchive = () => {
    if (!archiving?.id) return;
    archive.mutate(archiving.id, {
      onSuccess: () => showMessage('Employee archived', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive', 'error'),
      onSettled: () => setArchiving(undefined),
    });
  };
  const archivingInfo = archiving?.id ? salaryByEmployee.get(archiving.id) : undefined;

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <SectionHeader
        title='employees'
        question='who is on the team — and is each salary booked as a cost?'
        action={
          canReadCosting &&
          canWriteCosting && (
            <Button type='button' variant='main' size='sm' onClick={openAdd}>
              + employee
            </Button>
          )
        }
      />

      {/* Registry is costing data: without costing:read the backend refuses the list. */}
      {!canReadCosting ? (
        <CalloutBox tone='note'>
          <Text size='micro' variant='label' component='span'>
            The employee registry requires costing access — ask an admin for the costing section.
          </Text>
        </CalloutBox>
      ) : (
        <>
          {rows.length > 0 && (
            <StatGrid min={150}>
              <Stat
                label='current team'
                value={String(summary.headcount)}
                sub={summary.unbooked > 0 ? `${summary.unbooked} without salary` : 'all covered'}
                tone={summary.unbooked > 0 ? 'down' : undefined}
              />
              <Stat
                label={`salary run-rate · ${base}`}
                value={money(summary.bookedBase, base)}
                sub={
                  summary.uncosted > 0
                    ? `${summary.uncosted} template(s) uncosted`
                    : 'booked via OPEX'
                }
                tone={summary.uncosted > 0 ? 'down' : undefined}
              />
              <Stat
                label='left'
                value={String(summary.left)}
                sub={summary.left > 0 ? 'employment ended' : 'nobody has left'}
              />
            </StatGrid>
          )}

          {isLoading && !rows.length ? (
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className='flex flex-col gap-2 border border-borderColor bg-bgColor p-3'>
                  <SkeletonLine width={150} />
                  <SkeletonLine width={90} />
                  <SkeletonLine width={120} />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className='flex items-center gap-3'>
              <Text variant='error' size='micro' tracking='label' component='span'>
                failed to load employees
              </Text>
              <Button variant='underline' size='xs' onClick={() => refetch()}>
                retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <CalloutBox tone='note' className='flex flex-col items-start gap-2 border-dashed'>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='font-bold uppercase'
              >
                no employees yet
              </Text>
              <Text size='micro' variant='label' component='span'>
                The registry lists the people behind your salary costs. Add someone, then create a
                salary template so their monthly cost is booked in OPEX automatically. Default
                monthly cost is only a pre-fill hint — never a booked figure on its own.
              </Text>
              {canWriteCosting && (
                <Button type='button' variant='main' size='sm' className='mt-1' onClick={openAdd}>
                  + employee
                </Button>
              )}
            </CalloutBox>
          ) : (
            <div className='flex flex-col gap-4'>
              {groups.map((g) => (
                <div key={g.key} className='flex flex-col gap-2'>
                  <span className='flex items-baseline gap-1.5'>
                    <Text
                      size='micro'
                      variant={g.isNoRole ? 'error' : 'label'}
                      tracking='group'
                      component='span'
                      className='font-bold uppercase'
                    >
                      {g.label}
                    </Text>
                    <Text size='micro' variant='label' component='span'>
                      · {g.employees.length}
                    </Text>
                  </span>
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                    {g.employees.map((r) => (
                      <EmployeeCard
                        key={r.id}
                        row={r}
                        base={base}
                        salary={r.id ? salaryByEmployee.get(r.id) : undefined}
                        onOpen={() => openEdit(r)}
                      />
                    ))}
                  </div>
                </div>
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
        recurring={recurring}
        onMarkLeft={onMarkLeft}
        onArchive={onArchive}
      />

      <ConfirmationModal
        open={leaving != null}
        onOpenChange={(v) => !v && setLeaving(undefined)}
        onConfirm={confirmLeave}
        title='mark as left?'
        confirmLabel='mark as left'
        confirmDisabled={upsertLeave.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2.5'>
          <Text size='micro' variant='label' component='span'>
            Set the last working day for “{leaving?.employee?.fullName}”. They stay in the registry,
            rendered as left. Any linked salary template keeps booking until you end it in OPEX.
          </Text>
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
              leave date
            </Text>
            <Input
              type='date'
              name='leave-date'
              value={leaveDate}
              min={day(leaving?.employee?.employmentStart) || undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeaveDate(e.target.value)}
            />
          </label>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={archiving != null}
        onOpenChange={(v) => !v && setArchiving(undefined)}
        onConfirm={confirmArchive}
        title='archive employee?'
        confirmLabel='archive'
        confirmDisabled={archive.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label' component='span'>
            Archive “{archiving?.employee?.fullName}”? They drop out of this list and the
            salary-template picker. Prefer “mark as left” if they simply stopped working here.
          </Text>
          {archivingInfo && archivingInfo.activeTemplates.length > 0 && (
            <Text size='micro' variant='error' component='span'>
              Heads up: {archivingInfo.activeTemplates.length} linked salary template(s) stay active
              and KEEP booking their cost every month. End them in OPEX too.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}

// empList v2 card + empAnomaly v1 chips. Clicking anywhere opens the edit form. A white card
// (bg-bgColor) on the gray page ground: name + status header, anomaly chips, note, then an
// employment / cost footer split across a hairline.
function EmployeeCard({
  row,
  base,
  salary,
  onOpen,
}: {
  row: Employee;
  base: string;
  salary?: SalaryInfo;
  onOpen: () => void;
}) {
  const e = row.employee;
  const left = hasLeft(e);
  const booked = (salary?.activeTemplates.length ?? 0) > 0;
  const linkedInactive = (salary?.linkedButInactive.length ?? 0) > 0;
  const defaultCostStr = decimalToInput(e?.defaultMonthlyCost);
  const tenure = tenureLabel(e?.employmentStart, e?.employmentEnd);

  const chips: React.ReactNode[] = [];
  if (left && booked) chips.push(<Chip key='sb' tone='error'>still booking</Chip>);
  if (booked && (salary?.uncosted ?? 0) > 0) chips.push(<Chip key='uc' tone='error'>uncosted</Chip>);
  if (!left && !booked) {
    if (linkedInactive) chips.push(<Chip key='si'>salary inactive</Chip>);
    else chips.push(<Chip key='ns' tone='error'>no salary</Chip>);
  }

  return (
    <div
      role='button'
      tabIndex={0}
      aria-label={`edit ${e?.fullName || 'employee'}`}
      onClick={onOpen}
      onKeyDown={(ev: React.KeyboardEvent<HTMLDivElement>) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'flex flex-col gap-2 border border-borderColor bg-bgColor p-3 text-left',
        'cursor-pointer transition-colors hover:bg-bgZebra',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        left && 'opacity-60',
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <Text component='span' className='font-bold'>
          {e?.fullName || '—'}
        </Text>
        {left ? <Pill tone='mut'>left</Pill> : <Pill tone='ink'>active</Pill>}
      </div>

      {chips.length > 0 && <ChipRow>{chips}</ChipRow>}

      {e?.note && (
        <Text size='micro' variant='label' component='span' className='block truncate'>
          {e.note}
        </Text>
      )}

      <div className='mt-auto flex items-end justify-between gap-3 border-t border-borderColor pt-2'>
        <span className='flex flex-col gap-0.5'>
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            employment
          </Text>
          <Text size='micro' component='span'>
            {!e?.employmentStart && !e?.employmentEnd ? (
              <EmptyCell />
            ) : (
              <>
                {e?.employmentStart ? fmtDate(e.employmentStart) : '—'} →{' '}
                {e?.employmentEnd ? fmtDate(e.employmentEnd) : '—'}
              </>
            )}
          </Text>
          {tenure && (
            <Text size='nano' variant='label' component='span' className='uppercase'>
              {tenure}
            </Text>
          )}
        </span>
        <span className='flex flex-col items-end gap-0.5'>
          {booked ? (
            <>
              <Text component='span' className='font-bold'>
                {money(salary?.bookedBase ?? 0, base)}
              </Text>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                booked / mo
              </Text>
            </>
          ) : defaultCostStr ? (
            <>
              <Text component='span' variant='label'>
                {money(Number(defaultCostStr) || 0, e?.defaultCurrency || base)}
              </Text>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                default (hint)
              </Text>
            </>
          ) : (
            <EmptyCell />
          )}
        </span>
      </div>
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

const currencyItems = opexCurrencyOptions.map((c) => ({ value: c.value, label: c.value }));

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
      {hint && (
        <Text size='micro' variant='label' component='span'>
          {hint}
        </Text>
      )}
    </label>
  );
}

// empForm v1 (single-column, ~7 fields matching EmployeeInsert) + empSalary v3 (create/inspect the
// linked salary template) + empArchive v3 lifecycle actions, all inside the one ConfirmationModal.
function EmployeeFormModal({
  open,
  onOpenChange,
  existing,
  base,
  roleOptions,
  recurring,
  onMarkLeft,
  onArchive,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Employee;
  base: string;
  roleOptions: string[];
  recurring: OpexRecurring[];
  onMarkLeft: (r: Employee) => void;
  onArchive: (r: Employee) => void;
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertEmployee();
  const salaryMut = useUpsertSalaryTemplate();
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

  // Salary templates already linked to THIS person (non-archived), split into booking-this-month and
  // linked-but-idle — the same activeThisMonth test the list uses.
  const linked = useMemo(() => {
    if (!existing?.id) return { all: [] as OpexRecurring[], active: 0 };
    const all = recurring.filter((t) => !t.archived && t.recurring?.employeeId === existing.id);
    return { all, active: all.filter(activeThisMonth).length };
  }, [recurring, existing]);

  const canCreateSalary = !!d.defaultMonthlyCost.trim();
  const createSalary = () => {
    if (!existing?.id) return;
    const recurringInsert: OpexRecurringInsert = {
      label: `${d.fullName.trim() || 'employee'} — salary`,
      category: 'salaries',
      amount: { value: normalizeDecimalInput(d.defaultMonthlyCost) },
      currency: d.defaultCurrency,
      activeFrom: monthFirst(d.employmentStart) || `${currentMonth()}-01`,
      activeTo: '',
      note: '',
      employeeId: existing.id,
    };
    salaryMut.mutate(
      { id: 0, recurring: recurringInsert },
      {
        onSuccess: () => showMessage('Salary template created', 'success'),
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to create template', 'error'),
      },
    );
  };

  const submit = async () => {
    const name = d.fullName.trim();
    if (!name) return showMessage('Enter a name', 'error');
    if (name.length > MAX_NAME) return showMessage(`Name must be at most ${MAX_NAME} characters`, 'error');
    if (d.role.trim().length > MAX_ROLE)
      return showMessage(`Role must be at most ${MAX_ROLE} characters`, 'error');
    if (d.note.trim().length > MAX_NOTE)
      return showMessage(`Note must be at most ${MAX_NOTE} characters`, 'error');
    if (d.defaultMonthlyCost.trim()) {
      const n = parseDecimalNumber(d.defaultMonthlyCost);
      if (!Number.isFinite(n) || n < 0)
        return showMessage('Default monthly cost must be a non-negative number', 'error');
    }
    // YYYY-MM-DD strings compare lexicographically.
    if (d.employmentEnd && d.employmentStart && d.employmentEnd < d.employmentStart)
      return showMessage('End date is before the start date', 'error');
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

  const isEdit = !!existing?.id;
  const alreadyLeft = hasLeft(existing?.employee);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title={isEdit ? 'edit employee' : 'add employee'}
      confirmLabel={isEdit ? 'save' : 'add'}
      confirmDisabled={upsert.isPending}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2.5'>
        <Field label='full name *'>
          <Input
            name='fullName'
            value={d.fullName}
            maxLength={MAX_NAME}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ fullName: e.target.value })}
          />
        </Field>
        <Field label='role'>
          <Input
            name='role'
            value={d.role}
            maxLength={MAX_ROLE}
            list='employee-roles'
            placeholder='e.g. seamstress, pattern maker'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ role: e.target.value })}
          />
          <datalist id='employee-roles'>
            {roleOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <div className='grid grid-cols-2 gap-2'>
          <Field label='employment from'>
            <Input
              type='date'
              name='employmentStart'
              value={d.employmentStart}
              max={d.employmentEnd || undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({ employmentStart: e.target.value })
              }
            />
          </Field>
          <Field label='employment to (optional)'>
            <Input
              type='date'
              name='employmentEnd'
              value={d.employmentEnd}
              min={d.employmentStart || undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({ employmentEnd: e.target.value })
              }
            />
          </Field>
        </div>
        <div className='grid grid-cols-[1fr_7rem] gap-2'>
          <Field label='default monthly cost' hint='pre-fill hint only — never a booked cost'>
            <Input
              type='number'
              name='defaultMonthlyCost'
              step='0.01'
              min='0'
              inputMode='decimal'
              placeholder='0.00'
              value={d.defaultMonthlyCost}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({ defaultMonthlyCost: e.target.value })
              }
            />
          </Field>
          <Field label='currency'>
            <SelectComponent
              name='defaultCurrency'
              placeholder='currency'
              fullWidth
              items={currencyItems}
              value={d.defaultCurrency}
              onValueChange={(v: string) => set({ defaultCurrency: v })}
            />
          </Field>
        </div>
        <Field label='note (optional)'>
          <Input
            name='note'
            value={d.note}
            maxLength={MAX_NOTE}
            placeholder='e.g. night shift, contractor'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ note: e.target.value })}
          />
        </Field>

        {isEdit && (
          <div className='flex flex-col gap-1.5 border-t border-borderColor pt-2.5'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='font-bold uppercase'
            >
              salary template
            </Text>
            {linked.all.length > 0 ? (
              <CalloutBox tone='note' className='flex flex-col gap-1'>
                <Text size='micro' variant='label' component='span'>
                  {linked.active > 0
                    ? 'a salary template is booking this cost every month:'
                    : 'a linked salary template exists but is not booking this month:'}
                </Text>
                {linked.all.map((t) => (
                  <Text key={t.id} size='micro' component='span'>
                    {t.recurring?.label} —{' '}
                    {money(Number(decimalToInput(t.recurring?.amount)) || 0, t.recurring?.currency)}{' '}
                    · {monthLabelShort(toMonth(t.recurring?.activeFrom))} →{' '}
                    {t.recurring?.activeTo ? monthLabelShort(toMonth(t.recurring.activeTo)) : 'open'}
                    {activeThisMonth(t) ? '' : ' (inactive)'}
                  </Text>
                ))}
              </CalloutBox>
            ) : (
              <>
                <Text size='micro' variant='label' component='span'>
                  No salary template links to this person, so their cost is not booked in OPEX.
                  Create one prefilled from the default monthly cost and employment start.
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  disabled={!canCreateSalary || salaryMut.isPending}
                  onClick={createSalary}
                >
                  {salaryMut.isPending ? 'creating…' : 'create salary template'}
                </Button>
                {!canCreateSalary && (
                  <Text size='micro' variant='label' component='span'>
                    Set a default monthly cost above to enable this.
                  </Text>
                )}
              </>
            )}
          </div>
        )}

        {isEdit && existing && (
          <div className='flex items-center gap-3 border-t border-borderColor pt-2.5'>
            {!alreadyLeft && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => onMarkLeft(existing)}
              >
                mark as left
              </Button>
            )}
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='ml-auto text-labelColor'
              onClick={() => onArchive(existing)}
            >
              archive
            </Button>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
