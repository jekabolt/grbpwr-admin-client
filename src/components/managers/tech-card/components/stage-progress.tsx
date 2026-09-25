import type {
  common_TechCardStage,
  GetTechCardReadinessResponse,
  TechCardReadinessAdvice,
  TechCardReadinessRequirement,
} from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { Link, useLocation } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import type { ReleaseBlocker } from './release-blockers-modal';

/**
 * ═══ ПРОГРЕСС СТЕЙДЖА — ОДИН РЯД ВМЕСТО СЕЛЕКТОВ, ПОЛОСЫ И ЧЕК-ЛИСТА (волна 25.09 · T17/T18/T20) ════
 *
 * Было три органа об одном и том же: селекты `stage`/`approval` в шапке, полоса IDEA → … →
 * PRODUCTION под ней и чек-лист «to reach … / nothing left on this stage — advance it in the header
 * select.». Стейдж теперь ВЕХА: клиент поднимает его сам, когда сервер говорит, что следующая
 * ступень готова (эффект в index.tsx, `decideAutoStage` ниже), поэтому селект, которым его двигали,
 * и фраза, которая к нему отсылала, ушли вместе.
 *
 * Остался один ряд: шесть сегментов (пройденные — залиты ink, текущий — в ink-рамке и жирный,
 * будущие — пунктир), а справа три органа — каждый одна пилюля с поповером:
 *   · `next: <ступень> · N to go` — строки GetTechCardReadiness.nextStageRequirements с дверями;
 *   · `release · N blockers` / `ready to release` — тот же список блокеров, что у модалки релиза;
 *   · `warnings · N` — замечания сервера (advisories) и ошибки формы, только когда они есть;
 * и одна кнопка `release ▸`.
 */

export const SPINE_STAGES: { value: common_TechCardStage; label: string }[] = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'sms' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pre-prod' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'production' },
];
export const STAGE_ORDER: string[] = SPINE_STAGES.map((s) => s.value);
export const stageLabel = (stage: string | undefined) =>
  SPINE_STAGES.find((s) => s.value === stage)?.label ?? 'unknown';

// The quick actions that actually matter. Where a requirement gets fixed, keyed by the server's
// stable `key`: the backend names the condition and judges it; which button or tab clears it is this
// admin's navigation, so the mapping stays client-side. A key with no entry renders as a plain row —
// a requirement added server-side later shows up as advice with no affordance, never as a crash.
// (Moved here verbatim from the retired lifecycle-strip.tsx.)
type ActionKey = 'sample' | 'fitting' | 'fittings-unresolved' | 'run';
export const REQ_ACTION: Record<string, ActionKey> = {
  first_sample: 'sample',
  sms_sample: 'sample',
  pp_sample: 'sample',
  fitting_recorded: 'fitting',
  fit_approved: 'fitting',
  fittings_resolved: 'fittings-unresolved',
  run_planned: 'run',
};
export const REQ_TAB: Record<string, string> = {
  // The style number lives in the STUDIO header (there is no separate header tab any more).
  style_number: 'studio',
  bom_fabric: 'bom',
  bom_linked: 'bom',
  colorway_linked: 'colorways',
  patterns: 'patterns',
  size_range: 'patterns',
  costing: 'costing',
};

/**
 * ═══ АВТО-СТЕЙДЖ: РЕШЕНИЕ «ПОДНЯТЬ ЛИ НА ШАГ» (D-14 / D-14' / Codex B-01, M-01) ═══════════════════
 *
 * СТЕЙДЖ — ВЕХА, МОНОТОННАЯ. Он отмечает, до куда карточка ДОШЛА, а не пересчитывается из текущего
 * состояния: удалённый семпл не откатывает карточку в PROTO (сервер к тому же стережёт регресс).
 * Поэтому решение умеет только одно — поднять РОВНО на одну ступень вверх, и только когда:
 *   · readiness свежий: он посчитан для того стейджа, который сейчас СОХРАНЁН (`currentStage` ===
 *     сохранённый) — ответ, пришедший до последнего сохранения, про другую карточку;
 *   · форма ещё не подняла его сама (иначе — ждём её сохранения, а не поднимаем второй раз);
 *   · следующая ступень — соседняя по порядку;
 *   · НИ ОДНА строка не `unknown` (B-01): сервер пропускает такие строки в `nextStageReady`, а для
 *     вехи «сервер не смог проверить» не равно «выполнено» — PP → PROD без проверенных выкроек
 *     был бы как раз ложной вехой;
 *   · все строки выполнены — с тем же фильтром auxiliary, что у поповера (у aux-карточки строки
 *     `colorway_linked` не бывает выполненной по построению: она не связывает продуктов).
 * Каскад разрешён: после каждого сохранения приходит свежий readiness, и если следующая ступень
 * тоже готова, решение сработает снова — по одному шагу на сохранение.
 */
export function decideAutoStage(i: {
  readiness: GetTechCardReadinessResponse | undefined;
  savedStage: string | undefined;
  formStage: string | undefined;
  isAux: boolean;
}): common_TechCardStage | null {
  const r = i.readiness;
  if (!r) return null;
  const next = r.nextStage;
  if (!next || next === 'TECH_CARD_STAGE_UNKNOWN') return null;
  const savedIdx = STAGE_ORDER.indexOf(i.savedStage ?? '');
  if (savedIdx < 0) return null;
  if (r.currentStage !== i.savedStage) return null;
  if (i.formStage !== i.savedStage) return null;
  if (STAGE_ORDER.indexOf(next) !== savedIdx + 1) return null;
  const all = r.nextStageRequirements ?? [];
  if (all.some((x) => x.unknown === true)) return null;
  const rows = all.filter((x) => !(i.isAux && x.key === 'colorway_linked'));
  if (!rows.every((x) => x.met === true)) return null;
  if (!r.nextStageReady && !i.isAux) return null;
  return next;
}

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

type Tone = 'ok' | 'warn' | 'attention' | 'mut' | 'gap';

/** One organ of row 2: a pill that opens a popover. A Pill inside the trigger, not a Chip — the
 *  organ needs the Pill's four tones, and the trigger (a real button) is what makes it clickable. */
function Organ({
  label,
  tone,
  title,
  width = 'w-[300px]',
  children,
  testId,
}: {
  label: string;
  tone: Tone;
  title: string;
  width?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <GenericPopover
      title={title}
      className={width}
      triggerProps={{ className: `flex items-center ${FOCUS}`, 'aria-label': `${label}, details` }}
      openElement={
        <Pill tone={tone} className='cursor-pointer gap-1.5 hover:bg-bgZebra' data-organ={testId}>
          <span>{label}</span>
          <span aria-hidden>▾</span>
        </Pill>
      }
    >
      {children}
    </GenericPopover>
  );
}

// The reference's 14px `.check-box`: a 1px ink square, filled ink with a white tick once met; a
// dashed one with `?` when the server could not answer. Decorative — each row says it in words too.
function Mark({ state }: { state: 'met' | 'open' | 'unknown' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center border text-nano leading-none',
        state === 'met' && 'border-textColor bg-textColor text-bgColor',
        state === 'open' && 'border-textColor text-transparent',
        state === 'unknown' && 'border-dashed border-labelColor text-labelColor',
      )}
    >
      {state === 'unknown' ? '?' : '✓'}
    </span>
  );
}

export type FormErrorRow = { path: string; message: string; tab: string };

export function StageProgress({
  techCardId,
  stage,
  readiness,
  readinessPending,
  readinessError,
  isAux,
  canEdit,
  planRunDisabled,
  planRunDisabledReason,
  blockers,
  canRelease,
  releasing,
  onRelease,
  approvalState,
  onBackToDraft,
  formErrors,
  onRevealError,
  onGoTab,
  onAddSample,
  onGoFittings,
}: {
  techCardId: number;
  /** The stage the form holds — the bar moves the moment the auto-stage raises it. */
  stage: string;
  readiness: GetTechCardReadinessResponse | undefined;
  readinessPending: boolean;
  readinessError: boolean;
  isAux: boolean;
  canEdit: boolean;
  planRunDisabled?: boolean;
  planRunDisabledReason?: string;
  blockers: ReleaseBlocker[];
  canRelease: boolean;
  releasing: boolean;
  onRelease: () => void;
  /** The SAVED approval state (N-03 reads the server's, not an unsaved form value). */
  approvalState: string | undefined;
  onBackToDraft: () => void;
  formErrors: FormErrorRow[];
  onRevealError: (path: string) => void;
  onGoTab: (tab: string) => void;
  onAddSample: () => void;
  onGoFittings: (unresolvedOnly: boolean) => void;
}) {
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;
  const idx = STAGE_ORDER.indexOf(stage);
  const currentLabel = idx >= 0 ? SPINE_STAGES[idx].label : 'stage unset';

  // ── next ──────────────────────────────────────────────────────────────────────────────────────
  const nextStage = readiness?.nextStage;
  const hasNext = !!nextStage && nextStage !== 'TECH_CARD_STAGE_UNKNOWN';
  const rows: TechCardReadinessRequirement[] = (readiness?.nextStageRequirements ?? []).filter(
    // The one fact the readiness RPC cannot know: an auxiliary card links no products BY DESIGN,
    // so its colourway row would sit permanently unmet. Dropped, not failed.
    (r) => !(isAux && r.key === 'colorway_linked'),
  );
  // An `unknown` row counts as TO GO: the auto-stage will not advance past it (B-01), and a chip
  // saying «ready» over a stage that never moves would be the lie.
  const toGo = rows.filter((r) => r.met !== true).length;

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
            to={`${ROUTES.addFitting}?techCardId=${techCardId}&returnTo=${encodeURIComponent(returnTo)}`}
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

  // ── warnings ──────────────────────────────────────────────────────────────────────────────────
  const advisories: TechCardReadinessAdvice[] = readiness?.advisories ?? [];
  const warningCount = advisories.length + formErrors.length;

  // ── N-03: a card left IN_REVIEW / APPROVED by the retired approval select ──────────────────────
  const legacyApproval =
    approvalState === 'TECH_CARD_APPROVAL_STATE_IN_REVIEW'
      ? { label: 'in review', tone: 'attention' as const }
      : approvalState === 'TECH_CARD_APPROVAL_STATE_APPROVED'
        ? { label: 'approved', tone: 'ok' as const }
        : null;

  const releaseBody = (
    <div className='flex flex-col gap-2 py-0.5'>
      {blockers.length === 0 ? (
        <Text size='micro' variant='label' component='p'>
          nothing blocks the release
        </Text>
      ) : (
        <ol className='flex flex-col'>
          {blockers.map((b, i) => (
            <li key={`${b.tab}-${i}`} className='border-b border-hairline last:border-b-0'>
              <button
                type='button'
                onClick={() => onGoTab(b.tab)}
                className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-bgZebra ${FOCUS}`}
              >
                <span className='flex min-w-0 flex-1 flex-col'>
                  <Text size='micro' component='span'>
                    {b.label}
                  </Text>
                  {b.detail && (
                    <Text size='micro' variant='label' component='span'>
                      {b.detail}
                    </Text>
                  )}
                </span>
                <Text size='micro' variant='label' component='span' className='shrink-0 underline'>
                  → {b.tab}
                </Text>
              </button>
            </li>
          ))}
        </ol>
      )}
      {legacyApproval && canEdit && (
        <div className='flex items-baseline gap-2 border-t border-borderColor pt-1.5'>
          <Text size='micro' variant='label' component='p' className='min-w-0 flex-1'>
            marked {legacyApproval.label} by the old approval select
          </Text>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='shrink-0'
            disabled={releasing}
            onClick={onBackToDraft}
          >
            back to draft ›
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline px-2.5 py-2'
      data-stage-progress
    >
      {/* THE BAR. Six segments of one height; below `sm` they fold to squares and only the current
          stage keeps its word, beside them. An ordered list, so a screen reader hears «6 items»
          and the current one as the step. */}
      <div className='flex min-w-0 items-center gap-2 sm:max-w-[640px] sm:flex-[1_1_480px]'>
        <ol aria-label='stage' className='flex min-w-0 flex-1 items-center gap-0.5'>
          {SPINE_STAGES.map((s, i) => {
            const state =
              idx < 0 ? 'future' : i < idx ? 'passed' : i === idx ? 'current' : 'future';
            return (
              <li
                key={s.value}
                aria-current={state === 'current' ? 'step' : undefined}
                data-stage={s.value}
                data-state={state}
                className={cn(
                  'flex shrink-0 items-center justify-center border',
                  'size-2.5 sm:h-6 sm:w-auto sm:min-w-[4.5rem] sm:flex-1 sm:px-1.5',
                  state === 'passed' && 'border-textColor bg-textColor text-bgColor',
                  state === 'current' && 'border-textColor bg-bgColor font-bold text-textColor',
                  state === 'future' && 'border-dashed border-borderColor text-labelColor',
                )}
              >
                {/* A plain span, not <Text>: Text paints its own ink, and the label on a filled
                    segment has to take the segment's white. */}
                <span className='sr-only text-micro uppercase tracking-label sm:not-sr-only sm:truncate'>
                  {s.label}
                  {state === 'passed' && <span aria-hidden> ✓</span>}
                </span>
                {state === 'passed' && <span className='sr-only'> (done)</span>}
              </li>
            );
          })}
        </ol>
        <Text
          size='micro'
          tracking='label'
          component='span'
          className='shrink-0 font-bold uppercase sm:hidden'
        >
          {currentLabel}
        </Text>
      </div>

      {/* NEXT — hidden at PRODUCTION: there is no next stage to reach. */}
      {readinessError ? (
        <Pill tone='gap' title='GetTechCardReadiness failed: the checklist is unknown'>
          checklist unavailable
        </Pill>
      ) : readinessPending && !readiness ? (
        <Pill tone='gap'>checking stage…</Pill>
      ) : hasNext ? (
        <Organ
          testId='next'
          title={`to reach ${stageLabel(nextStage)}`}
          label={
            toGo > 0
              ? `next: ${stageLabel(nextStage)} · ${toGo} to go`
              : `next: ${stageLabel(nextStage)} · ready`
          }
          tone={toGo > 0 ? 'attention' : 'ok'}
          width='w-[340px]'
        >
          <ol className='flex flex-col py-0.5'>
            {rows.map((r) => {
              const state = r.met ? 'met' : r.unknown ? 'unknown' : 'open';
              const action = !r.met && canEdit ? REQ_ACTION[r.key ?? ''] : undefined;
              const tab = !r.met && !REQ_ACTION[r.key ?? ''] ? REQ_TAB[r.key ?? ''] : undefined;
              // A blocked plan-run REPLACES the detail: why you can't act beats why it's unmet.
              const why =
                action === 'run' && planRunDisabled ? planRunDisabledReason : r.met ? '' : r.detail;
              return (
                <li
                  key={r.key}
                  className='flex items-start gap-2 border-b border-hairline py-1 last:border-b-0'
                >
                  <Mark state={state} />
                  <span className='sr-only'>
                    {state === 'met' ? 'done' : state === 'unknown' ? 'cannot be checked' : 'to do'}
                  </span>
                  <span className='flex min-w-0 flex-1 flex-col'>
                    <Text size='micro' component='span'>
                      {r.label}
                    </Text>
                    {why ? (
                      <Text size='micro' variant='label' component='span'>
                        {why}
                      </Text>
                    ) : null}
                  </span>
                  <span className='flex shrink-0 items-center gap-2'>
                    {action && renderAction(action)}
                    {tab && (
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
                </li>
              );
            })}
            {rows.length === 0 && (
              <Text size='micro' variant='label' component='p'>
                the server lists nothing for this step
              </Text>
            )}
          </ol>
        </Organ>
      ) : null}

      {/* RELEASE — the SAME blocker list the release modal and the history tab's gate read. */}
      {canRelease && !legacyApproval ? (
        <Pill tone='ok' data-organ='release'>
          ready to release
        </Pill>
      ) : (
        <Organ
          testId='release'
          title='release'
          label={
            blockers.length > 0
              ? `release · ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`
              : 'ready to release'
          }
          tone={blockers.length > 0 ? 'warn' : 'ok'}
          width='w-[340px]'
        >
          {releaseBody}
        </Organ>
      )}
      {legacyApproval && <Pill tone={legacyApproval.tone}>{legacyApproval.label}</Pill>}

      {/* WARNINGS — only when there is something to say. Advisories never block (they are not in
          either `*_ready`); form errors block the SAVE, not the release, and walk to their field. */}
      {warningCount > 0 && (
        <Organ
          testId='warnings'
          title='warnings'
          label={`warnings · ${warningCount}`}
          tone='mut'
          width='w-[340px]'
        >
          <div className='flex flex-col gap-2 py-0.5'>
            {formErrors.length > 0 && (
              <div>
                <GroupLabel flush>fields that block saving</GroupLabel>
                <ol className='flex flex-col'>
                  {formErrors.map((e) => (
                    <li key={e.path} className='border-b border-hairline last:border-b-0'>
                      <button
                        type='button'
                        onClick={() => onRevealError(e.path)}
                        className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-bgZebra ${FOCUS}`}
                      >
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <Text size='micro' component='span' className='truncate'>
                            {e.path}
                          </Text>
                          <Text size='micro' variant='label' component='span'>
                            {e.message || 'invalid'}
                          </Text>
                        </span>
                        <Text
                          size='micro'
                          variant='label'
                          component='span'
                          className='shrink-0 underline'
                        >
                          → {e.tab}
                        </Text>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {advisories.length > 0 && (
              <div>
                <GroupLabel flush={formErrors.length === 0}>worth fixing</GroupLabel>
                <ol className='flex flex-col'>
                  {advisories.map((a, i) => (
                    <li
                      key={`${a.key}-${i}`}
                      className='border-b border-hairline py-1 last:border-b-0'
                    >
                      <Text size='micro' component='p'>
                        {a.text || a.key}
                      </Text>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Organ>
      )}

      {canEdit && (
        <Button
          type='button'
          // Filled only when pressing it releases; outlined while blocked — pressing it then
          // explains why (the blockers modal), which is the one moment the reasons are wanted.
          variant={canRelease ? 'main' : 'secondary'}
          size='sm'
          className='ml-auto uppercase'
          disabled={releasing}
          onClick={onRelease}
        >
          release ▸
        </Button>
      )}
    </div>
  );
}
