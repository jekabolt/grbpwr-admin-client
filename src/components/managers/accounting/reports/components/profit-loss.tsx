import { googletype_Decimal } from 'api/proto-http/admin';
import { Fragment } from 'react';
import Text from 'ui/components/text';
import { useProfitLoss } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import {
  GroupHeader,
  Note,
  STACK_PROFIT,
  STACK_SHADES,
  StackedBar,
  Verdict,
  type StackSegment,
} from '../../components/kit';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, formatMonthLabel, formatPercent, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
  onDrill: (code: string) => void;
};

type DerivedRow = {
  label: string;
  values?: (googletype_Decimal | undefined)[];
  percent?: boolean;
};

// A P&L %-cell (gross/net margin). Not AmountCell — those are money; this is a ratio with a
// trailing " %" and a single decimal. Bold + top border to read as a derived total row.
function PercentCell({ value }: { value?: googletype_Decimal }) {
  return (
    <td className='w-32 min-w-32 whitespace-nowrap border-t border-textColor px-2 py-1 text-right font-medium tabular-nums'>
      {formatPercent(value)}
    </td>
  );
}

// 4.2 P&L: a horizontally scrollable matrix — one column per month (label 'MAR 2026'), a YTD total
// column, sticky header + sticky first column so a 13-month statement never loses its account
// labels (§8.5). Sections are muted subheaders; the seven derived rows (revenue → net margin)
// come straight from totals.* — one value per month, and NO YTD (totals carry no YTD, so that cell
// stays em-dash; §7.2). Contra accounts arrive negative and AmountCell reddens them. Signed single
// amounts — this is where the analyst reads (§8.4). Clicking an account row drills to its ledger.
export function ProfitLossTab({ from, to, onDrill }: Props) {
  const { data, isLoading, isError, refetch } = useProfitLoss(from, to);
  const months = data?.months ?? [];
  const sections = data?.sections ?? [];
  const totals = data?.totals;
  const caveats = data?.caveats ?? [];

  const derived: DerivedRow[] = totals
    ? [
        { label: 'total revenue', values: totals.totalRevenue },
        { label: 'net cogs', values: totals.netCogs },
        { label: 'gross profit', values: totals.grossProfit },
        { label: 'gross margin %', values: totals.grossMarginPct, percent: true },
        { label: 'total opex', values: totals.totalOpex },
        { label: 'operating profit', values: totals.operatingProfit },
        { label: 'total tax', values: totals.totalTax },
        { label: 'net profit after tax', values: totals.netProfitAfterTax },
        { label: 'net margin %', values: totals.netMarginPct, percent: true },
      ]
    : [];

  // Period totals for the "where each € goes" topper: sum each derived row across the range's months
  // (display arithmetic on server figures — the matrix below shows the authoritative per-month values).
  // By construction netProfit = revenue − cogs − opex − tax, so the four shares fill the bar exactly.
  const sumArr = (arr?: (googletype_Decimal | undefined)[]) =>
    (arr ?? []).reduce((a, d) => a + (parseFloat(d?.value ?? '') || 0), 0);
  const pRevenue = sumArr(totals?.totalRevenue);
  const pCogs = sumArr(totals?.netCogs);
  const pOpex = sumArr(totals?.totalOpex);
  const pTax = sumArr(totals?.totalTax);
  const pNet = sumArr(totals?.netProfitAfterTax);
  const pMargin = pRevenue > 0 ? (pNet / pRevenue) * 100 : 0;
  const isLoss = pNet < 0;
  // On a loss the shares are of total SPEND (costs ran over revenue), so there's no profit slice.
  const segBase = isLoss ? pCogs + pOpex + pTax : pRevenue;
  const seg = (label: string, val: number, shade: string): StackSegment => ({
    label,
    pct: segBase > 0 ? Math.round((val / segBase) * 100) : 0,
    shade,
  });
  const segments: StackSegment[] =
    pRevenue > 0
      ? [
          seg('Cost of goods', pCogs, STACK_SHADES[0]),
          seg('Running costs', pOpex, STACK_SHADES[2]),
          seg('Tax', pTax, STACK_SHADES[3]),
          ...(isLoss ? [] : [seg('Profit', pNet, STACK_PROFIT)]),
        ]
      : [];
  const money = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // TSV mirrors the visible matrix: section subheaders, account rows (label + per-month + YTD),
  // then derived rows (per-month, blank YTD). Amounts are raw decimal strings.
  const copyHeaders = ['account', ...months.map(formatMonthLabel), 'YTD'];
  const copyRows: (string | number | undefined)[][] = [];
  sections.forEach((s) => {
    copyRows.push([(s.section ?? '').toUpperCase()]);
    (s.rows ?? []).forEach((r) => {
      copyRows.push([
        `${r.code} ${r.name ?? ''}`,
        ...months.map((_, i) => r.values?.[i]?.value),
        r.total?.value,
      ]);
    });
  });
  derived.forEach((d) => {
    copyRows.push([d.label, ...months.map((_, i) => d.values?.[i]?.value), '']);
  });

  const stickyHead =
    'sticky left-0 z-10 bg-bgColor px-2 py-2 text-left text-textBaseSize uppercase';
  const stickyCell = 'sticky left-0 z-10 whitespace-nowrap bg-bgColor px-2 py-1';

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={months.length === 0}
    >
      <div className='flex flex-col gap-3'>
        <CaveatsNote caveats={caveats} />

        {pRevenue > 0 && (
          <div className='flex flex-col gap-2'>
            <Verdict className='mb-0'>
              {isLoss
                ? `You spent more than you earned — a ${money(Math.abs(pNet))} loss (${Math.abs(
                    pMargin,
                  ).toFixed(1)}% of sales).`
                : `You kept ${money(pNet)} — ${pMargin.toFixed(1)}% of sales.`}
            </Verdict>
            <StackedBar segments={segments} />
            <Note>
              {isLoss
                ? 'shares of every € spent — costs ran over revenue this period'
                : 'where each € of sales ends up · running costs are usually the big slice'}
            </Note>
          </div>
        )}

        <div className='flex items-center justify-between gap-2'>
          <GroupHeader className='mb-0 mt-0 flex-1 border-b-0 pb-0'>
            Full month-by-month breakdown
          </GroupHeader>
          <CopyTableButton headers={copyHeaders} rows={copyRows} filename='profit-loss' />
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead className='sticky top-0 z-20 bg-bgColor'>
              <tr className='border-b border-textColor'>
                <th className={stickyHead}>account</th>
                {months.map((m) => (
                  <th key={m} className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                    {formatMonthLabel(m)}
                  </th>
                ))}
                <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>YTD</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <Fragment key={s.section}>
                  <tr>
                    <td colSpan={months.length + 2} className='px-2 pb-1 pt-3'>
                      <Text variant='uppercase' size='small' className='text-textInactiveColor'>
                        {s.section}
                      </Text>
                    </td>
                  </tr>
                  {(s.rows ?? []).map((r) => (
                    <tr
                      key={r.code}
                      className='group cursor-pointer border-b border-textInactiveColor hover:bg-highlightColor/10'
                      onClick={() => r.code && onDrill(r.code)}
                    >
                      <td className={`${stickyCell} group-hover:bg-highlightColor/10`}>
                        {r.code} — {r.name}
                      </td>
                      {months.map((_, i) => (
                        <AmountCell key={i} value={r.values?.[i]} />
                      ))}
                      <AmountCell value={r.total} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              {derived.map((d) => (
                <tr key={d.label}>
                  <td className={`${stickyCell} border-t border-textColor font-medium`}>
                    {d.label}
                  </td>
                  {months.map((_, i) =>
                    d.percent ? (
                      <PercentCell key={i} value={d.values?.[i]} />
                    ) : (
                      <AmountCell key={i} value={d.values?.[i]} bold />
                    ),
                  )}
                  <td className='border-t border-textColor' />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>
    </ReportState>
  );
}
