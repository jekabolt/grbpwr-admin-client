import type { GetChannelRoasSettledResponse, GetMetricsResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';
import {
  CampaignAttributionTable,
  ChannelRoasTable,
  ChannelSpendForm,
  CountryMatrix,
  CrossSellTable,
  GeographyCharts,
  NewVsReturningPanel,
  TrafficCharts,
} from '../components';
import { ProductSection } from '../components/ProductSection';
import { countryDisplay } from '../countries';
import {
  formatAvgDaysBetweenOrders,
  formatCurrencyCompact,
  formatNumber,
  getMetricComparison,
  parseDecimal,
} from '../utils';

interface GrowthTabProps {
  metricsResponse: GetMetricsResponse;
  channelRoas?: GetChannelRoasSettledResponse;
}

// Break-even ROAS at a typical apparel margin — the line a channel must clear to pay for itself.
const BREAK_EVEN_ROAS = 1.8;

const channelLabel = (s?: string, m?: string, c?: string) =>
  [s || '(direct)', m, c].filter(Boolean).join(' / ');

/** Collapsed drill-down holding the full tables, matching the app's <details> idiom. */
const Drill: FC<{ summary: string; children: ReactNode }> = ({ summary, children }) => (
  <details className='border border-textInactiveColor'>
    <summary className='cursor-pointer bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase select-none hover:bg-bgSecondary/50'>
      {summary}
    </summary>
    <div className='space-y-4 p-4'>{children}</div>
  </details>
);

const Stat: FC<{
  label: string;
  value: ReactNode;
  sub?: string;
  hero?: boolean;
  tone?: string;
}> = ({ label, value, sub, hero, tone }) => (
  <div className='min-w-0'>
    <Text variant='uppercase' className='text-labelColor block text-[10px]'>
      {label}
    </Text>
    <Text
      className={`font-bold tabular-nums ${hero ? 'text-2xl leading-none' : 'text-lg'} ${tone ?? ''}`}
    >
      {value}
    </Text>
    {sub && (
      <Text variant='uppercase' className='text-labelColor block text-[10px]'>
        {sub}
      </Text>
    )}
  </div>
);

/**
 * Where growth comes from — decision-first, matching the approved stub grammar (ProductSection):
 * repeat economics (DB-true) → what to bundle → channels/ROAS → geography. GA4/channel signals stay
 * flagged directional; full tables move into drill-downs.
 */
export function GrowthTab({ metricsResponse, channelRoas }: GrowthTabProps) {
  const { canReadCosting } = usePermissions();
  const metrics = metricsResponse.business;
  const commerce = metrics?.commerce;
  const sampleSize = commerce?.clvDistribution?.sampleSize ?? 0;

  const repeatRate = getMetricComparison(commerce?.repeatCustomersRate as any);
  const ordersPerCustomer = getMetricComparison(commerce?.avgOrdersPerCustomer as any);
  const daysBetweenOrders = getMetricComparison(commerce?.avgDaysBetweenOrders as any);
  const uniqueBuyers = getMetricComparison(commerce?.uniqueCustomers as any);
  const split = commerce?.newVsReturning;
  const newShare = split?.newRevenueSharePct ?? null;
  const hasRepeat =
    repeatRate.value > 0 || ordersPerCustomer.value > 0 || uniqueBuyers.value > 0 || !!split;

  // Cross-sell pairs — same gating as the full table (real support + lift), ranked by lift.
  const allPairs = commerce?.crossSellPairs ?? [];
  const hasLift = allPairs.some((p) => p.lift != null);
  const topPairs = allPairs
    .filter((p) => (p.count ?? 0) >= 3)
    .filter((p) => (hasLift ? (p.lift ?? 0) >= 1 : true))
    .sort((a, b) => (hasLift ? (b.lift ?? 0) - (a.lift ?? 0) : (b.count ?? 0) - (a.count ?? 0)))
    .slice(0, 6);

  // Channels — blended MER + per-channel settled ROAS.
  const chRows = channelRoas?.rows ?? [];
  const currency = channelRoas?.baseCurrency || 'EUR';
  const spendRows = chRows.filter((r) => r.hasSpend);
  const totalSpend = spendRows.reduce((s, r) => s + parseDecimal(r.spend), 0);
  const totalRevenue = chRows.reduce((s, r) => s + parseDecimal(r.settledRevenue), 0);
  const paidRevenue = spendRows.reduce((s, r) => s + parseDecimal(r.settledRevenue), 0);
  const mer = totalSpend > 0 ? totalRevenue / totalSpend : null;
  const roasBars = spendRows
    .map((r) => ({
      label: channelLabel(r.utmSource, r.utmMedium, r.utmCampaign),
      roas: r.roas ?? 0,
    }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 6);
  const maxRoas = Math.max(...roasBars.map((b) => b.roas), BREAK_EVEN_ROAS);
  const hasChannels = chRows.length > 0;

  // Geography — top-2 revenue concentration for the verdict.
  const econ = metricsResponse.geography?.economicsByCountry ?? [];
  const geoSorted = [...econ].sort((a, b) => parseDecimal(b.revenue) - parseDecimal(a.revenue));
  const geoTotal = geoSorted.reduce((s, r) => s + parseDecimal(r.revenue), 0);
  const top2 = geoSorted.slice(0, 2);
  const top2Share =
    geoTotal > 0 ? (top2.reduce((s, r) => s + parseDecimal(r.revenue), 0) / geoTotal) * 100 : 0;
  const geoNames = top2.map((r) => countryDisplay(r.country).name).filter(Boolean);
  const geoVerdict =
    geoNames.length >= 2 && top2Share > 0
      ? `${geoNames.join(' + ')} = ${top2Share.toFixed(0)}% of revenue — shipping & returns economics matter most there.`
      : 'Top markets by real (DB) revenue.';
  const hasGeo = econ.length > 0 || (metricsResponse.geography?.byCountry?.length ?? 0) > 0;

  return (
    <div className='space-y-8'>
      {hasRepeat && (
        <ProductSection
          title='Repeat economics'
          subtitle='— do buyers come back? the cheapest growth'
          verdict={`Repeat rate ${repeatRate.value.toFixed(0)}%${
            newShare != null
              ? newShare >= 50
                ? ', growth still new-led'
                : ', repeat carries the revenue'
              : ''
          }.`}
        >
          {sampleSize > 0 && sampleSize < 30 && (
            <div className='mb-3 border border-warning bg-bgSecondary p-2'>
              <Text className='text-warning text-textBaseSize'>
                Low sample (n={sampleSize}): directional only, not statistically reliable yet.
              </Text>
            </div>
          )}
          <div className='mb-4 grid grid-cols-2 gap-3 md:grid-cols-4'>
            <Stat
              label='Repeat rate'
              value={`${repeatRate.value.toFixed(0)}%`}
              sub='ordered before'
              hero
            />
            <Stat
              label='Orders / customer'
              value={ordersPerCustomer.value.toFixed(1)}
              sub='lifetime avg'
            />
            <Stat
              label='Days to 2nd order'
              value={
                daysBetweenOrders.value > 0
                  ? formatAvgDaysBetweenOrders(daysBetweenOrders.value)
                  : '—'
              }
              sub='avg gap'
            />
            {uniqueBuyers.value > 0 && (
              <Stat
                label='Unique buyers'
                value={formatNumber(uniqueBuyers.value)}
                sub='this period'
              />
            )}
          </div>
          <NewVsReturningPanel split={split} />
        </ProductSection>
      )}

      {topPairs.length > 0 && (
        <ProductSection
          title='Bought together'
          subtitle='— what to bundle / recommend'
          verdict={`Bundle ${topPairs[0].productAName} + ${topPairs[0].productBName}${
            topPairs[0].lift != null
              ? ` — bought together ${topPairs[0].lift.toFixed(1)}× more than chance`
              : ''
          }.`}
        >
          <div className='flex flex-wrap gap-2'>
            {topPairs.map((p, i) => (
              <span
                key={i}
                className='border border-textInactiveColor px-2.5 py-1.5 text-textBaseSize'
              >
                <span className='font-bold'>{p.productAName}</span> +{' '}
                <span className='font-bold'>{p.productBName}</span>
                {p.lift != null && (
                  <span className='text-success font-bold'> · {p.lift.toFixed(1)}×</span>
                )}
              </span>
            ))}
          </div>
          <div className='mt-3'>
            <Drill summary='Full cross-sell table'>
              <CrossSellTable metrics={metrics} />
            </Drill>
          </div>
        </ProductSection>
      )}

      {hasChannels && (
        <ProductSection
          title='Channels & spend'
          subtitle='— is paid making money back? (settled revenue)'
          verdict={
            mer != null
              ? `Blended MER ${mer.toFixed(1)}× — ${mer >= BREAK_EVEN_ROAS ? 'paid is making money back' : 'paid is below break-even'}.`
              : 'Enter ad spend to see ROAS / MER.'
          }
        >
          <div className='mb-3 flex justify-end'>
            <ChannelSpendForm />
          </div>
          <div className='grid grid-cols-3 border border-textInactiveColor bg-bgSecondary/30'>
            <div className='border-r border-textInactiveColor px-3 py-2'>
              <Text variant='uppercase' className='text-labelColor block text-[10px]'>
                Blended MER
              </Text>
              <Text
                className={`text-lg font-bold tabular-nums ${mer != null && mer >= BREAK_EVEN_ROAS ? 'text-success' : ''}`}
              >
                {mer != null ? `${mer.toFixed(1)}×` : '—'}
              </Text>
              <Text variant='uppercase' className='text-labelColor block text-[10px]'>
                revenue / ad spend
              </Text>
            </div>
            <div className='border-r border-textInactiveColor px-3 py-2'>
              <Text variant='uppercase' className='text-labelColor block text-[10px]'>
                Ad spend
              </Text>
              <Text className='text-lg font-bold tabular-nums'>
                {formatCurrencyCompact(totalSpend, currency)}
              </Text>
            </div>
            <div className='px-3 py-2'>
              <Text variant='uppercase' className='text-labelColor block text-[10px]'>
                Paid revenue
              </Text>
              <Text className='text-lg font-bold tabular-nums'>
                {formatCurrencyCompact(paidRevenue, currency)}
              </Text>
            </div>
          </div>
          {roasBars.length > 0 && (
            <div className='mt-3 space-y-1'>
              {roasBars.map((b, i) => (
                <div key={i} className='grid grid-cols-[130px_1fr_52px] items-center gap-2'>
                  <span className='truncate font-bold'>{b.label}</span>
                  <span className='h-3 bg-bgSecondary'>
                    <span
                      className={`block h-3 ${b.roas >= BREAK_EVEN_ROAS ? 'bg-success' : 'bg-textColor'}`}
                      style={{ width: `${(b.roas / maxRoas) * 100}%` }}
                    />
                  </span>
                  <span className='text-right font-bold tabular-nums'>{b.roas.toFixed(1)}×</span>
                </div>
              ))}
              <Text variant='uppercase' className='text-labelColor mt-1 block text-[10px]'>
                settled ROAS by channel · green ≥ {BREAK_EVEN_ROAS}× break-even
              </Text>
            </div>
          )}
          <div className='mt-3'>
            <Drill summary='Full channel ROAS & campaign attribution'>
              <ChannelRoasTable data={channelRoas} />
              <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />
              <TrafficCharts metrics={metrics} />
            </Drill>
          </div>
          <Text className='text-labelColor text-textBaseSize mt-3 block leading-relaxed'>
            Channel data is GA4-sourced and directional at boutique traffic — sampling, consent
            gaps, bots and last-click attribution make daily lines and micro-conversion rates
            unreliable, so only channel mix, spend/ROAS and DB revenue-by-country are shown.
          </Text>
        </ProductSection>
      )}

      {hasGeo && (
        <ProductSection
          title='Geography'
          subtitle='— top markets by real (DB) revenue'
          verdict={geoVerdict}
        >
          <CountryMatrix geography={metricsResponse.geography} canReadCosting={canReadCosting} />
          <div className='mt-3'>
            <Drill summary='Traffic & geography charts'>
              <GeographyCharts metrics={metrics} geography={metricsResponse.geography} />
            </Drill>
          </div>
        </ProductSection>
      )}
    </div>
  );
}
