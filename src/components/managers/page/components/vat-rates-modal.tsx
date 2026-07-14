import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { VatRate } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

type Row = { countryCode: string; ratePct: string; validFrom: string };
const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

// Destination-country VAT rates used to compute net-of-VAT revenue. Get + Upsert.
export function VatRatesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.analytics);
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['vatRates'],
    queryFn: () => adminService.GetVatRates({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setRows(
      (data?.rates ?? []).map((r) => ({
        countryCode: r.countryCode ?? '',
        ratePct: r.ratePct?.value ?? '',
        validFrom: r.validFrom ? r.validFrom.slice(0, 10) : '',
      })),
    );
  }, [data, open]);

  const save = useMutation({
    mutationFn: (rates: VatRate[]) => adminService.UpsertVatRates({ rates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vatRates'] });
      showMessage('VAT rates saved', 'success');
      onOpenChange(false);
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save VAT rates', 'error'),
  });

  const upd = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const handleSave = () =>
    save.mutate(
      rows
        .filter((r) => r.countryCode.trim() && r.ratePct.trim())
        .map((r) => ({
          countryCode: r.countryCode.trim().toUpperCase(),
          ratePct: { value: r.ratePct.trim() },
          validFrom: r.validFrom ? new Date(r.validFrom).toISOString() : undefined,
        })),
    );

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleSave}
      title='VAT rates by country'
      confirmLabel={save.isPending ? 'saving…' : 'save'}
      confirmDisabled={!canEdit || save.isPending}
    >
      <div className='flex min-w-[min(90vw,30rem)] flex-col gap-2'>
        <Text variant='inactive' size='small'>
          Standard VAT % per destination country (ISO-2). Headline revenue is reported net of VAT.
        </Text>
        {isLoading ? (
          <Text size='small'>loading…</Text>
        ) : (
          <div className='grid grid-cols-[5rem_1fr_9rem_2rem] items-center gap-2'>
            <Text variant='inactive' size='small'>country</Text>
            <Text variant='inactive' size='small'>rate %</Text>
            <Text variant='inactive' size='small'>valid from</Text>
            <span />
            {rows.map((r, i) => (
              <div key={i} className='col-span-4 grid grid-cols-[5rem_1fr_9rem_2rem] items-center gap-2'>
                <input className={`${cell} uppercase`} maxLength={2} placeholder='DE' disabled={!canEdit}
                  value={r.countryCode} onChange={(e) => upd(i, { countryCode: e.target.value })} />
                <input className={cell} type='number' step='0.01' min='0' max='100' placeholder='21'
                  disabled={!canEdit} value={r.ratePct} onChange={(e) => upd(i, { ratePct: e.target.value })} />
                <input className={cell} type='date' disabled={!canEdit}
                  value={r.validFrom} onChange={(e) => upd(i, { validFrom: e.target.value })} />
                <button type='button' className='text-textInactiveColor hover:text-error disabled:opacity-50'
                  disabled={!canEdit} aria-label='remove'
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            {canEdit && (
              <button type='button' className='col-span-4 self-start text-textBaseSize uppercase underline'
                onClick={() => setRows((rs) => [...rs, { countryCode: '', ratePct: '', validFrom: '' }])}>
                + add country
              </button>
            )}
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
