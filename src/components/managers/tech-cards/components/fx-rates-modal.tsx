import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { CostingFxRate } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

type Row = { currency: string; rateToBase: string; validFrom: string };

const cellClass =
  'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

// Costing FX rates fold a multi-currency costing into the base currency. Without a rate
// for a currency, the tech-card costing flags has_unconverted_currencies and cannot
// compute a base-currency unit cost. Small table editor in the tech_cards section.
export function FxRatesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['costingFxRates'],
    queryFn: () => adminService.GetCostingFxRates({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setRows(
      (data?.rates ?? []).map((r) => ({
        currency: r.currency ?? '',
        rateToBase: r.rateToBase?.value ?? '',
        validFrom: r.validFrom ? r.validFrom.slice(0, 10) : '',
      })),
    );
  }, [data, open]);

  const save = useMutation({
    mutationFn: (rates: CostingFxRate[]) => adminService.UpsertCostingFxRates({ rates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costingFxRates'] });
      showMessage('FX rates saved', 'success');
      onOpenChange(false);
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save FX rates', 'error'),
  });

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { currency: '', rateToBase: '', validFrom: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const rates: CostingFxRate[] = rows
      .filter((r) => r.currency.trim() && r.rateToBase.trim())
      .map((r) => ({
        currency: r.currency.trim().toUpperCase(),
        rateToBase: { value: r.rateToBase.trim() },
        validFrom: r.validFrom ? new Date(r.validFrom).toISOString() : undefined,
      }));
    save.mutate(rates);
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleSave}
      title='costing FX rates'
      confirmLabel={save.isPending ? 'saving…' : 'save'}
      confirmDisabled={!canEdit || save.isPending}
    >
      <div className='flex min-w-[min(90vw,32rem)] flex-col gap-2'>
        <Text variant='inactive' size='small'>
          rate_to_base = how many units of the base currency (EUR) one unit of `currency` is worth.
        </Text>
        {isLoading ? (
          <Text size='small'>loading…</Text>
        ) : (
          <>
            <div className='grid grid-cols-[5rem_1fr_9rem_2rem] items-center gap-2'>
              <Text variant='inactive' size='small'>currency</Text>
              <Text variant='inactive' size='small'>rate → EUR</Text>
              <Text variant='inactive' size='small'>valid from</Text>
              <span />
              {rows.map((r, i) => (
                <div key={i} className='col-span-4 grid grid-cols-[5rem_1fr_9rem_2rem] items-center gap-2'>
                  <input
                    className={`${cellClass} uppercase`}
                    value={r.currency}
                    maxLength={3}
                    disabled={!canEdit}
                    placeholder='USD'
                    onChange={(e) => update(i, { currency: e.target.value })}
                  />
                  <input
                    className={cellClass}
                    type='number'
                    step='0.0001'
                    min='0'
                    value={r.rateToBase}
                    disabled={!canEdit}
                    placeholder='0.92'
                    onChange={(e) => update(i, { rateToBase: e.target.value })}
                  />
                  <input
                    className={cellClass}
                    type='date'
                    value={r.validFrom}
                    disabled={!canEdit}
                    onChange={(e) => update(i, { validFrom: e.target.value })}
                  />
                  <button
                    type='button'
                    className='text-textInactiveColor hover:text-error disabled:opacity-50'
                    disabled={!canEdit}
                    onClick={() => removeRow(i)}
                    aria-label='remove'
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {rows.length === 0 && (
              <Text variant='inactive' size='small'>
                no FX rates — costing stays single-currency
              </Text>
            )}
            {canEdit && (
              <button
                type='button'
                className='self-start text-textBaseSize uppercase underline'
                onClick={addRow}
              >
                + add rate
              </button>
            )}
          </>
        )}
      </div>
    </ConfirmationModal>
  );
}
