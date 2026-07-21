import { AcctEvent } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Callout, Note } from '../components/kit';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate, sourceTypeLabel } from '../utils/format';
import {
  useAcctEventsNeedingReview,
  useReprocessAcctEvent,
  useResolveAcctEvent,
} from '../utils/hooks';

// Plain-language reading of why an event needs a human, phrased from the event's own type +
// last_error. Only unmistakable error signatures get a specific phrasing; everything else falls
// back to the generic instruction — and the raw error always stays visible below the paraphrase,
// so nothing is hidden behind it.
function plainReason(e: AcctEvent): string {
  const err = (e.lastError ?? '').toLowerCase();
  const type = sourceTypeLabel(e.eventType);
  if (err.includes('currency') || err.includes('non-eur') || err.includes('not eur')) {
    return `this ${type} is not in EUR — post the EUR figures as a manual entry, then resolve`;
  }
  if (err.includes('vat')) {
    return `a VAT figure is missing or wrong on this ${type} — fix it, then reprocess`;
  }
  if (err.includes('orphan')) {
    return `this ${type} has no matching original — post a manual entry, then resolve`;
  }
  return `this ${type} could not be filed automatically — fix the cause and reprocess, or post a manual entry and resolve`;
}

// Event review queue / dead-letter (accounting §events), "Callout" variant. The posting worker
// terminally disposes outbox events it can't auto-post — a non-EUR or degenerate order needing a
// manual entry, an orphan refund, a dead-letter — and flags them needs_review; the month can't
// close until an operator either REPROCESSES (retry after fixing the cause, e.g. a missing
// vat_rate) or RESOLVES (mark handled after posting a manual journal entry). An attention Callout
// leads with the count; each event reads as a plain sentence and ends in the two terminal
// actions. Toasts + invalidation live in the mutation hooks.
export function AcctEventsPage() {
  const { data, isLoading, isError, refetch } = useAcctEventsNeedingReview();
  const events = data?.events ?? [];

  const reprocess = useReprocessAcctEvent();
  const resolve = useResolveAcctEvent();

  // A row is busy while either of its two actions is in flight; both mutations are shared across
  // rows, so scope "pending" to the id currently being mutated rather than a global isPending.
  const pendingId = (m: { isPending: boolean; variables?: { id: number } }): number | null =>
    m.isPending ? (m.variables?.id ?? null) : null;
  const reprocessingId = pendingId(reprocess);
  const resolvingId = pendingId(resolve);

  return (
    <div className='px-2.5'>
      <AcctSectionHeader />

      <div className='flex flex-col gap-4 py-6'>
        <ReportState
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          isEmpty={events.length === 0}
          emptyHint='no events need review'
        >
          <Callout tone='attention'>
            <p className='font-bold text-error'>
              {events.length} transaction{events.length === 1 ? '' : 's'} need
              {events.length === 1 ? 's' : ''} you.
            </p>
            <p className='mt-1'>
              the posting worker could not file these automatically — reprocess after fixing the
              cause, or resolve once you have posted a manual journal entry.
            </p>
            <Link
              to={`${ROUTES.accounting}?new=1`}
              className='mt-1.5 inline-block w-fit text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
            >
              add manual entry →
            </Link>
          </Callout>

          <div className='border border-textInactiveColor'>
            {events.map((e: AcctEvent) => {
              const id = e.id;
              const rowBusy = id != null && (reprocessingId === id || resolvingId === id);
              return (
                <div
                  key={id}
                  className='flex flex-wrap items-start justify-between gap-3 border-b border-textInactiveColor p-2.5 last:border-b-0'
                >
                  <div className='flex min-w-0 flex-1 basis-64 flex-col gap-1'>
                    <div className='flex flex-wrap items-baseline gap-2'>
                      <span className='whitespace-nowrap font-medium uppercase'>
                        {sourceTypeLabel(e.eventType)}
                      </span>
                      {e.sourceKey ? (
                        <Text size='small' variant='inactive' className='truncate'>
                          {e.sourceKey}
                        </Text>
                      ) : null}
                    </div>
                    <Text size='small'>{plainReason(e)}</Text>
                    {e.lastError ? (
                      <Text size='small' className='break-words text-error'>
                        {e.lastError}
                      </Text>
                    ) : null}
                    <span className='text-[10px] uppercase tracking-wide text-labelColor'>
                      id {id ?? '—'} · occurred {e.occurredAt ? formatAcctDate(e.occurredAt) : '—'}{' '}
                      · {e.attempts ?? 0} attempt{(e.attempts ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='secondary'
                      size='sm'
                      disabled={id == null || rowBusy}
                      loading={reprocessingId === id}
                      onClick={() => id != null && reprocess.mutate({ id })}
                    >
                      reprocess
                    </Button>
                    <Button
                      variant='main'
                      size='sm'
                      disabled={id == null || rowBusy}
                      loading={resolvingId === id}
                      onClick={() => id != null && resolve.mutate({ id })}
                    >
                      resolve
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Note>everything else filed automatically — only these events needed a human.</Note>
        </ReportState>
      </div>
    </div>
  );
}
