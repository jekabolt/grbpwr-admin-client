import { common_TechCardListItem, common_TechCardStage } from 'api/proto-http/admin';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Accordion } from 'ui/components/accordion';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { TechCardTile } from './tech-card-tile';
import { ZERO_TIMESTAMP } from './utils';
import { useStylePipeline } from './useTechCardQuery';

// Style pipeline board (screen D2 / gap-01): the season at a glance — where is everything piling
// up. Loaded in a single GetStylePipeline call. Informational: a card jumps to the editor, a lane's
// "see all" hands off to the list view pre-filtered by that stage.
//
// 6.2 — stages are ROWS, not columns. Six columns forced the whole page sideways on a laptop; a
// swimlane scrolls its own strip instead and leaves room for the per-stage count and age.

// Lane order + labels are board-local so the top-to-bottom flow is fixed regardless of the order
// the server returns the columns in.
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

const DAY = 86_400_000;
const STUCK_DAYS = 14;
const COLLAPSED_KEY = 'techCards.board.collapsed';

function ageDays(timestamp?: string): number {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return 0;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / DAY);
}

// Collapse state is a UI preference, not data — localStorage, not the URL.
function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function PipelineBoard() {
  const { data, isLoading, isError } = useStylePipeline(6);
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  const toggle = (stage: string, open: boolean) => {
    setCollapsed((prev) => {
      const next = open ? prev.filter((s) => s !== stage) : [...new Set([...prev, stage])];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // a private-mode / quota failure must not take the board down
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='label' className='animate-pulse uppercase'>
          loading pipeline…
        </Text>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='label' className='uppercase'>
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
        <Text variant='label' className='uppercase'>
          no tech cards
        </Text>
      </div>
    );
  }

  return (
    // Lanes stack into ONE box: -mt-px collapses each lane's top border into the one above it, so
    // the board reads as a single ruled surface rather than six stacked cards.
    <div className='flex flex-col'>
      {columns.map((col, index) => {
        const cards = col.cards ?? [];
        const count = col.count ?? cards.length;
        const more = count - cards.length;
        const stage = col.stage ?? '';
        // Age is read off the cards this call returned (a per-stage preview, not the whole lane),
        // so it is a floor: "at least these have not moved in N days", never an overstatement.
        const ages = cards.map((c) => ageDays(c.updatedAt));
        const oldest = ages.length ? Math.max(...ages) : 0;
        const stuck = ages.filter((d) => d >= STUCK_DAYS).length;

        return (
          <Accordion
            key={stage}
            className={index > 0 ? '-mt-px' : undefined}
            open={!collapsed.includes(stage)}
            onOpenChange={(open) => toggle(stage, open)}
            title={
              <Text
                size='micro'
                component='span'
                variant='uppercase'
                tracking='group'
                className='font-bold'
              >
                {stageLabelOf(col.stage)}
              </Text>
            }
            meta={
              <>
                <Pill tone='mut'>{count}</Pill>
                {stuck > 0 ? (
                  <Pill tone='warn'>
                    {stuck} stuck {oldest} d
                  </Pill>
                ) : oldest > 0 ? (
                  <Text size='micro' variant='label' component='span'>
                    oldest {oldest} d
                  </Text>
                ) : null}
              </>
            }
          >
            {cards.length === 0 ? (
              <Text size='micro' variant='label' className='uppercase'>
                empty
              </Text>
            ) : (
              <div className='flex gap-1.5 overflow-x-auto'>
                {cards.map((card: common_TechCardListItem) => (
                  <TechCardTile
                    key={card.id}
                    card={card}
                    compact
                    className='w-[110px] shrink-0 grow-0'
                  />
                ))}
                {more > 0 && (
                  <Link
                    to={`/tech-cards?view=list&stage=${stage}`}
                    className='flex shrink-0 items-center px-2 whitespace-nowrap text-micro tracking-label text-labelColor uppercase underline hover:text-textColor'
                  >
                    see all {count} →
                  </Link>
                )}
              </div>
            )}
          </Accordion>
        );
      })}
    </div>
  );
}
