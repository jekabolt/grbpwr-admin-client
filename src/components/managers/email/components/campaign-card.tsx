import { common_EmailCampaignFull, common_EmailCampaignStatus } from 'api/proto-http/admin';
import { STATUS_LABELS, TOPIC_LABELS } from 'constants/email-campaign';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import { epochSecondsToRfc3339 } from './map-schema-to-campaign';

// Brand-token status chips: gray for inert states, warning (amber) for in-flight,
// red only for cancelled (loss). No coral/pastel washes.
const STATUS_CHIP: Record<common_EmailCampaignStatus, string> = {
  EMAIL_CAMPAIGN_STATUS_UNKNOWN: 'border-textInactiveColor text-textInactiveColor',
  EMAIL_CAMPAIGN_STATUS_DRAFT: 'border-textInactiveColor text-textInactiveColor',
  EMAIL_CAMPAIGN_STATUS_SCHEDULED: 'border-warning text-warning',
  EMAIL_CAMPAIGN_STATUS_SENDING: 'border-warning text-warning',
  EMAIL_CAMPAIGN_STATUS_PAUSED: 'border-textInactiveColor text-textInactiveColor',
  EMAIL_CAMPAIGN_STATUS_SENT: 'border-textColor text-textColor',
  EMAIL_CAMPAIGN_STATUS_CANCELLED: 'border-error text-error',
};

function fmtDate(epoch: number | string | undefined): string {
  const iso = epochSecondsToRfc3339(epoch);
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function CampaignCard({ campaign }: { campaign: common_EmailCampaignFull }) {
  const navigate = useNavigate();
  const status = (campaign.status || 'EMAIL_CAMPAIGN_STATUS_UNKNOWN') as common_EmailCampaignStatus;
  const subject =
    campaign.variants?.[0]?.subjectI18n?.find((s) => s?.languageId === 1)?.subject ||
    campaign.variants?.[0]?.subjectI18n?.[0]?.subject ||
    '';

  const scheduled = fmtDate(campaign.scheduleAt);
  const sent = fmtDate(campaign.sentAt);
  const when =
    status === 'EMAIL_CAMPAIGN_STATUS_SENT' && sent
      ? `sent ${sent}`
      : scheduled
        ? `scheduled ${scheduled}`
        : 'not scheduled';

  return (
    <button
      type='button'
      onClick={() => navigate(`${ROUTES.emailCampaigns}/${campaign.id}`)}
      className='group flex h-full flex-col gap-3 border border-textInactiveColor p-4 text-left transition-colors hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
    >
      <div className='flex items-start justify-between gap-2'>
        <Text variant='uppercase' className='truncate group-hover:text-bgColor'>
          {campaign.name || 'untitled campaign'}
        </Text>
        <span
          className={cn(
            'shrink-0 border px-1.5 py-0.5 leading-none group-hover:border-bgColor group-hover:text-bgColor',
            STATUS_CHIP[status],
          )}
        >
          <Text size='small' variant='uppercase' className='group-hover:text-bgColor'>
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'unknown'}
          </Text>
        </span>
      </div>

      {subject && (
        <Text size='small' className='line-clamp-2 group-hover:text-bgColor'>
          {subject}
        </Text>
      )}

      <div className='mt-auto flex flex-wrap items-center gap-x-3 gap-y-1'>
        <Text variant='label' size='small' className='group-hover:text-bgColor'>
          {campaign.topic
            ? TOPIC_LABELS[campaign.topic as keyof typeof TOPIC_LABELS] ?? 'topic'
            : 'topic'}
        </Text>
        <Text variant='label' size='small' className='group-hover:text-bgColor'>
          {campaign.segmentId ? `segment #${campaign.segmentId}` : 'everyone'}
        </Text>
        <Text variant='label' size='small' className='group-hover:text-bgColor'>
          {when}
        </Text>
      </div>
    </button>
  );
}
