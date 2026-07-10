import type { GetMetricsResponse } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  DeadStockTable,
  InventoryHealthTable,
  NotifyMeIntentTable,
  OOSImpactTable,
  ProductCharts,
  ProductTrendTable,
  ReorderTable,
  RevenueParetoChart,
  SizeAnalyticsTable,
  SizeConfidenceTable,
  SizeRunEfficiencyTable,
  SlowMoversTable,
} from '../components';

interface ProductsTabProps {
  metricsResponse: GetMetricsResponse;
}

export function ProductsTab({ metricsResponse }: ProductsTabProps) {
  const { hash } = useLocation();

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!id) return;

    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    scrollToTarget();
    const raf = requestAnimationFrame(() => requestAnimationFrame(scrollToTarget));
    const timeoutId = window.setTimeout(scrollToTarget, 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    };
  }, [hash, metricsResponse]);

  const metrics = metricsResponse.business;
  const hasProductCharts =
    (metrics?.topProductsByRevenue?.length ?? 0) > 0 ||
    (metrics?.topProductsByQuantity?.length ?? 0) > 0 ||
    (metrics?.revenueByCategory?.length ?? 0) > 0;
  const hasRevenuePareto = (metricsResponse.revenuePareto?.length ?? 0) > 0;
  const hasProductTrend = (metricsResponse.productTrend?.length ?? 0) > 0;
  const hasAddToCartRateAnalysis =
    (metricsResponse.addToCartRateAnalysis?.products?.length ?? 0) > 0 ||
    (metricsResponse.addToCartRateAnalysis?.globalTrend?.length ?? 0) > 0;
  const hasAddToCartRate = (metricsResponse.addToCartRate?.length ?? 0) > 0;
  const hasAnyProductData =
    hasProductCharts ||
    hasRevenuePareto ||
    hasProductTrend ||
    hasAddToCartRateAnalysis ||
    hasAddToCartRate;

  return (
    <div className='space-y-6'>
      {!hasAnyProductData ? (
        <div className='border border-textInactiveColor p-8 text-center'>
          <div id='atc-matrix' className='scroll-mt-24 -mt-8 h-0' aria-hidden />
          <span className='text-textInactiveColor'>
            No product performance data available for this period. Data appears when there are
            orders and product sales.
          </span>
        </div>
      ) : (
        <>
          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              What's Selling
            </summary>
            <div className='space-y-6 p-4'>
              {hasProductCharts && <ProductCharts metrics={metrics} />}
              {hasRevenuePareto && (
                <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />
              )}

              <section id='atc-matrix' className='scroll-mt-24'>
                {hasAddToCartRateAnalysis ? (
                  <AddToCartRateMatrixChart
                    addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
                  />
                ) : (
                  <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
                )}
              </section>

              <SlowMoversTable slowMovers={metricsResponse.slowMovers} />
              <DeadStockTable deadStock={metricsResponse.deadStock} />
              {hasProductTrend && <ProductTrendTable productTrend={metricsResponse.productTrend} />}
            </div>
          </details>

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Sizes
            </summary>
            <div className='space-y-6 p-4'>
              <SizeAnalyticsTable sizeAnalytics={metricsResponse.sizeAnalytics} />
              <SizeRunEfficiencyTable sizeRunEfficiency={metricsResponse.sizeRunEfficiency} />
              <SizeConfidenceTable sizeConfidence={metricsResponse.sizeConfidence} />
            </div>
          </details>

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Inventory
            </summary>
            <div className='space-y-6 p-4'>
              <ReorderTable inventoryHealth={metricsResponse.inventoryHealth} />
              <InventoryHealthTable inventoryHealth={metricsResponse.inventoryHealth} />
              <NotifyMeIntentTable notifyMeIntent={metricsResponse.notifyMeIntent} />
              <OOSImpactTable oosImpact={metricsResponse.oosImpact} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
