import type { CompareMode } from 'api/proto-http/admin';
import { subDays } from 'date-fns';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { DateRangePicker, PersistentKpiBar } from './components';
import {
  AudienceTab,
  CustomerTab,
  ProductsTab,
  RevenueTab,
  TechnicalTab,
  ThisWeekTab,
  TrafficTab,
} from './tabs';
import type { MetricsPeriod } from './useMetricsQuery';
import type { MetricsTabId } from './useTabMetricsQuery';
import { useTabMetricsQuery } from './useTabMetricsQuery';

const MAIN_TAB_IDS: MetricsTabId[] = [
  'today-week',
  'sales-funnel',
  'products-inventory',
  'audience',
  'channels-campaigns',
];

const ALL_TAB_IDS: MetricsTabId[] = [
  ...MAIN_TAB_IDS,
  'technical',
];

const TAB_LABELS: Record<MetricsTabId, string> = {
  'today-week': 'Today & This Week',
  'sales-funnel': 'Sales & Funnel',
  'products-inventory': 'Products & Inventory',
  audience: 'Audience',
  'channels-campaigns': 'Channels & Campaigns',
  technical: 'Site Health',
};

function getDefaultCustomRange() {
  const to = new Date();
  const from = subDays(to, 6);
  return { from, to };
}

function parseTabFromUrl(tabParam: string | null): MetricsTabId {
  if (tabParam && ALL_TAB_IDS.includes(tabParam as MetricsTabId)) {
    return tabParam as MetricsTabId;
  }
  return 'today-week';
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
        <PersistentKpiBar metrics={metricsResponse?.business} compareEnabled={compareEnabled} />
      </div>

      <div className='border-b border-textInactiveColor'>
        <nav className='flex gap-1 overflow-x-auto' aria-label='Metrics tabs'>
          {MAIN_TAB_IDS.map((tabId) => (
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
        <>
          <div className='space-y-6'>
            {activeTab === 'today-week' && (
              <ThisWeekTab
                metricsResponse={metricsResponse}
                compareEnabled={compareEnabled}
                period={period}
                compareMode={compareMode}
                customFrom={customFrom}
                customTo={customTo}
              />
            )}
            {activeTab === 'sales-funnel' && (
              <RevenueTab metricsResponse={metricsResponse} compareEnabled={compareEnabled} />
            )}
            {activeTab === 'products-inventory' && <ProductsTab metricsResponse={metricsResponse} />}
            {activeTab === 'audience' && (
              <AudienceTab metricsResponse={metricsResponse} compareEnabled={compareEnabled} />
            )}
            {activeTab === 'channels-campaigns' && (
              <TrafficTab metricsResponse={metricsResponse} compareEnabled={compareEnabled} />
            )}
            {activeTab === 'technical' && <TechnicalTab metricsResponse={metricsResponse} />}
          </div>

          <div className='mt-12 pt-6 border-t border-textInactiveColor/40'>
            <button
              type='button'
              onClick={() => setActiveTab('technical')}
              className='text-xs text-textInactiveColor hover:text-textColor underline underline-offset-2 flex items-center gap-1'
            >
              <span>⚙</span>
              <span>{TAB_LABELS.technical}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
