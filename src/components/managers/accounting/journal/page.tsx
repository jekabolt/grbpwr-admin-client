import { AcctJournalEntry } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { addMonths, format, startOfMonth } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';
import { AcctSectionHeader } from '../components/section-header';
import { EntryDetailModal } from '../components/entry-detail-modal';
import { Verdict } from '../components/kit';
import { ACCT_PAGE_SIZE } from '../utils/constants';
import { useAcctAccounts, useJournalEntries } from '../utils/hooks';
import { EntriesFilter, JournalFilterState } from './components/entries-filter';
import { EntriesTable } from './components/entries-table';
import { ManualEntryModal } from './components/manual-entry-modal';
import { ReverseConfirm } from './components/reverse-confirm';

// `to` is EXCLUSIVE: ListJournalEntries bounds occurred_at as [from, to) (backend ledger.go),
// so "current month" must end on the 1st of the NEXT month — endOfMonth would silently drop
// entries dated on the month's last day. Same convention as reports/report-utils.tsx.
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(addMonths(startOfMonth(now), 1), 'yyyy-MM-dd'),
  };
}

// Journal (03 §3.2) — the accounting section's landing screen (`/accounting`). The ledger is
// append-only and mostly machine-written (order/material/opex postings arrive from the backend
// worker); this screen lists them, drills into an entry, reverses, and posts manual entries.
export function AcctJournalPage() {
  const { canWrite } = usePermissions();
  const canWriteAcct = canWrite(SECTION.accounting);

  const [filters, setFilters] = useState<JournalFilterState>(() => currentMonthRange());
  const [debounced, setDebounced] = useState<JournalFilterState>(filters);
  const [offset, setOffset] = useState(0);

  // Debounce filter edits (members/page.tsx pattern — no shared useDebounce in the repo). Resets
  // to the first page whenever the query changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(filters);
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data: accountsData } = useAcctAccounts(false);
  const activeAccounts = (accountsData?.accounts ?? []).filter((a) => !a.archived);

  const { data, isLoading, isFetching, isError, refetch } = useJournalEntries({
    from: debounced.from,
    to: debounced.to,
    accountCode: debounced.accountCode,
    sourceType: debounced.sourceType,
    limit: ACCT_PAGE_SIZE,
    offset,
  });
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  const [selectedEntry, setSelectedEntry] = useState<AcctJournalEntry | null>(null);
  const [reverseEntryId, setReverseEntryId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Bonus bridge (03 §3.2): a `?new=1` deep link (Reports agent's "create a manual entry" CTA)
  // opens the modal on mount, then strips the param so a refresh doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const handledNewParam = useRef(false);
  useEffect(() => {
    if (handledNewParam.current) return;
    if (searchParams.get('new') === '1' && canWriteAcct) {
      handledNewParam.current = true;
      setManualOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, canWriteAcct, setSearchParams]);

  const handleFilterChange = (partial: Partial<JournalFilterState>) =>
    setFilters((prev) => ({ ...prev, ...partial }));
  const handleAllTime = () => setFilters((prev) => ({ ...prev, from: '', to: '' }));

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + ACCT_PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + ACCT_PAGE_SIZE < total;

  const canReverse =
    !!selectedEntry &&
    canWriteAcct &&
    !selectedEntry.reversedBy &&
    selectedEntry.sourceType !== 'reversal';

  return (
    <div className='px-2.5'>
      <AcctSectionHeader>
        {canWriteAcct && (
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => setManualOpen(true)}
          >
            + new entry
          </Button>
        )}
      </AcctSectionHeader>

      <div className='flex flex-col gap-4 py-6'>
        <EntriesFilter
          filters={filters}
          accounts={activeAccounts}
          isLoading={isFetching}
          onChange={handleFilterChange}
          onAllTime={handleAllTime}
        />

        {isLoading ? (
          <div className='min-h-40'>
            <Loader />
          </div>
        ) : isError ? (
          <div className='border border-error p-4 text-center'>
            <Text className='mb-3 text-error'>Failed to load entries</Text>
            <Button variant='secondary' size='lg' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className='flex min-h-40 flex-col items-center justify-center gap-3 border border-textInactiveColor p-6 text-center'>
            <Text variant='inactive'>
              no entries in this period — try &quot;all time&quot; or create a manual entry
            </Text>
            <div className='flex gap-2'>
              <Button variant='secondary' size='lg' onClick={handleAllTime}>
                all time
              </Button>
              {canWriteAcct && (
                <Button variant='main' size='lg' onClick={() => setManualOpen(true)}>
                  new entry
                </Button>
              )}
            </div>
            <Text variant='inactive' size='small'>
              postings appear automatically once accounting is enabled on the backend
            </Text>
          </div>
        ) : (
          <>
            {/* Plain-language takeaway above the table — real counts from ListJournalEntries. */}
            <Verdict className='mb-0'>
              {total} {total === 1 ? 'entry' : 'entries'}{' '}
              {debounced.from || debounced.to ? 'this period' : 'all time'}
              {debounced.accountCode || debounced.sourceType ? ' (filtered)' : ''}.
            </Verdict>
            <EntriesTable entries={entries} isLoading={isFetching} onSelect={setSelectedEntry} />
            <div className='flex items-center justify-between'>
              <Text variant='inactive'>
                {from}–{to} of {total}
              </Text>
              <div className='flex gap-2'>
                <Button
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={!hasPrev || isFetching}
                  onClick={() => setOffset((o) => Math.max(0, o - ACCT_PAGE_SIZE))}
                >
                  prev
                </Button>
                <Button
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={!hasNext || isFetching}
                  onClick={() => setOffset((o) => o + ACCT_PAGE_SIZE)}
                >
                  next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <EntryDetailModal
        entryId={selectedEntry?.id ?? null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
        actions={
          canReverse ? (
            <Button
              variant='secondary'
              size='lg'
              onClick={() => setReverseEntryId(selectedEntry?.id ?? null)}
            >
              reverse
            </Button>
          ) : undefined
        }
      />

      <ReverseConfirm
        entryId={reverseEntryId}
        onOpenChange={(open) => {
          if (!open) setReverseEntryId(null);
        }}
        onReversed={() => {
          setReverseEntryId(null);
          setSelectedEntry(null);
        }}
      />

      {manualOpen && <ManualEntryModal onClose={() => setManualOpen(false)} />}
    </div>
  );
}
