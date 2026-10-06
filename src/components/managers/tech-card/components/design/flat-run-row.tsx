import { useQueryClient, type QueryClient, type QueryFunction } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';
import { flattenFieldErrors, revealField } from 'utils/field-errors';

import type { TechCardFormData } from '../schema';

import { AskConstruction, finishAsk, useAskBusy } from './ask-construction';
import { AskReferences } from './ask-references';
import {
  flushAllowsRun,
  flushRefusalSentence,
  useTechCardAutosave,
  type FlushResult,
} from './autosave-contract';
import { displayDetailName, readBench } from './bench-slot';
import { serverSpeaksDesign } from './capability';
import { useMoodMinimumGate } from './chain-rail';
import { ControlLabel } from './core';
import { moodMinimumGate, openGateDoor } from './core/chain';
import { useDrafted } from './drafted-contract';
import { markedPlatesOf } from './fix-markup';
import {
  confirmedNow,
  joinsSavesSettled,
  rereadForStale,
  saveJoinsConfirmed,
  useJoinsRead,
} from './flat-joins';
import {
  flatDraftOf,
  flatInputBusy,
  patchFlatInput,
  readFlatInput,
  rememberFlatDraft,
  useFlatInput,
  type FlatAsk,
} from './flat-input';
import {
  autoStructure,
  flatParamsFor,
  flatRefusalWords,
  liveStructure,
  moodPictureIds,
  pickStructure,
  type FlatMode,
  type StructureRole,
} from './flat-mode';
import {
  ROUTE_WHY,
  ROUTE_WORD,
  VIEWS_ORDER,
  detailFlatSlotIds,
  flatTargets,
  modeOfRoute,
  FLAT_CONSTRUCTION_IN_PROMPT,
  routeOf,
  settleTarget,
  targetSlotId,
  type FlatRoute,
} from './flat-route';
import type { RunRefusal as ServerRefusal } from './generation/refusal';
import { isRunLive } from './generation/run-state';
import { useStartRun } from './generation/use-generation';
import { pendingQuestions } from './joins-questions';
import { WhatModelGetsModal } from './modals';
import { isBoardRow, isInputRow, type BoardItem } from './mood-board';
import {
  figureIds,
  inputIdsOf,
  picturesToAsk,
  readRefChoices,
  unmarkedInputIds,
  useRefChoices,
} from './ref-ask-model';
import Select from 'ui/components/select';
import { GenerateRow, LockBar, RunRefusal } from './render/generate-row';
import type { CalloutLike } from './render/what-model-gets';
import { staleShown } from './stale-details';
import { cardOnScreen, designKeys, serverSpeaksNow, type WriteContext } from './use-design-band';
import { settleSeedBrief } from './words-brief';
import { materializeWords } from './words-seed';

/**
 * ═══ РЯД ЗАПУСКА БЛОКА INPUT — REFERENCES (82-INPUT-REDESIGN, 06.10) ═══════════════════════════
 *
 *   GENERATE · target ▾ · (from my flat) · route · what the model gets ▸
 *
 * Owner request 8: «always 4 views; first press = the views sheet; drop one picture / per view; drop
 * FRONT/BACK/SIDE toggles; a dropdown by GENERATE: views again first, then un-generated details; no
 * mode switch — route automatic, from-my-flat explicit; JOINS off the screen, 1–3 questions only
 * when unsure / straps; no confirm button».
 *   · `target ▾` (`flatTargets`): `views` / `views again`, then each detail not drawn yet (or stale
 *     and not kept) — disabled until FRONT and BACK hold a picture;
 *   · `from my flat` — a quiet toggle, drawn only when the card has technical flats and the target
 *     is the views; never automatic. On: the structure tiles under the row (front / back per flat);
 *   · the route pill — not a button: `photos` · `straps & openings` · `from my flat` · `detail`,
 *     chosen by `routeOf`, with the reason in its title;
 *   · above the row, while the list asks something: ASK · construction (`ask-construction.tsx`);
 *     GENERATE waits for it, with `skip all ›`; while the list is being read GENERATE waits with
 *     `generate without it ›`.
 *
 * ⚠ ЦЕНЫ В РЯДУ НЕТ (26.09, O-37 / D-35): цена прогона живёт в истории, по факту.
 */

/**
 * ═══ ОДИН РОСТ НА ВСЕ ОРГАНЫ РЯДА (r3 п.5) ═══════════════════════════════════════════════════════
 * 26px — рост `GENERATE` (`render/generate-row.tsx`); остальное подгоняется к ней. Инлайном, а не
 * классом: произвольного класса нет в собранном CSS, если его не было в дереве при сборке.
 */
export const ROW_CONTROL_PX = 26;
export const ROW_CONTROL_STYLE: React.CSSProperties = { height: ROW_CONTROL_PX };

/** The lock while the first list is read — the one `generate without it ›` passes. */
const READING = 'reading the construction';

/** The native select of the row, styled as the neck-shape select of the joins list. */
const STRUCTURE_ROLES: { role: StructureRole; label: string }[] = [
  { role: 'front_flat', label: 'front' },
  { role: 'back_flat', label: 'back' },
];

/** A local stop that reads like the server's refusal of the same thing (nothing was sent). */
const localRefusal = (reason: string): ServerRefusal => ({
  words: reason,
  status: 0,
  clientRequestId: '',
  reason,
});

/** Утверждение карточки замораживает её (`index.tsx`, `frozen`); строка — проводная. */
const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';

/**
 * ВХОД ФЛЭТА ЗАНЯТ — состояние КАРТОЧКИ, а не ряда: хранилище `flat-input.ts` (ревью раунда 2,
 * MAJOR B; раунда 3, m1/m2). Засев WORDS — `words-seed.ts` (D-20'''').
 */

/**
 * ЧТО СЕРВЕР ЗАМОРОЗИТ В ПРОГОН ФЛЭТА — КАК СОХРАНЕНО (ревью раунда 3, m6; раунда 4, MIN-3). В запрос
 * это не едет (см. `startRun`); это часть НАМЕРЕНИЯ и уходит в отпечаток леджера (`useStartRun`):
 * правка слов или роли после двусмысленного провала с теми же VIEWS — новое намерение, и старый id
 * повторяться не должен. Поэтому в отпечатке РОВНО то, что прогон флэта читает, — не шире и не уже:
 *   · слова и посадка — из формы после `flush`, то есть сохранённые;
 *   · референсы С РОЛЬЮ (роль, порядок, записка, слот детали) и указания на НИХ — плитка доски и
 *     строка без роли в промпт не едут, и их правка между провалом и повтором — тот же запрос;
 *   · ИМЕНА отмеченных деталей: они печатаются в промпте, и переименование при тех же id —
 *     другой запрос.
 * Полоса — СВЕЖЕЕ чтение (`freshBand` в `submit`, ревью раунда 4, MAJ-1), а не кэш экрана.
 */
export function flatSnapshot(
  band: GetDesignBandResponse | undefined,
  now: TechCardFormData,
  detailSlotIds: readonly number[],
  mode: FlatMode,
  /**
   * THE TARGET AND THE ROUTE (82-INPUT-REDESIGN §3.1): a different target or route is a different
   * intent; a detail run's FRONT/BACK slots travel with their pictures (owner 06.10, answer 3).
   */
  intent?: {
    target: string;
    route: string;
    flatSlotIds?: readonly number[];
    /** T70: the role-less pictures sent `figure it out ✦` (`extra_input_media_ids`). */
    extras?: readonly number[];
  },
): unknown {
  const refs = (band?.references ?? [])
    .filter((r) => (r.mediaId ?? 0) > 0 && !!(r.role ?? '').trim())
    .map((r) => [
      r.mediaId ?? 0,
      (r.role ?? '').trim(),
      r.ordinal ?? 0,
      (r.note ?? '').trim(),
      r.detailSlotId ?? 0,
    ])
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  const roled = new Set(refs.map((r) => r[0] as number));
  // The mood pictures among the references: they travel as `mood`, so turning a picture into mood
  // (or back) on the board is a new intent even when the references block did not move (c2).
  const moodIds = moodPictureIds(now.moodboardMedia as { mediaId?: number; role?: string }[]);
  const mood = (band?.references ?? [])
    .filter((r) => moodIds.has(r.mediaId ?? 0))
    .map((r) => [r.mediaId ?? 0, (r.role ?? '').trim(), r.ordinal ?? 0, (r.note ?? '').trim()])
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  // A role-less reference on a mood picture travels too (as mood), with its callouts.
  for (const m of mood) roled.add(m[0] as number);
  const callouts = ((now.callouts ?? []) as CalloutLike[]).filter((c) =>
    roled.has(c?.mediaId ?? 0),
  );
  const details = band
    ? readBench(band, 'flat')
        .details.filter((d) => detailSlotIds.includes(d.id ?? 0))
        .map((d) => [d.id ?? 0, (d.detailName ?? '').trim()])
        .sort((a, b) => (a[0] as number) - (b[0] as number))
    : [];
  return {
    words: ((now.garmentDescription ?? '') as string).trim(),
    fit: now.fit ?? '',
    refs,
    mood,
    callouts,
    details,
    // The join list the run freezes (its rev, and whether that rev is confirmed — straps needs it).
    // «from my flat» reads no list: a background read moving the rev is not a new intent there.
    joins:
      mode === 'hand_flat' || !FLAT_CONSTRUCTION_IN_PROMPT
        ? null
        : [band?.joins?.rev ?? 0, !!band?.joins?.confirmed],
    ...(intent
      ? {
          target: intent.target,
          route: intent.route,
          flatSlots: (intent.flatSlotIds ?? []).map((id) => [
            id,
            (band?.bench ?? []).find((b) => (b.id ?? 0) === id)?.pictureId ?? 0,
          ]),
          // Only when there are some: a fingerprint without extras stays byte-for-byte the old one.
          ...(intent.extras?.length ? { extras: [...intent.extras].sort((a, b) => a - b) } : {}),
        }
      : {}),
  };
}

/**
 * A FLAT RUN OF THIS CARD IS IN FLIGHT (91-LIVE D5, 82 §2 S4): GENERATE says so and waits — a second
 * press would book a second paid run. Any flat run counts, the views or a detail.
 */
export function flatRunInFlight(band: Pick<GetDesignBandResponse, 'runs'> | undefined): boolean {
  return (band?.runs ?? []).some(
    // Archived too: archiving is presentational, a live archived run is still being paid for.
    (r) => (r.kind ?? '').trim().toLowerCase() === 'flat' && isRunLive(r),
  );
}

/** Сколько GENERATE ждёт незавершённых записей входа, прежде чем отказать (финальная сверка). */
const BAND_WRITES_WAIT_MS = 15_000;

/**
 * ЗАПИСЬ, ОТ КОТОРОЙ ЗАВИСИТ ОТПЕЧАТОК: роль референса (`SetDesignReferenceRole`: `mediaId` + `role`)
 * или имя детали (`SetDesignBenchSlot` с `newDetailName`: переименование и заведение). Ключей у
 * мутаций полосы нет (`use-design-band.ts`), поэтому запись узнаётся по форме аргументов — и ТОЛЬКО
 * эти две: черновик идеи, прогон другого рода, плита верстака в промпт флэта не едут, и ждать их —
 * значит держать GENERATE на «saving…» за чужое (финальная сверка).
 */
function isDigestWrite(variables: unknown): boolean {
  if (!variables || typeof variables !== 'object') return false;
  const v = variables as Record<string, unknown>;
  return ('mediaId' in v && 'role' in v) || ('slot' in v && v.newDetailName !== undefined);
}

/**
 * ЗАПИСИ ВХОДА ЭТОЙ КАРТОЧКИ ОТВЕТИЛИ (ревью раунда 4, MAJ-1): роли и имена деталей, несущие свою
 * карточку в контексте мутации (`onMutate` → `{ card }`). Не дольше `timeoutMs`: запись, застрявшая
 * без сети, иначе держала бы GENERATE на «saving…», пока сеть не вернётся. `false` — не дождались.
 */
async function bandWritesSettled(
  qc: QueryClient,
  card: number,
  timeoutMs: number,
): Promise<boolean> {
  const cache = qc.getMutationCache();
  const pendingHere = () =>
    cache
      .findAll({ status: 'pending' })
      .some(
        (m) =>
          (m.state.context as WriteContext | undefined)?.card === card &&
          isDigestWrite(m.state.variables),
      );
  if (!pendingHere()) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(!pendingHere()), timeoutMs);
    unsubscribe = cache.subscribe(() => {
      if (!pendingHere()) finish(true);
    });
  });
}

/**
 * ПОЛОСА — СВЕЖИМ ЧТЕНИЕМ, КОТОРОЕ ОБЯЗАНО ДОЙТИ (финальная сверка). `refetchQueries` глотает ошибку
 * и без сети отвечает сразу, оставляя в кэше старые роли, — отпечаток молча собрался бы из них.
 * `fetchQuery` ОТКАЗЫВАЕТ: `networkMode: 'always'` — без сети он падает, а не ждёт её; `retry: false`
 * — отказ сразу, «попробуйте ещё раз» скажет ряд. Описание чтения — ТО ЖЕ, что у экрана: функция
 * запроса берётся у запроса полосы в кэше (`bandQuery`, `use-design-band.ts`), второе описание
 * разошлось бы с первым на первом же новом аргументе.
 */
async function rereadBand(qc: QueryClient, card: number): Promise<GetDesignBandResponse> {
  const queryKey = designKeys.band(card);
  const queryFn = qc.getQueryCache().find({ queryKey, exact: true })?.options.queryFn;
  if (typeof queryFn !== 'function') throw new Error('the band is not read on this page');
  return qc.fetchQuery({
    queryKey,
    queryFn: queryFn as QueryFunction<GetDesignBandResponse>,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
  });
}

export function FlatRunRow({
  band,
  techCardId,
  disabled,
  thumbOf,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** The picture of a media id as the input already resolves it (library + band). */
  thumbOf?: (mediaId: number) => string;
}): JSX.Element {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const qc = useQueryClient();
  const startRun = useStartRun(techCardId);
  const { showMessage } = useSnackBarStore();

  /* ЧЕРНОВИК — С ЗАПРОСА В ПОЛЁТЕ, ИНАЧЕ ПАМЯТЬ ВКЛАДКИ (ревью раунда 3, m2; гейт волны 3, W1): ряд,
     вернувшийся после смены шага, рисует то, за что уже платят; ряд, не перемонтированный при смене
     карточки, пересеивает выбор с новой карточки прямо в отрисовке. */
  const [draft, setDraftState] = useState<FlatAsk>(() => flatDraftOf(techCardId));
  const [draftCard, setDraftCard] = useState(techCardId);
  if (draftCard !== techCardId) {
    setDraftCard(techCardId);
    setDraftState(flatDraftOf(techCardId));
  }
  const setDraft = (next: FlatAsk) => {
    setDraftState(next);
    rememberFlatDraft(techCardId, next);
  };

  const bench = useMemo(() => readBench(band, 'flat'), [band]);
  const drafted = useDrafted();

  /* ═══ TARGET ▾ (§1.1) — views first, then the details not drawn yet. */
  const targets = useMemo(
    () =>
      flatTargets({
        sides: bench.sides,
        details: bench.details,
        nameOf: (d) => displayDetailName(bench.details, d),
        proposed: (id) => drafted.slotProposed(id),
        stale: staleShown,
      }),
    [bench, drafted],
  );
  const target = settleTarget(draft.target, targets);
  const detailId = targetSlotId(target);

  const wholeBench = useMemo(
    () => ({
      viewKeys: bench.sides.map((s) => s.view),
      slotIds: bench.details.map((d) => d.id ?? 0).filter((id) => id > 0),
    }),
    [bench],
  );
  const marked = useMemo(() => markedPlatesOf(band, wholeBench), [band, wholeBench]);

  /** МИНИМУМ МУДБОРДА — та же фраза, что запирает FLAT на рельсе (D-10, `core/mood-gate.ts`). */
  const mood = useMoodMinimumGate();
  const moodReason = mood.ok ? null : mood.reason;
  const moodDoors = mood.ok ? [] : mood.doors;

  /** СНАЧАЛА СОХРАНИТЬ, ПОТОМ ПЛАТИТЬ (D-16, контракт `autosave`, Codex B-05). */
  const autosave = useTechCardAutosave();
  const input = useFlatInput(techCardId);
  const busy = input.run !== null;
  /** A flat run of this card is drawing (D5): GENERATE pending until it ends. */
  const inFlight = flatRunInFlight(band);
  const refused = input.refused;
  useEffect(() => {
    if (autosave.status === 'saved' || autosave.status === 'idle') {
      patchFlatInput(techCardId, { refused: null });
    }
  }, [autosave.status, techCardId]);
  const saveless = !!disabled || autosave.status === 'off';
  useEffect(() => {
    if (saveless && refused !== null) patchFlatInput(techCardId, { refused: null });
  }, [saveless, refused, techCardId]);
  const refusalSentence = saveless
    ? null
    : refused === 'released'
      ? 'the card was released while it was being saved'
      : refused === 'stopped'
        ? 'the card stopped saving while GENERATE waited for it'
        : refused
          ? flushRefusalSentence(refused, autosave.errorsCount, autosave.refusal) ||
            'the card is not saved yet'
          : null;

  const form = useFormContext<TechCardFormData>();

  /* ═══ THE CARD'S TECHNICAL FLATS — what «from my flat» redraws (the server accepts only these). */
  const techRows = useWatch({ control: form.control, name: 'technicalMedia' });
  const techIds = useMemo(
    () =>
      [...new Set(((techRows ?? []) as { mediaId?: number }[]).map((r) => r?.mediaId ?? 0))].filter(
        (id) => id > 0,
      ),
    [techRows],
  );
  const { data: techCard } = useTechCard(techCardId > 0 ? techCardId : undefined);
  const techThumb = useMemo(() => {
    const m = new Map<number, string>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      const id = rm.media?.id ?? 0;
      const url = rm.media?.media?.thumbnail?.mediaUrl || rm.media?.media?.fullSize?.mediaUrl || '';
      if (id > 0 && url) m.set(id, url);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);
  /** The toggle stands only for the views, and only when the card has a technical flat. */
  const myFlatOffered = techIds.length > 0 && detailId === 0;
  const fromMyFlat = myFlatOffered && draft.fromMyFlat;
  const structureNow = fromMyFlat ? liveStructure(draft.structure, techIds) : [];
  /** The toggle was on and the card's flats are gone: said, and the route falls back. */
  const myFlatGone = draft.fromMyFlat && detailId === 0 && techIds.length === 0;
  const toggleMyFlat = () => {
    if (fromMyFlat) setDraft({ ...draft, fromMyFlat: false, structure: [] });
    else
      setDraft({
        ...draft,
        fromMyFlat: true,
        structure:
          liveStructure(draft.structure, techIds).length > 0
            ? liveStructure(draft.structure, techIds)
            : autoStructure(techIds),
      });
  };

  /* ═══ ASK · REFERENCES (T70): input pictures with no role are asked about on GENERATE. ═══ */
  const boardRows = useWatch({ control: form.control, name: 'moodboardMedia' }) as
    | BoardItem[]
    | undefined;
  const inputIds = useMemo(() => inputIdsOf(boardRows, isInputRow), [boardRows]);
  const refChoices = useRefChoices(techCardId);
  const toAsk = useMemo(
    () =>
      picturesToAsk(
        unmarkedInputIds(
          inputIds,
          band.references,
          moodPictureIds(boardRows as { mediaId?: number; role?: string }[] | undefined),
        ),
        refChoices,
      ),
    [inputIds, band.references, boardRows, refChoices],
  );
  /** The quiz is open: its queue (frozen at the press), for this card, and how GENERATE was pressed. */
  const [refAsk, setRefAsk] = useState<{
    card: number;
    ids: number[];
    opts: { withoutList?: boolean };
  } | null>(null);
  const refAskHere = refAsk && refAsk.card === techCardId ? refAsk : null;

  /* ═══ THE ROUTE, IN CODE (§3.4) ═══ */
  const route = routeOf({
    target,
    fromMyFlat,
    structure: structureNow.length,
    joins: band.joins,
  });

  const writesOff = !!disabled || !speaks;
  /* ═══ THE LIST: read from the row (the JOINS group left the screen) ═══ */
  const joinsRead = useJoinsRead(techCardId, band, writesOff);
  /* Wave 10: with the list out of the prompt it neither locks GENERATE nor asks (FLAT_CONSTRUCTION_IN_PROMPT). */
  const readsList = FLAT_CONSTRUCTION_IN_PROMPT && (route === 'photos' || route === 'straps');
  const listBuilding = readsList && !band.joins && joinsRead.reading;
  const questions = useMemo(
    () => (readsList && !joinsRead.reading ? pendingQuestions(band.joins, route) : []),
    [readsList, joinsRead.reading, band.joins, route],
  );
  const askBusy = useAskBusy(techCardId);
  /** The stale confirmation is being recovered (§3.3): «the photos changed — one more look». */
  const [recovering, setRecovering] = useState(false);

  /* Выбор ряда заперт, пока ждём сохранения и пока запрос в полёте (ревью MAJOR), и пока CLEAR. */
  const choiceOff = writesOff || busy || input.clearing || recovering;
  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : input.clearing || input.rewriting > 0
        ? 'the prompt is being changed — generate once it is done'
        : moodReason
          ? moodReason
          : recovering
            ? 'the photos changed — one more look'
            : listBuilding
              ? READING
              : questions.length > 0
                ? `answer ${questions.length === 1 ? 'the question' : `${questions.length} questions`} first`
                : askBusy
                  ? 'saving the answers'
                  : fromMyFlat && structureNow.length === 0
                    ? 'pick a front or back flat'
                    : null;

  /** Карточка на экране СЕЙЧАС — для перепроверки после ожидания брифа (R2). */
  const cardNow = useRef(techCardId);
  cardNow.current = techCardId;

  const openSaveDoor = async () => {
    if (refused === 'invalid') {
      await form.trigger();
      const first = flattenFieldErrors(form.control._formState.errors)[0];
      if (first && revealField(first.path)) return;
    }
    const chip = document.querySelector<HTMLElement>('[data-save-status]');
    if (!chip) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    chip.scrollIntoView({ behavior: 'smooth', block: 'center' });
    chip.querySelector<HTMLElement>('[aria-haspopup]')?.click();
  };

  /**
   * GENERATE. `withoutList` — `generate without it ›` while the list is still being read: the photos
   * route, now. `recovered` — the one automatic retry after a stale confirmation was re-saved (§3.3);
   * never a second.
   */
  const submit = async (opts: { withoutList?: boolean; recovered?: boolean } = {}) => {
    const card = techCardId;
    // `generate without it ›` passes the list lock only — never another one.
    const bypass = !!opts.withoutList && gateReason === READING;
    if ((gateReason && !bypass) || !mood.ok || card <= 0 || inFlight) return;
    if (flatInputBusy(readFlatInput(card))) return;
    const wasOn = autosave.status !== 'off';
    const ask: FlatAsk = { target, fromMyFlat, structure: [...structureNow] };
    patchFlatInput(card, { run: 'saving', refused: null, serverRefusal: null, ask });
    let refusal: ServerRefusal | null = null;
    let retryStale = false;
    try {
      const brief = await settleSeedBrief(card);
      if (brief === 'busy') return;
      if (brief === 'waited' && (cardNow.current !== card || !cardOnScreen(card))) return;
      materializeWords(card, form, wasOn && !disabled);
      let saved: FlushResult;
      try {
        saved = await autosave.flush('flat');
      } catch {
        saved = 'error';
      }
      if (saved === 'off' && wasOn) {
        patchFlatInput(card, {
          refused: form.getValues('approvalState') === RELEASED ? 'released' : 'stopped',
        });
        return;
      }
      if (!flushAllowsRun(saved)) {
        patchFlatInput(card, { refused: saved });
        return;
      }
      const now = form.getValues();
      if (now.approvalState === RELEASED) {
        patchFlatInput(card, { refused: 'released' });
        return;
      }
      if (!serverSpeaksNow(qc, card)) return;
      const gateNow = moodMinimumGate({
        boardPictures: ((now.moodboardMedia ?? []) as BoardItem[]).filter(isBoardRow).length,
        concept: now.concept,
        categoryId: now.categoryId,
      });
      if (!gateNow.ok) return;
      if (
        !(await bandWritesSettled(qc, card, BAND_WRITES_WAIT_MS)) ||
        (FLAT_CONSTRUCTION_IN_PROMPT && !(await joinsSavesSettled(card, BAND_WRITES_WAIT_MS)))
      ) {
        if (cardOnScreen(card)) {
          showMessage('the input is still being saved — try again; nothing was started', 'error');
        }
        return;
      }
      let freshBand: GetDesignBandResponse;
      try {
        freshBand = await rereadBand(qc, card);
      } catch {
        if (cardOnScreen(card)) {
          showMessage('could not re-read the input — nothing was started; try again', 'error');
        }
        return;
      }
      // D5: a flat run started meanwhile (another tab, or this press's band not re-read yet).
      if (flatRunInFlight(freshBand)) {
        if (cardOnScreen(card)) {
          showMessage('a flat run is already drawing — nothing was started', 'error');
        }
        return;
      }
      /* THE ROUTE ON THE FRESH BAND: the list may have landed or moved while the card saved. A press
         made without the list stays on photos. */
      const fresh = readBench(freshBand, 'flat');
      const freshRoute: FlatRoute = opts.withoutList
        ? 'photos'
        : routeOf({ target, fromMyFlat, structure: structureNow.length, joins: freshBand.joins });
      if (freshRoute === 'hand_flat') {
        const onCard = new Set(
          ((form.getValues('technicalMedia') ?? []) as { mediaId?: number }[]).map(
            (r) => r?.mediaId ?? 0,
          ),
        );
        if (structureNow.some((r) => !onCard.has(r.mediaId))) {
          refusal = localRefusal('structure_gone');
          return;
        }
      }
      if (
        FLAT_CONSTRUCTION_IN_PROMPT &&
        !opts.withoutList &&
        (freshRoute === 'photos' || freshRoute === 'straps') &&
        pendingQuestions(freshBand.joins, freshRoute).length > 0
      ) {
        // The fresh list asks something: the questions stand above the row; nothing is sent.
        return;
      }
      /* STRAPS RUNS ON A CONFIRMED LIST (the server gate stays, the button went): a list that asks
         nothing is saved confirmed as it stands — the same save `skip all ›` makes. */
      if (freshRoute === 'straps' && freshBand.joins && !confirmedNow(card, freshBand.joins)) {
        const r = await saveJoinsConfirmed(qc, card, freshBand.joins, freshBand.joins.rev ?? 0);
        if (!r.ok) {
          if (cardOnScreen(card)) showMessage(`${r.why} — nothing was started`, 'error');
          return;
        }
        try {
          freshBand = await rereadBand(qc, card);
        } catch {
          if (cardOnScreen(card)) {
            showMessage('could not re-read the input — nothing was started; try again', 'error');
          }
          return;
        }
      }
      const slotId = targetSlotId(target);
      /* The FRONT and BACK a detail agrees with: the server attaches their plates itself (T8); here
         they only gate the press and travel in the fingerprint (other views = another intent). */
      const flatSlotIds = slotId > 0 ? detailFlatSlotIds(fresh.sides) : [];
      if (slotId > 0 && flatSlotIds.length < 2) {
        refusal = localRefusal('views_first');
        return;
      }
      const mode = modeOfRoute(freshRoute);
      /* T70 · `figure it out ✦`: the role-less input pictures the person left to the model travel as
         named extras — the server folds them into the refs with an EMPTY role («reference image»). */
      const nowBoard = (now.moodboardMedia ?? []) as BoardItem[];
      const extras = figureIds(
        unmarkedInputIds(
          inputIdsOf(nowBoard, isInputRow),
          freshBand.references,
          moodPictureIds(nowBoard as { mediaId?: number; role?: string }[]),
        ),
        readRefChoices(card),
      );
      const params: common_DesignRunParams = {
        views: slotId > 0 ? ['detail'] : [...VIEWS_ORDER],
        detailSlotIds: slotId > 0 ? [slotId] : [],
        layout: 'one',
        colorwayId: 0,
        colour: undefined,
        threed: undefined,
        fixTarget: '',
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: slotId === 0,
        pattern: undefined,
        // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform (`freeform_forbidden`).
        freeform: undefined,
        /* A DETAIL READS THE FINISHED FRONT AND BACK (owner 06.10, answer 3) — attached by the SERVER
           on a detail run (T8); the client sends no slots on any flat run. `false` is SAID: an empty
           list with the flag on would mean «every filled slot». */
        useFlatSlots: false,
        flatSlotIds: [],
        extraInputMediaIds: extras,
        image: undefined,
        inpaint: undefined,
        extend: undefined,
        video: undefined,
        // THE MODE (81-FINAL-MODES). Photos and a detail send nothing: an absent block is photos.
        flat: mode ? flatParamsFor(mode, structureNow) : undefined,
      };
      // D5, last look: every re-read above (the straps confirmation re-reads too) is checked here.
      if (flatRunInFlight(freshBand)) {
        if (cardOnScreen(card)) {
          showMessage('a flat run is already drawing — nothing was started', 'error');
        }
        return;
      }
      patchFlatInput(card, { run: 'starting' });
      refusal = await startRun.start({
        kind: 'flat',
        ask: '',
        params,
        snapshot: flatSnapshot(
          freshBand,
          now,
          params.detailSlotIds ?? [],
          (mode ?? 'photos') as FlatMode,
          { target, route: freshRoute, flatSlotIds, extras },
        ),
      });
      if (refusal?.reason === 'joins_unconfirmed') {
        void qc.invalidateQueries({ queryKey: designKeys.band(card) });
        // STALE (other photos or another note since the confirmation): recovered without a pill.
        if (refusal.meta?.reason === 'stale' && !opts.recovered) {
          refusal = null;
          retryStale = true;
        }
      }
    } finally {
      patchFlatInput(card, { run: null, serverRefusal: refusal, ask: refusal ? ask : null });
    }
    if (retryStale) void recoverStale(card);
  };

  /**
   * §3.3: the list is asked for again the free way. Same rev (a cache hit) → it is re-saved
   * confirmed and GENERATE is pressed once more; a new rev → its questions are asked.
   */
  const recoverStale = async (card: number) => {
    setRecovering(true);
    try {
      const got = await rereadForStale(qc, card);
      if (got !== 'same') return;
      const joins = qc.getQueryData<GetDesignBandResponse>(designKeys.band(card))?.joins;
      if (!joins) return;
      const r = await saveJoinsConfirmed(qc, card, joins, joins.rev ?? 0);
      if (!r.ok) return;
    } finally {
      setRecovering(false);
    }
    if (cardNow.current === card) void submit({ recovered: true });
  };

  /**
   * GENERATE PRESSED (T70): the pictures with no role are asked about first — the quiz opens above
   * the row and nothing is sent; its last answer calls `submit` with the same options.
   */
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const press = (opts: { withoutList?: boolean } = {}) => {
    const bypass = !!opts.withoutList && gateReason === READING;
    if ((gateReason && !bypass) || !mood.ok || techCardId <= 0 || inFlight) return;
    if (flatInputBusy(readFlatInput(techCardId)) || refAskHere) return;
    if (toAsk.length > 0) {
      setRefAsk({ card: techCardId, ids: [...toAsk], opts });
      return;
    }
    void submit(opts);
  };
  const refAskDone = () => {
    const opts = refAskHere?.opts ?? {};
    setRefAsk(null);
    // Next tick: the last role write released the input hold; the row reads it live.
    window.setTimeout(() => {
      if (cardNow.current === techCardId) void submitRef.current(opts);
    }, 0);
  };
  const ordinalOf = (mediaId: number) => Math.max(1, inputIds.indexOf(mediaId) + 1);

  const skipAll = () => {
    if (!band.joins || askBusy) return;
    void finishAsk(qc, techCardId, band.joins, questions);
  };

  const targetItems = targets;
  const selectTitle = targetItems.find((t) => t.value === target)?.title ?? '';

  return (
    <div data-flat-run='' data-flat-route={route} className='space-y-3'>
      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the controls are here, but nothing can be
          started against them.
        </CalloutBox>
      )}

      {/* Z2 · ASK — the questions the list raises, above the row whose GENERATE waits for them. */}
      {questions.length > 0 && band.joins && !writesOff && (
        <AskConstruction techCardId={techCardId} joins={band.joins} questions={questions} />
      )}

      {/* Z2' · ASK · REFERENCES (T70) — the pictures with no role, opened by GENERATE. */}
      {refAskHere && !writesOff && (
        <AskReferences
          key={`${refAskHere.card}:${refAskHere.ids.join(',')}`}
          techCardId={techCardId}
          ids={refAskHere.ids}
          thumbOf={thumbOf}
          ordinalOf={ordinalOf}
          disabled={busy || inFlight}
          onDone={refAskDone}
          onCancel={() => setRefAsk(null)}
        />
      )}

      {/* Z3 · THE RUN ROW. `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={
            gateReason
              ? { ok: false, reason: gateReason }
              : refAskHere
                ? { ok: false, reason: 'say what each picture is first' }
                : { ok: true }
          }
          pending={busy || recovering || inFlight}
          pendingLabel={inFlight && !busy ? 'drawing…' : undefined}
          onGenerate={() => press()}
          trailing={
            <>
              {/* T69 (06.10): «дропдаун не системный а с нашим дизайном и в размер кнопки генерейт» —
                  общий Radix-список (`ui/components/select`), коробка ровно с GENERATE по высоте. */}
              <span className='inline-flex shrink-0' data-flat-target={target} title={selectTitle}>
                <Select
                  name='flat-target'
                  placeholder='what to draw'
                  items={targetItems.map((t) => ({
                    value: t.value,
                    label: t.label,
                    disabled: t.disabled,
                  }))}
                  value={target}
                  disabled={choiceOff}
                  onValueChange={(v: string) => setDraft({ ...draft, target: v })}
                  className='!min-h-0 h-[26px] min-w-[9rem] !py-0 text-micro uppercase tracking-label'
                  itemClassName='text-micro uppercase tracking-label'
                />
              </span>
              {myFlatOffered && (
                <Chip
                  data-flat-myflat={fromMyFlat ? 'on' : 'off'}
                  selected={fromMyFlat}
                  pressed={fromMyFlat}
                  disabled={choiceOff}
                  style={ROW_CONTROL_STYLE}
                  title={
                    fromMyFlat
                      ? 'your technical flats are redrawn clean · click: draw from the photos'
                      : 'redraw your own technical flats clean instead of reading the photos'
                  }
                  onClick={toggleMyFlat}
                >
                  from my flat
                </Chip>
              )}
              {/* THE ROUTE — a word, not a button; «from my flat» says itself on the toggle. */}
              {route !== 'hand_flat' && (
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='uppercase tracking-label'
                  data-flat-route-pill={route}
                  title={ROUTE_WHY[route]}
                >
                  · {ROUTE_WORD[route]}
                </Text>
              )}
              {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — рядом с GENERATE (R2 п.20); с 06.10 там же и конструкция. */}
              <Button variant='secondary' size='sm' onClick={() => setWmgOpen(true)}>
                <ControlLabel>what the model gets ▸</ControlLabel>
              </Button>
            </>
          }
        />
        {/* «FROM MY FLAT»: the card's technical flats, each one front or back (one per side). */}
        {fromMyFlat && (
          <div data-flat-structure='' className='flex flex-wrap items-start gap-3 pt-1'>
            {techIds.map((id) => {
              const role = structureNow.find((p) => p.mediaId === id)?.role ?? '';
              const url = techThumb.get(id) || thumbOf?.(id) || '';
              return (
                <div
                  key={id}
                  data-flat-structure-tile={id}
                  data-structure-role={role}
                  className='flex flex-col items-center gap-1'
                >
                  <div
                    className={cn(
                      'flex size-16 items-center justify-center border bg-bgColor',
                      role ? 'border-textColor' : 'border-borderColor',
                    )}
                  >
                    {url ? (
                      <img src={url} alt='' className='size-full object-contain' />
                    ) : (
                      <Text size='micro' variant='label' component='span'>
                        #{id}
                      </Text>
                    )}
                  </div>
                  <span className='flex gap-2'>
                    {STRUCTURE_ROLES.map(({ role: r, label }) => (
                      <button
                        key={r}
                        type='button'
                        data-structure-pick={r}
                        aria-pressed={role === r}
                        disabled={choiceOff}
                        title={role === r ? `the ${label} · click: neither` : `use as the ${label}`}
                        onClick={() =>
                          setDraft({ ...draft, structure: pickStructure(structureNow, id, r) })
                        }
                        className={cn(
                          'text-nano uppercase tracking-label',
                          role === r
                            ? 'text-textColor'
                            : 'text-labelColor underline hover:text-textColor',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Z4 · ONE LINE UNDER THE ROW: why GENERATE waits, and the one door that moves it on. */}
      {speaks && !disabled && !moodReason && listBuilding && (
        <div data-flat-reading=''>
          <LockBar reason='reading the construction from the photos'>
            <Button
              variant='underline'
              size='xs'
              data-flat-without-list=''
              disabled={busy || inFlight}
              onClick={() => press({ withoutList: true })}
            >
              generate without it ›
            </Button>
          </LockBar>
        </div>
      )}
      {speaks &&
        !disabled &&
        readsList &&
        !band.joins &&
        !joinsRead.reading &&
        joinsRead.failed && (
          <div data-flat-read-failed=''>
            <LockBar reason='the construction could not be read'>
              <Button
                variant='underline'
                size='xs'
                data-flat-read-retry=''
                title={joinsRead.failed}
                onClick={joinsRead.retry}
              >
                retry ›
              </Button>
            </LockBar>
          </div>
        )}
      {speaks && !disabled && !moodReason && questions.length > 0 && (
        <div data-flat-asking={questions.length}>
          <LockBar
            reason={`answer ${questions.length === 1 ? 'the question' : `${questions.length} questions`} first`}
          >
            <Button
              variant='underline'
              size='xs'
              data-flat-skip-all=''
              disabled={askBusy}
              title='the construction as the model read it'
              onClick={skipAll}
            >
              skip all ›
            </Button>
          </LockBar>
        </div>
      )}
      {recovering && (
        <div data-flat-recovering=''>
          <LockBar reason='the photos changed — one more look' />
        </div>
      )}
      {myFlatGone && (
        <div data-flat-myflat-gone=''>
          <LockBar reason='your flat was removed — drawing from photos' />
        </div>
      )}

      {/* ОТКАЗ МИНИМУМА МУДБОРДА — СЛОВАМИ И С ДВЕРЬЮ. */}
      {moodReason && speaks && !disabled && (
        <div data-flat-mood-gate=''>
          <LockBar reason={moodReason}>
            {moodDoors.map((door) => (
              <Button
                key={door.field}
                variant='secondary'
                size='sm'
                data-mood-door={door.field}
                onClick={() => openGateDoor(door)}
              >
                <ControlLabel>{door.label}</ControlLabel>
              </Button>
            ))}
          </LockBar>
        </div>
      )}
      {/* СОХРАНЕНИЕ НЕ ПРОШЛО — ПРОГОН НЕ ЗАПУЩЕН (контракт autosave). */}
      {refusalSentence && (
        <div data-flat-flush-refusal=''>
          <LockBar reason={`${refusalSentence} — nothing was started, nothing was charged`}>
            {refused !== 'released' && (
              <Button
                variant='secondary'
                size='sm'
                data-flush-door={refused ?? ''}
                onClick={() => void openSaveDoor()}
              >
                <ControlLabel>{refused === 'invalid' ? 'first error ›' : 'saving ›'}</ControlLabel>
              </Button>
            )}
          </LockBar>
        </div>
      )}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.</b>{' '}
            a flat run reads the card’s references, never the bench plates, so nothing drawn there
            travels with GENERATE — the marks remain on their plates for people.
          </Text>
        </CalloutBox>
      )}
      {/* ОТКАЗ ЗАПУСКА — СТОЙКАЯ ПОЛОСА, НЕ СНЕКБАР (CONTRACT §E). */}
      {(() => {
        const dismiss = () =>
          patchFlatInput(
            techCardId,
            readFlatInput(techCardId).run === null
              ? { serverRefusal: null, ask: null }
              : { serverRefusal: null },
          );
        const short = flatRefusalWords(input.serverRefusal?.reason, input.serverRefusal?.meta);
        return short ? (
          <CalloutBox tone='error'>
            <div
              data-flat-refusal={input.serverRefusal?.reason}
              className='flex items-center gap-2'
            >
              <Text size='micro' component='span' className='min-w-0 flex-1 normal-case'>
                <b>not started</b> · {short}
              </Text>
              <button
                type='button'
                onClick={dismiss}
                className='shrink-0 text-labelColor hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='nano' variant='uppercase' tracking='label' component='span'>
                  dismiss
                </Text>
              </button>
            </div>
          </CalloutBox>
        ) : (
          <RunRefusal refusal={input.serverRefusal} onDismiss={dismiss} />
        );
      })()}
      <WhatModelGetsModal
        open={wmgOpen}
        onOpenChange={setWmgOpen}
        band={band}
        techCardId={techCardId}
        readOnly={!!disabled}
        detailSlotId={detailId}
      />
    </div>
  );
}
