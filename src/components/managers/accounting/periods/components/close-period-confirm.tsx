import { AcctPeriod, googletype_Decimal } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { addMonths, format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { Callout, CheckRow, GroupHeader } from '../../components/kit';
import { formatBase } from '../../utils/format';
import { useClosePeriod, useReconciliation } from '../../utils/hooks';
import { formatPeriodLabel } from './periods-table';

type Props = {
  period: AcctPeriod | null;
  onOpenChange: (open: boolean) => void;
};

function isDeltaOk(delta?: googletype_Decimal): boolean {
  const n = parseFloat(delta?.value ?? '');
  return Number.isFinite(n) && Math.abs(n) < 0.01;
}

// One pre-close signal as a checklist row: the kit's CheckRow box plus the signal's real value.
function SignalRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <CheckRow done={ok}>
      <span className='flex items-baseline gap-2'>
        {label}
        <span className='tabular-nums text-labelColor'>{value}</span>
      </span>
    </CheckRow>
  );
}

// close-period-confirm — the section's most dangerous action (05 "Close"). closeOnConfirm={false}
// because the response is a normal `{closed, notReady[]}` payload, not a gRPC error (07 §7.2):
// a `closed=false` result must keep the modal open and render the checklist rather than let
// ConfirmationModal's default auto-close wipe the failure off the screen.
export function ClosePeriodConfirm({ period, onOpenChange }: Props) {
  const { showMessage } = useSnackBarStore();
  const closePeriod = useClosePeriod();
  const [notReady, setNotReady] = useState<string[] | null>(null);

  // A fresh target period means a fresh attempt — drop any notReady checklist left over from a
  // previous period's failed close so it can't bleed into this one.
  useEffect(() => {
    setNotReady(null);
  }, [period?.period]);

  // Pre-close traffic light (08.6): fetch reconciliation for the target month the moment the
  // modal opens, before the accountant ever presses "close period". `from`/`to` stay empty
  // strings while the modal is closed, which keeps useReconciliation's own `enabled` guard off
  // instead of firing a query for a null period.
  const from = period?.period ?? '';
  // `to` is EXCLUSIVE: GetReconciliation covers [from, to) (backend reconcile.go), so the
  // month's traffic light must end on the 1st of the NEXT month — endOfMonth would silently
  // drop the last day's events from the pre-close check.
  const to = period?.period ? format(addMonths(parseISO(period.period), 1), 'yyyy-MM-dd') : '';
  const { data: recon, isLoading: reconLoading, isError: reconError } = useReconciliation(from, to);

  const pendingCount = recon?.pending?.totalCount ?? 0;
  const unpostedCount = recon?.unpostedMovements?.totalCount ?? 0;
  const revenueDelta = recon?.revenue?.delta;

  const handleConfirm = () => {
    if (!period?.period) return;
    closePeriod.mutate(
      { month: period.period },
      {
        onSuccess: (res) => {
          if (res.closed) {
            showMessage('Period closed', 'success');
            onOpenChange(false);
          } else {
            setNotReady(
              res.notReady && res.notReady.length > 0
                ? res.notReady
                : ['not ready — see reconciliation for details'],
            );
          }
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to close period', 'error'),
      },
    );
  };

  const label = period?.period ? formatPeriodLabel(period.period) : '';

  return (
    <ConfirmationModal
      open={period !== null}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      closeOnConfirm={false}
      title={`Close ${label}?`}
      confirmLabel={closePeriod.isPending ? 'closing…' : 'close period'}
      confirmDisabled={closePeriod.isPending}
    >
      <div className='flex min-w-[min(90vw,26rem)] flex-col gap-4'>
        <Text size='small'>
          Close {label}? Closed periods reject any new postings; late events will require reopening.
        </Text>

        <div className='flex flex-col'>
          <GroupHeader className='mt-0'>pre-close check</GroupHeader>
          {reconLoading ? (
            <Text size='small' variant='inactive'>
              checking reconciliation…
            </Text>
          ) : reconError ? (
            <Text size='small' variant='inactive'>
              could not check reconciliation — the close will still validate on the backend
            </Text>
          ) : (
            <>
              <SignalRow
                label='pending events'
                value={String(pendingCount)}
                ok={pendingCount === 0}
              />
              <SignalRow
                label='unposted movements'
                value={String(unpostedCount)}
                ok={unpostedCount === 0}
              />
              <SignalRow
                label='revenue delta'
                value={formatBase(revenueDelta)}
                ok={isDeltaOk(revenueDelta)}
              />
            </>
          )}
        </div>

        {notReady && (
          <Callout tone='attention' className='flex flex-col gap-2'>
            <span className='text-[10px] font-bold uppercase tracking-wide text-error'>
              not ready:
            </span>
            <ul className='flex flex-col gap-1 pl-4'>
              {notReady.map((reason, i) => (
                <li key={i} className='list-disc text-textBaseSize text-error'>
                  {reason}
                </li>
              ))}
            </ul>
            <Link
              to={`${ROUTES.accountingReports}?tab=recon`}
              className='w-fit text-textBaseSize underline underline-offset-2 hover:text-textColor'
            >
              open reconciliation →
            </Link>
          </Callout>
        )}
      </div>
    </ConfirmationModal>
  );
}
