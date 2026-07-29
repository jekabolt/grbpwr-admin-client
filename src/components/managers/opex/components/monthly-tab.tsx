import { OpexLine } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { monthToApi, useDeleteOpexLine, useOpexLines, useUpsertOpexLines } from '../utils/hooks';
import {
  currentMonth,
  formatMoney,
  isRecurringLine,
  isUncostedLine,
  monthLabel,
  opexCategoryLabel,
  opexCurrencySymbol,
  shiftMonth,
  sumBase,
  summarizeLines,
} from '../utils/options';
import { LineFormModal } from './line-form';
import { OpexWizard } from './opex-wizard';
import { MonthSummary } from './summary';

// Monthly OPEX view (screen H1): summary-first header, then lines grouped by category as scannable
// cards. Recurring (⟳, worker-owned) lines are read-only; manual one-off lines are editable. A
// copy-from-previous-month shortcut clones last month's manual lines (R-12). Adding goes through the
// guided wizard; editing stays inline.
export function MonthlyTab() {
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  const [params, setParams] = useSearchParams();
  const month = params.get('month') || currentMonth();
  const setMonth = (m: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('month', m);
        return p;
      },
      { replace: true },
    );

  const { data, isLoading, isError, refetch } = useOpexLines(month);
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const prevMonth = shiftMonth(month, -1);
  // Previous month, only to power the copy shortcut (manual lines only).
  const { data: prevData } = useOpexLines(prevMonth, canWriteCosting);
  const prevManual = (prevData?.lines ?? []).filter((l) => !isRecurringLine(l));

  const upsert = useUpsertOpexLines();
  const del = useDeleteOpexLine();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<OpexLine | undefined>();
  const [deleting, setDeleting] = useState<OpexLine | undefined>();

  const groups = useMemo(() => {
    const m = new Map<string, OpexLine[]>();
    for (const l of lines) {
      const key = l.category || 'other';
      (m.get(key) ?? m.set(key, []).get(key)!).push(l);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lines]);

  const summary = useMemo(() => summarizeLines(lines), [lines]);

  const confirmDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => showMessage('Line deleted', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to delete', 'error'),
      onSettled: () => setDeleting(undefined),
    });
  };

  const copyPrevious = () => {
    // Upserts share the (month, category, label) key with existing lines, so a clone
    // colliding with a line already in this month would silently overwrite it — skip those.
    const existingKeys = new Set(lines.map((l) => `${l.category || 'other'} ${l.label || ''}`));
    const clones = prevManual
      .filter((l) => !existingKeys.has(`${l.category ?? 'other'} ${l.label ?? ''}`))
      .map((l) => ({
        month: monthToApi(month),
        category: l.category ?? 'other',
        label: l.label ?? '',
        amount: { value: decimalToInput(l.amount) },
        currency: l.currency ?? 'EUR',
        note: l.note ?? '',
        vatAmount: undefined,
        vatRegime: undefined,
        docNumber: undefined,
        docDate: undefined,
        supplierVatId: undefined,
        supplierName: undefined,
      }));
    const skipped = prevManual.length - clones.length;
    if (!clones.length) {
      showMessage(
        `Nothing to copy — all ${prevManual.length} line(s) already exist this month`,
        'error',
      );
      return;
    }
    upsert.mutate(clones, {
      onSuccess: () =>
        showMessage(
          `Copied ${clones.length} line(s) from ${prevMonth}` +
            (skipped ? ` · skipped ${skipped} already present` : ''),
          'success',
        ),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to copy', 'error'),
    });
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* month nav */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            aria-label='previous month'
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </Button>
          <Text variant='uppercase'>{monthLabel(month)}</Text>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            aria-label='next month'
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </Button>
          {month !== currentMonth() && (
            <button
              type='button'
              className='text-textBaseSize uppercase underline hover:text-textColor'
              onClick={() => setMonth(currentMonth())}
            >
              today
            </button>
          )}
        </div>
        {canWriteCosting && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => setWizardOpen(true)}
          >
            + add opex
          </Button>
        )}
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load OPEX lines
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : (
        <>
          {summary.count > 0 && <MonthSummary summary={summary} base={base} />}

          {groups.length === 0 ? (
            <div className='flex flex-col items-start gap-2 border border-dashed border-textInactiveColor p-6'>
              <Text variant='uppercase' size='small'>
                no opex booked for {monthLabel(month)}
              </Text>
              <Text variant='inactive' size='small'>
                Add a one-off cost for this month, or set up a recurring template that books itself
                every month. Recurring templates (⟳) also appear here once the worker materialises
                them.
              </Text>
              {canWriteCosting && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='mt-1 uppercase'
                  onClick={() => setWizardOpen(true)}
                >
                  + add opex
                </Button>
              )}
            </div>
          ) : (
            <div className='flex flex-col gap-3'>
              {groups.map(([category, catLines]) => {
                const catTotal = sumBase(catLines).total;
                return (
                  <div key={category} className='border border-textInactiveColor'>
                    <div className='flex items-center justify-between border-b border-textInactiveColor bg-textInactiveColor/10 px-3 py-2'>
                      <Text variant='uppercase' size='small'>
                        {opexCategoryLabel(category)}
                      </Text>
                      <Text size='small'>
                        {opexCurrencySymbol(base)}
                        {formatMoney(catTotal)}
                      </Text>
                    </div>
                    <div className='flex flex-col'>
                      {catLines.map((l) => (
                        <LineRow
                          key={l.id}
                          line={l}
                          base={base}
                          canWrite={canWriteCosting}
                          onEdit={() => setEditing(l)}
                          onDelete={() => setDeleting(l)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {canWriteCosting && groups.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 border-t border-textInactiveColor pt-3'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            disabled={prevManual.length === 0 || upsert.isPending}
            title={
              prevManual.length === 0
                ? `no manual lines in ${prevMonth} to copy`
                : `copy ${prevManual.length} manual line(s) from ${prevMonth}`
            }
            onClick={copyPrevious}
          >
            copy from previous month
          </Button>
        </div>
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

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(v) => !v && setDeleting(undefined)}
        onConfirm={confirmDelete}
        title='delete OPEX line?'
        confirmLabel='delete'
      >
        <Text size='small'>Delete “{deleting?.label}”? This cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}

// One expense line as a compact row: label (+ ⟳ badge / note), amount folded to base, and edit/
// delete for manual lines. Recurring (worker-owned) lines are read-only — deleting them is refused
// server-side, so no destructive affordance is offered.
function LineRow({
  line,
  base,
  canWrite,
  onEdit,
  onDelete,
}: {
  line: OpexLine;
  base: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const recurring = isRecurringLine(line);
  const uncosted = isUncostedLine(line);
  const sameCurrency = (line.currency || '').toUpperCase() === base;

  return (
    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-textInactiveColor/40 px-3 py-2 last:border-b-0'>
      <div className='flex min-w-0 flex-col'>
        <div className='flex items-center gap-1.5'>
          {recurring && (
            <span
              className='shrink-0 border border-textInactiveColor px-1 text-small uppercase text-textInactiveColor'
              title='booked from a recurring template — read-only'
            >
              ⟳
            </span>
          )}
          <Text size='small' className='truncate'>
            {line.label || '—'}
          </Text>
        </div>
        {line.note && (
          <Text size='small' variant='inactive' className='truncate'>
            {line.note}
          </Text>
        )}
      </div>
      <div className='flex items-center gap-3'>
        <div className='text-right'>
          <Text size='small'>
            {opexCurrencySymbol(line.currency)}
            {formatMoney(Number(decimalToInput(line.amount)) || 0)} {line.currency}
          </Text>
          {uncosted ? (
            <Text variant='error' size='small'>
              uncosted !
            </Text>
          ) : (
            !sameCurrency && (
              <Text variant='inactive' size='small'>
                {opexCurrencySymbol(base)}
                {formatMoney(Number(decimalToInput(line.amountBase)) || 0)} {base}
              </Text>
            )
          )}
        </div>
        {canWrite && !recurring && (
          <div className='flex shrink-0 items-center gap-2'>
            <button
              type='button'
              className='text-textBaseSize uppercase underline hover:text-textColor'
              onClick={onEdit}
            >
              edit
            </button>
            <button
              type='button'
              className='text-textInactiveColor hover:text-error'
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
