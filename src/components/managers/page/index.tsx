import { subDays } from 'date-fns';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import {
  CurrencyPaymentCharts,
  DateRangePicker,
  GeographyCharts,
  KpiCards,
  OrdersByStatusChart,
  ProductCharts,
  PromoTable,
  CrossSellTable,
  TimeSeriesChart,
  TrafficCharts,
  FunnelChart,
  AbandonedCartCard,
  CheckoutTimingsCard,
  CohortRetentionTable,
  OrderSequenceChart,
  SpendingCurveChart,
  RevenueParetoChart,
  ProductTrendTable,
  ProductEngagementTable,
  ProductEngagementBubbleMatrixChart,
  AddToCartRateTable,
  AddToCartRateMatrixChart,
  AddToCartRateTrendChart,
  SizeAnalyticsTable,
  ReturnBySizeTable,
  ReturnByProductChart,
  SizeConfidenceTable,
  InventoryHealthTable,
  SlowMoversTable,
  DeadStockTable,
  OOSImpactTable,
  CampaignAttributionTable,
  NewsletterCard,
  WebVitalsCard,
  DeviceFunnelChart,
  BrowserBreakdownTable,
  FormErrorsTable,
  ExceptionsTable,
  NotFoundTable,
  PaymentFailuresTable,
  ScrollDepthChart,
  SessionDurationChart,
} from './components';
import { useFullMetricsQuery } from './useFullMetricsQuery';
import type { CompareMode, TimeSeriesPoint } from 'api/proto-http/admin';
import type { MetricsPeriod } from './useMetricsQuery';

/** Get time series data with snake_case fallback (backend may return orders_by_day) */
function getTimeSeries(
  metrics: Record<string, unknown> | undefined,
  camelKey: string,
): TimeSeriesPoint[] | undefined {
  if (!metrics) return undefined;
  const snakeKey = camelKey.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  return (metrics[camelKey] ?? metrics[snakeKey]) as TimeSeriesPoint[] | undefined;
}

function getDefaultCustomRange() {
  const to = new Date();
  const from = subDays(to, 6);
  return { from, to };
}

export function Analitic() {
  const defaultCustom = getDefaultCustomRange();
  const [period, setPeriod] = useState<MetricsPeriod>('7d');
  const [compareMode, setCompareMode] = useState<CompareMode>('COMPARE_MODE_PREVIOUS_PERIOD');
  const [customFrom, setCustomFrom] = useState(defaultCustom.from);
  const [customTo, setCustomTo] = useState(defaultCustom.to);

  const handlePeriodChange = (p: MetricsPeriod) => {
    setPeriod(p);
    if (p === 'custom') {
      const { from, to } = getDefaultCustomRange();
      setCustomFrom(from);
      setCustomTo(to);
    }
  };

  const handleCustomRangeChange = (from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  const { data: metricsResponse, isLoading, isError, refetch } = useFullMetricsQuery(period, {
    compareMode,
    customFrom: period === 'custom' ? customFrom : undefined,
    customTo: period === 'custom' ? customTo : undefined,
  });

  const metrics = metricsResponse?.business;

  return (
    <div className='flex flex-col gap-8 pb-16'>
      <div className='flex flex-col gap-4'>
        <Text variant='uppercase' className='text-2xl font-bold'>
          Analytics Dashboard
        </Text>
        <DateRangePicker
          period={period}
          compareMode={compareMode}
          customFrom={customFrom}
          customTo={customTo}
          onPeriodChange={handlePeriodChange}
          onCompareModeChange={setCompareMode}
          onCustomRangeChange={handleCustomRangeChange}
        />
      </div>

      {isLoading && (
        <div className='border border-textInactiveColor p-8 text-center'>
          <Text>Loading metrics...</Text>
        </div>
      )}

      {isError && (
        <div className='border border-error p-8 text-center'>
          <Text className='text-error mb-4'>Failed to load metrics</Text>
          <Button variant='main' onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && metricsResponse && (
        <>
          {/* Section 1: Core Business Health */}
          <div className='space-y-6'>
            <Text variant='uppercase' className='text-xl font-bold border-b border-textInactiveColor pb-2'>
              1. Core Business Health
            </Text>

            <KpiCards
              metrics={metrics}
              compareEnabled={compareMode !== 'COMPARE_MODE_NONE'}
            />

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Conversion funnel
              </Text>
              <div className='grid gap-6 md:grid-cols-2'>
                <FunnelChart funnel={metricsResponse.funnel} />
                <div className='space-y-4'>
                  <AbandonedCartCard abandonedCart={metricsResponse.abandonedCart} />
                  <CheckoutTimingsCard checkoutTimings={metricsResponse.checkoutTimings} />
                </div>
              </div>
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Customer retention & lifetime value
              </Text>
              <CohortRetentionTable cohortRetention={metricsResponse.cohortRetention} />
              <div className='grid gap-6 md:grid-cols-2'>
                <OrderSequenceChart orderSequence={metricsResponse.orderSequence} />
                <SpendingCurveChart spendingCurve={metricsResponse.spendingCurve} />
              </div>
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Time series
              </Text>
              <div className='grid gap-4 md:grid-cols-2'>
                <TimeSeriesChart
                  title='Revenue by day'
                  data={metrics?.revenueByDay}
                  compareData={metrics?.revenueByDayCompare}
                />
                <TimeSeriesChart
                  title='Orders by day'
                  data={getTimeSeries(metrics as Record<string, unknown>, 'ordersByDay')}
                  compareData={getTimeSeries(metrics as Record<string, unknown>, 'ordersByDayCompare')}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Subscribers by day'
                  data={metrics?.subscribersByDay}
                  compareData={metrics?.subscribersByDayCompare}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Gross revenue by day'
                  data={metrics?.grossRevenueByDay}
                  compareData={metrics?.grossRevenueByDayCompare}
                />
                <TimeSeriesChart
                  title='Refunds by day'
                  data={metrics?.refundsByDay}
                  compareData={metrics?.refundsByDayCompare}
                />
                <TimeSeriesChart
                  title='Avg order value by day'
                  data={metrics?.avgOrderValueByDay}
                  compareData={metrics?.avgOrderValueByDayCompare}
                />
                <TimeSeriesChart
                  title='Units sold by day'
                  data={metrics?.unitsSoldByDay}
                  compareData={metrics?.unitsSoldByDayCompare}
                  valueFormat='number'
                />
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
                <TimeSeriesChart
                  title='Shipped by day'
                  data={metrics?.shippedByDay}
                  compareData={metrics?.shippedByDayCompare}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Delivered by day'
                  data={metrics?.deliveredByDay}
                  compareData={metrics?.deliveredByDayCompare}
                  valueFormat='number'
                />
              </div>
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                GA4 Traffic & Engagement
              </Text>
              <div className='grid gap-4 md:grid-cols-2'>
                <TimeSeriesChart
                  title='Sessions by day'
                  data={metrics?.sessionsByDay}
                  compareData={metrics?.sessionsByDayCompare}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Users by day'
                  data={metrics?.usersByDay}
                  compareData={metrics?.usersByDayCompare}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Page views by day'
                  data={metrics?.pageViewsByDay}
                  compareData={metrics?.pageViewsByDayCompare}
                  valueFormat='number'
                />
                <TimeSeriesChart
                  title='Conversion rate by day'
                  data={metrics?.conversionRateByDay}
                  compareData={metrics?.conversionRateByDayCompare}
                  valueFormat='number'
                />
              </div>
            </div>

            <ReturnByProductChart returnByProduct={metricsResponse.returnByProduct} />
          </div>

          {/* Section 2: Product & Inventory */}
          <div className='space-y-6'>
            <Text variant='uppercase' className='text-xl font-bold border-b border-textInactiveColor pb-2'>
              2. Product & Inventory Analytics
            </Text>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Product performance
              </Text>
              {(() => {
                const hasProductCharts =
                  (metrics?.topProductsByRevenue?.length ?? 0) > 0 ||
                  (metrics?.topProductsByQuantity?.length ?? 0) > 0 ||
                  (metrics?.revenueByCategory?.length ?? 0) > 0;
                const hasRevenuePareto = (metricsResponse.revenuePareto?.length ?? 0) > 0;
                const hasProductTrend = (metricsResponse.productTrend?.length ?? 0) > 0;
                const hasProductEngagement =
                  (metricsResponse.productEngagement?.length ?? 0) > 0 ||
                  (metricsResponse.productEngagementBubbleMatrix?.products?.length ?? 0) > 0;
                const hasAddToCartRate = (metricsResponse.addToCartRate?.length ?? 0) > 0;
                const hasAddToCartRateAnalysis =
                  (metricsResponse.addToCartRateAnalysis?.products?.length ?? 0) > 0 ||
                  (metricsResponse.addToCartRateAnalysis?.globalTrend?.length ?? 0) > 0;
                const hasAnyProductData =
                  hasProductCharts ||
                  hasRevenuePareto ||
                  hasProductTrend ||
                  hasProductEngagement ||
                  hasAddToCartRate ||
                  hasAddToCartRateAnalysis;

                if (!hasAnyProductData) {
                  return (
                    <div className='border border-textInactiveColor p-8 text-center'>
                      <Text className='text-textInactiveColor'>
                        No product performance data available for this period. Data appears when there are orders and product sales.
                      </Text>
                    </div>
                  );
                }

                return (
                  <>
                    <ProductCharts metrics={metrics} />
                    <div className='grid gap-6 md:grid-cols-2'>
                      <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />
                      <ProductTrendTable productTrend={metricsResponse.productTrend} />
                    </div>
                    <ProductEngagementBubbleMatrixChart
                      productEngagementBubbleMatrix={metricsResponse.productEngagementBubbleMatrix}
                    />
                    <ProductEngagementTable productEngagement={metricsResponse.productEngagement} />
                    {hasAddToCartRateAnalysis ? (
                      <div className='space-y-6'>
                        <AddToCartRateMatrixChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
                        <AddToCartRateTrendChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
                      </div>
                    ) : (
                      <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
                    )}
                  </>
                );
              })()}
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Size analytics
              </Text>
              <SizeAnalyticsTable sizeAnalytics={metricsResponse.sizeAnalytics} />
              <div className='grid gap-6 md:grid-cols-2'>
                <ReturnBySizeTable returnBySize={metricsResponse.returnBySize} />
                <SizeConfidenceTable sizeConfidence={metricsResponse.sizeConfidence} />
              </div>
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Inventory health
              </Text>
              <InventoryHealthTable inventoryHealth={metricsResponse.inventoryHealth} />
              <div className='grid gap-6 md:grid-cols-2'>
                <SlowMoversTable slowMovers={metricsResponse.slowMovers} />
                <DeadStockTable deadStock={metricsResponse.deadStock} />
              </div>
              <OOSImpactTable oosImpact={metricsResponse.oosImpact} />
            </div>
          </div>

          {/* Section 3: Marketing & Traffic */}
          <div className='space-y-6'>
            <Text variant='uppercase' className='text-xl font-bold border-b border-textInactiveColor pb-2'>
              3. Marketing & Traffic
            </Text>

            <TrafficCharts metrics={metrics} />
            <GeographyCharts metrics={metrics} />
            <CurrencyPaymentCharts metrics={metrics} />
            <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />
            <NewsletterCard newsletter={metricsResponse.newsletter} />
          </div>

          {/* Section 4: Customer Experience & Technical Health */}
          <div className='space-y-6'>
            <Text variant='uppercase' className='text-xl font-bold border-b border-textInactiveColor pb-2'>
              4. Customer Experience & Technical Health
            </Text>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Page performance
              </Text>
              <div className='grid gap-6 md:grid-cols-2'>
                <WebVitalsCard webVitals={metricsResponse.webVitals} />
                <DeviceFunnelChart deviceFunnel={metricsResponse.deviceFunnel} />
              </div>
              <BrowserBreakdownTable browserBreakdown={metricsResponse.browserBreakdown} />
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                Technical issues
              </Text>
              <div className='grid gap-6 md:grid-cols-2'>
                <FormErrorsTable formErrors={metricsResponse.formErrors} />
                <ExceptionsTable exceptions={metricsResponse.exceptions} />
              </div>
              <div className='grid gap-6 md:grid-cols-2'>
                <NotFoundTable notFound={metricsResponse.notFound} />
                <PaymentFailuresTable paymentFailures={metricsResponse.paymentFailures} />
              </div>
            </div>

            <div className='space-y-6'>
              <Text variant='uppercase' className='font-bold'>
                UX engagement
              </Text>
              <div className='grid gap-6 md:grid-cols-2'>
                <ScrollDepthChart scrollDepth={metricsResponse.scrollDepth} />
                <SessionDurationChart sessionDuration={metricsResponse.sessionDuration} />
              </div>
            </div>
          </div>

          {/* Existing components at the end */}
          <div className='grid gap-6 md:grid-cols-2'>
            <OrdersByStatusChart metrics={metrics} />
            <div className='space-y-6'>
              <CrossSellTable metrics={metrics} />
              <PromoTable metrics={metrics} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
