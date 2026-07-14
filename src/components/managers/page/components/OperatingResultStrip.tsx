import type { GetDashboardResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface Ga4CoverageNoteProps {
  dashboard: GetDashboardResponse | undefined;
}

// Below this GA4-vs-DB coverage, attribution is leaky enough that channel ROAS reads low —
// nudge the operator to divide by coverage. (Server also raises a low_ga4_tracking_coverage alert.)
const GA4_COVERAGE_HINT_FLOOR = 80;

// GA4 vs DB revenue coverage note, sourced from GetDashboard (not GetMetrics). NOT costing-gated —
// attribution health is an ops concern for everyone. The operating-result waterfall this file used
// to own now lives in ProfitabilityPanel (from GetMetrics, period-consistent, with compare deltas).
export const OperatingResultStrip: FC<Ga4CoverageNoteProps> = ({ dashboard }) => {
  if (!dashboard) return null;

  const coverage = dashboard.trackingCoveragePct;
  const ga4Revenue = dashboard.ga4Revenue;
  const showGa4 = coverage != null && (coverage > 0 || !!ga4Revenue?.value);
  if (!showGa4) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text size='small'>
        GA4 tracked <span className='font-bold'>{(coverage ?? 0).toFixed(0)}%</span> of DB revenue
        {ga4Revenue?.value
          ? ` (${formatCurrency(parseDecimal(ga4Revenue))} of GA4 purchases)`
          : ''}
      </Text>
      {(coverage ?? 100) < GA4_COVERAGE_HINT_FLOOR && (
        <Text variant='inactive' size='small' className='mt-1 block'>
          Attribution is leaky — real ROAS ≈ shown ÷ coverage. Consent banners / ad-blockers / bot
          filtering eat client-side tracking.
        </Text>
      )}
    </div>
  );
};
