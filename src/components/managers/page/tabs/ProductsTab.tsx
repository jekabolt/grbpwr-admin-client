import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC, ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ClearList,
  CogsStructureTable,
  DeadStockTable,
  DropVerdictTable,
  InventoryHealthTable,
  InventoryTargetForm,
  InventoryValuationTable,
  MarginByStyleTable,
  MoneySummary,
  NotifyMeIntentTable,
  OOSImpactTable,
  ProductCharts,
  ReorderList,
  ReorderTable,
  SizeAnalyticsTable,
  SizeRunEfficiencyTable,
  SizeVerdict,
  SlowMoversTable,
} from '../components';

interface ProductsTabProps {
  metricsResponse: GetMetricsResponse;
}

const has = (n?: number) => (n ?? 0) > 0;

/** Collapsed full-table drill-down under a decision block — the raw rows stay one click away. */
const Drilldown: FC<{ summary: string; children: ReactNode }> = ({ summary, children }) => (
  <details className='border border-textInactiveColor'>
    <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-2 text-textBaseSize font-bold uppercase text-labelColor hover:bg-bgSecondary/50'>
      {summary}
    </summary>
    <div className='space-y-6 p-4'>{children}</div>
  </details>
);

export function ProductsTab({ metricsResponse: r }: ProductsTabProps) {
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
  }, [hash, r]);

  const commerce = r.business?.commerce;
  const hasProductCharts =
    has(commerce?.topProductsByRevenue?.length) ||
    has(commerce?.topProductsByQuantity?.length) ||
    has(commerce?.revenueByCategory?.length);

  const hasReorderData =
    has(r.inventoryHealth?.length) || has(r.notifyMeIntent?.length) || has(r.oosImpact?.length);
  const hasClearData = has(r.slowMovers?.length) || has(r.deadStock?.length);
  const hasMoneyData =
    !!r.inventoryValuation ||
    has(r.marginByStyle?.length) ||
    has(r.cogsStructure?.length) ||
    hasProductCharts;
  const hasSizeData = has(r.sizeRunEfficiency?.length) || has(r.sizeAnalytics?.length);

  const hasAnyProductData =
    has(r.sellThroughByDrop?.length) ||
    hasReorderData ||
    hasClearData ||
    hasMoneyData ||
    hasSizeData;

  if (!hasAnyProductData) {
    return (
      <div className='border border-textInactiveColor p-8 text-center'>
        <span className='text-labelColor'>
          No product performance data available for this period. Data appears when there are orders
          and product sales.
        </span>
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      {/* REORDER — what to restock. */}
      {hasReorderData && (
        <section id='reorder' className='space-y-3'>
          <ReorderList metricsResponse={r} />
          <Drilldown summary='Full reorder & inventory-health tables'>
            <div className='flex justify-end'>
              <InventoryTargetForm />
            </div>
            <ReorderTable inventoryHealth={r.inventoryHealth} />
            <InventoryHealthTable inventoryHealth={r.inventoryHealth} />
            <NotifyMeIntentTable notifyMeIntent={r.notifyMeIntent} />
            <OOSImpactTable oosImpact={r.oosImpact} />
          </Drilldown>
        </section>
      )}

      {/* CLEAR — where cash is frozen. */}
      {hasClearData && (
        <section id='clear' className='space-y-3'>
          <ClearList metricsResponse={r} />
          <Drilldown summary='Full slow-mover & dead-stock tables'>
            <SlowMoversTable slowMovers={r.slowMovers} />
            <DeadStockTable deadStock={r.deadStock} />
          </Drilldown>
        </section>
      )}

      {/* MONEY — cash in stock & margin by style. */}
      {hasMoneyData && (
        <section id='money' className='space-y-3'>
          <MoneySummary metricsResponse={r} />
          <Drilldown summary='Full margin, COGS & valuation tables'>
            {hasProductCharts && <ProductCharts metrics={r.business} />}
            <MarginByStyleTable marginByStyle={r.marginByStyle} />
            <CogsStructureTable cogsStructure={r.cogsStructure} />
            <InventoryValuationTable inventoryValuation={r.inventoryValuation} />
          </Drilldown>
        </section>
      )}

      {/* SIZES — buy verdict, not a bar chart. */}
      {hasSizeData && (
        <section id='sizes' className='space-y-3'>
          <SizeVerdict sizeRunEfficiency={r.sizeRunEfficiency} />
          <Drilldown summary='Full size tables'>
            <SizeRunEfficiencyTable sizeRunEfficiency={r.sizeRunEfficiency} />
            <SizeAnalyticsTable sizeAnalytics={r.sizeAnalytics} />
          </Drilldown>
        </section>
      )}

      {/* DROPS — per-release reprint / hold / cut verdict. */}
      {has(r.sellThroughByDrop?.length) && (
        <section id='drops'>
          <DropVerdictTable sellThroughByDrop={r.sellThroughByDrop} />
        </section>
      )}
    </div>
  );
}
