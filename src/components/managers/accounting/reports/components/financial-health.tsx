import { AcctFinancialHealthRow, googletype_Decimal } from 'api/proto-http/admin';
import { useFinancialHealth } from '../../utils/hooks';
import { GroupHeader, StatGrid, StatTile, Verdict } from '../../components/kit';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

// A ratio value carries its own display unit ("%", "x"/"×", "days", the base currency, or ""). The
// backend computes the figure (§8.6 #6); this only appends the unit.
function formatHealthValue(value?: googletype_Decimal, unit?: string): string {
  const raw = value?.value;
  if (raw == null || raw === '') return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  switch (unit) {
    case '%':
      return `${n.toFixed(1)} %`;
    case 'x':
    case '×':
      return `${n.toFixed(2)}×`;
    case 'days':
      return `${n.toFixed(0)} days`;
    default: {
      const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return unit ? `${s} ${unit}` : s;
    }
  }
}

// ok breaches green, warn breaches red; na/track are informational → no colour.
function toneFor(status?: string): 'up' | 'down' | undefined {
  if (status === 'ok') return 'up';
  if (status === 'warn') return 'down';
  return undefined;
}

// Themed grouping of the ratio set — the plain-language buckets an owner reasons in. Rows are
// matched to a group by their backend name; anything unmatched falls into "Other" so nothing is ever
// dropped if the backend adds a ratio.
const GROUPS: { title: string; names: string[] }[] = [
  {
    title: 'Profitability',
    names: [
      'Gross Margin',
      'Net Profit Margin',
      'Return on Assets (ROA)',
      'Return on Equity (ROE)',
      'COGS %',
    ],
  },
  {
    title: 'Can we pay the bills',
    names: ['Current Ratio', 'Quick Ratio', 'Debt-to-Equity'],
  },
  {
    title: 'Inventory',
    names: ['Inventory Turnover', 'Days Inventory Outstanding (DIO)', 'Sell-Through', 'GMROI'],
  },
  {
    title: 'Sales & getting paid',
    names: [
      'Days Sales Outstanding (DSO)',
      'Discount Rate',
      'Return Rate',
      'Revenue per SKU',
      'Cost per Unit',
    ],
  },
];

// 4.x Financial Health — "Scorecard" (the owner's pick): the ratio set grouped into plain-language
// themes, each metric a tile coloured green (ok) / red (needs attention). One glance says which part
// of the business is healthy; the benchmark sits under each value. Numbers are server-sent; this
// only lays them out.
export function FinancialHealthTab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useFinancialHealth(from, to);
  const rows = data?.rows ?? [];
  const caveats = data?.caveats ?? [];

  const byName = new Map<string, AcctFinancialHealthRow>();
  rows.forEach((r) => r.name && byName.set(r.name, r));
  const grouped = GROUPS.map((g) => ({
    title: g.title,
    rows: g.names.map((n) => byName.get(n)).filter((r): r is AcctFinancialHealthRow => !!r),
  })).filter((g) => g.rows.length > 0);
  const claimed = new Set(GROUPS.flatMap((g) => g.names));
  const other = rows.filter((r) => !r.name || !claimed.has(r.name));
  if (other.length) grouped.push({ title: 'Other', rows: other });

  const okCount = rows.filter((r) => r.status === 'ok').length;
  const warnCount = rows.filter((r) => r.status === 'warn').length;

  const copyHeaders = ['metric', 'formula', 'benchmark', 'value', 'status'];
  const copyRows: (string | number | undefined)[][] = rows.map((r) => [
    r.name,
    r.formula,
    r.benchmark,
    r.value?.value,
    r.status,
  ]);

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={rows.length === 0}
    >
      <div className='flex flex-col gap-3'>
        <CaveatsNote caveats={caveats} />
        <Verdict>
          {`${okCount} of ${rows.length} vital signs in the green${
            warnCount ? ` — ${warnCount} to keep an eye on (shown in red).` : '.'
          }`}
        </Verdict>
        <div className='flex justify-end'>
          <CopyTableButton headers={copyHeaders} rows={copyRows} filename='financial-health' />
        </div>

        {grouped.map((g) => (
          <div key={g.title}>
            <GroupHeader>{g.title}</GroupHeader>
            <StatGrid>
              {g.rows.map((r) => (
                <StatTile
                  key={r.name}
                  label={r.name}
                  value={formatHealthValue(r.value, r.unit)}
                  tone={toneFor(r.status)}
                  sub={r.benchmark ? `target ${r.benchmark}` : undefined}
                />
              ))}
            </StatGrid>
          </div>
        ))}
      </div>
    </ReportState>
  );
}
