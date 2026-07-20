import { googletype_Decimal } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { useFrs105Accounts } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

type Line = { label: string; value?: googletype_Decimal; bold?: boolean; indent?: boolean };

// FRS 105 UK micro-entity accounts (04, statutory-exports track). A DRAFT re-grouping of the ledger:
// the Income Statement over [from, to) and the Statement of Financial Position as at `to`. Figures are
// in the ledger base currency — the response caveats flag that a filing-ready UK Ltd set needs GBP +
// isolation of the UK entity's transactions.
export function Frs105Tab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useFrs105Accounts(from, to);

  const income: Line[] = data
    ? [
        { label: 'Turnover', value: data.turnover },
        { label: 'Cost of sales', value: data.costOfSales },
        { label: 'Gross profit', value: data.grossProfit, bold: true },
        { label: 'Administrative expenses', value: data.administrativeExpenses },
        { label: 'Depreciation', value: data.depreciation },
        { label: 'Operating profit', value: data.operatingProfit, bold: true },
        { label: 'Tax', value: data.tax },
        { label: 'Profit for the year', value: data.profitForYear, bold: true },
      ]
    : [];

  const position: Line[] = data
    ? [
        { label: 'Fixed assets (net book value)', value: data.fixedAssets },
        { label: 'Current assets', value: data.currentAssets },
        { label: 'Creditors: within one year', value: data.creditorsWithinYear },
        { label: 'Net current assets', value: data.netCurrentAssets, bold: true },
        { label: 'Total assets less current liabilities', value: data.totalAssetsLessCurrentLiab, bold: true },
        { label: 'Creditors: after more than one year', value: data.creditorsAfterYear },
        { label: 'Net assets', value: data.netAssets, bold: true },
        { label: 'Capital and reserves', value: data.capitalAndReserves, bold: true },
      ]
    : [];

  const copyHeaders = ['statement', 'line', 'amount'];
  const copyRows: (string | number | undefined)[][] = [
    ...income.map((l) => ['income', l.label, l.value?.value ?? '0']),
    ...position.map((l) => ['position', l.label, l.value?.value ?? '0']),
  ];

  return (
    <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={!data}>
      <div className='flex flex-col gap-6'>
        <div className='border border-textInactiveColor p-3'>
          <Text variant='uppercase' size='small' className='font-medium'>
            draft — for accountant finalisation
          </Text>
          <div className='mt-1'>
            <CaveatsNote caveats={data?.caveats ?? []} />
          </div>
        </div>

        <div className='flex justify-end'>
          <CopyTableButton headers={copyHeaders} rows={copyRows} filename='frs105-accounts' />
        </div>

        <Frs105Section
          title={`Income statement · figures in ${data?.currency ?? ''}`}
          lines={income}
        />
        <Frs105Section title={`Statement of financial position · as at end of period`} lines={position} />
      </div>
    </ReportState>
  );
}

function Frs105Section({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <section className='flex flex-col gap-2'>
      <Text variant='uppercase' className='font-medium'>
        {title}
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-max border-collapse'>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className='border-b border-textInactiveColor'>
                <td
                  className={`whitespace-nowrap px-2 py-1${l.bold ? ' border-t border-textColor font-medium' : ''}`}
                >
                  {l.label}
                </td>
                <AmountCell value={l.value} bold={l.bold} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
