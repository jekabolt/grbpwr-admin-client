import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { GENDER_ENUM_TO_SLUG } from 'constants/constants';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { bornBomLine, upsertDetailText } from '../../form-writers';
import type { TechCardFormData } from '../../schema';
import { proposedColourways } from '../colourway-proposals-model';
import { InventoryLine, NotSent, WmgGroup, WmgShell, WordsAsSent } from '../core';
import { formatMoney } from '../generation/money';
import { runOutputText } from '../generation/run-state';
import { GenerateRow } from '../render/generate-row';
import type { Gate } from '../render/model';
import { calloutWords, type CalloutLike } from '../render/what-model-gets';
import { newClientRequestId } from '../use-design-band';
import {
  diffProposal,
  parseConstructionDraft,
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
 * ЭТО НЕ БЛОК. Орган рисует под-структуру (`GroupLabel` + строки) и стоит ВНУТРИ блока мудборда.
 * Обёртка в `Section` дала бы блок в блоке. Ровно поэтому предложенные колорвеи (B-25) отсюда
 * УЕХАЛИ: свой блок им нужен, а внутри чужого его не бывает — они смонтированы своей секцией в
 * стопке STUDIO (`design/studio-tab.tsx`, D5), и связывает их с прогоном модульный стор, а не
 * соседство в разметке.
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
  const nothingToRead = items.length === 0 && !concept.trim() && boardNotes.length === 0;
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
    const snapshot = { pictures: items.length, notes: boardNotes.length, fingerprint };
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

  function remember(row: ProposalRow, done: { value: string; lineKey?: string }, at: string) {
    const target: FillTarget | null = done.lineKey
      ? { kind: 'slot', lineKey: done.lineKey }
      : targetOfRow(row);
    if (!target) return;
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

  /** Клик по строке «TO DECIDE». Тот же писатель, та же запись журнала — разница только в жесте. */
  function accept(row: ProposalRow) {
    const done = applyRow(row);
    if (!done.ok) return;
    remember(row, done, hhmm());
    setReceipts((prev) => ({ ...prev, [row.id]: row.state === 'replace' ? 'replaced' : 'added' }));
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

  return (
    <div data-c19-draft=''>
      <GroupLabel>draft of the construction</GroupLabel>

      {/* СТАНДАРТНЫЙ ХВОСТ РЯДА, КАК У ЧЕТЫРЁХ ШАГОВ (SPEC п.4: «дуплет обязателен и у черновика
          мудборда»). Здесь стоял свой хвост без двери — на том основании, что «вход собирает сервер
          сам, и панели у доски не существует». Первое верно и печатается ПЕРВОЙ строкой панели;
          второе было отказом, а не фактом: что сервер ЧИТАЕТ (сколько картинок, сколько указаний,
          есть ли описание) известно точно, и это опись ФАКТОВ, а не догадка о тексте. `shape`
          называет состав, и строка про деньги — та же самая, дословно. */}
      <GenerateRow
        gate={gate}
        label='draft the construction ▸'
        pending={draftIdea.isPending}
        disabled={readOnly}
        onGenerate={askForDraft}
        shape={`${items.length} picture${items.length === 1 ? '' : 's'} · ${boardNotes.length} note${
          boardNotes.length === 1 ? '' : 's'
        }`}
        onInspect={() => setInspecting(true)}
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

      {staged && (
        <div className='mt-2'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' variant='label' component='span' data-c19-draft-head=''>
              read {staged.readPictures} picture{staged.readPictures === 1 ? '' : 's'} ·{' '}
              {staged.readNotes} note{staged.readNotes === 1 ? '' : 's'} · {staged.time}
            </Text>
            {stale && <Pill tone='attention'>the moodboard has changed since</Pill>}
            {price && (
              <Text size='nano' variant='label' component='span' className='ml-auto'>
                {price}
              </Text>
            )}
          </div>

          {nothingNew && (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              nothing new — the card already says all of this
            </Text>
          )}

          {/* ЧЕТЫРЁХ ГРУПП ПРИНЯТЫХ СТРОК ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО B-14, А НЕ УПРОЩЕНИЕ. Написанное
              видно ТАМ, ГДЕ ОНО ЖИВЁТ, — в поле, с записью в журнале ниже. Печатать его ещё и
              списком значило бы держать на экране два ответа на один вопрос «что теперь на
              карточке», и расходились бы они молча, как только человек поправит поле руками.
              Остаётся ровно то, чего орган НЕ написал: спор со словами человека. */}
          {open.length > 0 && (
            <div className='mt-1.5' data-c19-draft-group='decide'>
              <Text size='nano' variant='label' component='p' className='uppercase'>
                to decide — the card already says otherwise
              </Text>
              {open.map((row) => (
                <ProposalLine
                  key={row.id}
                  row={row}
                  receipt={receipts[row.id]}
                  readOnly={readOnly}
                  onAccept={() => accept(row)}
                  onDismiss={() =>
                    setReceipts((prev) => ({ ...prev, [row.id]: 'dismissed' as Receipt }))
                  }
                />
              ))}
            </div>
          )}

          {/* ⚠ ВОССТАНОВЛЕНО В КРУГЕ 20 ПОСЛЕ АДВЕРСАРНОГО РЕВЮ. Этот блок был снесён ВМЕСТЕ с
              группами предложений — молча, без единого слова обоснования, тогда как каждое другое
              удаление в этом файле несёт абзац со словами владельца. Ревью опознало пропажу именно
              по отсутствию абзаца: `diffProposal` продолжал `missing` ВЫЧИСЛЯТЬ, прото называет его
              живым READ-ONLY советом, а разбор брал только `rows`. То есть владелец ПЛАТИЛ за
              прогон, модель отвечала «шву кокетки нужна булавка на картинке 3», и фраза исчезала на
              приёме — беззвучно, потому что на экране её не было никогда.

              ЭТО СОВЕТ, А НЕ ПРЕДЛОЖЕНИЕ, и поэтому у строк НЕТ ни `accept`, ни `✕`: принять их
              некуда — на карточке нет поля, в которое булавка легла бы сама. Ставить сюда кнопку
              значило бы обещать действие, которого организм не умеет.

              МЕСТО ВЫБРАНО, А НЕ НАЙДЕНО: после спорного («что решить») и ПЕРЕД счётчиком.
              Счётчик считает РЕШЕНИЯ, а совет решением не является — попади он выше, он бы
              притворился строкой, которую надо принять; попади ниже счётчика, он читался бы как
              приписка к итогу. */}
          {missing.length > 0 && (
            <div className='mt-1.5' data-c19-draft-missing=''>
              <Text size='nano' variant='label' component='p' className='uppercase'>
                what deserves a pin
              </Text>
              {/* Ключ несёт позицию, а не текст: `missing` нигде не дедуплицируется (`diffProposal`
                  только нормализует и отбрасывает пустые), и прото на уникальность не подписывался,
                  в отличие от колорвеев. Повторённая моделью фраза дала бы столкновение ключей. */}
              {missing.map((line, i) => (
                <div key={`${i}:${line}`} className='border-b border-hairline py-1'>
                  <Text size='micro' component='p' className='break-words'>
                    {line}
                  </Text>
                </div>
              ))}
            </div>
          )}

          <div className='mt-1 flex flex-wrap items-baseline gap-2'>
            <Text size='nano' variant='label' component='span' data-c19-draft-count=''>
              {live.length} written · {open.length} to decide · {dismissed} dismissed
            </Text>
            {/* ⚠ ДВЕРЬ ВЕДЁТ ТУДА, КУДА ПРАВДА УЕХАЛИ ЗНАЧЕНИЯ, — А ЭТО БЛОКИ НИЖЕ НА ЭТОЙ ЖЕ
                СТРАНИЦЕ. Дизайн-документ называет `onGoTab('construction')`, но с круга 20 общие
                сведения, аспекты и слоты ПЕРЕЕХАЛИ на STUDIO, а на одноимённой вкладке остались
                операции и разбор. Уводить туда значило бы показать человеку экран без единого
                поля, которое орган только что заполнил. Двери нет вовсе, пока некуда идти: якорь
                ставит `ConstructionGeneralInfo` (`data-c19-general`), и его отсутствие — это
                монтаж органа в одиночку, а не «кнопка не нарисовалась». */}
            {live.length > 0 && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                data-c19-draft-go=''
                onClick={() => {
                  const target = document.querySelector('[data-c19-general]');
                  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                see it on CONSTRUCTION ▸
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ЖУРНАЛ СТОИТ СНАРУЖИ `staged`, И ЭТО НЕ ВЁРСТКА, А СМЫСЛ. Ответ прогона живёт в состоянии
          органа и умирает вместе с ним (студия монтируется условно); написанное на карточку живёт
          в модульном сторе и умирать не должно. Спрятать журнал вместе с ответом значило бы
          отобрать `✕` у человека, вернувшегося с COLORWAYS.

          ⚠ БЛОК ПРЕДЛОЖЕННЫХ КОЛОРВЕЕВ ЗДЕСЬ БОЛЬШЕ НЕ МОНТИРУЕТСЯ. Ночь он простоял тут
          подструктурой, пока `design/studio-tab.tsx` держала другая рука; теперь он свой `Section`
          в стопке STUDIO, под таблицей слотов (D5). Отсюда в него уходит ровно одно — `setProposals`
          в модульный стор выше по файлу: писатель и читатель разъехались по блокам, а стор их и
          связывает, переживая и уход со вкладки, и размонтирование студии. */}
      <DraftJournal
        fills={live}
        readOnly={readOnly}
        onUndo={undo}
        onUndoAll={() => {
          for (const f of live) undo(f);
          forgetMany(
            techCardId,
            live.map((f) => f.id),
          );
        }}
      />
    </div>
  );
}

/**
 * ОДНА СТРОКА ПРЕДЛОЖЕНИЯ: нано-подпись поля-адресата, значение чернилами, ОДИН чип.
 *
 * `add` — поле на карточке пусто; `replace` — там стоит другое, и оно печатается приглушённым
 * `was: …` НА ТОЙ ЖЕ СТРОКЕ (это и есть весь дифф, без единого предложения прозы); `same` — уже
 * стоит, и чипов нет вовсе. После клика чип становится квитанцией.
 *
 * ⚠ `dismiss` НЕ ПУНКТИРНЫЙ: пунктир в этой системе означает «добавить», и «dismiss» в костюме
 * добавления читается ровно наоборот тому, что делает.
 */
function ProposalLine({
  row,
  receipt,
  readOnly,
  onAccept,
  onDismiss,
}: {
  row: ProposalRow;
  receipt?: Receipt;
  readOnly: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div
      className='flex items-start gap-2 border-b border-hairline py-1'
      data-c19-draft-row={row.id}
      data-state={row.state}
    >
      <Text size='nano' variant='label' component='span' className='w-24 shrink-0 truncate'>
        {row.label}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-1 break-words'>
        {row.value}
        {row.state === 'replace' && row.current && (
          <Text size='nano' variant='label' component='span' className='ml-2'>
            was: {row.current}
          </Text>
        )}
      </Text>
      {receipt ? (
        <Text size='nano' variant='label' component='span' className='shrink-0' data-c19-draft-receipt={receipt}>
          {receipt}
        </Text>
      ) : row.state === 'same' ? (
        <Pill tone='mut'>same</Pill>
      ) : (
        <ChipRow className='shrink-0'>
          <Chip
            disabled={readOnly}
            onClick={onAccept}
            data-c19-draft-accept={row.id}
            title={
              row.state === 'replace'
                ? 'replace the card’s value with this one'
                : 'write this onto the card'
            }
          >
            {row.state === 'replace' ? 'replace' : 'add'}
          </Chip>
          <Chip
            disabled={readOnly}
            onClick={onDismiss}
            data-c19-draft-dismiss={row.id}
            title='this one is not wanted'
          >
            dismiss
          </Chip>
        </ChipRow>
      )}
    </div>
  );
}

/**
 * ЖУРНАЛ «БЫЛО → СТАЛО» — ЭТО И ЕСТЬ «ПОДСВЕЧИВАТЬ ЧТО ЗАПОЛНИЛО И ЕСЛИ МЫ ЗАХОТИМ ТО УДАЛИМ».
 *
 * ⚠ ОН НЕ УКРАШЕНИЕ И НЕ ЛОГ. Запись без `было` даёт кнопку, которая может только ОЧИСТИТЬ поле,
 * — а очистка поля, где до черновика стояли слова человека, это ровно та потеря, от которой
 * стережёт весь файл, только сделанная его же рукой. Поэтому строка называет обе половины: что
 * стоит теперь и что стояло до. `—` в позиции «было» — законный ответ «не стояло ничего», и он
 * ПЕЧАТАЕТСЯ, а не опускается: пустота, названная словом, отличима от пустоты забытой.
 *
 * СТРОКИ ТОЛЬКО ЖИВЫЕ. Заполнение, чей текст человек с тех пор поправил, сюда не приходит вовсе:
 * его `✕` унёс бы вместе с машинными и ЕГО слова (см. `isLive`).
 */
function DraftJournal({
  fills,
  readOnly,
  onUndo,
  onUndoAll,
}: {
  fills: Fill[];
  readOnly: boolean;
  onUndo: (fill: Fill) => void;
  onUndoAll: () => void;
}): JSX.Element | null {
  if (fills.length === 0) return null;
  return (
    <div className='mt-3' data-c19-journal=''>
      <GroupLabel
        action={
          !readOnly && (
            <Button type='button' variant='underline' size='xs' data-c19-undo-all='' onClick={onUndoAll}>
              undo all {fills.length} ▸
            </Button>
          )
        }
      >
        written by the draft
      </GroupLabel>
      {fills.map((fill) => (
        <div
          key={fill.id}
          className='flex items-start gap-2 border-b border-hairline py-1'
          data-c19-fill={fill.id}
        >
          <Text size='nano' variant='label' component='span' className='w-24 shrink-0 truncate'>
            {fill.label}
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1 break-words'>
            {fill.after}
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
          <ChipRow className='shrink-0'>
            <Chip
              disabled={readOnly}
              onRemove={() => onUndo(fill)}
              data-c19-undo={fill.id}
              title='written by the draft — ✕ puts back what stood here'
            >
              drafted
            </Chip>
          </ChipRow>
        </div>
      ))}
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
