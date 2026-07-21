import { AcctBalanceSheetRow, AcctBalanceSheetSection, googletype_Decimal } from 'api/proto-http/admin';
import { useBalanceSheet } from '../../utils/hooks';
import { CheckStrip, TAccount, TColumn, TLine, Verdict } from '../../components/kit';
import { CopyTableButton } from './copy-table-button';
import { formatBase, isNegative } from '../../utils/format';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  asOf: string;
  onDrill: (code: string) => void;
};

function num(d?: googletype_Decimal): number {
  const n = parseFloat(d?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}

// A drillable account line inside a T-account column: the label links to the account's ledger
// (§8.2 no dead-end numbers), the balance reddens when negative (a contra account).
function AcctLine({ row, onDrill }: { row: AcctBalanceSheetRow; onDrill: (c: string) => void }) {
  return (
    <TLine
      label={
        <button
          type='button'
          className='text-left underline-offset-2 hover:underline'
          onClick={() => row.code && onDrill(row.code)}
        >
          {row.code} — {row.name}
        </button>
      }
      value={<span className={isNegative(row.balance) ? 'text-error' : ''}>{formatBase(row.balance)}</span>}
    />
  );
}

// 4.3 Balance Sheet — "Own | owe (T)" (the owner's pick): the classic two-sided view. Left = what we
// own (assets); right = what we owe (liabilities) stacked over the owner's stake (equity). The two
// sides are equal by the accounting identity, surfaced by the Check strip (server-computed
// balanceCheck / balanced — the client never re-derives it, §8.6 #6). The right-column grand total
// is the display sum of the two server subtotals.
export function BalanceSheetTab({ asOf, onDrill }: Props) {
  const { data, isLoading, isError, refetch } = useBalanceSheet(asOf);
  const caveats = data?.caveats ?? [];
  const isEmpty = !data || (!data.assets && !data.liabilities && !data.equity);

  const rightTotal = num(data?.totalLiabilities) + num(data?.totalEquity);
  const rightTotalStr = rightTotal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const copyRows: (string | number | undefined)[][] = [];
  const pushSection = (s?: AcctBalanceSheetSection) => {
    if (!s) return;
    copyRows.push([(s.section ?? '').toUpperCase()]);
    (s.rows ?? []).forEach((r) => copyRows.push([`${r.code} — ${r.name ?? ''}`, r.balance?.value]));
    copyRows.push([`total ${s.section ?? ''}`, s.total?.value]);
  };
  pushSection(data?.assets);
  pushSection(data?.liabilities);
  pushSection(data?.equity);
  copyRows.push(['TOTAL ASSETS', data?.totalAssets?.value]);
  copyRows.push(['TOTAL LIABILITIES', data?.totalLiabilities?.value]);
  copyRows.push(['TOTAL EQUITY', data?.totalEquity?.value]);
  copyRows.push(['BALANCE CHECK', data?.balanceCheck?.value]);

  const assetRows = data?.assets?.rows ?? [];
  const liabRows = data?.liabilities?.rows ?? [];
  const equityRows = data?.equity?.rows ?? [];

  return (
    <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={isEmpty}>
      <div className='flex flex-col gap-4'>
        <CaveatsNote caveats={caveats} />
        <Verdict>{`The business is worth ${formatBase(data?.totalEquity)} to you (what you own minus what you owe).`}</Verdict>
        <div className='flex justify-end'>
          <CopyTableButton headers={['account', 'balance']} rows={copyRows} filename='balance-sheet' />
        </div>

        <div className='max-w-3xl'>
          <TAccount>
            <TColumn title='What we own (assets)'>
              {assetRows.map((r) => (
                <AcctLine key={r.code} row={r} onDrill={onDrill} />
              ))}
              <TLine label='Total assets' value={formatBase(data?.totalAssets)} total />
            </TColumn>
            <TColumn title="What we owe + owner's stake">
              <TLine label='We owe (liabilities)' sub />
              {liabRows.map((r) => (
                <AcctLine key={r.code} row={r} onDrill={onDrill} />
              ))}
              <TLine label='Subtotal owed' value={formatBase(data?.totalLiabilities)} />
              <TLine label="Owner's stake (equity)" sub />
              {equityRows.map((r) => (
                <AcctLine key={r.code} row={r} onDrill={onDrill} />
              ))}
              <TLine label='Subtotal stake' value={formatBase(data?.totalEquity)} />
              <TLine label='Total owed + stake' value={rightTotalStr} total />
            </TColumn>
          </TAccount>

          <CheckStrip
            tone={data?.balanced ? 'ok' : 'bad'}
            label={data?.balanced ? 'It balances' : 'Out of balance'}
            value={
              data?.balanced
                ? `✓ ${formatBase(data?.totalAssets)} = ${rightTotalStr}`
                : formatBase(data?.balanceCheck)
            }
          />
        </div>
      </div>
    </ReportState>
  );
}
