import { common_Fitting, common_TechCardStage } from 'api/proto-http/admin';
import { techCardApprovalStateOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useLocation, Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useSamples } from './useSamples';

// Lifecycle spine (screen D / R-7 / R-8). A hub strip under the tech-card header: a read-only stage
// stepper (a progress display — stage/approval are edited in the header selects it used to
// duplicate), a row of counters that link to the samples tab / fittings block / runs list, and the
// stage's single next-step action (its rationale in the button tooltip). Counts come from
// already-cheap, cached queries — the spine adds no heavy fetches.

const SPINE_STAGES: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pp' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'prod' },
];

// The quick actions that actually matter at each stage, primary first: early stages don't plan
// production runs, late stages don't book fittings. The strip surfaces only the ONE next step,
// instead of parking all three buttons on every card (screen D clutter).
type ActionKey = 'sample' | 'fitting' | 'run';

function stageActions(stage: string, samplesCount: number): ActionKey[] {
  switch (stage) {
    case 'TECH_CARD_STAGE_IDEA':
      return ['sample'];
    case 'TECH_CARD_STAGE_PROTO':
      return samplesCount === 0 ? ['sample', 'fitting'] : ['fitting', 'sample'];
    case 'TECH_CARD_STAGE_FIT':
      return ['fitting', 'sample'];
    case 'TECH_CARD_STAGE_SMS':
      return ['sample'];
    case 'TECH_CARD_STAGE_PP':
      return ['sample', 'run'];
    case 'TECH_CARD_STAGE_PROD':
      return ['run'];
    default:
      return ['sample'];
  }
}

function nextHint(
  stage: string,
  samplesCount: number,
  fittings: common_Fitting[],
  runsCount: number,
  unresolved: number,
): string {
  const latest = fittings[0]?.fitting;
  switch (stage) {
    case 'TECH_CARD_STAGE_IDEA':
      return 'sketch the concept, then sew a proto';
    case 'TECH_CARD_STAGE_PROTO':
      return samplesCount === 0 ? 'sew a proto sample' : 'book a fitting for the proto';
    case 'TECH_CARD_STAGE_FIT':
      if (unresolved > 0)
        return `resolve ${unresolved} fitting change${unresolved === 1 ? '' : 's'}`;
      if (!latest) return 'record a fit-sample fitting';
      if (latest.outcome === 'new_round') {
        const rn = latest.roundNumber ?? 0;
        return rn ? `fitting round ${rn + 1}` : 'another fitting round';
      }
      if (latest.outcome === 'approved') return 'grade sizes & build the tech card';
      return 'log the fitting verdict';
    case 'TECH_CARD_STAGE_SMS':
      return 'prepare the salesman sample';
    case 'TECH_CARD_STAGE_PP':
      return 'sew a PP sample from production fabric';
    case 'TECH_CARD_STAGE_PROD':
      return runsCount === 0 ? 'plan a production run' : 'receive the run into stock';
    default:
      return '';
  }
}

export function LifecycleStrip({
  techCardId,
  stage,
  approvalState,
  productCount,
  canEdit,
  unsaved,
  planRunDisabled,
  planRunDisabledReason,
  onGoSamples,
  onAddSample,
  onGoFittings,
}: {
  techCardId: number;
  stage: string;
  approvalState: string;
  productCount: number;
  canEdit: boolean;
  // Stage is edited via the header select; the displayed stage can be an unsaved form value, so
  // flag it — the stepper reads as "not yet persisted" next to the server-derived counters.
  unsaved?: boolean;
  planRunDisabled?: boolean;
  planRunDisabledReason?: string;
  onGoSamples: () => void;
  onAddSample: () => void;
  onGoFittings: (unresolvedOnly: boolean) => void;
}) {
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;

  const { data: samplesData } = useSamples(techCardId);
  const { data: fittings } = useTechCardFittings(techCardId);
  const { data: runsData } = useProductionRuns(techCardId, '');

  const samplesCount = samplesData?.samples?.length ?? 0;
  const fittingList = fittings ?? [];
  const fittingsCount = fittingList.length;
  const runsCount = runsData?.total ?? runsData?.runs?.length ?? 0;
  const unresolved = fittingList.reduce(
    (n, f) => n + (f.fitting?.changeRequests ?? []).filter((cr) => !cr.resolved).length,
    0,
  );

  const approvalLabel =
    techCardApprovalStateOptions.find((o) => o.value === approvalState)?.label ?? '—';
  const hint = nextHint(stage, samplesCount, fittingList, runsCount, unresolved);
  const actions = canEdit ? stageActions(stage, samplesCount) : [];

  // The stage's single next step — one solid primary button. Its rationale (the former inline
  // "next: …" sentence) rides in the tooltip, so the strip stays quiet while the action is one click
  // away. A disabled plan-run keeps its own reason in the tooltip instead.
  const renderAction = (key: ActionKey, title?: string) => {
    if (key === 'sample') {
      return (
        <Button
          key='sample'
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          title={title}
          onClick={onAddSample}
        >
          + sample
        </Button>
      );
    }
    if (key === 'fitting') {
      return (
        <Button
          key='fitting'
          asChild
          variant='secondary'
          size='lg'
          className='uppercase'
          title={title}
        >
          <Link
            to={`${ROUTES.addFitting}?techCardId=${techCardId}&returnTo=${encodeURIComponent(
              returnTo,
            )}`}
          >
            + fitting
          </Link>
        </Button>
      );
    }
    if (planRunDisabled) {
      return (
        <Button
          key='run'
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled
          title={planRunDisabledReason}
        >
          plan run
        </Button>
      );
    }
    return (
      <Button key='run' asChild variant='secondary' size='lg' className='uppercase' title={title}>
        <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>plan run</Link>
      </Button>
    );
  };

  const counter = 'text-textInactiveColor underline hover:text-textColor';

  return (
    <div className='-mx-2.5 flex flex-col gap-1.5 border-b border-textInactiveColor bg-bgColor px-2.5 py-2'>
      {/* Stage stepper — a READ-ONLY progress display of where the card sits in its lifecycle.
          Stage/approval are edited in the header selects (which write the form); this only reflects
          them, so it no longer duplicates that control. */}
      <div className='flex flex-wrap items-center gap-1'>
        {SPINE_STAGES.map((s, i) => {
          const active = s.value === stage;
          return (
            <div key={s.value} className='flex items-center'>
              {i > 0 && <span className='mx-0.5 text-textInactiveColor'>─</span>}
              <span
                aria-current={active ? 'step' : undefined}
                className={`border px-2 py-0.5 text-textBaseSize uppercase ${
                  active
                    ? 'border-textColor text-textColor'
                    : 'border-transparent text-textInactiveColor'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
        <span className='ml-2 text-textInactiveColor'>·</span>
        <Text variant='inactive' size='small' className='uppercase'>
          approval: {approvalLabel}
        </Text>
        {unsaved ? (
          <Text variant='inactive' size='small' className='uppercase'>
            · unsaved — save the card to keep the stage
          </Text>
        ) : null}
      </div>

      {/* Counters — each links to the section that owns the entity. */}
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-textBaseSize'>
        <button type='button' className={counter} onClick={onGoSamples}>
          samples {samplesCount}
        </button>
        <span className='text-textInactiveColor'>·</span>
        <button type='button' className={counter} onClick={() => onGoFittings(false)}>
          fittings {fittingsCount}
        </button>
        {unresolved > 0 && (
          <button
            type='button'
            className='text-error underline hover:opacity-80'
            onClick={() => onGoFittings(true)}
            title='unresolved fitting change requests — the fix work list'
          >
            ({unresolved} unresolved change{unresolved === 1 ? '' : 's'})
          </button>
        )}
        <span className='text-textInactiveColor'>·</span>
        <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}`} className={counter}>
          runs {runsCount}
        </Link>
        <span className='text-textInactiveColor'>·</span>
        <Text variant='inactive' size='small'>
          products {productCount}
        </Text>
      </div>

      {/* The stage's single next step. The former always-on "next: …" sentence is demoted to this
          button's tooltip, so the strip stays quiet while the action stays one click away. */}
      {actions.length > 0 && (
        <div className='flex justify-end'>{renderAction(actions[0], hint)}</div>
      )}
    </div>
  );
}
