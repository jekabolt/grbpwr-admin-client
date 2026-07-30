import { OpexLine, OpexLineInsert } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { SkeletonLine } from 'ui/components/skeleton';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput } from 'utils/decimal';
import { monthToApi, useDeleteOpexLine, useUpsertOpexLines } from '../utils/hooks';
import {
  currentMonth,
  isRecurringLine,
  isUncostedLine,
  money,
  monthLabel,
  opexCategoryLabel,
  shiftMonth,
  sumBase,
  summarizeLines,
} from '../utils/options';
import { LineFormModal } from './line-form';
import { OpexWizard } from './opex-wizard';
import { MonthSummary } from './summary';

// opxLines v1 (keep) — the month's lines grouped into per-category cards, restyled onto tokens.
// opxUncosted v2 — incomplete lines surface as a warning CalloutBox with a one-click fix, not as
//   red text buried on a row.
// opxCopy v2 — "copy from previous month" opens a modal of last month's lines, each with a checkbox.
// opxGate v2 — `canRead` masks every figure; the structure (months, categories, labels) stays.
//
// The month list and the selected month's lines all arrive from the page (one ListOpexLines range
// query — there is no per-month aggregate RPC), so this component is pure month-scoped content with
// no fetching of its own beyond the mutations it fires. Month navigation lives in the left rail and
// the ‹ › toolbar buttons.
export function MonthlyContent({
  month,
  onSelectMonth,
  linesByMonth,
  base,
  canWrite,
  canRead,
  isLoading,
  isError,
  refetch,
}: {
  month: string;
  onSelectMonth: (m: string) => void;
  linesByMonth: Map<string, OpexLine[]>;
  base: string;
  canWrite: boolean;
  canRead: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const { showMessage } = useSnackBarStore();

  const lines = useMemo(() => linesByMonth.get(month) ?? [], [linesByMonth, month]);
  const prevMonth = shiftMonth(month, -1);
  const prevManual = useMemo(
    () => (linesByMonth.get(prevMonth) ?? []).filter((l) => !isRecurringLine(l)),
    [linesByMonth, prevMonth],
  );

  const upsert = useUpsertOpexLines();
  const del = useDeleteOpexLine();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<OpexLine | undefined>();
  const [deleting, setDeleting] = useState<OpexLine | undefined>();
  const [copyOpen, setCopyOpen] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, OpexLine[]>();
    for (const l of lines) {
      const key = l.category || 'other';
      (m.get(key) ?? m.set(key, []).get(key)!).push(l);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lines]);

  const summary = useMemo(() => summarizeLines(lines), [lines]);

  // opxUncosted v2: the first line the backend could not fold to base — the "one-click fix" target.
  const firstUncosted = useMemo(() => lines.find(isUncostedLine), [lines]);

  const confirmDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => showMessage('Line deleted', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to delete', 'error'),
      onSettled: () => setDeleting(undefined),
    });
  };

  const isToday = month === currentMonth();

  return (
    <div className='flex flex-col gap-3'>
      {/* month nav + actions */}
      <Toolbar>
        <div className='flex items-center gap-1.5'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            aria-label='previous month'
            onClick={() => onSelectMonth(shiftMonth(month, -1))}
          >
            ‹
          </Button>
          <Text component='span' variant='uppercase' className='min-w-[7.5rem] text-center font-bold'>
            {monthLabel(month)}
          </Text>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            aria-label='next month'
            onClick={() => onSelectMonth(shiftMonth(month, 1))}
          >
            ›
          </Button>
          {!isToday && (
            <Button variant='underline' size='xs' onClick={() => onSelectMonth(currentMonth())}>
              today
            </Button>
          )}
        </div>
        <ToolbarSpacer />
        {canWrite && (
          <>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={prevManual.length === 0 || upsert.isPending}
              title={
                prevManual.length === 0
                  ? `no manual lines in ${prevMonth} to copy`
                  : `copy from ${prevMonth}`
              }
              onClick={() => setCopyOpen(true)}
            >
              copy previous
            </Button>
            <Button type='button' variant='main' size='sm' onClick={() => setWizardOpen(true)}>
              + add opex
            </Button>
          </>
        )}
      </Toolbar>

      {isLoading && lines.length === 0 ? (
        <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-2.5'>
          <SkeletonLine width={220} />
          <SkeletonLine width={160} />
          <SkeletonLine width={190} />
        </div>
      ) : isError ? (
        <CalloutBox tone='error' className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span'>
            <b>failed to load OPEX lines</b>
          </Text>
          <Button variant='underline' size='xs' onClick={refetch} className='ml-auto'>
            retry
          </Button>
        </CalloutBox>
      ) : (
        <>
          {/* opxUncosted v2: banner + one-click fix */}
          {canRead && summary.uncosted > 0 && firstUncosted && (
            <CalloutBox tone='warning' className='flex flex-wrap items-center gap-2'>
              <Text size='micro' component='span'>
                {summary.uncosted} line{summary.uncosted === 1 ? '' : 's'} could not be folded to{' '}
                {base} — no costing FX rate for the line's currency, so it is excluded from the
                operating result.
              </Text>
              {canWrite && (
                <Button
                  variant='underline'
                  size='xs'
                  className='ml-auto'
                  onClick={() => setEditing(firstUncosted)}
                >
                  fix “{firstUncosted.label || '—'}”
                </Button>
              )}
            </CalloutBox>
          )}

          {summary.count > 0 && <MonthSummary summary={summary} base={base} reveal={canRead} />}

          {groups.length === 0 ? (
            <CalloutBox tone='note' className='flex flex-col items-start gap-2 border-dashed'>
              <Text size='micro' variant='label' tracking='label' component='span' className='font-bold uppercase'>
                no opex booked for {monthLabel(month)}
              </Text>
              <Text size='micro' variant='label' component='span'>
                Add a one-off cost for this month, or set up a recurring template that books itself
                every month. Recurring (⟳) lines also appear here once the worker materialises them.
              </Text>
              {canWrite && (
                <Button type='button' variant='main' size='sm' className='mt-1' onClick={() => setWizardOpen(true)}>
                  + add opex
                </Button>
              )}
            </CalloutBox>
          ) : (
            <div className='flex flex-col gap-2.5'>
              {groups.map(([category, catLines]) => (
                <CategoryCard
                  key={category}
                  category={category}
                  lines={catLines}
                  base={base}
                  canWrite={canWrite}
                  canRead={canRead}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </>
      )}

      <OpexWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        defaultKind='oneoff'
        defaultMonth={month}
      />

      <LineFormModal
        open={editing != null}
        onOpenChange={(v) => !v && setEditing(undefined)}
        month={month}
        existing={editing}
        lines={lines}
      />

      <CopyPreviousModal
        open={copyOpen}
        onOpenChange={setCopyOpen}
        month={month}
        prevMonth={prevMonth}
        prevManual={prevManual}
        existing={lines}
        canRead={canRead}
      />

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(v) => !v && setDeleting(undefined)}
        onConfirm={confirmDelete}
        title='delete OPEX line?'
        confirmLabel='delete'
        confirmDisabled={del.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text size='micro' variant='label' component='span'>
          Delete “{deleting?.label}”? This cannot be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}


// opxLines v1 — one category as a bordered card: a zebra header (name · count · folded total) over
// hairline-separated line rows.
function CategoryCard({
  category,
  lines,
  base,
  canWrite,
  canRead,
  onEdit,
  onDelete,
}: {
  category: string;
  lines: OpexLine[];
  base: string;
  canWrite: boolean;
  canRead: boolean;
  onEdit: (l: OpexLine) => void;
  onDelete: (l: OpexLine) => void;
}) {
  const { total, uncosted } = sumBase(lines);
  return (
    <div className='border border-borderColor bg-bgColor'>
      <div className='flex items-center justify-between gap-2 border-b border-borderColor bg-bgZebra px-2.5 py-1.5'>
        <span className='flex items-baseline gap-1.5'>
          <Text size='micro' variant='label' tracking='group' component='span' className='font-bold uppercase'>
            {opexCategoryLabel(category)}
          </Text>
          <Text size='micro' variant='label' component='span'>
            · {lines.length}
            {uncosted > 0 ? ` · ${uncosted} uncosted` : ''}
          </Text>
        </span>
        <Text
          size='micro'
          component='span'
          className={cn('tabular-nums', uncosted > 0 ? 'text-error' : undefined)}
        >
          {money(total, base, canRead)}
        </Text>
      </div>
      <div className='flex flex-col'>
        {lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            base={base}
            canWrite={canWrite}
            canRead={canRead}
            onEdit={() => onEdit(l)}
            onDelete={() => onDelete(l)}
          />
        ))}
      </div>
    </div>
  );
}

// One expense line. Recurring (⟳, worker-owned) lines are read-only — the backend refuses to delete
// them, so no destructive affordance is offered.
function LineRow({
  line,
  base,
  canWrite,
  canRead,
  onEdit,
  onDelete,
}: {
  line: OpexLine;
  base: string;
  canWrite: boolean;
  canRead: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const recurring = isRecurringLine(line);
  const uncosted = isUncostedLine(line);
  const sameCurrency = (line.currency || '').toUpperCase() === base;
  const amount = Number(decimalToInput(line.amount)) || 0;
  const amountBase = Number(decimalToInput(line.amountBase)) || 0;
  const hasVat = !!line.vatAmount?.value;

  return (
    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-2.5 py-1.5 last:border-b-0'>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <div className='flex items-center gap-1.5'>
          {recurring && (
            <Pill tone='mut' title='booked from a recurring template — read-only'>
              ⟳
            </Pill>
          )}
          <Text component='span' className='truncate font-medium'>
            {line.label || '—'}
          </Text>
          {hasVat && (
            <Pill tone='ink' title='carries recoverable VAT / document data'>
              vat
            </Pill>
          )}
        </div>
        {line.note && (
          <Text size='micro' variant='label' component='span' className='block max-w-[40ch] truncate'>
            {line.note}
          </Text>
        )}
      </div>
      <div className='flex items-center gap-3'>
        <div className='flex flex-col items-end gap-0.5'>
          <Text component='span' className='tabular-nums'>
            {money(amount, line.currency, canRead)}
          </Text>
          {uncosted ? (
            <Pill tone='warn'>uncosted</Pill>
          ) : (
            !sameCurrency && (
              <Text size='micro' variant='label' component='span' className='tabular-nums'>
                {money(amountBase, base, canRead)}
              </Text>
            )
          )}
        </div>
        {canWrite && !recurring && (
          <div className='flex shrink-0 items-center gap-2'>
            <Button variant='underline' size='xs' onClick={onEdit}>
              edit
            </Button>
            <button
              type='button'
              className='text-labelColor hover:text-error'
              aria-label='delete line'
              onClick={onDelete}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// opxCopy v2 — the previous month's manual lines, each with a checkbox. A line whose (category,
// label) already exists this month can't be copied without silently clobbering it, so it is shown
// disabled and marked "present". Confirming re-upserts only the checked, non-colliding lines.
function CopyPreviousModal({
  open,
  onOpenChange,
  month,
  prevMonth,
  prevManual,
  existing,
  canRead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  prevMonth: string;
  prevManual: OpexLine[];
  existing: OpexLine[];
  canRead: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertOpexLines();

  const existingKeys = useMemo(
    () => new Set(existing.map((l) => `${l.category || 'other'} ${l.label || ''}`)),
    [existing],
  );
  const keyOf = (l: OpexLine) => `${l.category || 'other'} ${l.label || ''}`;
  const collides = (l: OpexLine) => existingKeys.has(keyOf(l));

  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!open) return;
    // Default: every copyable (non-colliding) line checked.
    setSelected(new Set(prevManual.filter((l) => !collides(l) && l.id).map((l) => l.id!)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prevManual]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chosen = prevManual.filter((l) => l.id && selected.has(l.id) && !collides(l));

  const confirm = () => {
    if (chosen.length === 0) {
      showMessage('Select at least one line to copy', 'error');
      return;
    }
    const clones: OpexLineInsert[] = chosen.map((l) => ({
      month: monthToApi(month),
      category: l.category ?? 'other',
      label: l.label ?? '',
      amount: { value: decimalToInput(l.amount) },
      currency: l.currency ?? 'EUR',
      note: l.note ?? '',
      // Carry the document/VAT group across too, so a copied invoice line keeps its VAT identity.
      vatAmount: l.vatAmount?.value ? { value: decimalToInput(l.vatAmount) } : undefined,
      vatRegime: l.vatRegime || undefined,
      docNumber: l.docNumber || undefined,
      docDate: l.docDate || undefined,
      supplierVatId: l.supplierVatId || undefined,
      supplierName: l.supplierName || undefined,
    }));
    upsert.mutate(clones, {
      onSuccess: () => showMessage(`Copied ${clones.length} line(s) from ${prevMonth}`, 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to copy', 'error'),
      onSettled: () => onOpenChange(false),
    });
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={confirm}
      title={`copy from ${prevMonth}`}
      confirmLabel={`copy ${chosen.length || ''}`.trim()}
      confirmDisabled={upsert.isPending || chosen.length === 0}
      closeOnConfirm={false}
      width='md'
    >
      {prevManual.length === 0 ? (
        <Text size='micro' variant='label' component='span'>
          No manual lines in {prevMonth} to copy.
        </Text>
      ) : (
        <div className='flex flex-col'>
          <Text size='micro' variant='label' component='span' className='mb-1.5'>
            Pick which of last month's manual lines to book into this month. Recurring (⟳) lines are
            never copied — the worker re-books them.
          </Text>
          {prevManual.map((l) => {
            const clash = collides(l);
            const id = l.id ?? 0;
            const amount = Number(decimalToInput(l.amount)) || 0;
            return (
              <label
                key={id}
                className={cn(
                  'flex items-center gap-2 border-b border-hairline py-1.5 last:border-b-0',
                  clash ? 'opacity-60' : 'cursor-pointer',
                )}
              >
                <CheckboxCommon
                  name={`copy-${id}`}
                  checked={!clash && selected.has(id)}
                  disabled={clash}
                  onChange={() => !clash && toggle(id)}
                />
                <span className='flex min-w-0 flex-1 items-baseline gap-1.5'>
                  <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                    {opexCategoryLabel(l.category)}
                  </Text>
                  <Text component='span' className='truncate'>
                    {l.label || '—'}
                  </Text>
                </span>
                {clash ? (
                  <Pill tone='mut'>present</Pill>
                ) : (
                  <Text size='micro' component='span' className='tabular-nums'>
                    {money(amount, l.currency, canRead)}
                  </Text>
                )}
              </label>
            );
          })}
        </div>
      )}
    </ConfirmationModal>
  );
}
