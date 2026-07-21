import { useTrialBalance } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { BalancedBadge } from '../../components/balanced-badge';
import { CheckStrip, Verdict } from '../../components/kit';
import { formatBase } from '../../utils/format';
import { CopyTableButton } from './copy-table-button';
import { ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
  onDrill: (code: string) => void;
};

const HEADERS = ['code', 'name', 'section', 'debit', 'credit', 'balance'];

// 4.1 Trial Balance: per-account turnover (debit/credit) + closing balance over [from, to), with
// the ΣDr==ΣCr invariant surfaced as a badge. Two-column Dr/Cr — this is where the bookkeeper
// thinks (§8.4). Every row drills to that account's ledger (§8.2 no-dead-end-numbers).
export function TrialBalanceTab({ from, to, onDrill }: Props) {
  const { data, isLoading, isError, refetch } = useTrialBalance(from, to);
  const rows = data?.rows ?? [];

  const copyRows = rows.map((r) => [
    r.code,
    r.name,
    r.section,
    r.debit?.value,
    r.credit?.value,
    r.balance?.value,
  ]);

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={rows.length === 0}
    >
      <div className='flex flex-col gap-2'>
        <Verdict>
          {data?.balanced
            ? `In balance — total debits equal total credits (${formatBase(data?.totalDebit)}). Nothing's lost.`
            : 'Out of balance — total debits and credits differ. Something needs a look.'}
        </Verdict>
        <div className='flex justify-end'>
          <CopyTableButton headers={HEADERS} rows={copyRows} filename='trial-balance' />
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
            <thead className='sticky top-0 z-10 bg-bgColor'>
              <tr className='border-b border-textColor'>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>code</th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>name</th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>section</th>
                <th className='px-2 py-2 text-right text-textBaseSize uppercase'>debit</th>
                <th className='px-2 py-2 text-right text-textBaseSize uppercase'>credit</th>
                <th className='px-2 py-2 text-right text-textBaseSize uppercase'>balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.code}
                  className='cursor-pointer border-b border-textInactiveColor hover:bg-highlightColor/10'
                  onClick={() => r.code && onDrill(r.code)}
                >
                  <td className='whitespace-nowrap px-2 py-1'>{r.code}</td>
                  <td className='px-2 py-1'>{r.name}</td>
                  <td className='px-2 py-1 text-textInactiveColor'>{r.section}</td>
                  <AmountCell value={r.debit} />
                  <AmountCell value={r.credit} />
                  <AmountCell value={r.balance} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  className='border-t border-textColor px-2 py-2 font-medium uppercase'
                  colSpan={3}
                >
                  totals
                </td>
                <AmountCell value={data?.totalDebit} bold />
                <AmountCell value={data?.totalCredit} bold />
                <td className='border-t border-textColor px-2 py-2 text-right'>
                  <BalancedBadge balanced={data?.balanced} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <CheckStrip
          tone={data?.balanced ? 'ok' : 'bad'}
          label={data?.balanced ? 'In balance' : 'Out of balance'}
          value={
            data?.balanced
              ? '✓ debits = credits'
              : `${formatBase(data?.totalDebit)} vs ${formatBase(data?.totalCredit)}`
          }
        />
      </div>
    </ReportState>
  );
}
