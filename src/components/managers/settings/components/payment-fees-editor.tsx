import { adminService } from 'api/api';
import { common_PaymentMethodNameEnum, PaymentMethodFee } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

const label = (m: string) => m.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace(/_/g, ' ');
const cellClass =
  'w-24 border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

// Estimated processing-fee model per payment method — feeds contribution margin for
// non-Stripe methods. Blind write: the contract has no read RPC, so current values are never
// shown (`GetDictionary`'s common_PaymentMethod has no fee field, and
// UpsertPaymentMethodFeesResponse echoes nothing back) — this editor can only overwrite, never
// verify or clear, what's live.
// BACKEND GAP: add a `GetPaymentMethodFees` read RPC (or at minimum echo the saved rows back
// from UpsertPaymentMethodFeesResponse) so this can be pre-populated.
// Until that exists: only methods with a value entered are sent (a blank method is NOT sent,
// so it is left as-is on the server — this editor cannot clear an existing fee), and every
// save requires an explicit confirmation that restates exactly what is about to be overwritten.
export function PaymentFeesEditor({
  methods,
  baseCurrency,
}: {
  methods: string[];
  baseCurrency: string;
}) {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.settings);
  const { showMessage } = useSnackBarStore();
  const [rows, setRows] = useState<Record<string, { pct: string; fixed: string }>>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const relevant = methods.filter((m) => m && m !== 'PAYMENT_METHOD_NAME_ENUM_UNKNOWN');
  const get = (m: string) => rows[m] ?? { pct: '', fixed: '' };
  const set = (m: string, patch: Partial<{ pct: string; fixed: string }>) =>
    setRows((r) => ({ ...r, [m]: { ...get(m), ...patch } }));

  const buildFees = (): PaymentMethodFee[] =>
    relevant
      .filter((m) => get(m).pct.trim() || get(m).fixed.trim())
      .map((m) => ({
        paymentMethod: m as common_PaymentMethodNameEnum,
        feePct: { value: get(m).pct.trim() || '0' },
        feeFixed: { value: get(m).fixed.trim() || '0' },
      }));

  // Computed fresh each render so both the button guard and the confirmation dialog's summary
  // always reflect the current inputs.
  const pendingFees = buildFees();

  const requestSave = () => {
    if (!pendingFees.length) {
      showMessage('Enter at least one fee before saving', 'error');
      return;
    }
    setConfirmOpen(true);
  };

  const save = async () => {
    const fees = buildFees();
    if (!fees.length) return;
    setSaving(true);
    try {
      await adminService.UpsertPaymentMethodFees({ fees });
      showMessage('Payment fees saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save payment fees', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        Blind write — the contract has no read API, so current values are not shown. Saving
        overwrites the stored fee model; only methods you fill in are sent.
      </Text>
      <div className='grid grid-cols-[1fr_6rem_7rem] items-center gap-x-3 gap-y-2'>
        <span />
        <Text variant='inactive' size='small'>
          fee %
        </Text>
        <Text variant='inactive' size='small'>
          fixed / order ({baseCurrency})
        </Text>
        {relevant.map((m) => (
          <div key={m} className='col-span-3 grid grid-cols-[1fr_6rem_7rem] items-center gap-x-3'>
            <Text size='small' className='uppercase'>
              {label(m)}
            </Text>
            <input
              className={cellClass}
              type='number'
              step='0.01'
              min='0'
              max='100'
              placeholder='0'
              disabled={!canEdit}
              value={get(m).pct}
              onChange={(e) => set(m, { pct: e.target.value })}
            />
            <input
              className={cellClass}
              type='number'
              step='0.01'
              min='0'
              placeholder='0'
              disabled={!canEdit}
              value={get(m).fixed}
              onChange={(e) => set(m, { fixed: e.target.value })}
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <Button
          type='button'
          size='lg'
          variant='secondary'
          className='self-start uppercase'
          disabled={saving}
          onClick={requestSave}
        >
          {saving ? 'saving…' : 'save fees'}
        </Button>
      )}
      <ConfirmationModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={save}
        title='overwrite live fees?'
        confirmLabel='save fees'
      >
        <div className='flex max-w-xs flex-col gap-2'>
          <Text size='small'>
            There is no read-back for this data — you cannot see what is currently live before
            saving. This will overwrite the stored fee for every method below and leave every other
            method untouched.
          </Text>
          <ul className='flex flex-col gap-1'>
            {pendingFees.map((f) => (
              <li key={String(f.paymentMethod)}>
                <Text size='small' className='uppercase'>
                  {label(f.paymentMethod ?? '')}: {f.feePct?.value}% + {f.feeFixed?.value}{' '}
                  {baseCurrency}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      </ConfirmationModal>
    </div>
  );
}
