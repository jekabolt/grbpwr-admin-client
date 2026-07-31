import {
  common_CampaignMetricRates,
  common_CampaignVariantMetrics,
  common_EmailCampaignStatus,
} from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { fmtInt, fmtRate, StatTile, toNumber } from './stat-tile';
import { useCampaignMetrics, useDispatchStatus } from './useCampaign';

// Metrics exist only once recipients have been materialized & attempted.
const METRICS_STATUSES: common_EmailCampaignStatus[] = [
  'EMAIL_CAMPAIGN_STATUS_SENDING',
  'EMAIL_CAMPAIGN_STATUS_PAUSED',
  'EMAIL_CAMPAIGN_STATUS_SENT',
  'EMAIL_CAMPAIGN_STATUS_CANCELLED',
];

function RateTiles({ rates }: { rates: common_CampaignMetricRates | undefined }) {
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
      <StatTile label='delivery' value={fmtRate(rates?.deliveryRate)} />
      <StatTile label='open rate' value={fmtRate(rates?.openRate)} />
      <StatTile label='click rate' value={fmtRate(rates?.clickRate)} />
      <StatTile label='click-to-open' value={fmtRate(rates?.clickToOpenRate)} tone='muted' />
      <StatTile
        label='bounce rate'
        value={fmtRate(rates?.bounceRate)}
        tone={(rates?.bounceRate || 0) > 0 ? 'error' : 'muted'}
      />
      <StatTile
        label='complaint rate'
        value={fmtRate(rates?.complaintRate)}
        tone={(rates?.complaintRate || 0) > 0 ? 'error' : 'muted'}
      />
    </div>
  );
}

// Per-variant comparison — the variants[] are restricted to the A/B test cohort, so
// this is the subject-vs-content head-to-head. Winner variant id highlights the row.
function VariantComparison({
  variants,
  winnerVariantId,
}: {
  variants: common_CampaignVariantMetrics[];
  winnerVariantId?: number;
}) {
  return (
    <div className='space-y-2'>
      <GroupLabel>A/B variant comparison</GroupLabel>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[560px] border-collapse text-left'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              {['variant', 'sent', 'delivered', 'open', 'click', 'bounce'].map((h) => (
                <th key={h} className='py-2 pr-3'>
                  <Text variant='label' size='small' className='uppercase'>
                    {h}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const isWinner = !!winnerVariantId && v.variantId === winnerVariantId;
              return (
                <tr
                  key={v.variantId}
                  className='border-b border-textInactiveColor/40 tabular-nums'
                >
                  <td className='py-2 pr-3'>
                    <div className='flex items-center gap-2'>
                      <Text size='small' className='uppercase'>
                        {v.label || `#${v.variantId}`}
                      </Text>
                      {isWinner && (
                        <span className='border border-textColor px-1 leading-none'>
                          <Text size='small' variant='uppercase'>
                            winner
                          </Text>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className='py-2 pr-3'>
                    <Text size='small'>{fmtInt(v.counts?.sent)}</Text>
                  </td>
                  <td className='py-2 pr-3'>
                    <Text size='small'>{fmtInt(v.counts?.delivered)}</Text>
                  </td>
                  <td className='py-2 pr-3'>
                    <Text size='small'>{fmtRate(v.rates?.openRate)}</Text>
                  </td>
                  <td className='py-2 pr-3'>
                    <Text size='small'>{fmtRate(v.rates?.clickRate)}</Text>
                  </td>
                  <td className='py-2 pr-3'>
                    <Text size='small'>{fmtRate(v.rates?.bounceRate)}</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CampaignMetrics({
  campaignId,
  status,
  winnerVariantId,
}: {
  campaignId: number;
  status: common_EmailCampaignStatus;
  winnerVariantId?: number;
}) {
  // The campaign detail (where `status` comes from) is not polled, so read the live
  // dispatch status the DispatchPanel is already polling — piggy-backing on its cache
  // (enabled: false = subscribe, never fetch) so the metrics poll below starts when the
  // fan-out starts and stops as soon as it finishes.
  const liveStatus = useDispatchStatus(campaignId, false).data?.status as
    | common_EmailCampaignStatus
    | undefined;
  const effectiveStatus = liveStatus || status;
  const enabled = campaignId > 0 && METRICS_STATUSES.includes(effectiveStatus);
  const {
    data: metrics,
    isLoading,
    isError,
    refetch,
  } = useCampaignMetrics(campaignId, enabled, effectiveStatus);

  if (!enabled) {
    return (
      <Section title='metrics'>
        <Text variant='label' size='small'>
          engagement metrics appear once the campaign starts sending.
        </Text>
      </Section>
    );
  }

  const counts = metrics?.counts;
  const variants = metrics?.variants ?? [];

  return (
    <Section
      title='metrics'
      action={
        isLoading && (
          <Text variant='inactive' size='small' className='animate-pulse'>
            loading…
          </Text>
        )
      }
    >
      {isError ? (
        <div className='flex items-center gap-2'>
          <Text variant='error' size='small'>
            couldn&apos;t load metrics.
          </Text>
          <Button
            type='button'
            variant='secondary'
            className='px-2 py-1'
            onClick={() => refetch()}
          >
            retry
          </Button>
        </div>
      ) : (
        <>
          <RateTiles rates={metrics?.rates} />

          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
            <StatTile label='total' value={fmtInt(counts?.total)} />
            <StatTile label='delivered' value={fmtInt(counts?.delivered)} />
            <StatTile
              label='opened'
              value={fmtInt(counts?.uniqueOpened)}
              sub={`${fmtInt(counts?.totalOpens)} total`}
            />
            <StatTile
              label='clicked'
              value={fmtInt(counts?.uniqueClicked)}
              sub={`${fmtInt(counts?.totalClicks)} total`}
            />
            <StatTile
              label='bounced'
              value={fmtInt(counts?.bounced)}
              tone={(toNumber(counts?.bounced) ?? 0) > 0 ? 'error' : 'muted'}
            />
            <StatTile
              label='complained'
              value={fmtInt(counts?.complained)}
              tone={(toNumber(counts?.complained) ?? 0) > 0 ? 'error' : 'muted'}
            />
            <StatTile label='unsubscribed' value={fmtInt(counts?.unsubscribed)} tone='muted' />
            <StatTile
              label='failed'
              value={fmtInt(counts?.failed)}
              tone={(toNumber(counts?.failed) ?? 0) > 0 ? 'error' : 'muted'}
            />
          </div>

          {variants.length > 0 && (
            <VariantComparison variants={variants} winnerVariantId={winnerVariantId} />
          )}
        </>
      )}
    </Section>
  );
}
