import type { GetMetricsResponse } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CogsStructureTable,
  DeadStockTable,
  DropVerdictTable,
  InventoryHealthTable,
  InventoryTargetForm,
  InventoryValuationTable,
  MarginByStyleTable,
  NotifyMeIntentTable,
  OOSImpactTable,
  ProductCharts,
  ReorderTable,
  SizeAnalyticsTable,
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
  const commerce = metrics?.commerce;
  const hasProductCharts =
    (commerce?.topProductsByRevenue?.length ?? 0) > 0 ||
    (commerce?.topProductsByQuantity?.length ?? 0) > 0 ||
    (commerce?.revenueByCategory?.length ?? 0) > 0;
  const hasAnyProductData =
    hasProductCharts ||
    (metricsResponse.sellThroughByDrop?.length ?? 0) > 0 ||
    (metricsResponse.slowMovers?.length ?? 0) > 0 ||
    (metricsResponse.deadStock?.length ?? 0) > 0 ||
    (metricsResponse.sizeAnalytics?.length ?? 0) > 0 ||
    (metricsResponse.sizeRunEfficiency?.length ?? 0) > 0 ||
    (metricsResponse.inventoryHealth?.length ?? 0) > 0 ||
    (metricsResponse.notifyMeIntent?.length ?? 0) > 0 ||
    (metricsResponse.oosImpact?.length ?? 0) > 0 ||
    (metricsResponse.marginByStyle?.length ?? 0) > 0 ||
    (metricsResponse.cogsStructure?.length ?? 0) > 0 ||
    !!metricsResponse.inventoryValuation?.totalStockValue?.value;

  return (
    <div className='space-y-6'>
      {!hasAnyProductData ? (
        <div className='border border-textInactiveColor p-8 text-center'>
          <span className='text-textInactiveColor'>
            No product performance data available for this period. Data appears when there are
            orders and product sales.
          </span>
        </div>
      ) : (
        <>
          {(metricsResponse.sellThroughByDrop?.length ?? 0) > 0 && (
            <details className='border border-textInactiveColor' open>
              <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
                Drops
              </summary>
              <div className='space-y-6 p-4'>
                <DropVerdictTable sellThroughByDrop={metricsResponse.sellThroughByDrop} />
              </div>
            </details>
          )}

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
              What's Selling
            </summary>
            <div className='space-y-6 p-4'>
              {hasProductCharts && <ProductCharts metrics={metrics} />}
              <SlowMoversTable slowMovers={metricsResponse.slowMovers} />
              <DeadStockTable deadStock={metricsResponse.deadStock} />
            </div>
          </details>

          {((metricsResponse.marginByStyle?.length ?? 0) > 0 ||
            (metricsResponse.cogsStructure?.length ?? 0) > 0) && (
            <details className='border border-textInactiveColor' open>
              <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
                Margin &amp; COGS
              </summary>
              <div className='space-y-6 p-4'>
                <MarginByStyleTable marginByStyle={metricsResponse.marginByStyle} />
                <CogsStructureTable cogsStructure={metricsResponse.cogsStructure} />
              </div>
            </details>
          )}

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
              Sizes
            </summary>
            <div className='space-y-6 p-4'>
              <SizeAnalyticsTable sizeAnalytics={metricsResponse.sizeAnalytics} />
              <SizeRunEfficiencyTable sizeRunEfficiency={metricsResponse.sizeRunEfficiency} />
            </div>
          </details>

          <details className='border border-textInactiveColor' open>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
              Inventory
            </summary>
            <div className='space-y-6 p-4'>
              <div className='flex justify-end'>
                <InventoryTargetForm />
              </div>
              <ReorderTable inventoryHealth={metricsResponse.inventoryHealth} />
              <InventoryHealthTable inventoryHealth={metricsResponse.inventoryHealth} />
              <InventoryValuationTable inventoryValuation={metricsResponse.inventoryValuation} />
              <NotifyMeIntentTable notifyMeIntent={metricsResponse.notifyMeIntent} />
              <OOSImpactTable oosImpact={metricsResponse.oosImpact} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
