import type { GetDashboardResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface OperatingResultStripProps {
  dashboard: GetDashboardResponse | undefined;
}

// Below this GA4-vs-DB coverage, attribution is leaky enough that channel ROAS reads low —
// nudge the operator to divide by coverage. (Server also raises a low_ga4_tracking_coverage alert.)
const GA4_COVERAGE_HINT_FLOOR = 80;

const Line: FC<{ label: string; value: string; strong?: boolean; sub?: string }> = ({
  label,
  value,
  strong,
  sub,
}) => (
  <div className='flex items-baseline justify-between gap-3 py-1'>
    <Text size='small' className={strong ? 'font-bold' : undefined}>
      {label}
      {sub && <span className='text-textInactiveColor'> · {sub}</span>}
    </Text>
    <Text size='small' className={strong ? 'font-bold' : undefined}>
      {value}
    </Text>
  </div>
);

// Operating result waterfall + GA4 coverage, sourced from GetDashboard (not GetMetrics). The
// waterfall is costing-gated (server nulls the cost figures without costing:read); the GA4
// coverage line is NOT gated — attribution health is an ops concern for everyone.
export const OperatingResultStrip: FC<OperatingResultStripProps> = ({ dashboard }) => {
  const { canReadCosting } = usePermissions();
  if (!dashboard) return null;

  const revenue = parseDecimal(dashboard.revenue);
  const grossMargin = parseDecimal(dashboard.grossMargin);
  const contribution = parseDecimal(dashboard.contributionMargin);
  const opex = parseDecimal(dashboard.opexTotal);
  const marketing = parseDecimal(dashboard.marketingSpend);
  const operating = parseDecimal(dashboard.operatingResult);
  const hasWaterfall =
    canReadCosting &&
    (!!dashboard.operatingResult?.value ||
      !!dashboard.contributionMargin?.value ||
      !!dashboard.grossMargin?.value);

  const coverage = dashboard.trackingCoveragePct;
  const ga4Revenue = dashboard.ga4Revenue;
  const showGa4 = coverage != null && (coverage > 0 || !!ga4Revenue?.value);

  if (!hasWaterfall && !showGa4) return null;

  return (
    <div className='space-y-4'>
      {hasWaterfall && (
        <div className='border-2 border-textInactiveColor/20 bg-bgSecondary/30 p-4'>
          <Text variant='uppercase' size='small' className='font-bold mb-2 block'>
            Operating result
          </Text>
          <Line label='Net revenue (ex-VAT)' value={formatCurrency(revenue)} />
          <Line label='= Gross margin' value={formatCurrency(grossMargin)} />
          <Line
            label='= Contribution'
            value={formatCurrency(contribution)}
            sub='to fixed costs, not profit'
          />
          <Line label='− OPEX (fixed costs)' value={`−${formatCurrency(opex)}`} />
          <Line label='− Marketing spend' value={`−${formatCurrency(marketing)}`} />
          <div className='mt-1 border-t border-textInactiveColor pt-1'>
            <Line label='= Operating result' value={formatCurrency(operating)} strong />
          </div>
          {dashboard.opexCaveat && (
            <Text variant='inactive' size='small' className='mt-2 block'>
              {dashboard.opexCaveat}
            </Text>
          )}
          <Text variant='inactive' size='small' className='mt-2 block'>
            operating result = contribution − opex − marketing (EBITDA-ish; not audited profit).
          </Text>
        </div>
      )}

      {showGa4 && (
        <div className='border border-textInactiveColor p-4'>
          <Text size='small'>
            GA4 tracked <span className='font-bold'>{(coverage ?? 0).toFixed(0)}%</span> of DB
            revenue
            {ga4Revenue?.value
              ? ` (${formatCurrency(parseDecimal(ga4Revenue))} of GA4 purchases)`
              : ''}
          </Text>
          {(coverage ?? 100) < GA4_COVERAGE_HINT_FLOOR && (
            <Text variant='inactive' size='small' className='mt-1 block'>
              Attribution is leaky — real ROAS ≈ shown ÷ coverage. Consent banners / ad-blockers /
              bot filtering eat client-side tracking.
            </Text>
          )}
        </div>
      )}
    </div>
  );
};
