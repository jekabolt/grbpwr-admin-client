import { googletype_Decimal } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { AmountCell } from '../../components/amount-cell';
import { Callout, GroupHeader, RowLine, StatGrid, StatTile, Verdict } from '../../components/kit';
import { formatBase, isNegative } from '../../utils/format';
import { useFrs105Accounts } from '../../utils/hooks';
import { CopyTableButton } from './copy-table-button';
import { FixedAssetsPanel } from './fixed-assets';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

type Line = { label: string; value?: googletype_Decimal; bold?: boolean; total?: boolean };

// FRS 105 UK micro-entity accounts (04, statutory-exports track). A DRAFT re-grouping of the ledger:
// a plain-language summary (verdict + three tiles) on top, then the statutory Income Statement over
// [from, to) and the Statement of Financial Position as at `to` beneath. Figures are in the ledger
// base currency — the response caveats flag that a filing-ready UK Ltd set needs GBP + isolation of
// the UK entity's transactions.
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
        { label: 'Profit for the year', value: data.profitForYear, total: true },
      ]
    : [];

  const position: Line[] = data
    ? [
        { label: 'Fixed assets (net book value)', value: data.fixedAssets },
        { label: 'Current assets', value: data.currentAssets },
        { label: 'Creditors: within one year', value: data.creditorsWithinYear },
        { label: 'Net current assets', value: data.netCurrentAssets, bold: true },
        {
          label: 'Total assets less current liabilities',
          value: data.totalAssetsLessCurrentLiab,
          bold: true,
        },
        { label: 'Creditors: after more than one year', value: data.creditorsAfterYear },
        { label: 'Net assets', value: data.netAssets, total: true },
        { label: 'Capital and reserves', value: data.capitalAndReserves, bold: true },
      ]
    : [];

  const copyHeaders = ['statement', 'line', 'amount'];
  const copyRows: (string | number | undefined)[][] = [
    ...income.map((l) => ['income', l.label, l.value?.value ?? '0']),
    ...position.map((l) => ['position', l.label, l.value?.value ?? '0']),
  ];

  const madeLoss = isNegative(data?.profitForYear);

  return (
    <div className='flex flex-col gap-6'>
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={!data}>
        <div className='flex flex-col gap-6'>
          <div>
            <Verdict>
              The company {madeLoss ? 'made a loss of' : 'made'}{' '}
              {formatBase(data?.profitForYear)} this year and is worth{' '}
              {formatBase(data?.netAssets)}.
            </Verdict>
            <StatGrid>
              <StatTile
                label='Turnover'
                value={formatBase(data?.turnover)}
                sub={`figures in ${data?.currency ?? '—'}`}
              />
              <StatTile
                label='Profit for the year'
                value={formatBase(data?.profitForYear)}
                tone={madeLoss ? 'down' : 'up'}
                sub='after tax'
              />
              <StatTile
                label='Net assets'
                value={formatBase(data?.netAssets)}
                sub='assets minus liabilities'
              />
            </StatGrid>
          </div>

          <Callout>
            <Text variant='uppercase' size='small' className='font-medium'>
              draft — for accountant finalisation
            </Text>
            <div className='mt-1'>
              <CaveatsNote caveats={data?.caveats ?? []} />
            </div>
          </Callout>

          <section className='flex flex-col gap-2'>
            <GroupHeader className='mt-0'>Statutory format (for filing)</GroupHeader>
            <div className='flex justify-end'>
              <CopyTableButton headers={copyHeaders} rows={copyRows} filename='frs105-accounts' />
            </div>
            <Frs105Statement
              title={`Income statement · figures in ${data?.currency ?? ''}`}
              lines={income}
            />
            <Frs105Statement
              title='Statement of financial position · as at end of period'
              lines={position}
            />
          </section>
        </div>
      </ReportState>

      <FixedAssetsPanel from={from} to={to} />
    </div>
  );
}

function Frs105Statement({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <div>
      <GroupHeader>{title}</GroupHeader>
      {lines.map((l) => (
        <RowLine
          key={l.label}
          label={l.label}
          value={<AmountCell as='span' value={l.value} />}
          bold={l.bold}
          total={l.total}
        />
      ))}
    </div>
  );
}
