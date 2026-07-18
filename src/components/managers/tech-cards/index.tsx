import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AttentionStrip } from './components/attention-strip';
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

  const toggle = 'border px-3 py-1.5 text-textBaseSize uppercase transition-colors';
  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          tech cards
        </Text>
        <div className='flex items-center gap-2'>
          <div className='flex items-center'>
            <button
              type='button'
              onClick={() => setView('list')}
              className={`${toggle} ${
                view === 'list'
                  ? 'border-textColor text-textColor'
                  : 'border-textInactiveColor text-textInactiveColor hover:text-textColor'
              }`}
            >
              list
            </button>
            <button
              type='button'
              onClick={() => setView('board')}
              className={`${toggle} -ml-px ${
                view === 'board'
                  ? 'border-textColor text-textColor'
                  : 'border-textInactiveColor text-textInactiveColor hover:text-textColor'
              }`}
            >
              board
            </button>
          </div>
          {canWrite(SECTION.techCards) && (
            <>
              <Button size='lg' variant='secondary' className='uppercase' asChild>
                <Link to={`${ROUTES.addTechCard}?stage=TECH_CARD_STAGE_IDEA`}>new idea</Link>
              </Button>
              <Button size='lg' variant='main' className='uppercase' asChild>
                <Link to={ROUTES.addTechCard}>create new</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <AttentionStrip />
      {view === 'board' ? <PipelineBoard /> : <TechCardList />}
    </div>
  );
}
