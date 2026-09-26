import { useQueryClient, type QueryClient, type QueryFunction } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
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
import { GROUP_GAP, PRICED_LATER, latestRunOfKind } from './core';
import { moodMinimumGate, openGateDoor } from './core/chain';
import { markedPlatesOf } from './fix-markup';
import {
  flatInputBusy,
  patchFlatInput,
  readFlatInput,
  useFlatInput,
  type FlatAsk,
  type FlatLayout,
} from './flat-input';
import { formatMoney } from './generation/money';
import type { RunRefusal as ServerRefusal } from './generation/refusal';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { isBoardRow, type BoardItem } from './mood-board';
import { GenerateRow, LockBar, RunRefusal } from './render/generate-row';
import { cardOnScreen, designKeys, serverSpeaksNow, type WriteContext } from './use-design-band';
import type { CalloutLike } from './render/what-model-gets';
import { ACTIVE_VIEWS, DETAIL_VIEW, viewLabel } from './views';
import { materializeWords } from './words-seed';

/**
 * ═══ РЯД ЗАПУСКА БЛОКА INPUT — REFERENCES (`runDoors('flat')` макета) ═══════════════════════════
 *
 *   GENERATE · $0.38 · priced by the server on start ·                    WHAT THE MODEL GETS ▸
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
 * решать за человека, за что он платит. Поэтому ряд остаётся, одной строкой над рядом запуска:
 * ярлык `VIEWS`, чипы сторон и деталей, справа — раскладка ответа. Это названо в gaps.
 *
 * ⚠ ЦЕНА — ПОСЛЕДНЕГО ФЛЭТ-ПРОГОНА, И ЭТО СКАЗАНО СЛОВАМИ. Макет печатает `$0.38` из своего
 * прейскуранта; на проводе цены прогона, которого ещё нет, не бывает (`price_estimate` и
 * `price_actual` — поля прогона, выходные). Что есть — цена ПОСЛЕДНЕГО флэт-прогона карточки, факт,
 * а не оценка; она печатается с приставкой «last flat run», а дальше — та же фраза, что на всех
 * пяти рядах GENERATE (`PRICED_LATER`). Нет ни одного прогона — только фраза.
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

/**
 * ═══ ПОДПИСЬ ВТОРОСТЕПЕННОЙ КНОПКИ — РАЗМЕРОМ КОНТРОЛА, А НЕ ТЕЛА ТЕКСТА (r3 п.5) ══════════════
 *
 * Владелец просил ещё и ОДИН РАЗМЕР ШРИФТА в этих рядах. Замерено: чипы и сегменты раскладки
 * печатают 10px, а `Button size='sm'` — 12px, хотя DESIGN.md на второстепенную кнопку говорит
 * ровно «10px label type uppercase». Разница не в вызове: `buttonVariants` кладёт на одну кнопку
 * И `text-textBaseSize` (от `variant`), И `text-micro` (от `size`), а `cva` их не мирит — спор
 * решает порядок утилит в собранном CSS, и `text-textBaseSize` там ПОЗЖЕ. То есть `text-micro`
 * размера `sm` мёртв во всей админке, и класс с места вызова умрёт так же.
 *
 * ПОЭТОМУ РАЗМЕР НАЗЫВАЕТ ПОДПИСЬ, А НЕ КНОПКА: у вложенного `span` конкурента нет. Это не обход
 * системы, а её же значение — 10px, `text-micro`, — возвращённое туда, где примитив его теряет.
 * ⚠ ПОЧИНКА ПО СУЩЕСТВУ ЖИВЁТ В `ui/components/button.tsx` (снять `text-textBaseSize` с вариантов
 * или помирить классы через `twMerge`); она за пределами этой зоны и названа в отчёте. Главную
 * кнопку (`GENERATE`) это не касается: 12px у неё — по системе.
 */
export function ControlLabel({ children }: { children: ReactNode }): JSX.Element {
  return <span className='text-micro'>{children}</span>;
}

const LAYOUT_OPTIONS = [
  { value: 'one' as const, label: 'one picture', hint: 'all the ticked views drawn into one file' },
  {
    value: 'per_view' as const,
    label: 'a picture per view',
    hint: 'each ticked view comes back on its own',
  },
];
type Layout = FlatLayout;

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
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const qc = useQueryClient();
  const startRun = useStartRun(techCardId);
  const { showMessage } = useSnackBarStore();
  /* ЧИПЫ — С ЗАПРОСА В ПОЛЁТЕ, если он есть (ревью раунда 3, m2): ряд, вернувшийся после смены шага,
     рисует то, за что уже платят, а не выбор по умолчанию рядом со `starting…`. Пока запрос идёт,
     выбор заперт (`choiceOff`), поэтому локальное состояние с ним не расходится. */
  const [views, setViews] = useState<Record<string, boolean>>(
    () => readFlatInput(techCardId).ask?.views ?? { front: true, back: true },
  );
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>(
    () => readFlatInput(techCardId).ask?.detailTicks ?? {},
  );
  /** «one picture» по умолчанию (T23, D-19): виды приходят одним листом и режутся сами (`autoSplit`). */
  const [layout, setLayout] = useState<Layout>(
    () => readFlatInput(techCardId).ask?.layout ?? 'one',
  );
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
     него, и строка «save the card first» над сохранённой карточкой была бы неправдой. */
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
          ? flushRefusalSentence(refused, autosave.errorsCount) || 'save the card first'
          : null;

  /**
   * ДВЕРЬ У ОТКАЗА СОХРАНЕНИЯ (ревью m3). `invalid` — к первому полю с ошибкой: проверка громкая
   * (человек сам попросил показать), путь — первый из `flattenFieldErrors`, показ — `revealField`
   * (шаг студии он приносит сам). Поле, которого эта вкладка не рисует, и прочие исходы — к чипу
   * сохранения в шапке (`save-status-chip.tsx`, зона CL-A): он и есть дверь этих состояний
   * (повторить, подтвердить, решить конфликт), и его поповер говорит причину целиком.
   */
  const form = useFormContext<TechCardFormData>();
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

  /* Цена последнего флэт-прогона — см. шапку. `priceActual` первым: это то, что списали. */
  const lastRun = useMemo(() => latestRunOfKind(band.runs, 'flat'), [band.runs]);
  const lastPrice = lastRun
    ? formatMoney(lastRun.priceActual ?? lastRun.priceEstimate, lastRun.currency)
    : '';

  const writesOff = !!disabled || !speaks;
  /* Выбор ряда заперт, пока ждём сохранения и пока запрос в полёте: `submit` берёт виды и раскладку
     на щелчке, и открытые чипы дали бы прогону не то, что на экране (ревью MAJOR). И пока CLEAR
     снимает роли — промпт в этот момент наполовину старый. */
  const choiceOff = writesOff || busy || input.clearing;
  const noViews = ticked.length === 0;
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
            : null;

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
    const ask: FlatAsk = { views: { ...views }, detailTicks: { ...detailTicks }, layout };
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
    };
    patchFlatInput(card, { run: 'saving', refused: null, serverRefusal: null, ask });
    let refusal: ServerRefusal | null = null;
    try {
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
      patchFlatInput(card, { run: 'starting' });
      // Ответ ждётся здесь, а не в наблюдателе ряда: «run started», сброс леджера, отказ сервера и
      // снятие занятости случаются и тогда, когда ряда уже нет (`useStartRun`).
      refusal = await startRun.start({
        kind: 'flat',
        ask: '',
        params,
        snapshot: flatSnapshot(freshBand, now, params.detailSlotIds ?? []),
      });
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

      {/* ═══ РЯД 1 · ВИДЫ — ярлык, чипы сторон и деталей, справа раскладка ответа ═══════════════
          Отмеченный чип заливается чернилами — это и есть состояние; «слот заполнен / пуст»
          живёт в title, потому что лента FLAT SLOTS стоит на той же вкладке и показывает то же
          глазами. Раскладка имеет смысл от двух видов; при одном она ничего не меняет и молчит
          (`title`), а не пропадает: положение переключателя — предпочтение, оно переживает галки.
          Ярлык `views` — единственный текст ряда; рост у чипов и у полосы раскладки тот же, что у
          кнопок двух рядов ниже (`ROW_CONTROL_STYLE`). */}
      <div className='flex flex-wrap items-center gap-2' data-flat-views=''>
        <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
          views
        </Text>
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
                onClick={() => setViews((prev) => ({ ...prev, [view]: !prev[view] }))}
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
            return (
              <Chip
                key={`d:${id}`}
                selected={on}
                pressed={on}
                disabled={choiceOff}
                style={ROW_CONTROL_STYLE}
                title={`detail described in the flat slots: ${displayDetailName(bench.details, d)}`}
                onClick={() => setDetailTicks((prev) => ({ ...prev, [id]: !prev[id] }))}
              >
                detail · {displayDetailName(bench.details, d)}
              </Chip>
            );
          })}
        </ChipRow>
        {/* ПЕРЕКЛЮЧАТЕЛЬ РАСКЛАДКИ — В КОНЦЕ ТОГО ЖЕ РЯДА (слово владельца), и рост ему задаёт
            обёртка: у самой полосы сегменты растянуты (`items-stretch`), поэтому высоту довольно
            назвать один раз снаружи. */}
        <span
          className='ml-auto flex'
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
            options={LAYOUT_OPTIONS}
            disabled={choiceOff}
            onChange={setLayout}
            className='h-full'
          />
        </span>
      </div>

      {/* ═══ РЯД 2 · ЗАПУСК — ОБЩИЙ ОРГАН (F-1). `disabled` ряду НЕ передаётся: право на запись уже
          названо в `gateReason` и той же переменной заперт `submit`. `shape` не называется:
          хвост здесь свой — деньги слева от двери описи, дверь у правого края, как в макете.
          `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
          pending={busy}
          onGenerate={() => void submit()}
          trailing={
            <>
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
              <Text
                size='micro'
                variant='label'
                component='span'
                className='min-w-0'
                data-probe='run-price'
              >
                {lastPrice ? (
                  <>
                    <b className='text-textColor'>{lastPrice}</b> · last flat run ·{' '}
                  </>
                ) : null}
                {PRICED_LATER}
              </Text>
            </>
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
      <RunRefusal
        refusal={input.serverRefusal}
        onDismiss={() =>
          patchFlatInput(
            techCardId,
            readFlatInput(techCardId).run === null
              ? { serverRefusal: null, ask: null }
              : { serverRefusal: null },
          )
        }
      />
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
