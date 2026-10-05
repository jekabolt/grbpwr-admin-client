import { useQueryClient, type QueryClient, type QueryFunction } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';
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
import { ControlLabel, GROUP_GAP } from './core';
import { moodMinimumGate, openGateDoor } from './core/chain';
import { useDrafted } from './drafted-contract';
import { markedPlatesOf } from './fix-markup';
import { FlatCustom } from './flat-custom';
import {
  flatChoiceSummary,
  flatDraftOf,
  flatInputBusy,
  isDefaultFlatChoice,
  patchFlatInput,
  readFlatInput,
  setFlatModeDraft,
  tickDetail,
  tickView,
  useFlatInput,
  type FlatAsk,
  type FlatLayout,
} from './flat-input';
import {
  DEFAULT_FLAT_MODE,
  FLAT_MODE_WORD,
  autoStructure,
  flatParamsFor,
  flatRefusalWords,
  joinsConfirmed,
  liveStructure,
  pickStructure,
  suggestsStraps,
  type FlatMode,
  type StructurePick,
  type StructureRole,
} from './flat-mode';
import type { RunRefusal as ServerRefusal } from './generation/refusal';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { isBoardRow, type BoardItem } from './mood-board';
import { GenerateRow, LockBar, RunRefusal } from './render/generate-row';
import { cardOnScreen, designKeys, serverSpeaksNow, type WriteContext } from './use-design-band';
import type { CalloutLike } from './render/what-model-gets';
import { ACTIVE_VIEWS, DETAIL_VIEW, viewLabel } from './views';
import { settleSeedBrief } from './words-brief';
import { materializeWords } from './words-seed';

/**
 * ═══ РЯД ЗАПУСКА БЛОКА INPUT — REFERENCES (`runDoors('flat')` макета) ═══════════════════════════
 *
 *   GENERATE · WHAT THE MODEL GETS ▸
 *
 * Здесь стояла ОТДЕЛЬНАЯ секция `generation — flat`, потом — подвал `the flat run` с линейкой
 * группы, чипами видов, переключателем раскладки и рядом. Макет (`_step-flat.js`, SPEC п.7) знает
 * один блок и один ряд: то, что модели дают, и то, что у неё просят, — один запрос.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ВСТАВКА В `ReferencesSection`. Секция референсов уже несёт
 * два десятка хуков и приёмник рекола (`RecalledRunPrompt`), который при размонтировании стирает
 * выбор из реестра; всякий условный хук в её теле — риск сдвинуть их порядок. Органы прогона
 * живут своим состоянием и монтируются ВНУТРИ той же `Section`.
 *
 * ⚠ РЯД ВИДОВ — ПРОДУКТОВЫЙ, У МАКЕТА ЕГО НЕТ. Прототипный прогон флэта возвращает «до двух
 * свободных флэтов с видом» из фикстур; продуктовый `StartDesignRun` требует `params.views[]` —
 * какие стороны рисовать — и `layout`. Спрятать выбор и слать всегда `front, back` значило бы
 * решать за человека, за что он платит. С волны 03.10 (T18/T19) выбор
 * стоит за тихой дверью `custom` рядом с GENERATE (`flat-custom.tsx`), а умолчание — четыре
 * стороны одним листом (`DEFAULT_FLAT_*`, `flat-input.ts`).
 *
 * ⚠ ЦЕНЫ В РЯДУ НЕТ (26.09, O-37 / D-35). Здесь стояла строка «US$… · last flat run · priced by the
 * server when the run starts» — цена ПОСЛЕДНЕГО прогона под видом цены следующего. Владелец:
 * «убрать полностью». Цена прогона живёт в истории, по факту; ряд запуска о деньгах молчит.
 */

/**
 * ═══ ОДИН РОСТ НА ВСЕ ОРГАНЫ ОБОИХ РЯДОВ — VIEWS И ЗАПУСКА (r3 п.5) ═══════════════════════════
 *
 * Владелец, дословно: «после WORDS очень много кнопок разного размера с минимальными отступами …
 * сделать по уму». «Разного размера» — это измеримо и это была правда: `Button size='sm'` (рамка +
 * `py-1` + `leading-4`) ростом 26px стояла вплотную к `Chip` и к сегменту `ViewSwitch` ростом 19px,
 * и тогдашние три ряда органов читались как три разных класса вещей. Средний ряд (источники) снят
 * волной 25.09 (T24, D-20), рядов два: VIEWS и запуск.
 *
 * ЭТАЛОН ВЫБРАН НЕ ГОЛОСОВАНИЕМ: 26px — рост `GENERATE`, а её разметку держит общий ряд
 * (`render/generate-row.tsx`, зона G1), то есть подогнать надо было ВСЁ ОСТАЛЬНОЕ к ней, а не
 * наоборот. Число живёт здесь одно, и ленты берут его отсюда.
 *
 * ⚠ ИНЛАЙНОМ, А НЕ КЛАССОМ, И ЭТО НЕ НЕБРЕЖНОСТЬ. Класса на 26px в tailwind нет (`h-6` = 24), а
 * произвольного (`h-[26px]`) НЕТ В СОБРАННОМ CSS, если его не было в дереве на момент сборки —
 * стенд читает именно собранный CSS и намерил бы неправильную геометрию, показав зелёное там, где
 * у человека разъехалось (память `probe-served-a-stale-bundle`).
 */
export const ROW_CONTROL_PX = 26;
export const ROW_CONTROL_STYLE: React.CSSProperties = { height: ROW_CONTROL_PX };

const LAYOUT_OPTIONS = [
  { value: 'one' as const, label: 'one picture', hint: 'all the ticked views drawn into one file' },
  {
    value: 'per_view' as const,
    label: 'a picture per view',
    hint: 'each ticked view comes back on its own',
  },
];
type Layout = FlatLayout;

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
function flatSnapshot(
  band: GetDesignBandResponse | undefined,
  now: TechCardFormData,
  detailSlotIds: readonly number[],
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
    callouts,
    details,
    // The join list the run freezes (its rev, and whether that rev is confirmed — straps needs it).
    joins: [band?.joins?.rev ?? 0, !!band?.joins?.confirmed],
  };
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
  /* ЧИПЫ — С ЗАПРОСА В ПОЛЁТЕ, если он есть (ревью раунда 3, m2): ряд, вернувшийся после смены шага,
     рисует то, за что уже платят, а не выбор по умолчанию рядом со `starting…`. Пока запрос идёт,
     выбор заперт (`choiceOff`), поэтому локальное состояние с ним не расходится. */
  const [initialDraft] = useState(() => flatDraftOf(techCardId));
  const [views, setViews] = useState<Record<string, boolean>>(initialDraft.views);
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>(initialDraft.detailTicks);
  /** Виды или детали, не вместе (T07): одна галка снимает другую сторону. */
  const applyTicks = (next: {
    views: Record<string, boolean>;
    detailTicks: Record<number, boolean>;
  }) => {
    setViews(next.views);
    setDetailTicks(next.detailTicks);
  };
  /** «one picture» по умолчанию (T23, D-19; T19): виды приходят одним листом и режутся сами (`autoSplit`). */
  const [layout, setLayout] = useState<Layout>(initialDraft.layout);
  /** The flat mode (`flat-mode.ts`): photos by default; the others behind `custom`. */
  const [mode, setMode] = useState<FlatMode>(initialDraft.mode);
  /** «from my flat»: which technical flat is the front, which the back. */
  const [structure, setStructure] = useState<StructurePick[]>(initialDraft.structure);
  /** Дверь `custom` у GENERATE (T18): закрыта при каждом монтировании — умолчание не просит решений. */
  const [customOpen, setCustomOpen] = useState(false);
  /* ЧЕРНОВИК ПРИНАДЛЕЖИТ КАРТОЧКЕ (гейт волны 3, W1): ряд, не перемонтированный при смене
     карточки, пересеивает выбор с новой карточки (её запрос в полёте или умолчание) прямо в
     отрисовке — иначе `per picture` одной карточки уходил бы платным прогоном другой. */
  const [draftCard, setDraftCard] = useState(techCardId);
  if (draftCard !== techCardId) {
    const seed = flatDraftOf(techCardId);
    setDraftCard(techCardId);
    setViews(seed.views);
    setDetailTicks(seed.detailTicks);
    setLayout(seed.layout);
    setMode(seed.mode);
    setStructure(seed.structure);
    setCustomOpen(false);
  }
  /* The JOINS group reads the mode (its `confirm joins` door stands only for straps & openings). */
  useEffect(() => {
    setFlatModeDraft(techCardId, mode);
  }, [techCardId, mode]);
  useEffect(() => () => setFlatModeDraft(techCardId, DEFAULT_FLAT_MODE), [techCardId]);
  const customChoice = !isDefaultFlatChoice({ views, detailTicks, layout, mode, structure });
  const bench = useMemo(() => readBench(band, 'flat'), [band]);

  const tickedSides = ACTIVE_VIEWS.filter((v) => views[v]);
  const tickedDetails = bench.details.filter((d) => (d.id ?? 0) > 0 && detailTicks[d.id ?? 0]);
  const ticked: string[] = [...tickedSides, ...tickedDetails.map(() => DETAIL_VIEW)];
  const tickedDetailIds: number[] = tickedDetails.map((d) => d.id ?? 0);

  const wholeBench = useMemo(
    () => ({
      viewKeys: bench.sides.map((s) => s.view),
      slotIds: bench.details.map((d) => d.id ?? 0).filter((id) => id > 0),
    }),
    [bench],
  );
  const marked = useMemo(() => markedPlatesOf(band, wholeBench), [band, wholeBench]);

  /**
   * ═══ МИНИМУМ МУДБОРДА — ТА ЖЕ ФРАЗА, ЧТО ЗАПИРАЕТ FLAT НА РЕЛЬСЕ (D-10, контракт `mood-gate`) ══
   *
   * Флэт, нарисованный с пустой доски и без категории, — флэт НИЧЕГО. Правило ОДНО и живёт в
   * `core/mood-gate.ts` (что считается минимумом — картинка на доске, описание, категория — решает
   * только оно; строки входа REFERENCE доской не считаются). Читает его ОДИН хук рельса
   * (`useMoodMinimumGate`, заведён под эту кнопку), поэтому фраза отказа дословно та, что запирает
   * FLAT на рельсе, и кнопка с рельсом не могут разойтись в «почему». Двери — туда, где отказ
   * чинится: к доске, к описанию, к категории в CARD DETAILS. Открываются `openGateDoor`
   * (`openStepOf`), а не `revealField`: это не ошибка поля, и красная пульсация после «отведи меня
   * туда» читалась бы как «там что-то сломано».
   *
   * ГЕЙТ ЧИТАЮТ ДВАЖДЫ — в `gateReason` (кнопка и строка под ней) и в `submit` ПОСЛЕ ожидания
   * сохранения: пока шёл `flush`, доска могла опустеть (правка отменена, другая вкладка сохранила
   * раньше), и старт сверяется с гейтом, каким он стал. Второе чтение — из ФОРМЫ (`getValues`), а
   * не из снимка отрисовки: ряд к тому моменту может быть размонтирован сменой шага, и снимок
   * застыл бы на том, что было при щелчке (ревью раунда 2, MAJOR B).
   *
   * ДВЕРИ — ГЕЙТА, ПО ОДНОЙ НА НЕДОСТАЮЩУЮ ЧАСТЬ (`doors`, `core/chain.ts`): слова и адреса живут
   * там же, где у рельса, и копии здесь больше нет (ревью m6).
   */
  const mood = useMoodMinimumGate();
  const moodReason = mood.ok ? null : mood.reason;
  const moodDoors = mood.ok ? [] : mood.doors;

  /**
   * ═══ СНАЧАЛА СОХРАНИТЬ, ПОТОМ ПЛАТИТЬ (D-16, контракт `autosave`, Codex B-05) ══════════════
   *
   * Прогон читает СОХРАНЁННУЮ карточку: WORDS, засеянные секунду назад, и роль, выбранная только
   * что, на сервер ещё не уехали, и модель получила бы вчерашний запрос за сегодняшние деньги.
   * Поэтому GENERATE сначала ждёт `flush` и стартует только при `ok`/`nothing`/`off`; иначе —
   * фраза контракта (`flushRefusalSentence`) стойкой строкой под рядом, не всплывашкой.
   */
  const autosave = useTechCardAutosave();
  /**
   * Занятость и отказ — из модульного хранилища карточки (см. `FlatInputState`): вернувшийся после
   * смены шага ряд видит `starting…` над идущим запросом и не пускает второй щелчок. `busy` держит
   * GENERATE занятым от щелчка до ответа сервера одним куском — между «сохраняю» и «запускаю» нет
   * ни кадра живой кнопки (ревью m1).
   */
  const input = useFlatInput(techCardId);
  const busy = input.run !== null;
  /**
   * ИСХОД отказавшего сохранения, а не готовая фраза: фраза собирается при отрисовке, и число полей
   * в ней — ТЕКУЩЕЕ (`errorsCount` после flush), а не снятое на щелчке, когда провал ещё не был
   * известен (ревью m2).
   */
  const refused = input.refused;
  /* Отказ снимается сам, как только карточка сохранилась: поправленное поле — это и есть ответ на
     него, и строка отказа («fix 1 field first …») над сохранённой карточкой была бы неправдой. */
  useEffect(() => {
    if (autosave.status === 'saved' || autosave.status === 'idle') {
      patchFlatInput(techCardId, { refused: null });
    }
  }, [autosave.status, techCardId]);
  /* КАРТОЧКА, КОТОРАЯ БОЛЬШЕ НЕ СОХРАНЯЕТСЯ (утверждена, только для чтения, автосейв выключен), не
     сохранится и дальше — строка «до следующего сохранения» стояла бы вечно. Почему GENERATE молчит,
     говорит замок ряда (`gateReason`: «this card is read-only»), второй строки не нужно (ревью раунда 3,
     m7). Не рисуется с того же кадра, а снимается эффектом — без вспышки. */
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

  /**
   * ДВЕРЬ У ОТКАЗА СОХРАНЕНИЯ (ревью m3). `invalid` — к первому полю с ошибкой: проверка громкая
   * (человек сам попросил показать), путь — первый из `flattenFieldErrors`, показ — `revealField`
   * (шаг студии он приносит сам). Поле, которого эта вкладка не рисует, и прочие исходы — к чипу
   * сохранения в шапке (`save-status-chip.tsx`, зона CL-A): его поповер говорит причину целиком.
   * Сохранять там нечем (O-60, D-59): упавшая запись повторяется сама, а решения — подтвердить
   * перевод в auxiliary, решить конфликт — ведёт слово чипа рядом с `▾`.
   */
  const form = useFormContext<TechCardFormData>();

  /* ═══ THE CARD'S TECHNICAL FLATS — what «from my flat» redraws (the server accepts only these). The
     form is what the next save writes, and GENERATE saves first, so the run sees this same list. */
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
  const structureNow = mode === 'hand_flat' ? liveStructure(structure, techIds) : [];
  const chooseMode = (next: FlatMode) => {
    setMode(next);
    // The two modes draw all the views on ONE picture; a detail sketch runs photos.
    if (next !== 'photos') setLayout('one');
    if (next === 'hand_flat' && liveStructure(structure, techIds).length === 0) {
      setStructure(autoStructure(techIds));
    }
  };

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

  /* ЧИПЫ ДЕТАЛЕЙ, КОТОРЫЕ ПРЕДЛОЖИЛ ЧЕРНОВИК (26.09, O-34): синие, пока слот не принят, — по тому же
     журналу, что и слот на бенче (`slotProposed`); своего состояния у ряда нет. */
  const drafted = useDrafted();

  const writesOff = !!disabled || !speaks;
  /* Выбор ряда заперт, пока ждём сохранения и пока запрос в полёте: `submit` берёт виды и раскладку
     на щелчке, и открытые чипы дали бы прогону не то, что на экране (ревью MAJOR). И пока CLEAR
     снимает роли — промпт в этот момент наполовину старый. */
  const choiceOff = writesOff || busy || input.clearing;
  const noViews = ticked.length === 0;
  const joinsOk = joinsConfirmed(band.joins);
  const modeGate =
    mode === 'photos'
      ? null
      : tickedDetails.length > 0
        ? 'this mode draws views, not details'
        : layout === 'per_view'
          ? 'this mode draws one picture'
          : mode === 'hand_flat'
            ? techIds.length === 0
              ? 'no technical flat on this card'
              : structureNow.length === 0
                ? 'pick a front or back flat'
                : null
            : !band.joins
              ? 'no join list yet'
              : !joinsOk
                ? 'confirm the joins first'
                : null;
  const strapsSuggested =
    mode !== 'straps' && !choiceOff && tickedDetails.length === 0 && suggestsStraps(band.joins);
  /* Ряд (`GenerateRow`) сам спрашивает `serverSpeaksDesign()` ПЕРВЫМ и печатает свою формулировку;
     ветка ниже остаётся ЗАМКОМ ПРОВОДА: `submit` заперт этой же переменной. */
  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : input.clearing || input.rewriting > 0
        ? 'the prompt is being changed — generate once it is done'
        : moodReason
          ? moodReason
          : noViews
            ? 'no views ticked — tick at least one'
            : modeGate;

  /** Карточка на экране СЕЙЧАС — для перепроверки после ожидания брифа (R2). */
  const cardNow = useRef(techCardId);
  cardNow.current = techCardId;

  const submit = async () => {
    const card = techCardId;
    if (gateReason || !mood.ok || card <= 0) return;
    // Занятость — из хранилища В МОМЕНТ щелчка, а не из снимка отрисовки: два щелчка в одном кадре
    // и щелчок по ряду, вернувшемуся к идущему запросу, отказываются одинаково.
    if (flatInputBusy(readFlatInput(card))) return;
    /* АВТОСЕЙВ БЫЛ ЖИВ НА ЩЕЛЧКЕ? (ревью раунда 3, m3). Выключенный или уничтоженный автосейв (уход со
       страницы посреди flush, утверждение) отвечает `off`, а `off` пропускает прогон — и для записи, у
       которой автосейва нет вовсе, так и надо. Но если на щелчке он был ЖИВ, `off` после ожидания
       значит «сохранение остановилось»: прогон по несохранённой карточке не стартует. */
    const wasOn = autosave.status !== 'off';
    // Запрос — то, что на экране В МОМЕНТ щелчка; на время ожидания выбор заперт (`choiceOff`), а
    // сам выбор лежит в хранилище карточки: ряд, вернувшийся после смены шага, рисует его (m2).
    const ask: FlatAsk = {
      views: { ...views },
      detailTicks: { ...detailTicks },
      layout,
      mode,
      structure: [...structureNow],
    };
    const params: common_DesignRunParams = {
      views: [...ticked],
      detailSlotIds: [...tickedDetailIds],
      layout,
      colorwayId: 0,
      colour: undefined,
      threed: undefined,
      fixTarget: '',
      fixTargets: [],
      fixSlotIds: [],
      autoSplit: layout === 'one' && ticked.length >= 2,
      pattern: undefined,
      // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform и на любом другом роде
      // отвергается сервером (`freeform_forbidden`), поэтому здесь оно названо пустым вслух.
      freeform: undefined,
      /* ПЛИТЫ ВЕРСТАКА В ПРОГОН ФЛЭТА НЕ ЕДУТ (T24, D-20): дверь `also send the flat slots` снята
         владельцем вместе с лентой плит. `false` — СКАЗАНО, а не опущено: пустой `flat_slot_ids`
         при включённом флаге значил бы «все» (`design.proto`), и старый флаг из хранилища вкладки
         не должен дожить до платного запроса. */
      useFlatSlots: false,
      flatSlotIds: [],
      extraInputMediaIds: [],
      image: undefined,
      inpaint: undefined,
      extend: undefined,
      video: undefined,
      // THE MODE (81-FINAL-MODES). Photos sends nothing: an absent block is photos.
      flat: flatParamsFor(mode, structureNow),
    };
    patchFlatInput(card, { run: 'saving', refused: null, serverRefusal: null, ask });
    let refusal: ServerRefusal | null = null;
    try {
      /* R2: бриф WORDS в пути — засева ещё нет, и прогон ушёл бы с пустыми WORDS. Ждём его (кнопка
         занята `saving`), потом перепроверяем карточку; набранные руками WORDS засев не тронет. */
      const brief = await settleSeedBrief(card);
      if (brief === 'busy') return;
      if (brief === 'waited' && (cardNow.current !== card || !cardOnScreen(card))) return;
      // D-20'''': засев, показанный в пустом поле, уходит в форму «грязным» ДО flush — эта запись его
      // и понесёт, прогон прочтёт его из сохранённой карточки.
      materializeWords(card, form, wasOn && !disabled);
      let saved: FlushResult;
      try {
        saved = await autosave.flush('flat');
      } catch {
        // Контракт обещает исход, а не исключение; бросок читается как неудача сохранения.
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
      /* ПОСЛЕ ОЖИДАНИЯ — ТОЛЬКО СВЕЖИЕ ЧТЕНИЯ (ревью раунда 2, MAJOR B). Ряд мог быть размонтирован
         сменой шага: форма живёт в `index.tsx` и отвечает сейчас, снимки отрисовки — нет.
         · Утверждение, пришедшее во время flush, выключает автосейв, и flush отвечает `off` —
           `flushAllowsRun` его пропускает; прогон по замороженной карточке не стартует.
         · Сервер полосы — из кэша её чтения (`serverSpeaksNow`): контекст возможностей — хук, и
           после `await` его не спросить.
         · Минимум доски — тем же правилом, что у рельса, по значениям формы. */
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
      // Отказ уже стоит строкой под рядом (`moodReason`), второй не нужен.
      if (!gateNow.ok) return;
      /* РОЛИ ДЛЯ ОТПЕЧАТКА — СВЕЖИМ ЧТЕНИЕМ (ревью раунда 4, MAJ-1). Кэш полосы отстаёт от каждой
         записи роли на одно перечитывание: `mutateAsync` отвечает раньше, чем перечитывание приходит.
         GENERATE, нажатый в это окно, взял бы в отпечаток СТАРЫЕ роли, а сервер заморозил бы НОВЫЕ; и
         после потерянного ответа повтор (кэш уже свежий) получил бы другой id — второй платный
         прогон за то же. Поэтому: дождаться записей полосы этой карточки, перечитать полосу и брать
         роли из этого чтения. */
      if (!(await bandWritesSettled(qc, card, BAND_WRITES_WAIT_MS))) {
        if (cardOnScreen(card)) {
          showMessage('the input is still being saved — try again; nothing was started', 'error');
        }
        return;
      }
      let freshBand: GetDesignBandResponse | undefined;
      try {
        freshBand = await rereadBand(qc, card);
      } catch {
        if (cardOnScreen(card)) {
          showMessage('could not re-read the input — nothing was started; try again', 'error');
        }
        return;
      }
      /* THE MODE'S OWN PRECONDITIONS, ON THE SAVED CARD AND THE FRESH BAND — refused here for free
         rather than sent to be refused: a flat removed from the card while it saved, a list edited
         (and so unconfirmed) in another tab. */
      if (mode === 'hand_flat') {
        const onCard = new Set(
          ((form.getValues('technicalMedia') ?? []) as { mediaId?: number }[]).map(
            (r) => r?.mediaId ?? 0,
          ),
        );
        if ((params.flat?.structureRefs ?? []).some((r) => !onCard.has(r.mediaId ?? 0))) {
          refusal = localRefusal('structure_gone');
          return;
        }
      }
      if (mode === 'straps' && !joinsConfirmed(freshBand.joins)) {
        refusal = localRefusal('joins_unconfirmed');
        return;
      }
      patchFlatInput(card, { run: 'starting' });
      // Ответ ждётся здесь, а не в наблюдателе ряда: «run started», сброс леджера, отказ сервера и
      // снятие занятости случаются и тогда, когда ряда уже нет (`useStartRun`).
      refusal = await startRun.start({
        kind: 'flat',
        ask: '',
        params,
        snapshot: flatSnapshot(freshBand, now, params.detailSlotIds ?? []),
      });
      // The list may have moved (edited elsewhere): the band is re-read so the door shows it.
      if (refusal?.reason === 'joins_unconfirmed') {
        void qc.invalidateQueries({ queryKey: designKeys.band(card) });
      }
    } finally {
      // Отказ сервера — в хранилище карточки, до прочтения или следующего GENERATE; с ним остаются
      // чипы отказанного запроса. Без отказа запрос отпущен.
      patchFlatInput(card, { run: null, serverRefusal: refusal, ask: refusal ? ask : null });
    }
  };

  return (
    /* ═══ ДВА РЯДА, ОДИН ЗАЗОР, ОДИН РОСТ ОРГАНОВ (r3 п.5; ряд источников снят D-20) ══════════
       Владелец: «сделать по уму … три спокойных ряда … дай больше спейсинга». Ряды идут в его
       порядке: виды → запуск (средний ряд источников снят владельцем в волне 25.09). Зазор —
       12px, ТОТ ЖЕ ШАГ, что `GROUP_GAP` («линейка группы → содержимое», `core/organs.tsx`):
       между полосами одного решения он обязан быть тем же, что между подписью и её содержимым,
       и меньше шва между блоками (16px у секции).
       Классом `GROUP_GAP` его не выразить — тот margin-bottom на подписи, а здесь нужен ритм
       между рядами; поэтому шаг один, а написаний два, и оба названы здесь. */
    <div data-flat-run='' className='space-y-3'>
      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the controls are here, but nothing can be
          started against them.
        </CalloutBox>
      )}

      {/* ═══ РЯД 2 · ЗАПУСК — ОБЩИЙ ОРГАН (F-1). `disabled` ряду НЕ передаётся: право на запись уже
          названо в `gateReason` и той же переменной заперт `submit`. `shape` не называется:
          хвост здесь свой — только дверь описи рядом с GENERATE (O-37: строки денег нет).
          `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
          pending={busy}
          onGenerate={() => void submit()}
          trailing={
            <FlatCustom
              /* Ни одной галки — GENERATE заперт словами «tick at least one», и чипы обязаны быть
                 видны: закрытая панель здесь была бы тупиком. */
              open={customOpen || noViews || (mode === 'hand_flat' && structureNow.length === 0)}
              onToggle={() => setCustomOpen((v) => !v)}
              modified={customChoice}
              summary={flatChoiceSummary(
                { views, detailTicks, layout, mode, structure: structureNow },
                tickedDetails.map((d) => displayDetailName(bench.details, d)),
              )}
              after={
                <>
                  {/* STRAPS & OPENINGS WAITS FOR THE CONFIRMED LIST — one quiet word; the door
                      is in the JOINS header right above. */}
                  {mode === 'straps' && !joinsOk && (
                    <span data-flat-unconfirmed='' title='confirm the joins first'>
                      <Pill tone='mut'>unconfirmed</Pill>
                    </span>
                  )}
                  {/* THE LIST HAS A STRAP OR AN OPENING THAT RUNS ON — the mode is suggested. */}
                  {strapsSuggested && (
                    <button
                      type='button'
                      data-flat-suggest='straps'
                      title='a strap or an opening runs on into another part — draw it with the confirmed joins'
                      onClick={() => {
                        chooseMode('straps');
                        setCustomOpen(true);
                      }}
                    >
                      <Pill tone='attention'>straps & openings?</Pill>
                    </button>
                  )}
                  {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — единственное место, где человек видит ПОЛНЫЙ состав запроса
                  до того, как заплатит (SPEC п.4: опись живёт в модалке, не на карточке).
                  ⚠ ЭТА ДВЕРЬ СТОИТ РЯДОМ С GENERATE, А НЕ У ПРАВОГО КРАЯ (R2 п.20), слово
                  владельца: «WHAT THE MODEL GETS ▸ помести рядом с GENERATE». Прежний `ml-auto`
                  разносил две двери одного решения по краям ряда, и глаз шёл через всю ширину
                  блока за ответом на вопрос «а что именно уедет». Правило макета («дверь описи у
                  правого края») остаётся у остальных четырёх рядов — они этот хвост не рисуют. */}
                  <Button variant='secondary' size='sm' onClick={() => setWmgOpen(true)}>
                    <ControlLabel>what the model gets ▸</ControlLabel>
                  </Button>
                </>
              }
            >
              {/* ═══ ПАНЕЛЬ `custom` (T18): раскладка, затем стороны и детали — в порядке слов
                  владельца («one picture или per picture и так же FRONT / BACK / SIDE LEFT / SIDE
                  RIGHT»). Ярлыка нет: чипы говорят сами. Раскладка имеет смысл от двух видов; при
                  одном она ничего не меняет и молчит (`title`), а не пропадает. Детали — здесь же,
                  рядом с видами: галка детали снимает виды (T07), и это видно в одном месте. */}
              {/* THE MODE — first in the panel: what the sheet is drawn from. */}
              <span className='flex' style={ROW_CONTROL_STYLE} data-flat-mode={mode}>
                <ViewSwitch
                  label='mode'
                  value={mode}
                  disabled={choiceOff}
                  onChange={chooseMode}
                  className='h-full'
                  options={[
                    { value: 'photos', label: FLAT_MODE_WORD.photos, hint: 'the reference photos' },
                    {
                      value: 'hand_flat',
                      label: FLAT_MODE_WORD.hand_flat,
                      hint:
                        techIds.length === 0
                          ? 'no technical flat on this card'
                          : tickedDetails.length > 0
                            ? 'a detail sketch runs from photos'
                            : 'your technical flats, redrawn clean',
                      disabled: techIds.length === 0 || tickedDetails.length > 0,
                    },
                    {
                      value: 'straps',
                      label: FLAT_MODE_WORD.straps,
                      hint:
                        tickedDetails.length > 0
                          ? 'a detail sketch runs from photos'
                          : 'the photos and the confirmed joins',
                      disabled: tickedDetails.length > 0,
                    },
                  ]}
                />
              </span>
              <span
                className='flex'
                style={ROW_CONTROL_STYLE}
                title={
                  ticked.length <= 1
                    ? 'one view is asked — both layouts return one picture, so this changes nothing here'
                    : undefined
                }
              >
                <ViewSwitch
                  label='layout'
                  value={layout}
                  options={
                    mode === 'photos'
                      ? LAYOUT_OPTIONS
                      : LAYOUT_OPTIONS.map((o) =>
                          o.value === 'per_view'
                            ? { ...o, disabled: true, hint: 'this mode draws one picture' }
                            : o,
                        )
                  }
                  disabled={choiceOff}
                  onChange={setLayout}
                  className='h-full'
                />
              </span>
              <ChipRow>
                {ACTIVE_VIEWS.map((view) => {
                  const on = !!views[view];
                  const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
                  const slotFilled = (slot?.pictureId ?? 0) > 0;
                  return (
                    <Chip
                      key={view}
                      selected={on}
                      pressed={on}
                      disabled={choiceOff}
                      style={ROW_CONTROL_STYLE}
                      title={
                        slotFilled
                          ? 'its flat slot below is already filled'
                          : 'its flat slot below is empty'
                      }
                      onClick={() => applyTicks(tickView(views, detailTicks, view))}
                    >
                      {viewLabel(view)}
                    </Chip>
                  );
                })}
                {/* ДЕТАЛИ — ПО ГАЛКЕ НА КАЖДУЮ ОПИСАННУЮ (T-5): чипы — производная от bench.details. */}
                {bench.details.map((d) => {
                  const id = d.id ?? 0;
                  if (id <= 0) return null;
                  const on = !!detailTicks[id];
                  const proposed = drafted.slotProposed(id);
                  return (
                    <Chip
                      key={`d:${id}`}
                      selected={on}
                      pressed={on}
                      disabled={choiceOff || mode !== 'photos'}
                      tone={proposed ? 'attention' : undefined}
                      data-proposed={proposed || undefined}
                      style={ROW_CONTROL_STYLE}
                      title={
                        proposed
                          ? `detail proposed by the construction draft, not accepted yet: ${displayDetailName(bench.details, d)} — accept it in the flat slots`
                          : `detail described in the flat slots: ${displayDetailName(bench.details, d)}`
                      }
                      onClick={() => applyTicks(tickDetail(views, detailTicks, id))}
                    >
                      detail · {displayDetailName(bench.details, d)}
                    </Chip>
                  );
                })}
              </ChipRow>
              {/* «FROM MY FLAT»: the card's technical flats, each one front or back (one per side). */}
              {mode === 'hand_flat' && techIds.length > 0 && (
                <div data-flat-structure='' className='flex basis-full flex-wrap items-start gap-3'>
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
                              title={
                                role === r ? `the ${label} · click: neither` : `use as the ${label}`
                              }
                              onClick={() => setStructure(pickStructure(structureNow, id, r))}
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
            </FlatCustom>
          }
        />
      </div>

      {/* ОТКАЗ МИНИМУМА МУДБОРДА — СЛОВАМИ И С ДВЕРЬЮ, А НЕ ТОЛЬКО ПОГАШЕННОЙ КНОПКОЙ. Погашенный
          GENERATE держит повод в `title`, то есть по наведению; здесь он же стоит строкой, и рядом —
          дверь туда, где он чинится. Только на карточке, которую можно писать. */}
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
      {/* СОХРАНЕНИЕ НЕ ПРОШЛО — ПРОГОН НЕ ЗАПУЩЕН (контракт autosave). Стойкая строка до следующей
          попытки: исправление («поправь поле») — не новое нажатие, и всплывашка ушла бы раньше. */}
      {refusalSentence && (
        <div data-flat-flush-refusal=''>
          <LockBar reason={`${refusalSentence} — nothing was started, nothing was charged`}>
            {/* Утверждённой карточке чинить нечего — двери нет. */}
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
      {/* МЕТКИ НЕ ЕДУТ, И СКАЗАНО ЭТО ТАМ, ГДЕ ТРАТЯТСЯ ДЕНЬГИ. Рисуется только пока метки есть. */}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.</b>{' '}
            a flat run reads the card’s references, never the bench plates, so nothing drawn there
            travels with GENERATE — the marks remain on their plates for people.
          </Text>
        </CalloutBox>
      )}
      {/* ОТКАЗ ЗАПУСКА — СТОЙКАЯ ПОЛОСА, НЕ СНЕКБАР (CONTRACT §E), тот же орган, что у FABRIC RENDER
          и 3D: слова сервера дословно, «nothing was charged» только когда сервер ОТВЕТИЛ. */}
      {(() => {
        const dismiss = () =>
          patchFlatInput(
            techCardId,
            readFlatInput(techCardId).run === null
              ? { serverRefusal: null, ask: null }
              : { serverRefusal: null },
          );
        /* A MODE REFUSAL IS ONE PLAIN LINE in short words — all of them are free (nothing booked). */
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
      />
    </div>
  );
}
