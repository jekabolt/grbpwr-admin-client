import type { GetMetricsResponse } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  DeadStockTable,
  ImageSwipesTable,
  InventoryHealthTable,
  OOSImpactTable,
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
  const hasProductEngagement =
    (metricsResponse.productEngagement?.length ?? 0) > 0 ||
    (metricsResponse.productEngagementBubbleMatrix?.rows?.length ?? 0) > 0 ||
    (metricsResponse.timeOnPage?.length ?? 0) > 0 ||
    (metricsResponse.productZoom?.length ?? 0) > 0 ||
    (metricsResponse.imageSwipes?.length ?? 0) > 0;
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
      <div id='product-performance' className='scroll-mt-24 space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Product performance</h3>
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
            <ProductCharts metrics={metrics} />
            <div className='grid gap-6 md:grid-cols-2'>
              <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />
              <ProductTrendTable productTrend={metricsResponse.productTrend} />
            </div>
            <div id='product-engagement' className='scroll-mt-24 space-y-6'>
              <h3 className='text-sm font-bold uppercase'>Product engagement</h3>
              <ProductEngagementBubbleMatrixChart
                productEngagementBubbleMatrix={metricsResponse.productEngagementBubbleMatrix}
              />
              <ProductEngagementRadarChart productEngagement={metricsResponse.productEngagement} />
              <ProductEngagementTable productEngagement={metricsResponse.productEngagement} />
              <TimeOnPageTable timeOnPage={metricsResponse.timeOnPage} />
              <div className='grid gap-6 md:grid-cols-2'>
                <ProductZoomTable productZoom={metricsResponse.productZoom} />
                <ImageSwipesTable imageSwipes={metricsResponse.imageSwipes} />
              </div>
            </div>
            <section id='atc-matrix' className='scroll-mt-24 space-y-6'>
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
        <SizeRunEfficiencyTable sizeRunEfficiency={metricsResponse.sizeRunEfficiency} />
      </div>
    </div>
  );
}
