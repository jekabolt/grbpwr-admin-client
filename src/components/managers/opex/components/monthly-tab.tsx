import { OpexLine } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { useSnackBarStore } from 'lib/stores/store';
import { decimalToInput } from 'utils/decimal';
import { monthToApi, useDeleteOpexLine, useOpexLines, useUpsertOpexLines } from '../utils/hooks';
import {
  currentMonth,
  isRecurringLine,
  monthLabel,
  opexCategoryLabel,
  shiftMonth,
  sumBase,
} from '../utils/options';
import { LineFormModal } from './line-form';

// Monthly OPEX view (screen H1): month navigation, lines grouped by category with subtotals,
// recurring (⟳, worker-owned) lines read-only, manual lines editable, and a copy-from-previous-month
// shortcut for the manual ones (R-12).
export function MonthlyTab() {
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
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

  const { data, isLoading } = useOpexLines(month);
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const prevMonth = shiftMonth(month, -1);
  // Previous month, only to power the copy shortcut (manual lines only).
  const { data: prevData } = useOpexLines(prevMonth, canWriteCosting);
  const prevManual = (prevData?.lines ?? []).filter((l) => !isRecurringLine(l));

  const upsert = useUpsertOpexLines();
  const del = useDeleteOpexLine();

  const [formOpen, setFormOpen] = useState(false);
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

  const { total, uncosted } = sumBase(lines);

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (l: OpexLine) => {
    setEditing(l);
    setFormOpen(true);
  };
  const confirmDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => showMessage('Line deleted', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to delete', 'error'),
      onSettled: () => setDeleting(undefined),
    });
  };
  const copyPrevious = () => {
    const clones = prevManual.map((l) => ({
      month: monthToApi(month),
      category: l.category ?? 'other',
      label: l.label ?? '',
      amount: { value: decimalToInput(l.amount) },
      currency: l.currency ?? 'EUR',
      note: l.note ?? '',
    }));
    if (!clones.length) return;
    upsert.mutate(clones, {
      onSuccess: () => showMessage(`Copied ${clones.length} line(s) from ${prevMonth}`, 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to copy', 'error'),
    });
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* month nav + total */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </Button>
          <Text variant='uppercase'>{monthLabel(month)}</Text>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </Button>
        </div>
        <Text size='small'>
          Σ month: {total.toFixed(2)} EUR
          {uncosted > 0 ? ` · ${uncosted} uncosted !` : ''}
        </Text>
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : groups.length === 0 ? (
        <Text variant='inactive' size='small'>
          no OPEX lines this month
        </Text>
      ) : (
        <div className='flex flex-col gap-4'>
          {groups.map(([category, catLines]) => {
            const catTotal = sumBase(catLines).total;
            return (
              <div key={category} className='flex flex-col'>
                <div className='flex items-center justify-between border-b border-textInactiveColor py-1'>
                  <Text variant='uppercase' size='small'>
                    {opexCategoryLabel(category)}
                  </Text>
                  <Text size='small'>{catTotal.toFixed(2)} EUR</Text>
                </div>
                {catLines.map((l) => {
                  const recurring = isRecurringLine(l);
                  const noFx = l.costed === false || !l.amountBase?.value;
                  return (
                    <div
                      key={l.id}
                      className='flex flex-wrap items-center justify-between gap-2 border-b border-textInactiveColor/40 py-1.5'
                    >
                      <Text size='small' className='min-w-0'>
                        {recurring ? '⟳ ' : ''}
                        {l.label || '—'}
                      </Text>
                      <div className='flex items-center gap-3'>
                        <Text variant='inactive' size='small'>
                          {decimalToInput(l.amount)} {l.currency}
                          {noFx
                            ? ' → uncosted !'
                            : l.currency !== 'EUR'
                              ? ` → €${decimalToInput(l.amountBase)}`
                              : ''}
                        </Text>
                        {canWriteCosting && !recurring && (
                          <div className='flex items-center gap-1'>
                            <button
                              type='button'
                              className='text-textBaseSize uppercase underline hover:text-textColor'
                              onClick={() => openEdit(l)}
                            >
                              edit
                            </button>
                            <button
                              type='button'
                              className='text-textInactiveColor hover:text-error'
                              aria-label='delete line'
                              onClick={() => setDeleting(l)}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {canWriteCosting && (
        <div className='flex flex-wrap items-center gap-2 border-t border-textInactiveColor pt-3'>
          <Button type='button' variant='main' size='lg' className='uppercase' onClick={openAdd}>
            + line
          </Button>
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

      <LineFormModal open={formOpen} onOpenChange={setFormOpen} month={month} existing={editing} />

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
