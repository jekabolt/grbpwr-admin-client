import type {
  common_TechCardStage,
  GetTechCardReadinessResponse,
  TechCardReadinessAdvice,
} from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { Link, useLocation } from 'react-router-dom';
import { Button, GroupLabel, Pill, GenericPopover, HeaderNext, HeaderNote, Text } from 'ui';

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
 * будущие — пунктир), справа одна строка `next: <ступень> · <глагол + объект> ›` (TABS-LITE R1:
 * пилюли `NEXT ▾` и `RELEASE · N BLOCKERS ▾` ушли — из их списков действовали только по первой
 * открытой строке), пилюля `warnings · N`, когда есть что сказать, и кнопка `release ▸`: залитая,
 * когда выпуск открыт, а закрытый открывает выезжающий список блокеров.
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
  size_range: 'sizes',
  costing: 'costing',
};

/**
 * ═══ NEXT STEP — ЧТО НАЖАТЬ ДАЛЬШЕ (TABS-LITE R1) ═══════════════════════════════════════════════
 *
 * Один шаг на всю страницу, три вида: строка в полосе стейджа, `›` у вкладки в рейле, `→ next:` над
 * активной вкладкой. Источник — первая НЕвыполненная строка `nextStageRequirements` (как у
 * авто-стейджа: aux без `colorway_linked`; строка `unknown` не шаг — сервер не смог проверить, и
 * нажать там нечего), иначе первый блокер релиза. Подпись — глагол + объект: строки сервера —
 * утверждения («the BOM has at least one fabric line»), а кнопка обязана говорить, что сделать.
 * Ключ без словарной подписи показывает утверждение сервера как есть: не «continue».
 */
export type NextStep = {
  key: string;
  /** Verb + object: `link shell fabric`. */
  label: string;
  /** The tab that clears it (the TabId string). */
  tab: string;
  /** Next stage's label (`fit`), or `release` when the step comes from the release list. */
  goal: string;
  /** A quick action instead of a tab walk (sample / fitting / run). */
  action?: ActionKey;
  /** The form path to pulse after the tab switch, when one is known. */
  field?: string;
};

export const NEXT_LABEL: Record<string, string> = {
  style_number: 'set the style number',
  size_range: 'pick the size range',
  bom_fabric: 'add a fabric to the bom',
  bom_linked: 'link an article to every bom slot',
  first_sample: 'add a proto sample',
  fitting_recorded: 'record a fitting',
  fit_approved: 'approve a fitting',
  fittings_resolved: 'resolve the fitting changes',
  sms_sample: 'add an sms sample',
  pp_sample: 'add a pp sample',
  colorway_linked: 'add a colourway',
  lab_dip: 'approve the lab dips',
  run_planned: 'plan a production run',
  patterns: 'add patterns for every size',
  costing: 'fill in the costing',
  costing_computes: 'set consumption on colorways',
  signoffs: 'approve the sign-offs',
  idea: 'advance the stage past idea',
  bom_slots: 'link an article to every bom slot',
  construction_graph: 'join the assembly into one garment',
};
// Where a stage row is fixed when it has no quick action (REQ_TAB covers the rest).
const NEXT_TAB: Record<string, string> = {
  costing_computes: 'colorways',
  construction_graph: 'construction',
  lab_dip: 'colorways',
  signoffs: 'signoff',
};
// The one row whose wording depends on WHICH half failed (the server's detail names it).
const labelOf = (key: string, detail: string | undefined, fallback: string | undefined) =>
  key === 'costing' && /currency/i.test(detail ?? '')
    ? 'set the cost currency'
    : NEXT_LABEL[key] ?? fallback ?? key;
const NEXT_FIELD: Record<string, string> = {
  style_number: 'styleNumber',
  size_range: 'sizeIds',
};
// Quick actions land on these tabs, so the rail and the tab header can still point at them.
const ACTION_TAB: Record<ActionKey, string> = {
  sample: 'samples',
  fitting: 'history',
  'fittings-unresolved': 'history',
  run: 'production',
};

export function resolveNextStep(i: {
  readiness: GetTechCardReadinessResponse | undefined;
  isAux: boolean;
  /** Release blockers as the page lists them; `key` names a server row or a client rule. */
  blockers: { key?: string; label: string; tab: string; detail?: string; field?: string }[];
  /** Concrete wording the page knows better than the dictionary (the slot's name). */
  concrete?: Partial<Record<string, { label: string; field?: string }>>;
  /** A step on a tab the card hides right now (IDEA shows four) yields to the next visible one. */
  visible?: (tab: string) => boolean;
}): NextStep | null {
  const pick = <T,>(xs: T[], tabOf: (x: T) => string) =>
    xs.find((x) => i.visible?.(tabOf(x)) ?? true) ?? xs[0];
  const r = i.readiness;
  const nextStage = r?.nextStage;
  if (nextStage && nextStage !== 'TECH_CARD_STAGE_UNKNOWN') {
    const tabOf = (key: string) => {
      const action = REQ_ACTION[key];
      return action ? ACTION_TAB[action] : REQ_TAB[key] ?? NEXT_TAB[key] ?? 'studio';
    };
    const open = (r?.nextStageRequirements ?? []).filter(
      (x) => x.met !== true && x.unknown !== true && !(i.isAux && x.key === 'colorway_linked'),
    );
    const row = pick(open, (x) => tabOf(x.key ?? ''));
    if (row) {
      const key = row.key ?? '';
      const c = i.concrete?.[key];
      return {
        key,
        label: c?.label ?? labelOf(key, row.detail, row.label),
        tab: tabOf(key),
        goal: stageLabel(nextStage),
        action: REQ_ACTION[key],
        field: c?.field ?? NEXT_FIELD[key],
      };
    }
  }
  const b = pick(i.blockers, (x) => x.tab);
  if (!b) return null;
  const c = b.key ? i.concrete?.[b.key] : undefined;
  return {
    key: b.key ?? b.label,
    label: c?.label ?? (b.key ? labelOf(b.key, b.detail, b.label) : b.label),
    tab: b.tab,
    goal: 'release',
    field: c?.field ?? b.field ?? (b.key ? NEXT_FIELD[b.key] : undefined),
  };
}

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
        <Pill tone={tone} className='cursor-pointer gap-1.5 hover:bg-pageBg' data-organ={testId}>
          <span>{label}</span>
          <span aria-hidden>▾</span>
        </Pill>
      }
    >
      {children}
    </GenericPopover>
  );
}

export type FormErrorRow = { path: string; message: string; tab: string };

export function StageProgress({
  techCardId,
  stage,
  readiness,
  readinessPending,
  readinessError,
  canEdit,
  planRunDisabled,
  planRunDisabledReason,
  next,
  onNext,
  canRelease,
  releasing,
  onRelease,
  approvalState,
  onBackToDraft,
  formErrors,
  onRevealError,
  onAddSample,
  onGoFittings,
}: {
  techCardId: number;
  /** The stage the form holds — the bar moves the moment the auto-stage raises it. */
  stage: string;
  readiness: GetTechCardReadinessResponse | undefined;
  readinessPending: boolean;
  readinessError: boolean;
  canEdit: boolean;
  planRunDisabled?: boolean;
  planRunDisabledReason?: string;
  /** The one step to press next (`resolveNextStep`); null when nothing is left before release. */
  next: NextStep | null;
  /** Walk to the step's tab (and its field) — for every step without a quick action. */
  onNext: () => void;
  canRelease: boolean;
  releasing: boolean;
  /** Releases when the gate is open; otherwise opens the release blockers drawer. */
  onRelease: () => void;
  /** The SAVED approval state (N-03 reads the server's, not an unsaved form value). */
  approvalState: string | undefined;
  onBackToDraft: () => void;
  formErrors: FormErrorRow[];
  onRevealError: (path: string) => void;
  onAddSample: () => void;
  onGoFittings: (unresolvedOnly: boolean) => void;
}) {
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;
  const idx = STAGE_ORDER.indexOf(stage);
  const currentLabel = idx >= 0 ? SPINE_STAGES[idx].label : 'stage unset';

  // A quick action is its own door (a sample opens the wizard, a fitting is another page); the
  // words stay the step's, so the line reads the same whichever door it carries.
  const actionDoor = (key: ActionKey, label: string) => {
    const text = `${label} ›`;
    if (key === 'sample') {
      return (
        <Button type='button' variant='underline' size='xs' onClick={onAddSample}>
          {text}
        </Button>
      );
    }
    if (key === 'fitting') {
      return (
        <Button asChild variant='underline' size='xs'>
          <Link
            to={`${ROUTES.addFitting}?techCardId=${techCardId}&returnTo=${encodeURIComponent(returnTo)}`}
          >
            {text}
          </Link>
        </Button>
      );
    }
    if (key === 'fittings-unresolved') {
      return (
        <Button type='button' variant='underline' size='xs' onClick={() => onGoFittings(true)}>
          {text}
        </Button>
      );
    }
    if (planRunDisabled) {
      return (
        <Button type='button' variant='underline' size='xs' disabled title={planRunDisabledReason}>
          {text}
        </Button>
      );
    }
    return (
      <Button asChild variant='underline' size='xs'>
        <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>{text}</Link>
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

      {/* NEXT — one sentence, one door. The checklist and the blockers list that used to sit
          behind two popover pills are the same data; only their first open row was ever acted on. */}
      {readinessError ? (
        <HeaderNote title='GetTechCardReadiness failed: the checklist is unknown'>
          checklist unavailable
        </HeaderNote>
      ) : readinessPending && !readiness ? (
        <HeaderNote>checking stage…</HeaderNote>
      ) : next ? (
        <HeaderNext
          lead={`next: ${next.goal} ·`}
          label={next.label}
          onClick={onNext}
          door={next.action && canEdit ? actionDoor(next.action, next.label) : undefined}
          data-next-key={next.key}
        />
      ) : null}
      {legacyApproval && (
        <span className='flex items-baseline gap-1.5'>
          <HeaderNote tone={legacyApproval.tone}>{legacyApproval.label}</HeaderNote>
          {canEdit && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              disabled={releasing}
              onClick={onBackToDraft}
            >
              back to draft ›
            </Button>
          )}
        </span>
      )}

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
                        className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-pageBg ${FOCUS}`}
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
          // explains why (the blockers drawer), which is the one moment the reasons are wanted.
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
