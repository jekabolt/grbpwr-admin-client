import { AcctBankTxn } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { AmountCell } from '../components/amount-cell';
import { EntryDetailModal } from '../components/entry-detail-modal';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate } from '../utils/format';
import { useBankTxns, useIgnoreBankTxn } from '../utils/hooks';
import { BankRules } from './components/bank-rules';
import { ImportCsvModal } from './components/import-csv-modal';
import { PostBankTxnModal } from './components/post-bank-txn-modal';

// State filter (ListBankTxnsRequest.state; '' = all). A posted line still shows so an operator can
// jump to its entry; ignored stays visible so a mistaken ignore can be found again.
const STATES = [
  { value: '', label: 'all' },
  { value: 'unmatched', label: 'unmatched' },
  { value: 'matched', label: 'matched' },
  { value: 'posted', label: 'posted' },
  { value: 'ignored', label: 'ignored' },
];

// A line still awaiting a decision — only `unmatched` gets post + ignore. `matched` is reserved for
// auto-match (linked to an existing entry via matched_entry_id, not yet written by any backend path);
// offering "post" on it would book a SECOND entry, since PostBankTxn only refuses an already-`posted`
// line. So `matched` is treated as terminal-with-an-entry (view entry), never actionable.
function isActionable(state?: string): boolean {
  return state === 'unmatched';
}

// Lines that already carry a journal entry to jump to: posted (booked here) and matched (auto-linked).
function hasEntry(t: AcctBankTxn): boolean {
  return (t.state === 'posted' || t.state === 'matched') && !!t.matchedEntryId;
}

function StateBadge({ state }: { state?: string }) {
  const tone =
    state === 'posted'
      ? 'text-success'
      : state === 'ignored'
        ? 'text-textInactiveColor'
        : 'text-textColor';
  return <span className={cn('whitespace-nowrap text-textBaseSize uppercase', tone)}>{state || '—'}</span>;
}

// Bank inbox (4.1): the Revolut statement inbox the posting worker can't auto-book. Import a CSV,
// then post each line against a counter-account (Dr/Cr by the signed amount, 1010 the money leg) or
// ignore it (an internal EXCHANGE leg). Import-time substring rules pre-suggest the account. A
// posted line links to the journal entry it produced. Table (not cards): a statement is canonically
// a scannable ledger, matching the journal / events screens.
export function AcctBankPage() {
  const [state, setState] = useState('');
  const { data, isLoading, isError, refetch } = useBankTxns(state);
  const ignore = useIgnoreBankTxn();

  const [importOpen, setImportOpen] = useState(false);
  const [postTxn, setPostTxn] = useState<AcctBankTxn | null>(null);
  const [ignoreTxn, setIgnoreTxn] = useState<AcctBankTxn | null>(null);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  const txns = data?.txns ?? [];

  const confirmIgnore = () => {
    const id = ignoreTxn?.id;
    if (id == null) return;
    ignore.mutate(
      { id },
      {
        onSuccess: () => setIgnoreTxn(null),
        onError: () => setIgnoreTxn(null),
      },
    );
  };

  return (
    <div className='px-2.5'>
      <AcctSectionHeader>
        <Button variant='main' size='lg' onClick={() => setImportOpen(true)}>
          import CSV
        </Button>
      </AcctSectionHeader>

      <div className='flex flex-col gap-4 py-6'>
        <Text variant='inactive' size='small'>
          bank statement lines the posting worker could not auto-book — post each against a
          counter-account, or ignore an internal transfer leg
        </Text>

        <div className='flex flex-wrap items-center gap-1'>
          {STATES.map((s) => {
            const active = s.value === state;
            return (
              <button
                key={s.value || 'all'}
                type='button'
                onClick={() => setState(s.value)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border px-3 py-1.5 text-textBaseSize uppercase transition-colors',
                  active
                    ? 'border-textColor text-textColor'
                    : 'border-textInactiveColor text-textInactiveColor hover:text-textColor',
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <ReportState
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          isEmpty={txns.length === 0}
          emptyHint='no bank lines in this state — import a statement to start'
        >
          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
              <thead className='h-10 bg-textInactiveColor'>
                <tr className='border-b border-textInactiveColor'>
                  <th className='px-2 text-left text-textBaseSize uppercase'>date</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>description</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>counterparty</th>
                  <th className='px-2 text-right text-textBaseSize uppercase'>amount</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>ccy</th>
                  <th className='px-2 text-right text-textBaseSize uppercase'>fee</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>state</th>
                  <th className='px-2 text-left text-textBaseSize uppercase'>suggested</th>
                  <th className='px-2 text-right text-textBaseSize uppercase'>action</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const id = t.id;
                  const rowBusy = id != null && ignore.isPending && ignore.variables?.id === id;
                  return (
                    <tr key={id} className='border-b border-textInactiveColor align-top'>
                      <td className='whitespace-nowrap px-2 py-2'>
                        <Text size='small' variant='inactive'>
                          {t.bookedAt ? formatAcctDate(t.bookedAt) : '—'}
                        </Text>
                      </td>
                      <td className='max-w-sm px-2 py-2'>
                        <Text size='small' className='break-words'>
                          {t.description || '—'}
                        </Text>
                      </td>
                      <td className='max-w-[12rem] px-2 py-2'>
                        <Text size='small' variant='inactive' className='break-words'>
                          {t.counterparty || '—'}
                        </Text>
                      </td>
                      <AmountCell value={t.amount} className='px-2 py-2' />
                      <td className='px-2 py-2'>
                        <Text size='small' variant='inactive'>
                          {t.currency || '—'}
                        </Text>
                      </td>
                      <AmountCell value={t.fee} className='px-2 py-2' />
                      <td className='px-2 py-2'>
                        <StateBadge state={t.state} />
                      </td>
                      <td className='px-2 py-2'>
                        <Text size='small' variant='inactive' className='tabular-nums'>
                          {t.suggestedAccount || '—'}
                        </Text>
                      </td>
                      <td className='px-2 py-2'>
                        <div className='flex items-center justify-end gap-2'>
                          {isActionable(t.state) ? (
                            <>
                              <Button
                                variant='main'
                                size='sm'
                                disabled={id == null || rowBusy}
                                onClick={() => setPostTxn(t)}
                              >
                                post
                              </Button>
                              <Button
                                variant='secondary'
                                size='sm'
                                disabled={id == null || rowBusy}
                                onClick={() => setIgnoreTxn(t)}
                              >
                                ignore
                              </Button>
                            </>
                          ) : hasEntry(t) ? (
                            <button
                              type='button'
                              className='text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
                              onClick={() => setViewEntryId(t.matchedEntryId ?? null)}
                            >
                              view entry
                            </button>
                          ) : t.state === 'ignored' ? (
                            // Recovery: an ignore is a deliberate "don't book", but a misclick must
                            // be reversible. The backend lets any non-posted line be posted, so offer
                            // post here — booking it flips the state out of ignored.
                            <Button
                              variant='secondary'
                              size='sm'
                              disabled={id == null}
                              onClick={() => setPostTxn(t)}
                            >
                              post
                            </Button>
                          ) : (
                            <Text size='small' variant='inactive'>
                              —
                            </Text>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {txns.length >= 200 && (
              <Text variant='inactive' size='small' className='pt-2'>
                showing the first 200 lines — post or ignore some, or filter by state, to see more
              </Text>
            )}
          </div>
        </ReportState>

        <BankRules />
      </div>

      {importOpen && <ImportCsvModal onClose={() => setImportOpen(false)} />}
      {postTxn && <PostBankTxnModal txn={postTxn} onClose={() => setPostTxn(null)} />}
      <EntryDetailModal
        entryId={viewEntryId}
        onOpenChange={(o) => !o && setViewEntryId(null)}
      />

      <ConfirmationModal
        open={ignoreTxn !== null}
        onOpenChange={(o) => !o && setIgnoreTxn(null)}
        onConfirm={confirmIgnore}
        closeOnConfirm={false}
        title='Ignore this line?'
        confirmLabel={ignore.isPending ? 'ignoring…' : 'ignore'}
        confirmDisabled={ignore.isPending}
      >
        <Text size='small'>
          Marks the line deliberately not booked (e.g. an internal transfer leg). It stays visible
          under the “ignored” filter.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
