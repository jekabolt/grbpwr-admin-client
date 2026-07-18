import type { DeliverySection } from 'api/proto-http/admin';
import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';
import { TimeSeriesChart } from './TimeSeriesChart';

interface DeliveryPanelProps {
  delivery: DeliverySection | undefined;
}

// Below this many orders a duration/rate is inside its own noise — gray it and say why.
const SAMPLE_FLOOR = 10;
// Below this share of shipped→delivered, the averages survivor-bias toward fast deliveries.
const SURVIVORSHIP_FLOOR_PCT = 70;
// Below this ETA coverage, the on-time rate is computed over too thin a base to trust.
const ETA_COVERAGE_FLOOR_PCT = 50;

function fmtDays(v: number): string {
  return `${v.toFixed(1)} d`;
}

// One stage in the lead-time pipeline: a duration attributed to its owner (you vs the carrier).
const Stage: FC<{
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}> = ({ label, value, sub, muted }) => (
  <div className='min-w-[9rem] flex-1 space-y-1'>
    <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
      {label}
    </Text>
    <Text className={`font-bold text-lg ${muted ? 'text-labelColor' : ''}`}>{value}</Text>
    <Text className='text-labelColor text-textBaseSize'>{sub}</Text>
  </div>
);

const Arrow: FC = () => (
  <div className='hidden shrink-0 items-center self-stretch text-textInactiveColor sm:flex' aria-hidden>
    →
  </div>
);

/**
 * Fulfilment lead times + on-time rate. The design centre is attribution: placed→shipped is
 * "your handling" (fixable), shipped→delivered is "carrier transit" (not). Door-to-door leads
 * with the median (outlier-resistant); trust notes flag survivorship and missing ETAs.
 */
export const DeliveryPanel: FC<DeliveryPanelProps> = ({ delivery }) => {
  if (!delivery) return null;

  const shippedN = delivery.shippedSample ?? 0;
  const deliveredN = delivery.deliveredSample ?? 0;
  if (shippedN <= 0 && deliveredN <= 0) return null;

  const toShip = delivery.avgDaysPlacedToShipped ?? 0;
  const transit = delivery.avgDaysShippedToDelivered ?? 0;
  const doorMedian = delivery.medianDaysPlacedToDelivered ?? 0;
  const doorAvg = delivery.avgDaysPlacedToDelivered ?? 0;
  const onTime = delivery.onTimeRatePct ?? 0;
  const onTimeN = delivery.onTimeSample ?? 0;
  const etaCov = delivery.etaCoveragePct ?? 0;
  const deliveredCov = delivery.deliveredCoveragePct ?? 0;

  const shipMuted = shippedN < SAMPLE_FLOOR;
  const deliveredMuted = deliveredN < SAMPLE_FLOOR;
  const showOnTime = onTimeN >= SAMPLE_FLOOR;

  const weekly = delivery.avgDeliveryDaysByWeek ?? [];
  const showTrend = weekly.length >= 3;

  const notes: ReactNode[] = [];
  if (deliveredN > 0 && deliveredCov > 0 && deliveredCov < SURVIVORSHIP_FLOOR_PCT) {
    notes.push(
      <div key='survivorship' className='border border-warning bg-warning/10 p-2'>
        <Text className='text-warning text-textBaseSize'>
          Only {deliveredCov.toFixed(0)}% of shipped orders have reached delivered — durations are
          biased toward the fast ones.
        </Text>
      </div>,
    );
  }
  if (etaCov > 0 && etaCov < ETA_COVERAGE_FLOOR_PCT) {
    notes.push(
      <Text key='eta' className='text-labelColor text-textBaseSize'>
        Only {etaCov.toFixed(0)}% of delivered orders had an ETA set — set ETAs at ship time to make
        on-time meaningful.
      </Text>,
    );
  }
  if (delivery.caveat) {
    notes.push(
      <Text key='caveat' className='text-labelColor text-textBaseSize'>
        {delivery.caveat}
      </Text>,
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-stretch gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
        <Stage
          label='Placed → shipped'
          value={fmtDays(toShip)}
          sub={`your handling · n=${shippedN}`}
          muted={shipMuted}
        />
        <Arrow />
        <Stage
          label='Shipped → delivered'
          value={fmtDays(transit)}
          sub={`carrier transit · n=${deliveredN}`}
          muted={deliveredMuted}
        />
        <Arrow />
        <Stage
          label='Door-to-door'
          value={`${doorMedian.toFixed(1)} d median`}
          sub={`${doorAvg.toFixed(1)} d avg · n=${deliveredN}`}
          muted={deliveredMuted}
        />
        {showOnTime && (
          <>
            <Arrow />
            <Stage
              label='On-time'
              value={`${onTime.toFixed(0)}%`}
              sub={`on/before ETA · n=${onTimeN}`}
            />
          </>
        )}
      </div>

      {notes.length > 0 && <div className='space-y-2'>{notes}</div>}

      {showTrend && (
        <div className='max-w-xl'>
          <TimeSeriesChart
            title='Door-to-door days by week'
            data={weekly}
            valueFormat='number'
            unit='d'
            decimals={1}
            showCount
          />
        </div>
      )}
    </div>
  );
};
