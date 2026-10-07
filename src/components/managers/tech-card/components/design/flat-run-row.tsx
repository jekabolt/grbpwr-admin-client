import { useQueryClient, type QueryClient, type QueryFunction } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_DesignInputSnapshot,
  common_DesignRunParams,
} from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';
import { flattenFieldErrors, revealField } from 'utils/field-errors';

import type { TechCardFormData } from '../schema';

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
  type StructurePick,
  type StructureRole,
} from './flat-mode';
import {
  VIEWS_ORDER,
  VIEWS_TARGET,
  detailFlatSlotIds,
  flatHumanWords,
  flatTargets,
  followCategory,
  modeOfRoute,
  routeOf,
  settleTarget,
  targetSlotId,
  type FlatRoute,
  type FlatTarget,
} from './flat-route';
import type { RunRefusal as ServerRefusal } from './generation/refusal';
import { isRunLive } from './generation/run-state';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { isBoardRow, type BoardItem } from './mood-board';
import Select from 'ui/components/select';
import { GenerateRow, LockBar, RunRefusal } from './render/generate-row';
import type { CalloutLike } from './render/what-model-gets';
import { staleShown } from './stale-details';
import {
  cardOnScreen,
  designKeys,
  isUnimplemented,
  serverSpeaksNow,
  type WriteContext,
} from './use-design-band';
import { useGarmentClass } from './head/card-facts-form';
import { settleSeedBrief } from './words-brief';
import { materializeWords } from './words-seed';

/**
 * ═══ РЯД ЗАПУСКА БЛОКА INPUT — REFERENCES (82-INPUT-REDESIGN, 06.10; M7 07.10) ══════════════════
 *
 *   GENERATE · target ▾ · (from my flat) · what the model gets ▸
 *
 * Owner request 8: «always 4 views; first press = the views sheet; drop one picture / per view; drop
 * FRONT/BACK/SIDE toggles; a dropdown by GENERATE: views again first, then un-generated details; no
 * mode switch — route automatic, from-my-flat explicit».
 *   · `target ▾` (`flatTargets`): `views` / `views again`, then each detail not drawn yet (or stale
 *     and not kept) — disabled until FRONT and BACK hold a picture;
 *   · `from my flat` — a quiet toggle, drawn only when the card has technical flats and the target
 *     is the views; never automatic. On: the structure tiles under the row (front / back per flat).
 * M7 (owner 07.10, 100-CONSTRUCTION-DEADEND): no construction on the row any more — no ASK ·
 * construction questions, no route pill, no `straps & openings`, no «reading the construction» lock.
 * M6: nor is the join list read in the background any more — PARTS reads its own pieces list
 * from the accepted FRONT/BACK flats on the server.
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

/** The native select of the row, styled as the neck-shape select of the joins list. */
const STRUCTURE_ROLES: { role: StructureRole; label: string }[] = [
  { role: 'front_flat', label: 'front' },
  { role: 'back_flat', label: 'back' },
];

/**
 * THE PARAMS OF A FLAT PRESS — one builder for GENERATE and for «what the model gets» (101 Ф3): the
 * modal asks the server about EXACTLY the request the button would send.
 */
export function flatRunParams(
  slotId: number,
  mode: FlatMode | null,
  structure: readonly StructurePick[],
): common_DesignRunParams {
  return {
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
    freeform: undefined,
    /* A DETAIL READS THE FINISHED FRONT AND BACK (owner 06.10, answer 3) — attached by the SERVER on
       a detail run (T8); the client sends no slots on any flat run. `false` is SAID: an empty list
       with the flag on would mean «every filled slot». */
    useFlatSlots: false,
    flatSlotIds: [],
    // The moodboard is the input (101): nothing travels beside it.
    extraInputMediaIds: [],
    image: undefined,
    inpaint: undefined,
    extend: undefined,
    video: undefined,
    flat: mode ? flatParamsFor(mode, [...structure]) : undefined,
  };
}

/**
 * WHAT THE ROW STANDS ON, FOR THE INPUT'S PICTURES (M13): the target ▾ and the params a VIEWS press
 * would send (the «from my flat» choice applies to the views only). A detail press sends
 * `flatRunParams(slotId, null, [])` — the input's pictures build it themselves.
 */
export type FlatSelection = { target: FlatTarget; views: common_DesignRunParams };

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
  /**
   * THE TARGET AND THE ROUTE (82-INPUT-REDESIGN §3.1): a different target or route is a different
   * intent; a detail run's FRONT/BACK slots travel with their pictures (owner 06.10, answer 3).
   */
  intent?: {
    target: string;
    route: string;
    flatSlotIds?: readonly number[];
    /**
     * 101 Ф3: WHAT THE SERVER SAID IT WOULD SEND (`PreviewDesignRunInputs`, same params). When it
     * answered, the pictures of the intent are ITS list — refs in prompt order with their view, and
     * the attached plates; a model label landing on a picture that stays home is not a new intent.
     */
    preview?: common_DesignInputSnapshot | null;
  },
): unknown {
  if (intent?.preview) {
    const p = intent.preview;
    const details = band
      ? readBench(band, 'flat')
          .details.filter((d) => detailSlotIds.includes(d.id ?? 0))
          .map((d) => [d.id ?? 0, (d.detailName ?? '').trim()])
          .sort((a, b) => (a[0] as number) - (b[0] as number))
      : [];
    return {
      // M14 (Codex): the words are the server's own note below — the class line and the person's
      // flat words as they travel. The description's prose and the fit are not sent to a flat, so an
      // edit of them is the same request.
      preview: {
        refs: (p.refs ?? []).map((r) => [
          r.mediaId ?? 0,
          (r.role ?? '').trim(),
          (r.note ?? '').trim(),
          (r.callouts ?? []).map((c) => (c.text ?? '').trim()),
        ]),
        slots: (p.slots ?? []).map((x) => [
          (x.viewKey ?? '').trim(),
          x.slotId ?? 0,
          x.mediaId ?? 0,
        ]),
        note: (p.garmentNote ?? '').trim(),
      },
      details,
      target: intent.target,
      route: intent.route,
    };
  }
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
    human: flatHumanWords((now.flatWords ?? '') as string),
    fit: now.fit ?? '',
    refs,
    mood,
    callouts,
    details,
    // The join list is no input of a flat (M7): kept null so a fingerprint stays the one it was.
    joins: null,
    ...(intent
      ? {
          target: intent.target,
          route: intent.route,
          flatSlots: (intent.flatSlotIds ?? []).map((id) => [
            id,
            (band?.bench ?? []).find((b) => (b.id ?? 0) === id)?.pictureId ?? 0,
          ]),
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
  onSelection,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** The picture of a media id as the input already resolves it (library + band). */
  thumbOf?: (mediaId: number) => string;
  /** M13: told the target ▾ and the views params whenever they change (the INPUT's pictures). */
  onSelection?: (selection: FlatSelection) => void;
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
  /* M10: the one line of words a flat sends — «garment: <class>» — names the card's category NOW. */
  const garmentClass = useGarmentClass();

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

  /* ═══ THE ROUTE, IN CODE (§3.4) ═══ */
  const route = routeOf({ target, fromMyFlat, structure: structureNow.length });

  /* M13 · THE INPUT'S PICTURES ARE THE SERVER'S ANSWER FOR THESE VERY PARAMS. The views press as it
     would go with `views` on the target ▾ — the same builder as GENERATE and the modal, so on the
     views target it IS the press. Told before paint: the tiles never show the other target. */
  const viewsFromMyFlat = techIds.length > 0 && draft.fromMyFlat;
  const viewsStructure = viewsFromMyFlat ? liveStructure(draft.structure, techIds) : [];
  const viewsParams = flatRunParams(
    0,
    modeOfRoute(
      routeOf({
        target: VIEWS_TARGET,
        fromMyFlat: viewsFromMyFlat,
        structure: viewsStructure.length,
      }),
    ),
    viewsStructure,
  );
  const selectionKey = JSON.stringify([target, viewsParams]);
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  useLayoutEffect(() => {
    const [t, views] = JSON.parse(selectionKey) as [FlatTarget, common_DesignRunParams];
    onSelectionRef.current?.({ target: t, views });
  }, [selectionKey]);

  const writesOff = !!disabled || !speaks;
  /* Выбор ряда заперт, пока ждём сохранения и пока запрос в полёте (ревью MAJOR), и пока CLEAR. */
  const choiceOff = writesOff || busy || input.clearing;
  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : input.clearing || input.rewriting > 0
        ? 'the prompt is being changed — generate once it is done'
        : moodReason
          ? moodReason
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

  /** GENERATE. */
  const submit = async () => {
    const card = techCardId;
    if (gateReason || !mood.ok || card <= 0 || inFlight) return;
    if (flatInputBusy(readFlatInput(card))) return;
    const wasOn = autosave.status !== 'off';
    const ask: FlatAsk = { target, fromMyFlat, structure: [...structureNow] };
    patchFlatInput(card, { run: 'saving', refused: null, serverRefusal: null, ask });
    let refusal: ServerRefusal | null = null;
    try {
      const brief = await settleSeedBrief(card);
      if (brief === 'busy') return;
      if (brief === 'waited' && (cardNow.current !== card || !cardOnScreen(card))) return;
      materializeWords(card, form, wasOn && !disabled);
      // M10: a seeded class line left behind by a category change goes with this save, so the run
      // (which reads the SAVED card) names the category on screen; a written class stays. The
      // category is read NOW, not at the click: the brief above may have waited (Codex M10).
      if (wasOn && !disabled) {
        const was = (form.getValues('garmentDescription') ?? '') as string;
        const cls = garmentClass.classOf(Number(form.getValues('categoryId') ?? 0));
        const next = followCategory(was, cls, garmentClass.seeded);
        if (next !== was) form.setValue('garmentDescription', next, { shouldDirty: true });
      }
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
      if (!(await bandWritesSettled(qc, card, BAND_WRITES_WAIT_MS))) {
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
      const fresh = readBench(freshBand, 'flat');
      const freshRoute: FlatRoute = routeOf({ target, fromMyFlat, structure: structureNow.length });
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
      const slotId = targetSlotId(target);
      /* The FRONT and BACK a detail agrees with: the server attaches their plates itself (T8); here
         they only gate the press and travel in the fingerprint (other views = another intent). */
      const flatSlotIds = slotId > 0 ? detailFlatSlotIds(fresh.sides) : [];
      if (slotId > 0 && flatSlotIds.length < 2) {
        refusal = localRefusal('views_first');
        return;
      }
      const params = flatRunParams(slotId, modeOfRoute(freshRoute), structureNow);
      /* THE FINGERPRINT IS THE SERVER'S LIST (101 Ф3): what this very request would freeze. A server
         without the route (404/501) — the band's labels stand in, as before the preview existed; any
         other failure stops the press: nothing was started (Codex Ф3). */
      let preview: common_DesignInputSnapshot | null = null;
      try {
        preview =
          (
            await adminService.PreviewDesignRunInputs({
              techCardId: card,
              kind: 'flat',
              params,
            })
          ).inputs ?? null;
      } catch (e) {
        if (!isUnimplemented(e)) {
          if (cardOnScreen(card)) {
            showMessage(
              'could not read what the model gets — nothing was started; try again',
              'error',
            );
          }
          return;
        }
      }
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
        snapshot: flatSnapshot(freshBand, now, params.detailSlotIds ?? [], {
          target,
          route: freshRoute,
          flatSlotIds,
          preview,
        }),
      });
      // M8: another tab started a flat run of this card — re-read, so GENERATE shows it drawing.
      if (refusal?.reason === 'flat_run_in_flight') {
        void qc.invalidateQueries({ queryKey: designKeys.band(card) });
      }
    } finally {
      patchFlatInput(card, { run: null, serverRefusal: refusal, ask: refusal ? ask : null });
    }
  };

  /**
   * GENERATE PRESSED (T70): the pictures with no role are asked about first — the quiz opens above
   * the row and nothing is sent; its last answer calls `submit` with the same options.
   */
  const press = () => {
    if (gateReason || !mood.ok || techCardId <= 0 || inFlight) return;
    if (flatInputBusy(readFlatInput(techCardId))) return;
    void submit();
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

      {/* Z3 · THE RUN ROW. `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
          pending={busy || inFlight}
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
              {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — рядом с GENERATE (R2 п.20). */}
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
        const short = flatRefusalWords(input.serverRefusal?.reason);
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
        detail={detailId > 0}
        params={flatRunParams(detailId, modeOfRoute(route), structureNow)}
      />
    </div>
  );
}
