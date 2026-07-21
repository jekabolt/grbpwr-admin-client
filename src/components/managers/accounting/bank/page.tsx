import { AcctBankTxn } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { EntryDetailModal } from '../components/entry-detail-modal';
import { Callout, GroupHeader, Note, Pill, RowLine, Verdict } from '../components/kit';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate, formatBase, isNegative } from '../utils/format';
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

// Signed amount + its payment currency, never assuming EUR (Revolut is multi-currency). formatBase
// keeps the wire sign; red when money left the account, matching the module's negative rule.
function AmountWithCcy({ txn, className }: { txn: AcctBankTxn; className?: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        isNegative(txn.amount) && 'text-error',
        className,
      )}
    >
      {formatBase(txn.amount)}
      {txn.currency ? ` ${txn.currency}` : ''}
    </span>
  );
}

// One actionable (unmatched) line as a bordered card — the approved "Line cards" variant. Plain
// language first: which way the money moved and to whom, then the rule's account suggestion, then
// the two real decisions (post → PostBankTxnModal, ignore → ConfirmationModal).
function ToFileCard({
  txn,
  busy,
  onPost,
  onIgnore,
}: {
  txn: AcctBankTxn;
  busy: boolean;
  onPost: () => void;
  onIgnore: () => void;
}) {
  const out = isNegative(txn.amount);
  const who = txn.counterparty || txn.description || 'no counterparty on the line';
  return (
    <Callout>
      <p className='font-bold text-textColor'>
        {out ? 'money out' : 'money in'} <AmountWithCcy txn={txn} /> {out ? '→' : '←'} {who}
      </p>
      <div className='mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]'>
        <span className='uppercase tracking-wide'>
          {txn.bookedAt ? formatAcctDate(txn.bookedAt) : '—'}
        </span>
        {txn.counterparty && txn.description ? (
          <span className='break-words'>{txn.description}</span>
        ) : null}
        {txn.fee?.value ? (
          <span className='uppercase tracking-wide'>
            fee {formatBase(txn.fee)}
            {txn.currency ? ` ${txn.currency}` : ''}
          </span>
        ) : null}
      </div>
      <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
        <span className='text-[11px] uppercase tracking-wide'>
          we think this is:{' '}
          {txn.suggestedAccount ? (
            <span className='font-bold tabular-nums text-textColor'>{txn.suggestedAccount}</span>
          ) : (
            'no suggestion yet'
          )}
        </span>
        <span className='flex items-center gap-2'>
          <Button variant='main' size='sm' disabled={txn.id == null || busy} onClick={onPost}>
            post
          </Button>
          <Button variant='secondary' size='sm' disabled={txn.id == null || busy} onClick={onIgnore}>
            ignore
          </Button>
        </span>
      </div>
    </Callout>
  );
}

// Compact hairline row for a settled line. posted/matched keep the jump to the entry they carry;
// ignored is muted but recoverable — the backend lets any non-posted line be posted, so a misclick
// ignore is reversed by simply posting it (booking flips the state out of ignored).
function HandledRow({
  txn,
  onViewEntry,
  onPost,
}: {
  txn: AcctBankTxn;
  onViewEntry: () => void;
  onPost: () => void;
}) {
  const ignored = txn.state === 'ignored';
  const pillTone = txn.state === 'posted' ? 'ok' : ignored ? 'muted' : 'default';
  return (
    <RowLine
      className={cn(ignored && 'text-labelColor')}
      label={
        <span className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5'>
          <Pill tone={pillTone}>{txn.state || '—'}</Pill>
          <span className='whitespace-nowrap text-[11px] uppercase tracking-wide text-labelColor'>
            {txn.bookedAt ? formatAcctDate(txn.bookedAt) : '—'}
          </span>
          <span className='break-words'>{txn.counterparty || txn.description || '—'}</span>
        </span>
      }
      value={
        <span className='flex items-center gap-3'>
          <AmountWithCcy txn={txn} />
          {hasEntry(txn) ? (
            <button
              type='button'
              className='whitespace-nowrap text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
              onClick={onViewEntry}
            >
              view entry
            </button>
          ) : ignored ? (
            <Button variant='secondary' size='sm' disabled={txn.id == null} onClick={onPost}>
              post
            </Button>
          ) : (
            <span className='text-labelColor'>—</span>
          )}
        </span>
      }
    />
  );
}

// Bank inbox (4.1): the Revolut statement inbox the posting worker can't auto-book. Import a CSV,
// then post each line against a counter-account (Dr/Cr by the signed amount, 1010 the money leg) or
// ignore it (an internal EXCHANGE leg). Import-time substring rules pre-suggest the account. A
// posted line links to the journal entry it produced. Layout is the approved "Line cards" variant:
// a verdict with real counts, a TO FILE group of decision cards, and a compact ALREADY HANDLED list.
export function AcctBankPage() {
  const [state, setState] = useState('');
  const { data, isLoading, isError, refetch } = useBankTxns(state);
  const ignore = useIgnoreBankTxn();

  const [importOpen, setImportOpen] = useState(false);
  const [postTxn, setPostTxn] = useState<AcctBankTxn | null>(null);
  const [ignoreTxn, setIgnoreTxn] = useState<AcctBankTxn | null>(null);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  const txns = data?.txns ?? [];

  // Verdict + groups derive from the loaded page of lines (the same 200-cap the footnote explains),
  // never a second count endpoint. `matched` is auto-linked, so it files under handled, not to-file.
  const toFile = txns.filter((t) => isActionable(t.state));
  const handled = txns.filter((t) => !isActionable(t.state) && t.state !== 'ignored');
  const ignoredRows = txns.filter((t) => t.state === 'ignored');
  const postedCount = txns.filter((t) => t.state === 'posted').length;
  const matchedCount = txns.filter((t) => t.state === 'matched').length;

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
          <div className='flex flex-col gap-1'>
            <Verdict className='mb-0'>
              {toFile.length === 0
                ? 'nothing to file'
                : `${toFile.length} ${toFile.length === 1 ? 'line' : 'lines'} to file`}
              {' — '}
              {postedCount} posted, {ignoredRows.length} ignored
              {matchedCount > 0 ? `, ${matchedCount} auto-matched` : ''}
              {state ? ` (${state} only)` : ''}.
            </Verdict>

            {toFile.length > 0 && (
              <section>
                <GroupHeader>to file</GroupHeader>
                <div className='flex flex-col gap-2'>
                  {toFile.map((t) => {
                    const busy =
                      t.id != null && ignore.isPending && ignore.variables?.id === t.id;
                    return (
                      <ToFileCard
                        key={t.id}
                        txn={t}
                        busy={busy}
                        onPost={() => setPostTxn(t)}
                        onIgnore={() => setIgnoreTxn(t)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {(handled.length > 0 || ignoredRows.length > 0) && (
              <section>
                <GroupHeader>already handled</GroupHeader>
                <div className='flex flex-col'>
                  {handled.map((t) => (
                    <HandledRow
                      key={t.id}
                      txn={t}
                      onViewEntry={() => setViewEntryId(t.matchedEntryId ?? null)}
                      onPost={() => setPostTxn(t)}
                    />
                  ))}
                  {ignoredRows.map((t) => (
                    <HandledRow
                      key={t.id}
                      txn={t}
                      onViewEntry={() => setViewEntryId(t.matchedEntryId ?? null)}
                      onPost={() => setPostTxn(t)}
                    />
                  ))}
                </div>
              </section>
            )}

            {txns.length >= 200 && (
              <Note>
                showing the first 200 lines — post or ignore some, or filter by state, to see more
              </Note>
            )}
          </div>
        </ReportState>

        <BankRules />
      </div>

      {importOpen && <ImportCsvModal onClose={() => setImportOpen(false)} />}
      {postTxn && <PostBankTxnModal txn={postTxn} onClose={() => setPostTxn(null)} />}
      <EntryDetailModal entryId={viewEntryId} onOpenChange={(o) => !o && setViewEntryId(null)} />

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
