import type { CompareMode, GetMetricsResponse } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { ExecutiveHealthStrip, TimeSeriesChart } from '../components';
import type { MetricsPeriod } from '../useMetricsQuery';
import { formatCurrency, formatNumber, getTimeSeries, parseDecimal, resolveAnalyticsPeriodLabels } from '../utils';
import { ProductNameLink } from '../components/ProductNameLink';

interface ThisWeekTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
  period: MetricsPeriod;
  compareMode: CompareMode;
  customFrom: Date;
  customTo: Date;
}

export function ThisWeekTab({
  metricsResponse,
  compareEnabled,
  period,
  compareMode,
  customFrom,
  customTo,
}: ThisWeekTabProps) {
  const metrics = metricsResponse.business;
  const metricsRecord = metrics as Record<string, unknown> | undefined;
  const { pathname } = useLocation();
  const revenueHref = `${pathname}?tab=revenue`;
  const productsHref = `${pathname}?tab=products`;
  const trafficHref = `${pathname}?tab=traffic`;

  const { current: currentPeriodLabel, compare: comparePeriodLabel } = useMemo(
    () =>
      resolveAnalyticsPeriodLabels(
        metrics?.period,
        metrics?.comparePeriod,
        compareEnabled,
        compareMode,
        period,
        customFrom,
        customTo,
      ),
    [
      metrics?.period,
      metrics?.comparePeriod,
      compareEnabled,
      compareMode,
      period,
      customFrom,
      customTo,
    ],
  );

  const top3Products = useMemo(() => {
    const byRevenue = metrics?.topProductsByRevenue || [];
    const byQuantity = metrics?.topProductsByQuantity || [];
    
    const quantityMap = new Map(
      byQuantity.map((p) => [p.productId, p.count ?? 0])
    );

    return byRevenue.slice(0, 3).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      revenue: parseDecimal(p.value),
      units: quantityMap.get(p.productId) ?? 0,
    }));
  }, [metrics?.topProductsByRevenue, metrics?.topProductsByQuantity]);

  const topTrafficSource = useMemo(() => {
    const sources = metrics?.trafficBySource || [];
    const filtered = sources.filter((s) => {
      const name = [s.source, s.medium].filter(Boolean).join(' / ').toLowerCase();
      return !name.includes('direct') && !name.includes('none');
    });
    
    if (filtered.length === 0) return null;
    
    const top = filtered[0];
    return {
      name: [top.source, top.medium].filter(Boolean).join(' / ') || 'Unknown',
      sessions: top.sessions ?? 0,
    };
  }, [metrics?.trafficBySource]);

  return (
    <div className='space-y-6'>
      <ExecutiveHealthStrip
        metrics={metrics}
        compareEnabled={compareEnabled}
        revenueHref={revenueHref}
        currentPeriodLabel={currentPeriodLabel}
        comparePeriodLabel={comparePeriodLabel}
      />

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Orders at a glance</h3>
        <div className='max-w-xl'>
          <TimeSeriesChart
            title='Orders by day'
            data={getTimeSeries(metricsRecord, 'ordersByDay')}
            compareData={getTimeSeries(metricsRecord, 'ordersByDayCompare')}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Acquisition &amp; retention</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='New customers by day'
            data={metrics?.newCustomersByDay}
            compareData={metrics?.newCustomersByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Returning customers by day'
            data={metrics?.returningCustomersByDay}
            compareData={metrics?.returningCustomersByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-bold uppercase'>Top 3 Products This Period</h3>
          <Link
            to={productsHref}
            replace
            className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
          >
            View all →
          </Link>
        </div>
        {top3Products.length > 0 ? (
          <div className='border border-textInactiveColor p-4'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='border-b border-textInactiveColor'>
                  <th className='text-left p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Product
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Revenue
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Units
                    </Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {top3Products.map((product, idx) => (
                  <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                    <td className='p-2'>
                      <ProductNameLink
                        productId={product.productId}
                        productName={product.productName}
                        maxWidth='200px'
                      />
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatCurrency(product.revenue)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatNumber(product.units)}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className='border border-textInactiveColor p-4 text-center'>
            <Text className='text-textInactiveColor text-xs'>No product data for this period.</Text>
          </div>
        )}
      </div>

      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-bold uppercase'>Top Traffic Source This Period</h3>
          <Link
            to={trafficHref}
            replace
            className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
          >
            View breakdown →
          </Link>
        </div>
        <div className='border border-textInactiveColor p-4'>
          {topTrafficSource ? (
            <div className='space-y-2'>
              <Text className='text-2xl font-bold'>{topTrafficSource.name}</Text>
              <Text className='text-textInactiveColor text-xs'>
                {formatNumber(topTrafficSource.sessions)} sessions
              </Text>
              <Text className='text-textInactiveColor text-[10px] italic mt-2'>
                Excluding direct traffic
              </Text>
            </div>
          ) : (
            <Text className='text-textInactiveColor text-xs'>No attributed traffic this period</Text>
          )}
        </div>
      </div>
    </div>
  );
}
