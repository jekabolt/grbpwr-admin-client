import { useQueryClient } from '@tanstack/react-query';
import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { GENDER_ENUM_TO_SLUG } from 'constants/constants';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { flattenFieldErrors, revealField } from 'utils/field-errors';

import { kindsForSection } from '../../bom-kind';
import { isRollGoodsSection } from '../../bom-purpose';
import { bornBomLine, upsertDetailText } from '../../form-writers';
import type { TechCardFormData } from '../../schema';
import { anyDirty } from '../../useTechCardAutosave';
import {
  flushAllowsRun,
  flushRefusalSentence,
  useTechCardAutosave,
  type FlushResult,
} from '../autosave-contract';
import { readBench } from '../bench-slot';
import { proposedColourways } from '../colourway-proposals-model';
import { draftReadGate, openGateDoor } from '../core/chain';
import {
  draftInputGate,
  isBoardRow,
  moodGateSentence,
  type MoodGateInput,
} from '../core/mood-gate';
import { useDrafted } from '../drafted-contract';
import {
  Counter,
  EmptyState,
  GROUP_GAP,
  GROUP_SEAM,
  InventoryLine,
  NotSent,
  WmgGroup,
  WmgShell,
  WordsAsSent,
} from '../core';
import { formatMoney } from '../generation/money';
import { isAborted } from '../generation/refusal';
import { runOutputText } from '../generation/run-state';
import { GenerateRow } from '../render/generate-row';
import type { Gate } from '../render/model';
import { calloutWords, type CalloutLike } from '../render/what-model-gets';
import { designKeys, newClientRequestId, useDesignBand, useDesignWrites } from '../use-design-band';
import { useFitKeys } from './card-facts-form';
import {
  appendedText,
  bomLineSnapshot,
  diffProposal,
  draftSays,
  isDraftSection,
  parseConstructionDraft,
  wordDiff,
  type BomLineLike,
  type ConstructionDraft,
  type DetailSuggestion,
  type FormSnapshot,
  type ProposalRow,
} from './construction-draft-model';
import {
  autoFillPlan,
  fillIdOf,
  liveFills,
  openToDecide,
  poppedFill,
  restorable,
  restoreFill,
  sameFill,
  targetOfRow,
  unrestoredFill,
  withoutWords,
  type Fill,
  type FillTarget,
  type WordsOffer,
} from './draft-fills';
import { Fold, LockedBar, scrollToOrgan } from './mood-organs';
import {
  draftRunBusy,
  readDraftRun,
  useCardMemory,
  useDraftMemory,
  useDraftRun,
  type ParkedDraft,
} from './use-draft-fills';
import { draftIdeaRefusal, refusalReason, useDraftDesignIdea } from './use-draft-idea';

/**
 * «DRAFT THE CONSTRUCTION» — ОДНА КНОПКА, ОДИН ПЛАТНЫЙ ПРОГОН, ОДИН ОТВЕТ НА ЧЕТЫРЕ ГРУППЫ.
 *
 * Владелец, дословно: «Внизу вместо кнопки `DRAFT THE IDEA ▸` мы генерируем ВЕСЬ construction info
 * на основании того, что знаем. Интерфейс простой и интуитивный, impeccable. Не уходить в дебри».
 * Здесь стоял `MoodDraft`, который предлагал ПРОЗУ в одно поле (`concept`); теперь предлагается
 * СТРУКТУРА в группы, которые рисует сам CONSTRUCTION: общие сведения, аспекты, слоты материалов.
 *
 * ═══ КРУГ 20: ОНО ЗАПОЛНЯЕТ САМО — И ПО-ПРЕЖНЕМУ НЕ УМЕЕТ СТЕРЕТЬ (B-14) ═══════════════════
 *
 * Владелец: «после того как мы draft the construction нажали оно должно само все заполнять и
 * подсвечивать что заполнило и если мы захотим то удалим».
 *
 * ⚠ КЛИКИ УШЛИ, ЗАЩИТА ОСТАЛАСЬ, И ЭТО НЕ КОМПРОМИСС, А ТОЧНОЕ ЧТЕНИЕ ЗАПИСАННОГО ДЕФЕКТА.
 * Тех-карта сохраняется ПОЛНОЙ ПЕРЕЗАПИСЬЮ (`mapFormToTechCardInsert` перечисляет поля поимённо),
 * поэтому объект, у которого поля НЕТ, доезжает до сервера zod-дефолтом — то есть командой
 * «очисти это» (`techcard-draft-restore-wipes-absent-fields`). Стирание требует трёх вещей разом:
 * объект модели попал в форму, он заменил строку или блок ЦЕЛИКОМ, схема формы дозаполнила его
 * дыры. КЛИК НЕ ВХОДИЛ НИ В ОДНУ ИЗ ТРЁХ. Поэтому исчез именно он, а три остались:
 *   1. ответ разбирается СВОЕЙ схемой (`construction-draft-model.ts`), ни один его объект никогда
 *      не становится значением формы;
 *   2. строки РОЖДАЮТСЯ конструктором, которым рождаются рукописные (`bornBomLine`), а скаляры
 *      патчатся ПО ПУТИ (`upsertDetailText`, `setValue('fit')`) — ни одного `setValue` на корень
 *      массива, кроме добавления в конец и УДАЛЕНИЯ ПО КЛЮЧУ при откате, и ни одного `reset`;
 *   3. кнопки «записать всё» НЕТ. Цикл заполнения идёт по СТРОКАМ ПРЕДЛОЖЕНИЯ, а строка рождается
 *      только у значения, которое модель НАЗВАЛА, — молчание физически не выразимо как запись.
 *      (`accept all N ▸` волны 25.09 — другое: она не пишет НИЧЕГО, только снимает синюю подсветку
 *      с уже записанного, см. `drafted-contract.ts`.)
 * Плюс четвёртое: САМО СОБОЙ ПИШЕТСЯ ВСЁ ПРЕДЛОЖЕННОЕ (фиксап M1, `draft-fills.ts: autoFillPlan`),
 * кроме поля, которое человек поправил ПОСЛЕ нажатия GENERATE: оно приходит строкой «TO DECIDE» и
 * ждёт его клика. И пятое: каждая запись легла в ЖУРНАЛ вместе с тем, что стояло до неё, поэтому
 * «удалим» — это ВОЗВРАТ, а не догадка.
 *
 * ═══ ЧТО ЧИТАЕТ ПРОГОН ══════════════════════════════════════════════════════════════════════
 *
 * Сервер собирает вход САМ — картинки доски, описание (`concept`), выноски с привязкой к картинке
 * и месту, — и читает он СОХРАНЁННУЮ карточку. Клиент не шлёт ни одного из этих полей: провенанс,
 * который подаёт вызывающий, — это заявка, а не провенанс. Отсюда же отказ «save the card first»:
 * несохранённая правка доски до промпта не доедет, и черновик, прочитавший вчерашнюю доску, врал
 * бы молча.
 *
 * ЗДЕСЬ НЕТ `useFieldArray`, И ЭТО НЕ СЛУЧАЙНОСТЬ. Поля-массивы `callouts` и `bomItems` держат по
 * одному экземпляру во всём дереве (студийные выноски и вкладка BOM); второй экземпляр в этой
 * версии RHF молча терял бы строки первого (`rhf-fieldarray-mutations-dont-broadcast`). Поэтому
 * только `useWatch` (чтение) и `setValue` по имени массива (запись) — ровно как у таблицы слотов.
 *
 * ⚠ УКАЗАНИЙ ЧЕРНОВИК БОЛЬШЕ НЕ ПРЕДЛАГАЕТ (B-13). Владелец: «DRAFT OF THE CONSTRUCTION не должен
 * добавлять коллауты все это можно добавить в CONSTRUCTION аспектами». Промпт про них не
 * спрашивает, `diffProposal` их не рождает, ветки записи здесь нет. Ключ `callouts` жив в схеме
 * ответа — сохранённый прогон обязан разбираться на повторе, — но разобрать не значит показать.
 *
 * ═══ ЭТО СВОЙ БЛОК — `CONSTRUCTION DRAFT · what the model proposes` (макет `_step-mood.js`) ═════
 *
 * Здесь стояло «ЭТО НЕ БЛОК: орган стоит ВНУТРИ блока мудборда». Владелец, увидев бету: «не как в
 * референсе»; макет держит черновик ОТДЕЛЬНЫМ блоком под DESCRIPTION — слова человека и ответ
 * машины разные вещи, и держать их в одной рамке значит объявить их одним. Поэтому `Section` теперь
 * СВОЯ (шапка несёт статус прогона, который знает только этот орган), а `mood-board.tsx` монтирует
 * орган соседом, не ребёнком. Внутри блока: ряд прогона (общий `GenerateRow`, состояние вшито в
 * его хвост), под самой тяжёлой линейкой — очередь разбора: `TO DECIDE` с отметкой `take` и одной
 * записью `write N taken ▸`, история (`written · dismissed · hints`) под одним раскрытием.
 * Предложенные колорвеи (B-25) по-прежнему своим блоком под таблицей слотов; связывает их с
 * прогоном модульный стор.
 */

const hhmm = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(),
  );

/** Что прогон прочитал и когда — плюс слепок, по которому черновик понимает, что протух. */
type Staged = {
  draft: ConstructionDraft;
  readPictures: number;
  readNotes: number;
  time: string;
  fingerprint: string;
};

/** Утверждённая карточка заморожена: черновик в неё не пишет (S-M1). Написание — как у соседей. */
const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';

/**
 * ═══ ДОСКА, КАКОЙ ЕЁ ПРОЧТЁТ ПРОГОН — ОДНО ПРАВИЛО НА ОТРИСОВКУ И НА СВЕРКУ ПОСЛЕ `await` (S-M1) ═
 *
 * Отрисовка читает `useWatch`, щелчок после ожидания сохранения — `getValues()`: снимок отрисовки
 * застыл бы на том, что было при щелчке. Правило у обоих чтений одно:
 *   · картинок — РАЗНЫХ `mediaId`: одна картинка стоит и на доске, и во входе двумя строками (U-5),
 *     и считать её дважды значило бы обещать прогону восьмую картинку;
 *   · на доске — строк `isBoardRow` (дверь черновика, `draftReadGate`); вход REFERENCE не в счёт;
 *   · заметки — непустые описания указаний на этих картинках;
 *   · слепок — картинки, описание, заметки: по нему черновик понимает, что доска ушла вперёд.
 */
type BoardRowLike = { mediaId?: number; kind?: string | null };

function boardStamp(ids: number[], concept: string, notes: string[]): string {
  return JSON.stringify([ids, concept.trim(), notes]);
}

function boardReadOf(v: { moodboardMedia?: unknown; callouts?: unknown; concept?: unknown }) {
  const rows = (v.moodboardMedia ?? []) as BoardRowLike[];
  const ids = [...new Set(rows.map((r) => r.mediaId).filter((id): id is number => !!id))];
  const on = new Set(ids);
  const notes = ((v.callouts ?? []) as CalloutLike[])
    .filter((c) => on.has(c.mediaId ?? 0))
    .map((c) => (c.description ?? '').trim())
    .filter(Boolean);
  const concept = typeof v.concept === 'string' ? v.concept : '';
  return {
    ids,
    notes,
    boardPictures: rows.filter(isBoardRow).length,
    fingerprint: boardStamp(ids, concept, notes),
  };
}

/**
 * Квитанция строки. Заменяет чипы после клика — сегодняшняя грамматика, слово в слово. `restored`
 * — у записи возврата (`restore previous ↶`, BLK-1); она выводится из самой записи, не из клика.
 */
type Receipt = 'added' | 'replaced' | 'dismissed' | 'restored';

/**
 * ЦЕНА ЭТОГО ПРОГОНА — И БОЛЬШЕ НИЧЕГО (T-12). Владелец: «нам надо показывать только цену
 * генерации и все».
 *
 * `price_actual` ВПЕРЕДИ `price_estimate`: смета — то, что было отложено ДО отправки, факт — сумма
 * попыток, оплаченные неудачи включительно. Текстовый прогон исполняется инлайном и возвращается
 * завершённым, поэтому факт обычно на месте.
 *
 * `null` — ПОЛНОЦЕННЫЙ ОТВЕТ, а не ноль: все денежные поля вырезаны у аккаунта без `costing:read`,
 * и `$0.00` утверждало бы, что прогон был бесплатным. Тогда строки цены нет вовсе.
 */
/** Деталь, которую сервер не завёл, и его причина — словами сервера. */
type MintFailure = { name: string; reason: string };

/**
 * ОДНА ФРАЗА НА ВЕСЬ ЦИКЛ ЗАВЕДЕНИЯ (фиксап M4): какие детали не завелись и почему. Одинаковые
 * причины звучат один раз — три отказа «name taken» не повод трижды повторять одно и то же.
 */
function couldNotAdd(failed: MintFailure[]): string {
  const names = failed.map((f) => f.name).join(', ');
  const reasons = [...new Set(failed.map((f) => f.reason).filter(Boolean))].join('; ');
  return reasons ? `could not add ${names} — ${reasons}` : `could not add ${names}`;
}

function runPrice(run?: common_DesignRun): string | null {
  if (!run) return null;
  const currency = run.currency;
  return formatMoney(run.priceActual, currency) || formatMoney(run.priceEstimate, currency) || null;
}

/**
 * ОТКАЗЫ, ПОСЛЕ КОТОРЫХ КЛЮЧ ИДЕМПОТЕНТНОСТИ БОЛЬШЕ НЕ СТЕРЕЖЁТ НИЧЕГО.
 *
 * ⚠ ЭТО СПИСОК ПРО ЗАКРЫТЫЙ ПРОГОН, А НЕ ПРО «ПЛОХИЕ НОВОСТИ», И ЧЛЕНСТВО В НЁМ ПРОВЕРЯЕМО.
 * Причина попадает сюда, только если сервер физически НЕ МОГ её произнести, не закрыв перед этим
 * строку прогона, привязанную к нашему `client_request_id`: `failed` (designFailDraftAs) либо
 * `done` в другой форме. А закрытая строка означает, что следующее нажатие ТЕМ ЖЕ ключом не купит
 * ничего и не принесёт ничего — идемпотентный повтор отдаст ровно эту же фразу, и так до
 * перезагрузки страницы. Сервер при этом сам говорит человеку «press draft again to start a new
 * one»; удержанный ключ делает его совет физически невыполнимым.
 *
 * ПОЧЕМУ ИМЕННО ЭТИ ПЯТЬ (`internal/apisrv/admin/design_run.go`, designReplayedFailure и соседи):
 *   · `provider_cut` — произносится ТОЛЬКО из designReplayedFailure, то есть у строки `failed`.
 *     С первого нажатия эта причина не приходит вовсе: оборванный провод приезжает голым
 *     `Unavailable` без единой детали (designDraftCallError).
 *   · `invalid_output`, `budget_exhausted` — приходят с обоих концов, и оба конца закрыты:
 *     на первом нажатии designFailDraftAs закрывает прогон СТРОКОЙ ВЫШЕ самого отказа, на
 *     повторе их произносит та же designReplayedFailure.
 *   · `provider_error` — как причина В ДЕТАЛИ не рождается больше нигде, кроме designReplayedFailure
 *     (включая её запасной вариант для пустой колонки), то есть тоже только у `failed`. Без него
 *     ровно тот же тупик остался бы на САМОМ ЧАСТОМ провале — обычном обрыве связи.
 *   · `shape_mismatch` — прогон `done`, отвечен в ДРУГОЙ форме; этот черновик не достанет из него
 *     ничего и никогда, сколько бы раз ключ ни приехал.
 *
 * ⚠ ЧЕГО ЗДЕСЬ НЕТ — ВАЖНЕЕ ТОГО, ЧТО ЕСТЬ. Всё остальное ключ ДЕРЖИТ, потому что отпустить его на
 * живом прогоне значит заплатить второй раз за один вопрос, то есть совершить ровно ту аварию,
 * ради которой ключ и заведён. За бортом остались:
 *   · `generation_disabled` и `AI_NOT_CONFIGURED` — отказ приходит ДО StartRun, строки прогона на
 *     этот ключ может не быть вовсе; отпускать нечего, а держать бесплатно;
 *   · голый `Unavailable` первого провала, включая ОПЛАЧЕННЫЙ обрыв, — с этой стороны он
 *     неотличим от «вызов идёт прямо сейчас, а до нас не доехал ответ». Следующее нажатие тем же
 *     ключом бесплатно по построению: живая лиза вернёт пустой прогон, закрытая — причину из
 *     списка выше, и ключ отпустится тогда, зная, а не гадая;
 *   · всё, что приходит без детали вообще (сеть, 500, InvalidArgument, «нечего читать»): причины
 *     нет — решения нет — ключ на месте.
 */
const CLOSED_RUN_REFUSALS = new Set([
  'provider_cut',
  'invalid_output',
  'budget_exhausted',
  'provider_error',
  'shape_mismatch',
]);

/** Прогон за этим ключом ЗАКРЫТ — ключу больше нечего стеречь. */
function runIsClosed(error: unknown): boolean {
  return CLOSED_RUN_REFUSALS.has(refusalReason(error));
}

/** Почему посадку не пишет этот аккаунт — подпись строки TO DECIDE (M2 ре-ревью CL-C). */
const FIT_NEEDS_GRANT = 'fit needs products:write';
/**
 * …а пока учётная запись не прочитана, права ещё никто не знает: человеку, у которого оно есть,
 * «needs products:write» сказало бы неправду (ревью раунда 3, MIN-3). Посадка стоит строкой
 * TO DECIDE, и её `take` оживает, когда право подтвердится.
 */
const FIT_WAITS_ACCOUNT = 'fit waits for your account';
/** Сколько стоит `undo ↶` после отказа от прежних слов (m6) — столько же, сколько у `ai ✦`. */
const UNDO_WINDOW_MS = 10_000;

export function ConstructionDraft({
  techCardId,
  disabled,
  conceptMax,
  boardPictures,
}: {
  techCardId: number;
  disabled?: boolean;
  /**
   * Картинок НА ДОСКЕ (`isBoardRow`), для двери черновика (`draftReadGate`, D-10 / фиксап B1).
   * Пропом, а не импортом `isBoardRow`, по тому же доводу, что `conceptMax` ниже: доска монтирует
   * этот орган, и импорт отсюда завёл бы цикл. Строки входа REFERENCE не в счёт (ревью Codex B-10).
   *
   * Необязателен ТОЛЬКО ради отдельного монтажа органа без доски (`scripts/construction-draft-
   * probe-entry.tsx`): там счёт падает на число разных картинок `moodboardMedia` — прежнее чтение.
   * Продукт монтирует орган одним местом, `mood-board.tsx`, и передаёт число всегда.
   */
  boardPictures?: number;
  /**
   * Потолок поля `concept`, ПЕРЕДАННЫЙ ВЛАДЕЛЬЦЕМ ПОЛЯ, а не написанный здесь второй раз.
   * Редактор описания стоит в `mood-board.tsx`, там же его `maxLength`, и там же — единственное
   * написание этого числа (`CONCEPT_MAX`). Второй потолок на одно поле — это способ молча
   * потерять хвост описания на том из них, который меньше; импорт же отсюда завёл бы цикл
   * (`mood-board` монтирует этот орган), а цикл в сборке — это молчаливое `undefined` вместо
   * числа, то есть проверка, которая пропускает всё.
   */
  conceptMax: number;
}): JSX.Element {
  const { control, getValues, setValue, trigger } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const draftIdea = useDraftDesignIdea(techCardId);
  const [inspecting, setInspecting] = useState(false);
  /* ═══ АВТОСЕЙВ (волна 25.09, D-07 / ревью Codex B-05) ═══════════════════════════════════════
     Прогон читает СОХРАНЁННУЮ карточку, поэтому перед платной дверью — `flush` (сохрани СЕЙЧАС и
     скажи, вышло ли), а после записи черновика в поля — `request` (сохрани скоро, не дожидаясь
     дебаунса). Провайдера нет (стенд, создание карточки) — контракт отвечает `off`, и дверь
     ведёт себя как до волны: гейт «save the card first» по грязной доске остаётся в силе. */
  const autosave = useTechCardAutosave();
  /**
   * ПРОГОН ЭТОЙ КАРТОЧКИ — фаза, ключ идемпотентности, отказ сохранения, ответ, ждущий органа,
   * заведение слотов. В сторе по ключу карточки, а не здесь: орган умирает от смены шага, вкладки
   * и карточки, а прогон — нет (S-M1, разбор у `DraftRun` в `use-draft-fills.ts`).
   */
  const run = useDraftRun(techCardId);
  const patchRun = useDraftMemory((st) => st.patchRun);
  const takeParked = useDraftMemory((st) => st.takeParked);
  const bumpMinting = useDraftMemory((st) => st.bumpMinting);
  /** Орган на экране. После ожидания сохранения щелчок спрашивает, есть ли ещё кому платить. */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  /** Одно состояние «drafted» на всю студию (`drafted-contract.ts`): кнопка `accept all N ▸`. */
  const drafted = useDrafted();

  /* ═══ ФЛЭТ-ВЕРСТАК — ВТОРОЙ АДРЕСАТ ЧЕРНОВИКА (r3 п.6) ═══════════════════════════════════════
     Предложенная деталь заводится СТРОКОЙ НА СЕРВЕРЕ, а не значением формы, поэтому органу нужны
     две вещи, которых у него до сих пор не было: полоса (какие детали уже стоят) и писатели
     верстака.

     ⚠ ЭТО НЕ ВТОРОЙ КЭШ. `useDesignBand` — `useQuery` с ключом НА КАРТОЧКУ (`designKeys.band`), и
     соседний вызов из `mood-board.tsx`, которая монтирует этот блок, читает ТУ ЖЕ запись react-query:
     ни второго запроса, ни второго состояния. Пропом полоса сюда не доезжает — `mood-board` её не
     передаёт, а править чужой файл этот заход права не имеет.

     `serverSpeaks` НЕСУЩИЙ: на бинаре без полосы верстака нет вовсе, и предлагать заводить в нём
     детали значило бы рисовать дверь, за которой отказ. */
  const { band, serverSpeaks } = useDesignBand(techCardId);
  const writes = useDesignWrites(techCardId);
  const queryClient = useQueryClient();
  const benchDetails = useMemo(() => readBench(band, 'flat').details, [band]);

  // ЖУРНАЛ ЗАПОЛНЕНИЙ И ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ ЖИВУТ В МОДУЛЬНОМ СТОРЕ, А НЕ ЗДЕСЬ: студия
  // монтируется условно, и `useState` органа умер бы от одного захода на COLORWAYS и обратно —
  // вместе с единственной записью о том, что стояло на карточке ДО черновика (см. `use-draft-fills`).
  const { fills } = useCardMemory(techCardId);
  const record = useDraftMemory((st) => st.record);
  const put = useDraftMemory((st) => st.put);
  const forget = useDraftMemory((st) => st.forget);
  const setProposals = useDraftMemory((st) => st.setProposals);

  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as { mediaId?: number }[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as CalloutLike[];
  const details = (useWatch({ control, name: 'details' }) ?? []) as {
    key?: string;
    text?: string;
  }[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as {
    name?: string;
    lineKey?: string;
    section?: string;
    composition?: string;
  }[];
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;
  // Посадки, которые вещь может нести, — правило CARD DETAILS (`useFitKeys`). Черновик предлагает
  // и САМ пишет посадку только из них: сумке — никакой, брюкам — не `a_line`.
  const fitKeys = useFitKeys();
  const fitKeysRef = useRef(fitKeys);
  fitKeysRef.current = fitKeys;
  // ШАПКА ИЗДЕЛИЯ, КАК ЕЁ ЧИТАЕТ `designConstructionUserPrompt`: Category, Gender, Size run с
  // отмеченным базовым. Имена — из словаря, потому что сервер печатает имена (`cache.GetCategoryById`,
  // `cache.GetSizeById`), а форма держит id.
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const targetGender = (useWatch({ control, name: 'targetGender' }) ?? '') as string;
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const baseSampleSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);
  const { dictionary } = useDictionary();
  const categoryName = useMemo(
    () => (dictionary?.categories ?? []).find((c) => c.id === categoryId)?.name?.trim() ?? '',
    [dictionary?.categories, categoryId],
  );
  const genderLabel = GENDER_ENUM_TO_SLUG[targetGender] ?? '';
  const sizeRun = useMemo(() => {
    const byId = new Map<number, string>();
    for (const sz of dictionary?.sizes ?? []) if (sz.id != null) byId.set(sz.id, sz.name ?? '');
    return sizeIds
      .map((id) => {
        const name = (byId.get(id) ?? '').trim();
        return name ? (id === baseSampleSizeId ? `${name} (base)` : name) : '';
      })
      .filter(Boolean);
  }, [dictionary?.sizes, sizeIds, baseSampleSizeId]);

  // ЧТО СЧИТАЕТСЯ НЕСОХРАНЁННОЙ ДОСКОЙ — ровно три поля, которые прогон читает из СТОРА. Подписка
  // сужена именами: `useFormState` без имён перерисовывал бы орган на каждом нажатии клавиши в
  // любом поле карточки.
  const { dirtyFields } = useFormState({
    control,
    name: ['concept', 'moodboardMedia', 'callouts'] as never,
  });
  // ПРАВКА ЛИ ЭТО — ПО ЗНАЧЕНИЮ, А НЕ ПО КЛЮЧУ (m4 ре-ревью CL-A). У полей-массивов RHF заводит
  // запись в `dirtyFields` сразу и держит в ней пустой массив, объекты из `false` или дыры:
  // `!!dirtyFields.moodboardMedia` читал «несохранённую доску» после любого движения строк,
  // вернувшего доску к сохранённой, и запирал GENERATE словами «save the card first». Разбор —
  // один на всю карточку, у автосейва (`anyDirty`).
  const boardDirty =
    anyDirty(dirtyFields.concept) ||
    anyDirty((dirtyFields as { moodboardMedia?: unknown }).moodboardMedia) ||
    anyDirty((dirtyFields as { callouts?: unknown }).callouts);

  const board = useMemo(
    () => boardReadOf({ moodboardMedia: items, callouts, concept }),
    [items, callouts, concept],
  );
  const boardNotes = board.notes;
  const stampOf = (conceptText: string) => boardStamp(board.ids, conceptText, board.notes);
  const fingerprint = board.fingerprint;

  const [staged, setStaged] = useState<Staged | null>(null);
  /** Цена последнего прогона, уже словами. Живёт рядом с черновиком: это цена ЕГО, а не дня. */
  const [price, setPrice] = useState<string | null>(null);
  /**
   * СТРОКА ПОСЛЕДНЕГО ЧЕРНОВИКА — ИЗ ОТВЕТА, А НЕ ИЗ ПОЛОСЫ. Лента полосы НЕ НЕСЁТ род
   * `draft_idea` (`internal/store/design/band.go`, `designFeedKinds`): искать его в `band.runs`
   * значило бы найти null после каждого удачного черновика и напечатать «no draft has run yet»
   * поверх только что оплаченного ответа. Ответ `DraftDesignIdea` отдаёт строку целиком (`res.run`,
   * `output_text` заполнен — прогон исполняется инлайном), и это единственное место, где она есть.
   * Живёт рядом с ценой и тем же сроком: это строка ЭТОГО нажатия, а не история карточки.
   */
  const [lastRun, setLastRun] = useState<common_DesignRun | null>(null);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const stale = !!staged && staged.fingerprint !== fingerprint;

  const readOnly = !!disabled;
  /**
   * ═══ ПОСАДКА — ФАКТ СТИЛЯ, И ПИШЕТ ЕЁ ТОЛЬКО products:write (M2 ре-ревью CL-C) ═══════════════
   *
   * `fit` уходит на сервер одним писателем — `UpdateStyle`, а это `products:write` (rbac.go:163);
   * `tech_cards:write` мало. Аккаунту без права панель фактов посадку НЕ СТЕЙДЖИТ
   * (`style-facts-field.tsx`, `canStyle`), CARD DETAILS её запирает. Запиши её черновик в форму — и
   * значение ни разу не уехало бы на сервер, следующий автосейв тела сдвинул бы базу, а запертая
   * ячейка показывала бы черновую посадку как сохранённую: тихое расхождение экрана и карточки.
   * Поэтому без права черновик посадку не пишет — ни сам, ни `take`, ни `✕`/возвратом журнала, —
   * а строка стоит в TO DECIDE с подписью `fit needs products:write` и погашенным `take`.
   *
   * Предикат — тот же `canWrite(SECTION.products)`, что у CL-C, но ОТВЕЧЕННЫЙ: пока учётная запись
   * не прочитана, `canWrite` открыт «на всякий случай», а платный прогон, записавший посадку в это
   * окно, дал бы то же расхождение. Супер-аккаунт пишет всегда. В колбэки ответа — через ref: ответ
   * приходит позже рендера, в котором его заказали.
   */
  const permissions = usePermissions();
  const fitWritable =
    permissions.isSuper || (permissions.resolved && permissions.canWrite(SECTION.products));
  const fitWritableRef = useRef(fitWritable);
  fitWritableRef.current = fitWritable;
  /** Запись журнала по посадке, которую этот аккаунт вернуть в поле не вправе (см. выше). */
  const fitBarred = (f: Fill) => f.target.kind === 'fit' && !fitWritable;
  /** Подпись строки посадки, которую черновик не пишет: нет права — или его ещё не прочитали. */
  const fitBarNote = fitWritable
    ? undefined
    : permissions.resolved
      ? FIT_NEEDS_GRANT
      : FIT_WAITS_ACCOUNT;
  /** Разных картинок, а не строк (`boardReadOf`). */
  const pictureCount = board.ids.length;
  /**
   * ═══ ДВЕРЬ ЧЕРНОВИКА — «ЕСТЬ ЧТО ЧИТАТЬ», А НЕ ПОЛНЫЙ МИНИМУМ (D-10, фиксап волны B1) ═════════
   *
   * Здесь стояла своя мера пустоты («нет картинок И нет слов», зеркало серверного `no_moodboard`),
   * потом — общий минимум мудборда. С фиксапа B1 общий минимум требует ВСЕ три части: картинку на
   * доске, 40 символов описания и категорию. Но описание — ровно то, что этот черновик пишет:
   * требовать его до прогона значило бы запереть черновик на доске из одних картинок. Поэтому его
   * дверь — `draftReadGate`: картинка на доске ИЛИ описание от 40 символов, и категория; слова —
   * те же части `moodboardGate`. FLAT и всё дальше по цепочке запирает полный минимум. Правило
   * строже серверного, и это намеренно: черновик, прочитавший три слова без категории, предлагает
   * посадки не того семейства.
   *
   * «SAVE THE CARD FIRST» ОСТАЁТСЯ ТОЛЬКО БЕЗ АВТОСЕЙВА. С автосейвом грязная доска не повод
   * запирать дверь: нажатие само сохранит карточку (`flush` в `askForDraft`) и откажет словами,
   * если сохранить нельзя. Без автосейва (`off`) сохранить некому, и гейт прежний.
   */
  const minimum = draftReadGate({
    boardPictures: boardPictures ?? pictureCount,
    concept,
    categoryId,
  });
  const gate: Gate = !minimum.ok
    ? { ok: false, reason: minimum.reason }
    : boardDirty && autosave.status === 'off'
      ? { ok: false, reason: 'save the card first — the draft reads what is saved' }
      : { ok: true };

  /**
   * ═══ GENERATE — СОХРАНИТЬ, УБЕДИТЬСЯ, ЧТО ПЛАТИТЬ ЕЩЁ ЕСТЬ ЗА ЧТО, И ТОЛЬКО ПОТОМ ПЛАТИТЬ ═══════
   *
   * СНАЧАЛА СОХРАНИТЬ (Codex B-05). Сервер соберёт вход из СОХРАНЁННОЙ карточки; правка доски, не
   * доехавшая до сервера, до промпта не доедет, и черновик прочитал бы вчерашнюю доску молча.
   *
   * ⚠ ПОСЛЕ ОЖИДАНИЯ — ТОЛЬКО СВЕЖИЕ ЧТЕНИЯ, И ЧЕТЫРЕ ВОПРОСА ДО ПЕРВОГО ЦЕНТА (ревью швов, S-M1).
   * Всё, что замкнуто в эту функцию, — снимок щелчка, а ждёт она сохранения; за это время:
   *   · автосейв мог ОСТАНОВИТЬСЯ. `off` пропускает прогон (`flushAllowsRun`), и для карточки, у
   *     которой автосейва нет вовсе, так и надо; но если на щелчке он был ЖИВ, `off` после ожидания
   *     значит «уничтожен» (ушли со страницы) или «выключен» (карточку утвердили посреди записи) —
   *     прогон по несохранённой или замороженной карточке не стартует (`wasOn`, образец —
   *     `flat-run-row.tsx`);
   *   · орган мог УЙТИ с экрана — смена шага, вкладки, карточки. Платить за вопрос, который человек
   *     оставил, не за что: прогон не заказывается, и снекбар говорит это словами;
   *   · карточку могли УТВЕРДИТЬ, а доску — опустошить: утверждение и дверь черновика
   *     перечитываются из ФОРМЫ (`getValues`), а не из отрисовки щелчка;
   *   · отказ сохранения ложится в стор ИСХОДОМ — фраза и число полей собираются при отрисовке из
   *     автосейва, каким он стал (`refusedSentence`), а не каким был на щелчке.
   *
   * ⚠ ОТВЕТ НЕ ПРИМЕНЯЕТСЯ ЗДЕСЬ. Вызов летит секунды, и за них орган, заказавший его, может
   * умереть — колбэки `mutate` TanStack тогда роняет, и оплаченный ответ не доезжал до полей вовсе.
   * Поэтому `mutateAsync` (промис живёт дольше наблюдателя), а ответ — и отказ сервера — ложится в
   * стор карточки (`parked`); применяет его орган ЭТОЙ карточки: сразу, если он на экране, или
   * когда вернётся (`applyParked`). Ключ идемпотентности живёт там же: нажатие после возврата несёт
   * ТОТ ЖЕ ключ, пока вызов не ответил, и сервер отдаёт ту же строку вместо второй оплаты.
   */
  async function askForDraft() {
    const card = techCardId;
    if (!gate.ok || readOnly || !(card > 0)) return;
    // Занятость — из стора В МОМЕНТ щелчка, а не из снимка отрисовки: два щелчка в одном кадре и
    // щелчок по органу, вернувшемуся к идущему вызову, отказываются одинаково.
    if (draftRunBusy(readDraftRun(card))) return;
    const wasOn = autosave.status !== 'off';
    patchRun(card, { phase: 'saving', refused: null });
    let flushed: FlushResult;
    try {
      flushed = await autosave.flush('draft');
    } catch {
      // Контракт отвечает исходом, а не исключением; брошенное всё равно читается отказом, а не
      // разрешением платить.
      flushed = 'error';
    }
    if (flushed === 'off' && wasOn) {
      patchRun(card, {
        phase: null,
        refused: getValues('approvalState') === RELEASED ? 'released' : 'stopped',
      });
      return;
    }
    if (!flushAllowsRun(flushed)) {
      patchRun(card, { phase: null, refused: flushed });
      return;
    }
    if (!onScreen(card)) {
      patchRun(card, { phase: null });
      showMessage(
        'the draft was not started — you left it while the card was saving; nothing was charged',
        'error',
      );
      return;
    }
    const now = getValues();
    if (now.approvalState === RELEASED) {
      patchRun(card, { phase: null, refused: 'released' });
      return;
    }
    const read = boardReadOf(now);
    // Отказ двери уже стоит полосой над кнопкой (`gate` читает ту же форму) — второй не нужен.
    if (
      !draftReadGate({
        boardPictures: read.boardPictures,
        concept: now.concept,
        categoryId: now.categoryId,
      }).ok
    ) {
      patchRun(card, { phase: null });
      return;
    }
    const clientRequestId = readDraftRun(card).intent ?? newClientRequestId();
    // ЧТО СТОЯЛО В ПОЛЯХ, КОГДА ЧЕРНОВИК ЗАКАЗАН (фиксап M1): поле, поправленное после этой
    // секунды, пока ответ летит, машина не перепишет — его слова свежее ответа.
    // Снимок — ПОСЛЕ сохранения, а не на клике: сохранение само пишет в поля значения сервера
    // (`settleAfterBodySave`), и снимок на клике принял бы их за правку человека. Набранное в эти
    // доли секунды черновик перепишет, но `before` журнала держит его дословно — один `✕`.
    const pressed = rawScalars();
    patchRun(card, { phase: 'asking', intent: clientRequestId });
    try {
      const res = await draftIdea.mutateAsync({ clientRequestId });
      patchRun(card, {
        phase: null,
        intent: null,
        parked: {
          kind: 'answer',
          run: res.run ?? null,
          draft: parseConstructionDraft(res.construction),
          read: {
            pictures: read.ids.length,
            notes: read.notes.length,
            fingerprint: read.fingerprint,
          },
          pressed,
          time: hhmm(),
        },
      });
    } catch (error) {
      // ⚠ КЛЮЧ ОТПУСКАЕТСЯ РОВНО НА ЗАКРЫТОМ ПРОГОНЕ — И НИ НА ЧЁМ БОЛЬШЕ. Пока прогон может быть
      // жив, следующий клик обязан нести ТОТ ЖЕ ключ: повторить намерение с новым означало бы
      // заплатить дважды за один вопрос. Но у прогона, который сервер уже закрыл, стеречь нечего:
      // тот же ключ будет вечно возвращать ту же самую фразу, и «press draft again» — совет,
      // которому мы физически не давали сбыться (см. CLOSED_RUN_REFUSALS).
      patchRun(card, {
        phase: null,
        ...(runIsClosed(error) ? { intent: null } : {}),
        parked: {
          kind: 'refusal',
          words: draftIdeaRefusal(error, noMoodboardSentence(getValues())),
          away: !onScreen(card),
        },
      });
    }
  }

  /* ── ЧЕТЫРЕ ЗАПИСИ, И НИ ОДНОЙ ПЯТОЙ ─────────────────────────────────────────────────────
     Каждая ветка зовёт ПИСАТЕЛЯ, который уже существует и которым пользуется рукописная правка.
     Ни одна не собирает объект формы из объекта модели: наверх едут только СТРОКИ.
     Ветка указаний снята вместе с самим предложением указаний (B-13).
     `pickedSection` — секция, которую человек выбрал строке спецификации без своей (`hold`). */
  function applyRow(
    row: ProposalRow,
    pickedSection?: string,
  ): {
    ok: boolean;
    value: string;
    lineKey?: string;
    line?: BomLineLike;
  } {
    if (readOnly) return { ok: false, value: '' };
    const w = row.write;
    if (w.kind === 'detail') {
      upsertDetailText(getValues, setValue, w.key, w.text);
      return { ok: true, value: w.text };
    }
    if (w.kind === 'fit') {
      // Без products:write посадка не пишется вовсе (M2): строка остаётся в TO DECIDE со своей
      // подписью, отказ молчит — снекбар на каждом прогоне повторял бы то, что строка уже говорит.
      if (!fitWritableRef.current) return { ok: false, value: '' };
      setValue('fit', w.value as never, { shouldDirty: true });
      return { ok: true, value: w.value };
    }
    if (w.kind === 'concept') {
      // Потолок проверяется ДО записи, и отказ говорит числа: молча обрезанное описание — это
      // предложение, потерявшее хвост без единого слова об этом. Не влезшее описание остаётся
      // строкой предложения, а не пропадает: `ok:false` не пишет и не заводит записи журнала.
      if (w.text.length > conceptMax) {
        showMessage(
          `this description does not fit — the field holds ${conceptMax} characters and the draft is ${w.text.length}`,
          'error',
        );
        return { ok: false, value: '' };
      }
      setValue('concept', w.text, { shouldDirty: true });
      // СВОЯ ЖЕ ЗАПИСЬ НЕ ПРОТУХАЕТ ЧЕРНОВИК: без пере-штампа первое же заполнение подняло бы
      // плашку «the moodboard has changed since» за собственную работу органа.
      setStaged((prev) => (prev ? { ...prev, fingerprint: stampOf(w.text) } : prev));
      return { ok: true, value: w.text };
    }
    /* ═══ СТРОКА СПЕЦИФИКАЦИИ РОЖДАЕТСЯ С СЕКЦИЕЙ, КОТОРУЮ СЕРВЕР ПРИМЕТ (фиксап раунда 2, MIN-11) ═
       Сохранение карточки со строкой в `TECH_CARD_BOM_SECTION_UNKNOWN` сервер отвергает ЦЕЛИКОМ
       (dto `parseTechCardBomItems`), вместе со всем остальным, что черновик записал. Поэтому строки
       без секции из списка вкладки BOM нет вовсе — её ждёт выбор человека (`hold`), а не умолчание:
       «ткань» по умолчанию молча записала бы пуговицу рулонным товаром.

       Назначение и вид, которых секция не держит, снимаются тем же правилом, что у сервера
       (`materials.go` `validateBomKindSection`, назначение — только у рулонных), и ТОЛЬКО у секции,
       выбранной человеком (раунд 3, m1): пару «вид — секция», названную моделью, сервер уже свёл
       сам, а клиентский список видов короче серверного (нет `TOTE_BAG`, `SPARE_KIT_BAG` —
       `bom-kind.ts`), и снятие на каждой строке молча теряло их вид. */
    const section = pickedSection || w.line.section || '';
    if (!isDraftSection(section)) {
      showMessage(
        `pick a section for ${w.line.name ?? 'this line'} — the card does not keep a line without one`,
        'error',
      );
      return { ok: false, value: '' };
    }
    const line = { ...w.line, section };
    if (pickedSection) {
      if (line.purpose && !isRollGoodsSection(section)) delete line.purpose;
      if (line.kind && !(kindsForSection(section) as string[]).includes(line.kind))
        delete line.kind;
    }
    const cur = (getValues('bomItems') ?? []) as unknown[];
    const born = bornBomLine(line);
    setValue('bomItems', [...cur, born] as never, { shouldDirty: true });
    // Ключ строки минтит КОНСТРУКТОР, и журнал берёт его оттуда, а не выдумывает свой: адрес
    // отката обязан быть тем же самым ключом, по которому строка живёт в форме.
    return {
      ok: true,
      value: w.line.name,
      lineKey: String(born.lineKey ?? ''),
      line: born as BomLineLike,
    };
  }

  /** Живые значения формы в момент записи — `getValues`, а не снимок рендера (см. писателей). */
  function liveSnapshot(): FormSnapshot {
    return {
      fit: (getValues('fit') ?? '') as string,
      fitChoices: fitKeysRef.current,
      concept: (getValues('concept') ?? '') as string,
      details: (getValues('details') ?? []) as { key?: string; text?: string }[],
      bomItems: (getValues('bomItems') ?? []) as BomLineLike[],
    };
  }

  /**
   * ЗНАЧЕНИЕ АДРЕСАТА ДОСЛОВНО — с переносами строк и пробелами, как оно стоит в форме. Это и есть
   * `before` журнала: откат возвращает слова человека в точности (фиксап M1 — с перезаписью это
   * стало обычным путём, а сравнительная нормализация `row.current` схлопывала переносы).
   */
  function rawOf(target: FillTarget): string {
    if (target.kind === 'detail') {
      const list = (getValues('details') ?? []) as { key?: string; text?: string | null }[];
      return list.find((d) => d.key === target.key)?.text ?? '';
    }
    if (target.kind === 'fit') return (getValues('fit') as string | null | undefined) ?? '';
    if (target.kind === 'concept') return (getValues('concept') as string | null | undefined) ?? '';
    return '';
  }

  /** Все скаляры, которые черновик может переписать, по адресу журнала — дословно. */
  function rawScalars(): Map<string, string> {
    const out = new Map<string, string>();
    out.set(fillIdOf({ kind: 'fit' }), rawOf({ kind: 'fit' }));
    out.set(fillIdOf({ kind: 'concept' }), rawOf({ kind: 'concept' }));
    for (const d of (getValues('details') ?? []) as { key?: string; text?: string | null }[]) {
      if (d.key) out.set(fillIdOf({ kind: 'detail', key: d.key }), d.text ?? '');
    }
    return out;
  }

  /**
   * ФРАЗА ДЛЯ ОТКАЗА СЕРВЕРА `no_moodboard` — ТА ЖЕ, ЧТО У ГЕЙТА (фиксап N1: второй формулировки
   * нет). Не держит минимум сейчас — его собственная фраза. Держит, а сервер всё равно не нашёл,
   * что читать (прочитал сохранённое раньше), — фраза пустой доски с этой же категорией. Читается
   * из ЗНАЧЕНИЙ формы в момент отказа (S-M1): отказ приходит позже отрисовки, в которой его заказали.
   */
  function noMoodboardSentence(v: TechCardFormData): string {
    const input: MoodGateInput = {
      boardPictures: boardReadOf(v).boardPictures,
      concept: v.concept,
      categoryId: v.categoryId,
    };
    const now = draftInputGate(input);
    return moodGateSentence(
      now.ok ? draftInputGate({ boardPictures: 0, concept: '', categoryId: v.categoryId }) : now,
    );
  }

  /** Запись в журнал; возвращает АДРЕС записи — по нему строка журнала носит свою квитанцию. */
  function remember(
    row: ProposalRow,
    done: { value: string; lineKey?: string; line?: BomLineLike },
    at: string,
    before: string,
  ): string | null {
    const target: FillTarget | null = done.lineKey
      ? { kind: 'slot', lineKey: done.lineKey }
      : targetOfRow(row);
    if (!target) return null;
    record(techCardId, {
      id: fillIdOf(target),
      target,
      // ⚠ У СТРОКИ СЛОТА ПОДПИСЬ СВОЯ, А НЕ `row.label`. В предложении подпись строки — это её
      // семейство («fabric», «lining»), потому что рядом стоит имя; в журнале рядом стоит ТОЖЕ
      // имя, и «fabric · neck binding» читалось бы как аспект «ткань» со значением «окантовка
      // горловины» — то есть как запись, которой не было. Журнал называет РОД записи.
      label: done.lineKey ? 'material slot' : row.label,
      // ДОСЛОВНО, а не `row.current` (тот нормализован для сравнения и схлопывает переносы строк).
      before,
      after: done.value,
      // Слепок записанной строки — мера её живости (фиксап M2).
      ...(done.line ? { snapshot: bomLineSnapshot(done.line) } : {}),
      at,
    });
    return fillIdOf(target);
  }

  /**
   * САМО-ЗАПОЛНЕНИЕ (B-14, фиксап M1). Идёт ПО СТРОКАМ ПРЕДЛОЖЕНИЯ и пишет ВСЁ, что предложено
   * (`autoFillPlan`): пустые адресаты, свои прошлые записи и слова человека, стоявшие до нажатия, —
   * те с дословным `before` в журнале, так что `✕` и `undo all` вернут их. Строкой «TO DECIDE»
   * человеку остаётся поле, поправленное ПОСЛЕ нажатия GENERATE, и строка спецификации без
   * секции (`hold`, MIN-11). Журнал план не читает вовсе: «чьё слово стоит» решает снимок нажатия.
   *
   * Снимок нажатия (`at0`) приезжает вместе с ответом из стора карточки (S-M1): ответ, дождавшийся
   * вернувшегося органа, сверяется с полями, какими они стояли, когда его заказали.
   */
  function autoFill(draft: ConstructionDraft, at0: ReadonlyMap<string, string> | null) {
    if (readOnly) return;
    const { rows: fresh } = diffProposal(draft, liveSnapshot());
    // ПОПРАВЛЕННОЕ ПОСЛЕ НАЖАТИЯ — ЕДИНСТВЕННОЕ, ЧТО НЕ ПЕРЕПИСЫВАЕТСЯ (фиксап M1). Сверка дословная:
    // любое нажатие клавиши в поле за время полёта — слово человека.
    const heldBack = (target: FillTarget) =>
      !!at0 && rawOf(target) !== (at0.get(fillIdOf(target)) ?? '');
    const { write } = autoFillPlan(fresh, heldBack);
    const at = hhmm();
    for (const row of write) {
      const target = targetOfRow(row);
      const before = target ? rawOf(target) : '';
      const done = applyRow(row);
      if (!done.ok) continue;
      remember(row, done, at, before);
    }
  }

  /* Клика «принять строку» здесь больше нет: строка ОТМЕЧАЕТСЯ (`take`), а пишет одна кнопка на
     всю очередь (`writeTaken` ниже) — тем же писателем и с той же записью журнала. */

  /**
   * ЗАПИСЬ СКАЛЯРА ДОСЛОВНО — один писатель на откат (`undo`) и на возврат (`restorePrevious`):
   * те же писатели, что у рукописной правки. Своя запись описания пере-штамповывает черновик, иначе
   * плашка «the moodboard has changed since» поднялась бы за работу самого органа.
   */
  function writeScalar(t: FillTarget, text: string) {
    if (t.kind === 'detail') {
      upsertDetailText(getValues, setValue, t.key, text);
    } else if (t.kind === 'fit') {
      setValue('fit', text as never, { shouldDirty: true });
    } else if (t.kind === 'concept') {
      setValue('concept', text, { shouldDirty: true });
      setStaged((prev) => (prev ? { ...prev, fingerprint: stampOf(text) } : prev));
    }
  }

  /**
   * ═══ «restore previous ↶» — ПРЕЖНИЕ СЛОВА ЧЕЛОВЕКА ОБРАТНО В ПОЛЕ (фиксап раунда 2, BLK-1) ════
   *
   * Черновик переписал «H» на «D», человек поправил «D» — запись больше не живая, `✕` у неё нет
   * (откат поверх правки стёр бы и правку), а «H» живёт только в её `before` — или в её ступенях,
   * если поверх правки уже легла новая запись (раунд 3, M-A). Возврат пишет «H» тем же писателем,
   * что откат, и САМ ложится в журнал (`restoreFill`): `✕` у этой строки вернёт то, что стояло, а
   * заменённая запись встанет на место (`unrestoredFill`).
   */
  function restorePrevious(offer: WordsOffer) {
    const fill = offer.fill;
    if (readOnly || busy || fitBarred(fill)) return;
    const current = rawOf(fill.target);
    writeScalar(fill.target, offer.words);
    record(techCardId, restoreFill(offer, current, hhmm()));
  }

  /**
   * ═══ ОТКАЗ ОТ ПРЕЖНИХ СЛОВ — ТИХИЙ `✕` У «restore previous ↶» (раунд 3, m6) ═════════════════
   *
   * Предложение вернуть слова стояло вечно и считалось в «written N»: снять его было нечем. Отказ
   * — один щелчок без вопроса, как у `ai ✦`: десять секунд рядом стоит `undo ↶`, который ставит
   * запись журнала ровно такой, какой она была. Отмена возможна, только пока запись та, что отказ
   * оставил (`sameFill`): прогон или `✕` за эти секунды — уже другая запись, и затирать её нельзя.
   */
  function dismissWords(offer: WordsOffer) {
    const fill = offer.fill;
    if (readOnly || busy || fitBarred(fill)) return;
    const left = withoutWords(fill, offer.words, liveSnapshot());
    if (left) put(techCardId, left);
    else forget(techCardId, fill.id);
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    setDismissedWords({ was: fill, left, label: fill.label });
    dismissTimer.current = window.setTimeout(() => setDismissedWords(null), UNDO_WINDOW_MS);
  }

  /**
   * ОТКАТ ОДНОЙ ЗАПИСИ — ВОЗВРАТ ТОГО, ЧТО СТОЯЛО, А НЕ ОЧИСТКА ПОЛЯ.
   *
   * У скаляра это `before` из журнала (пустая строка — законное «не стояло ничего»; писатель
   * аспектов сам снимет строку `details[]`, у которой не осталось ни текста, ни картинок, — и
   * картинки, добавленные человеком тем временем, переживут откат: писатель владеет ТЕКСТОМ).
   * У строки слота — удаление ПО КЛЮЧУ, фильтр над СОБСТВЕННЫМИ объектами формы: это та же
   * операция, какой строку удаляет вкладка BOM, и ни один объект модели через неё не проходит.
   */
  function undo(fill: Fill) {
    if (readOnly || fitBarred(fill)) return;
    const t = fill.target;
    if (t.kind === 'detail' || t.kind === 'fit' || t.kind === 'concept') {
      writeScalar(t, fill.before);
    } else if (t.kind === 'detailSlot') {
      // ВОЗВРАТ ЗАВЕДЁННОЙ ДЕТАЛИ — ТОТ ЖЕ ГЛАГОЛ, КОТОРЫМ ЕЁ СНОСИТ САМ ВЕРСТАК
      // (`DeleteDesignDetailSlot`), а не второй способ сделать то же самое. Слот заводился ПУСТЫМ
      // и живёт минуты, поэтому вопроса здесь нет: снести пустую деталь нечем навредить, а
      // владелец сказал «если мы захотим то удалим» — не «спроси ещё раз». Если человек успел
      // положить в неё картинку, СЕРВЕР ОТКАЗЫВАЕТ САМ (`slot_filled`: «slot N still holds a
      // plate»), и отказ приезжает снекбаром общего писателя — второй такой же проверки на
      // клиенте нет намеренно: она разошлась бы с серверной молча.
      //
      // ⚠ ЖУРНАЛ ЗАБЫВАЕТ ЗАПИСЬ ТОЛЬКО ПОСЛЕ УСПЕХА, И ЭТО ЕДИНСТВЕННОЕ МЕСТО В `undo`, ГДЕ ТАК.
      // Четыре остальных возврата — записи в форму, они не отказывают; этот уходит на сервер и
      // отказать может. Забыв запись сразу, мы стёрли бы `✕` у слота, который ОСТАЛСЯ стоять, —
      // человек увидел бы «вернул» там, где не вернулось ничего. Ранний возврат нужен и по второй
      // причине: снятие квитанций ниже относится к строкам предложения, а у слота их нет.
      //
      // ⚠ `mutateAsync` ПО ТОМУ ЖЕ ДОВОДУ, ЧТО У ЗАВЕДЕНИЯ: `undo all` зовёт этот возврат в цикле,
      // и колбэки `mutate` у второго вызова стёрли бы колбэки первого — журнал забыл бы одну
      // запись из двух, а вторую держал бы после успешного сноса.
      writes.deleteDetailSlot
        .mutateAsync(t.slotId)
        .then(() => forget(techCardId, fill.id))
        // Отказ уже сказан снекбаром общего писателя; здесь ловится сам промис.
        .catch(() => {});
      return;
    } else {
      const cur = (getValues('bomItems') ?? []) as { lineKey?: string }[];
      setValue('bomItems', cur.filter((r) => r.lineKey !== t.lineKey) as never, {
        shouldDirty: true,
      });
    }
    // `✕` ВОЗВРАТА (BLK-1) возвращает журнал к тому, что было до него: запись черновика с прежними
    // словами встаёт на место, и `restore previous ↶` снова на экране. Забыть её здесь значило бы
    // стереть прежние слова второй раз. `✕` записи, несущей слова (M-A), ставит её верхнюю ступень —
    // запись, какой она была до замены. Ставится целиком (`put`): слияние приняло бы прежнюю запись
    // за новую запись черновика.
    const back = unrestoredFill(fill);
    const popped = poppedFill(fill);
    if (back) put(techCardId, back);
    else if (popped) put(techCardId, popped);
    else forget(techCardId, fill.id);
    // Квитанция умирает вместе с записью: строка, чью запись вернули, снова РАБОТА и стоит в
    // `to decide` (макет `mood:unwrite`: «снятие квитанции»). Без этого возврат прятал бы строку
    // навсегда — ни написана, ни отклонена, ни в очереди. Строка скаляра находится по адресу; у
    // строки спецификации адреса до записи нет (`targetOfRow` — null), и её называет память
    // `writeTaken` (раунд 3, M-B): взятая и снятая строка иначе пропадала из всех списков.
    const rowIds = rows
      .filter((r) => {
        const t = targetOfRow(r);
        return !!t && fillIdOf(t) === fill.id;
      })
      .map((r) => r.id);
    const takenRow = rowByFill[fill.id];
    if (takenRow) rowIds.push(takenRow);
    if (rowIds.length) {
      setReceipts((prev) => {
        const next = { ...prev };
        for (const id of rowIds) delete next[id];
        return next;
      });
    }
    setReceiptByFill((prev) => {
      if (!(fill.id in prev)) return prev;
      const next = { ...prev };
      delete next[fill.id];
      return next;
    });
    setRowByFill((prev) => {
      if (!(fill.id in prev)) return prev;
      const next = { ...prev };
      delete next[fill.id];
      return next;
    });
  }

  /**
   * ЧЕМ ЗАВЕЛИ СЛОТ — ПО ЕГО АДРЕСУ (Fable r3-w1, NIT 10). Журнал заполнений держит ровно эту
   * пару: адрес `detailSlot:<slotId>` и `after` — имя, которым слот минтили. Больше её нигде нет:
   * на полосе лежит ТЕКУЩЕЕ имя, а переименование законно и следа за собой не оставляет.
   * Читается из `fills` (стор ключуется карточкой), поэтому знание сессионное — см. поле снимка.
   */
  const mintedBySlot = useMemo(() => {
    const by = new Map<number, string>();
    for (const f of fills) if (f.target.kind === 'detailSlot') by.set(f.target.slotId, f.after);
    return by;
  }, [fills]);
  // СРАВНЕНИЕ СЧИТАЕТСЯ НА РЕНДЕРЕ, ПРОТИВ ЖИВЫХ ЗНАЧЕНИЙ (D5). Не в `onSuccess` и не в состоянии:
  // принятая строка обязана сама стать `same`, а рукописная правка соседнего поля — сама поменять
  // «add» на «replace», без единого пере-запроса.
  const formSnapshot: FormSnapshot = useMemo(
    () => ({
      fit,
      fitChoices: fitKeys,
      concept,
      details,
      bomItems,
      // ⚠ `undefined`, А НЕ ПУСТОЙ МАССИВ, ПОКА СЕРВЕР НЕ ОТВЕТИЛ ПРО ВЕРСТАК. Разница читается в
      // `isLive`: пустой массив — утверждение «слотов нет» и гасит записи журнала, отсутствие —
      // «не знаем» и оставляет их. На бинаре без полосы у человека иначе исчезал бы `✕`.
      detailSlots: serverSpeaks
        ? benchDetails.map((s) => ({
            id: s.id ?? 0,
            name: (s.detailName ?? '').trim(),
            mintedAs: mintedBySlot.get(s.id ?? 0),
            filled: (s.pictureId ?? 0) > 0,
          }))
        : undefined,
    }),
    [fit, fitKeys, concept, details, bomItems, serverSpeaks, benchDetails, mintedBySlot],
  );
  /** Верстак ЭТОГО рендера — для дедупа в `mintSuggested`, чей колбэк живёт дольше рендера. */
  const detailSlotsRef = useRef(formSnapshot.detailSlots);
  detailSlotsRef.current = formSnapshot.detailSlots;
  const { rows, missing, details: detailIdeas } = useMemo(
    () => diffProposal(staged?.draft ?? null, formSnapshot),
    [staged, formSnapshot],
  );

  /**
   * ЖИВЫЕ ЗАПИСИ ЖУРНАЛА — ПЕРЕСЧИТЫВАЮТСЯ НА КАЖДОМ РЕНДЕРЕ, ПРОТИВ ЖИВОЙ ФОРМЫ.
   *
   * Ровно тем же законом, что и сравнение: правка человека по заполненному полю обязана САМА
   * погасить подсветку и убрать `✕`, без единого события и без флага, который кто-то забыл снять.
   */
  const live = useMemo(() => liveFills(fills, formSnapshot), [fills, formSnapshot]);
  /**
   * Что откатывает `undo all`: живые записи ЧЕРНОВИКА — возврат человека (BLK-1) не его работа, а
   * посадку без products:write (M2) этот аккаунт в поле не вернёт.
   */
  const undoable = useMemo(
    () => live.filter((f) => !f.restore && !(f.target.kind === 'fit' && !fitWritable)),
    [live, fitWritable],
  );
  /**
   * Прежние слова, которые черновик переписал, а человек поправил поверх (BLK-1), — и слова, которые
   * запись несёт после новой записи поверх правки (M-A). По строке `restore previous ↶` на каждые.
   */
  const restore = useMemo(() => restorable(fills, formSnapshot), [fills, formSnapshot]);
  const [dismissedWords, setDismissedWords] = useState<{
    was: Fill;
    left: Fill | null;
    label: string;
  } | null>(null);
  const dismissTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    },
    [],
  );
  /**
   * ОТКАЗ ОТ СЛОВ, КОТОРЫЙ ЕЩЁ МОЖНО ОТМЕНИТЬ (m6): запись до отказа и то, что он оставил. `undo ↶`
   * стоит, пока запись журнала по адресу — ровно оставленная отказом.
   */
  const undismissable =
    !!dismissedWords &&
    sameFill(fills.find((f) => f.id === dismissedWords.was.id) ?? null, dismissedWords.left);
  function undismissWords() {
    // Погашена, пока идёт операция прогона (M-08), — как возврат и отказ рядом.
    if (!dismissedWords || !undismissable || readOnly || busy) return;
    put(techCardId, dismissedWords.was);
    setDismissedWords(null);
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
  }

  /**
   * ЧТО ОСТАВЛЕНО ЧЕЛОВЕКУ — список «TO DECIDE» (фиксап раунда 2, MIN-3).
   *
   * Обязан быть ДОПОЛНЕНИЕМ написанного, иначе экран и запись разошлись бы молча. Само-заполнение
   * (`autoFillPlan`) пишет всё, что может, и записанное сразу читается `same`; всё, что НЕ `same`,
   * — предложение, которого на карточке нет: поле, поправленное (или очищенное) после нажатия,
   * описание длиннее поля, строка спецификации без секции, запись, снятая `✕` или переписанная
   * человеком позже. Прогон оплачен — ни одна такая строка не исчезает молча (`openToDecide`).
   */
  const decide = useMemo(() => openToDecide(rows), [rows]);

  // ⚠ «PROPOSED» — ЭТО ЧИСЛО ПРЕДЛОЖЕННОГО, А НЕ ЧИСЛО ОСТАВШЕГОСЯ. Строка, которую только что
  // приняли, честно уезжает в `same` (сравнение живое), и счётчик, читающий только состояние,
  // УМЕНЬШАЛСЯ БЫ на каждом клике — «12 proposed» превращалось бы в «9 proposed · 3 taken», как
  // будто модель предложила меньше, чем предложила. Поэтому строка с квитанцией считается
  // предложенной по-прежнему: она ею и была.
  const proposed = rows.filter((r) => r.state !== 'same' || receipts[r.id]).length;
  const dismissed = Object.values(receipts).filter((r) => r === 'dismissed').length;
  const open = decide.filter((r) => !receipts[r.id]);
  // ⚠ СОВЕТ — ЭТО «НОВОЕ». Без `missing.length === 0` строка «ничего нового — карточка это уже
  // говорит» вставала ПРЯМО НАД восстановленным блоком «что заслуживает булавки»: на хорошо
  // заполненной карточке все предложения возвращаются `same`, а совет модель всё равно даёт — и
  // человек читал приглашение пролистать мимо ЕДИНСТВЕННОГО, что прогон произвёл. Это регрессия
  // самого восстановления: пока блок не рисовался, условие было верным.
  /**
   * ДЕТАЛИ, КОТОРЫХ НА ВЕРСТАКЕ ЕЩЁ НЕТ (r3 п.6) — единственное, что орган предлагает ЗАВЕСТИ.
   * Уже стоящая деталь не рисуется чипом вовсе: чип, который ничего не изменит, — это кнопка,
   * притворяющаяся работой.
   */
  const openDetails = useMemo(() => detailIdeas.filter((d) => !d.onBench), [detailIdeas]);
  const nothingNew =
    rows.length > 0 &&
    proposed === 0 &&
    undoable.length === 0 &&
    missing.length === 0 &&
    // Предложенная деталь — это тоже «новое», и без неё пилюля «карточка уже это говорит» стояла
    // бы прямо над единственным, что прогон произвёл (тот же довод, что у `missing` выше).
    openDetails.length === 0;

  /* ═══ ОТМЕТКА, КОТОРАЯ НИЧЕГО НЕ ПИШЕТ (макет `_step-mood.js`: `mood:take` · `mood:mode` ·
     `mood:write`) ═══════════════════════════════════════════════════════════════════════════════
     Между «я это беру» и «в поле стоит другое» стоит ОДИН явный жест — `write N taken ▸`: строка
     сначала отмечается, а пишет одна кнопка на всю очередь. Значение отметки — РЕЖИМ записи
     (`replace` | `append`), а не `true`: режим есть свойство отметки, и вторая карта под него
     однажды разошлась бы с первой. Отметки ключуются строкой предложения и обнуляются вместе с
     ответом прогона, ровно как квитанции. Писатели при этом ТЕ ЖЕ (`applyRow`, `remember`) —
     изменился жест, не запись. */
  const [taken, setTaken] = useState<Record<string, 'replace' | 'append'>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  /**
   * СЕКЦИЯ, ВЫБРАННАЯ СТРОКЕ СПЕЦИФИКАЦИИ БЕЗ СВОЕЙ (`hold`, фиксап раунда 2, MIN-11). Ключ —
   * строка предложения, срок — ответ прогона, как у отметок: выбор про строку прошлого ответа
   * ничего не значит для нового.
   */
  const [sectionPick, setSectionPick] = useState<Record<string, string>>({});
  /**
   * ОТМЕЧЕННЫЕ ДЕТАЛИ И ЧИСЛО ЗАПИСЕЙ В ПОЛЁТЕ (r3 п.6). Та же грамматика, что у `taken`: чип
   * отмечает, пишет ОДНА кнопка внизу группы. Значение — просто `true`: у заведения слота нет
   * второго режима (нечего «приписывать»), и карта режимов здесь врала бы про выбор, которого нет.
   */
  const [wantedDetails, setWantedDetails] = useState<Record<string, boolean>>({});
  /**
   * ОДНА ОПЕРАЦИЯ «ПРОГОН → ЗАПИСЬ В ПОЛЯ → ЗАВЕДЕНИЕ СЛОТОВ» (ревью Codex M-08): пока идёт любая
   * её часть — сохранение перед прогоном, сам прогон, ответ, ждущий органа, цикл заведения, —
   * GENERATE, `undo all`, `accept all` и `✕` журнала погашены. Все части — из стора карточки
   * (`run`, S-M1): вернувшийся орган видит операцию, начатую до его смерти, поднятой.
   */
  const minting = run.minting;
  const busy = draftRunBusy(run);
  const [logOpen, setLogOpen] = useState(false);
  /** Квитанция записи по АДРЕСУ ЖУРНАЛА — пилюля `added` / `replaced` в строке WRITTEN. */
  const [receiptByFill, setReceiptByFill] = useState<Record<string, Receipt>>({});
  /**
   * СТРОКА ПРЕДЛОЖЕНИЯ, ВЗЯТАЯ В ЗАПИСЬ, — ПО АДРЕСУ ЖУРНАЛА (раунд 3, M-B). У строки спецификации
   * адреса до записи нет, и `✕` иначе не нашёл бы, чью квитанцию снять: строка оставалась
   * «взятой» и пропадала из TO DECIDE, DISMISSED и WRITTEN разом. Срок — ответ прогона, как у квитанций.
   */
  const [rowByFill, setRowByFill] = useState<Record<string, string>>({});

  /**
   * ═══ КАРТОЧКА СМЕНИЛАСЬ ПОД ЖИВЫМ ОРГАНОМ — ЭКРАН ЧЕРНОВИКА НАЧИНАЕТСЯ ЗАНОВО ═══════════════════
   *
   * ⚠ ЗДЕСЬ СТОЯЛО «`StudioTab` ПРИ ПЕРЕХОДЕ НА СОСЕДНЮЮ ТЕХ-КАРТУ НЕ РАЗМОНТИРУЕТСЯ (ИНВАРИАНТ 12)»,
   * И В ПРОДУКТЕ ЭТО НЕПРАВДА (ревью швов, S-M1). `page.tsx` ключует всю карточку адресом
   * (`TechCardStagingProvider key={id}`): другая карточка — другой монтаж формы, студии и этого
   * органа. Сам орган к тому же рисуется только на шаге MOODBOARD, а студия — только на своей
   * вкладке: смена шага, вкладки или карточки его РАЗМОНТИРУЕТ.
   *
   * Поэтому всё, что длится дольше одного рендера, — ключ идемпотентности, фаза прогона, отказ
   * сохранения, ответ в полёте, счётчик заведения слотов — живёт не здесь, а в сторе ПО КЛЮЧУ
   * КАРТОЧКИ (`useDraftRun`), и этот сброс его не трогает: ответ карточки A ждёт органа карточки A,
   * где бы человек ни был, пока вызов летел.
   *
   * СБРОС НИЖЕ — ПОЯС, А НЕ НЕСУЩАЯ СТЕНА. Он чистит только ЭКРАН — предложенные детали и их
   * отметки, отметки строк, квитанции, цену и строку прогона — на случай, когда родитель подменит
   * `techCardId` у живого органа: стенд так и делает (`probe.setCard`, сцена G в `probe-mood.mjs`),
   * и ничто не запрещает завтрашнему родителю сделать то же. Без сброса чипы деталей карточки A
   * встали бы на экран карточки B, и `addDetailSlots` завёл бы их ИМЕНАМИ A на верстаке B, а
   * «read 7 pictures · 3 notes» утверждало бы, что за прогон B заплачено. В теле рендера, а не в
   * эффекте: эффект оставил бы закоммиченный кадр, где карточка уже новая, а чипы ещё чужие.
   *
   * ЧТО НЕ СБРАСЫВАЕТСЯ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ: `logOpen` — раскрытие журнала, а журнал ключуется
   * карточкой в сторе (`useCardMemory`) и открытым показывает записи B; сам журнал, предложенные
   * колорвеи и прогон — они и живут в сторе по ключу карточки именно затем.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (staged) setStaged(null);
    if (price) setPrice(null);
    if (lastRun) setLastRun(null);
    if (inspecting) setInspecting(false);
    if (Object.keys(receipts).length) setReceipts({});
    if (Object.keys(taken).length) setTaken({});
    if (Object.keys(shown).length) setShown({});
    if (Object.keys(sectionPick).length) setSectionPick({});
    if (Object.keys(wantedDetails).length) setWantedDetails({});
    if (Object.keys(receiptByFill).length) setReceiptByFill({});
    if (Object.keys(rowByFill).length) setRowByFill({});
    // Отказ от слов карточки A не отменяется на карточке B (запись журнала — чужая).
    if (dismissedWords) setDismissedWords(null);
  }
  /** Орган, который спросил, всё ещё на экране и всё ещё про эту карточку. */
  const onScreen = (card: number) => mounted.current && shownCard.current === card;

  /**
   * ═══ ОТВЕТ ПРИМЕНЯЕТ ОРГАН СВОЕЙ КАРТОЧКИ — СЕЙЧАС ИЛИ КОГДА ВЕРНЁТСЯ (S-M1) ═════════════════
   *
   * `askForDraft` кладёт ответ в стор карточки и больше его не трогает; этот эффект забирает его
   * ОДИН раз (`takeParked` — второй эффект и второй орган получат `null`) и применяет тем, что есть
   * у органа на экране: ответ, дождавшийся возврата со смены шага, ложится так же, как пришедший
   * при человеке. Функция — через ref: эффект зовёт писателей ЭТОГО рендера.
   */
  const parked = run.parked;
  const applyRef = useRef(applyParked);
  applyRef.current = applyParked;
  useEffect(() => {
    if (!parked) return;
    const got = takeParked(techCardId);
    if (got) applyRef.current(got);
  }, [parked, techCardId, takeParked]);

  function applyParked(p: ParkedDraft) {
    if (p.kind === 'refusal') {
      // Отказ, дождавшийся возвращения, говорится с именем: без него строка сервера на экране,
      // где человек ничего не нажимал, не сказала бы, о чём она.
      showMessage(p.away ? `the draft did not come back — ${p.words}` : p.words, 'error');
      return;
    }
    setPrice(runPrice(p.run ?? undefined));
    setLastRun(p.run);
    if (!p.draft) {
      // ПУСТОЙ ОТВЕТ — НЕ ЧЕРНОВИК. Строка в реестре есть, деньги списаны, а предлагать нечего:
      // сказать это прямо честнее, чем нарисовать пустую рамку «черновика».
      showMessage('the run came back with nothing to propose', 'error');
      return;
    }
    const draft = p.draft;
    setStaged({
      draft,
      readPictures: p.read.pictures,
      readNotes: p.read.notes,
      time: p.time,
      fingerprint: p.read.fingerprint,
    });
    // ВТОРОЙ ПРОГОН ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЕ, А КВИТАНЦИИ ОБНУЛЯЮТСЯ (D5): они говорят про строки
    // прошлого ответа, и оставленные — обещали бы, что уже принято то, чего в новом предложении
    // может не быть вовсе. Принятое при этом никуда не делось — оно на карточке, и новое сравнение
    // покажет его как `same`.
    setReceipts({});
    setRowByFill({});
    // Отметки, раскрытия и выбранные секции строк — тоже про строки прошлого ответа.
    setTaken({});
    setShown({});
    setSectionPick({});
    setWantedDetails({});
    // Колорвеи — ПРЕДЛОЖЕНИЕ, и они ждут клика: подтверждение создаёт продукт (B-25).
    setProposals(techCardId, proposedColourways(draft));
    // ПИШЕТСЯ ТОЛЬКО КАРТОЧКА, КОТОРАЯ ПИШЕТСЯ СЕЙЧАС. Утверждение, пришедшее, пока вызов летел или
    // ответ ждал органа, замораживает её; форма узнаёт об этом раньше, чем проп студии, и
    // спрашивается напрямую. Предложение при этом стоит на экране — читать его не запрещено.
    if (readOnly || getValues('approvalState') === RELEASED) return;
    // …поля карточки заполняются САМИ — все предложенные, кроме поправленных после нажатия
    // (B-14, фиксап M1)…
    autoFill(draft, p.pressed);
    // …и уезжают на сервер, не дожидаясь дебаунса (D-07): записанное черновиком — такая же правка
    // карточки, как набранная рукой.
    autosave.request('draft');
    // …а предложенные детали заводятся слотами FLAT SLOTS сразу (D-09, T14) — тем же писателем,
    // что `add N detail slots ▸`, одной отслеживаемой операцией с прогоном.
    void mintSuggested(draft);
  }

  /**
   * ═══ ОТКАЗ СОХРАНЕНИЯ — СТОЙКОЙ СТРОКОЙ, А НЕ СЕКУНДАМИ СНЕКБАРА (S-M1, образец `flat-run-row`) ═
   *
   * В сторе лежит ИСХОД, фраза собирается здесь: число полей — то, что автосейв говорит СЕЙЧАС, а
   * не на щелчке, когда провал ещё не был известен. Снимается сама, как только карточка
   * сохранилась: поправленное поле и есть ответ на отказ. Карточка, которая больше не сохраняется
   * (утверждена, только для чтения, автосейв выключен), не сохранится и дальше — строка «до
   * следующего сохранения» стояла бы вечно, а почему GENERATE молчит, говорит сама дверь.
   */
  const refused = run.refused;
  useEffect(() => {
    if (autosave.status !== 'saved' && autosave.status !== 'idle') return;
    if (readDraftRun(techCardId).refused !== null) patchRun(techCardId, { refused: null });
  }, [autosave.status, techCardId, patchRun]);
  const saveless = readOnly || autosave.status === 'off';
  useEffect(() => {
    if (saveless && refused !== null) patchRun(techCardId, { refused: null });
  }, [saveless, refused, techCardId, patchRun]);
  const refusedSentence =
    saveless || !refused
      ? null
      : refused === 'released'
        ? 'the card was released while it was being saved'
        : refused === 'stopped'
          ? 'the card stopped saving while GENERATE waited for it'
          : flushRefusalSentence(refused, autosave.errorsCount) || 'save the card first';
  /**
   * ДВЕРЬ У ОТКАЗА СОХРАНЕНИЯ: `invalid` — к первому полю с ошибкой (`revealField` сам приносит
   * шаг студии), прочие исходы и поле, которого студия не рисует, — к чипу сохранения в шапке: он и
   * есть дверь этих состояний (повторить, подтвердить, решить конфликт).
   */
  async function openSaveDoor() {
    if (refused === 'invalid') {
      await trigger();
      const first = flattenFieldErrors(control._formState.errors)[0];
      if (first && revealField(first.path)) return;
    }
    const chip = document.querySelector<HTMLElement>('[data-save-status]');
    if (!chip) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    chip.scrollIntoView({ behavior: 'smooth', block: 'center' });
    chip.querySelector<HTMLElement>('[aria-haspopup]')?.click();
  }

  /* ДОСКА УШЛА ВПЕРЁД — ОДИН ФЛАГ НА ТРИ БЛОКА ВЫХОДА. Считается здесь (`stale`), показывается там
     (`BoardMovedPill` в GENERAL INFORMATION, CONSTRUCTION, MATERIAL SLOTS). Через стор, а не
     контекст: те блоки стоят соседями в стопке STUDIO, а не детьми этого органа. */
  const setBoardMoved = useDraftMemory((st) => st.setBoardMoved);
  useEffect(() => {
    setBoardMoved(techCardId, stale);
  }, [techCardId, stale, setBoardMoved]);

  /**
   * ЗАПИСЬ «ПРИПИСАТЬ»: слова карточки остаются, черновик встаёт после них — режим отметки там,
   * где черновик ПРОДОЛЖАЕТ текст (`draftSays().mode === 'add'`). Только у текстовых скаляров:
   * `fit` словарный, у строки BOM режима нет вовсе (список только добавляет). Читается
   * `getValues`, а не снимок рендера, — по тому же доводу, что у всех писателей этого файла.
   */
  function appendRow(row: ProposalRow): { ok: boolean; value: string } {
    if (readOnly) return { ok: false, value: '' };
    const w = row.write;
    if (w.kind === 'detail') {
      const cur =
        ((getValues('details') ?? []) as { key?: string; text?: string }[]).find(
          (d) => d.key === w.key,
        )?.text ?? '';
      // Только хвост, который черновик добавил к словам карточки (`appendedText`).
      const joined = appendedText(cur, w.text);
      upsertDetailText(getValues, setValue, w.key, joined);
      return { ok: true, value: joined };
    }
    if (w.kind === 'concept') {
      const joined = appendedText((getValues('concept') ?? '') as string, w.text);
      if (joined.length > conceptMax) {
        showMessage(
          `this does not fit — the description holds ${conceptMax} characters and with the draft appended it would be ${joined.length}`,
          'error',
        );
        return { ok: false, value: '' };
      }
      setValue('concept', joined, { shouldDirty: true });
      setStaged((prev) => (prev ? { ...prev, fingerprint: stampOf(joined) } : prev));
      return { ok: true, value: joined };
    }
    return { ok: false, value: '' };
  }

  /** ЗАПИСЬ — ОДНА НА ВСЮ ОЧЕРЕДЬ: ровно отмеченное, каждой строке своим режимом. */
  function writeTaken() {
    const rows = open.filter((r) => taken[r.id]);
    if (!rows.length || readOnly) return;
    const at = hhmm();
    for (const row of rows) {
      const mode = taken[row.id];
      // Строка без секции пишется только с выбранной (MIN-11); `take` без неё погашен, это страховка.
      const picked = row.hold === 'section' ? sectionPick[row.id] : undefined;
      if (row.hold === 'section' && !picked) continue;
      const target = targetOfRow(row);
      const before = target ? rawOf(target) : '';
      const done = mode === 'append' ? appendRow(row) : applyRow(row, picked);
      if (!done.ok) continue;
      const fillId = remember(row, done, at, before);
      const receipt: Receipt = mode === 'append' || row.state !== 'replace' ? 'added' : 'replaced';
      setReceipts((prev) => ({ ...prev, [row.id]: receipt }));
      if (fillId) {
        setReceiptByFill((prev) => ({ ...prev, [fillId]: receipt }));
        // Чья это запись — для `✕` (M-B): у строки спецификации адрес рождается только здесь.
        setRowByFill((prev) => ({ ...prev, [fillId]: row.id }));
      }
    }
    setTaken({});
    // Записанное уезжает под раскрытие — раскрытие ОТКРЫВАЕТСЯ, иначе жест выглядит исчезновением
    // строк, а квитанции не видно нигде.
    setLogOpen(true);
    // Взятое из очереди — правка карточки, и она уезжает на сервер, не дожидаясь дебаунса (D-07).
    autosave.request('draft');
  }

  /**
   * ЗАВЕДЕНИЕ ОТМЕЧЕННЫХ ДЕТАЛЕЙ НА ФЛЭТ-ВЕРСТАКЕ (r3 п.6) — ОДНА КНОПКА НА ВСЮ ГРУППУ.
   *
   * ⚠ ЭТО ЗАПИСЬ НА СЕРВЕР, И КАЖДАЯ ЕЁ ЧАСТЬ — СЛОВО КОНТРАКТА, А НЕ ВКУС (инвариант 4):
   *   · `viewKey: 'detail'` — ЕДИНСТВЕННОЕ написание минта; `slotId` НЕ ДОПИСЫВАЕТСЯ ВОВСЕ
   *     (адрес — oneof, дописанный ноль = отказ всей записи);
   *   · `kind: 'flat'` спеллится, а не опускается: род — вторая половина адреса, и писатель,
   *     который его не называет, полагается на умолчание колонки вместо того, чтобы сказать, что
   *     имел в виду;
   *   · `colorwayId: 0` — у флэта колорвейной оси нет, положительный получает `colorway_forbidden`;
   *   · `expectedSlotRev: 0` — строки ещё нет, и сервер отвергает любое другое число;
   *   · `pictureId: 0` — СЛОТ РОЖДАЕТСЯ ПУСТЫМ. Ровно то, о чём просил владелец: на FLAT SLOTS
   *     видно, какие крупные планы стоит снять, а картинку человек положит сам.
   *
   * ⚠ КАЖДАЯ ДЕТАЛЬ — СВОЯ ЗАПИСЬ И СВОЙ ИСХОД. Пачки на проводе нет, и делать вид, что она есть
   * (один снекбар на N), значило бы прятать отказ по одной строке за успехом остальных: имя,
   * которое сервер не принял, обязано остаться отмеченным, а принятые — уйти в журнал.
   *
   * ⚠ `mutateAsync`, А НЕ `mutate` С КОЛБЭКАМИ, И ЭТО ЗАМЕРЕННЫЙ ДЕФЕКТ, А НЕ ВКУС.
   * `useMutation` — ОДИН обсервер, и у него ОДИН `currentMutation`. Второй `mutate` подряд
   * ЗАМЕЩАЕТ первый: колбэки вызова, который замещён, не срабатывают ВООБЩЕ. Первая редакция
   * этого органа так и была написана — цикл из `mutate(..., { onSuccess })`, — и стенд поймал
   * ровно это: два слота на сервере завелись ОБА, а в журнал легла ОДНА запись, то есть у второго
   * слота не было ни строки, ни `✕`. Промис `mutateAsync` привязан к СВОЕЙ строке мутации, поэтому
   * ответ приходит тому вызову, который его и заказывал. Последовательно (`await` в цикле), а не
   * пачкой: очередь из двух-трёх записей мгновенна, зато отказ на второй не гонится с третьей.
   */
  /**
   * ОДИН ЦИКЛ ЗАВЕДЕНИЯ НА ДВЕ ДВЕРИ — авто после прогона (`mintSuggested`, D-09) и ручную
   * (`add N detail slots ▸` для тех, что не завелись). Возвращает имена, которые сервер НЕ принял.
   *
   * ⚠ ОДНА ОТСЛЕЖИВАЕМАЯ ОПЕРАЦИЯ (ревью Codex M-08). Счётчик `minting` поднимается ОДИН раз на
   * весь цикл и опускается в `finally` после последней записи: пока он поднят, погашены GENERATE,
   * `undo all`, `accept all` и `✕` журнала. Иначе `undo all`, нажатый посреди цикла, снёс бы уже
   * заведённые слоты, а следующая запись завела бы новый — поверх отката. Каждый заведённый слот
   * ложится в журнал СРАЗУ, со своим серверным id, — то есть ДО того, как откат снова доступен.
   * Счётчик — в сторе карточки (S-M1): орган, вернувшийся посреди цикла, видит его поднятым.
   *
   * ⚠ КАРТОЧКА, КОТОРАЯ ЗАКАЗАЛА, — И НИКАКАЯ ДРУГАЯ. Писатель `writes` и журнал адресованы
   * карточке, заказавшей цикл (`asked`), поэтому уход органа с экрана (смена шага, вкладки,
   * карточки) цикл не рвёт: имена, названные ответом про ЭТУ карточку, заводятся на ЕЁ верстаке.
   * Рвёт его подмена `techCardId` у живого органа (стенд): отметки органа тогда уже про другую.
   *
   * Идемпотентного ключа у `SetDesignBenchSlot` нет (в контракте только CAS `expected_slot_rev`,
   * а у минта он 0), поэтому от двойного заведения стережёт сам счётчик: пока цикл идёт, ни
   * GENERATE, ни ручная кнопка не нажимаются, а дедуп по имени (`onBench`) видит свежий верстак.
   */
  async function mintDetailSlots(ideas: DetailSuggestion[]): Promise<MintFailure[]> {
    if (readOnly || !serverSpeaks || !ideas.length) return [];
    const asked = techCardId;
    const at = hhmm();
    const failed: MintFailure[] = [];
    let minted = 0;
    bumpMinting(asked, 1);
    try {
      for (const idea of ideas) {
        if (shownCard.current !== asked) break;
        try {
          // ОТКАЗ ГОВОРИТ ЭТОТ ОРГАН, ОДНОЙ ФРАЗОЙ НА ЦИКЛ (фиксап M4): общий хвост писателя молчит
          // (`silent` — `SilentWrite` в `use-design-band.ts`), иначе на каждый отказ звучало бы два
          // снекбара — его и наш. Поле читает хвост `useDesignWrites`, в запрос оно не едет.
          const res = await writes.setBenchSlot.mutateAsync({
            slot: { viewKey: 'detail', kind: 'flat', colorwayId: 0 },
            pictureId: 0,
            expectedSlotRev: 0,
            newDetailName: idea.name,
            silent: true,
          });
          const slotId = res.slot?.id ?? 0;
          // ⚠ БЕЗ id ЗАПИСИ В ЖУРНАЛ НЕТ. Строка журнала — это обещание вернуть как было, а вернуть
          // слот, адреса которого мы не знаем, нечем: `✕` печатался бы кнопкой, которая не может
          // сработать. Слот при этом заведён, и он виден там, где живёт.
          //
          // Запись идёт в журнал ЗАПРОСИВШЕЙ карточки (`asked`), даже если на экране уже другая:
          // слот заведён там, и откат его принадлежит ей.
          if (slotId > 0) {
            record(asked, {
              id: fillIdOf({ kind: 'detailSlot', slotId }),
              target: { kind: 'detailSlot', slotId },
              label: 'detail slot',
              before: '',
              after: idea.name,
              at,
            });
            minted += 1;
          }
          // Ответ пришёл, пока на экране сменилась карточка: состояние органа — уже чужое.
          if (shownCard.current !== asked) break;
          // Отметка снимается ТОЛЬКО у той, что прошла: неудачная остаётся отмеченной, и следующее
          // нажатие пробует ровно её.
          setWantedDetails((prev) => {
            if (!(idea.id in prev)) return prev;
            const next = { ...prev };
            delete next[idea.id];
            return next;
          });
        } catch (error) {
          if (shownCard.current !== asked) break;
          // Имя и причина запоминаются; после цикла звучит ОДНА фраза — что не завелось и почему.
          // 409 говорит ПРЕФИКСОМ ОБЩЕГО ПИСАТЕЛЯ (фиксап раунда 2, MIN-9): `silent` снимает его
          // снекбар, но не его слова — «кто-то успел раньше» и «сервер отказал» разные новости.
          const message = (error as Error | null)?.message || 'the change did not go through';
          failed.push({
            name: idea.name,
            reason: isAborted(error) ? `someone changed this first — ${message}` : message,
          });
        }
      }
      // ОПЕРАЦИЯ ДЕРЖИТСЯ ДО ПЕРЕЧИТАННОЙ ПОЛОСЫ (ревью Codex, P1). Писатель верстака только
      // помечает полосу устаревшей и не ждёт её; журнал же считает слот живым по ПРОЧИТАННОЙ полосе.
      // Отпусти мы `minting` раньше — в окне до перечитывания `undo all` не видел бы только что
      // заведённых слотов, а `accept all` не считал бы их.
      if (minted > 0 && shownCard.current === asked) {
        await queryClient.invalidateQueries({ queryKey: designKeys.band(asked) }).catch(() => {});
      }
    } finally {
      bumpMinting(asked, -1);
    }
    // Снекбар «could not add …» говорит о ПОКАЗАННОЙ карточке — про чужую он соврал бы.
    return shownCard.current === asked ? failed : [];
  }

  /**
   * ═══ ДЕТАЛИ ЗАВОДЯТСЯ САМИ — СРАЗУ ПОСЛЕ ПРОГОНА (волна 25.09, D-09 / T14) ═══════════════════
   *
   * Владелец: черновик предлагает детали для FLAT SLOTS — и пусть они там сразу стоят. Список тот
   * же, что под «details for flat» (`diffProposal(...).details`), минус уже стоящие на верстаке:
   * дедуп по имени и по имени МИНТА (переименованный слот не воскрешает своё имя). Считается от
   * СВЕЖЕГО верстака (`detailSlotsRef`), а не от снимка рендера, в котором пришёл ответ.
   *
   * Не завелось — снекбар «could not add …», а чип остаётся в группе ОТМЕЧЕННЫМ, с живой ручной
   * кнопкой: повтор — один клик, без поиска, что именно отпало.
   */
  async function mintSuggested(draft: ConstructionDraft) {
    if (readOnly || !serverSpeaks) return;
    const ideas = diffProposal(draft, {
      ...liveSnapshot(),
      detailSlots: detailSlotsRef.current,
    }).details.filter((d) => !d.onBench);
    if (!ideas.length) return;
    const failed = await mintDetailSlots(ideas);
    if (!failed.length) return;
    const lost = new Set(failed.map((f) => f.name));
    setWantedDetails((prev) => {
      const next = { ...prev };
      for (const idea of ideas) if (lost.has(idea.name)) next[idea.id] = true;
      return next;
    });
    showMessage(couldNotAdd(failed), 'error');
  }

  /** Ручная дверь — только для того, что не завелось само (или завелось и было снесено). */
  async function addDetailSlots() {
    const picked = openDetails.filter((d) => wantedDetails[d.id]);
    if (!picked.length || busy) return;
    // Раскрытие журнала открывается СРАЗУ: первая же запись уедет туда, и открывать его после
    // ответа значило бы дёрнуть страницу под рукой человека.
    setLogOpen(true);
    const failed = await mintDetailSlots(picked);
    if (failed.length) showMessage(couldNotAdd(failed), 'error');
  }

  /** «keep mine» — отклонить навсегда: строка уходит из TO DECIDE в DISMISSED, с дверью обратно. */
  function keepMine(row: ProposalRow) {
    setTaken((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    setReceipts((prev) => ({ ...prev, [row.id]: 'dismissed' as Receipt }));
    setLogOpen(true);
  }
  function putBack(row: ProposalRow) {
    setReceipts((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  }

  const kept = decide.filter((r) => receipts[r.id] === 'dismissed');
  const takenRows = open.filter((r) => taken[r.id]);
  // Считается ПО ЖИВОМУ СПИСКУ, а не по числу ключей в карте отметок: имя, которое уже уехало на
  // верстак (или пришло `onBench` со следующим прогоном), обязано перестать считаться выбранным,
  // иначе кнопка обещала бы завести слот, которого в списке больше нет.
  const wantedDetailCount = openDetails.filter((d) => wantedDetails[d.id]).length;
  const hasAnswer = !!staged && run.phase !== 'asking';
  // Журнал живёт в сторе дольше ответа: раскрытие рисуется и без прогона, пока есть что вернуть, —
  // и пока стоит `undo ↶` отказа от слов (m6): отказ от последних слов не уносит с экрана свою отмену.
  const showLog = hasAnswer || live.length > 0 || restore.length > 0 || undismissable;
  /** Строки группы WRITTEN: записи с `✕` и прежние слова с `restore previous ↶` (BLK-1, M-A). */
  const writtenCount = live.length + restore.length;

  /* СТАТУС В ШАПКЕ БЛОКА — только там, где заменить его нечем: прогона не было или он в полёте.
     Прогон есть → шапка пуста, а «прогон был» стоит словами в ряду (`read N pictures · …`). */
  const status =
    run.phase !== null ? (
      <Pill tone='attention' data-c19-draft-status='flight'>
        starting…
      </Pill>
    ) : minting > 0 ? (
      <Pill tone='attention' data-c19-draft-status='minting'>
        adding detail slots…
      </Pill>
    ) : staged ? null : (
      <Pill tone='mut' data-c19-draft-status='fresh'>
        not run yet
      </Pill>
    );

  /* ═══ `accept all N ▸` — ЕДИНСТВЕННАЯ НОВАЯ КНОПКА ВОЛНЫ В ЭТОМ БЛОКЕ (D-07, Q-03) ═════════════
     Принять = «я это видел»: значения уже на карточке (автосейв), кнопка лишь снимает синие рамки
     и пилюли `drafted` — с полей, строк спецификации и слотов верстака разом. Откат не отнимается:
     `undo all` по-прежнему вернёт то, что стояло до черновика. Кнопки нет, пока нечего принимать;
     пока идёт операция прогона — погашена (M-08). Стоит в шапке блока: это ответ на весь прогон,
     а не на одну группу под линейкой. */
  const acceptAll =
    drafted.count > 0 ? (
      <Button
        type='button'
        variant='main'
        size='sm'
        disabled={busy || readOnly}
        onClick={() => drafted.acceptAll()}
        data-c19-accept-all={drafted.count}
        title='marks the drafted fields as reviewed — the values are already saved'
      >
        accept all {drafted.count} ▸
      </Button>
    ) : null;

  /* ЧТО ПРОЧИТАЛ ПРОГОН — В ТОТ ЖЕ РЯД, ЧТО И КНОПКА (`trailing` общего `GenerateRow`). Два ряда
     читались как два органа, хотя это одно: что я запускаю и на чём. */
  const runState = hasAnswer && staged ? (
    <>
      <Text size='micro' variant='label' component='span' data-c19-draft-head=''>
        read {staged.readPictures} picture{staged.readPictures === 1 ? '' : 's'} ·{' '}
        {staged.readNotes} note{staged.readNotes === 1 ? '' : 's'} · {staged.time}
      </Text>
      {stale && (
        <Pill tone='attention' data-c19-draft-stale=''>
          the moodboard has changed since
        </Pill>
      )}
      {nothingNew && (
        <Pill tone='mut' data-c19-draft-nothing-new=''>
          nothing new · the card already says all of this
        </Pill>
      )}
      {price && (
        <Text size='micro' variant='label' component='span' data-c19-draft-price=''>
          {price}
        </Text>
      )}
    </>
  ) : null;

  return (
    /* СВОЙ БЛОК, А НЕ ПОДСТРУКТУРА ДОСКИ. Слова человека (DESCRIPTION) и ответ машины — разные
       вещи, и держать их в одной рамке значит объявить их одним; между блоками грунт, и это самый
       сильный разделитель системы. `#mb-draft` — адрес черновика для дверей соседей. */
    <Section
      id='mb-draft'
      title='construction draft'
      question='— what the model proposes'
      action={
        status || acceptAll ? (
          <span className='flex items-center gap-2'>
            {status}
            {acceptAll}
          </span>
        ) : null
      }
      /* ЗАЗОР «ШАПКА БЛОКА → СОДЕРЖИМОЕ» — ТЕМ ЖЕ ТОКЕНОМ, ЧТО У CARD DETAILS (r3 п.3/15/34/38).
         Владелец: «больший отступ от хединга вниз к содержимому, как в CARD DETAILS». ЗАМЕРЕНО, а
         не выведено: без него шов здесь был 10px против 20px эталона — `mb-2.5` шапки и `mt` от
         `space-y-stack` СХЛОПЫВАЮТСЯ (соседние маржины в обычном потоке), и десять из десяти
         оставалось десятью. `GROUP_SEAM` снимает `mb` у шапки и ставит `mt-5` следующему ребёнку,
         поэтому схлопываться больше нечему. Своего размера здесь нет ни одного. */
      className={GROUP_SEAM}
    >
      <div data-c19-draft=''>
        {/* ВОРОТА — ВИДИМОЙ ПОЛОСОЙ, а не только `title` погашенной двери: причина никогда не живёт
            в подсказке по наведению. Дверь `+ picture ›` — только у пустой доски: у «сохрани
            карточку» двери здесь нет, сохранение — действие страницы.
            Только на карточке, которую можно писать: у замороженной и у чужой для этого аккаунта
            говорит сама дверь (`GenerateRow`, «read-only for you»), а «save the card first»
            предлагало бы зрителю то, чего он сделать не вправе (ревью швов, S-m2). */}
        {!gate.ok && !readOnly && (
          <LockedBar
            reason={gate.reason}
            className='mb-2'
            data-c19-draft-gate=''
            door={
              // ПО ДВЕРИ НА КАЖДУЮ НЕДОСТАЮЩУЮ ЧАСТЬ (фиксап B1): картинка — на доску, слова — в
              // DESCRIPTION, категория — в CARD DETAILS. Подписи — те же, что под рельсом.
              minimum.ok
                ? undefined
                : minimum.doors.map((d) => (
                    <Button
                      key={d.field}
                      type='button'
                      variant='secondary'
                      size='xs'
                      onClick={() => openGateDoor(d)}
                      data-c19-draft-door={d.field}
                      data-c19-draft-to-card={d.field === 'category' ? '' : undefined}
                      data-c19-draft-to-board={d.field === 'board' ? '' : undefined}
                    >
                      {d.label}
                    </Button>
                  ))
            }
          />
        )}
        {/* СОХРАНЕНИЕ НЕ ПРОШЛО — ПРОГОН НЕ ЗАКАЗАН (S-M1). Стойкая строка до следующего сохранения:
            исправление («поправь поле») — не новое нажатие, и всплывашка ушла бы раньше. Утверждённой
            карточке чинить нечего — двери нет. */}
        {refusedSentence && (
          <LockedBar
            reason={`${refusedSentence} — nothing was started, nothing was charged`}
            className='mb-2'
            data-c19-draft-refused={refused ?? ''}
            door={
              refused === 'released' ? undefined : (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  onClick={() => void openSaveDoor()}
                  data-c19-draft-save-door={refused ?? ''}
                >
                  {refused === 'invalid' ? 'first error ›' : 'saving ›'}
                </Button>
              )
            }
          />
        )}
        {/* ОДНА ДВЕРЬ НА ВСЕ ЭКРАНЫ — общий `GenerateRow`: `GENERATE`, дверь описи, строка про
            деньги. Состояние прогона вшито в её ряд по шву `trailing`. */}
        <GenerateRow
          gate={
            minting > 0
              ? { ok: false, reason: 'the detail slots the draft named are being added — a moment' }
              : gate
          }
          label='GENERATE'
          pending={run.phase !== null}
          disabled={readOnly}
          onGenerate={() => void askForDraft()}
          shape={`${pictureCount} picture${pictureCount === 1 ? '' : 's'} · ${boardNotes.length} note${
            boardNotes.length === 1 ? '' : 's'
          }`}
          onInspect={() => setInspecting(true)}
          trailing={runState}
        />
        <DraftInventoryModal
          open={inspecting}
          onOpenChange={setInspecting}
          lastRun={lastRun}
          items={items}
          callouts={callouts}
          concept={concept}
          fit={fit}
          category={categoryName}
          gender={genderLabel}
          sizeRun={sizeRun}
          aspects={details}
          bomItems={bomItems}
          boardDirty={boardDirty}
        />

        {/* САМАЯ ТЯЖЁЛАЯ ЛИНЕЙКА БЛОКА. Дверь прогона и ответ прогона — разные вещи, и внутри одной
            рамки их развести нечем, кроме веса: 2px ink — вес заголовка блока. Под ней начинается
            другой документ: ОЧЕРЕДЬ РАЗБОРА, на виду только работа (`to decide`), история под одним
            раскрытием с числами в подписи.

            ЧЕТЫРЁХ ГРУПП ПРИНЯТЫХ СТРОК ЗДЕСЬ НЕТ (B-14): написанное видно ТАМ, ГДЕ ОНО ЖИВЁТ, — в
            поле, с пилюлей `drafted` у подписи и записью в журнале. Остаётся ровно то, чего орган
            НЕ написал: спор со словами человека. */}
        {hasAnswer && (
          <div className='mt-3 border-t-2 border-textColor pt-3' data-c19-draft-cut=''>
            <GroupLabel flush className={GROUP_GAP} action={<Counter n={open.length} noun='line' />}>
              to decide
            </GroupLabel>
            {open.length > 0 ? (
              <div data-c19-draft-group='decide'>
                {open.map((row) => (
                  <DecideRow
                    key={row.id}
                    row={row}
                    mark={taken[row.id] ?? ''}
                    shown={!!shown[row.id]}
                    readOnly={readOnly}
                    barred={row.write.kind === 'fit' ? fitBarNote : undefined}
                    section={sectionPick[row.id]}
                    onSection={(value) => setSectionPick((prev) => ({ ...prev, [row.id]: value }))}
                    onTake={() =>
                      setTaken((prev) => {
                        const next = { ...prev };
                        if (next[row.id]) delete next[row.id];
                        else next[row.id] = 'replace';
                        return next;
                      })
                    }
                    onMode={() =>
                      setTaken((prev) => ({
                        ...prev,
                        [row.id]: prev[row.id] === 'append' ? 'replace' : 'append',
                      }))
                    }
                    onShow={() => setShown((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                    onKeep={() => keepMine(row)}
                  />
                ))}
                {/* ОДНА ЗАПИСЬ ВМЕСТО ШЕСТИ. Погашена ровно тогда, когда писать нечего, и причина
                    стоит ВИДИМОЙ полосой. Вопроса об объёме НЕТ намеренно: запись обратима
                    поштучно (`✕` в журнале) и целиком (`undo all`), а ядровый вопрос печатает
                    «there is no undo» — для этой записи это ложь. */}
                {takenRows.length === 0 && (
                  <LockedBar
                    reason='nothing is taken yet · mark a line with take'
                    className='mt-1.5'
                    data-c19-draft-write-lock=''
                  />
                )}
                <div className='mb-3 mt-2 flex justify-end'>
                  <Button
                    type='button'
                    variant='main'
                    size='sm'
                    disabled={takenRows.length === 0 || readOnly}
                    onClick={writeTaken}
                    data-c19-draft-write={takenRows.length}
                    aria-label={`write ${takenRows.length} taken line${
                      takenRows.length === 1 ? '' : 's'
                    } into the card`}
                  >
                    write {takenRows.length} taken ▸
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState className='py-1'>
                <span className='uppercase text-textColor'>nothing to decide</span> · the draft did
                not argue with a single written field
              </EmptyState>
            )}

            {/* ═══ ДЕТАЛИ ДЛЯ FLAT SLOTS (r3 п.6) ═══════════════════════════════════════════════
                Владелец: «CONSTRUCTION DRAFT должен ТАКЖЕ предлагать DETAILS для FLAT SLOTS, чтобы
                на STEP 2 FLAT было видно, какие потенциальные детали стоит показать на тех-карте».

                ⚠ ОДИН ЖЕСТ И ОДНА КНОПКА, А НЕ ПО ДВЕ НА ИМЯ. Владелец в этом же круге: «не пихай
                кучу кнопок в одном месте, не делай разные кнопки для одного и того же». Поэтому
                грамматика взята у соседней очереди, а не придумана вторая: чип ОТМЕЧАЕТ, пишет одна
                кнопка внизу группы — ровно как `take` и `write N taken ▸` над ней. Отдельного
                «dismiss» у имени НЕТ намеренно: неотмеченное и есть оставленное (тот же довод, что
                у `DecideRow`), а второй орган на каждый чип и был бы той самой кучей кнопок.

                ⚠ ГРУППА СТОИТ ВНУТРИ РАЗДЕЛА `to decide`, А НЕ СВОИМ БЛОКОМ. Это тоже работа, ждущая
                решения, и второй блок под тем же заголовком объявил бы черновик двумя органами.

                ⚠ ЧТО ГОВОРИТ ПОДПИСЬ — ЭТО ПРОВЕРЯЕМАЯ ПРАВДА, А НЕ ОБОРОТ РЕЧИ. Сервер отдельного
                списка деталей НЕ ДАЁТ (см. `DetailSuggestion` в модели), и имена здесь — это
                НАЗВАННЫЕ МОДЕЛЬЮ АСПЕКТЫ, то есть узлы, которые она увидела на картинках. Строка
                «the aspects the draft named» именно это и произносит: обещать «модель выбрала, что
                снять крупным планом» было бы обещанием чужого решения. */}
            {serverSpeaks && detailIdeas.length > 0 && (
              <div className='mt-5' data-c19-draft-details={detailIdeas.length}>
                <GroupLabel
                  flush
                  className={GROUP_GAP}
                  action={<Counter n={openDetails.length} noun='detail' />}
                >
                  details for flat
                </GroupLabel>
                {openDetails.length > 0 ? (
                  <>
                    {/* С ВОЛНЫ 25.09 (D-09) ДЕТАЛИ ЗАВОДЯТСЯ САМИ, сразу после прогона; чип здесь
                        стоит только у того, чего на верстаке НЕТ — не завелось (отмечено, кнопка
                        живая) или было снесено. Подпись говорит ровно это. */}
                    <Text size='micro' variant='label' component='p' className='mb-2.5'>
                      the aspects the draft named that are not on FLAT SLOTS · each becomes an empty
                      named slot under DETAILS, ready for its close-up
                    </Text>
                    <ChipRow>
                      {openDetails.map((idea) => (
                        <Chip
                          key={idea.id}
                          disabled={readOnly || minting > 0}
                          selected={!!wantedDetails[idea.id]}
                          pressed={!!wantedDetails[idea.id]}
                          onClick={() =>
                            setWantedDetails((prev) => {
                              const next = { ...prev };
                              if (next[idea.id]) delete next[idea.id];
                              else next[idea.id] = true;
                              return next;
                            })
                          }
                          data-c19-draft-detail={idea.id}
                          title={idea.why}
                        >
                          {idea.name}
                        </Chip>
                      ))}
                    </ChipRow>
                    <div className='mb-3 mt-2.5 flex justify-end'>
                      <Button
                        type='button'
                        variant='main'
                        size='sm'
                        disabled={readOnly || minting > 0 || wantedDetailCount === 0}
                        onClick={addDetailSlots}
                        data-c19-draft-add-details={wantedDetailCount}
                        aria-label={`add ${wantedDetailCount} empty detail slot${
                          wantedDetailCount === 1 ? '' : 's'
                        } to the flat bench`}
                      >
                        {minting > 0
                          ? 'adding…'
                          : `add ${wantedDetailCount} detail slot${wantedDetailCount === 1 ? '' : 's'} ▸`}
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState className='py-1'>
                    <span className='uppercase text-textColor'>every detail is already there</span> ·
                    each aspect the draft named has a slot on FLAT SLOTS
                  </EmptyState>
                )}
              </div>
            )}
          </div>
        )}

        {/* ИСТОРИЯ УХОДИТ С ГЛАЗ: `written · dismissed · hints` под ОДНИМ раскрытием, числа в
            подписи. Пустой раздел внутри раскрытия НЕ исчезает: исчезающий раздел врёт про объём.

            ЖУРНАЛ СТОИТ И БЕЗ ОТВЕТА ПРОГОНА, и это смысл, а не вёрстка: ответ живёт в состоянии
            органа и умирает вместе с ним (студия монтируется условно), написанное на карточку
            живёт в модульном сторе и умирать не должно. Спрятать журнал вместе с ответом значило бы
            отобрать `✕` у человека, вернувшегося с COLORWAYS. */}
        {showLog && (
          <Fold
            className={hasAnswer ? undefined : 'mt-3'}
            label={`written ${writtenCount} · dismissed ${kept.length} · hints ${missing.length}`}
            open={logOpen}
            onToggle={() => setLogOpen((v) => !v)}
            data-c19-draft-log=''
          >
            <GroupLabel className={GROUP_GAP} action={<Counter n={writtenCount} noun='write' />}>
              written
            </GroupLabel>
            {writtenCount > 0 ? (
              <div data-c19-journal=''>
                {live.map((fill) => (
                  <WrittenRow
                    key={fill.id}
                    fill={fill}
                    receipt={fill.restore ? 'restored' : receiptByFill[fill.id]}
                    readOnly={readOnly || fitBarred(fill)}
                    busy={busy}
                    onUndo={() => undo(fill)}
                  />
                ))}
                {/* ПРЕЖНИЕ СЛОВА, ПЕРЕПИСАННЫЕ ЧЕРНОВИКОМ И ПОПРАВЛЕННЫЕ ПОТОМ ЧЕЛОВЕКОМ (BLK-1), И
                    СЛОВА, КОТОРЫЕ ЗАПИСЬ НЕСЁТ (M-A): `✕` отката у них нет, есть явный возврат и
                    тихий отказ (m6). Стоят здесь же — это тоже «что стояло до». */}
                {restore.map((offer) => (
                  <RestoreRow
                    key={`restore:${offer.fill.id}:${offer.from}`}
                    offer={offer}
                    readOnly={readOnly || fitBarred(offer.fill)}
                    busy={busy}
                    onRestore={() => restorePrevious(offer)}
                    onDismiss={() => dismissWords(offer)}
                  />
                ))}
                <div className='mt-1.5 flex flex-wrap justify-end gap-1.5'>
                  {/* ДВЕРЬ ВЕДЁТ ТУДА, КУДА ПРАВДА УЕХАЛИ ЗНАЧЕНИЯ — блоки ниже на этой же
                      странице. Якорь ставит `ConstructionGeneralInfo` (`data-c19-general`). */}
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    data-c19-draft-go=''
                    onClick={() => scrollToOrgan('[data-c19-general]')}
                  >
                    see it on CONSTRUCTION ▸
                  </Button>
                  {!readOnly && undoable.length > 0 && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      data-c19-undo-all=''
                      disabled={busy}
                      onClick={() => {
                        // Возвраты человека (BLK-1) не откатываются: это не работа черновика.
                        // Журнал правит сам `undo`, запись за записью: забывает, ставит на место
                        // заменённую (M-A) или — у заведённой детали — забывает после успеха
                        // сервера. Прежний `forgetMany` поверх цикла стирал бы поставленные на
                        // место записи вместе со словами, которые они несут.
                        for (const f of undoable) undo(f);
                      }}
                    >
                      undo all {undoable.length} ▸
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState className='py-1'>
                <span className='uppercase text-textColor'>nothing written</span> · the draft filled
                no empty field on this card
              </EmptyState>
            )}
            {/* ОТМЕНА ОТКАЗА ОТ СЛОВ (m6) — десять секунд, как `undo ↶` у `ai ✦`, и только пока
                запись журнала та, что отказ оставил. Вне условия группы: отказ от последних слов
                оставляет группу пустой, а отмена обязана остаться на экране. */}
            {undismissable && dismissedWords && !readOnly && (
              <div
                className='flex flex-wrap items-center justify-end gap-2 py-1'
                data-c19-restore-dismissed={dismissedWords.was.id}
              >
                <Text size='nano' variant='label' component='span'>
                  previous {dismissedWords.label} dropped
                </Text>
                <Chip
                  onClick={undismissWords}
                  disabled={busy}
                  data-c19-restore-undismiss={dismissedWords.was.id}
                  title='put the dropped words back among the ones you can restore'
                >
                  undo ↶
                </Chip>
              </div>
            )}

            <GroupLabel className={GROUP_GAP} action={<Counter n={kept.length} noun='line' />}>
              dismissed
            </GroupLabel>
            {kept.length > 0 ? (
              kept.map((row) => (
                <KeptRow key={row.id} row={row} readOnly={readOnly} onReopen={() => putBack(row)} />
              ))
            ) : (
              <EmptyState className='py-1'>
                <span className='uppercase text-textColor'>nothing turned down</span> · every drafted
                line is either written or still open
              </EmptyState>
            )}

            {/* СОВЕТЫ МОДЕЛИ — «что заслуживает булавки» (`missing`). Это совет, а не
                предложение: у строк нет ни `take`, ни `✕` — на карточке нет поля, в которое
                булавка легла бы сама. Ставить сюда дверь значило бы обещать действие, которого
                организм не умеет. Ключ несёт позицию: `missing` нигде не дедуплицируется. */}
            <GroupLabel className={GROUP_GAP} action={<Counter n={missing.length} noun='hint' />}>
              hints
            </GroupLabel>
            {missing.length > 0 ? (
              <div data-c19-draft-missing=''>
                {missing.map((line, i) => (
                  <div key={`${i}:${line}`} className='border-b border-hairline py-1'>
                    <Text size='micro' component='p' className='break-words'>
                      {line}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className='py-1'>
                <span className='uppercase text-textColor'>nothing to pin</span> · the draft named
                no picture that wants a note
              </EmptyState>
            )}
          </Fold>
        )}
      </div>
    </Section>
  );
}

/**
 * СТРОКА РЕШЕНИЯ: ОДНО УТВЕРЖДЕНИЕ, ОДНА ОТМЕТКА (макет `mbAskRow`).
 *
 *     FABRIC     draft adds "brushed inside"            [ take ]  [ show ▸ ]
 *
 * `take` — переключатель, и он НИЧЕГО НЕ ПИШЕТ: пишет одна кнопка внизу очереди. `append` — не
 * третья кнопка, а РЕЖИМ отметки, и только там, где он осмыслен: где черновик продолжает текст.
 * Появляется он вместе с отметкой: режим записи, которой ещё не заказано, — орган без работы.
 * `keep mine` — тихий орган ВНУТРИ раскрытия: не отмеченное и есть оставленное, а явное «отклонить»
 * отличается от него тем, что уходит из работы (и держит дверь обратно).
 *
 * Тело раскрытой строки — ОБА текста целиком; расхождение отмечено ВЕСОМ, не цветом: палитра
 * монохромная, и цветом состояние здесь не кодируется никогда.
 *
 * СТРОКА СПЕЦИФИКАЦИИ БЕЗ СЕКЦИИ (`hold`, фиксап раунда 2, MIN-11) несёт выбор секции прямо в ряду:
 * `take` погашен, пока секция не выбрана, и подпись под рядом говорит почему — без секции сервер не
 * сохранит карточку вовсе. Список — тот же, что у вкладки BOM (`techCardBomSectionOptions`).
 *
 * `barred` (M2 ре-ревью CL-C) — строку этот аккаунт не запишет вовсе (посадка без products:write):
 * `take` погашен, подпись под рядом называет право. Предложение при этом видно — это ответ прогона.
 */
function DecideRow({
  row,
  mark,
  shown,
  readOnly,
  barred,
  section,
  onSection,
  onTake,
  onMode,
  onShow,
  onKeep,
}: {
  row: ProposalRow;
  mark: '' | 'replace' | 'append';
  shown: boolean;
  readOnly: boolean;
  /** Почему строку не записать этим аккаунтом (M2); `undefined` — записать можно. */
  barred?: string;
  /** Секция, выбранная строке без своей; `undefined` — ещё не выбрана. */
  section?: string;
  onSection: (value: string) => void;
  onTake: () => void;
  onMode: () => void;
  onShow: () => void;
  onKeep: () => void;
}): JSX.Element {
  const say = draftSays(row.current, row.value);
  const canAppend = say.mode === 'add' && row.write.kind !== 'fit';
  const d = wordDiff(row.current, row.value);
  const needsSection = row.hold === 'section';
  const sectionMissing = needsSection && !section;
  /** Чья это секция — имя строки спецификации; подпись выбора называет его (раунд 3, m3). */
  const lineName = row.write.kind === 'bom' ? row.write.line.name : row.label;
  return (
    <div
      className='border-b border-hairline py-1.5'
      data-c19-draft-row={row.id}
      data-state={row.state}
    >
      <div className='flex flex-wrap items-center gap-3'>
        <Text
          size='micro'
          variant='label'
          tracking='label'
          component='span'
          className='w-[84px] shrink-0 truncate uppercase'
        >
          {row.label}
        </Text>
        <Text
          size='control'
          component='span'
          className='min-w-0 flex-1 truncate'
          data-c19-draft-say={say.mode}
        >
          {say.plain}
        </Text>
        {needsSection && (
          /* ИМЯ ВЫБОРА — «section for <строка>» (раунд 3, m3). Примитив кладёт подсказку в
             `aria-label` триггера, и прежнее «pick a section» оставалось именем выбора навсегда —
             и после выбора, и одинаковым у каждой такой строки. Длинное имя режется многоточием. */
          <div className='w-[160px] shrink-0' data-c19-draft-section={row.id}>
            <SelectComponent
              name={`draft-section-${row.id}`}
              items={techCardBomSectionOptions}
              value={section ?? ''}
              placeholder={`section for ${lineName}`}
              className='min-w-0 [&>span:first-child]:truncate'
              disabled={readOnly}
              onValueChange={onSection}
            />
          </div>
        )}
        <ChipRow className='shrink-0'>
          <Chip
            disabled={readOnly || sectionMissing || !!barred}
            selected={!!mark}
            pressed={!!mark}
            onClick={onTake}
            data-c19-draft-take={row.id}
            title={
              barred
                ? barred
                : sectionMissing
                  ? 'pick a section first — the card does not keep a line without one'
                  : `take the drafted ${row.label} · ${say.plain}`
            }
          >
            take
          </Chip>
          {mark && canAppend && (
            <Chip
              disabled={readOnly}
              selected={mark === 'append'}
              pressed={mark === 'append'}
              onClick={onMode}
              data-c19-draft-append={row.id}
              title={`keep the ${row.label} of the card and put the drafted words after it`}
            >
              append
            </Chip>
          )}
        </ChipRow>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          aria-expanded={shown}
          onClick={onShow}
          data-c19-draft-show={row.id}
        >
          {shown ? 'hide ▾' : 'show ▸'}
        </Button>
      </div>
      {barred && (
        <Text
          size='nano'
          variant='label'
          component='p'
          className='mt-0.5'
          data-c19-draft-barred={row.id}
        >
          {barred} · the proposal stays here, nothing is written
        </Text>
      )}
      {sectionMissing && (
        <Text
          size='nano'
          variant='label'
          component='p'
          className='mt-0.5'
          data-c19-draft-section-note={row.id}
        >
          the draft named no section the card keeps · pick one to take this line
        </Text>
      )}
      {shown && (
        <>
          <div className='mt-1 grid grid-cols-[40px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-px'>
            <Text
              size='nano'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              card
            </Text>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='min-w-0 break-words'
              data-c19-draft-card=''
            >
              <Whole tok={d.A} p={d.p} s={d.s} />
            </Text>
            <Text
              size='nano'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              draft
            </Text>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='min-w-0 break-words'
              data-c19-draft-draft=''
            >
              <Whole tok={d.B} p={d.p} s={d.s} />
            </Text>
          </div>
          {!readOnly && (
            <div className='mt-1.5 flex justify-end'>
              <Button
                type='button'
                variant='secondary'
                size='xs'
                onClick={onKeep}
                data-c19-draft-dismiss={row.id}
                title={`file the drafted ${row.label} away and keep the one on the card`}
              >
                keep mine
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Полный текст стороны с отмеченным ВЕСОМ расхождением (общее начало · разница · общий хвост). */
function Whole({ tok, p, s }: { tok: string[]; p: number; s: number }): JSX.Element {
  const head = tok.slice(0, p).join('');
  const mid = tok.slice(p, tok.length - s).join('');
  const tail = tok.slice(tok.length - s).join('');
  return (
    <>
      {head}
      {mid && <b className='text-textColor'>{mid}</b>}
      {tail}
    </>
  );
}

/** Где на карточке живёт запись — пилюля области в строке журнала. */
function areaOf(target: FillTarget): string {
  switch (target.kind) {
    case 'detail':
      return target.key === 'silhouette' || target.key === 'fabric'
        ? 'general information'
        : 'construction';
    case 'fit':
      return 'general information';
    case 'concept':
      return 'description';
    case 'slot':
      return 'material slots';
    // Единственная область, которая живёт НЕ НА ЭТОМ ШАГЕ: слот детали стоит на FLAT SLOTS, и
    // пилюля обязана это сказать — иначе человек ищет заведённое на мудборде.
    case 'detailSlot':
      return 'flat slots';
  }
}

const cutTo = (t: string, n: number): string =>
  t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;

/**
 * ЖУРНАЛ «БЫЛО → СТАЛО» — ЭТО И ЕСТЬ «ПОДСВЕЧИВАТЬ ЧТО ЗАПОЛНИЛО И ЕСЛИ МЫ ЗАХОТИМ ТО УДАЛИМ».
 *
 * ⚠ ОН НЕ УКРАШЕНИЕ И НЕ ЛОГ. Запись без `было` даёт кнопку, которая может только ОЧИСТИТЬ поле,
 * — а очистка поля, где до черновика стояли слова человека, это ровно та потеря, от которой
 * стережёт весь файл, только сделанная его же рукой. `—` в позиции «было» — законный ответ «не
 * стояло ничего», и он ПЕЧАТАЕТСЯ, а не опускается. `✕` возвращает то, что стояло, ПОШТУЧНО.
 * Строки только живые: заполнение, чей текст человек поправил, сюда не приходит (см. `isLive`) —
 * если под ним были слова человека, они стоят ниже строкой `RestoreRow`. Возврат (`restore`) —
 * тоже строка журнала: `✕` у него возвращает правленый черновик, который он заменил.
 */
function WrittenRow({
  fill,
  receipt,
  readOnly,
  busy,
  onUndo,
}: {
  fill: Fill;
  receipt?: Receipt;
  readOnly: boolean;
  /** Идёт операция прогона (M-08) — откат погашен, пока она не кончилась. */
  busy: boolean;
  onUndo: () => void;
}): JSX.Element {
  return (
    <div
      className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'
      data-c19-fill={fill.id}
    >
      <Text
        size='nano'
        variant='label'
        tracking='label'
        component='span'
        className='w-[88px] shrink-0 truncate uppercase'
      >
        {fill.label}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-[1_1_220px] break-words'>
        {cutTo(fill.after, 92)}
        <Text
          size='nano'
          variant='label'
          component='span'
          className='ml-2'
          data-c19-fill-before={fill.id}
        >
          was: {fill.before || '—'}
        </Text>
      </Text>
      {receipt && receipt !== 'dismissed' && (
        <Pill tone='ink' data-c19-draft-receipt={receipt}>
          {receipt}
        </Pill>
      )}
      <Pill tone='mut'>{areaOf(fill.target)}</Pill>
      {!readOnly && (
        <Button
          type='button'
          variant='secondary'
          size='xs'
          data-c19-undo={fill.id}
          disabled={busy}
          onClick={onUndo}
          aria-label={
            fill.restore
              ? `undo the restore of the ${fill.label}`
              : fill.before
                ? `put back the ${fill.label} that stood before`
                : `take back the drafted ${fill.label}`
          }
          title={
            fill.restore
              ? 'your previous words, restored — ✕ puts back the edited draft'
              : 'written by the draft — ✕ puts back what stood here'
          }
        >
          ✕
        </Button>
      )}
    </div>
  );
}

/**
 * ПРЕЖНИЕ СЛОВА ЧЕЛОВЕКА, КОТОРЫЕ ЧЕРНОВИК ПЕРЕПИСАЛ (фиксап раунда 2, BLK-1; раунд 3, M-A).
 *
 *     CONCEPT   before the draft: "clean shoulder, …"   description   [ restore previous ↶ ] [ ✕ ]
 *
 * Черновик переписал слова, человек потом поправил черновик — `✕` отката здесь нет (он стёр бы
 * правку). Возврат — явный жест, и он сам встаёт в журнал строкой с `✕`, то есть тоже обратим.
 * Тихий `✕` справа — ОТКАЗ от этих слов (m6): без вопроса, с десятью секундами `undo ↶` под группой.
 */
function RestoreRow({
  offer,
  readOnly,
  busy,
  onRestore,
  onDismiss,
}: {
  offer: WordsOffer;
  readOnly: boolean;
  /** Идёт операция прогона (M-08) — возврат и отказ погашены, как и откат. */
  busy: boolean;
  onRestore: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const fill = offer.fill;
  return (
    <div
      className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'
      data-c19-restore-row={fill.id}
      data-c19-restore-from={String(offer.from)}
    >
      <Text
        size='nano'
        variant='label'
        tracking='label'
        component='span'
        className='w-[88px] shrink-0 truncate uppercase'
      >
        {fill.label}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-[1_1_220px] break-words'>
        <Text size='nano' variant='label' component='span' className='mr-2'>
          before the draft:
        </Text>
        {cutTo(offer.words, 92)}
      </Text>
      <Pill tone='mut'>{areaOf(fill.target)}</Pill>
      {!readOnly && (
        <>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            data-c19-restore={fill.id}
            disabled={busy}
            onClick={onRestore}
            aria-label={`restore the ${fill.label} that stood before the draft: ${cutTo(offer.words, 40)}`}
            title='the draft wrote over these words and the field was edited since — restore them'
          >
            restore previous ↶
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            data-c19-restore-dismiss={fill.id}
            disabled={busy}
            onClick={onDismiss}
            aria-label={`drop the ${fill.label} that stood before the draft: ${cutTo(offer.words, 40)}`}
            title='drop these words — undo stays for 10 seconds'
          >
            ✕
          </Button>
        </>
      )}
    </div>
  );
}

/** Отклонённая строка: ушла из работы, но держит дверь обратно — отметка без обратной двери это ловушка. */
function KeptRow({
  row,
  readOnly,
  onReopen,
}: {
  row: ProposalRow;
  readOnly: boolean;
  onReopen: () => void;
}): JSX.Element {
  return (
    <div
      className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'
      data-c19-draft-kept={row.id}
    >
      <Text
        size='nano'
        variant='label'
        tracking='label'
        component='span'
        className='w-[88px] shrink-0 truncate uppercase'
      >
        {row.label}
      </Text>
      <Text size='micro' variant='label' component='span' className='min-w-0 flex-[1_1_220px] truncate'>
        {draftSays(row.current, row.value).plain}
      </Text>
      <Pill tone='ink'>kept</Pill>
      {!readOnly && (
        <Button
          type='button'
          variant='secondary'
          size='xs'
          onClick={onReopen}
          data-c19-draft-reopen={row.id}
          title={`put the drafted ${row.label} back among the lines to decide`}
        >
          put it back
        </Button>
      )}
    </div>
  );
}

/**
 * ═══ WHAT THE MODEL GETS — THE MOODBOARD DRAFT: AN INVENTORY OF FACTS, NOT OF WORDS ═════════════
 *
 * THE INPUT IS ASSEMBLED BY THE SERVER (`DraftDesignIdea`) FROM THE SAVED CARD, and this client
 * never sees the text it composes. So the panel does not pretend to: it lists what the server
 * READS — the card head (garment, fit, category, gender, size run), the board's pictures with the
 * notes pinned to them, the description, and what the card ALREADY says (aspects, table callouts,
 * BOM lines — sent under «refine, do not repeat», `designCardAlreadySays`) — and, for the last
 * draft asked from this screen, its ANSWER verbatim. Nothing here is inferred; every line is a
 * count or a stored column. The «already on the card» group is the one this panel used to deny:
 * it listed the construction and the BOM under NOT SENT, and both are read.
 *
 * ⚠ THERE IS NO «WORDS AS SENT» BLOCK HERE, AND THAT IS A FACT ABOUT THE SERVER, NOT AN OMISSION.
 * `DraftDesignIdea` runs inline and never writes the composed prompt onto its run row — only the
 * worker's `RecordRunPrompt` does that, and the draft never passes through the worker. A block
 * promising «the text the server kept» would be empty after every draft, forever.
 *
 * ⚠ THE LAST RUN COMES FROM THE RESPONSE, NOT FROM THE BAND. The feed excludes `draft_idea`
 * (`designFeedKinds`), so `latestRunOfKind(band.runs, 'draft_idea')` is null on every card.
 *
 * SAME SHELL, SAME LINES AS THE FOUR STEPS (`core/wmg.tsx`): between steps only the composition
 * differs, never the markup. The reader who has opened this door on FLAT finds the same organ here.
 *
 * READS THE FORM VALUES IT IS HANDED, NOT THE FORM. The caller already subscribes to the board
 * (`useWatch`) and hands the values down — a second subscription in the modal would be the same
 * rows watched twice, and the shared parts are forbidden to touch the form at all.
 */
function DraftInventoryModal({
  open,
  onOpenChange,
  lastRun,
  items,
  callouts,
  concept,
  fit,
  category,
  gender,
  sizeRun,
  aspects,
  bomItems,
  boardDirty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row `DraftDesignIdea` answered with, for the last draft asked from this screen. */
  lastRun: common_DesignRun | null;
  items: readonly { mediaId?: number }[];
  callouts: readonly CalloutLike[];
  concept: string;
  fit: string;
  /** Category NAME, as the server prints it; '' when the card has none (the line is then not sent). */
  category: string;
  /** men | women | unisex, or '' — the server sends nothing for an unknown gender. */
  gender: string;
  /** Size names in the card's order, the base one marked «(base)» — `designSizeRunLine`. */
  sizeRun: readonly string[];
  aspects: readonly { key?: string; text?: string }[];
  bomItems: readonly { name?: string; section?: string; composition?: string }[];
  boardDirty: boolean;
}): JSX.Element {
  const mediaById = useMediaMap();
  // WHAT THE CARD ALREADY SAYS, IN THE SERVER'S OWN THREE LISTS (`designCardAlreadySays`): aspects
  // with both a key and a text; TABLE callouts only — one pinned to a board picture already went as a
  // note in the group above, and sending it twice would tell the model not to speak of what it must
  // read; BOM lines as «section · name · composition». Each list is capped at 20 rows there, and the
  // cut is named to the model as «(+N more …, not listed)» — so it is named here too.
  const saidAspects = aspects
    .map((d) => ({ key: (d.key ?? '').trim(), text: (d.text ?? '').trim() }))
    .filter((d) => d.key && d.text);
  const saidCallouts = callouts
    .filter((c) => !(c.mediaId && c.mediaId > 0))
    .map((c) => {
      const line = calloutWords(c);
      return line ? (c.number && c.number > 0 ? `#${c.number} ${line}` : line) : '';
    })
    .filter(Boolean);
  const saidBom = bomItems
    .filter((b) => (b.name ?? '').trim())
    .map((b) =>
      [(b.section ?? '').trim(), (b.name ?? '').trim(), (b.composition ?? '').trim()]
        .filter(Boolean)
        .join(' · '),
    );
  const ALREADY_ROWS = 20;
  const capped = (rows: readonly string[], kind: string): string =>
    rows.slice(0, ALREADY_ROWS).join(' · ') +
    (rows.length > ALREADY_ROWS
      ? ` — and «+${rows.length - ALREADY_ROWS} more ${kind} on the card, not listed», said to the model in those words`
      : '');
  const alreadyCount = saidAspects.length + saidCallouts.length + saidBom.length;
  const boardIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const notesOf = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const c of callouts) {
      const id = c.mediaId ?? 0;
      if (!boardIds.has(id)) continue;
      const text = (c.description ?? '').trim();
      if (!text) continue;
      const list = m.get(id) ?? [];
      list.push(text);
      m.set(id, list);
    }
    return m;
  }, [callouts, boardIds]);
  const noteCount = [...notesOf.values()].reduce((n, list) => n + list.length, 0);

  return (
    <WmgShell
      open={open}
      onOpenChange={onOpenChange}
      kindWord='moodboard draft'
      intro={
        <>
          <b>the server assembles this run itself,</b> from the SAVED card — the card head (garment,
          fit, category, gender, size run), the pictures on the moodboard with the notes pinned to
          them, the description, and what the card already says (aspects, table callouts, BOM), which
          it is told to refine and not repeat. This client never sees the text it composes, so what is
          listed here is what the server READS, not how it words it.
          {boardDirty ? (
            <>
              {' '}
              <span className='text-warning'>
                The board has unsaved changes — the draft reads the saved card, so save first.
              </span>
            </>
          ) : null}
        </>
      }
    >
      <WmgGroup
        flush
        label='pictures — the moodboard'
        aside={`${items.length} read · ${noteCount} note${noteCount === 1 ? '' : 's'}`}
        note='every picture on the board is read, with the notes pinned to it; a note on a picture that is not on the board is not read'
      >
        {items.length === 0 ? (
          <InventoryLine
            name='—'
            text={<span className='text-labelColor'>no picture on the moodboard</span>}
          />
        ) : (
          items.map((item, index) => {
            const id = item.mediaId ?? 0;
            const notes = notesOf.get(id) ?? [];
            return (
              <InventoryLine
                key={id || index}
                name={`picture ${index + 1}`}
                thumb={thumbOf(mediaById.get(id))}
                origin='linked'
                text={
                  notes.length ? (
                    notes.join(' · ')
                  ) : (
                    <span className='text-labelColor'>no note pinned — the picture goes as is</span>
                  )
                }
              />
            );
          })
        )}
      </WmgGroup>

      <WmgGroup label='words' aside='read from the saved card'>
        <InventoryLine
          name='description'
          origin={concept.trim() ? 'linked' : undefined}
          text={
            concept.trim() || (
              <span className='text-labelColor'>
                none — the board is read from its pictures alone
              </span>
            )
          }
        />
        {/* ПОСАДКА ЧИТАЕТСЯ: `designConstructionUserPrompt` пишет «Fit: …» в шапку запроса, снимок
            входов несёт `{Mood, Fit}`, строка прогона — `fit_at_launch`. Та же строка `origin='linked'`,
            что и у флэт-руки: две руки не имеют права расходиться в том, едет ли одно и то же поле. */}
        <InventoryLine
          name='fit'
          origin={fit.trim() ? 'linked' : undefined}
          text={
            fit.trim() ? (
              `${fit.trim()} (from the card)`
            ) : (
              <span className='text-labelColor'>none stated — the draft proposes one</span>
            )
          }
        />
        {/* ШАПКА ИЗДЕЛИЯ — `designConstructionUserPrompt` пишет «Category:», «Gender:», «Size run:»
            после «Garment:» и «Fit:». Пустое поле не едет строкой вовсе, и сказано так же. */}
        <InventoryLine
          name='category'
          origin={category ? 'linked' : undefined}
          text={
            category || <span className='text-labelColor'>none on the card — the line is not sent</span>
          }
        />
        <InventoryLine
          name='gender'
          origin={gender ? 'linked' : undefined}
          text={
            gender || <span className='text-labelColor'>not stated — the line is not sent</span>
          }
        />
        <InventoryLine
          name='size run'
          origin={sizeRun.length ? 'linked' : undefined}
          text={
            sizeRun.length ? (
              sizeRun.join(', ')
            ) : (
              <span className='text-labelColor'>no sizes on the card — the line is not sent</span>
            )
          }
        />
      </WmgGroup>

      <WmgGroup
        label='already on the card'
        aside={alreadyCount ? `${alreadyCount} read` : 'nothing yet'}
        note='read so the draft refines rather than repeats — the server sends these under «already on the card — refine, do not repeat»; a callout pinned to a board picture went with the picture above and is not sent twice'
        data-wmg-already={alreadyCount}
      >
        {alreadyCount === 0 ? (
          <InventoryLine
            name='—'
            text={
              <span className='text-labelColor'>
                the card says nothing yet — the section is not sent, and the draft proposes freely
              </span>
            }
          />
        ) : (
          <>
            {saidAspects.length > 0 && (
              <InventoryLine
                name={`aspects · ${saidAspects.length}`}
                origin='linked'
                text={capped(
                  saidAspects.map((d) => `${d.key}: ${d.text}`),
                  'aspects',
                )}
              />
            )}
            {saidCallouts.length > 0 && (
              <InventoryLine
                name={`table callouts · ${saidCallouts.length}`}
                origin='linked'
                text={capped(saidCallouts, 'callouts')}
              />
            )}
            {saidBom.length > 0 && (
              <InventoryLine
                name={`BOM · ${saidBom.length}`}
                origin='linked'
                text={capped(saidBom, 'bom lines')}
              />
            )}
          </>
        )}
      </WmgGroup>

      <NotSent
        items={[
          { label: 'colourways', reason: 'colourways are proposed by the draft and created on your click' },
          {
            label: 'reference roles',
            reason: 'roles and reference notes belong to the flat run; the draft reads the board, not the input',
          },
        ]}
      />

      <WordsAsSent
        run={lastRun}
        text={lastRun ? runOutputText(lastRun) : ''}
        kindWord='draft'
        label='what came back'
        noun='answer'
        caveat='the answer verbatim — the proposal above was parsed out of this text'
        whenNone='no draft has been asked from this screen since it opened — the server keeps draft rows out of the band feed, so only the answer to a draft asked here can be shown.'
        data-c19-draft-answer=''
      />
    </WmgShell>
  );
}

function thumbOf(media?: common_MediaFull): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}
