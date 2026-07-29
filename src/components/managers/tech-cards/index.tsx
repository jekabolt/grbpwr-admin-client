import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { AttentionBadge } from './components/attention-badge';
import { PipelineBoard } from './components/pipeline-board';
import { TechCardList } from './components/tech-card-list';

export function TechCards() {
  const { canWrite } = usePermissions();
  // The list ↔ board view lives in the URL (R-1) so a board link is shareable and the spine's
  // "see all" hand-off can target the list. Board = GetStylePipeline (W2.9).
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const setView = (v: 'list' | 'board') =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === 'board') p.set('view', 'board');
        else p.delete('view');
        return p;
      },
      { replace: true },
    );

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

      {view === 'board' ? <PipelineBoard /> : <TechCardList />}
    </div>
  );
}
