import { AcctReconBlock, AcctReconItem, googletype_Decimal } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { useReconciliation } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
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
  | 'vat';

const BLOCKS: { key: ReconKey; label: string }[] = [
  { key: 'revenue', label: 'revenue' },
  { key: 'fees', label: 'fees' },
  { key: 'cogs', label: 'cogs' },
  { key: 'materials', label: 'materials' },
  { key: 'finishedGoods', label: 'finished goods' },
  { key: 'pending', label: 'pending' },
  { key: 'unpostedMovements', label: 'unposted movements' },
  { key: 'vat', label: 'vat' },
];

// A delta within a cent reads as "matched" (§8.5). NaN (missing delta) → treated as 0 → matched.
function isMatched(delta?: googletype_Decimal): boolean {
  const n = parseFloat(delta?.value ?? '0');
  return Number.isFinite(n) && Math.abs(n) < 0.01;
}

function LedgerVsOp({ label, value }: { label: string; value?: googletype_Decimal }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <Text size='small' variant='inactive'>
        {label}
      </Text>
      <AmountCell as='span' value={value} className='text-small' />
    </div>
  );
}

// A recon item's `ref` is an operational identity. When it looks like a uuid (order/movement) AND
// the block is an order-bearing one (not materials / unposted movements), link to the order;
// otherwise it's plain text (§4.5).
function ReconItemRow({ item, linkOrders }: { item: AcctReconItem; linkOrders: boolean }) {
  const ref = item.ref ?? '';
  const looksUuid = ref.length > 20 || ref.includes('-');
  const uuid = ref.split(':')[0];
  const linkable = linkOrders && looksUuid && Boolean(uuid);
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

function ReconCard({
  block,
  label,
  linkOrders,
  isFinishedGoods,
  isPending,
}: {
  block?: AcctReconBlock;
  label: string;
  linkOrders: boolean;
  isFinishedGoods: boolean;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items = block?.items ?? [];
  const totalCount = block?.totalCount ?? items.length;
  const moreCount = Math.max(0, totalCount - items.length);
  const matched = isMatched(block?.delta);

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='uppercase' className='font-medium'>
          {block?.name || label}
        </Text>
        {matched ? (
          <span className='whitespace-nowrap text-textBaseSize uppercase text-success'>
            matched
          </span>
        ) : (
          <AmountCell as='span' value={block?.delta} className='text-error' />
        )}
      </div>

      <div className='flex flex-col gap-1'>
        <LedgerVsOp label='ledger' value={block?.ledger} />
        <LedgerVsOp label='operational' value={block?.operational} />
        <LedgerVsOp label='delta' value={block?.delta} />
      </div>

      {isFinishedGoods && (
        <Text size='small' variant='inactive'>
          drift is expected (live cost_price vs sale-time snapshots)
        </Text>
      )}

      {items.length > 0 && (
        <div className='flex flex-col gap-1'>
          <button
            type='button'
            className='w-fit text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'hide details' : `details (${totalCount})`}
          </button>
          {open && (
            <div className='flex flex-col gap-1.5 border-t border-textInactiveColor pt-2'>
              {items.map((it, i) => (
                <ReconItemRow key={i} item={it} linkOrders={linkOrders} />
              ))}
              {moreCount > 0 && (
                <Text size='small' variant='inactive'>
                  and {moreCount} more
                </Text>
              )}
            </div>
          )}
        </div>
      )}

      {isPending && (
        <Link
          to={`${ROUTES.accounting}?new=1`}
          className='w-fit text-textBaseSize uppercase underline underline-offset-2 hover:opacity-70'
        >
          create manual entry
        </Link>
      )}
    </div>
  );
}

// 4.5 Reconciliation: the operational ritual before a month close. Seven named blocks compare the
// ledger figure against operational truth; a non-zero delta (outside finished_goods, where drift is
// expected) means the two diverged. Blocks are cards with drill-down items — every number stays
// clickable to its source (§8.2). Top-of-screen link into periods; a create-manual-entry link on
// pending routes to the journal's new-entry modal (?new=1, owned by the journal screen).
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
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {BLOCKS.map(({ key, label }) => (
            <ReconCard
              key={key}
              block={data?.[key]}
              label={label}
              linkOrders={key !== 'materials' && key !== 'unpostedMovements' && key !== 'vat'}
              isFinishedGoods={key === 'finishedGoods'}
              isPending={key === 'pending'}
            />
          ))}
        </div>
      </ReportState>
    </div>
  );
}
