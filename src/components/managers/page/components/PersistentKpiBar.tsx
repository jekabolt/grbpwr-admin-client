import type { BusinessMetrics } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { type FC } from 'react';
import Text from 'ui/components/text';
import {
  formatCurrencyDelta,
  formatCurrencyWhole,
  formatNumber,
  formatNumberDelta,
  getMetricComparison,
} from '../utils';

export interface PersistentKpiBarProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled: boolean;
}

type Delta = { text: string; dir: 'up' | 'down' | 'flat' } | null;

interface KpiMetric {
  label: string;
  display: string;
  delta: Delta;
  note?: string | null;
  /** Money anchor (net revenue, contribution) — rendered larger to lead the ribbon. */
  emphasis?: boolean;
}

/** Absolute delta (value − compareValue), formatted per metric type. Null unless compare is on. */
function buildDelta(
  compareEnabled: boolean,
  value: number,
  compareValue: number | undefined,
  fmt: (v: number) => string,
  suppress = false,
): Delta {
  if (suppress || !compareEnabled || compareValue === undefined) return null;
  const diff = value - compareValue;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { text: fmt(diff), dir };
}

function coverageNote(costCoverage: number): string | null {
  if (costCoverage <= 0) return 'set product costs';
  if (costCoverage < 99.5) return `${costCoverage.toFixed(0)}% of revenue costed`;
  return null;
}

function getKpiMetrics(
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
  canReadCosting: boolean,
): KpiMetric[] {
  if (!metrics) return [];

  const commerce = metrics.commerce;
  const margin = metrics.margin;
  const revenue = getMetricComparison(commerce?.revenue as any);
  const orders = getMetricComparison(commerce?.ordersCount as any);
  const grossMarginPct = getMetricComparison(margin?.grossMarginPct as any);
  const contributionMargin = getMetricComparison(margin?.contributionMargin as any);
  // Share (%) of revenue whose product has a cost set — margin is computed only over it.
  // Also gate on costing:read: the server nulls the money fields without it, so never show
  // a €0/0% margin to a costing-blind user even if costCoveragePct itself isn't nulled.
  const costCoverage = margin?.costCoveragePct ?? 0;
  const costed = costCoverage > 0 && canReadCosting;

  return [
    {
      // DB-true headline, now net of VAT. Whole euros — cents are false precision at a glance.
      label: 'Net revenue (ex-VAT)',
      display: formatCurrencyWhole(revenue.value),
      delta: buildDelta(compareEnabled, revenue.value, revenue.compareValue, formatCurrencyDelta),
      emphasis: true,
    },
    {
      // The money that actually pays the team: revenue − COGS − shipping. Only meaningful over
      // the costed subset of revenue, so blank it (—) rather than show a misleading partial figure.
      // Contribution to fixed costs — NOT profit (opex/marketing come out downstream).
      label: 'Contribution · not profit',
      display: costed ? formatCurrencyWhole(contributionMargin.value) : '—',
      delta: buildDelta(
        compareEnabled,
        contributionMargin.value,
        contributionMargin.compareValue,
        formatCurrencyDelta,
        !costed,
      ),
      note: canReadCosting ? coverageNote(costCoverage) : null,
      emphasis: true,
    },
    {
      // Profit rate, not activity. Delta in percentage POINTS (change_absolute), not "rate of a rate".
      label: 'Gross Margin',
      display: costed ? `${grossMarginPct.value.toFixed(0)}%` : '—',
      delta: buildDelta(
        compareEnabled,
        grossMarginPct.value,
        grossMarginPct.compareValue,
        (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}pp`,
        !costed,
      ),
      note: canReadCosting ? coverageNote(costCoverage) : null,
    },
    {
      label: 'Orders',
      display: formatNumber(orders.value),
      delta: buildDelta(compareEnabled, orders.value, orders.compareValue, formatNumberDelta),
    },
  ];
}

function KpiMetricCard({ metric }: { metric: KpiMetric }) {
  // Flat/no-compare reads as neutral secondary ink, not full black (which would compete
  // with the value); up/down carry the status green/red.
  const deltaColor =
    !metric.delta || metric.delta.dir === 'flat'
      ? 'text-labelColor'
      : metric.delta.dir === 'up'
        ? 'text-success'
        : 'text-error';
  const arrow = !metric.delta
    ? ''
    : metric.delta.dir === 'up'
      ? '↑ '
      : metric.delta.dir === 'down'
        ? '↓ '
        : '';

  return (
    <div className='flex min-w-0 flex-col gap-1 border border-textInactiveColor bg-bgSecondary/40 p-3'>
      <Text variant='uppercase' className='text-[11px] tracking-wide text-labelColor'>
        {metric.label}
      </Text>
      <Text
        className={`font-bold tabular-nums leading-none ${metric.emphasis ? 'text-2xl' : 'text-lg'}`}
      >
        {metric.display}
      </Text>
      {metric.delta && (
        <Text variant='uppercase' className={`text-[11px] tabular-nums ${deltaColor}`}>
          {arrow}
          {metric.delta.text}
        </Text>
      )}
      {metric.note && (
        <Text variant='uppercase' className='text-[11px] text-labelColor'>
          {metric.note}
        </Text>
      )}
    </div>
  );
}

export const PersistentKpiBar: FC<PersistentKpiBarProps> = ({ metrics, compareEnabled }) => {
  const { canReadCosting } = usePermissions();
  const kpiMetrics = getKpiMetrics(metrics, compareEnabled, canReadCosting);

  if (kpiMetrics.length === 0) return null;

  return (
    <div className='grid grid-cols-2 items-stretch gap-3 md:grid-cols-4'>
      {kpiMetrics.map((metric, idx) => (
        <KpiMetricCard key={idx} metric={metric} />
      ))}
    </div>
  );
};
