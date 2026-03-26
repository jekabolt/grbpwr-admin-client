import type { GetMetricsResponse } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  EntryProductsTable,
  ProductCharts,
  ProductTrendTable,
  RevenueParetoChart,
} from '../components';

interface MerchandisingTabProps {
  metricsResponse: GetMetricsResponse;
}

export function MerchandisingTab({ metricsResponse }: MerchandisingTabProps) {
  const metrics = metricsResponse.business;
  const { pathname, hash } = useLocation();

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
  const productsFullHref = `${pathname}?tab=products`;
  const customersHref = `${pathname}?tab=customers`;

  const hasAddToCartRateAnalysis =
    (metricsResponse.addToCartRateAnalysis?.products?.length ?? 0) > 0 ||
    (metricsResponse.addToCartRateAnalysis?.globalTrend?.length ?? 0) > 0;

  const hasProductCharts =
    (metrics?.topProductsByRevenue?.length ?? 0) > 0 ||
    (metrics?.topProductsByQuantity?.length ?? 0) > 0 ||
    (metrics?.revenueByCategory?.length ?? 0) > 0;

  return (
    <div className='space-y-6'>
      <Text className='text-textInactiveColor text-xs leading-relaxed max-w-3xl'>
        Snapshot for merchandising decisions: revenue concentration, first-purchase products, add-to-cart
        performance by product, and velocity. Deeper inventory and engagement lives on{' '}
        <Link to={productsFullHref} replace className='underline underline-offset-2 hover:text-textColor'>
          Products &amp; Inventory
        </Link>
        ; cohort and sequence detail on{' '}
        <Link to={customersHref} replace className='underline underline-offset-2 hover:text-textColor'>
          Customers
        </Link>
        .
      </Text>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Revenue &amp; velocity</h3>
        {!hasProductCharts &&
        !(metricsResponse.revenuePareto?.length ?? 0) &&
        !(metricsResponse.productTrend?.length ?? 0) ? (
          <div className='border border-textInactiveColor p-8 text-center'>
            <span className='text-textInactiveColor'>No revenue or trend data for this period.</span>
          </div>
        ) : (
          <>
            {hasProductCharts ? <ProductCharts metrics={metrics} /> : null}
            <div className='grid gap-6 md:grid-cols-2'>
              <RevenueParetoChart revenuePareto={metricsResponse.revenuePareto} />
              <ProductTrendTable productTrend={metricsResponse.productTrend} />
            </div>
          </>
        )}
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>First purchase products</h3>
        <EntryProductsTable entryProducts={metricsResponse.entryProducts} />
        {!metricsResponse.entryProducts?.length ? (
          <div className='border border-textInactiveColor p-6 text-center'>
            <span className='text-textInactiveColor text-xs'>
              No first-purchase product data for this period.
            </span>
          </div>
        ) : null}
      </div>

      <div id='atc-matrix' className='scroll-mt-24 space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Add-to-cart performance by product</h3>
        {hasAddToCartRateAnalysis ? (
          <>
            <AddToCartRateMatrixChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
            <AddToCartRateTrendChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
          </>
        ) : (
          <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
        )}
      </div>
    </div>
  );
}
