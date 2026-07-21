import { AcctPeriod, googletype_Decimal } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { addMonths, format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';
import { Callout, CheckRow, GroupHeader, Note } from '../components/kit';
import { AcctSectionHeader } from '../components/section-header';
import { formatBase } from '../utils/format';
import { useAcctPeriods, useReconciliation, useReopenPeriod } from '../utils/hooks';
import { ClosePeriodConfirm } from './components/close-period-confirm';
import { formatPeriodLabel, isPastMonth, PeriodsList } from './components/periods-table';

// Same <0.01 threshold as the recon "matched" label (§8.5) — mirrors close-period-confirm.
function isDeltaOk(delta?: googletype_Decimal): boolean {
  const n = parseFloat(delta?.value ?? '');
  return Number.isFinite(n) && Math.abs(n) < 0.01;
}

// The "Checklist" variant's headline block: GroupHeader "CLOSE <MONTH>" over the real pre-close
// signals (the same reconciliation traffic light close-period-confirm fetches — pending events,
// unposted movements, revenue delta — plus the month-over rule), then a Callout that says plainly
// whether close is available and carries the real close action. The signals here are advisory;
// CloseAcctPeriod's own notReady[] response stays the authority inside the confirm modal.
function CloseChecklist({
  period,
  canWrite,
  onClose,
}: {
  period: AcctPeriod;
  canWrite: boolean;
  onClose: (p: AcctPeriod) => void;
}) {
  const label = formatPeriodLabel(period.period);
  const past = isPastMonth(period.period);

  // `to` is EXCLUSIVE: GetReconciliation covers [from, to) (backend reconcile.go), so the month's
  // traffic light must end on the 1st of the NEXT month — endOfMonth would silently drop the last
  // day's events from the pre-close check.
  const from = period.period ?? '';
  const to = period.period ? format(addMonths(parseISO(period.period), 1), 'yyyy-MM-dd') : '';
  const { data: recon, isLoading: reconLoading, isError: reconError } = useReconciliation(from, to);

  const pendingCount = recon?.pending?.totalCount ?? 0;
  const unpostedCount = recon?.unpostedMovements?.totalCount ?? 0;
  const revenueDelta = recon?.revenue?.delta;

  const signals =
    reconLoading || reconError
      ? null
      : [
          {
            done: pendingCount === 0,
            label:
              pendingCount === 0
                ? 'no events waiting for review'
                : `${pendingCount} event${pendingCount === 1 ? '' : 's'} waiting for review`,
          },
          {
            done: unpostedCount === 0,
            label:
              unpostedCount === 0
                ? 'no unposted stock movements'
                : `${unpostedCount} unposted stock movement${unpostedCount === 1 ? '' : 's'}`,
          },
          {
            done: isDeltaOk(revenueDelta),
            label: isDeltaOk(revenueDelta)
              ? 'revenue reconciles with the orders'
              : `revenue is off by ${formatBase(revenueDelta)} — reconcile first`,
          },
        ];

  const itemsLeft = (past ? 0 : 1) + (signals ? signals.filter((s) => !s.done).length : 0);

  return (
    <div className='flex flex-col gap-2'>
      <GroupHeader className='mt-0'>close {label}</GroupHeader>

      <div className='flex flex-col'>
        <CheckRow done={past}>
          {past ? 'the month is over' : 'the month is still running — closable on the 1st of the next month'}
        </CheckRow>
        {reconLoading ? (
          <Text size='small' variant='inactive'>
            checking reconciliation…
          </Text>
        ) : reconError ? (
          <Note className='mt-0'>
            could not check reconciliation — the close will still validate on the backend
          </Note>
        ) : (
          signals?.map((s, i) => (
            <CheckRow key={i} done={s.done}>
              {s.label}
            </CheckRow>
          ))
        )}
      </div>

      {!canWrite ? (
        <Callout>
          read-only — closing a period needs the accounting:write permission. Ask an admin to grant
          it.
        </Callout>
      ) : !past ? (
        <Callout>
          <span className='font-bold text-textColor'>not yet.</span> {label} has not ended — the
          close action opens on the 1st of the next month.
        </Callout>
      ) : reconLoading ? (
        <Callout>checking pre-close signals…</Callout>
      ) : itemsLeft > 0 ? (
        <Callout tone='attention'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span>
              <span className='font-bold text-error'>
                not yet: {itemsLeft} item{itemsLeft === 1 ? '' : 's'} left.
              </span>{' '}
              clear the list above — or close anyway; the backend re-checks and refuses an unready
              month.
            </span>
            <Button variant='secondary' size='sm' onClick={() => onClose(period)}>
              close {label}
            </Button>
          </div>
        </Callout>
      ) : (
        <Callout>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span>
              <span className='font-bold text-textColor'>ready to close.</span> every pre-close
              check passed
              {reconError ? ' (reconciliation unverified)' : ''} — closed periods reject any new
              postings.
            </span>
            <Button variant='main' size='sm' onClick={() => onClose(period)}>
              close {label}
            </Button>
          </div>
        </Callout>
      )}
    </div>
  );
}

// Periods screen (05) — the month-close ritual as a checklist: the next closable (or current)
// month leads with its real pre-close signals and the close action, the other months sit below as
// a timeline. Small screen, biggest blast radius in the section (closing rejects any new posting
// into that month) — the authoritative not-ready gate stays in close-period-confirm.tsx.
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

  // The checklist features the earliest open month: the next one the close ritual applies to
  // (a past open month is closable now; the current month shows its list with close gated).
  const openPeriods = periods.filter((p) => p.status === 'open' && p.period);
  const featured =
    openPeriods.length > 0
      ? openPeriods.reduce((a, b) => (a.period! <= b.period! ? a : b))
      : null;
  // Timeline below: every other month, newest first.
  const rest = periods
    .filter((p) => p !== featured)
    .slice()
    .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''));

  return (
    <div className='px-2.5'>
      <AcctSectionHeader />

      <div className='flex flex-col gap-4 py-6'>
        {/* Ritual hint (05 / backend plan 08): static, always visible above the checklist so the
            accountant never has to guess what "close" presupposes — and how periods come to
            exist (there is no manual "create"). */}
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            Periods open <span className='text-textColor'>automatically</span> on the first posting
            into a month — there is no “create”. A month becomes closable{' '}
            <span className='text-textColor'>only after it has ended</span>. To close a finished
            month: review reconciliation, add any missing manual entries, then close.
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
          <>
            {featured && (
              <CloseChecklist period={featured} canWrite={canWriteAcct} onClose={setCloseTarget} />
            )}
            {rest.length > 0 && (
              <div className='flex flex-col gap-1'>
                <GroupHeader>
                  {rest.every((p) => p.status === 'closed') ? 'closed months' : 'other months'}
                </GroupHeader>
                <PeriodsList
                  periods={rest}
                  canWrite={canWriteAcct}
                  onClose={setCloseTarget}
                  onReopen={setReopenTarget}
                />
              </div>
            )}
          </>
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
