import { common_TechCardStage } from 'api/proto-http/admin';
import { useTechCardReadiness } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardApprovalStateOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { Link, useLocation } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Placeholder } from 'ui/components/placeholder';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

// Lifecycle spine (screen D / R-7 / R-8). A hub strip under the tech-card header: a read-only stage
// stepper (a progress display — stage/approval are edited in the header selects), followed by a
// CHECKLIST of what the card still needs to enter its NEXT stage.
//
// The checklist is the SERVER's (GetTechCardReadiness): which conditions exist, whether each is met,
// and the factual reason an unmet one failed all arrive over the wire, scored against the saved card.
// This file used to carry that table itself, guessing at rules the backend did not model; the only
// opinion left here is WHERE a row gets fixed, which is navigation and can never come from the API.
//
// The RPC is advisory and so is this strip: nothing here disables the stage select or blocks a save.
// The checklist is scored against the SAVED stage, so an unsaved stage change can leave the stepper
// one step ahead of it — that is what the `unsaved` pill is for.

const SPINE_STAGES: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pre-prod' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'production' },
];

// The quick actions that actually matter, primary first: early stages don't plan production runs,
// late stages don't book fittings. The strip surfaces only the ONE next step, instead of parking
// all three buttons on every card (screen D clutter).
type ActionKey = 'sample' | 'fitting' | 'fittings-unresolved' | 'run';

// Where a requirement gets fixed, keyed by the server's stable `key`. The backend names the
// condition and judges it; which button or tab clears it is this admin's navigation, so the mapping
// stays client-side. A key with no entry renders as a plain row — a requirement added server-side
// later shows up as advice with no affordance, never as a crash or a blank line.
const REQ_ACTION: Record<string, ActionKey> = {
  first_sample: 'sample',
  sms_sample: 'sample',
  pp_sample: 'sample',
  fitting_recorded: 'fitting',
  fit_approved: 'fitting',
  fittings_resolved: 'fittings-unresolved',
  run_planned: 'run',
};

const REQ_TAB: Record<string, string> = {
  // Номер стиля живёт в шапке СТУДИИ: карточной шапки как отдельной вкладки больше нет —
  // её блоки стоят первым рядом студии, как в прототипе. Строка `'header'` увела бы
  // человека на вкладку, которой рейл не рисует.
  style_number: 'studio',
  bom_fabric: 'bom',
  bom_linked: 'bom',
  colorway_linked: 'colorways',
  patterns: 'patterns',
  size_range: 'patterns',
  costing: 'costing',
};

const APPROVAL_TONE: Record<string, 'ok' | 'attention' | 'mut' | 'warn'> = {
  TECH_CARD_APPROVAL_STATE_DRAFT: 'mut',
  TECH_CARD_APPROVAL_STATE_IN_REVIEW: 'attention',
  TECH_CARD_APPROVAL_STATE_APPROVED: 'ok',
  TECH_CARD_APPROVAL_STATE_RELEASED: 'ok',
  TECH_CARD_APPROVAL_STATE_OBSOLETE: 'warn',
};

// The reference's 14px `.check-box`: a 1px ink square, filled ink with a white tick once met.
// No primitive carries this shape (`Chip` is a pill, the form checkbox is a whole field), so it
// lives here. Decorative — the row states done/to-do in text for screen readers.
//
// Concatenated, NOT run through `cn`: `cn` is twMerge, which does not know `text-nano` is a size
// token and would discard it as a losing text-colour next to `text-bgColor`.
const CHECKBOX_BASE =
  'flex size-3.5 shrink-0 items-center justify-center border border-textColor text-nano leading-none';

function CheckBox({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`${CHECKBOX_BASE} ${done ? 'bg-textColor text-bgColor' : 'text-transparent'}`}
    >
      ✓
    </span>
  );
}

export function LifecycleStrip({
  techCardId,
  stage,
  approvalState,
  canEdit,
  unsaved,
  planRunDisabled,
  planRunDisabledReason,
  isAuxiliary,
  onAddSample,
  onGoFittings,
  onGoTab,
}: {
  techCardId: number;
  stage: string;
  approvalState: string;
  canEdit: boolean;
  // Stage is edited via the header select; the displayed stage can be an unsaved form value, so
  // flag it — the stepper reads as "not yet persisted" next to the server-scored checklist.
  unsaved?: boolean;
  planRunDisabled?: boolean;
  planRunDisabledReason?: string;
  /** NF-07 auxiliary card: produces a material, links no products — hides the colourway row. */
  isAuxiliary?: boolean;
  onAddSample: () => void;
  onGoFittings: (unresolvedOnly: boolean) => void;
  /** Optional deep-link for rows fixed on a tab rather than by a one-click action. */
  onGoTab?: (tab: string) => void;
}) {
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;

  const { data: readiness, isPending, isError } = useTechCardReadiness(techCardId);

  // A next stage of UNKNOWN means the card is at the END of the lifecycle, not that the server is
  // undecided — and an empty checklist reads as met, so the server sends `nextStageReady: true`
  // there too. Gate the checklist on a REAL next stage, never on that boolean alone.
  const nextStage = readiness?.nextStage;
  const hasNextStage = !!nextStage && nextStage !== 'TECH_CARD_STAGE_UNKNOWN';
  const nextLabel = SPINE_STAGES.find((s) => s.value === nextStage)?.label;

  const rows = (readiness?.nextStageRequirements ?? []).filter(
    // The one fact the readiness RPC cannot know: an NF-07 auxiliary card produces a packaging
    // material and links no products BY DESIGN, so its colourway row would sit permanently unmet.
    // The facts query has no notion of `purpose`; until it does, that row is dropped, not failed.
    (r) => !(isAuxiliary && r.key === 'colorway_linked'),
  );
  // Counted off the VISIBLE rows rather than read from `nextStageReady`: the aux filter above can
  // drop a row, and a summary line that disagrees with the list under it is worse than no summary.
  const openCount = rows.filter((r) => !r.met).length;
  const firstOpenKey = rows.find((r) => !r.met)?.key;

  const approvalLabel =
    techCardApprovalStateOptions.find((o) => o.value === approvalState)?.label ?? '—';
  const activeIndex = SPINE_STAGES.findIndex((s) => s.value === stage);

  // The stage's single next step, attached to the row that wants it. A disabled plan-run keeps its
  // own reason — as visible text on the row, not a tooltip nobody reads.
  const renderAction = (key: ActionKey) => {
    if (key === 'sample') {
      return (
        <Button type='button' variant='underline' size='xs' onClick={onAddSample}>
          + sample
        </Button>
      );
    }
    if (key === 'fitting') {
      return (
        <Button asChild variant='underline' size='xs'>
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
    if (key === 'fittings-unresolved') {
      return (
        <Button type='button' variant='underline' size='xs' onClick={() => onGoFittings(true)}>
          resolve →
        </Button>
      );
    }
    if (planRunDisabled) {
      return (
        <Button type='button' variant='underline' size='xs' disabled>
          plan run
        </Button>
      );
    }
    return (
      <Button asChild variant='underline' size='xs'>
        <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>plan run</Link>
      </Button>
    );
  };

  return (
    <div className='-mx-2.5 flex flex-col gap-1.5 border-b border-borderColor bg-bgColor px-2.5 py-2'>
      {/* Stage stepper — a READ-ONLY progress display of where the card sits in its lifecycle.
          Stage/approval are edited in the header selects (which write the form); this only reflects
          them, so it no longer duplicates that control. */}
      <div className='flex flex-wrap items-center gap-1.5'>
        {SPINE_STAGES.map((s, i) => {
          const active = i === activeIndex;
          const passed = activeIndex >= 0 && i < activeIndex;
          return (
            <div key={s.value} className='flex items-center gap-1.5'>
              {i > 0 && (
                <span aria-hidden className='text-borderColor'>
                  →
                </span>
              )}
              <Text
                component='span'
                size='micro'
                tracking='label'
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'uppercase',
                  active
                    ? 'border-b-2 border-textColor font-bold text-textColor'
                    : passed
                      ? 'text-textColor'
                      : 'text-labelColor',
                )}
              >
                {passed ? `${s.label} ✓` : s.label}
              </Text>
            </div>
          );
        })}
        <Text
          size='micro'
          variant='label'
          component='span'
          tracking='label'
          className='ml-2 uppercase'
        >
          approval
        </Text>
        <Pill tone={APPROVAL_TONE[approvalState] ?? 'mut'}>{approvalLabel}</Pill>
        {unsaved ? <Pill tone='attention'>unsaved — save to keep the stage</Pill> : null}
      </div>

      {/* Stage checklist — the server's answer to "why can't I advance", so it is asked on the spot
          and answered by the same rules the backend reads. A failed or in-flight call shows its own
          state: an all-unmet list would read as real advice and send someone fixing nothing. */}
      {isError ? (
        <Placeholder label='stage checklist could not be loaded' className='h-8' />
      ) : isPending ? (
        <Placeholder label='checking what this stage still needs' className='h-8' />
      ) : hasNextStage ? (
        <div>
          <GroupLabel
            flush
            action={
              openCount > 0 ? (
                <Text size='micro' variant='label' component='span'>
                  {openCount} open
                </Text>
              ) : null
            }
          >
            {`to reach ${nextLabel ?? 'the next stage'}`}
          </GroupLabel>
          {rows.map((r) => {
            const isFirstOpen = !r.met && r.key === firstOpenKey;
            // Only the first unmet row carries an action — exactly the ONE next step the strip has
            // always offered, now attached to the requirement that explains it.
            const reqAction = REQ_ACTION[r.key ?? ''];
            const action = isFirstOpen && canEdit ? reqAction : undefined;
            const tab = isFirstOpen && !reqAction ? REQ_TAB[r.key ?? ''] : undefined;
            // `detail` is the server's factual reason the row failed ("3 of 7 BOM lines have no
            // catalog material") and is sent only when unmet. A blocked plan-run REPLACES it: why
            // you can't act beats why it's unmet, and both at once reads as two problems.
            const why =
              action === 'run' && planRunDisabled ? planRunDisabledReason : r.met ? '' : r.detail;
            return (
              <div key={r.key} className='flex flex-wrap items-center gap-2 py-0.5'>
                <CheckBox done={!!r.met} />
                <span className='sr-only'>{r.met ? 'done' : 'to do'}</span>
                <Text component='span' className='min-w-0'>
                  {r.label}
                </Text>
                {why ? (
                  <Text size='micro' variant='label' component='span' className='min-w-0'>
                    — {why}
                  </Text>
                ) : null}
                <span className='ml-auto flex shrink-0 items-center gap-2'>
                  {action && renderAction(action)}
                  {tab && onGoTab && (
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      onClick={() => onGoTab(tab)}
                    >
                      → {tab}
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
          {openCount === 0 && (
            <Text size='micro' variant='label' className='py-0.5'>
              nothing left on this stage — advance it in the header select.
            </Text>
          )}
        </div>
      ) : null}
    </div>
  );
}
