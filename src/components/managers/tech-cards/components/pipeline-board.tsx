import { common_TechCardListItem, common_TechCardStage } from 'api/proto-http/admin';
import { Link, useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import { AuxBadge } from './aux-badge';
import { approvalStateLabel } from './utils';
import { useStylePipeline } from './useTechCardQuery';

// Style pipeline board (screen D2 / gap-01): one column per lifecycle stage with its total count
// and a few preview cards, loaded in a single GetStylePipeline call. Informational — a card jumps
// to the editor; a column's "see all" hands off to the list view pre-filtered by that stage.

// Column order + labels are board-local: IDEA isn't in techCardStageOptions yet (added in W4), so
// stageLabel() would blank it. This fixes the left-to-right flow regardless of server order.
const STAGE_ORDER: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pp' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'prod' },
];
const stageRank = (s?: string) => {
  const i = STAGE_ORDER.findIndex((o) => o.value === s);
  return i === -1 ? STAGE_ORDER.length : i;
};
const stageLabelOf = (s?: string) => STAGE_ORDER.find((o) => o.value === s)?.label ?? '—';

export function PipelineBoard() {
  const { data, isLoading, isError } = useStylePipeline(6);

  if (isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading pipeline…
        </Text>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='uppercase'>
          failed to load the pipeline — refresh to retry
        </Text>
      </div>
    );
  }

  const columns = [...(data?.columns ?? [])].sort(
    (a, b) => stageRank(a.stage) - stageRank(b.stage),
  );
  if (columns.length === 0) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='uppercase'>
          no tech cards
        </Text>
      </div>
    );
  }

  return (
    <div className='flex gap-3 overflow-x-auto pb-2'>
      {columns.map((col) => {
        const cards = col.cards ?? [];
        const count = col.count ?? cards.length;
        const more = count - cards.length;
        return (
          <div
            key={col.stage}
            className='flex w-64 shrink-0 flex-col border border-textInactiveColor'
          >
            <div className='flex items-center justify-between border-b border-textInactiveColor bg-textInactiveColor/20 px-2 py-2'>
              <Text variant='uppercase' size='small'>
                {stageLabelOf(col.stage)}
              </Text>
              <Text variant='inactive' size='small'>
                {count}
              </Text>
            </div>
            <div className='flex flex-col gap-2 p-2'>
              {cards.length === 0 ? (
                <Text variant='inactive' size='small'>
                  empty
                </Text>
              ) : (
                cards.map((c) => <PipelineCard key={c.id} card={c} />)
              )}
              {more > 0 && (
                <Link
                  to={`/tech-cards?view=list&stage=${col.stage}`}
                  className='text-textInactiveColor underline hover:text-textColor'
                >
                  <Text variant='inactive' size='small'>
                    see all {count} →
                  </Text>
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCard({ card }: { card: common_TechCardListItem }) {
  const navigate = useNavigate();
  const id = card.id ?? 0;
  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => navigate(`/tech-cards/${id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/tech-cards/${id}`)}
      className='flex cursor-pointer gap-2 border border-textInactiveColor p-1.5 transition-colors hover:bg-highlightColor/5'
    >
      <div className='size-12 shrink-0 overflow-hidden border border-textInactiveColor bg-textInactiveColor/10'>
        {card.previewUrl ? (
          <img src={card.previewUrl} alt='' className='size-full object-cover' loading='lazy' />
        ) : null}
      </div>
      <div className='flex min-w-0 flex-col'>
        <div className='flex items-center gap-1.5'>
          <Text variant='uppercase' size='small' className='truncate'>
            {card.styleNumber || '—'}
          </Text>
          <AuxBadge purpose={card.purpose} />
        </div>
        <Text variant='inactive' size='small' className='truncate'>
          {card.name || '—'}
        </Text>
        <Text variant='inactive' size='small'>
          {approvalStateLabel(card.approvalState)}
        </Text>
      </div>
    </div>
  );
}
