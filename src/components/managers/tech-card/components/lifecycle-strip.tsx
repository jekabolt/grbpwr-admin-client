import { common_Fitting, common_TechCardStage } from 'api/proto-http/admin';
import { techCardApprovalStateOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import {
  useTechCard,
  useTechCardFittings,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useLocation, Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useSamples } from './useSamples';

// Lifecycle spine (screen D / R-7 / R-8). A hub strip under the tech-card header: a stage stepper
// (informs + jumps stage, never gates), a row of counters that link to the samples tab / fittings
// block / runs list, a data-derived "next:" hint, and quick actions for the next flow step. Counts
// come from already-cheap, cached queries — the spine adds no heavy fetches.

const LAB_DIP_APPROVED = 'TECH_CARD_LAB_DIP_STATUS_APPROVED';

const SPINE_STAGES: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pp' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'prod' },
];

// The quick actions that actually matter at each stage, primary first: early stages don't plan
// production runs, late stages don't book fittings. The strip shows the ONE next step prominently
// and de-emphasizes the rest, instead of parking all three buttons on every card (screen D clutter).
type ActionKey = 'sample' | 'fitting' | 'run';
const RELEASE_STAGES = new Set([
  'TECH_CARD_STAGE_SMS',
  'TECH_CARD_STAGE_PP',
  'TECH_CARD_STAGE_PROD',
]);

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
  pendingLabDip: number,
): string {
  // Lab-dip approval gates release; at a release-facing stage, clearing pending lab-dips IS the next
  // step — otherwise the spine reads "done" while release is silently blocked (only visible in History).
  if (pendingLabDip > 0 && RELEASE_STAGES.has(stage)) {
    return `approve ${pendingLabDip} colourway lab-dip${pendingLabDip === 1 ? '' : 's'} to unblock release`;
  }
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
  frozen,
  canEdit,
  unsaved,
  planRunDisabled,
  planRunDisabledReason,
  onStageChange,
  onGoSamples,
  onAddSample,
  onGoFittings,
}: {
  techCardId: number;
  stage: string;
  approvalState: string;
  productCount: number;
  frozen: boolean;
  canEdit: boolean;
  // The stepper writes stage into the FORM — flag it so a clicked stage doesn't read as
  // already persisted next to the server-derived counters.
  unsaved?: boolean;
  planRunDisabled?: boolean;
  planRunDisabledReason?: string;
  onStageChange: (stage: common_TechCardStage) => void;
  onGoSamples: () => void;
  onAddSample: () => void;
  onGoFittings: (unresolvedOnly: boolean) => void;
}) {
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;

  const { data: samplesData } = useSamples(techCardId);
  const { data: fittings } = useTechCardFittings(techCardId);
  const { data: runsData } = useProductionRuns(techCardId, '');
  // Same cached read the rest of the constructor already loaded (R1: techCardId === styleId) — no
  // extra fetch cost; used only for the colourway lab-dip counter below.
  const { data: techCard } = useTechCard(techCardId || undefined);

  const samplesCount = samplesData?.samples?.length ?? 0;
  const fittingList = fittings ?? [];
  const fittingsCount = fittingList.length;
  const runsCount = runsData?.total ?? runsData?.runs?.length ?? 0;
  const unresolved = fittingList.reduce(
    (n, f) => n + (f.fitting?.changeRequests ?? []).filter((cr) => !cr.resolved).length,
    0,
  );
  // Lab-dip approval gates release, but the read-view colourway refs (AdminColorwayRef) don't yet
  // carry labDipStatus — so this is 0 until the backend surfaces it. Wired now so the spine lights
  // up the moment it does, and typed loosely to match that pending backend field. (BACKEND GAP.)
  const colorwaysRef = (techCard?.colorways ?? []) as Array<{ labDipStatus?: string }>;
  const pendingLabDip = colorwaysRef.filter(
    (c) => c.labDipStatus && c.labDipStatus !== LAB_DIP_APPROVED,
  ).length;

  const approvalLabel =
    techCardApprovalStateOptions.find((o) => o.value === approvalState)?.label ?? '—';
  const hint = nextHint(stage, samplesCount, fittingList, runsCount, unresolved, pendingLabDip);
  const actions = canEdit ? stageActions(stage, samplesCount) : [];

  // Primary = the stage's next step: a solid, obvious button. Secondary = a muted underlined link,
  // clearly subordinate — so the strip reads as "do this next" with the rest available but quiet.
  const renderAction = (key: ActionKey, primary: boolean) => {
    const variant = primary ? 'secondary' : 'underline';
    const size = primary ? 'lg' : undefined;
    const cls = primary ? 'uppercase' : 'uppercase text-textInactiveColor hover:text-textColor';
    if (key === 'sample') {
      return (
        <Button
          key='sample'
          type='button'
          variant={variant}
          size={size}
          className={cls}
          onClick={onAddSample}
        >
          + sample
        </Button>
      );
    }
    if (key === 'fitting') {
      return (
        <Button key='fitting' asChild variant={variant} size={size} className={cls}>
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
          variant={variant}
          size={size}
          className={cls}
          disabled
          title={planRunDisabledReason}
        >
          plan run
        </Button>
      );
    }
    return (
      <Button key='run' asChild variant={variant} size={size} className={cls}>
        <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>plan run</Link>
      </Button>
    );
  };

  const counter = 'text-textInactiveColor underline hover:text-textColor';

  return (
    <div className='-mx-2.5 flex flex-col gap-1.5 border-b border-textInactiveColor bg-bgColor px-2.5 py-2'>
      {/* Stage stepper — current stage boxed, click = set stage (a duplicate of the header field). */}
      <div className='flex flex-wrap items-center gap-1'>
        {SPINE_STAGES.map((s, i) => {
          const active = s.value === stage;
          return (
            <div key={s.value} className='flex items-center'>
              {i > 0 && <span className='mx-0.5 text-textInactiveColor'>─</span>}
              <button
                type='button'
                disabled={!canEdit || frozen}
                onClick={() => onStageChange(s.value)}
                className={`border px-2 py-0.5 text-textBaseSize uppercase transition-colors ${
                  active
                    ? 'border-textColor text-textColor'
                    : 'border-transparent text-textInactiveColor hover:text-textColor disabled:hover:text-textInactiveColor'
                }`}
              >
                {s.label}
              </button>
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
        {pendingLabDip > 0 && (
          <>
            <span className='text-textInactiveColor'>·</span>
            <span
              className='text-warning'
              title='colourways awaiting lab-dip approval — gates release'
            >
              ⚠ {pendingLabDip} pending lab-dip
            </span>
          </>
        )}
      </div>

      {/* next-hint + contextual action — the ONE next step is prominent and stage-irrelevant
          actions are hidden, instead of parking sample/fitting/run on every card (screen D clutter). */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {hint ? (
          <Text variant='inactive' size='small'>
            next: {hint}
          </Text>
        ) : (
          <span />
        )}
        {actions.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            {renderAction(actions[0], true)}
            {actions.slice(1).map((k) => renderAction(k, false))}
          </div>
        )}
      </div>
    </div>
  );
}
