import { common_Fitting, common_TechCardStage } from 'api/proto-http/admin';
import { techCardApprovalStateOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useLocation, Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useSamples } from './useSamples';

// Lifecycle spine (screen D / R-7 / R-8). A hub strip under the tech-card header: a stage stepper
// (informs + jumps stage, never gates), a row of counters that link to the samples tab / fittings
// block / runs list, a data-derived "next:" hint, and quick actions for the next flow step. Counts
// come from already-cheap, cached queries — the spine adds no heavy fetches.

const SPINE_STAGES: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pp' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'prod' },
];

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
  frozen,
  canEdit,
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

      {/* next-hint + quick actions — the next flow step is always one click from the hub. */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {hint ? (
          <Text variant='inactive' size='small'>
            next: {hint}
          </Text>
        ) : (
          <span />
        )}
        {canEdit && (
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={onAddSample}
            >
              + sample
            </Button>
            <Button asChild variant='secondary' size='lg' className='uppercase'>
              <Link
                to={`${ROUTES.addFitting}?techCardId=${techCardId}&returnTo=${encodeURIComponent(
                  returnTo,
                )}`}
              >
                + fitting
              </Link>
            </Button>
            <Button asChild variant='secondary' size='lg' className='uppercase'>
              <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>plan run</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
