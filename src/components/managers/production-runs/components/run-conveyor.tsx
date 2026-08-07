import { common_ProductionRunStatus } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

// The run conveyor: a production run is five phases long, and the detail page shows the one the
// run is IN — the rest collapse to a line each. This module owns two things: WHERE the run is
// (a pure function over its status), and how the band renders. Nothing here fetches, mutates or
// gates on permissions; the page passes in facts it has already read.

export type RunStepId = 1 | 2 | 3 | 4 | 5;

/**
 * `done` — passed. `current` — where the run is now (ink-filled on the band).
 * `future` — not reached. `problem` — this phase holds something broken.
 * A step can be current AND problematic: the state carries the glyph, `current` carries the fill.
 */
export type RunStepState = 'done' | 'current' | 'future' | 'problem';

export type RunStep = {
  id: RunStepId;
  /** «1 · план» — the band's own label. */
  title: string;
  /** One line of fact about this phase. */
  summary: string;
  state: RunStepState;
  /** Ink-filled. Exactly one step carries it — none at all on a cancelled run. */
  current: boolean;
  /** Names of the unsaved drafts sitting in this step's panel; renders the worded blue badge. */
  unsaved?: string[];
};

/**
 * WHERE THE RUN IS RIGHT NOW — the one piece of logic the whole layout hangs off.
 *
 * The status is the authority, because it is the only thing the server also agrees with; every
 * other candidate (are there lines? are there receipts?) can be true in more than one phase.
 * The mapping and why each arm is where it is:
 *
 *   PLANNED            → 1. Nothing has left the desk. The only actionable thing is the plan.
 *   IN_PROGRESS        → 2 or 3. Production started, so the plan is behind us. The open question
 *                        is the warehouse while any material is still not fully issued, and the
 *                        delivery once everything is out. `hasUnissuedMaterials` is the caller's
 *                        FROZEN verdict, not a live reading — see RunConveyorFacts. `undefined`
 *                        (the plan has not been read yet) resolves to 2, the EARLIER phase:
 *                        guessing early merely shows the materials panel — which holds no draft,
 *                        so a swap costs nothing — while guessing late would hide a live shortage
 *                        behind a collapsed row.
 *   PARTIALLY_RECEIVED → 3. The series is open; the next event is the next delivery. (This status
 *                        is not offered in any status select, but the server sets it and the run
 *                        genuinely lives here — the band must read it correctly.)
 *   RECEIVED           → 4. Stock is posted and the run is immutable; what it COST is the only
 *                        question still open. Without costing:read there is no step 4 for this
 *                        account at all, so its current phase is the last one it can still act
 *                        on — 5 — rather than a step that is not on its band.
 *   CLOSED             → 5. A record. What is left is reading the reconciliation.
 *   CANCELLED          → null. It will not proceed, so nothing is "current"; the band goes mut
 *                        apart from any step that is genuinely broken (see `buildRunSteps`).
 *
 * An unset/unknown status is a brand-new run: treated as PLANNED, matching the guidance banner.
 */
export function currentRunStep({
  status,
  hasUnissuedMaterials,
  canReadCosting,
}: {
  status?: common_ProductionRunStatus | string;
  hasUnissuedMaterials?: boolean;
  canReadCosting: boolean;
}): RunStepId | null {
  switch (status) {
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return null;
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 5;
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return canReadCosting ? 4 : 5;
    case 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED':
      return 3;
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return hasUnissuedMaterials === false ? 3 : 2;
    default:
      return 1;
  }
}

export type RunConveyorFacts = {
  status?: common_ProductionRunStatus | string;
  /** Money is confidential: without costing:read step 4 is not drawn at all. */
  canReadCosting: boolean;
  // 1 · план
  plannedQty: number;
  colourCount: number;
  /** Short reason step 1 is broken (a line with no product, nowhere to book an aux output). */
  planProblem?: string;
  // 2 · материалы. undefined = the plan has not been read yet. LIVE figures: this feeds the
  // summary line only.
  materials?: { positions: number; issued: number; short: number; blockers: number };
  materialsUnavailable?: boolean;
  /**
   * Whether any material is still short of its required quantity — the ONLY input to the
   * in-progress phase split, and deliberately NOT derived from `materials` here: the caller freezes
   * it at the first successful read of the plan, so issuing the last missing metre cannot move the
   * phase (and the panel) out from under the operator mid-action. undefined = not known yet.
   */
  hasUnissuedMaterials?: boolean;
  // 3 · приёмка
  receivedQty: number;
  postingStuck: boolean;
  // 4 · затраты. Pre-formatted by the caller («1234.00 EUR»); undefined = nothing booked.
  accrued?: string;
  costTotalsPartial: boolean;
  // 5 · закрытие
  recon: { ok: boolean; label: string }[];
  unsaved: Partial<Record<RunStepId, string[]>>;
};

// 1 цвет / 2 цвета / 5 цветов. The band reads as a sentence, and «5 цвета» reads as a bug.
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * The five steps, ready to render. Pure: same facts in, same band out.
 *
 * The `problem` marks are deliberately narrow, and BOTH of the planning-time ones are gated on the
 * run still being OPEN. A shortage, an uncounted slot or a line that never got a product are only
 * problems while the run can still act on them — on a received or closed run they are history
 * (plenty of runs never issue their fabric through the warehouse, and a defect-only receipt leaves
 * an unassigned line planned forever), and a ✗ that can never be cleared teaches operators to
 * ignore the glyph. This is the same call `nextStepGuidance` makes when it stops showing those two
 * warnings on a received run.
 */
export function buildRunSteps(f: RunConveyorFacts): RunStep[] {
  const cancelled = f.status === 'PRODUCTION_RUN_STATUS_CANCELLED';
  const open =
    f.status === 'PRODUCTION_RUN_STATUS_PLANNED' ||
    f.status === 'PRODUCTION_RUN_STATUS_IN_PROGRESS' ||
    f.status === 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED' ||
    !f.status;
  const current = currentRunStep({
    status: f.status,
    hasUnissuedMaterials: f.hasUnissuedMaterials,
    canReadCosting: f.canReadCosting,
  });
  // A planning blocker is only worth naming while the run can still be re-planned.
  const planProblem = open ? f.planProblem : undefined;

  const planSummary =
    f.plannedQty > 0
      ? `${f.plannedQty} ед · ${f.colourCount} ${plural(f.colourCount, 'цвет', 'цвета', 'цветов')}` +
        (planProblem ? ` · ${planProblem}` : '')
      : planProblem
        ? `плана ещё нет · ${planProblem}`
        : 'плана ещё нет';

  const materialsSummary = f.materials
    ? [
        f.materials.positions === 0
          ? 'материалов в плане нет'
          : `выдано ${f.materials.issued} из ${f.materials.positions} материалов`,
        f.materials.short > 0 ? `нехватка ${f.materials.short}` : '',
        f.materials.blockers > 0 ? `не посчитано ${f.materials.blockers}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : f.materialsUnavailable
      ? 'план материалов недоступен'
      : 'план материалов читается…';

  const series = cancelled ? '' : open ? ' · серия открыта' : ' · серия закрыта';
  const receiptSummary =
    `${f.receivedQty} из ${f.plannedQty}${series}` + (f.postingStuck ? ' · постинг завис' : '');

  const costSummary =
    (f.accrued ? `начислено ${f.accrued}` : 'затрат ещё нет') +
    (f.costTotalsPartial ? ' · итог неполный' : '');

  const failed = f.recon.filter((c) => !c.ok);
  const closeSummary =
    f.recon.length === 0
      ? 'сверка не проводилась'
      : failed.length === 0
        ? 'сверка сходится'
        : `сверка не сходится: ${failed.map((c) => c.label).join('; ')}`;

  const problem: Partial<Record<RunStepId, boolean>> = {
    1: !!planProblem,
    2: !!f.materials && open && (f.materials.short > 0 || f.materials.blockers > 0),
    3: f.postingStuck,
    4: f.costTotalsPartial,
    5: failed.length > 0,
  };

  const state = (id: RunStepId): RunStepState => {
    // Problems outrank cancellation: a run cancelled after a partial receipt can still carry a
    // stuck posting or a reconciliation that does not add up, and those need chasing precisely
    // BECAUSE nobody will look at the run again. Everything else on a cancelled run goes mut — it
    // has no live phase, so no step is current and none is "done".
    if (problem[id]) return 'problem';
    if (cancelled || current == null) return 'future';
    return id < current ? 'done' : id === current ? 'current' : 'future';
  };

  const step = (id: RunStepId, title: string, summary: string): RunStep => ({
    id,
    title,
    summary,
    state: state(id),
    current: !cancelled && current === id,
    unsaved: f.unsaved[id],
  });

  const steps: RunStep[] = [
    step(1, '1 · план', planSummary),
    step(2, '2 · материалы', materialsSummary),
    step(3, '3 · приёмка', receiptSummary),
  ];
  // Numbers stay stable across accounts: an account without costing:read sees 1,2,3,5 — a gap that
  // says "there is a phase you may not read", which beats renumbering «закрытие» to 4 for some
  // readers and 5 for others.
  if (f.canReadCosting) steps.push(step(4, '4 · затраты', costSummary));
  steps.push(step(5, '5 · закрытие', closeSummary));
  return steps;
}

const GLYPH: Record<RunStepState, string> = {
  done: '✓',
  current: '▶',
  future: '',
  problem: '✗',
};

const STATE_WORD: Record<RunStepState, string> = {
  done: 'пройден',
  current: 'текущий шаг',
  future: 'впереди',
  problem: 'проблема',
};

/**
 * The state marker: a 14px square carrying a literal glyph, never colour on its own.
 *
 * `current` ink-fills the square. Only the band ever passes it: the collapsed list holds the
 * non-current steps by construction, so it draws the glyph alone.
 */
export function StepGlyph({ state, current }: { state: RunStepState; current?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center border leading-none',
        current
          ? 'border-textColor bg-textColor text-bgColor'
          : state === 'problem'
            ? 'border-error text-error'
            : state === 'done'
              ? 'border-textColor text-textColor'
              : 'border-borderColor text-borderColor',
      )}
    >
      <Text size='nano' component='span' className='leading-none'>
        {GLYPH[state]}
      </Text>
    </span>
  );
}

/**
 * An unsaved draft lives in this step's panel. A WORDED badge, not a bare dot: in this system state
 * is never carried by colour alone, and the "· unsaved" this replaced was itself a word. The dot is
 * the glyph beside it; the title names which draft.
 */
export function UnsavedBadge({ what }: { what: string[] }) {
  const title = `не сохранено: ${what.join(', ')}`;
  return (
    <Text
      size='nano'
      tracking='label'
      component='span'
      className='whitespace-nowrap uppercase text-warning'
      title={title}
    >
      <span aria-hidden>• не сохранено</span>
      <span className='sr-only'>{title}</span>
    </Text>
  );
}

// Colour never travels alone here: the tone always sits next to the step's glyph and, on a broken
// step, next to a summary that says what is broken in words.
const titleTone = (s: RunStep) =>
  s.state === 'problem'
    ? cn('text-error', s.current && 'font-bold')
    : s.current
      ? 'font-bold text-textColor'
      : s.state === 'done'
        ? 'text-textColor'
        : 'text-labelColor';
const summaryTone = (s: RunStep) =>
  s.state === 'problem' ? 'text-error' : s.current ? undefined : 'text-labelColor';

/**
 * The band itself — ONE block: filled white once at the container and ruled internally with 1px
 * edge lines, the same grammar as `StatGrid`. It is not a `Section` (a block never contains a
 * block) and it is not clickable: it reports where the run is, the panels below act.
 */
export function RunConveyor({ steps, className }: { steps: RunStep[]; className?: string }) {
  return (
    <ol
      aria-label='этапы партии'
      className={cn('grid border border-borderColor bg-bgColor', className)}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
    >
      {steps.map((s) => (
        <li
          key={s.id}
          aria-current={s.current ? 'step' : undefined}
          className='border-r border-b border-borderColor px-2.5 py-2'
        >
          <div className='flex flex-wrap items-center gap-x-1.5'>
            <StepGlyph state={s.state} current={s.current} />
            <Text
              size='micro'
              tracking='label'
              component='span'
              className={cn('uppercase', titleTone(s))}
            >
              {s.title}
            </Text>
            <span className='sr-only'>{STATE_WORD[s.state]}</span>
            {s.unsaved?.length ? <UnsavedBadge what={s.unsaved} /> : null}
          </div>
          <Text size='small' className={summaryTone(s)}>
            {s.summary}
          </Text>
        </li>
      ))}
    </ol>
  );
}
