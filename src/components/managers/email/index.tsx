import { common_EmailCampaignStatus, common_EmailCampaignTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { STATUS_LABELS, TOPIC_LABELS } from 'constants/email-campaign';
import { ROUTES, SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { CampaignCard } from './components/campaign-card';
import { useCampaignsPaged } from './components/useCampaign';

const STATUS_FILTERS: (common_EmailCampaignStatus | undefined)[] = [
  undefined,
  'EMAIL_CAMPAIGN_STATUS_DRAFT',
  'EMAIL_CAMPAIGN_STATUS_SCHEDULED',
  'EMAIL_CAMPAIGN_STATUS_SENDING',
  'EMAIL_CAMPAIGN_STATUS_PAUSED',
  'EMAIL_CAMPAIGN_STATUS_SENT',
  'EMAIL_CAMPAIGN_STATUS_CANCELLED',
];

const TOPIC_FILTERS: (common_EmailCampaignTopic | undefined)[] = [
  undefined,
  'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER',
  'EMAIL_CAMPAIGN_TOPIC_NEW_ARRIVALS',
  'EMAIL_CAMPAIGN_TOPIC_EVENTS',
];

function FilterRow<T extends string | undefined>({
  values,
  active,
  onChange,
  label,
}: {
  values: T[];
  active: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {values.map((v) => (
        <button
          key={v ?? 'all'}
          type='button'
          onClick={() => onChange(v)}
          className={cn(
            'border px-2 py-1 leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            active === v
              ? 'border-textColor bg-textColor text-bgColor'
              : 'border-textInactiveColor hover:bg-textColor hover:text-bgColor',
          )}
        >
          <Text size='small' variant='uppercase' className={active === v ? '!text-bgColor' : ''}>
            {label(v)}
          </Text>
        </button>
      ))}
    </div>
  );
}

/**
 * Email campaigns LIST page: status/topic filters + a card grid + "+ new
 * campaign". Models promo/index.tsx (infinite/paged query + load-more).
 */
export function EmailCampaigns() {
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const [status, setStatus] = useState<common_EmailCampaignStatus | undefined>(undefined);
  const [topic, setTopic] = useState<common_EmailCampaignTopic | undefined>(undefined);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCampaignsPaged({ status, topic });

  const campaigns = data?.pages.flatMap((p) => p.campaigns) ?? [];
  const canCreate = canWrite(SECTION.marketing);

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='large'>
          email campaigns
        </Text>
        {canCreate && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => navigate(`${ROUTES.emailCampaigns}/new`)}
          >
            + new campaign
          </Button>
        )}
      </div>

      <div className='flex flex-col gap-3'>
        <FilterRow
          values={STATUS_FILTERS}
          active={status}
          onChange={setStatus}
          label={(v) => (v ? STATUS_LABELS[v as keyof typeof STATUS_LABELS] : 'all statuses')}
        />
        <FilterRow
          values={TOPIC_FILTERS}
          active={topic}
          onChange={setTopic}
          label={(v) => (v ? TOPIC_LABELS[v as keyof typeof TOPIC_LABELS] : 'all topics')}
        />
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading campaigns…
          </Text>
        </div>
      ) : isError ? (
        <div className='flex flex-col items-center gap-3 py-20'>
          <Text variant='error'>couldn&apos;t load campaigns.</Text>
          <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='label'>no campaigns yet.</Text>
        </div>
      ) : (
        <>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
          {hasNextPage && (
            <div className='flex justify-center py-2'>
              <Button
                type='button'
                size='lg'
                variant='secondary'
                className='uppercase'
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'loading…' : 'load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default EmailCampaigns;
