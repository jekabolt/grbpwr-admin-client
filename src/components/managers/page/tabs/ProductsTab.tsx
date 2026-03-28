import type { GetMetricsResponse } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  DeadStockTable,
  DetailsExpansionTable,
  ImageSwipesTable,
  InventoryHealthTable,
  NotifyMeIntentTable,
  OOSImpactTable,
  ProductActionItems,
  ProductCharts,
  ProductEngagementBubbleMatrixChart,
  ProductEngagementRadarChart,
  ProductEngagementTable,
  ProductTrendTable,
  ProductZoomTable,
  ReturnBySizeTable,
  RevenueParetoChart,
  SizeAnalyticsTable,
  SizeConfidenceTable,
  SizeGuideClicksTable,
  SizeRunEfficiencyTable,
  SlowMoversTable,
  TimeOnPageTable,
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
          <ProductActionItems
            productTrend={metricsResponse.productTrend}
            addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
          />

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Add-to-Cart Performance
            </summary>
            <div className='space-y-6 p-4'>
              <section id='atc-matrix' className='scroll-mt-24'>
                {hasAddToCartRateAnalysis ? (
                  <>
                    <AddToCartRateMatrixChart
                      addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
                    />
                    <AddToCartRateTrendChart
                      addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis}
                    />
                  </>
                ) : (
                  <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
                )}
              </section>
            </div>
          </details>

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Inventory Health
            </summary>
            <div className='space-y-6 p-4'>
              <InventoryHealthTable inventoryHealth={metricsResponse.inventoryHealth} />
              <NotifyMeIntentTable notifyMeIntent={metricsResponse.notifyMeIntent} />
              <OOSImpactTable oosImpact={metricsResponse.oosImpact} />
            </div>
          </details>

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Top Products
            </summary>
            <div className='space-y-6 p-4'>
              {hasProductCharts && <ProductCharts metrics={metrics} />}
              {hasRevenuePareto && <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />}
              <ProductTrendTable productTrend={metricsResponse.productTrend} />
              <SlowMoversTable slowMovers={metricsResponse.slowMovers} />
              <DeadStockTable deadStock={metricsResponse.deadStock} />
            </div>
          </details>

          <details className='border border-textInactiveColor'>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Product Engagement
            </summary>
            <div className='space-y-6 p-4'>
              <ProductEngagementBubbleMatrixChart
                productEngagementBubbleMatrix={metricsResponse.productEngagementBubbleMatrix}
              />
              <SizeAnalyticsTable sizeAnalytics={metricsResponse.sizeAnalytics} />
              <SizeRunEfficiencyTable sizeRunEfficiency={metricsResponse.sizeRunEfficiency} />
              <SizeGuideClicksTable sizeGuideClicks={metricsResponse.sizeGuideClicks} />
              <DetailsExpansionTable detailsExpansion={metricsResponse.detailsExpansion} />
            </div>
          </details>

          <details className='border border-textInactiveColor'>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Deep Dive
            </summary>
            <div className='space-y-6 p-4'>
              <ProductEngagementRadarChart productEngagement={metricsResponse.productEngagement} />
              <ProductEngagementTable productEngagement={metricsResponse.productEngagement} />
              <TimeOnPageTable timeOnPage={metricsResponse.timeOnPage} />
              <div className='grid gap-6 md:grid-cols-2'>
                <ProductZoomTable productZoom={metricsResponse.productZoom} />
                <ImageSwipesTable imageSwipes={metricsResponse.imageSwipes} />
              </div>
            </div>
          </details>

          <details className='border border-textInactiveColor'>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
              Returns Analysis
            </summary>
            <div className='space-y-6 p-4'>
              <ReturnBySizeTable returnBySize={metricsResponse.returnBySize} />
            </div>
          </details>

          <div className='grid gap-6 md:grid-cols-2'>
            <SizeConfidenceTable sizeConfidence={metricsResponse.sizeConfidence} />
          </div>
        </>
      )}
    </div>
  );
}
