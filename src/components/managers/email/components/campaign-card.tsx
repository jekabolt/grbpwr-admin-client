import { common_EmailCampaignFull, common_EmailCampaignStatus } from 'api/proto-http/admin';
import { STATUS_LABELS, TOPIC_LABELS } from 'constants/email-campaign';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Close, Text, UndoRow } from 'ui';
import { epochSecondsToRfc3339 } from './map-schema-to-campaign';
import { useDeleteCampaign } from './useCampaign';

// Brand-token status chips: gray for inert states, warning (amber) for in-flight,
// red only for cancelled (loss). No coral/pastel washes.
const STATUS_CHIP: Record<common_EmailCampaignStatus, string> = {
  EMAIL_CAMPAIGN_STATUS_UNKNOWN: 'border-borderColor text-borderColor',
  EMAIL_CAMPAIGN_STATUS_DRAFT: 'border-borderColor text-borderColor',
  EMAIL_CAMPAIGN_STATUS_SCHEDULED: 'border-warning text-warning',
  EMAIL_CAMPAIGN_STATUS_SENDING: 'border-warning text-warning',
  EMAIL_CAMPAIGN_STATUS_PAUSED: 'border-borderColor text-borderColor',
  EMAIL_CAMPAIGN_STATUS_SENT: 'border-textColor text-textColor',
  EMAIL_CAMPAIGN_STATUS_CANCELLED: 'border-error text-error',
};

function fmtDate(epoch: number | string | undefined): string {
  const iso = epochSecondsToRfc3339(epoch);
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
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
  // DELETE WITH UNDO: nothing is sent while the ghost offers undo; the RPC goes out when it runs
  // out (or the card leaves). A failed delete brings the card back (the hook says why).
  const [ghost, setGhost] = useState(false);
  const [gone, setGone] = useState(false);
  const deleteCampaign = useDeleteCampaign();
  const commitDelete = () => {
    setGhost(false);
    setGone(true);
    deleteCampaign.mutate(campaign.id ?? 0, { onError: () => setGone(false) });
  };
  const pending = useRef(ghost);
  pending.current = ghost;
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(
    () => () => {
      if (pending.current) commitRef.current();
    },
    [],
  );
  const status = (campaign.status || 'EMAIL_CAMPAIGN_STATUS_UNKNOWN') as common_EmailCampaignStatus;
  // Only drafts are deletable: the store deletes WHERE status='draft' and maps 0 rows to
  // NotFound, so offering delete on a scheduled/paused/sent/cancelled card produced a
  // misleading "email campaign not found" for a campaign that plainly exists.
  const deletable = status === 'EMAIL_CAMPAIGN_STATUS_DRAFT';
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

  if (gone) return null;
  // Wrapped so the ghost keeps the card's grid cell instead of spanning the row.
  if (ghost)
    return (
      <div className='h-full'>
        <UndoRow
          name={campaign.name || 'untitled campaign'}
          onUndo={() => setGhost(false)}
          onCommit={commitDelete}
        />
      </div>
    );

  return (
    <div className='relative h-full'>
      {deletable && (
        <Close
          size='sm'
          aria-label='delete campaign'
          onClick={(e) => {
            e.stopPropagation();
            setGhost(true);
          }}
          className='absolute right-1.5 top-1.5 z-10 bg-bgColor'
        />
      )}
      <button
        type='button'
        onClick={() => navigate(`${ROUTES.emailCampaigns}/${campaign.id}`)}
        className='group flex h-full w-full flex-col gap-3 border border-borderColor bg-bgColor p-4 text-left transition-colors hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
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
    </div>
  );
}
