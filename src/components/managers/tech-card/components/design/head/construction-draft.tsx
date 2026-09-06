import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { GENDER_ENUM_TO_SLUG } from 'constants/constants';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { bornBomLine, upsertDetailText } from '../../form-writers';
import type { TechCardFormData } from '../../schema';
import { proposedColourways } from '../colourway-proposals-model';
import {
  Counter,
  EmptyState,
  InventoryLine,
  NotSent,
  WmgGroup,
  WmgShell,
  WordsAsSent,
} from '../core';
import { formatMoney } from '../generation/money';
import { runOutputText } from '../generation/run-state';
import { GenerateRow } from '../render/generate-row';
import type { Gate } from '../render/model';
import { calloutWords, type CalloutLike } from '../render/what-model-gets';
import { newClientRequestId } from '../use-design-band';
import {
  diffProposal,
  draftSays,
  parseConstructionDraft,
  wordDiff,
  type ConstructionDraft,
  type FormSnapshot,
  type ProposalRow,
} from './construction-draft-model';
import {
  fillIdOf,
  fillPlan,
  liveFills,
  targetOfRow,
  type Fill,
  type FillTarget,
} from './draft-fills';
import { Fold, GoTo, LockedBar, scrollToOrgan } from './mood-organs';
import { useCardMemory, useDraftMemory } from './use-draft-fills';
import { draftIdeaRefusal, useDraftDesignIdea } from './use-draft-idea';

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
 *   3. кнопки «принять всё» НЕТ. Цикл заполнения идёт по СТРОКАМ ПРЕДЛОЖЕНИЯ, а строка рождается
 *      только у значения, которое модель НАЗВАЛА, — молчание физически не выразимо как запись.
 * Плюс четвёртое, новое: САМО СОБОЙ ПИШЕТСЯ ТОЛЬКО ПУСТОЙ АДРЕСАТ (`draft-fills.ts: fillPlan`).
 * Поле, в котором стоят слова человека, приходит строкой «TO DECIDE» и ждёт его клика. И пятое:
 * каждая запись легла в ЖУРНАЛ вместе с тем, что стояло до неё, поэтому «удалим» — это ВОЗВРАТ,
 * а не догадка.
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

/** Квитанция строки. Заменяет чипы после клика — сегодняшняя грамматика, слово в слово. */
type Receipt = 'added' | 'replaced' | 'dismissed';

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

/**
 * Машинная причина отказа: `google.rpc.Status.details` → `ErrorInfo.reason`.
 *
 * КАНАЛ НЕ ВЫДУМАН ПОД ЭТОТ СЛУЧАЙ. Шлюз проносит `details` в тело JSON, `api.ts` кладёт массив на
 * саму ошибку, а `utils/field-errors.ts` уже читает оттуда нарушения полей — разбор тот же, тип
 * детали другой (та же форма стоит в `files/api/notesService.ts`). Прозу сервера здесь не
 * спрашивают ВООБЩЕ: фраза принадлежит серверу и будет переписана в тот день, когда её решат
 * улучшить, а `reason` — это контракт.
 *
 * ⚠ ДОМЕН НЕ СВЕРЯЕТСЯ, И ЭТО НЕ НЕБРЕЖНОСТЬ. У этой двери их два — `design.grbpwr.com` и
 * `ai.grbpwr.com`, — но словари их причин не пересекаются даже регистром (ai пишет
 * `AI_NOT_CONFIGURED`). Второе условие ничего бы не различило, зато протухло бы молча.
 *
 * ЭТА ФУНКЦИЯ ОБЯЗАНА ПЕРЕЕХАТЬ К `draftIdeaRefusal` (`use-draft-idea.ts`): там уже стоит второй
 * читатель этого же отказа, и два места, читающие одну ошибку, однажды разойдутся в том, что она
 * значит. Складывать надо ПЕРЕНОСОМ, а не копией; этот заход не имеет права править чужие файлы.
 */
function refusalReason(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  if (!Array.isArray(details)) return '';
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const type = (d as { '@type'?: unknown })['@type'];
    // Сверка по СУФФИКСУ типа, как в `field-errors.ts`; голый объект с `reason` тоже принимается.
    if (typeof type === 'string' && !type.endsWith('ErrorInfo')) continue;
    const reason = (d as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason) return reason;
  }
  return '';
}

/** Прогон за этим ключом ЗАКРЫТ — ключу больше нечего стеречь. */
function runIsClosed(error: unknown): boolean {
  return CLOSED_RUN_REFUSALS.has(refusalReason(error));
}

export function ConstructionDraft({
  techCardId,
  disabled,
  conceptMax,
}: {
  techCardId: number;
  disabled?: boolean;
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
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const draftIdea = useDraftDesignIdea(techCardId);
  const [inspecting, setInspecting] = useState(false);

  // ЖУРНАЛ ЗАПОЛНЕНИЙ И ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ ЖИВУТ В МОДУЛЬНОМ СТОРЕ, А НЕ ЗДЕСЬ: студия
  // монтируется условно, и `useState` органа умер бы от одного захода на COLORWAYS и обратно —
  // вместе с единственной записью о том, что стояло на карточке ДО черновика (см. `use-draft-fills`).
  const { fills } = useCardMemory(techCardId);
  const record = useDraftMemory((st) => st.record);
  const forget = useDraftMemory((st) => st.forget);
  const forgetMany = useDraftMemory((st) => st.forgetMany);
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
  const boardDirty =
    !!dirtyFields.concept ||
    !!(dirtyFields as { moodboardMedia?: unknown }).moodboardMedia ||
    !!(dirtyFields as { callouts?: unknown }).callouts;

  const boardIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const boardNotes = useMemo(
    () =>
      callouts
        .filter((c) => boardIds.has(c.mediaId ?? 0))
        .map((c) => (c.description ?? '').trim())
        .filter(Boolean),
    [callouts, boardIds],
  );
  const stampOf = (conceptText: string) =>
    JSON.stringify([[...boardIds], conceptText.trim(), boardNotes]);
  const fingerprint = useMemo(
    () => JSON.stringify([[...boardIds], concept.trim(), boardNotes]),
    [boardIds, concept, boardNotes],
  );

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

  // КЛЮЧ ИДЕМПОТЕНТНОСТИ ЖИВЁТ НА НАМЕРЕНИИ. Пока запрос не вернулся, повторное нажатие несёт ТОТ
  // ЖЕ ключ — сервер отдаёт ту же строку вместо второй оплаты. Новое намерение («прочитай доску
  // ещё раз») минтит новый.
  const intent = useRef<string | null>(null);

  const readOnly = !!disabled;
  // ⚠ ПУСТОТА МЕРИТСЯ ТАК ЖЕ, КАК ЕЁ МЕРИТ СЕРВЕР: «нет картинок И нет слов». Доска из одних
  // картинок законна (сторож на словах снят в Ф0), доска из одного описания — тоже.
  // РОВНО КАРТИНКИ, А НЕ СТРОКИ: одна картинка стоит и на доске, и во входе двумя строками
  // `moodboardMedia` (U-5) — считать её дважды значило бы обещать прогону восьмую картинку.
  const pictureCount = boardIds.size;
  const nothingToRead = pictureCount === 0 && !concept.trim() && boardNotes.length === 0;
  const gate: Gate = nothingToRead
    ? {
        ok: false,
        reason: 'there is nothing to read: put a picture on the moodboard or write the description',
      }
    : boardDirty
      ? { ok: false, reason: 'save the card first — the draft reads what is saved' }
      : { ok: true };

  function askForDraft() {
    if (!gate.ok || readOnly || draftIdea.isPending) return;
    if (!intent.current) intent.current = newClientRequestId();
    const snapshot = { pictures: pictureCount, notes: boardNotes.length, fingerprint };
    draftIdea.mutate(
      { clientRequestId: intent.current },
      {
        onSuccess: (res) => {
          intent.current = null;
          setPrice(runPrice(res.run));
          setLastRun(res.run ?? null);
          const parsed = parseConstructionDraft(res.construction);
          if (!parsed) {
            // ПУСТОЙ ОТВЕТ — НЕ ЧЕРНОВИК. Строка в реестре есть, деньги списаны, а предлагать
            // нечего: сказать это прямо честнее, чем нарисовать пустую рамку «черновика».
            showMessage('the run came back with nothing to propose', 'error');
            return;
          }
          setStaged({
            draft: parsed,
            readPictures: snapshot.pictures,
            readNotes: snapshot.notes,
            time: hhmm(),
            fingerprint: snapshot.fingerprint,
          });
          // ВТОРОЙ ПРОГОН ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЕ, А КВИТАНЦИИ ОБНУЛЯЮТСЯ (D5): они говорят про
          // строки прошлого ответа, и оставленные — обещали бы, что уже принято то, чего в новом
          // предложении может не быть вовсе. Принятое при этом никуда не делось — оно на карточке,
          // и новое сравнение покажет его как `same`.
          setReceipts({});
          // Отметки и раскрытия строк — тоже про строки прошлого ответа.
          setTaken({});
          setShown({});
          // Колорвеи — ПРЕДЛОЖЕНИЕ, и они ждут клика: подтверждение создаёт продукт (B-25).
          setProposals(techCardId, proposedColourways(parsed));
          // …а поля карточки заполняются САМИ, и только пустые (B-14).
          autoFill(parsed);
        },
        onError: (error) => {
          // ⚠ КЛЮЧ ОТПУСКАЕТСЯ РОВНО НА ЗАКРЫТОМ ПРОГОНЕ — И НИ НА ЧЁМ БОЛЬШЕ. Пока прогон может
          // быть жив, следующий клик обязан нести ТОТ ЖЕ ключ: повторить намерение с новым
          // означало бы заплатить дважды за один вопрос. Но у прогона, который сервер уже закрыл,
          // стеречь нечего: тот же ключ будет вечно возвращать ту же самую фразу, и «press draft
          // again» — совет, которому мы физически не давали сбыться (см. CLOSED_RUN_REFUSALS).
          if (runIsClosed(error)) intent.current = null;
          showMessage(draftIdeaRefusal(error), 'error');
        },
      },
    );
  }

  /* ── ЧЕТЫРЕ ЗАПИСИ, И НИ ОДНОЙ ПЯТОЙ ─────────────────────────────────────────────────────
     Каждая ветка зовёт ПИСАТЕЛЯ, который уже существует и которым пользуется рукописная правка.
     Ни одна не собирает объект формы из объекта модели: наверх едут только СТРОКИ.
     Ветка указаний снята вместе с самим предложением указаний (B-13). */
  function applyRow(row: ProposalRow): { ok: boolean; value: string; lineKey?: string } {
    if (readOnly) return { ok: false, value: '' };
    const w = row.write;
    if (w.kind === 'detail') {
      upsertDetailText(getValues, setValue, w.key, w.text);
      return { ok: true, value: w.text };
    }
    if (w.kind === 'fit') {
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
    const cur = (getValues('bomItems') ?? []) as unknown[];
    const born = bornBomLine(w.line);
    setValue('bomItems', [...cur, born] as never, { shouldDirty: true });
    // Ключ строки минтит КОНСТРУКТОР, и журнал берёт его оттуда, а не выдумывает свой: адрес
    // отката обязан быть тем же самым ключом, по которому строка живёт в форме.
    return { ok: true, value: w.line.name, lineKey: String(born.lineKey ?? '') };
  }

  /** Живые значения формы в момент записи — `getValues`, а не снимок рендера (см. писателей). */
  function liveSnapshot(): FormSnapshot {
    return {
      fit: (getValues('fit') ?? '') as string,
      concept: (getValues('concept') ?? '') as string,
      details: (getValues('details') ?? []) as { key?: string; text?: string }[],
      bomItems: (getValues('bomItems') ?? []) as { name?: string; lineKey?: string }[],
    };
  }

  /** Запись в журнал; возвращает АДРЕС записи — по нему строка журнала носит свою квитанцию. */
  function remember(
    row: ProposalRow,
    done: { value: string; lineKey?: string },
    at: string,
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
      before: row.current,
      after: done.value,
      at,
    });
    return fillIdOf(target);
  }

  /**
   * САМО-ЗАПОЛНЕНИЕ (B-14). Идёт ПО СТРОКАМ ПРЕДЛОЖЕНИЯ и пишет ровно то, что разрешил `fillPlan`:
   * пустые адресаты и свои же прошлые записи. Остальное остаётся человеку строкой «TO DECIDE».
   *
   * ⚠ ЖУРНАЛ ЧИТАЕТСЯ ИЗ СТОРА, А НЕ ИЗ ЗАМЫКАНИЯ РЕНДЕРА: между нажатием и ответом сервера
   * человек мог откатить запись, и план, посчитанный от старого журнала, счёл бы её всё ещё своей
   * и переписал бы поверх — то есть ровно тем действием, от которого весь этот файл и стережёт.
   */
  function autoFill(draft: ConstructionDraft) {
    if (readOnly) return;
    const known = useDraftMemory.getState().byCard[techCardId]?.fills ?? [];
    const { rows: fresh } = diffProposal(draft, liveSnapshot());
    const { write } = fillPlan(fresh, known);
    const at = hhmm();
    for (const row of write) {
      const done = applyRow(row);
      if (!done.ok) continue;
      remember(row, done, at);
    }
  }

  /* Клика «принять строку» здесь больше нет: строка ОТМЕЧАЕТСЯ (`take`), а пишет одна кнопка на
     всю очередь (`writeTaken` ниже) — тем же писателем и с той же записью журнала. */

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
    if (readOnly) return;
    const t = fill.target;
    if (t.kind === 'detail') {
      upsertDetailText(getValues, setValue, t.key, fill.before);
    } else if (t.kind === 'fit') {
      setValue('fit', fill.before as never, { shouldDirty: true });
    } else if (t.kind === 'concept') {
      setValue('concept', fill.before, { shouldDirty: true });
      setStaged((prev) => (prev ? { ...prev, fingerprint: stampOf(fill.before) } : prev));
    } else {
      const cur = (getValues('bomItems') ?? []) as { lineKey?: string }[];
      setValue('bomItems', cur.filter((r) => r.lineKey !== t.lineKey) as never, {
        shouldDirty: true,
      });
    }
    forget(techCardId, fill.id);
    // Квитанция умирает вместе с записью: строка, чью запись вернули, снова РАБОТА и стоит в
    // `to decide` (макет `mood:unwrite`: «снятие квитанции»). Без этого возврат прятал бы строку
    // навсегда — ни написана, ни отклонена, ни в очереди.
    const rowIds = rows
      .filter((r) => {
        const t = targetOfRow(r);
        return !!t && fillIdOf(t) === fill.id;
      })
      .map((r) => r.id);
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
  }

  // СРАВНЕНИЕ СЧИТАЕТСЯ НА РЕНДЕРЕ, ПРОТИВ ЖИВЫХ ЗНАЧЕНИЙ (D5). Не в `onSuccess` и не в состоянии:
  // принятая строка обязана сама стать `same`, а рукописная правка соседнего поля — сама поменять
  // «add» на «replace», без единого пере-запроса.
  const formSnapshot: FormSnapshot = useMemo(
    () => ({ fit, concept, details, bomItems }),
    [fit, concept, details, bomItems],
  );
  const { rows, missing } = useMemo(
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
   * ЧТО ОРГАН НАПИСАЛ БЫ САМ ПРЯМО СЕЙЧАС — и, что важнее, ЧТО ОН ОСТАВИЛ ЧЕЛОВЕКУ.
   *
   * Считается тем же `fillPlan`, каким считался цикл заполнения, а не вторым правилом рядом:
   * список «TO DECIDE» обязан быть ДОПОЛНЕНИЕМ написанного, иначе экран и запись разошлись бы
   * молча — и разошлись бы ровно в том случае, ради которого весь гейт и стоит.
   */
  const decide = useMemo(() => fillPlan(rows, fills).decide, [rows, fills]);

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
  const nothingNew =
    rows.length > 0 && proposed === 0 && live.length === 0 && missing.length === 0;

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
  const [logOpen, setLogOpen] = useState(false);
  /** Квитанция записи по АДРЕСУ ЖУРНАЛА — пилюля `added` / `replaced` в строке WRITTEN. */
  const [receiptByFill, setReceiptByFill] = useState<Record<string, Receipt>>({});

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
      const cur = (
        ((getValues('details') ?? []) as { key?: string; text?: string }[]).find(
          (d) => d.key === w.key,
        )?.text ?? ''
      ).trimEnd();
      const joined = cur ? `${cur}\n${w.text}` : w.text;
      upsertDetailText(getValues, setValue, w.key, joined);
      return { ok: true, value: joined };
    }
    if (w.kind === 'concept') {
      const cur = ((getValues('concept') ?? '') as string).trimEnd();
      const joined = cur ? `${cur}\n${w.text}` : w.text;
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
      const done = mode === 'append' ? appendRow(row) : applyRow(row);
      if (!done.ok) continue;
      const fillId = remember(row, done, at);
      const receipt: Receipt = mode === 'append' || row.state !== 'replace' ? 'added' : 'replaced';
      setReceipts((prev) => ({ ...prev, [row.id]: receipt }));
      if (fillId) setReceiptByFill((prev) => ({ ...prev, [fillId]: receipt }));
    }
    setTaken({});
    // Записанное уезжает под раскрытие — раскрытие ОТКРЫВАЕТСЯ, иначе жест выглядит исчезновением
    // строк, а квитанции не видно нигде.
    setLogOpen(true);
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
  const hasAnswer = !!staged && !draftIdea.isPending;
  // Журнал живёт в сторе дольше ответа: раскрытие рисуется и без прогона, пока есть что вернуть.
  const showLog = hasAnswer || live.length > 0;

  /* СТАТУС В ШАПКЕ БЛОКА — только там, где заменить его нечем: прогона не было или он в полёте.
     Прогон есть → шапка пуста, а «прогон был» стоит словами в ряду (`read N pictures · …`). */
  const status = draftIdea.isPending ? (
    <Pill tone='attention' data-c19-draft-status='flight'>
      starting…
    </Pill>
  ) : staged ? null : (
    <Pill tone='mut' data-c19-draft-status='fresh'>
      not run yet
    </Pill>
  );

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
      action={status}
    >
      <div data-c19-draft=''>
        {/* ВОРОТА — ВИДИМОЙ ПОЛОСОЙ, а не только `title` погашенной двери: причина никогда не живёт
            в подсказке по наведению. Дверь `+ picture ›` — только у пустой доски: у «сохрани
            карточку» двери здесь нет, сохранение — действие страницы. */}
        {!gate.ok && (
          <LockedBar
            reason={gate.reason}
            className='mb-2'
            data-c19-draft-gate=''
            door={
              nothingToRead ? (
                <GoTo onClick={() => scrollToOrgan('#mb-board')} data-c19-draft-to-board=''>
                  + picture
                </GoTo>
              ) : undefined
            }
          />
        )}
        {/* ОДНА ДВЕРЬ НА ВСЕ ЭКРАНЫ — общий `GenerateRow`: `GENERATE`, дверь описи, строка про
            деньги. Состояние прогона вшито в её ряд по шву `trailing`. */}
        <GenerateRow
          gate={gate}
          label='GENERATE'
          pending={draftIdea.isPending}
          disabled={readOnly}
          onGenerate={askForDraft}
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
            <GroupLabel flush action={<Counter n={open.length} noun='line' />}>
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
            label={`written ${live.length} · dismissed ${kept.length} · hints ${missing.length}`}
            open={logOpen}
            onToggle={() => setLogOpen((v) => !v)}
            data-c19-draft-log=''
          >
            <GroupLabel action={<Counter n={live.length} noun='write' />}>written</GroupLabel>
            {live.length > 0 ? (
              <div data-c19-journal=''>
                {live.map((fill) => (
                  <WrittenRow
                    key={fill.id}
                    fill={fill}
                    receipt={receiptByFill[fill.id]}
                    readOnly={readOnly}
                    onUndo={() => undo(fill)}
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
                  {!readOnly && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      data-c19-undo-all=''
                      onClick={() => {
                        for (const f of live) undo(f);
                        forgetMany(
                          techCardId,
                          live.map((f) => f.id),
                        );
                      }}
                    >
                      undo all {live.length} ▸
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

            <GroupLabel action={<Counter n={kept.length} noun='line' />}>dismissed</GroupLabel>
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
            <GroupLabel action={<Counter n={missing.length} noun='hint' />}>hints</GroupLabel>
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
 */
function DecideRow({
  row,
  mark,
  shown,
  readOnly,
  onTake,
  onMode,
  onShow,
  onKeep,
}: {
  row: ProposalRow;
  mark: '' | 'replace' | 'append';
  shown: boolean;
  readOnly: boolean;
  onTake: () => void;
  onMode: () => void;
  onShow: () => void;
  onKeep: () => void;
}): JSX.Element {
  const say = draftSays(row.current, row.value);
  const canAppend = say.mode === 'add' && row.write.kind !== 'fit';
  const d = wordDiff(row.current, row.value);
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
        <ChipRow className='shrink-0'>
          <Chip
            disabled={readOnly}
            selected={!!mark}
            pressed={!!mark}
            onClick={onTake}
            data-c19-draft-take={row.id}
            title={`take the drafted ${row.label} · ${say.plain}`}
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
 * Строки только живые: заполнение, чей текст человек поправил, сюда не приходит (см. `isLive`).
 */
function WrittenRow({
  fill,
  receipt,
  readOnly,
  onUndo,
}: {
  fill: Fill;
  receipt?: Receipt;
  readOnly: boolean;
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
          onClick={onUndo}
          aria-label={
            fill.before
              ? `put back the ${fill.label} that stood before`
              : `take back the drafted ${fill.label}`
          }
          title='written by the draft — ✕ puts back what stood here'
        >
          ✕
        </Button>
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
