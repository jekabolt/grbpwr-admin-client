import { GetDesignBandResponse, common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AiEnhance } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Tiles } from 'ui/components/tiles';

import type { TechCardFormData } from '../schema';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isBoardRow,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { useTechCardAutosave } from './autosave-contract';
import { displayDetailName, readBench } from './bench-slot';
import { useMoodMinimumGate } from './chain-rail';
import { cropFamilies } from './generation/composite';
import { flatInputBusy, readFlatInput, setFlatInputClearing, useFlatInput } from './flat-input';
import { FlatRunRow } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { EmptyState, GROUP_GAP, PlaceOrDrawCell } from './core';
import { cardFactsContext, composeWords } from './core/card-facts';
import { useCardFacts } from './head/card-facts-form';
import { VectorModal } from './modals';
import { PictureTile } from './picture-tile';
import { benchSides, pictureOffersSplit } from './render/model';
import { useSplitToInput } from './split-to-input';
import { ACTIVE_VIEWS, DETAIL_VIEW, normaliseViewKey, viewLabel } from './views';
import { cardOnScreen, useDesignWrites } from './use-design-band';
import {
  dropWords,
  lockWords,
  offerWords,
  pickShownWords,
  settleWords,
  useWordsSeed,
  wordsDecided,
} from './words-seed';

/**
 * РЕФЕРЕНСЫ — ВХОД, а не доска. Мудборд собирает настроение для человека; здесь лежит то, что
 * увидит модель, когда будет рисовать флэт, и в каком порядке.
 *
 * КАРТИНОК МУДБОРДА ЗДЕСЬ НЕ БЫВАЕТ (U-5). Блок рисует РОВНО строки входа — `moodboardMedia` со
 * `kind = REFERENCE`; плитки доски в него не попадают ни поштучно, ни полосой. Полоса
 * «from the moodboard» с миниатюрами доски, стоявшая здесь, снята прямым требованием владельца:
 * она рисовала одну и ту же картинку в двух блоках и превращала вход в витрину доски. Ссылка
 * `or from the moodboard`, взводившая выбор плитки на доске (`useInputPick`), снята вторым
 * требованием владельца (R-16) — вместе с объясняющей подписью ячейки. Вход пополняется своим
 * слотом: клик в библиотеку, ⌘V, бросок файла.
 *
 * РОЛЬ ЖИВЁТ В ПОЛОСЕ, А НЕ В ДОКУМЕНТЕ, И ЭТО ВЫНУЖДЕНО (Р-1). В документе референс — это
 * `TechCardMediaItem{media_id, kind, caption}`, где `kind` УЖЕ занят тем, чем картинка ЯВЛЯЕТСЯ
 * (`MOODBOARD | REFERENCE | SWATCH`). Колонкой на `tech_card_media` роль тоже не положишь: у той
 * таблицы нет ключа строки вовсе, она переписывается целиком каждым сейвом, и перенести атрибут на
 * пересланную строку не на что. Поэтому роль — это `design_reference`, и пишется она ровно одним
 * глаголом, `SetDesignReferenceRole`, где пустая роль означает «убрать».
 *
 * ЧТО СЧИТАЕТСЯ РЕФЕРЕНСОМ. Две половины, и обе нужны:
 *   • ДОКУМЕНТНАЯ — строка карточки с `kind = REFERENCE`. Она переживает перезагрузку и существует
 *     до того, как человек назвал роль: иначе «добавил картинку во вход» было бы действием без
 *     следа до второго действия.
 *   • ПОЛОСНАЯ — роль в `band.references`. Она и есть «в промпте».
 * Членство — ОБЪЕДИНЕНИЕ: картинка с ролью показывается здесь, даже если её строка потерялась
 * (дрейф данных, карточка из клона). Роль — более сильное утверждение, и прятать носителя роли
 * значило бы завести запись, которую не видно ни на одном экране и которую нечем снять.
 *
 * НОСИТЕЛЬ РОЛИ БЕЗ СТРОКИ — НЕ ОБВИНЯЕМЫЙ (S-6). Плашка «off the card» и запертая на том же
 * признаке записка сняты прямым словом владельца: референсы — «буквально то, что идёт в промпт,
 * это не флэты, они не должны быть в карточке». Правило «медиа принадлежит карточке» — про флэты
 * изделия; к входу модели оно не применяется вовсе, и состояние «роль есть, строки нет» — не
 * нарушение, а законная форма референса. На экране такой референс ничем не отличается от
 * остальных: роль меняется, записка пишется, ✕ снимает его целиком.
 *
 * ✕ УНОСИТ СУЩНОСТЬ ЦЕЛИКОМ — картинку входа и её роль — и спрашивает перед этим,
 * называя, в скольких прогонах эта картинка участвовала. Доски он не касается: там своя строка со
 * своим ✕, который называет свою цену.
 *
 * ОПИСЕЙ СНИМКА ЗДЕСЬ НЕТ (T-11, круг 4): «the pictures it was given», «the plates it was given» —
 * НИКОГДА, слово владельца; опись того, что уедет, живёт в модалке «what the model gets ▸».
 * ⚠ РЯД GENERATE ТЕПЕРЬ СТОИТ В ЭТОЙ ЖЕ СЕКЦИИ (SPEC п.7, `./flat-run-row.tsx`): владелец слил
 * отдельный блок `GENERATION — FLAT` с входом — то, что модели дают, и то, что у неё просят, один
 * запрос. Записки у картинок больше нет (SPEC п.10): один общий текст — garment description.
 *
 * ═══ ПОРЯДОК БЛОКА — ЭКРАН МАКЕТА (`_step-flat.js`, `fInputBlock`), РЯДАМИ, БЕЗ ЛИНЕЕК ГРУПП ═══
 *   заголовок  INPUT — REFERENCES · what this run is given (дверей в шапке нет — D-21)
 *   1.1  сетка плиток референсов (кадр 1:1, `#N` в углу, селект вида СРАЗУ под кадром) +
 *        последняя ячейка — плитка на две половины: слот медиа сверху, «draw a reference» снизу;
 *        пусто → та же плитка одна в сетке (второй пары кнопок больше нет);
 *        под сеткой справа — тихая дверь `clear the input ✕` (D-21, волна 25.09);
 *   1.2  WORDS — textarea во всю ширину (`garmentDescription`), засеянная фактами карточки, когда
 *        она пуста (D-20''/D-20'''), раз за сессию и только на экране — на сервер засев уезжает с
 *        первой правкой или с GENERATE; в правом нижнем углу счётчик `N / 2000` и `ai ✦`;
 *   1.3  ряд запуска (`./flat-run-row.tsx`): VIEWS (продуктовая строка — проводу нужны
 *        `views[]`), GENERATE · цена · WHAT THE MODEL GETS ▸.
 * Двери `from construction ▸` и `also send the flat slots` (с лентой плит) сняты владельцем
 * (T24, D-20): всё, что они приносили, теперь стоит в WORDS с самого начала, а плиты верстака в
 * прогон флэта больше не едут вовсе (`useFlatSlots` всегда false).
 * Здесь стояла сетка 2×N с кадром 160px и правой колонкой на роль, линейка «garment description»
 * и линейка «also shown — flat slots» с миниатюрами плит; владелец увидел и сказал «не как в
 * референсе». Кожа — продукта (`ui/components`), логика — продукта (RPC, поля формы).
 *
 * ФЛЭТЫ САМИ СЮДА НЕ ПОПАДАЮТ (T-15): «в INPUT — REFERENCES не должны уходить все флеты если мы их
 * явно туда сами не добавим». Строку входа заводят ровно три ЖЕСТА ЧЕЛОВЕКА — слот «+ reference»
 * ниже, «take into input» на плитке мудборда и разрез СВОЕГО референса угловой кнопкой split. Тот
 * же хук разреза работает и на верстаке, но там он входа не пополняет (`addToInput` ниже).
 */

/**
 * Роли промпта. Значения — проводные (`front | back | side_l | side_r | detail`, см.
 * `common.DesignReference`; снятые `three_quarter_l | three_quarter_r` провод по-прежнему несёт —
 * см. `roleItemsFor`); пустая строка это ПУНКТ СПИСКА, а не отсутствие пункта, и потому законный
 * выбор: примитив селекта пропускает пустоту только когда её кто-то предложил, иначе гасит
 * фантомную пустоту скрытого нативного `<select>`.
 */
/**
 * Потолок `garmentDescription` — ЕДИНСТВЕННОЕ НАПИСАНИЕ ЭТОГО ЧИСЛА. Его читают `maxLength`
 * самого поля, засев фактами (`composeWords` — опускает секции ЦЕЛИКОМ, а не режет хвост) и
 * `ai ✦` (`maxRunes`). Два разных потолка на одно поле — это способ потерять текст на том из них,
 * который меньше (ровно тот же довод, что у `CONCEPT_MAX` в `./mood-board`).
 */
const GARMENT_MAX = 2000;

/**
 * ЗАМОК ЗАСЕВА WORDS НА СЕССИЮ (D-20'') и сам засев (D-20'''') живут в `words-seed.ts`: засев в
 * значения формы не пишется, пока человек не подействовал, и все, кто читает слова на экране, читают
 * их оттуда.
 */

type RoleItem = { value: string; label: string; disabled?: boolean };

const ROLE_ITEMS: RoleItem[] = [
  { value: '', label: '— not sent —' },
  // ЧЕТЫРЕ СТОРОНЫ И ДЕТАЛЬ (`views.ts`, `ACTIVE_VIEWS`): 3/4 сняты владельцем (D-18) и больше не
  // предлагаются. Слов макета «silhouette / stitching / hardware» на проводе НЕТ — селект остаётся
  // продуктовым.
  ...ACTIVE_VIEWS.map((view) => ({ value: view, label: viewLabel(view) })),
  { value: DETAIL_VIEW, label: viewLabel(DETAIL_VIEW) },
];

/**
 * ═══ РОЛЬ, КОТОРОЙ НЕТ СРЕДИ ПУНКТОВ, ОСТАЁТСЯ ВИДНА — НЕАКТИВНЫМ ПУНКТОМ (D-18', Codex B-08) ═══
 *
 * У референсов беты и прода есть роли `three_quarter_l|r`, а пунктов таких больше нет. Без пункта
 * Radix не может поставить значение в свой скрытый нативный `<select>`, тот остаётся при пустой
 * строке и отдаёт её наружу как выбор — а этот селект ПРЕДЛАГАЕТ пустоту («— not sent —»), поэтому
 * примитив её пропускает, и `setRole(…, '')` СТИРАЕТ роль на сервере без единого жеста человека.
 * Поэтому текущая роль, которой нет в списке, добавляется последним пунктом — видимым, отмеченным
 * и НЕАКТИВНЫМ: её не выбрать заново, но и не потерять молча. Снять её — явный выбор
 * «— not sent —» или другой стороны.
 *
 * Правило общее, а не про 3/4 поимённо: роль из словаря более нового сервера упала бы в ту же яму.
 * Подпись — `viewLabel`, то есть «3/4 left (legacy)» для снятых и ключ как есть для незнакомого.
 *
 * ⚠ ОДНОГО ПУНКТА МАЛО, НУЖЕН ЕЩЁ КЛЮЧ СЕЛЕКТА (`selectKeyFor`), И ЭТО ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО
 * (`probe-flat.mjs`, сцена «снятая роль», студия внутри <form>, как на странице карточки). Когда
 * роль ПЕРЕХОДИТ в снятую на смонтированной ячейке (перечтение полосы после записи из старой
 * вкладки), пункт и значение приезжают одним рендером, а нативная `<option>` регистрируется
 * лейаут-эффектом пункта — ПОЗЖЕ, чем пассивный эффект скрытого `<select>` ставит новое значение.
 * В это окно опции ещё нет, и фантомное '' улетало всё равно. Смена ключа при переходе между
 * «роль из списка» и «роль сверх списка» перемонтирует селект: на первом рендере Radix значение
 * не «меняется», события нет, а опция успевает встать до следующего.
 */
function roleItemsFor(role: string): RoleItem[] {
  const current = role.trim();
  if (!current || ROLE_ITEMS.some((item) => item.value === current)) return ROLE_ITEMS;
  return [...ROLE_ITEMS, { value: current, label: viewLabel(current) || current, disabled: true }];
}

/** Ключ селекта роли: один на все предлагаемые роли, свой — на каждую роль сверх списка. */
function selectKeyFor(role: string): string {
  return roleItemsFor(role) === ROLE_ITEMS ? 'offered' : `kept:${role.trim()}`;
}

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

const fullUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

/** Строка указаний карточки. Поле одно на всю карточку и приколото к `media_id` (см. J-8 ниже). */
type CalloutRow = NonNullable<TechCardFormData['callouts']>[number];

/**
 * ЧТО ПОДСКАЗКА РЕЗА ВПРАВЕ УТВЕРЖДАТЬ О ЭТОЙ КАРТИНКЕ — ответ троичный, и он назван типом.
 *
 *   · `declared` — полоса ЗАЯВИЛА виды (`composite_views`), и подсказка вправе говорить факт;
 *   · `no`       — полоса заявила обратное (одновидовой чертёж, уже резаный кадр);
 *   · `unknown`  — за медиа чертежа полосы нет вовсе (обычная ссылка из библиотеки). Система не
 *                  знает и знать не может.
 *
 * ⚠ С r3 ЭТО БОЛЬШЕ НЕ ВОРОТА ДВЕРИ, А ТОЛЬКО ЕЁ СЛОВА. Владелец: «на референсах должна быть
 * возможность маркать мультивью» — мультивью объявляет ЧЕЛОВЕК, и `no` (файл ничего не заявил)
 * не значит «резать нечего». Дверь стоит на всех трёх значениях; различаются подсказки, и на
 * двух из трёх подсказка честно говорит «only you can tell» (разбор у самой двери, ниже).
 */
type SplitOffer = 'declared' | 'no' | 'unknown';

export function ReferencesSection({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { setReferenceRole, setBenchSlot } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const readOnly = !!disabled;

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const rows = useMemo(() => all.filter(isInputRow), [all]);
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    // МЕДИА КАРТИНОК ПОЛОСЫ — вторым слоем: кропы сплита (и вообще всё, что родилось в полосе)
    // появляются в библиотечной карте только после её перечтения, а строка входа на них уже
    // стоит. Без этого слоя свежий кроп рисовался бы как «media #N not resolved» — данные целы,
    // не хватает лишь разрешения id в файл, и полоса его уже привезла.
    for (const batch of band.batches ?? [])
      for (const p of batch.pictures ?? []) {
        if (p.media?.id != null && !m.has(p.media.id)) m.set(p.media.id, p.media);
      }
    for (const run of band.runs ?? [])
      for (const p of run.pictures ?? []) {
        if (p.media?.id != null && !m.has(p.media.id)) m.set(p.media.id, p.media);
      }
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [libraryMap, picked, band.batches, band.runs]);

  /**
   * ═══ ЧТО ПОДСКАЗКА РЕЗА ЗНАЕТ ОБ ЭТОЙ СТРОКЕ ВХОДА (F-8, F-18 → r3 п.4) ═════════════════════
   *
   * Владелец, круг F: «везде где картинка не мультивью флет или рендер там не должно на ховер
   * показываться сплит» и «на уже заспличеных картинках на ховер сплит писать не нужно».
   * Владелец, r3 п.4: «на референсах должна быть возможность маркать мультивью».
   *
   * ⚠ КРУГ ЗАМКНУЛСЯ, И ЭТО СКАЗАНО ЧЕСТНО. Круг F-8/F-18 УБРАЛ дверь у кадра, который видов не
   * заявил; r3 п.4 её ВЕРНУЛ — но не откатом, а с другим носителем смысла. Тогда дверь ставилась
   * молча и утверждала собой «здесь несколько видов»; теперь она ПРЕДЛАГАЕТ, а утверждение живёт
   * в подсказке, которую эта карта и считает. Жалоба владельца была на ЛОЖЬ угла, а не на его
   * присутствие, и словами её снимает подсказка, а не отсутствие двери.
   * Носитель правила один — `pictureOffersSplit` (`render/model.ts`), и эта карта готовит
   * ему ровно два факта, которых у строки входа нет на руках.
   *
   * СТРОКА ВХОДА — ЭТО `media_id`, А ПРЕДИКАТ СПРАШИВАЕТ ПРО `DesignPicture`. Разрешение идёт по
   * тому же обходу, что и `mediaById` выше (прогоны и партии полосы), и результат ТРОИЧЕН — теперь
   * и по типу, а не только по смыслу.
   *
   * ⚠ ПОЧЕМУ ДВЕРЬ БОЛЬШЕ НЕ ГЕЙТИТСЯ ЭТОЙ КАРТОЙ ВОВСЕ. Ссылка, ВЫБРАННАЯ ИЗ БИБЛИОТЕКИ, чертежа
   * полосы не имеет — за ней не стоит ни прогона, ни партии, — а у принесённого руками листа
   * `composite_views` пусты ПО ОПРЕДЕЛЕНИЮ: объявить его многовидовым может только человек. То
   * есть под «полоса заявила обратное» и «разрешить не удалось» попадал не край, а обычный,
   * ежедневный случай, и исход был ровно один: лукбук на четыре вида, брошенный в
   * INPUT — REFERENCES, не резался НИГДЕ. `onCrop` рядом жив, но он режет ОДИН кадр и замещает
   * им строку — это другой глагол, а не замена.
   *
   * Полоса флэтов отвечала на тот же вопрос ИНАЧЕ — там для этого заведено именованное исключение
   * (`broughtByHandAndUncut`), — и одна из двух копий правила просто не была дописана. Теперь обе
   * ленты отвечают одинаково: дверь стоит, а знание о файле живёт в её словах.
   *
   * `alreadyCut` — транзитивно, через `cropFamilies`: внук листа делает лист резаным ровно так же,
   * как прямой кусок (та же карта, что рисует колоды на полосах). Скрытые чертежи из пула НЕ
   * выкидываются намеренно: вопрос здесь «резали ли уже», а не «видно ли результат», и спрятанный
   * кусок — доказательство реза не хуже видимого.
   *
   * КОЛЛИЗИЯ РАЗРЕШАЕТСЯ В ПОЛЬЗУ НОВЕЙШЕЙ СТРОКИ. Один файл может стоять за двумя чертежами
   * (пере-регистрация загрузки заводит НОВУЮ строку с пустым `composite_views`), и говорить про
   * кадр надо той строкой, которую карточка показывает сейчас.
   */
  const splitOffered = useMemo(() => {
    const pool: common_DesignPicture[] = [];
    for (const run of band.runs ?? []) pool.push(...(run.pictures ?? []));
    for (const batch of band.batches ?? []) pool.push(...(batch.pictures ?? []));

    const families = cropFamilies(pool);
    const newestOf = new Map<number, common_DesignPicture>();
    for (const picture of pool) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId <= 0 || (picture.id ?? 0) <= 0) continue;
      const seen = newestOf.get(mediaId);
      if (!seen || (picture.id ?? 0) > (seen.id ?? 0)) newestOf.set(mediaId, picture);
    }

    const offers = new Map<number, SplitOffer>();
    for (const [mediaId, picture] of newestOf) {
      const cut = (families.membersOf.get(picture.id ?? 0) ?? []).length > 0;
      offers.set(mediaId, pictureOffersSplit(picture, cut) ? 'declared' : 'no');
    }
    return offers;
  }, [band.runs, band.batches]);

  // Запись состава карточки — ПО КОРНЮ массива, как и на доске: два экземпляра поля-массива на одно
  // имя не синхронизируются, а мудборд смонтирован рядом и правит вторую половину того же списка.
  const writeItems = (next: BoardItem[]) =>
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });

  /**
   * РОЛЬ И ЗАПИСКА ПРИХОДЯТ ОДНОЙ СТРОКОЙ ПОЛОСЫ, и читаются они тоже вместе: записка живёт на
   * строке роли (`DesignReference.note`), а не на строке документа. Второй дом у неё был бы
   * `tech_card_media.caption`, и две записки на одну картинку разошлись бы в первый же день.
   *
   * Фильтр по непустой роли оставлен сторожем: контракт обещает, что роли на проводе не бывает
   * пустой (пустая — это удаление строки), и строка, нарушившая обещание, здесь просто не
   * считается ролью, а не превращается в невидимого носителя записки.
   */
  const refOf = useMemo(() => {
    const m = new Map<number, { role: string; note: string; detailSlotId: number }>();
    for (const r of band.references ?? []) {
      const role = (r.role ?? '').trim();
      if (r.mediaId != null && role)
        m.set(r.mediaId, {
          role,
          note: r.note ?? '',
          // КАКОЙ ДЕТАЛИ ЭТА КАРТИНКА (J-9) — `design_bench_slot(id)`, 0 = не сказано. Ноль здесь
          // НЕ ошибка и не пустота данных: строка старше поля, либо слот удалён (FK ON DELETE SET
          // NULL). Оба состояния ячейка говорит СЛОВАМИ, а не выдумывает имя, которого у неё нет.
          detailSlotId: r.detailSlotId ?? 0,
        });
    }
    return m;
  }, [band.references]);

  /**
   * ═══ ИМЯ ДЕТАЛИ ТАМ, ГДЕ ДЕТАЛЬ — J-9 ═══════════════════════════════════════════════════════
   *
   * ОДИН СПИСОК НА ДВА ЭКРАНА, И ЭТО НЕ ЭКОНОМИЯ, А УСЛОВИЕ ЗАДАЧИ. Владелец требует одно и то же
   * имя здесь и в GENERATION — FLAT — VIEWS; та форма рисует свои чипы из `readBench(band,'flat')
   * .details`, поэтому ячейка читает РОВНО ТОТ ЖЕ список тем же `displayDetailName` — включая его
   * суффикс `(2)` для тёзок. Второй способ добыть имя разошёлся бы с первым на первой же
   * переименованной детали, и владелец увидел бы два разных слова про одну деталь.
   *
   * ⚠ ИМЯ НЕ КОПИРУЕТСЯ В РЕФЕРЕНС, И ЭТО РЕШЕНИЕ КОНТРАКТА. На проводе лежит УКАЗАТЕЛЬ
   * (`detail_slot_id`), а не текст: имя детали переименуемо, и копия начала бы расходиться с
   * оригиналом молча. Поэтому имя РАЗРЕШАЕТСЯ здесь, на каждом рендере, из живого верстака.
   */
  const flatDetails = useMemo(() => readBench(band, 'flat').details, [band]);
  const detailNameOf = (slotId: number): string | null => {
    if (slotId <= 0) return null;
    const slot = flatDetails.find((d) => (d.id ?? 0) === slotId);
    return slot ? displayDetailName(flatDetails, slot) : null;
  };

  // ЧЛЕНСТВО И ПОРЯДОК. Порядок — это порядок добавления во вход, то есть позиция строки входа в
  // `moodboardMedia`; картинка, несущая роль, но потерявшая строку (дрейф), встаёт в хвост, чтобы
  // её было чем снять. Ничем, кроме места в хвосте, она не отличается (S-6): различие «строка ли
  // на карточке» здесь больше не рисуется и ничего не запирает.
  const members = useMemo(() => {
    const onCard = rows.map((i) => i.mediaId);
    const seen = new Set(onCard);
    const strays = [...refOf.keys()].filter((id) => !seen.has(id));
    return [...onCard, ...strays];
  }, [rows, refOf]);

  /**
   * НОМЕРА ПРОМПТА ПЛОТНЫЕ И НЕ ХРАНЯТСЯ (И-3). Они присваиваются сканом по порядку с пропуском
   * безролевых — поэтому снятая роль пере-нумеровывает соседей САМА, без единой лишней записи, и
   * дырки «1, 3, 4» не бывает по построению. Хранимый номер потребовал бы N записей на каждое
   * снятие роли и разъезжался бы при первой же гонке двух вкладок.
   */
  const promptNumber = useMemo(() => {
    const m = new Map<number, number>();
    let n = 0;
    for (const mediaId of members) {
      if (refOf.has(mediaId)) m.set(mediaId, ++n);
    }
    return m;
  }, [members, refOf]);

  const inPrompt = promptNumber.size;

  /**
   * СКОЛЬКО ПРОГОНОВ ЧИТАЛИ ЭТУ КАРТИНКУ. Считается по снимкам входа, которые собирает СЕРВЕР
   * (`run.inputs.refs[].media_id`), а не по нынешнему составу входа: вопрос про прошлое, и
   * отвечать на него сегодняшним списком значило бы отвечать не на него.
   *
   * ЦЕНА НАЗВАНА: полоса отдаёт ПЕРВУЮ страницу истории, поэтому счёт может быть неполным, и
   * вопрос говорит «at least». Дочитывать всю историю ради предупреждения — это N запросов на
   * каждое открытие карточки ради строки, которая всё равно ничего не уничтожает: снимок прогона
   * заморожен на сервере и удалением референса не портится.
   */
  const runsByMedia = useMemo(() => {
    const m = new Map<number, number>();
    for (const run of band.runs ?? []) {
      const seen = new Set<number>();
      for (const ref of run.inputs?.refs ?? []) {
        if (ref.mediaId == null || seen.has(ref.mediaId)) continue;
        seen.add(ref.mediaId);
        m.set(ref.mediaId, (m.get(ref.mediaId) ?? 0) + 1);
      }
    }
    return m;
  }, [band.runs]);

  const historyComplete = !(band.nextPageToken ?? '').trim();

  /** Позиция во входе — она же `ordinal` на проводе. */
  const ordinalOf = (mediaId: number) =>
    Math.max(1, rows.findIndex((i) => i.mediaId === mediaId) + 1);

  /**
   * @param detailSlotId — ТОЛЬКО когда вызывающий ЗНАЕТ слот детали (J-9). Опущенный параметр
   * едет нулём, а ноль на проводе значит «оставь как было», НЕ «очисти». Роль, отличная от
   * `detail`, очищает связь на сервере сама.
   *
   * ⚠ ЗАПИСКА С ЭКРАНА СНЯТА (SPEC п.10, CONTRACT §F), НО С ПРОВОДА — НЕТ. `SetDesignReferenceRole`
   * пишет `role+note+detailSlotId` ОДНИМ upsert, и у `note` три состояния: ОТСУТСТВИЕ поля —
   * «оставь как было», ПРИСУТСТВИЕ с `''` — «сотри» (`use-design-band.ts`). Поэтому здесь `note`
   * НЕ передаётся вовсе: `undefined` выбрасывается `JSON.stringify` и до сервера не доезжает, и
   * записка, которую кто-то писал раньше (или пишет другой клиент), переживает смену роли
   * нетронутой. Передать `''` значило бы стереть чужие слова молча — ровно та потеря, от которой
   * этот параграф. Единственный вызов, который несёт записку, — перенос на кроп
   * (`replaceReference`), и он несёт значение, ПРИШЕДШЕЕ С СЕРВЕРА, а не своё.
   */
  function writeRef(mediaId: number, role: string, detailSlotId?: number) {
    // ORDINAL — ЭТО ПОЗИЦИЯ ВО ВХОДЕ, а не номер промпта. Номер промпта выводится сканом (см.
    // выше), и класть его в хранимое поле значило бы завести второй источник одной величины.
    setReferenceRole.mutate({
      mediaId,
      role,
      ordinal: role ? ordinalOf(mediaId) : 0,
      detailSlotId,
    });
  }

  function setRole(mediaId: number, role: string) {
    /* ─── РОЛЬ `detail` ЗАВОДИТ СЛОТ, А НЕ ТОЛЬКО ПОДПИСЫВАЕТ КАРТИНКУ (V-1) ───
     * Форма генерации предлагает ровно слоты (`bench.details` → `detail_slot_ids`), поэтому выбор
     * `detail` заводит ПУСТОЙ именованный слот на верстаке (плиту — чертёж детали — вернёт прогон;
     * фотография остаётся референсом с ролью). Имя обязательно: безымянный слот приезжает в промпт
     * словом «detail». Имя спрашивается ДО записи — `DetailNamingModal`. */
    if (normaliseViewKey(role) === DETAIL_VIEW) {
      setNamingDetail({ mediaId });
      return;
    }
    // Пустая роль удаляет строку полосы (и записку на ней — по контракту провода). Записки на
    // экране больше нет, спрашивать о ней нечего; сама роль — не потеря: селект стоит рядом.
    writeRef(mediaId, role);
  }
  function addReferences(added: common_MediaFull[]) {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isInputRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: REFERENCE_KIND,
      max: INPUT_MAX,
      scopeLabel: 'input',
    });
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  // ── ✕ референса: цитата перед уничтожением ──────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const pendingRuns = pendingRemove == null ? 0 : runsByMedia.get(pendingRemove) ?? 0;
  /** Референс, который назначают деталью: ждём имени (обязательного). */
  const [namingDetail, setNamingDetail] = useState<{ mediaId: number } | null>(null);

  function confirmRemove() {
    const mediaId = pendingRemove;
    setPendingRemove(null);
    if (mediaId == null) return;
    // Порядок важен: сначала снимается роль (сервер отвергнет роль на медиа, которого карточка
    // больше не держит), потом уходит строка входа вместе с запиской.
    if (refOf.has(mediaId)) setReferenceRole.mutate({ mediaId, role: '', ordinal: 0, note: '' });
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter(
        (i) => !(i.mediaId === mediaId && isInputRow(i)),
      ),
    );
  }

  // ── clear: ТОЛЬКО ПРОМПТ, картинки остаются (SPEC п.8, CONTRACT §B) ─────────────────────────
  const [clearAsk, setClearAsk] = useState(false);
  /* ВХОД ЗАНЯТ — из модульного хранилища карточки (`useFlatInput`, `flat-run-row.tsx`), а не из
     состояния секции: и GENERATE, и CLEAR переживают смену шага, а секция — нет.
     · `run` — GENERATE ждёт сохранения или ответа: слова, роли, ✕, сплит и CLEAR заперты — прогон
       прочтёт то, что сохраняется сейчас, и правка поверх уехала бы мимо него (ревью MAJOR и [2]);
     · `clearing` — CLEAR снимает роли по одной: заперты те же органы, а GENERATE ждёт (ревью [2]). */
  const flatInput = useFlatInput(techCardId);
  const clearing = flatInput.clearing;
  const inputBusy = flatInput.run !== null || flatInput.clearing;

  /**
   * ЧТО ЧИСТИТСЯ: слова (`garmentDescription`) и роли референсов (и с ними — порядок промпта).
   * ЧТО НЕ ТРОГАЕТСЯ: строки входа. Здесь стоял фильтр, вырезавший их из `moodboardMedia`, то есть
   * `clear` УНОСИЛ КАРТИНКИ; макет говорит обратное — «The pictures stay». Строка входа без роли
   * сегодня и есть «картинка есть, в промпте нет» (модель читает только `design_reference`), так
   * что ей не нужно ни менять `kind`, ни переезжать на доску: она остаётся на своём месте с
   * плашкой «not in prompt», и её есть чем вернуть в промпт — тем же селектом.
   *
   * 1. РОЛИ СНИМАЮТСЯ ПО ОДНОЙ. Bulk-глагола на проводе нет — N вызовов `SetDesignReferenceRole
   *    (role='')`, и они НЕ атомарны: частичный провал НЕ съедается, итог говорит «cleared K of N».
   *    Пустая роль удаляет строку полосы целиком (это и есть её существование) — записка на ней
   *    уходит с ней по контракту провода, других записей этот жест не делает.
   * 2. ОПИСАНИЕ чистится ТОЛЬКО В ФОРМЕ — у поля нет своего RPC, оно едет с документом. `''` —
   *    команда «сотри» трёхсостоянийного протокола; до сейва сервер держит старый текст. Вопрос
   *    ниже называет это словами, чтобы «clear» не обещал больше, чем делает. CLEAR снимает засев
   *    (`dropWords`, `words-seed.ts`): стёртое не засевается до перезагрузки страницы.
   */
  async function runClear() {
    setClearAsk(false);
    const card = techCardId;
    // Щелчок по двери, вернувшейся к идущему GENERATE или CLEAR, ничего не начинает.
    const at = readFlatInput(card);
    if (at.run !== null || at.clearing) return;
    setFlatInputClearing(card, true);
    const roleIds = [...refOf.keys()];
    const failed = new Set<number>();
    try {
      // Последовательно, а не залпом: «кто не очистился» должно совпадать с тем, что осталось на
      // экране, детерминированно.
      for (const mediaId of roleIds) {
        try {
          await setReferenceRole.mutateAsync({ mediaId, role: '', ordinal: 0 });
        } catch {
          failed.add(mediaId);
        }
      }
      // D-20'''': `''` в форму (стёрты сохранённые — эта правка и уедет; стоял один засев — форма и так
      // пуста, писать нечего), и засев снят до перезагрузки страницы.
      setValue('garmentDescription', '', { shouldDirty: true });
      dropWords(card);
    } finally {
      setFlatInputClearing(card, false);
    }
    // Итог — только над карточкой, которая на экране: страница перемонтируется по карточке, и итог
    // CLEAR карточки A не должен печататься над карточкой B (ревью раунда 3, m5).
    if (!cardOnScreen(card)) return;
    if (failed.size) {
      showMessage(
        `cleared ${roleIds.length - failed.size} of ${roleIds.length} prompt roles — ${failed.size} reference${failed.size === 1 ? '' : 's'} kept ${failed.size === 1 ? 'its' : 'their'} role`,
        'error',
      );
    } else {
      showMessage('the prompt is clear — the pictures stay', 'success');
    }
  }

  // ЗУМА СВОЕГО У БЛОКА БОЛЬШЕ НЕТ. Здесь стоял локальный `MediaViewer` со списком, собранным из
  // одних только референсов, — то есть шестой просмотрщик полосы со своим рядом листания. Владелец
  // (круг 4, пункт 8): «что бы можно было в зум вью по всем картинкам из всех генераций
  // итерироваться не только этой». Ряд теперь собирают сами плитки `PictureTile`, а показывает его
  // ОДИН `PictureGalleryProvider`, смонтированный на всю студию.

  // ── описание изделия (W-3) ──────────────────────────────────────────────────────────────────
  const garment = useController({ control, name: 'garmentDescription' });
  const garmentId = useId();

  // ── WORDS: ФАКТЫ КАРТОЧКИ, ОДИН РАЗ ЗА СЕССИЮ И ТОЛЬКО В ПУСТОЕ ПОЛЕ (T24, D-20'') ─────────────
  /**
   * Владелец: «WORDS по умолчанию = вся информация из полей мудборда, редактируемо, с AI ENHANCE».
   * Здесь стояла дверь `from construction ▸`, приносившая посадку и аспекты по кнопке; теперь то,
   * что она приносила (и больше), стоит в поле с самого начала, а дверь снята.
   *
   * ОДИН ЧИТАТЕЛЬ, ОДИН КОМПОЗИТОР. Факты формы читает `useCardFacts` (тот же, что у кнопок `ai ✦`
   * DESCRIPTION, SILHOUETTE и FABRIC), строку собирает `composeWords` (`core/card-facts.ts`):
   * путь категории · посадка · описание · силуэт · ткань · аспекты · указания доски · материалы —
   * в этом порядке, в потолок поля ЦЕЛЫМИ секциями; сколько не влезло, говорится под полем.
   *
   * ⚠ «ПУСТО ПРИ ЗАГРУЗКЕ = ОТСУТСТВУЕТ» (D-20'', заменяет D-20'). Прежнее «сеять только при
   * `undefined`» было мёртвым на любой настоящей карточке: сервер отдаёт NULL как `""` (dto
   * `pbStringFromNull`), схема держит `''` как `''`, и провод не отличает «никогда не писали» от
   * «стёрли». Поэтому засев применяется, когда ВСЁ сразу:
   *   · поле пусто после trim;
   *   · о карточке в этой сессии ещё не решено (`words-seed.ts`: засеяно, очищено CLEAR, стояло
   *     непустым или стёрто руками — тогда не засевается);
   *   · факты готовы (словарь приехал — иначе строки `category:` не будет никогда) и строка непуста;
   *   · карточку можно писать, и автосейв не `off` (засев, который не сохранится, — неправда на
   *     экране: прогон читает СОХРАНЁННУЮ карточку);
   *   · минимум доски пройден (`useMoodMinimumGate`): ранний визит не замораживает однострочник
   *     «category: …» — засев дождётся доски и выйдет полным; ИЛИ флэт уже сделан (D-13'').
   * Принятое ограничение: очищенные и СОХРАНЁННЫЕ WORDS после перезагрузки засеются снова — сервер
   * хранит `''` как NULL (сказано владельцу; бэк этой волной не трогается).
   *
   * ⚠ ЗАСЕВ — ТОЛЬКО НА ЭКРАНЕ, И В ФОРМУ ОН НЕ ПИШЕТСЯ (D-20'''', заменяет D-20'''). D-20''' клал его в
   * форму без пометки «грязно» — но `isDirty` формы общий, а запись карточки шлёт все значения:
   * подъём стадии, тихая запись с сохранённым назначением и синхронизация R-4 уносили засев на сервер
   * записями, которых никто не делал (ревью раунда 3, M1). Теперь засев живёт в `words-seed.ts`, поле
   * показывает его, пока значение формы пусто, и в форму («грязным») его отдаёт ДЕЙСТВИЕ человека:
   * правка поля, ответ `ai ✦`, GENERATE (`materializeWords` перед `flush`, `flat-run-row.tsx`).
   * Карточка, которую открыли и посмотрели, не сохраняется, не пишет черновика, не спрашивает при
   * уходе и не двигает `lock_version` — и правка ЛЮБОГО другого поля засева тоже не несёт.
   *
   * ⚠ НЕ ПОВЕРХ НЕОТВЕЧЕННОГО ЧЕРНОВИКА (ревью раунда 2, MAJOR A). Пока баннер восстановления ждёт
   * ответа (`autosave.draftPending`), форма — ещё не то, что человек выберет; засев поверх неё мог бы
   * уйти записью мимо ответа и стереть найденную работу. После ответа эффект решает заново.
   *
   * ⚠ СЛОВАРЬ ОБЯЗАН ПРИЕХАТЬ, А НЕ ПРОСТО ПЕРЕСТАТЬ ГРУЗИТЬСЯ (ревью [5]): провал `GetDictionary`
   * тоже снимает `loading`, но словаря нет — засев вышел бы без пути категории и замкнулся на сессию.
   */
  const facts = useCardFacts(isBoardRow);
  const composed = useMemo(() => composeWords(facts, GARMENT_MAX), [facts]);
  const factsContext = useMemo(() => cardFactsContext(facts), [facts]);
  const { loading: dictionaryLoading, dictionary } = useDictionary();
  const factsReady = !dictionaryLoading && !!dictionary;
  const autosave = useTechCardAutosave();
  const draftPending = autosave.draftPending;
  const moodMinimum = useMoodMinimumGate();
  // D-13'': сделанный шаг не запирается — у карточки с флэтами WORDS засевается и при неполном
  // минимуме мудборда (то же правило, что `stepDone('flat')` в core/chain). GENERATE минимум требует.
  const flatDone = useMemo(() => benchSides(band).some((s) => !!s.picture), [band]);
  const wordsNow = (garment.field.value ?? '') as string;
  useEffect(() => {
    if (techCardId <= 0) return;
    const blank = ((getValues('garmentDescription') ?? '') as string).trim() === '';
    if (!blank) {
      // Текст стоит (загружен, восстановлен, напечатан): в этой сессии поле больше не засевается.
      lockWords(techCardId);
      return;
    }
    if (wordsDecided(techCardId)) return;
    if (readOnly || !factsReady || !composed.text) return;
    if (autosave.status === 'off' || draftPending) return;
    // Вход занят (GENERATE сохраняет, вход переписывается) — слова сейчас не меняются; решим после.
    if (inputBusy) return;
    if (!moodMinimum.ok && !flatDone) return;
    // D-20'''': засев — ПРЕДЛОЖЕНИЕ НА ЭКРАНЕ, в значения формы он не пишется (см. `words-seed.ts`).
    offerWords(techCardId, composed.text, composed.omitted);
  }, [
    techCardId,
    wordsNow,
    readOnly,
    factsReady,
    composed,
    autosave.status,
    draftPending,
    inputBusy,
    moodMinimum.ok,
    flatDone,
    getValues,
  ]);

  // ── сплит референса → строки входа с ролями (R-17) ──────────────────────────────────────────
  // `addToInput` СКАЗАН ЯВНО и только здесь: кадры разреза становятся референсами лишь тогда,
  // когда режут референс ИЗ ЭТОГО блока. Верстак зовёт тот же хук молча и входа не пополняет —
  // это и есть T-15 (см. шапку `split-to-input.tsx`).
  const split = useSplitToInput({
    techCardId,
    band,
    addToInput: true,
    onAccepted: (media) => setPicked((prev) => [...prev, ...media]),
    onCropped: (crop, sourceMediaId) => replaceReference(sourceMediaId, crop),
  });

  /**
   * ═══ КРОП ЗАМЕЩАЕТ СТРОКУ ВХОДА НА МЕСТЕ (J-8) ══════════════════════════════════════════════
   *
   * Владелец: «в INPUT — REFERENCES должна быть возможность кропнуть картинку в тамбнейле».
   * После жеста во входе обязано остаться СТОЛЬКО ЖЕ строк, кропнутая — на СВОЁМ месте, с ТОЙ ЖЕ
   * ролью и запиской. Дописать кроп в конец и оставить исходник рядом — это `split`, другая
   * дверь; она никуда не делась и стоит рядом.
   *
   * ПОРЯДОК ЗАПИСЕЙ ОБЯЗАТЕЛЕН И ОН ИМЕННО ТАКОЙ: СНАЧАЛА поставить роль новому медиа, ПОТОМ
   * снять со старого. Обратный порядок на отказе второй записи оставил бы картинку без роли —
   * то есть молча выкинул бы её из промпта; этот же на отказе оставляет ДВЕ строки, обе видимые,
   * обе снимаемые руками. Отказ, который видно, всегда лучше отказа, который стирает.
   *
   * ⚠ УКАЗАНИЯ СТАРОЙ КАРТИНКИ СНИМАЮТСЯ, А НЕ ПЕРЕНОСЯТСЯ. Указание приколото долей кадра
   * (`x`,`y` в долях), а кроп ДВИГАЕТ рамку: та же доля на кропе — другое место на изделии.
   * Перенос дал бы стрелку, показывающую не туда, и это хуже отсутствия стрелки. Цену называет
   * окно ДО реза (`note` ниже), а не снекбар после.
   *
   * ⚠ ИСХОДНИК ОСТАЁТСЯ КАРТИНКОЙ ПОЛОСЫ. Чтобы что-то резать, медиа сначала регистрируется как
   * картинка полосы (`split-to-input.tsx`, шаг 1) — это не утечка, а то, чем «картинка полосы»
   * является; на полке загрузок она и останется. Из ВХОДА она уходит.
   */
  function replaceReference(oldMediaId: number, crop: common_DesignPicture) {
    const card = techCardId;
    const media = crop.media;
    const newMediaId = media?.id;
    if (newMediaId == null || newMediaId === oldMediaId) return;

    // Кроп рисуется ДО того, как библиотечная карта о нём узнает: без этого ячейка, которую мы
    // сами и завели, нарисовала бы «media #N not resolved».
    setPicked((prev) => [...prev, media as common_MediaFull]);

    /* ⚠ ВХОД ЗАНЯТ НА ЗАВЕРШЕНИИ — ОТКАЗ (ревью раунда 3, m1). Дверь кропа заперта, пока вход занят,
       но кроп отвечает позже, чем его начали: GENERATE, начатый за это время, сохраняет карточку и
       просит прогон, а сервер снимает роли В МОМЕНТ запуска. Замена строки и перенос роли посреди
       этого окна дали бы прогону не тот промпт, за который нажали. Кроп уже подшит к полосе
       картинкой; вход не трогается, и это сказано. */
    if (flatInputBusy(readFlatInput(card))) {
      if (cardOnScreen(card)) {
        showMessage(
          'the input is busy — a run is being saved or started, or the prompt is being changed; the crop is filed as a band picture and the reference was left as it was',
          'error',
        );
      }
      return;
    }

    const live = (getValues('moodboardMedia') ?? []) as BoardItem[];
    const at = live.findIndex((item) => isInputRow(item) && item.mediaId === oldMediaId);
    if (at < 0) {
      showMessage('the cropped reference is no longer in the input — nothing was replaced', 'error');
      return;
    }
    writeItems(live.map((item, i) => (i === at ? { ...item, mediaId: newMediaId } : item)));

    // Указания, приколотые к старому медиа, уходят вместе с ним (см. шапку функции).
    const callouts = (getValues('callouts') ?? []) as CalloutRow[];
    const keptCallouts = callouts.filter((c) => (c?.mediaId ?? 0) !== oldMediaId);
    if (keptCallouts.length !== callouts.length)
      setValue('callouts', keptCallouts as TechCardFormData['callouts'], { shouldDirty: true });

    const carried = refOf.get(oldMediaId);
    if (!carried) return;
    // ORDINAL — позиция СТАРОЙ строки: новая встала ровно на её место, а `ordinalOf` читает ещё не
    // перечитанный `rows` и ответил бы про несуществующую строку.
    const ordinal = Math.max(1, rows.findIndex((i) => i.mediaId === oldMediaId) + 1);
    /* ДВЕ ЗАПИСИ РОЛИ — ПОД ЗАМКОМ ВХОДА (m1): пока роль переезжает со старой картинки на кроп, GENERATE
       ждёт («the prompt is being changed»), иначе прогон мог бы снять вход с двумя строками одной роли
       или с кропом без неё. Замок держится до ответа второй записи — и после смены шага тоже. */
    setFlatInputClearing(card, true);
    void (async () => {
      try {
        await setReferenceRole.mutateAsync({
          mediaId: newMediaId,
          role: carried.role,
          ordinal,
          note: carried.note,
        });
        await setReferenceRole.mutateAsync({ mediaId: oldMediaId, role: '', ordinal: 0, note: '' });
      } catch {
        // Отказ уже сказан швом записи (`onError` мутации, над карточкой на экране); вторая запись
        // после отказа первой не делается — как и прежде: картинка без роли хуже двух строк.
      } finally {
        setFlatInputClearing(card, false);
      }
    })();
  }

  /**
   * ─── РИСОВАНИЕ РЕФЕРЕНСА С НУЛЯ (M-2), дословно: «в референсах дать возможность создать новый
   * референс в эдиторе».
   *
   * ЭТО ВТОРАЯ ДВЕРЬ В ТУ ЖЕ КОМНАТУ, А НЕ ВТОРОЙ СОРТ РЕФЕРЕНСА. Слева слот — «принести
   * картинку» (библиотека, ⌘V, бросок); справа — «нарисовать её». Что выйдет из редактора, станет
   * обычной строкой входа: та же роль, та же записка, тот же ✕. Отдельного вида референса не
   * заводится, потому что модели всё равно, откуда взялся пиксель.
   *
   * `base={null}` — ЭТО НЕ ЗАГЛУШКА, А ЗАЯВЛЕННЫЙ РЕЖИМ МОДАЛКИ («Absent = a drawing from nothing,
   * which is its own kind of layer») И ЖИВОЙ ПУТЬ НА СЕРВЕРЕ: слой с `base_media_id = 0` — это
   * «the clean vector base of the «draw it» door» (store/design/layer.go), а сплющивание такого
   * слоя просто не находит родителя и заводит картинку без деривации. До этой правки режим не
   * звал никто: все три прежних вызова передавали картинку.
   *
   * БУМАГА ПОД РИСУНКОМ БЕЛАЯ, А НЕ ПРОЗРАЧНАЯ, и это уже так: `composeScene` заливает холст
   * `#ffffff` прежде всего остального. Иначе человек рисовал бы чёрным по белой плате, а в промпт
   * уходил бы PNG, который у половины просмотрщиков читается как пустой прямоугольник.
   *
   * ⚠ T-15 НЕ НАРУШЕНА. «В INPUT — REFERENCES не должны уходить все флеты если мы их явно туда
   * сами не добавим» — здесь жест человека и есть то самое явное добавление, четвёртое в ряду со
   * слотом, «take into input» и разрезом.
   */
  const [drawOpen, setDrawOpen] = useState(false);

  /* СЛОВА НА ЭКРАНЕ (D-20''''): значение формы, а пока оно пусто и засев не отдан — засев. Их читают
     поле, счётчик, «чистить нечего» и строка «+N omitted» — один помощник на всех (`words-seed.ts`). */
  const seed = useWordsSeed(techCardId);
  const shown = pickShownWords(seed, garment.field.value);
  /** Кнопке нечего чистить — она выключена, а не спрятана: пустое место не объясняет, куда она делась. */
  const garmentChars = shown.trim().length;
  /* Счётчик внутри поля считает СЫРУЮ длину — ту же, по которой режет `maxLength`; разбор у поля. */
  const garmentLen = shown.length;
  const nothingToClear = refOf.size === 0 && garmentChars === 0;
  /* Сколько секций не влезло — из засева: строка переживает смену шага, пока на экране тот же текст,
     что засеян. */
  const omittedShown = seed && seed.omitted > 0 && shown === seed.text ? seed.omitted : 0;

  return (
    <Section
      title='input — references'
      question='— what this run is given'
      /* ═══ В ШАПКЕ БОЛЬШЕ НЕТ НИ ОДНОЙ ДВЕРИ (D-21, волна 25.09) ══════════════════════════════
         R2 п.19 поставил сюда CLEAR на место двух плашок; владелец в этой волне: «кнопка CLEAR не
         в хедере блока, а уместнее». Уместнее — там, где лежит то, что она чистит: под сеткой
         референсов, тихой текстовой дверью `clear the input ✕` (ниже). */
      /* Больше воздуха между рядами блока (16px вместо 10px): владелец — «дай больше спейсинга,
         чтобы проще было воспринимать». Ряды здесь разнородные — сетка, текст, двери, прогон. */
      className='space-y-block'
    >
      {/* ═══ 1.1 РЕФЕРЕНСЫ — сетка плиток, по одной ячейке на строку входа, и ПОСЛЕДНЯЯ —
          плейсхолдер на две половины. Ячейка: кадр 1:1 с номером промпта в углу и селект вида
          СРАЗУ под кадром (R2 п.17/18). Пусто и можно писать — та же сетка с одним плейсхолдером:
          второй пары кнопок под пустым состоянием больше нет (R2 п.21). Только чтение и пусто —
          строка словами: плейсхолдера там нет вовсе, и молчащий блок читался бы как поломка. */}
      {members.length === 0 && readOnly ? (
        <EmptyState>no reference is standing here</EmptyState>
      ) : (
        /* 190, а не 130: на ширине ниже 176px примитив слота ПРЯЧЕТ строку жестов «⌘V · drop»
           своим контейнерным запросом — а владелец назвал её частью плейсхолдера (R2 п.16).
           Заодно кадры становятся крупнее и их меньше в ряду: «дай больше спейсинга, чтобы
           проще было воспринимать». */
        <Tiles min={190}>
          {members.map((mediaId) => (
            <ReferenceCell
              key={mediaId}
              mediaId={mediaId}
              full={mediaById.get(mediaId)}
              role={refOf.get(mediaId)?.role ?? ''}
              number={promptNumber.get(mediaId)}
              /* J-9: УКАЗАТЕЛЬ И РАЗРЕШЁННОЕ ПО НЕМУ ИМЯ — ДВА РАЗНЫХ ФАКТА, и ячейке нужны оба.
                 По имени она печатает `detail · collar`; по указателю РАЗЛИЧАЕТ два молчания —
                 «строка старше поля» (0) и «слот удалён» (id есть, слота нет). */
              detailSlotId={refOf.get(mediaId)?.detailSlotId ?? 0}
              detailName={detailNameOf(refOf.get(mediaId)?.detailSlotId ?? 0)}
              onNameDetail={() => setNamingDetail({ mediaId })}
              readOnly={readOnly}
              locked={inputBusy}
              onRole={(role) => setRole(mediaId, role)}
              onRemove={() => setPendingRemove(mediaId)}
              onSplit={() => {
                const full = mediaById.get(mediaId);
                if (full) split.openForMedia(full, `reference ${promptNumber.get(mediaId) ?? mediaId}`);
              }}
              /* Разрешить не удалось — «не знаю», а НЕ «нет»: разбор у самой карты
                 (`splitOffered`). Ссылка из библиотеки живёт ровно здесь. */
              splitOffer={splitOffered.get(mediaId) ?? 'unknown'}
              /* КРОП ЭТОЙ ЖЕ СТРОКИ (J-8): та же дверь режет, что и `split`; разный ИСХОД — сплит
                 дописывает несколько картинок, кроп рождает одну и ЗАМЕЩАЕТ ею эту строку.
                 ЦЕНА НАЗЫВАЕТСЯ ДО РЕЗА, ЧИСЛОМ: указания приколоты долей кадра. */
              onCrop={() => {
                const full = mediaById.get(mediaId);
                if (!full) return;
                const marks = ((getValues('callouts') ?? []) as CalloutRow[]).filter(
                  (c) => (c?.mediaId ?? 0) === mediaId,
                ).length;
                split.openForMedia(full, `reference ${promptNumber.get(mediaId) ?? mediaId}`, {
                  mode: 'crop',
                  note: marks
                    ? `${marks} callout${marks === 1 ? '' : 's'} on this picture ${marks === 1 ? 'is' : 'are'} dropped — the crop moves the frame, and a mark pinned to a fraction of the old one would land somewhere else on the garment.`
                    : undefined,
                });
              }}
              splitPending={split.registering === mediaId}
            />
          ))}

          {/* ПОСЛЕДНЯЯ ЯЧЕЙКА — ВСЕГДА «ONE MORE»: стоит литералом ПОСЛЕ обхода списка и потому не
              может пропасть при полном входе или отказе сервера. Три жеста одной ячейкой — клик в
              библиотеку, ⌘V, бросок — и вторая дверь «draw a reference» в ту же комнату (M-2). */}
          {!readOnly && (
            <OneMoreCell
              full={members.length >= INPUT_MAX}
              onSelect={(media) => {
                addReferences(media);
              }}
              onDraw={() => setDrawOpen(true)}
            />
          )}
        </Tiles>
      )}

      {members.length >= INPUT_MAX && (
        <Text size='micro' variant='label'>
          the input holds {INPUT_MAX} pictures — the moodboard counts separately.
        </Text>
      )}

      {/* ═══ CLEAR — ПОД СЕТКОЙ, СПРАВА, ТИХОЙ ТЕКСТОВОЙ ДВЕРЬЮ (D-21) ══════════════════════════
          Поведение прежнее: вопрос с объёмом числами, роли уходят с сервера, слова — пустой
          строкой в форме, картинки остаются. Нечего чистить — дверь погашена, а не спрятана:
          пустое место не объясняет, куда она делась. */}
      {!readOnly && (
        <div className='flex justify-end'>
          <Button
            variant='underline'
            size='sm'
            data-clear-prompt=''
            loading={clearing}
            disabled={inputBusy || nothingToClear}
            onClick={() => setClearAsk(true)}
            title='clears the words and the reference roles — the pictures stay'
          >
            clear the input ✕
          </Button>
        </div>
      )}

      {/* ═══ 1.2 WORDS — один текст на весь промпт (SPEC п.10): записок у картинок нет. Поле
          `garmentDescription`; `data-field` — якорь двери «edit the description ▸» из панели
          WHAT THE MODEL GETS (`revealField` ищет по `[data-field]`). */}
      <div>
        {/* ЗАЗОР «ПОДПИСЬ → ПОЛЕ» — ОДИН ТОКЕН НА ВСЮ СТУДИЮ (`GROUP_GAP`, r3 п.3/5). Здесь стоял
            свой `mb-0.5` (2px): подпись липла к полю, и владелец назвал это на четырёх экранах
            разом («больше спейсинга от хедеров к контенту, как в CARD DETAILS»). */}
        <Text
          size='nano'
          variant='label'
          component='span'
          className={cn('block uppercase tracking-label', GROUP_GAP)}
        >
          words
        </Text>
        <label htmlFor={garmentId} className='sr-only'>
          words for the model
        </label>
        {/* ═══ ПРАВЫЙ НИЖНИЙ УГОЛ ПОЛЯ — СЧЁТЧИК И `ai ✦`, ОДНОЙ СТРОКОЙ (r3 п.7 + D-20) ═════════
            Владелец: «счётчик characters у WORDS — внутри поля снизу справа» (r3) и «WORDS … с AI
            ENHANCE» (T24). Угол один, органов два — поэтому они стоят в нём ОДНОЙ СТРОКОЙ: число
            `N / 2000` и сразу за ним тихая кнопка `ai ✦` (контракт `AiEnhance`: правый нижний угол
            обёртки поля). Своё абсолютное место кнопки снято (`static`), чтобы она не легла на
            счётчик, — строку держит обёртка.

            ⚠ ЧИСЛО — СЫРАЯ ДЛИНА, А НЕ ОБРЕЗАННАЯ: режет `maxLength` по сырой длине.
            ⚠ `pointer-events: none` НЕСУЩИЙ, и кнопка его ОТМЕНЯЕТ для себя: угол лежит НАД полем, и
            клик в него мимо кнопки обязан ставить каретку. Полка под угол — нижний отступ поля
            (30px, инлайном: класса такого роста в собранном CSS может не быть). */}
        <div className='relative'>
          <Textarea
            {...garment.field}
            data-field='garmentDescription'
            id={garmentId}
            disabled={readOnly}
            readOnly={inputBusy}
            /* D-20'''': поле показывает засев, пока значение формы пусто; первая правка отдаёт в форму
               то, что человек видит и поправил, — «грязным», как любая правка, — и засев больше не
               подставляется (стёртое руками остаётся пустым). */
            value={shown}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              garment.field.onChange(event);
              settleWords(techCardId);
            }}
            rows={3}
            maxLength={GARMENT_MAX}
            placeholder='what this flat has to show'
            aria-label='words for the model'
            style={{ paddingBottom: 30 }}
            className='resize-y'
          />
          <div
            data-words-corner=''
            /* `right: 16`, а не 6: в самом углу стоит ручка `resize-y` поля, и кнопка на ней
               закрывала бы её (замерено снимком стенда). */
            style={{
              position: 'absolute',
              bottom: 6,
              right: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <Text
              size='nano'
              variant='label'
              component='span'
              data-words-count={garmentLen}
              className='tabular-nums'
            >
              {garmentLen} / {GARMENT_MAX}
            </Text>
            <AiEnhance
              field='words'
              value={shown}
              context={factsContext}
              maxRunes={GARMENT_MAX}
              disabled={readOnly || inputBusy}
              className='static pointer-events-auto'
              onApply={(text) => {
                setValue('garmentDescription', text, { shouldDirty: true });
                settleWords(techCardId);
              }}
            />
          </div>
        </div>
        {/* ЗАСЕВ НЕ ВЛЕЗ ЦЕЛИКОМ — сказано числом секций, а не молчанием (D-20''): пока текст тот,
            что засеян (число живёт в сессионном замке и переживает смену шага); первая же правка
            делает строку неправдой, и она уходит. */}
        {omittedShown > 0 && (
          <Text size='micro' variant='label' component='p' data-words-omitted={omittedShown}>
            (+{omittedShown} section{omittedShown === 1 ? '' : 's'} omitted — the words hold{' '}
            {GARMENT_MAX} characters)
          </Text>
        )}
      </div>

      {/* ═══ РЯДЫ ПРОГОНА — ОДИН КОМПОНЕНТ, ОДИН РИТМ (r3 п.5; ряд источников снят D-20) ═══════════
          Были три полосы: виды → источники (`from construction ▸`, `also send the flat slots` и
          лента плит) → запуск. Средняя снята владельцем целиком (T24): её слова стоят в WORDS с
          самого начала, а плиты в прогон флэта не едут. Остались виды и запуск.

          ⚠ НЕ ЗАВОРАЧИВАТЬ В СВОРАЧИВАНИЕ (`collapsible`/`Fold`): ниже смонтирован приёмник рекола
          `RecalledRunPrompt`, при размонтировании реестр стирает выбор (`recalled.delete`), и жест
          теряется молча. */}
      <FlatRunRow band={band} techCardId={techCardId} disabled={disabled} />

      {/* ПРИЁМНИК РЕКОЛА (T-10). Видимого органа у него нет — он рисует только вопрос про описание
          изделия, и только когда описание уже непустое. Внутри блока, не сворачивать. */}
      <RecalledRunPrompt
        techCardId={techCardId}
        band={band}
        disabled={disabled}
        onAccepted={(media) => setPicked((prev) => [...prev, ...media])}
      />

      {/* Модалка сплита (R-17) — монтируется хуком, когда для картинки получена картинка полосы. */}
      {split.modal}

      {/* РЕДАКТОР НА ЧИСТОЙ ПЛАТЕ (M-2). Смонтирован только когда открыт: у модалки свои оконные
          слушатели клавиш, и держать их живыми под закрытым диалогом значило бы отбирать эти
          клавиши у страницы. `base={null}` — заявленный режим «рисунок с нуля». */}
      {!readOnly && drawOpen && (
        <VectorModal
          open={drawOpen}
          onOpenChange={setDrawOpen}
          techCardId={techCardId}
          band={band}
          base={null}
          disabled={readOnly}
          onFlattened={(picture) => {
            // Медиа берётся ИЗ ОТВЕТА СЕРВЕРА: строку входа заводит `appendBoardPictures` по
            // `common_MediaFull`, и половинчатая запись без адресов нарисовала бы пустой кадр.
            const full = picture.media;
            if (full) addReferences([full]);
          }}
        />
      )}

      {/* ВОПРОС ПЕРЕД ЧИСТКОЙ ПРОМПТА (SPEC п.8) — объём числами, и граница честности: роли
          уходят с сервера СЕЙЧАС, слова — с карточки при её сохранении. Картинки остаются.
          Дверь зовётся `clear the input ✕` (D-21), а вопрос — «clear the prompt»: чистится ПРОМПТ
          (слова и роли), картинки остаются во входе, и заголовок «clear the input» спорил бы с
          телом диалога (ревью m4). */}
      <ConfirmationModal
        open={clearAsk}
        onOpenChange={(open) => !open && setClearAsk(false)}
        onConfirm={runClear}
        onCancel={() => setClearAsk(false)}
        title='clear the prompt'
        confirmLabel='clear the prompt'
        width='sm'
      >
        <div className='space-y-2'>
          <Text size='control' data-clear-scope={`${garmentChars}:${inPrompt}`}>
            clears {garmentChars > 0 ? `the words (${garmentChars} characters)` : 'the words'}
            {inPrompt > 0
              ? ` and ${inPrompt} reference role${inPrompt === 1 ? '' : 's'}`
              : ' — no reference carries a role'}
            . The pictures stay.
          </Text>
          <Text size='control'>
            Roles are removed from the server now, one by one; the words leave the card with its
            next save. The {members.length} picture{members.length === 1 ? ' stays' : 's stay'} in
            the input, out of the prompt until given a role again. The moodboard is not touched.
          </Text>
        </div>
      </ConfirmationModal>

      {/* ИМЯ ДЕТАЛИ СПРАШИВАЕТСЯ ДО ЗАПИСИ, А НЕ ПОСЛЕ: слот без имени сервер отвергает
          (`detail_name_required`), а безымянная деталь в промпте читается словом «detail». */}
      <DetailNamingModal
        open={namingDetail != null}
        onCancel={() => setNamingDetail(null)}
        onConfirm={async (name) => {
          const target = namingDetail;
          setNamingDetail(null);
          if (!target) return;
          const card = techCardId;
          /* ВХОД ЗАНЯТ — ОТКАЗ, И ПОД ЗАМКОМ ВХОДА ДО ПОСЛЕДНЕЙ ЗАПИСИ (ревью раунда 3, m1). Окно
             называния закрыто — GENERATE снова доступен, а слот и роль ещё впереди: роль, легшая
             посреди сохранения и запуска, дала бы прогону не тот промпт. Поэтому GENERATE ждёт, пока
             деталь не получит роль, а начатый раньше GENERATE не даёт её записать. */
          if (flatInputBusy(readFlatInput(card))) {
            showMessage(
              `the input is busy — a run is being saved or started, or the prompt is being changed; detail “${name}” was not added`,
              'error',
            );
            return;
          }
          setFlatInputClearing(card, true);
          try {
            /* ПОРЯДОК ДВУХ ЗАПИСЕЙ (J-9): слот заводится ПЕРВЫМ, его id берётся из ответа и едет со
               ролью тем же запросом. Отказ заведения отменяет и роль — намеренно: неудача не делает
               НИЧЕГО и говорит об этом словами (`onError` мутации), жест повторяется целиком. */
            let slotId = 0;
            try {
              const created = await setBenchSlot.mutateAsync({
                // Деталь — строка ФЛЭТОВОГО верстака, а у него колорвея нет (L-4): положительное
                // значение здесь сервер отвергает. Слот заводится ПУСТЫМ: он держит ЧЕРТЁЖ детали.
                slot: { viewKey: DETAIL_VIEW, kind: 'flat', colorwayId: 0 },
                pictureId: 0,
                expectedSlotRev: 0,
                newDetailName: name,
              });
              slotId = created?.slot?.id ?? 0;
            } catch {
              // Сообщение уже показано `onError` мутации; второго текста об одной беде не нужно.
              return;
            }
            try {
              await setReferenceRole.mutateAsync({
                mediaId: target.mediaId,
                role: DETAIL_VIEW,
                ordinal: ordinalOf(target.mediaId),
                detailSlotId: slotId,
              });
            } catch {
              // Отказ роли сказан швом записи; слот остался на верстаке пустым — его видно там.
              return;
            }
            if (cardOnScreen(card)) {
              showMessage(`detail “${name}” added — tick it in VIEWS below`, 'success');
            }
          } finally {
            setFlatInputClearing(card, false);
          }
        }}
      />

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
        title='take a reference off the input'
        confirmLabel='take it off'
        width='sm'
      >
        <div className='space-y-2'>
          <Text size='control'>
            The picture and its role go together — a reference is one thing. The picture stays in
            the library.
          </Text>
          {pendingRuns > 0 && (
            <Text size='control'>
              {historyComplete ? '' : 'At least '}
              {pendingRuns} run{pendingRuns === 1 ? '' : 's'} already read this picture. Those runs
              keep their own frozen copy of what they were shown; this only takes it out of the next
              one.
            </Text>
          )}
          <Text size='control'>
            If the same picture also stands on the moodboard, that tile stays where it is.
          </Text>
        </div>
      </ConfirmationModal>
    </Section>
  );
}

/**
 * ═══ ПОСЛЕДНЯЯ ЯЧЕЙКА ЛЕНТЫ — ПЛИТКА НА ДВЕ ПОЛОВИНЫ (R2 п.16) ══════════════════════════════════
 *
 * Владелец, дословно: «плейсхолдер как был — из двух частей: половина „из медиатеки“, половина
 * „draw“; разделён горизонтальной линией пополам, с пиктограммами». Ровно эта форма стояла в
 * `8d29fd83` и была потеряна при переходе на сетку плиток: её место заняла коробка с ЯРЛЫКОМ
 * «ONE MORE» и ДВУМЯ ОБЫЧНЫМИ КНОПКАМИ внутри — то самое «классической кнопкой», на которое
 * владелец жаловался кругом раньше.
 *
 * ⚠ ПЛИТКА ЖИВЁТ В `core/two-half-slot.tsx` И БОЛЬШЕ НИГДЕ (пул r3). До этой правки её чертили
 * ТРИЖДЫ — здесь, в `bench-slot.tsx` (пустая ячейка верстака) и в `core` (флэт-стороны рендера), —
 * и в волне r2 три копии уже разъехались на пиксель. Здесь осталось ровно то, чем лента входа
 * отличается от двух других: квадрат по своей ширине, множественный выбор (человек приносит
 * пачку разом), адрес нарисованного — `the input`, а не слот, и слово состояния «the input is
 * full» вместо дверей на потолке `INPUT_MAX`.
 *
 * ЯРЛЫКА «ONE MORE» БОЛЬШЕ НЕТ: две половины сами говорят, что они такое, а третья строка над
 * ними отбирала у них половину высоты.
 */
function OneMoreCell({
  full,
  onSelect,
  onDraw,
}: {
  /** Вход полон (`INPUT_MAX`): дверей нет вовсе, коробка говорит почему. */
  full: boolean;
  onSelect: (media: common_MediaFull[]) => void;
  onDraw: () => void;
}) {
  return (
    <PlaceOrDrawCell
      data-ref-placeholder=''
      label='reference'
      mediaLabel='+ reference'
      showGestures
      /* КВАДРАТ, КАК КАДР СОСЕДА, И `topAligned` К НЕМУ В ПАРЕ. Пока коробку растягивала строка
         грида, её распирало содержимое верхней половины — у кнопки слота свои пропорции 4/5, — и
         плитка вырастала до 500 пикселей при 231 у соседней ячейки (замерено). Пропорция задаёт
         рост, а `alignSelf: start` не даёт строке растянуть коробку под самого высокого соседа
         (у ячейки референса под кадром стоит ещё и селект роли). */
      aspect='1/1'
      topAligned
      purpose='design reference'
      onSelectAll={onSelect}
      onDraw={onDraw}
      drawLabel='draw a reference'
      drawAriaLabel='draw a reference'
      /* Единственное, чем эта половина отличается от трёх соседних: адрес — не слот. */
      into='the input'
      instead={
        full ? (
          <Text size='micro' variant='uppercase' tracking='label' component='span'>
            the input is full
          </Text>
        ) : undefined
      }
    />
  );
}

/**
 * ОДНА ЯЧЕЙКА СЕТКИ РЕФЕРЕНСОВ (`fRefCell` макета): плитка, имя, роль — колонкой.
 *
 * КАДР РИСУЕТ ОБЩИЙ ПРИМИТИВ `PictureTile`, И ЭТО ВЕСЬ ОТВЕТ НА T-7. Владелец: «на тамбнейлах
 * картинок на ховер кнопка сплит должна быть снизу слева я уже второй раз это прошу» — раскладка
 * углов решение примитива (ярлык слева сверху, zoom и ✕ справа сверху, split и crop СЛЕВА СНИЗУ),
 * ячейка объявляет только РОЛИ.
 *
 * ЯРЛЫК ГОВОРИТ ОДНО ИЗ ДВУХ: номер в промпте `#N` — или `not sent`, и тогда снимок приглушён
 * (`dim`) и селект стоит в «— not in prompt —»: три носителя одного состояния, как в макете.
 * ⚠ НОМЕР — ПЛОТНЫЙ НОМЕР ПРОМПТА (И-3), а не позиция в списке, как в прототипе: это число
 * обещает, под каким номером картинку получит сервер, и второе число рядом с деньгами врало бы.
 *
 * ИМЯ — `picture <media_id>`: имени файла у медиа на проводе нет (память
 * `media-ux-shipped`), и прототип тоже называет картинку номером медиа.
 */
function ReferenceCell({
  mediaId,
  full,
  role,
  number,
  detailSlotId,
  detailName,
  onNameDetail,
  readOnly,
  locked,
  onRole,
  onRemove,
  onSplit,
  splitOffer,
  onCrop,
  splitPending,
}: {
  mediaId: number;
  full?: common_MediaFull;
  role: string;
  number?: number;
  /** `design_bench_slot(id)` этой детали, 0 = не сказано (строка старше поля или слот удалён). */
  detailSlotId: number;
  /** Имя, разрешённое по указателю из живого верстака, или null — если разрешить не удалось. */
  detailName: string | null;
  /** Дверь починки: завести деталь заново. Рисуется ТОЛЬКО когда имени нет. */
  onNameDetail: () => void;
  readOnly: boolean;
  /**
   * Вход занят (GENERATE сохраняет карточку или ждёт ответа, CLEAR снимает роли): роль, ✕, сплит,
   * кроп и «name it» пишут полосу напрямую и поменяли бы промпт посреди прогона (ревью раунда 2,
   * [2]). Органы остаются на месте, погашенными: пропадающие углы читались бы как поломка.
   */
  locked: boolean;
  onRole: (role: string) => void;
  onRemove: () => void;
  onSplit: () => void;
  /** Объявлять ли роль `split` и что ей говорить — считает вызывающий (`splitOffered`). */
  splitOffer: SplitOffer;
  /** Кроп этой же картинки на месте (J-8) — см. вызывающего. */
  onCrop: () => void;
  splitPending: boolean;
}) {
  const url = thumbUrl(full);
  const label = `reference ${number ?? mediaId}`;
  const name = `picture ${mediaId}`;

  return (
    <div className='flex min-w-0 flex-col gap-1' data-ref-cell={mediaId}>
      {/* КАДР 1:1, КАРТИНКА ВПИСЫВАЕТСЯ ЦЕЛИКОМ (`contain`). Навязанное соотношение законно
          ровно потому, что на референсе НЕТ выносок: доля кадра здесь ничего не адресует. */}
      <PictureTile
        url={url}
        alt={label}
        aspect='1/1'
        fit='contain'
        className='w-full'
        badge={number != null ? `#${number}` : 'not sent'}
        dim={!role}
        gallery={
          url && full
            ? // `meta` НЕСЁТ ID МЕДИА: без него дверь «сохранить как новую картинку» отказывает.
              { ...mediaFullToViewerItem(full), thumbnail: url, alt: label }
            : undefined
        }
        /* ═══ РЕЗ ПРЕДЛАГАЕТСЯ ЛЮБОЙ КАРТИНКЕ ВХОДА (r3 п.4) ═════════════════════════════════
           Владелец: «на референсах должна быть возможность маркать мультивью». До r3 угол
           стоял только на кадре, который САМ объявил себя склейкой (`composite_views`), и на
           том, про который не удалось узнать; на всём остальном его не было вовсе. Но
           «мультивью» — это утверждение ЧЕЛОВЕКА о снимке, а не свойство файла: лукбук на
           четыре вида, снятый на телефон и брошенный во вход, никаких видов не объявляет и
           объявить не может. Отказывать ему значило отказывать ровно тому случаю, ради
           которого дверь и заведена — модалка режет кадрами, размеченными руками, и умеет это
           на картинке без объявленных видов («every frame is named here by hand»).

           ⚠ РАЗЛИЧАТЬ СЛУЧАИ ПРОДОЛЖАЕТ `title`, И ЭТО НЕ УКРАШЕНИЕ: дверь ПРЕДЛАГАЕТ действие
           и ничего не утверждает о файле — та же формула, что на полосе флэтов. `declared` —
           это факт полосы («held several views at once»), всё остальное — «only you can
           tell». Пропасть дверь не может: тихий орган остаётся тихим не отсутствием, а тем,
           что не врёт. */
        onSplit={
          !readOnly && url
            ? {
                onClick: onSplit,
                pending: splitPending,
                disabled: locked,
                ariaLabel: `cut ${label} into views`,
                title:
                  splitOffer === 'declared'
                    ? 'split — this picture holds several views at once; cut them out into ' +
                      'pictures of their own'
                    : 'split — cut this into views if it holds several at once. Nothing on ' +
                      'record says it does, so only you can tell',
              }
            : undefined
        }
        onCrop={
          !readOnly && url
            ? {
                onClick: onCrop,
                pending: splitPending,
                disabled: locked,
                ariaLabel: `crop ${label} in place`,
                title:
                  'crop — cut one frame out of this picture and put it in this row, with the same role',
              }
            : undefined
        }
        onRemove={
          !readOnly
            ? {
                onClick: onRemove,
                disabled: locked,
                ariaLabel: `take ${name} off the input`,
                title: 'take this reference off the input — picture and role together',
              }
            : undefined
        }
      >
        {/* ПРИЧИНА ПУСТОГО КАДРА: строка есть, а файла под её `media_id` не нашлось ни в
            библиотеке, ни в полосе. */}
        {!url && (
          <div className='pointer-events-none absolute inset-x-0 bottom-1 z-20 px-1 text-center'>
            <Text size='nano' variant='label' component='span'>
              media #{mediaId} not resolved
            </Text>
          </div>
        )}
      </PictureTile>

      {/* ⚠ ПОДПИСИ `picture <media_id>` ПОД КАДРОМ БОЛЬШЕ НЕТ (R2 п.17), слово владельца: «picture
          125 не показывать». Номер медиа — адрес файла в библиотеке, а не имя картинки; человек
          на этом экране решает, каким видом она поедет в промпт, и селект вида теперь стоит СРАЗУ
          под кадром, без промежуточной строки (R2 п.18). Сам номер жив в `aria-label` углов
          плитки и в вопросе перед снятием — там, где он адресует, а не украшает. */}

      {/* РОЛЬ, А У ДЕТАЛИ — ЕЁ ИМЯ (J-9): имя печатается на триггере, не в списке; дверь починки
          «name it» — соседняя и появляется РОВНО в сломанном состоянии (Radix не шлёт
          `onValueChange` на повторный выбор того же значения). `data-ref-role` — якорь пробы. */}
      <div className='flex min-w-0 items-center gap-1' data-ref-role={mediaId}>
        <Select
          key={selectKeyFor(role)}
          name={`ref-role-${mediaId}`}
          items={roleItemsFor(role)}
          value={role}
          placeholder='— not sent —'
          readOnly={readOnly || locked}
          onValueChange={onRole}
          className='w-full min-w-0'
          renderValue={(value, item) =>
            normaliseViewKey(String(value)) === DETAIL_VIEW ? (
              <span className='min-w-0 truncate' data-ref-detail={mediaId}>
                {detailName
                  ? `detail · ${detailName}`
                  : detailSlotId > 0
                    ? 'detail · slot removed'
                    : 'detail · unnamed'}
              </span>
            ) : (
              item?.label
            )
          }
        />
        {normaliseViewKey(role) === DETAIL_VIEW && !detailName && !readOnly && (
          <Button
            variant='secondary'
            size='xs'
            disabled={locked}
            onClick={onNameDetail}
            data-name-detail={mediaId}
          >
            name it
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * ИМЯ ДЕТАЛИ И НЕОБЯЗАТЕЛЬНЫЙ КОММЕНТАРИЙ.
 *
 * Владелец (V-1): «когда мы выбираем деталь нужно кратко обозвать деталь фри текстом обязательным
 * и так же снизу еще был не обязательный коммент». Имя обязательно не по вкусу, а по устройству:
 * лист цитирует деталь по имени, а промпт адресует её слотом — безымянная деталь неотличима от
 * любой другой на бумаге и приезжает к модели словом «detail».
 *
 * ПОДТВЕРЖДЕНИЕ НЕДОСТУПНО, ПОКА ИМЯ ПУСТО, и рядом сказано почему. Кнопка, которая нажимается и
 * молча ничего не делает, читается как сломанная.
 */
function DetailNamingModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setName('');
  }
  const ready = name.trim().length > 0;
  /* Поле «comment — goes to the model with the picture» снято вместе с запиской референса
     (SPEC п.10): оно и было той же записью `design_reference.note`. Слова модели — в garment
     description, один текст на весь промпт. */
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      onConfirm={() => ready && onConfirm(name.trim())}
      onCancel={onCancel}
      title='name this detail'
      confirmLabel='add the detail'
      confirmDisabled={!ready}
      width='sm'
    >
      <div className='space-y-3'>
        <div className='space-y-1'>
          <label htmlFor='detail-name' className='block'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              name — the sheet cites it by this
            </Text>
          </label>
          <Input
            name='detail-name'
            id='detail-name'
            value={name}
            maxLength={60}
            autoFocus
            placeholder='collar, patch pocket, cuff…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </div>
        <Text size='nano' variant='label' component='p'>
          The slot is created empty: it holds the technical drawing of the detail, and this
          photograph stays a reference the model looks at.
        </Text>
      </div>
    </ConfirmationModal>
  );
}
