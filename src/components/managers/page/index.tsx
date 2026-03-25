import type { CompareMode } from 'api/proto-http/admin';
import { subDays } from 'date-fns';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { DateRangePicker } from './components';
import {
  BehaviourTab,
  CustomerTab,
  FunnelTab,
  OverviewTab,
  ProductsTab,
  RevenueTab,
  SiteHealthTab,
  TrafficTab,
} from './tabs';
import type { MetricsPeriod } from './useMetricsQuery';
import type { MetricsTabId } from './useTabMetricsQuery';
import { useTabMetricsQuery } from './useTabMetricsQuery';

const TAB_IDS: MetricsTabId[] = [
  'overview',
  'revenue',
  'funnel',
  'customers',
  'products',
  'traffic',
  'site-health',
  'behaviour',
];

const TAB_LABELS: Record<MetricsTabId, string> = {
  overview: 'Overview',
  revenue: 'Revenue & Sales',
  funnel: 'Conversion Funnel',
  customers: 'Customers',
  products: 'Products & Inventory',
  traffic: 'Traffic & Marketing',
  'site-health': 'Site Health',
  behaviour: 'Behaviour',
};

function getDefaultCustomRange() {
  const to = new Date();
  const from = subDays(to, 6);
  return { from, to };
}

function parseTabFromUrl(tabParam: string | null): MetricsTabId {
  if (tabParam && TAB_IDS.includes(tabParam as MetricsTabId)) {
    return tabParam as MetricsTabId;
  }
  return 'overview';
}

export function Analitic() {
  const defaultCustom = getDefaultCustomRange();
  const [period, setPeriod] = useState<MetricsPeriod>('7d');
  const [compareMode, setCompareMode] = useState<CompareMode>('COMPARE_MODE_PREVIOUS_PERIOD');
  const [customFrom, setCustomFrom] = useState(defaultCustom.from);
  const [customTo, setCustomTo] = useState(defaultCustom.to);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = parseTabFromUrl(tabParam);

  const setActiveTab = (tabId: MetricsTabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tabId);
        return next;
      },
      { replace: true },
    );
  };

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

  const { data: metricsResponse, isLoading, isError, refetch } = useTabMetricsQuery(
    activeTab,
    period,
    {
      compareMode,
      customFrom: period === 'custom' ? customFrom : undefined,
      customTo: period === 'custom' ? customTo : undefined,
    },
  );

  const compareEnabled = compareMode !== 'COMPARE_MODE_NONE';

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

      <div className='border-b border-textInactiveColor'>
        <nav className='flex gap-1 overflow-x-auto' aria-label='Metrics tabs'>
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              type='button'
              onClick={() => setActiveTab(tabId)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tabId
                  ? 'border-textColor text-textColor'
                  : 'border-transparent text-textInactiveColor hover:text-textColor'
              }`}
            >
              {TAB_LABELS[tabId]}
            </button>
          ))}
        </nav>
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
        <div className='space-y-6'>
          {activeTab === 'overview' && (
            <OverviewTab metricsResponse={metricsResponse} compareEnabled={compareEnabled} />
          )}
          {activeTab === 'revenue' && <RevenueTab metricsResponse={metricsResponse} />}
          {activeTab === 'funnel' && <FunnelTab metricsResponse={metricsResponse} />}
          {activeTab === 'customers' && <CustomerTab metricsResponse={metricsResponse} />}
          {activeTab === 'products' && <ProductsTab metricsResponse={metricsResponse} />}
          {activeTab === 'traffic' && <TrafficTab metricsResponse={metricsResponse} />}
          {activeTab === 'site-health' && <SiteHealthTab metricsResponse={metricsResponse} />}
          {activeTab === 'behaviour' && <BehaviourTab metricsResponse={metricsResponse} />}
        </div>
      )}
    </div>
  );
}
