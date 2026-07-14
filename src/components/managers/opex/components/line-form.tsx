import * as DialogPrimitives from '@radix-ui/react-dialog';
import { OpexLine } from 'api/proto-http/admin';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import { monthToApi, useDeleteOpexLine, useUpsertOpexLines } from '../utils/hooks';
import { isRecurringLine, opexCategoryOptions } from '../utils/options';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

type Draft = { category: string; label: string; amount: string; currency: string; note: string };

// Add / edit one manual OPEX line for a month. OpexLineInsert carries no id, so the server upserts
// by natural key (month, category, label): an amount-only edit is a plain upsert, but changing the
// category/label also deletes the old row (after the new one is safely written) so it isn't
// orphaned. `lines` = the month's current lines, used to refuse silent natural-key clobbers.
export function LineFormModal({
  open,
  onOpenChange,
  month,
  existing,
  lines = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  existing?: OpexLine;
  lines?: OpexLine[];
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertOpexLines();
  const del = useDeleteOpexLine();
  const busy = upsert.isPending || del.isPending;

  const [d, setD] = useState<Draft>({
    category: 'salaries',
    label: '',
    amount: '',
    currency: 'EUR',
    note: '',
  });

  useEffect(() => {
    if (!open) return;
    setD(
      existing
        ? {
            category: existing.category ?? 'other',
            label: existing.label ?? '',
            amount: decimalToInput(existing.amount),
            currency: existing.currency ?? 'EUR',
            note: existing.note ?? '',
          }
        : { category: 'salaries', label: '', amount: '', currency: 'EUR', note: '' },
    );
  }, [existing, open]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!d.label.trim() || !d.amount.trim()) {
      showMessage('Enter a label and amount', 'error');
      return;
    }
    const amountNum = parseDecimalNumber(d.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      showMessage('Amount must be a non-negative number', 'error');
      return;
    }
    const monthApi = monthToApi(month);
    const line = {
      month: monthApi,
      category: d.category.trim() || 'other',
      label: d.label.trim(),
      amount: { value: normalizeDecimalInput(d.amount) },
      currency: d.currency,
      note: d.note.trim(),
    };
    // The server upserts by (month, category, label): refuse to silently clobber a
    // different existing line — a worker-owned ⟳ line especially — under the same key.
    const collision = lines.find(
      (l) =>
        l.id !== existing?.id &&
        (l.category || 'other') === line.category &&
        (l.label || '') === line.label,
    );
    if (collision) {
      showMessage(
        isRecurringLine(collision)
          ? 'A recurring (⟳) line already uses this category + label this month'
          : 'A line with this category + label already exists this month — edit that line instead',
        'error',
      );
      return;
    }
    try {
      // Write the new row first, THEN drop the old one when the natural key changed:
      // the reverse order loses the line entirely if the upsert fails after the delete.
      await upsert.mutateAsync([line]);
      const keyChanged =
        existing &&
        (existing.category !== line.category ||
          existing.label !== line.label ||
          existing.month !== monthApi);
      if (existing?.id && keyChanged) {
        try {
          await del.mutateAsync(existing.id);
        } catch {
          showMessage(
            'Line saved under the new name, but the old line could not be removed — delete it manually',
            'error',
          );
          onOpenChange(false);
          return;
        }
      }
      showMessage(existing ? 'Line saved' : 'Line added', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save line', 'error');
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {existing ? 'edit line' : 'add line'}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>opex line</DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>category</Text>
              <input
                className={cell}
                list='opex-category-suggestions'
                value={d.category}
                onChange={(e) => set({ category: e.target.value })}
              />
              <datalist id='opex-category-suggestions'>
                {opexCategoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>label</Text>
              <input
                className={cell}
                value={d.label}
                onChange={(e) => set({ label: e.target.value })}
                placeholder='e.g. seamstress Maria'
              />
            </label>
            <div className='grid grid-cols-[1fr_7rem] gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>amount</Text>
                <input
                  className={cell}
                  type='number'
                  step='0.01'
                  min='0'
                  value={d.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>currency</Text>
                <select
                  className={cell}
                  value={d.currency}
                  onChange={(e) => set({ currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className='flex flex-col gap-1'>
              <Text size='small'>note (optional)</Text>
              <input
                className={cell}
                value={d.note}
                onChange={(e) => set({ note: e.target.value })}
              />
            </label>
          </div>
          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button type='button' variant='main' size='lg' disabled={busy} onClick={submit}>
              {busy ? 'saving…' : 'save'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
