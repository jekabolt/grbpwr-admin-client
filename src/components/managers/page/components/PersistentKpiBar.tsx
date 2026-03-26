import type { BusinessMetrics } from 'api/proto-http/admin';
import { type FC } from 'react';
import Text from 'ui/components/text';
import { orderCancellationSharePercent } from '../executiveAlerts';
import { formatCurrency, formatNumber, formatPercent, getMetricComparison } from '../utils';

export interface PersistentKpiBarProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled: boolean;
}

interface KpiMetric {
  label: string;
  value: number;
  format: (v: number) => string;
  changePct: number | null;
  changeLabel?: string | null;
  isCritical?: boolean;
}

function getKpiMetrics(
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
): KpiMetric[] {
  if (!metrics) return [];

  const revenue = getMetricComparison(metrics.revenue as any);
  const orders = getMetricComparison(metrics.ordersCount as any);
  const conversionRate = getMetricComparison(metrics.conversionRate as any);
  const aov = getMetricComparison(metrics.avgOrderValue as any);
  const sessions = getMetricComparison(metrics.sessions as any);

  const cancellationPct = orderCancellationSharePercent(metrics);

  const getChangePct = (comp: ReturnType<typeof getMetricComparison>) => {
    if (!compareEnabled || comp.compareValue === undefined) return null;
    if (comp.compareValue === 0) {
      if (comp.value === 0) return 0;
      return null;
    }
    return comp.changePct ?? ((comp.value - comp.compareValue) / comp.compareValue) * 100;
  };

  return [
    {
      label: 'Revenue',
      value: revenue.value,
      format: formatCurrency,
      changePct: getChangePct(revenue),
    },
    {
      label: 'Orders',
      value: orders.value,
      format: formatNumber,
      changePct: getChangePct(orders),
    },
    {
      label: 'Conversion Rate',
      value: conversionRate.value,
      format: (v) => `${v.toFixed(1)}%`,
      changePct: getChangePct(conversionRate),
    },
    {
      label: 'AOV',
      value: aov.value,
      format: formatCurrency,
      changePct: getChangePct(aov),
    },
    {
      label: 'Sessions',
      value: sessions.value,
      format: formatNumber,
      changePct: getChangePct(sessions),
    },
    {
      label: 'Cancellation Rate',
      value: cancellationPct ?? 0,
      format: (v) => `${v.toFixed(1)}%`,
      changePct: null,
      isCritical: (cancellationPct ?? 0) > 20,
    },
  ];
}

function KpiMetricCard({ metric }: { metric: KpiMetric }) {
  const hasChange = metric.changePct !== null;
  const arrow = !hasChange ? '' : metric.changePct > 0 ? '↑ ' : metric.changePct < 0 ? '↓ ' : '';
  const changeColor =
    !hasChange || metric.changePct === 0
      ? 'text-textColor'
      : metric.changePct > 0
        ? 'text-green-600'
        : 'text-error';

  const cardClass = metric.isCritical
    ? 'border-2 border-error bg-error/10 p-3 min-w-0 flex flex-col gap-1'
    : 'border border-textInactiveColor bg-bgSecondary/30 p-3 min-w-0 flex flex-col gap-1';

  return (
    <div className={cardClass}>
      <Text
        variant='uppercase'
        className={metric.isCritical ? 'text-error text-[10px] font-semibold' : 'text-textInactiveColor text-[10px]'}
      >
        {metric.label}
      </Text>
      <Text className={metric.isCritical ? 'font-bold text-lg text-error' : 'font-bold text-lg'}>
        {metric.format(metric.value)}
      </Text>
      {hasChange && (
        <Text variant='uppercase' className={`text-[10px] ${changeColor}`}>
          {arrow}
          {formatPercent(metric.changePct!)}
        </Text>
      )}
    </div>
  );
}

export const PersistentKpiBar: FC<PersistentKpiBarProps> = ({ metrics, compareEnabled }) => {
  const kpiMetrics = getKpiMetrics(metrics, compareEnabled);

  if (kpiMetrics.length === 0) return null;

  return (
    <div className='grid grid-cols-3 md:grid-cols-6 gap-3'>
      {kpiMetrics.map((metric, idx) => (
        <KpiMetricCard key={idx} metric={metric} />
      ))}
    </div>
  );
};
