import { adminService } from 'api/api';
import { OpexEntryInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

const CATEGORIES = ['salaries', 'rent', 'software', 'marketing_other', 'production_content', 'other'];
type Row = { month: string; category: string; amount: string; note: string };
const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

// Monthly operating expenses (fixed costs) — subtracted from contribution to get the
// operating result on the dashboard. Blind write: the contract has no read RPC, so
// current values are not shown; saving upserts by (month, category).
export function OpexModal({
  open,
  onOpenChange,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  baseCurrency: string;
}) {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.analytics);
  const { showMessage } = useSnackBarStore();
  const [rows, setRows] = useState<Row[]>([{ month: '', category: 'salaries', amount: '', note: '' }]);
  const [saving, setSaving] = useState(false);

  const upd = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    const entries: OpexEntryInsert[] = rows
      .filter((r) => r.month.trim() && r.amount.trim())
      .map((r) => ({
        // month input gives YYYY-MM; server normalises to the 1st.
        month: `${r.month}-01`,
        category: r.category,
        amount: { value: r.amount.trim() },
        note: r.note.trim(),
      }));
    if (!entries.length) {
      showMessage('Enter at least one month + amount', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminService.UpsertOpexEntries({ entries });
      showMessage('OPEX saved', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save OPEX', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={save}
      title='OPEX (monthly fixed costs)'
      confirmLabel={saving ? 'saving…' : 'save'}
      confirmDisabled={!canEdit || saving}
    >
      <div className='flex min-w-[min(92vw,40rem)] flex-col gap-2'>
        <Text variant='inactive' size='small'>
          Blind write ({baseCurrency}) — current values are not shown. Upserts by month × category;
          feeds the dashboard operating result.
        </Text>
        <div className='grid grid-cols-[8rem_9rem_7rem_1fr_2rem] items-center gap-2'>
          <Text variant='inactive' size='small'>month</Text>
          <Text variant='inactive' size='small'>category</Text>
          <Text variant='inactive' size='small'>amount</Text>
          <Text variant='inactive' size='small'>note</Text>
          <span />
          {rows.map((r, i) => (
            <div key={i} className='col-span-5 grid grid-cols-[8rem_9rem_7rem_1fr_2rem] items-center gap-2'>
              <input className={cell} type='month' disabled={!canEdit}
                value={r.month} onChange={(e) => upd(i, { month: e.target.value })} />
              <select className={cell} disabled={!canEdit}
                value={r.category} onChange={(e) => upd(i, { category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input className={cell} type='number' step='0.01' min='0' placeholder='0' disabled={!canEdit}
                value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} />
              <input className={cell} placeholder='optional' disabled={!canEdit}
                value={r.note} onChange={(e) => upd(i, { note: e.target.value })} />
              <button type='button' className='text-textInactiveColor hover:text-error disabled:opacity-50'
                disabled={!canEdit} aria-label='remove'
                onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
        </div>
        {canEdit && (
          <button type='button' className='self-start text-textBaseSize uppercase underline'
            onClick={() => setRows((rs) => [...rs, { month: '', category: 'salaries', amount: '', note: '' }])}>
            + add row
          </button>
        )}
      </div>
    </ConfirmationModal>
  );
}
