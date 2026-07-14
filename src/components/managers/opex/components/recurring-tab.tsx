import * as DialogPrimitives from '@radix-ui/react-dialog';
import { OpexRecurring } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import {
  monthToApi,
  useArchiveOpexRecurring,
  useOpexRecurring,
  useUpsertOpexRecurring,
} from '../utils/hooks';
import { opexCategoryLabel, opexCategoryOptions } from '../utils/options';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-2 py-1 text-textBaseSize';
const toMonth = (v?: string) => (v ? v.slice(0, 7) : '');

// Recurring templates (screen H2): a worker materialises each into a monthly line from active_from
// to min(this month, active_to). Editing a template affects future materialisations (see B-8) — the
// worker semantics are still being confirmed, so the copy stays neutral.
export function RecurringTab() {
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, isError, refetch } = useOpexRecurring(showArchived);
  const archive = useArchiveOpexRecurring();
  const rows = data?.recurring ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OpexRecurring | undefined>();
  const [archiving, setArchiving] = useState<OpexRecurring | undefined>();

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
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
          <Button type='button' variant='main' size='lg' className='uppercase' onClick={openAdd}>
            + template
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
        <Text variant='inactive' size='small'>
          no recurring templates
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={th}>label</th>
                <th className={th}>category</th>
                <th className={th}>amount</th>
                <th className={th}>active from</th>
                <th className={th}>active to</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ins = r.recurring;
                return (
                  <tr key={r.id} className={r.archived ? 'opacity-50' : ''}>
                    <td className={td}>
                      {ins?.label || '—'}
                      {r.archived ? ' · archived' : ''}
                    </td>
                    <td className={td}>{opexCategoryLabel(ins?.category)}</td>
                    <td className={td}>
                      {decimalToInput(ins?.amount)} {ins?.currency}
                    </td>
                    <td className={td}>{toMonth(ins?.activeFrom) || '—'}</td>
                    <td className={td}>{toMonth(ins?.activeTo) || 'open'}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {canWriteCosting && !r.archived && (
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            className='uppercase underline hover:text-textColor'
                            onClick={() => {
                              setEditing(r);
                              setFormOpen(true);
                            }}
                          >
                            edit
                          </button>
                          <button
                            type='button'
                            className='uppercase text-textInactiveColor hover:text-error'
                            onClick={() => setArchiving(r)}
                          >
                            archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RecurringFormModal open={formOpen} onOpenChange={setFormOpen} existing={editing} />

      <ConfirmationModal
        open={archiving != null}
        onOpenChange={(v) => !v && setArchiving(undefined)}
        onConfirm={confirmArchive}
        title='archive template?'
        confirmLabel='archive'
      >
        <Text size='small'>
          Archive “{archiving?.recurring?.label}”? It stops materialising into future months.
        </Text>
      </ConfirmationModal>
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
};

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

  const [d, setD] = useState<Draft>({
    label: '',
    category: 'salaries',
    amount: '',
    currency: 'EUR',
    activeFrom: '',
    activeTo: '',
    note: '',
  });

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
          }
        : {
            label: '',
            category: 'salaries',
            amount: '',
            currency: 'EUR',
            activeFrom: '',
            activeTo: '',
            note: '',
          },
    );
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
        },
      });
      showMessage(existing ? 'Template saved' : 'Template added', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save template', 'error');
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {existing ? 'edit template' : 'add template'}
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
            <label className='flex flex-col gap-1'>
              <Text size='small'>label</Text>
              <input
                className={cell}
                value={d.label}
                onChange={(e) => set({ label: e.target.value })}
                placeholder='e.g. Adobe CC'
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>category</Text>
              <input
                className={cell}
                list='opex-recurring-category'
                value={d.category}
                onChange={(e) => set({ category: e.target.value })}
              />
              <datalist id='opex-recurring-category'>
                {opexCategoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
            <div className='grid grid-cols-2 gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>active from</Text>
                <input
                  className={cell}
                  type='month'
                  value={d.activeFrom}
                  onChange={(e) => set({ activeFrom: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>active to (optional)</Text>
                <input
                  className={cell}
                  type='month'
                  value={d.activeTo}
                  onChange={(e) => set({ activeTo: e.target.value })}
                />
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
