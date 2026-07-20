import { ROUTES } from 'constants/routes';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useAccountLedger } from '../../utils/hooks';
import { ACCT_PAGE_SIZE } from '../../utils/constants';
import { AmountCell } from '../../components/amount-cell';
import { EntryDetailModal } from '../../components/entry-detail-modal';
import { formatAcctDate, sourceTypeLabel } from '../../utils/format';
import { CopyTableButton } from './copy-table-button';
import { ReportState } from './report-utils';

type Props = {
  code: string;
  from: string;
  to: string;
};

const HEADERS = ['date', 'entry', 'description', 'source', 'debit', 'credit', 'running balance'];

// order_sale's source_key is the bare order uuid; order_refund's is "uuid:seq" — split on ':' to
// recover the uuid in both (a no-op when there's no colon), same as entry-detail-modal.
function orderUuid(sourceType?: string, sourceKey?: string): string | undefined {
  if (!sourceKey) return undefined;
  return sourceType && sourceType.startsWith('order') ? sourceKey.split(':')[0] : undefined;
}

// 4.4 Ledger drill-down: the first-class destination of every TB/P&L/BS number (§8.2). Opening
// balance in the header, running balance per row, closing balance in the footer of the LAST page —
// all three come from the backend (§8.6 #6). The entry # opens the shared read-only entry detail;
// order sources link out to the order. Two-column Dr/Cr (bookkeeper view, §8.4).
export function LedgerTab({ code, from, to }: Props) {
  const [offset, setOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);

  // Range/account change resets pagination — page 3 of one account is meaningless for another.
  useEffect(() => {
    setOffset(0);
  }, [code, from, to]);

  const { data, isLoading, isError, refetch } = useAccountLedger(code, {
    from,
    to,
    limit: ACCT_PAGE_SIZE,
    offset,
  });

  if (!code) {
    return (
      <div className='flex min-h-[200px] items-center justify-center border border-textInactiveColor p-4 text-center'>
        <Text variant='inactive' size='small'>
          select an account above to view its ledger — or click any row in trial balance, P&amp;L or
          the balance sheet
        </Text>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const rangeFrom = total === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + ACCT_PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + ACCT_PAGE_SIZE < total;

  const copyRows = rows.map((r) => [
    r.occurredAt,
    r.entryId,
    r.description,
    sourceTypeLabel(r.sourceType),
    r.side === 'debit' ? r.amount?.value : undefined,
    r.side === 'credit' ? r.amount?.value : undefined,
    r.runningBalance?.value,
  ]);

  return (
    <>
      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={rows.length === 0}
        emptyHint='no entries for this account in this period — try a wider date range'
      >
        <div className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <Text className='font-medium'>
              {data?.code} — {data?.name}
            </Text>
            <div className='flex items-center gap-4'>
              <div className='flex items-center gap-2'>
                <Text size='small' variant='inactive'>
                  opening balance
                </Text>
                <AmountCell as='span' value={data?.openingBalance} className='font-medium' />
              </div>
              <CopyTableButton headers={HEADERS} rows={copyRows} filename={`ledger-${code}`} />
            </div>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
              <thead className='sticky top-0 z-10 bg-bgColor'>
                <tr className='border-b border-textColor'>
                  <th className='px-2 py-2 text-left text-textBaseSize uppercase'>date</th>
                  <th className='px-2 py-2 text-left text-textBaseSize uppercase'>entry</th>
                  <th className='px-2 py-2 text-left text-textBaseSize uppercase'>description</th>
                  <th className='px-2 py-2 text-left text-textBaseSize uppercase'>source</th>
                  <th className='px-2 py-2 text-right text-textBaseSize uppercase'>debit</th>
                  <th className='px-2 py-2 text-right text-textBaseSize uppercase'>credit</th>
                  <th className='px-2 py-2 text-right text-textBaseSize uppercase'>
                    running balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const uuid = orderUuid(r.sourceType, r.sourceKey);
                  return (
                    <tr key={r.entryId ?? idx} className='border-b border-textInactiveColor'>
                      <td className='whitespace-nowrap px-2 py-1'>
                        {formatAcctDate(r.occurredAt)}
                      </td>
                      <td className='px-2 py-1'>
                        <button
                          type='button'
                          className='underline underline-offset-2 hover:opacity-70'
                          onClick={() => setSelectedEntry(r.entryId ?? null)}
                        >
                          #{r.entryId}
                        </button>
                      </td>
                      <td className='px-2 py-1'>{r.description}</td>
                      <td className='whitespace-nowrap px-2 py-1'>
                        {uuid ? (
                          <Link
                            to={`${ROUTES.orders}/${uuid}`}
                            className='underline underline-offset-2 hover:opacity-70'
                          >
                            {sourceTypeLabel(r.sourceType)}
                          </Link>
                        ) : (
                          <span className='text-textInactiveColor'>
                            {sourceTypeLabel(r.sourceType)}
                          </span>
                        )}
                      </td>
                      <AmountCell value={r.side === 'debit' ? r.amount : undefined} />
                      <AmountCell value={r.side === 'credit' ? r.amount : undefined} />
                      <AmountCell value={r.runningBalance} />
                    </tr>
                  );
                })}
              </tbody>
              {!hasNext && (
                <tfoot>
                  <tr>
                    <td
                      className='border-t border-textColor px-2 py-2 font-medium uppercase'
                      colSpan={6}
                    >
                      closing balance
                    </td>
                    <AmountCell value={data?.closingBalance} bold />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {total > 0 && (
            <div className='flex items-center justify-between'>
              <Text variant='inactive'>
                {rangeFrom}–{rangeTo} of {total}
              </Text>
              <div className='flex gap-2'>
                <Button
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={!hasPrev}
                  onClick={() => setOffset((o) => Math.max(0, o - ACCT_PAGE_SIZE))}
                >
                  prev
                </Button>
                <Button
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={!hasNext}
                  onClick={() => setOffset((o) => o + ACCT_PAGE_SIZE)}
                >
                  next
                </Button>
              </div>
            </div>
          )}
        </div>
      </ReportState>

      <EntryDetailModal
        entryId={selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      />
    </>
  );
}
