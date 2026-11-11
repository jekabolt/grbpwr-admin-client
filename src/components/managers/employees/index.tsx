import { Employee, EmployeeInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useCostingFxRates, useOpexRecurring } from 'components/managers/opex/utils/hooks';
import { notifyFailure } from 'components/shared/notify-failure';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  CascadeList,
  FilterItem,
  FilterRow,
  MetaWord,
  type SelectWord,
  SkeletonBlocks,
  SortCount,
  Text,
} from 'ui';
import { type BoardItem, EmployeeBoard } from './components/employee-board';
import { EmployeeHead, type HeadSearch } from './components/employee-head';
import { EmployeeTile, type TileData, type TileEdit, NO_ROLE } from './components/employee-tile';
import { EmployeeActionBar, EmployeeDim, EmployeeForm } from './panel/employee-form';
import { EmployeeSessionProvider, type Intent, useEmployeeSession } from './panel/employee-session';
import { useEmployees, useUpsertEmployee } from './utils/hooks';
import {
  anomalyOf,
  costOf,
  day,
  type EmployeeStatus,
  type FxRates,
  hasLeft,
  money,
  type SalaryInfo,
  salaryMap,
  statusOf,
  tenureLabel,
  tenureMonths,
} from './utils/model';
import { useNotePins } from './utils/pins';
import './employees.css';

/** The left area: from Lekalo's `--x0` to the panel (the Models screen). */
const LEFT = 'flex min-w-0 flex-1 flex-col pt-6 pr-8 pb-16 pl-[clamp(1.5rem,13vw,11.6875rem)]';
/** While a person is open the left area gives way below 900px (Models does the same). */
const LEFT_OPEN = `${LEFT} max-[56.25rem]:hidden`;
/** The panel: the Models panel's place — sticky on the right above the action bar. */
const PANEL =
  'w-[min(32.9375rem,46vw)] shrink-0 self-start bg-bgColor px-block pb-16 motion-safe:animate-[employees-open-r_1100ms_var(--ease-soft)_90ms_both] min-[56.25rem]:sticky min-[56.25rem]:top-26 min-[56.25rem]:max-h-[calc(100dvh-10rem)] min-[56.25rem]:origin-right min-[56.25rem]:overflow-y-auto max-[56.25rem]:w-full max-[56.25rem]:[--panel-sticky-offset:3.5rem] [overflow-anchor:none]';

const NEW = 'new';
type Active = number | typeof NEW | null;

type StatusFilter = EmployeeStatus | 'all';
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'left', label: 'Left' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];
const ANY = '__any__';
type SortKey = 'name' | 'start' | 'cost' | 'tenure';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'start', label: 'Start Date' },
  { value: 'cost', label: 'Cost' },
  { value: 'tenure', label: 'Tenure' },
];

/** A modal or a popover is open: the page's own keys stand down. */
function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');
}

function tileDataOf(
  e: EmployeeInsert | undefined,
  archived: boolean,
  salary: SalaryInfo | undefined,
  base: string,
  fxRates: FxRates,
  note: boolean,
): TileData {
  return {
    name: e?.fullName?.trim() || 'Unnamed',
    role: e?.role?.trim() ?? '',
    start: day(e?.employmentStart),
    end: day(e?.employmentEnd),
    left: hasLeft(e),
    archived,
    tenure: tenureLabel(e?.employmentStart, e?.employmentEnd),
    cost: costOf(e, salary, base, fxRates),
    anomaly: archived ? null : anomalyOf(e, salary),
    note: note ? e?.note?.trim() || undefined : undefined,
  };
}

/**
 * THE TILE OF THE OPEN PERSON (left area): the board's own tile, built from what the panel holds
 * NOW — name, role, dates, cost, the pinned note change on it as they are typed. Its header words
 * are editors of the FORM, saved with it.
 */
function LiveTile({
  salary,
  fxRates,
  isNew,
}: {
  salary: SalaryInfo | undefined;
  fxRates: FxRates;
  isNew: boolean;
}) {
  const { draft, set, writer, row, base, roleOptions, pinned } = useEmployeeSession();
  const e: EmployeeInsert = {
    fullName: draft.fullName,
    role: draft.role,
    employmentStart: draft.employmentStart,
    employmentEnd: draft.employmentEnd,
    defaultCurrency: draft.defaultCurrency,
    defaultMonthlyCost: draft.defaultMonthlyCost.trim()
      ? { value: draft.defaultMonthlyCost.trim() }
      : undefined,
    note: draft.note,
  };
  const data = tileDataOf(e, !!row?.archived, salary, base, fxRates, pinned);
  if (!draft.fullName.trim()) data.name = isNew ? 'New Employee' : 'Unnamed';
  // A person not stored yet has no salary to miss.
  if (isNew) data.anomaly = null;
  const edit: TileEdit | undefined = writer
    ? {
        roles: roleOptions,
        onRole: (role) => set({ role }),
        onStart: (iso) => set({ employmentStart: iso }),
        onEnd: (iso) => set({ employmentEnd: iso }),
      }
    : undefined;
  return (
    <div className='max-w-[19.1875rem]'>
      <EmployeeTile data={data} edit={edit} />
    </div>
  );
}

/**
 * `/employees` — the board of people; `?employee=N` — that person open in the fill panel on the
 * right; `?employee=new` — a new person. The address is the open person, so deep links, refresh
 * and back keep working (the Models / Tasks model, in a query so no route is added).
 *
 * The one question: who is on the team now, and what does each cost per month? The board answers
 * it; everything else is in the panel.
 *
 * LEAVING A DIRTY PERSON IS HELD, NOT ASKED IN A MODAL. Back arrow, Esc, another person, the
 * search glass: the navigation waits in `pending` and the action bar asks — Save saves and goes
 * on, Cancel discards and goes on. Mark Left / Restore / Archive are asked in the same bar.
 */
export function Employees() {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const writer = canReadCosting && canWriteCosting;
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  // ── the open person lives in the address ──
  const [params, setParams] = useSearchParams();
  const raw = params.get('employee');
  const parsed = raw && raw !== NEW ? parseInt(raw, 10) : NaN;
  const active: Active = raw === NEW ? NEW : Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const activeKey = String(active);

  // ── data: the registry incl. archived (the Status filter), the salary cross-reference ──
  const { data, isLoading, isFetching, isError, refetch } = useEmployees(true, canReadCosting);
  const rows = useMemo(() => data?.employees ?? [], [data]);
  const { data: recurringData } = useOpexRecurring(false, canReadCosting);
  const { data: fxData } = useCostingFxRates(canReadCosting);
  const fxRates = useMemo(() => fxData?.rates ?? [], [fxData]);
  const recurring = useMemo(() => recurringData?.recurring ?? [], [recurringData]);
  const salaryByEmployee = useMemo(
    () => salaryMap(recurring, fxRates, base),
    [recurring, fxRates, base],
  );

  // Existing role titles, so the same title is spelled the same way twice.
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const role = r.employee?.role?.trim();
      if (role) set.add(role);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // empKpi v1 over the registry without the archived: head-count (current staff), salary booked
  // this month (base), how many have left; who has no salary booked, which templates are uncosted.
  const summary = useMemo(() => {
    let headcount = 0;
    let left = 0;
    let bookedBase = 0;
    let uncosted = 0;
    let unbooked = 0;
    for (const r of rows) {
      if (r.archived) continue;
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

  // ── filters, sort, search ──
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('current');
  const [role, setRole] = useState(ANY);
  const [sort, setSort] = useState<SortKey>('name');
  const [reversed, setReversed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search: HeadSearch = { open: searchOpen, query, setOpen: setSearchOpen, setQuery };

  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { current: 0, left: 0, archived: 0, all: rows.length };
    for (const r of rows) c[statusOf(r)] += 1;
    return c;
  }, [rows]);
  const hasNoRole = rows.some((r) => !r.employee?.role?.trim());
  const roleItems = [
    { value: ANY, label: 'Any' },
    ...roleOptions.map((r) => ({ value: r, label: r })),
    ...(hasNoRole ? [{ value: NO_ROLE, label: 'No Role' }] : []),
  ];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (status !== 'all' && statusOf(r) !== status) return false;
      const rRole = r.employee?.role?.trim() ?? '';
      if (role === NO_ROLE ? !!rRole : role !== ANY && rRole !== role) return false;
      if (!q) return true;
      return `${r.employee?.fullName ?? ''} ${rRole}`.toLowerCase().includes(q);
    });
    const name = (r: Employee) => r.employee?.fullName ?? '';
    const costBase = (r: Employee) =>
      costOf(r.employee, r.id ? salaryByEmployee.get(r.id) : undefined, base, fxRates).base ?? -1;
    const by: Record<SortKey, (a: Employee, b: Employee) => number> = {
      name: (a, b) => name(a).localeCompare(name(b)),
      // Earliest first; no start on file goes last.
      start: (a, b) =>
        (day(a.employee?.employmentStart) || '9999').localeCompare(
          day(b.employee?.employmentStart) || '9999',
        ),
      // Highest first.
      cost: (a, b) => costBase(b) - costBase(a),
      // Longest first.
      tenure: (a, b) =>
        (tenureMonths(b.employee?.employmentStart, b.employee?.employmentEnd) ?? -1) -
        (tenureMonths(a.employee?.employmentStart, a.employee?.employmentEnd) ?? -1),
    };
    const sorted = [...list].sort((a, b) => by[sort](a, b) || name(a).localeCompare(name(b)));
    return reversed ? sorted.reverse() : sorted;
  }, [rows, status, role, query, sort, reversed, salaryByEmployee, base, fxRates]);

  // ── the open person, the held leave ──
  const pins = useNotePins();
  const [selected, setSelected] = useState<number | null>(
    typeof active === 'number' ? active : null,
  );
  const [openIntent, setOpenIntent] = useState<Intent | null>(null);
  const dirty = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (typeof active === 'number') setSelected(active);
    setPending(null);
  }, [active]);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const guard = useCallback((go: () => void) => {
    if (dirty.current) setPending(() => go);
    else go();
  }, []);
  const goTo = useCallback(
    (target: Active, intent: Intent | null = null) => {
      dirty.current = false;
      setPending(null);
      setOpenIntent(intent);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (target === null) next.delete('employee');
          else next.set('employee', String(target));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const open = useCallback(
    (target: number | typeof NEW, intent: Intent | null = null) => {
      if (target === active && !intent) return;
      guard(() => goTo(target, intent));
    },
    [active, guard, goTo],
  );
  const back = useCallback(() => guard(() => goTo(null)), [guard, goTo]);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select')))
        return;
      if (overlayOpen()) return;
      back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, back]);

  // ── the board's own writes: a header word of a tile writes the row at once ──
  const upsert = useUpsertEmployee();
  const patchRow = useCallback(
    (r: Employee, change: Partial<EmployeeInsert>) => {
      if (!r.id || !r.employee) return;
      const id = r.id;
      const next = { ...r.employee, ...change };
      const start = day(next.employmentStart);
      const end = day(next.employmentEnd);
      if (start && end && end < start) {
        notify({ sev: 'error', subject: `EMPLOYEE ${id}`, text: 'end before start' });
        return;
      }
      // UpsertEmployee replaces the row: every field goes back with the changed one.
      upsert.mutate(
        { id, employee: next },
        { onError: (e) => notifyFailure(`EMPLOYEE ${id}`, 'not saved', e) },
      );
    },
    [upsert],
  );

  const items: BoardItem[] = shown.map((r) => {
    const id = r.id ?? 0;
    const archived = !!r.archived;
    const left = hasLeft(r.employee);
    const words: SelectWord[] = [
      { key: 'edit', label: 'Edit', onClick: () => open(id) },
      ...(writer && !archived
        ? [
            {
              key: 'left',
              label: left ? 'Restore' : 'Mark Left',
              onClick: () => open(id, left ? 'restore' : 'left'),
            },
            { key: 'archive', label: 'Archive', onClick: () => open(id, 'archive') },
          ]
        : []),
    ];
    return {
      id,
      data: tileDataOf(
        r.employee,
        archived,
        salaryByEmployee.get(id),
        base,
        fxRates,
        pins.has(String(id)),
      ),
      words,
      edit:
        writer && !archived
          ? {
              roles: roleOptions,
              busy: upsert.isPending,
              onRole: (v) => patchRow(r, { role: v }),
              onStart: (iso) => patchRow(r, { employmentStart: iso }),
              onEnd: (iso) => patchRow(r, { employmentEnd: iso }),
            }
          : undefined,
    };
  });

  if (!canReadCosting) {
    return (
      <div className='employees-screen flex min-h-[calc(100dvh-6.5rem)] flex-col pt-6 pl-[clamp(1.5rem,13vw,11.6875rem)]'>
        <h1 className='text-display leading-[1.15] text-ink'>Employees</h1>
        <Text className='mt-2 text-placeholder'>No costing access</Text>
      </div>
    );
  }

  const filter = (
    <div className='flex items-center gap-4'>
      <FilterRow open={filterOpen} onOpenChange={setFilterOpen}>
        <FilterItem
          id='status'
          label='Status'
          value={STATUSES.find((s) => s.value === status)?.label ?? 'Current'}
        >
          <CascadeList
            label='status'
            size='compact'
            open={filterOpen === 'status'}
            options={STATUSES.map((s) => ({
              value: s.value,
              label: `${s.label} (${statusCounts[s.value]})`,
            }))}
            value={status}
            onChange={(v) => {
              setStatus(v as StatusFilter);
              setFilterOpen(null);
            }}
          />
        </FilterItem>
        <FilterItem
          id='role'
          label='Role'
          value={roleItems.find((r) => r.value === role)?.label ?? 'Any'}
        >
          <CascadeList
            label='role'
            size='compact'
            open={filterOpen === 'role'}
            options={roleItems}
            value={role}
            onChange={(v) => {
              setRole(v);
              setFilterOpen(null);
            }}
          />
        </FilterItem>
        <FilterItem
          id='sort'
          label='Sort'
          value={SORTS.find((s) => s.value === sort)?.label ?? 'Name'}
        >
          <CascadeList
            label='sort'
            size='compact'
            open={filterOpen === 'sort'}
            options={SORTS}
            value={sort}
            onChange={(v) => {
              setSort(v as SortKey);
              setReversed(false);
              setFilterOpen(null);
            }}
          />
        </FilterItem>
      </FilterRow>
      <SortCount
        count={shown.length}
        state={reversed ? 'desc' : null}
        label={`${shown.length} employees — reverse the order`}
        title='reverse the order'
        onClick={() => setReversed((r) => !r)}
      />
    </div>
  );
  const room = FilterRow.room(
    filterOpen === 'status'
      ? STATUSES.length
      : filterOpen === 'role'
        ? roleItems.length
        : filterOpen === 'sort'
          ? SORTS.length
          : 0,
  );

  const stats = rows.length > 0 && (
    <div className='mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 md:pl-10'>
      <MetaWord label='Team' value={String(summary.headcount)} />
      <MetaWord label='Run-rate' value={money(summary.bookedBase, base)} />
      <MetaWord label='Left' value={String(summary.left)} />
      {summary.unbooked > 0 && (
        <MetaWord label='No Salary' value={String(summary.unbooked)} tone='alert' />
      )}
      {summary.uncosted > 0 && (
        <MetaWord label='Uncosted' value={String(summary.uncosted)} tone='alert' />
      )}
    </div>
  );

  const board = (
    <div className={LEFT}>
      <EmployeeHead
        title='Employees'
        search={search}
        onAdd={writer ? () => open(NEW) : undefined}
        filter={filter}
      />
      {stats}
      <div
        aria-hidden='true'
        className='transition-[height] duration-700 ease-soft motion-reduce:transition-none'
        style={{ height: room }}
      />
      <div className='mt-[clamp(2.5rem,9vh,6.125rem)]'>
        {isLoading && !rows.length ? (
          <Text className='animate-pulse py-20 text-placeholder'>loading…</Text>
        ) : isError ? (
          <div className='flex items-center gap-3 py-20'>
            <Text className='text-error'>Failed to load</Text>
            <Button variant='underline' size='xs' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <Text className='py-20 text-placeholder'>
            {rows.length === 0 ? 'No employees' : 'Nobody here'}
          </Text>
        ) : (
          <EmployeeBoard
            items={items}
            selected={selected}
            onSelect={setSelected}
            onOpen={(id) => open(id)}
          />
        )}
      </div>
    </div>
  );

  const openTitle = active === NEW ? 'New Employee' : 'Employee Info';
  // From an open person the glass goes back to the board and opens the search there.
  const searchFromCard = () =>
    guard(() => {
      setSearchOpen(true);
      goTo(null);
    });
  const head = (
    <EmployeeHead title={openTitle} search={search} onSearch={searchFromCard} onBack={back} />
  );

  const activeRow = typeof active === 'number' ? rows.find((r) => r.id === active) : undefined;
  const fallback = (node: ReactNode) => (
    <>
      <div className={LEFT_OPEN}>{head}</div>
      <aside aria-label='employee info' className={PANEL}>
        {node}
      </aside>
    </>
  );

  const session =
    active === null ? null : typeof active === 'number' && !activeRow ? (
      fallback(
        isLoading || isFetching ? (
          <SkeletonBlocks count={4} className='py-4' />
        ) : (
          <Text className='py-4 text-placeholder'>Employee not found</Text>
        ),
      )
    ) : (
      <EmployeeSessionProvider
        key={activeKey}
        row={activeRow}
        base={base}
        writer={writer}
        roleOptions={roleOptions}
        recurring={recurring}
        initialIntent={openIntent}
        pinned={pins.has(activeRow?.id ? String(activeRow.id) : NEW)}
        onTogglePin={() => pins.toggle(activeRow?.id ? String(activeRow.id) : NEW)}
        onSaved={(id, created) => {
          if (!created) return;
          // The new person keeps the pin set while they were being created.
          pins.move(NEW, String(id));
          setSelected(id || null);
          // A held leave goes on after the save; otherwise the new person becomes the open one.
          if (!pending) goTo(id || null);
        }}
        onArchived={() => {
          setSelected(null);
          goTo(null);
        }}
        onDirtyChange={onDirtyChange}
      >
        <EmployeeDim leaving={!!pending} className={LEFT_OPEN}>
          {head}
          <div className='mt-[clamp(1.5rem,8vh,5.5rem)] md:pl-10'>
            <LiveTile
              salary={activeRow?.id ? salaryByEmployee.get(activeRow.id) : undefined}
              fxRates={fxRates}
              isNew={active === NEW}
            />
          </div>
        </EmployeeDim>
        <aside aria-label='employee info' className={PANEL}>
          <EmployeeDim leaving={!!pending}>
            <EmployeeForm />
          </EmployeeDim>
        </aside>
        <EmployeeActionBar
          leaving={!!pending}
          onContinue={() => {
            const go = pending;
            dirty.current = false;
            setPending(null);
            go?.();
          }}
          onClose={() => goTo(null)}
        />
      </EmployeeSessionProvider>
    );

  return (
    <div className='employees-screen flex min-h-[calc(100dvh-6.5rem)] items-stretch'>
      {active === null ? board : session}
    </div>
  );
}
