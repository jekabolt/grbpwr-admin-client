import { AcctBalanceSheetSection } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { useBalanceSheet } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { BalancedBadge } from '../../components/balanced-badge';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  asOf: string;
  onDrill: (code: string) => void;
};

// One BS grouping (assets / liabilities / equity): account rows (code · name · signed balance) with
// a bordered subtotal. `Current Period Net Profit` already sits inside equity.rows (backend),
// so the separate netProfitRow field is intentionally NOT rendered — rendering both double-counts
// equity (§7.2). Every account row drills to its ledger (§8.2).
function Section({
  section,
  onDrill,
}: {
  section?: AcctBalanceSheetSection;
  onDrill: (code: string) => void;
}) {
  if (!section) return null;
  const rows = section.rows ?? [];
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='uppercase' size='small' className='text-textInactiveColor'>
        {section.section}
      </Text>
      <table className='w-full border-collapse'>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.code}
              className='cursor-pointer border-b border-textInactiveColor hover:bg-highlightColor/10'
              onClick={() => r.code && onDrill(r.code)}
            >
              <td className='w-20 whitespace-nowrap px-2 py-1'>{r.code}</td>
              <td className='px-2 py-1'>{r.name}</td>
              <AmountCell value={r.balance} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className='border-t border-textColor px-2 py-1 font-medium uppercase' colSpan={2}>
              total {section.section}
            </td>
            <AmountCell value={section.total} bold />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// 4.3 Balance Sheet: assets / liabilities / equity stacked vertically as of a single date, then a
// footer with TOTAL ASSETS, the liabilities & equity component totals, and the backend-computed
// balance check + badge. The client never sums liabilities+equity itself (§8.6 #6) — balanceCheck
// and `balanced` come from the server, so the A = L + E identity is shown, not recomputed.
export function BalanceSheetTab({ asOf, onDrill }: Props) {
  const { data, isLoading, isError, refetch } = useBalanceSheet(asOf);
  const caveats = data?.caveats ?? [];
  const isEmpty = !data || (!data.assets && !data.liabilities && !data.equity);

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

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={isEmpty}
    >
      <div className='flex flex-col gap-4'>
        <CaveatsNote caveats={caveats} />
        <div className='flex justify-end'>
          <CopyTableButton
            headers={['account', 'balance']}
            rows={copyRows}
            filename='balance-sheet'
          />
        </div>

        <div className='flex max-w-2xl flex-col gap-5'>
          <Section section={data?.assets} onDrill={onDrill} />
          <Section section={data?.liabilities} onDrill={onDrill} />
          <Section section={data?.equity} onDrill={onDrill} />

          <div className='flex flex-col gap-2 border-t-2 border-textColor pt-3'>
            <div className='flex items-center justify-between'>
              <Text className='font-medium uppercase'>total assets</Text>
              <AmountCell as='span' value={data?.totalAssets} className='font-medium' />
            </div>
            <div className='flex items-center justify-between'>
              <Text className='uppercase'>total liabilities</Text>
              <AmountCell as='span' value={data?.totalLiabilities} />
            </div>
            <div className='flex items-center justify-between'>
              <Text className='uppercase'>total equity</Text>
              <AmountCell as='span' value={data?.totalEquity} />
            </div>
            <div className='flex items-center justify-between border-t border-textColor pt-2'>
              <Text className='font-medium uppercase'>balance check</Text>
              <div className='flex items-center gap-3'>
                <AmountCell as='span' value={data?.balanceCheck} className='font-medium' />
                <BalancedBadge balanced={data?.balanced} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ReportState>
  );
}
