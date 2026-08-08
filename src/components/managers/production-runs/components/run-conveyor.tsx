import { common_ProductionRunStatus } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

// The run conveyor: a production run is six phases long, and the detail page shows the one the
// run is IN — the rest collapse to a line each. This module owns two things: WHERE the run is
// (a pure function over its status), and how the band renders. Nothing here fetches, mutates or
// gates on permissions; the page passes in facts it has already read.
//
//   1 план → 2 материалы → 3 раскрой → 4 приёмка → 5 затраты → 6 закрытие
//
// Cutting (Ф4's «шаг 3 · как раскроить») is a phase of its own and not a detail of either
// neighbour: nothing can be laid until the materials are issued, and there is nothing to receive
// until it has been cut. Two steps are CONDITIONAL and leave a numbered gap when absent rather
// than renumbering their successors — 3 is missing on an auxiliary run (a material output has no
// colourways, no pieces and no markers, so it is never laid) and 5 is missing without
// costing:read. A gap says "there is a phase that does not apply to you"; renumbering «закрытие»
// to 5 for some readers and 6 for others would make two operators describe the same run
// differently.
export type RunStepId = 1 | 2 | 3 | 4 | 5 | 6;

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
 *   IN_PROGRESS        → 2, or 3 (4 on a run that is never laid). Production started, so the plan
 *                        is behind us. The open question is the warehouse while any material is
 *                        still not fully issued, and CUTTING once everything is out — that is where
 *                        an operator with the fabric on the table actually works. It deliberately
 *                        does NOT advance to приёмка when the lays happen to cover the plan: what
 *                        ends this phase is a receipt, and a receipt changes the status, which this
 *                        function already reads. Deriving it from lay coverage instead would move
 *                        the phase (and the open panel) the moment a lay was saved.
 *                        `hasUnissuedMaterials` is the caller's FROZEN verdict, not a live
 *                        reading — see RunConveyorFacts. `undefined` (the plan has not been read
 *                        yet) resolves to 2, the EARLIER phase: guessing early merely shows the
 *                        materials panel — which holds no draft, so a swap costs nothing — while
 *                        guessing late would hide a live shortage behind a collapsed row.
 *   PARTIALLY_RECEIVED → 4. The series is open; the next event is the next delivery. (This status
 *                        is not offered in any status select, but the server sets it and the run
 *                        genuinely lives here — the band must read it correctly.)
 *   RECEIVED           → 5. Stock is posted and the run is immutable; what it COST is the only
 *                        question still open. Without costing:read there is no step 5 for this
 *                        account at all, so its current phase is the last one it can still act
 *                        on — 6 — rather than a step that is not on its band.
 *   CLOSED             → 6. A record. What is left is reading the reconciliation.
 *   CANCELLED          → null. It will not proceed, so nothing is "current"; the band goes mut
 *                        apart from any step that is genuinely broken (see `buildRunSteps`).
 *
 * An unset/unknown status is a brand-new run: treated as PLANNED, matching the guidance banner.
 *
 * The result is always exactly one step, and always one the band actually draws: every arm that
 * could land on a conditional step (3 without a lay plan, 5 without costing:read) names its
 * fallback explicitly.
 */
export function currentRunStep({
  status,
  hasUnissuedMaterials,
  hasLayStep,
  canReadCosting,
}: {
  status?: common_ProductionRunStatus | string;
  hasUnissuedMaterials?: boolean;
  /** false on an auxiliary run: there is no cutting phase at all, so 3 is skipped. */
  hasLayStep: boolean;
  canReadCosting: boolean;
}): RunStepId | null {
  switch (status) {
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return null;
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 6;
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return canReadCosting ? 5 : 6;
    case 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED':
      return 4;
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return hasUnissuedMaterials === false ? (hasLayStep ? 3 : 4) : 2;
    default:
      return 1;
  }
}

export type RunConveyorFacts = {
  status?: common_ProductionRunStatus | string;
  /** Money is confidential: without costing:read step 5 is not drawn at all. */
  canReadCosting: boolean;
  /** false on an auxiliary run: a material output is never laid, so step 3 is not drawn. */
  hasLayStep: boolean;
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
  /**
   * 3 · раскрой. undefined = the lay plan has not been read yet (or does not apply).
   *   lays / sections — the size of the plan;
   *   unfit           — lays the SERVER calls «не годен» (a BLOCKER check: a section whose marker
   *                     is not this run's, a mode/parity mismatch, a stack over the height limit);
   *   stale           — lays whose quantity snapshot no longer matches the run («количества
   *                     изменились»);
   *   shortCells      — coverage cells the server marks BLOCKER, i.e. «нехватка — ткань не
   *                     раскроена».
   */
  lays?: { lays: number; sections: number; unfit: number; stale: number; shortCells: number };
  laysUnavailable?: boolean;
  // 4 · приёмка
  receivedQty: number;
  postingStuck: boolean;
  // 5 · затраты. Pre-formatted by the caller («1234.00 EUR»); undefined = nothing booked.
  accrued?: string;
  costTotalsPartial: boolean;
  // 6 · закрытие
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
 * The six steps, ready to render. Pure: same facts in, same band out.
 *
 * The `problem` marks are deliberately narrow, and every one of them that describes planning work
 * is gated on the run still being OPEN. A shortage, an uncounted slot, a line that never got a
 * product or an unfit lay are only problems while the run can still act on them — on a received or
 * closed run they are history (plenty of runs never issue their fabric through the warehouse, and a
 * defect-only receipt leaves an unassigned line planned forever), and a ✗ that can never be cleared
 * teaches operators to ignore the glyph. This is the same call `nextStepGuidance` makes when it
 * stops showing those warnings on a received run.
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
    hasLayStep: f.hasLayStep,
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

  // 3 · раскрой. «настилов ещё нет» is NOT a defect — it is the phase's own work, and every run is
  // born with none; the figures that ARE defects (an unfit lay, a coverage cell short of fabric)
  // only get named once something has actually been laid, in the same words the panel uses.
  const cutSummary = !f.lays
    ? f.laysUnavailable
      ? 'план настилов недоступен'
      : 'план настилов читается…'
    : f.lays.lays === 0
      ? 'настилов ещё нет'
      : [
          `${f.lays.lays} ${plural(f.lays.lays, 'настил', 'настила', 'настилов')} · ${f.lays.sections} ${plural(f.lays.sections, 'секция', 'секции', 'секций')}`,
          f.lays.unfit > 0 ? `не годен: ${f.lays.unfit}` : '',
          f.lays.stale > 0 ? `количества изменились: ${f.lays.stale}` : '',
          f.lays.shortCells > 0
            ? `нехватка: ${f.lays.shortCells} ${plural(f.lays.shortCells, 'клетка', 'клетки', 'клеток')}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');

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
    // WHAT COUNTS AS A DEFECT IN THE CUTTING PHASE — decided from what lay-plan.tsx itself paints
    // red, not from what is merely unfinished:
    //   * a lay whose checks carry a BLOCKER is the card's own red «не годен» pill
    //     (`lay_marker_scope` — a section pointing at a marker that is not this run's copy,
    //     `lay_mode_parity`, `lay_stack_height` over the limit). Somebody BUILT something the
    //     server refuses; that is a defect.
    //   * a coverage cell the server marks BLOCKER is the matrix's own red «нехватка — ткань не
    //     раскроена»: the lays that exist do not cover the plan.
    // Two things are deliberately NOT defects. «Настилов ещё нет» / uncovered pairs are the phase's
    // WORK — the panel already reports it as «настелено X из Y пар», and a run is born with zero
    // coverage, so a ✗ from birth would be the noise the shortage gate was trimmed for; that is
    // also why the coverage arm requires at least one lay to exist. And `quantitiesStale` is
    // «количества изменились», which lay-card renders as a BLUE attention pill — mid-flight, needs
    // a human, not broken — so it rides in the summary and never turns the glyph red.
    3: !!f.lays && open && f.lays.lays > 0 && (f.lays.unfit > 0 || f.lays.shortCells > 0),
    4: f.postingStuck,
    5: f.costTotalsPartial,
    6: failed.length > 0,
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
  ];
  // The two conditional phases leave a numbered GAP rather than renumbering what follows — see the
  // note at the top of the file. An auxiliary run reads 1,2,4,5,6; an account without costing:read
  // reads 1,2,3,4,6.
  if (f.hasLayStep) steps.push(step(3, '3 · раскрой', cutSummary));
  steps.push(step(4, '4 · приёмка', receiptSummary));
  if (f.canReadCosting) steps.push(step(5, '5 · затраты', costSummary));
  steps.push(step(6, '6 · закрытие', closeSummary));
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
export function StepGlyph({
  state,
  current,
  inverted,
}: {
  state: RunStepState;
  current?: boolean;
  /** The square sits on an ink-filled cell: flip it so it stays visible. */
  inverted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center border leading-none',
        inverted
          ? // A broken phase keeps its red even here — a filled red square on black still reads as
            // "this one is wrong", and the summary beside it says so in words. INK on red, not
            // white: white on #ff0000 is ~4.0:1, under AA for a 9px glyph; black on red is ~5.3:1.
            state === 'problem'
            ? 'border-error bg-error text-textColor'
            : current
              ? 'border-bgColor bg-bgColor text-textColor'
              : 'border-bgColor text-bgColor'
          : current
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
export function UnsavedBadge({ what, inverted }: { what: string[]; inverted?: boolean }) {
  const title = `не сохранено: ${what.join(', ')}`;
  return (
    <Text
      size='nano'
      tracking='label'
      component='span'
      className={cn('whitespace-nowrap uppercase', inverted ? 'text-bgColor' : 'text-warning')}
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
 * block).
 *
 * NAVIGATION, not just a report. The band used to be deliberately inert: it said where the run
 * stood and a separate «остальные шаги» block at the very BOTTOM of the page opened the phases.
 * The map and the way to use it were two thousand pixels apart, so the map read as decoration.
 * Passing `onSelect` turns every cell into the control it already looked like; the page keeps
 * deciding which panel is mounted, exactly as it did before.
 *
 * `active` is the phase whose panel is open, which is NOT always `current`: clicking a passed
 * phase opens it without pretending the run went backwards. The ink fill therefore marks the open
 * cell (that is what a selected control looks like in this system) and the ▶ glyph keeps naming
 * the phase the run is actually in.
 */
export function RunConveyor({
  steps,
  active,
  onSelect,
  panelId,
  className,
}: {
  steps: RunStep[];
  /** The step whose panel is on screen. Defaults to the run's current phase. */
  active?: RunStepId | null;
  /** Omit for a read-only band (the tech card's roll-up has nothing to open). */
  onSelect?: (id: RunStepId) => void;
  /** DOM id of the panel a cell opens, for `aria-controls`. */
  panelId?: (id: RunStepId) => string;
  className?: string;
}) {
  const openId = active ?? steps.find((s) => s.current)?.id ?? null;
  return (
    <ol
      aria-label='этапы партии'
      className={cn('grid border border-borderColor bg-bgColor', className)}
      // 150px: six phases have to fit on one row at the admin's content width before the band
      // starts wrapping into a second row of cells.
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
    >
      {steps.map((s) => {
        const open = s.id === openId;
        const body = (
          <>
            <div className='flex flex-wrap items-center gap-x-1.5'>
              <StepGlyph state={s.state} current={s.current} inverted={open} />
              <Text
                size='micro'
                tracking='label'
                component='span'
                className={cn('uppercase', open ? 'font-bold text-bgColor' : titleTone(s))}
              >
                {s.title}
              </Text>
              <span className='sr-only'>
                {STATE_WORD[s.state]}
                {open ? ', открыт' : ''}
              </span>
              {s.unsaved?.length ? <UnsavedBadge what={s.unsaved} inverted={open} /> : null}
            </div>
            <Text size='small' className={open ? 'text-bgColor' : summaryTone(s)}>
              {s.summary}
            </Text>
          </>
        );
        return (
          <li
            key={s.id}
            aria-current={s.current ? 'step' : undefined}
            className={cn(
              'border-r border-b border-borderColor',
              open && 'bg-textColor',
              !onSelect && 'px-2.5 py-2',
            )}
          >
            {onSelect ? (
              <button
                type='button'
                onClick={() => onSelect(s.id)}
                aria-expanded={open}
                aria-controls={panelId?.(s.id)}
                className={cn(
                  'block w-full px-2.5 py-2 text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2',
                  // A black ring is invisible on the ink-filled open cell; DESIGN.md requires the
                  // outline on every control without exception, so it inverts with the cell.
                  open ? 'focus-visible:outline-bgColor' : 'focus-visible:outline-textColor',
                )}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
