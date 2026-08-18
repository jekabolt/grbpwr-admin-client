import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { AttentionBadge } from './components/attention-badge';
import { FabricDirectionReport } from './components/fabric-direction-report';
import { PipelineBoard } from './components/pipeline-board';
import { TechCardList } from './components/tech-card-list';
import { openLines, useFabricDirectionGapCounts } from './components/useFabricDirectionGaps';

type View = 'list' | 'board' | 'direction';

export function TechCards() {
  const { canRead, canWrite } = usePermissions();
  // The view lives in the URL (R-1) so a board link is shareable and the spine's "see all" hand-off
  // can target the list. Each view is its own read of the same population, not a re-layout of one:
  // list = ListTechCards, board = GetStylePipeline (W2.9), direction =
  // ListTechCardFabricDirectionGaps (Ф1.8) — the кампания Д1 worklist.
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const view: View = viewParam === 'board' || viewParam === 'direction' ? viewParam : 'list';
  const setView = (v: View) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === 'list') p.delete('view');
        else p.set('view', v);
        // The direction worklist's own filter is meaningless on the other two views, and a stale
        // ?inactive= left behind would silently re-arm on the way back.
        if (v !== 'direction') p.delete('inactive');
        return p;
      },
      { replace: true },
    );

  // The campaign's remaining count, on the chip that opens it: the ONE bounded call
  // (counts_only + include_inactive), so the room states how much of Д1 is left without anybody
  // opening the worklist. Zero prints nothing — a `0` badge would read as a broken counter rather
  // than as a finished campaign, and the chip is still there to say so when clicked.
  const gapCounts = useFabricDirectionGapCounts(canRead(SECTION.techCards));
  const openDirectionLines = openLines(gapCounts.data);

  return (
    <div className='flex flex-col gap-2.5 pb-16'>
      {/* 6.3 — title, view toggle, the attention counter and the page actions on one bar. */}
      <Toolbar>
        <Text component='h1' variant='uppercase' tracking='section' className='font-bold'>
          tech cards
        </Text>
        <ChipRow>
          <Chip
            selected={view === 'list'}
            pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            list
          </Chip>
          <Chip
            selected={view === 'board'}
            pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            board
          </Chip>
          <Chip
            selected={view === 'direction'}
            pressed={view === 'direction'}
            onClick={() => setView('direction')}
            title='campaign D1 — BOM lines still waiting for a fabric direction'
          >
            direction{openDirectionLines > 0 ? ` ${openDirectionLines}` : ''}
          </Chip>
        </ChipRow>
        <ToolbarSpacer />
        <AttentionBadge />
        {canWrite(SECTION.techCards) && (
          <>
            <Button size='sm' variant='secondary' asChild>
              <Link to={`${ROUTES.addTechCard}?stage=TECH_CARD_STAGE_IDEA`}>new idea</Link>
            </Button>
            <Button size='sm' variant='main' asChild>
              <Link to={ROUTES.addTechCard}>create new</Link>
            </Button>
          </>
        )}
      </Toolbar>

      {view === 'board' ? (
        <PipelineBoard />
      ) : view === 'direction' ? (
        <FabricDirectionReport />
      ) : (
        <TechCardList />
      )}
    </div>
  );
}
