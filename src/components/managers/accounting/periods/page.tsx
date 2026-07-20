import { AcctPeriod } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';
import { AcctSectionHeader } from '../components/section-header';
import { useAcctPeriods, useReopenPeriod } from '../utils/hooks';
import { ClosePeriodConfirm } from './components/close-period-confirm';
import { formatPeriodLabel, PeriodsTable } from './components/periods-table';

// Periods screen (05) — the month-close ritual: review reconciliation, add any missing manual
// entries, then close. Small screen, biggest blast radius in the section (closing rejects any
// new posting into that month), hence the pre-close traffic light living in
// close-period-confirm.tsx rather than here.
export function AcctPeriodsPage() {
  const { canWrite } = usePermissions();
  const canWriteAcct = canWrite(SECTION.accounting);
  const { showMessage } = useSnackBarStore();

  const { data, isLoading, isError, refetch } = useAcctPeriods();
  const periods = data?.periods ?? [];

  const [closeTarget, setCloseTarget] = useState<AcctPeriod | null>(null);
  const [reopenTarget, setReopenTarget] = useState<AcctPeriod | null>(null);

  const reopenPeriod = useReopenPeriod();

  const handleReopenConfirm = () => {
    if (!reopenTarget?.period) return;
    reopenPeriod.mutate(
      { month: reopenTarget.period },
      {
        onSuccess: () => showMessage('Period reopened', 'success'),
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to reopen period', 'error'),
      },
    );
  };

  return (
    <div className='px-2.5'>
      <AcctSectionHeader />

      <div className='flex flex-col gap-4 py-6'>
        {/* Ritual hint (05 / backend plan 08): static, always visible above the table so the
            accountant never has to guess what "close" presupposes — and how periods come to
            exist (there is no manual "create"). */}
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            Periods open <span className='text-textColor'>automatically</span> on the first posting
            into a month — there is no “create”. A month becomes closable{' '}
            <span className='text-textColor'>only after it has ended</span> (the “close” button
            appears on its row on the 1st of the next month). To close a finished month:
          </Text>
          <Text variant='inactive' size='small'>
            1. review reconciliation
          </Text>
          <Text variant='inactive' size='small'>
            2. add any missing manual entries
          </Text>
          <Text variant='inactive' size='small'>
            3. close (a pre-close check flags pending events / unposted movements / revenue delta)
          </Text>
          <div className='flex flex-wrap gap-4'>
            <Link
              to={`${ROUTES.accountingReports}?tab=recon`}
              className='w-fit text-textBaseSize text-textInactiveColor underline underline-offset-2 hover:text-textColor'
            >
              open reconciliation →
            </Link>
            <Link
              to={`${ROUTES.accounting}?new=1`}
              className='w-fit text-textBaseSize text-textInactiveColor underline underline-offset-2 hover:text-textColor'
            >
              add manual entry →
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className='min-h-40'>
            <Loader />
          </div>
        ) : isError ? (
          <div className='border border-error p-4 text-center'>
            <Text className='mb-3 text-error'>Failed to load periods</Text>
            <Button variant='secondary' size='lg' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : periods.length === 0 ? (
          <div className='min-h-40 border border-textInactiveColor p-4 text-center'>
            <Text variant='inactive' size='small'>
              no periods yet — they appear with the first posting
            </Text>
          </div>
        ) : (
          <PeriodsTable
            periods={periods}
            canWrite={canWriteAcct}
            onClose={setCloseTarget}
            onReopen={setReopenTarget}
          />
        )}
      </div>

      <ClosePeriodConfirm
        period={closeTarget}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
      />

      <ConfirmationModal
        open={reopenTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReopenTarget(null);
        }}
        onConfirm={handleReopenConfirm}
        title={
          reopenTarget ? `Reopen ${formatPeriodLabel(reopenTarget.period)}?` : 'Reopen period?'
        }
        confirmLabel='reopen'
      >
        <Text size='small'>
          Reopening allows postings into a finalized month. Close it again after the fix.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
