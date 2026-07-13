import type { CompareMode } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { subDays } from 'date-fns';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { DateRangePicker, PersistentKpiBar } from './components';
import { AlertSettingsModal } from './components/alert-settings-modal';
import { VatRatesModal } from './components/vat-rates-modal';
import { GrowthTab, ProductsTab, RevenueTab, ThisWeekTab } from './tabs';
import { useChannelRoasQuery } from './useChannelRoasQuery';
import { useDashboardQuery } from './useDashboardQuery';
import type { MetricsPeriod } from './useMetricsQuery';
import type { MetricsTabId } from './useTabMetricsQuery';
import { useTabMetricsQuery } from './useTabMetricsQuery';

// Decision-first order: how are we doing today → are we making money → what to act on → growth.
const TAB_IDS: MetricsTabId[] = ['this-week', 'revenue', 'products', 'growth'];

const TAB_LABELS: Record<MetricsTabId, string> = {
  'this-week': 'Today',
  revenue: 'Revenue & Orders',
  products: 'Products',
  growth: 'Growth',
};

// Legacy deep links from the old 5-tab layout.
const LEGACY_TAB_ALIASES: Record<string, MetricsTabId> = {
  customers: 'growth',
  traffic: 'growth',
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
  if (tabParam && LEGACY_TAB_ALIASES[tabParam]) {
    return LEGACY_TAB_ALIASES[tabParam];
  }
  return 'this-week';
}

export function Analitic() {
  const defaultCustom = getDefaultCustomRange();
  // Default to 30d with compare OFF: 7d + previous-period puts the noisiest possible number
  // (a period-over-period % on a handful of orders) at the top of every screen on open.
  const [period, setPeriod] = useState<MetricsPeriod>('30d');
  const [compareMode, setCompareMode] = useState<CompareMode>('COMPARE_MODE_NONE');
  const [customFrom, setCustomFrom] = useState(defaultCustom.from);
  const [customTo, setCustomTo] = useState(defaultCustom.to);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = parseTabFromUrl(tabParam);

  const { canWrite } = usePermissions();
  const navigate = useNavigate();
  const canConfig = canWrite(SECTION.analytics);
  const [vatOpen, setVatOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

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

  const {
    data: metricsResponse,
    isLoading,
    isError,
    refetch,
  } = useTabMetricsQuery(activeTab, period, {
    compareMode,
    customFrom: period === 'custom' ? customFrom : undefined,
    customTo: period === 'custom' ? customTo : undefined,
  });

  const compareEnabled = compareMode !== 'COMPARE_MODE_NONE';

  // Operating result + GA4 coverage come from GetDashboard, only needed on the Revenue tab.
  const { data: dashboard } = useDashboardQuery(period, {
    enabled: activeTab === 'revenue',
    customFrom: period === 'custom' ? customFrom : undefined,
    customTo: period === 'custom' ? customTo : undefined,
  });

  // Settled-revenue channel ROAS lives on the Growth tab next to GA4 attribution.
  const { data: channelRoas } = useChannelRoasQuery(period, {
    enabled: activeTab === 'growth',
    customFrom: period === 'custom' ? customFrom : undefined,
    customTo: period === 'custom' ? customTo : undefined,
  });

  return (
    <div className='flex flex-col gap-8 pb-16'>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Text variant='uppercase' className='text-lg font-bold'>
            Analytics Dashboard
          </Text>
          {canConfig && (
            <div className='flex items-center gap-2'>
              <Button
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setVatOpen(true)}
              >
                VAT rates
              </Button>
              <Button
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => navigate(ROUTES.opex)}
              >
                OPEX
              </Button>
              <Button
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setAlertsOpen(true)}
              >
                Alerts
              </Button>
            </div>
          )}
        </div>
        <VatRatesModal open={vatOpen} onOpenChange={setVatOpen} />
        <AlertSettingsModal open={alertsOpen} onOpenChange={setAlertsOpen} />
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
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              type='button'
              onClick={() => setActiveTab(tabId)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-textBaseSize font-medium transition-colors ${
                activeTab === tabId
                  ? 'border-textInactiveColor text-textColor'
                  : 'border-transparent text-textInactiveColor hover:text-textColor'
              }`}
            >
              {TAB_LABELS[tabId]}
            </button>
          ))}
        </nav>
      </div>

      {isLoading && (
        <div className='space-y-6' aria-busy='true'>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className='h-20 animate-pulse border border-textInactiveColor bg-textInactiveColor/10'
              />
            ))}
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className='h-56 animate-pulse border border-textInactiveColor bg-textInactiveColor/10'
              />
            ))}
          </div>
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
          {activeTab === 'this-week' && (
            <ThisWeekTab
              metricsResponse={metricsResponse}
              compareEnabled={compareEnabled}
              period={period}
              compareMode={compareMode}
              customFrom={customFrom}
              customTo={customTo}
            />
          )}
          {activeTab === 'revenue' && (
            <RevenueTab
              metricsResponse={metricsResponse}
              compareEnabled={compareEnabled}
              dashboard={dashboard}
            />
          )}
          {activeTab === 'products' && <ProductsTab metricsResponse={metricsResponse} />}
          {activeTab === 'growth' && (
            <GrowthTab metricsResponse={metricsResponse} channelRoas={channelRoas} />
          )}
        </div>
      )}
    </div>
  );
}
