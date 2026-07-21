import { AcctReconBlock, AcctReconItem, googletype_Decimal } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { AmountCell } from '../../components/amount-cell';
import { Note, Pill } from '../../components/kit';
import { useReconciliation } from '../../utils/hooks';
import { ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

type ReconKey =
  | 'revenue'
  | 'fees'
  | 'cogs'
  | 'materials'
  | 'finishedGoods'
  | 'pending'
  | 'unpostedMovements'
  | 'vat'
  | 'prepayments'
  | 'shipping'
  | 'bank';

const BLOCKS: { key: ReconKey; label: string }[] = [
  { key: 'revenue', label: 'revenue' },
  { key: 'fees', label: 'fees' },
  { key: 'cogs', label: 'cogs' },
  { key: 'materials', label: 'materials' },
  { key: 'finishedGoods', label: 'finished goods' },
  { key: 'pending', label: 'pending' },
  { key: 'unpostedMovements', label: 'unposted movements' },
  { key: 'vat', label: 'vat' },
  { key: 'prepayments', label: 'prepayments' },
  { key: 'shipping', label: 'shipping' },
  { key: 'bank', label: 'bank' },
];

// A delta within a cent reads as "matched" (§8.5). NaN (missing delta) → treated as 0 → matched.
function isMatched(delta?: googletype_Decimal): boolean {
  const n = parseFloat(delta?.value ?? '0');
  return Number.isFinite(n) && Math.abs(n) < 0.01;
}

const TH = 'whitespace-nowrap px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-labelColor';

// A recon item's `ref` is an operational identity. Order-bearing blocks carry the order reference
// (always `ORD-…`; order_refund events suffix it `:seq`) — only those deep-link to the order. Every
// other ref renders as plain text: opex months (`2026-07`), production-run / movement ids, and
// non-order event keys. We match the `ORD-` prefix rather than a loose "contains a dash / is long"
// heuristic, which used to link e.g. the opex month `2026-07` to a non-existent /orders/2026-07 (§4.5).
function ReconItemRow({ item, linkOrders }: { item: AcctReconItem; linkOrders: boolean }) {
  const ref = item.ref ?? '';
  const uuid = ref.split(':')[0];
  const linkable = linkOrders && uuid.startsWith('ORD-');
  return (
    <div className='flex items-start justify-between gap-2'>
      <div className='flex min-w-0 flex-col'>
        {linkable ? (
          <Link
            to={`${ROUTES.orders}/${uuid}`}
            className='truncate text-small underline underline-offset-2 hover:opacity-70'
          >
            {uuid}
          </Link>
        ) : ref ? (
          <span className='truncate text-small'>{ref}</span>
        ) : null}
        {item.label ? (
          <Text size='small' variant='inactive' className='truncate'>
            {item.label}
          </Text>
        ) : null}
      </div>
      <AmountCell as='span' value={item.amount} className='text-small' />
    </div>
  );
}

// One area of the reconciliation table: books vs. real-life vs. difference, a status pill, and an
// expandable drill-down row (the item sample) so every number stays clickable to its source (§8.2).
function ReconRow({
  block,
  label,
  blockKey,
  linkOrders,
}: {
  block?: AcctReconBlock;
  label: string;
  blockKey: ReconKey;
  linkOrders: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items = block?.items ?? [];
  const totalCount = block?.totalCount ?? items.length;
  const moreCount = Math.max(0, totalCount - items.length);
  const matched = isMatched(block?.delta);
  const isPending = blockKey === 'pending';
  const isFinishedGoods = blockKey === 'finishedGoods';

  return (
    <>
      <tr className='border-b border-textInactiveColor align-top last:border-b-0'>
        <td className='px-2.5 py-2'>
          <div className='flex flex-col gap-1'>
            <span className='whitespace-nowrap font-medium uppercase'>{block?.name || label}</span>
            {items.length > 0 && (
              <button
                type='button'
                className='w-fit whitespace-nowrap text-[10px] uppercase tracking-wide text-labelColor underline underline-offset-2 hover:text-textColor'
                onClick={() => setOpen((o) => !o)}
              >
                {open ? 'hide details' : `details (${totalCount})`}
              </button>
            )}
            {isPending && (
              <Link
                to={`${ROUTES.accounting}?new=1`}
                className='w-fit whitespace-nowrap text-[10px] uppercase tracking-wide underline underline-offset-2 hover:opacity-70'
              >
                create manual entry
              </Link>
            )}
          </div>
        </td>
        <AmountCell value={block?.ledger} className='px-2.5 py-2' />
        <AmountCell value={block?.operational} className='px-2.5 py-2' />
        <AmountCell
          value={block?.delta}
          className={cn('px-2.5 py-2', !matched && 'font-medium text-error')}
        />
        <td className='px-2.5 py-2 text-right'>
          {matched ? (
            <Pill tone='ok'>matched</Pill>
          ) : (
            <Pill tone='warn'>
              {isFinishedGoods ? 'drift' : isPending ? 'to post' : 'mismatch'}
            </Pill>
          )}
        </td>
      </tr>
      {open && items.length > 0 && (
        <tr className='border-b border-textInactiveColor bg-bgSecondary/40 last:border-b-0'>
          <td colSpan={5} className='px-2.5 py-2'>
            <div className='flex flex-col gap-1.5'>
              {items.map((it, i) => (
                <ReconItemRow key={i} item={it} linkOrders={linkOrders} />
              ))}
              {moreCount > 0 && (
                <Text size='small' variant='inactive'>
                  and {moreCount} more
                </Text>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// 4.5 Reconciliation: the operational ritual before a month close, as one table ("Table" variant) —
// one row per area, in-the-books (ledger) vs. in-real-life (operational) vs. difference, a status
// pill (matched / drift / to post / mismatch), and an expandable drill-down under each row. A
// non-zero delta (outside finished_goods, where drift is expected) means the two diverged.
// Top-of-screen link into periods; a create-manual-entry link on pending routes to the journal's
// new-entry modal (?new=1, owned by the journal screen).
export function ReconciliationTab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useReconciliation(from, to);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <Text size='small' variant='inactive'>
          reconcile before closing the month
        </Text>
        <Link
          to={ROUTES.accountingPeriods}
          className='text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
        >
          go to periods →
        </Link>
      </div>

      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!data}
        emptyHint='no reconciliation data for this period — check the date range'
      >
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse border border-textInactiveColor'>
            <thead>
              <tr className='border-b border-textInactiveColor bg-bgSecondary'>
                <th className={cn(TH, 'text-left')}>area</th>
                <th className={cn(TH, 'text-right')}>in the books (ledger)</th>
                <th className={cn(TH, 'text-right')}>in real life (operational)</th>
                <th className={cn(TH, 'text-right')}>difference</th>
                <th className={cn(TH, 'text-right')}>status</th>
              </tr>
            </thead>
            <tbody>
              {BLOCKS.map(({ key, label }) => (
                <ReconRow
                  key={key}
                  block={data?.[key]}
                  label={label}
                  blockKey={key}
                  linkOrders={key !== 'materials' && key !== 'unpostedMovements' && key !== 'vat'}
                />
              ))}
            </tbody>
          </table>
        </div>
        <Note>finished goods drift is expected — live cost_price vs sale-time snapshots</Note>
      </ReportState>
    </div>
  );
}
