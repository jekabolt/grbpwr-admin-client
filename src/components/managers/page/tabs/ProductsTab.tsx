import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  DeadStockTable,
  InventoryHealthTable,
  OOSImpactTable,
  ProductCharts,
  ProductEngagementBubbleMatrixChart,
  ProductEngagementRadarChart,
  ProductEngagementTable,
  ProductTrendTable,
  ReturnBySizeTable,
  RevenueParetoChart,
  SizeAnalyticsTable,
  SizeConfidenceTable,
  SlowMoversTable,
} from '../components';

interface ProductsTabProps {
  metricsResponse: GetMetricsResponse;
}

export function ProductsTab({ metricsResponse }: ProductsTabProps) {
  const metrics = metricsResponse.business;
  const hasProductCharts =
    (metrics?.topProductsByRevenue?.length ?? 0) > 0 ||
    (metrics?.topProductsByQuantity?.length ?? 0) > 0 ||
    (metrics?.revenueByCategory?.length ?? 0) > 0;
  const hasRevenuePareto = (metricsResponse.revenuePareto?.length ?? 0) > 0;
  const hasProductTrend = (metricsResponse.productTrend?.length ?? 0) > 0;
  const bubbleMatrix = (metricsResponse as Record<string, unknown>).productEngagementBubbleMatrix as
    | { products?: unknown[] }
    | undefined;
  const hasProductEngagement =
    (metricsResponse.productEngagement?.length ?? 0) > 0 ||
    (bubbleMatrix?.products?.length ?? 0) > 0;
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

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Product performance</h3>
        {!hasAnyProductData ? (
          <div className='border border-textInactiveColor p-8 text-center'>
            <span className='text-textInactiveColor'>
              No product performance data available for this period. Data appears when there are
              orders and product sales.
            </span>
          </div>
        ) : (
          <>
            <ProductCharts metrics={metrics} />
            <div className='grid gap-6 md:grid-cols-2'>
              <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />
              <ProductTrendTable productTrend={metricsResponse.productTrend} />
            </div>
            <ProductEngagementBubbleMatrixChart
              productEngagementBubbleMatrix={
                (metricsResponse as Record<string, unknown>).productEngagementBubbleMatrix as
                  | import('api/proto-http/admin').ProductEngagementBubbleMatrix
                  | undefined
              }
            />
            <ProductEngagementRadarChart productEngagement={metricsResponse.productEngagement} />
            <ProductEngagementTable productEngagement={metricsResponse.productEngagement} />
            {hasAddToCartRateAnalysis ? (
              <div className='space-y-6'>
                <AddToCartRateMatrixChart
                  addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
                />
                <AddToCartRateTrendChart
                  addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
                />
              </div>
            ) : (
              <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
            )}
          </>
        )}
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Size analytics</h3>
        <SizeAnalyticsTable sizeAnalytics={metricsResponse.sizeAnalytics} />
        <div className='grid gap-6 md:grid-cols-2'>
          <ReturnBySizeTable returnBySize={metricsResponse.returnBySize} />
          <SizeConfidenceTable sizeConfidence={metricsResponse.sizeConfidence} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Inventory health</h3>
        <InventoryHealthTable inventoryHealth={metricsResponse.inventoryHealth} />
        <div className='grid gap-6 md:grid-cols-2'>
          <SlowMoversTable slowMovers={metricsResponse.slowMovers} />
          <DeadStockTable deadStock={metricsResponse.deadStock} />
        </div>
        <OOSImpactTable oosImpact={metricsResponse.oosImpact} />
      </div>
    </div>
  );
}
