import { AcctEvent } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate } from '../utils/format';
import {
  useAcctEventsNeedingReview,
  useReprocessAcctEvent,
  useResolveAcctEvent,
} from '../utils/hooks';

// Event review queue / dead-letter (accounting §events). The posting worker terminally disposes
// outbox events it can't auto-post — a non-EUR or degenerate order needing a manual entry, an
// orphan refund, a dead-letter — and flags them needs_review; the month can't close until an
// operator either REPROCESSES (retry after fixing the cause, e.g. a missing vat_rate) or RESOLVES
// (mark handled after posting a manual journal entry). This screen is that queue: one row per
// flagged event with the two terminal actions. Toasts + invalidation live in the mutation hooks.
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
        <Text variant='inactive' size='small'>
          events the posting worker could not post automatically — reprocess after fixing the cause,
          or resolve once you have posted a manual journal entry
        </Text>

        <ReportState
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          isEmpty={events.length === 0}
          emptyHint='no events need review'
        >
          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
              <thead className='h-10 bg-textInactiveColor'>
                <tr className='border-b border-textInactiveColor'>
                  <th className='px-2 text-left text-textBaseSize uppercase'>id</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>type</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>source key</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>occurred</th>
                  <th className='px-2 text-right text-textBaseSize uppercase'>attempts</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>reason</th>
                  <th className='px-2 text-right text-textBaseSize uppercase'>action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: AcctEvent) => {
                  const id = e.id;
                  const rowBusy = id != null && (reprocessingId === id || resolvingId === id);
                  return (
                    <tr key={id} className='border-b border-textInactiveColor align-top'>
                      <td className='px-2 py-2'>
                        <Text className='font-medium'>{id ?? '—'}</Text>
                      </td>
                      <td className='px-2 py-2'>
                        <Text size='small'>{e.eventType || '—'}</Text>
                      </td>
                      <td className='px-2 py-2'>
                        <Text size='small' variant='inactive'>
                          {e.sourceKey || '—'}
                        </Text>
                      </td>
                      <td className='px-2 py-2'>
                        <Text size='small' variant='inactive'>
                          {e.occurredAt ? formatAcctDate(e.occurredAt) : '—'}
                        </Text>
                      </td>
                      <td className='px-2 py-2 text-right'>
                        <Text size='small' variant='inactive'>
                          {e.attempts ?? 0}
                        </Text>
                      </td>
                      <td className='max-w-sm px-2 py-2'>
                        <Text size='small' className='break-words text-error'>
                          {e.lastError || '—'}
                        </Text>
                      </td>
                      <td className='px-2 py-2'>
                        <div className='flex items-center justify-end gap-2'>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportState>
      </div>
    </div>
  );
}
