import type { BusinessMetrics } from 'api/proto-http/admin';
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

function getKpiMetrics(metrics: BusinessMetrics | undefined, compareEnabled: boolean): KpiMetric[] {
  if (!metrics) return [];

  const revenue = getMetricComparison(metrics.revenue as any);
  const orders = getMetricComparison(metrics.ordersCount as any);
  const grossMarginPct = getMetricComparison(metrics.grossMarginPct as any);
  const contributionMargin = getMetricComparison(metrics.contributionMargin as any);
  // Share (%) of revenue whose product has a cost set — margin is computed only over it.
  const costCoverage = metrics.costCoveragePct ?? 0;
  const costed = costCoverage > 0;

  return [
    {
      // DB-true headline. Whole euros — cents are false precision at a glance.
      label: 'Revenue',
      display: formatCurrencyWhole(revenue.value),
      delta: buildDelta(compareEnabled, revenue.value, revenue.compareValue, formatCurrencyDelta),
    },
    {
      // The money that actually pays the team: revenue − COGS − shipping. Only meaningful over
      // the costed subset of revenue, so blank it (—) rather than show a misleading partial figure.
      label: 'Contribution Margin',
      display: costed ? formatCurrencyWhole(contributionMargin.value) : '—',
      delta: buildDelta(
        compareEnabled,
        contributionMargin.value,
        contributionMargin.compareValue,
        formatCurrencyDelta,
        !costed,
      ),
      note: coverageNote(costCoverage),
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
      note: coverageNote(costCoverage),
    },
    {
      label: 'Orders',
      display: formatNumber(orders.value),
      delta: buildDelta(compareEnabled, orders.value, orders.compareValue, formatNumberDelta),
    },
  ];
}

function KpiMetricCard({ metric }: { metric: KpiMetric }) {
  const deltaColor =
    !metric.delta || metric.delta.dir === 'flat'
      ? 'text-textColor'
      : metric.delta.dir === 'up'
        ? 'text-green-600'
        : 'text-error';
  const arrow = !metric.delta ? '' : metric.delta.dir === 'up' ? '↑ ' : metric.delta.dir === 'down' ? '↓ ' : '';

  return (
    <div className='border border-textInactiveColor bg-bgSecondary/30 p-3 min-w-0 flex flex-col gap-1'>
      <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
        {metric.label}
      </Text>
      <Text className='font-bold text-lg'>{metric.display}</Text>
      {metric.delta && (
        <Text variant='uppercase' className={`text-[10px] ${deltaColor}`}>
          {arrow}
          {metric.delta.text}
        </Text>
      )}
      {metric.note && (
        <Text variant='uppercase' className='text-[10px] text-textInactiveColor'>
          {metric.note}
        </Text>
      )}
    </div>
  );
}

export const PersistentKpiBar: FC<PersistentKpiBarProps> = ({ metrics, compareEnabled }) => {
  const kpiMetrics = getKpiMetrics(metrics, compareEnabled);

  if (kpiMetrics.length === 0) return null;

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
      {kpiMetrics.map((metric, idx) => (
        <KpiMetricCard key={idx} metric={metric} />
      ))}
    </div>
  );
};
