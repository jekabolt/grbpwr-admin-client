import {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useResolvedMedia } from 'components/managers/media/utils/useMediaQuery';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import type { TechCardFormData } from '../schema';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { displayDetailName, readBench } from './bench-slot';
import { carryReferenceRole } from './carry-reference';
import { useDrafted } from './drafted-contract';
import { cropFamilies } from './generation/composite';
import {
  flatInputBusy,
  holdFlatInput,
  readFlatInput,
  rowsWritable,
  setFlatInputClearing,
  useFlatInput,
  wordsLocked,
} from './flat-input';
import { FlatRunRow } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { EmptyState, GROUP_GAP, PlaceOrDrawCell } from './core';
import { VectorModal } from './modals';
import { PictureTile } from './picture-tile';
import { rememberRefChoice, useRefChoices } from './ref-ask-model';
import { pictureOffersSplit } from './render/model';
import { offersSplit, readSplit } from './generation/composite';
import { useSplitToInput } from './split-to-input';
import { ACTIVE_VIEWS, DETAIL_VIEW, normaliseViewKey, viewLabel } from './views';
import { cardOnScreen, useDesignWrites } from './use-design-band';
import { useWordsSeeding } from './use-words-seeding';
import { WordsField } from './words-field';
import { dropWords, omittedOf, pickShownWords, settleWords, useWordsSeed } from './words-seed';

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
 *   заголовок  INPUT — REFERENCES · what this run is given · справа `clear the input ✕` (item 26)
 *   1.1  сетка плиток референсов (кадр 1:1, `#N` в углу, селект вида СРАЗУ под кадром) +
 *        последняя ячейка — плитка на две половины: слот медиа сверху, «draw a reference» снизу;
 *        пусто → та же плитка одна в сетке (второй пары кнопок больше нет);
 *   1.2  WORDS — textarea во всю ширину (`garmentDescription`), засеянная фактами карточки, когда
 *        она пуста (D-20''/D-20'''), раз за сессию и только на экране — на сервер засев уезжает с
 *        первой правкой или с GENERATE; в правом нижнем углу счётчик `N / 2000` и `ai ✦`;
 *   1.3  ряд запуска (`./flat-run-row.tsx`): VIEWS (продуктовая строка — проводу нужны
 *        `views[]`), GENERATE · цена · WHAT THE MODEL GETS ▸.
 *   1.4  latest generation — БОЛЬШЕ НЕ ЗДЕСЬ (28.09, O-67, D-73): воркбенч последней генерации
 *        стоит СВОИМ блоком сразу под этим, с тем же чромом (`studio-tab.tsx` →
 *        `./generation/latest-generation.tsx`); до O-67 он был нижним рядом этого блока (O-53).
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
 * см. `roleItemsFor`); пустая строка — пункт `not sent`, то есть законный выбор «убрать из промпта».
 */
/**
 * Потолок `garmentDescription` — `WORDS_MAX` органа слов (`./words-field.tsx`), ЕДИНСТВЕННОЕ
 * НАПИСАНИЕ ЭТОГО ЧИСЛА: его читают `maxLength` поля, счётчик, `ai ✦` и засев фактами
 * (`composeWords` в `use-words-seeding.ts` — опускает секции ЦЕЛИКОМ, а не режет хвост). Орган
 * общий с IN WORDS рендера (O-61), поэтому и число живёт при нём.
 */

/**
 * ЗАМОК ЗАСЕВА WORDS НА СЕССИЮ (D-20'') и сам засев (D-20'''') живут в `words-seed.ts`: засев в
 * значения формы не пишется, пока человек не подействовал, и все, кто читает слова на экране, читают
 * их оттуда. Предлагает засев эффект `use-words-seeding.ts` — общий с FABRIC RENDER (O-61 r2).
 */

type RoleItem = { value: string; label: string; disabled?: boolean };

/** T70: no role, but sent — the model works out what the picture shows (`ref-ask-model.ts`). */
const FIGURE_ITEM = '__figure';

const ROLE_ITEMS: RoleItem[] = [
  { value: '', label: 'not sent' },
  { value: FIGURE_ITEM, label: 'figure it out ✦' },
  // ЧЕТЫРЕ СТОРОНЫ И ДЕТАЛЬ (`views.ts`, `ACTIVE_VIEWS`): 3/4 сняты владельцем (D-18) и больше не
  // предлагаются. Слов макета «silhouette / stitching / hardware» на проводе НЕТ — список
  // остаётся продуктовым.
  ...ACTIVE_VIEWS.map((view) => ({ value: view, label: viewLabel(view) })),
  { value: DETAIL_VIEW, label: viewLabel(DETAIL_VIEW) },
];

/**
 * ═══ РОЛЬ, КОТОРОЙ НЕТ СРЕДИ ПУНКТОВ, ОСТАЁТСЯ ВИДНА — НЕАКТИВНЫМ ПУНКТОМ (D-18', Codex B-08) ═══
 *
 * У референсов беты и прода есть роли `three_quarter_l|r`, а пунктов таких больше нет. Текущая
 * роль, которой нет в списке, добавляется последним пунктом — видимым, отмеченным и НЕАКТИВНЫМ:
 * её не выбрать заново, но и не потерять молча. Снять её — явный выбор `not sent` или другой
 * стороны. Правило общее, а не про 3/4 поимённо: роль из словаря более нового сервера упала бы в
 * ту же яму. Подпись — `viewLabel`, то есть «3/4 left (legacy)» для снятых.
 *
 * ФАНТОМНОЙ ПУСТОТЫ БОЛЬШЕ НЕТ ПО УСТРОЙСТВУ (T16). Роль выбиралась формовым Radix `Select` под
 * кадром, а у того есть скрытый нативный `<select>`: значение без пункта он отдавал наружу пустой
 * строкой, и `setRole(…, '')` стирал роль без жеста человека (лечилось ключом перемонтирования,
 * `selectKeyFor`). Теперь роль — меню в углу плитки (`PictureTile.menu`): значения оно не держит,
 * `onPick` зовётся ровно на нажатие строки, и рендер записать ничего не может.
 */
function roleItemsFor(role: string): RoleItem[] {
  const current = role.trim();
  if (!current || ROLE_ITEMS.some((item) => item.value === current)) return ROLE_ITEMS;
  return [...ROLE_ITEMS, { value: current, label: viewLabel(current) || current, disabled: true }];
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
 * ⚠ С item 25 (04.10) ЭТО СНОВА ВОРОТА ДВЕРИ: угол стоит только на `declared`, `no` и
 * `unknown` его не получают (владелец: «только для тех картинок где мы знаем что нужен сплит»).
 * `declared` включает лист, известный по цепочке правок или по параметрам `one`-прогона.
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
  // РАЗРЕШЁННОЕ САМОЙ КАРТОЧКОЙ — первым слоем (живой баг 06.10, карточка 38): сервер разрешает
  // каждый id мудборда/технички на чтении, а библиотечное окно — лишь последние 500 файлов, и
  // августовские референсы (124–126) из него выпали. То, чего нет ни в карточке, ни в полосе, ни в
  // окне, `useResolvedMedia` дочитывает страницами библиотеки за окном.
  const { data: savedCard } = useTechCard(techCardId > 0 ? techCardId : undefined);
  const known = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(savedCard?.resolvedTechnicalMedia ?? []),
      ...(savedCard?.resolvedMoodboardMedia ?? []),
    ])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    // МЕДИА КАРТИНОК ПОЛОСЫ: кропы сплита (и вообще всё, что родилось в полосе) появляются в
    // библиотечной карте только после её перечтения, а строка входа на них уже стоит. Без этого
    // слоя свежий кроп рисовался бы как «media #N not resolved» — данные целы, не хватает лишь
    // разрешения id в файл, и полоса его уже привезла.
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
  }, [
    savedCard?.resolvedTechnicalMedia,
    savedCard?.resolvedMoodboardMedia,
    picked,
    band.batches,
    band.runs,
  ]);
  const libraryMap = useResolvedMedia(
    all.map((i) => i.mediaId),
    known,
  );
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    for (const [id, media] of known) m.set(id, media);
    return m;
  }, [libraryMap, known]);

  /**
   * ═══ ЧТО ПОДСКАЗКА РЕЗА ЗНАЕТ ОБ ЭТОЙ СТРОКЕ ВХОДА (F-8, F-18 → r3 п.4 → item 25) ═══════════
   *
   * ⚠ ITEM 25 (04.10) SUPERSEDES r3 п.4 BELOW. Owner: «только для тех картинок где мы знаем что
   * нужен сплит». The corner now stands ONLY on `declared` (this map); `no` and `unknown` draw no
   * corner, and a sheet brought by hand is cut with `crop`. The history below is kept as history.
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

    // The run each picture came from: a generated `one` sheet may carry an empty column, and the
    // bench's own rule (`readSplit`: edit chain → run params) is what knows it is a sheet (item 25).
    const runOf = new Map<number, common_DesignRun>();
    for (const run of band.runs ?? [])
      for (const p of run.pictures ?? []) runOf.set(p.id ?? 0, run);

    const offers = new Map<number, SplitOffer>();
    for (const [mediaId, picture] of newestOf) {
      const cut = (families.membersOf.get(picture.id ?? 0) ?? []).length > 0;
      const run = runOf.get(picture.id ?? 0);
      const sheet =
        pictureOffersSplit(picture, cut) ||
        (!cut && offersSplit(readSplit(band, picture, run?.pictures, run)));
      offers.set(mediaId, sheet ? 'declared' : 'no');
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
  const refChoices = useRefChoices(techCardId);
  /** T70: a role-less input picture the person left to the model — it travels after the roled ones. */
  const figures = useMemo(
    () => new Set(members.filter((id) => !refOf.has(id) && refChoices[id] === 'figure')),
    [members, refOf, refChoices],
  );
  const promptNumber = useMemo(() => {
    const m = new Map<number, number>();
    let n = 0;
    for (const mediaId of members) {
      if (refOf.has(mediaId)) m.set(mediaId, ++n);
    }
    // The server appends `extra_input_media_ids` after the card's references.
    for (const mediaId of members) {
      if (figures.has(mediaId)) m.set(mediaId, ++n);
    }
    return m;
  }, [members, refOf, figures]);

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
    const card = techCardId;
    /* ПОД УДЕРЖАНИЕМ СТРОК (ревью раунда 4, MIN-2): пока роль пишется, GENERATE ждёт — иначе прогон,
       нажатый в это окно, снял бы вход без неё. Посреди GENERATE или CLEAR роль не пишется вовсе
       (селект в этот момент и так заперт; проверка — на щелчок, пришедший раньше замка). */
    if (!rowsWritable(readFlatInput(card))) {
      showMessage(
        'the input is busy — a run is being saved or started, or the prompt is being cleared; the role was not changed',
        'error',
      );
      return;
    }
    const release = holdFlatInput(card);
    // ORDINAL — ЭТО ПОЗИЦИЯ ВО ВХОДЕ, а не номер промпта. Номер промпта выводится сканом (см.
    // выше), и класть его в хранимое поле значило бы завести второй источник одной величины.
    setReferenceRole
      .mutateAsync({
        mediaId,
        role,
        ordinal: role ? ordinalOf(mediaId) : 0,
        detailSlotId,
      })
      // Отказ сказан швом записи (`onError` мутации, над карточкой на экране).
      .catch(() => {})
      .finally(release);
  }

  function setRole(mediaId: number, role: string) {
    /* T70: `figure it out ✦` and `not sent` are remembered choices, so GENERATE does not ask about
       the picture; both leave it role-less (a role, if any, is taken off). */
    if (role === FIGURE_ITEM || role === '') {
      rememberRefChoice(techCardId, mediaId, role === FIGURE_ITEM ? 'figure' : 'out');
      if (refOf.has(mediaId)) writeRef(mediaId, '');
      return;
    }
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
    const card = techCardId;
    if (!rowsWritable(readFlatInput(card))) {
      showMessage(
        'the input is busy — a run is being saved or started, or the prompt is being cleared; nothing was taken off',
        'error',
      );
      return;
    }
    // Порядок важен: сначала снимается роль (сервер отвергнет роль на медиа, которого карточка
    // больше не держит), потом уходит строка входа вместе с запиской. Пока роль снимается, строки
    // удержаны — GENERATE ждёт (ревью раунда 4, MIN-2).
    if (refOf.has(mediaId)) {
      const release = holdFlatInput(card);
      setReferenceRole
        .mutateAsync({ mediaId, role: '', ordinal: 0, note: '' })
        .catch(() => {})
        .finally(release);
    }
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
  /* РАЗНЫЕ ЗАМКИ РАЗНЫМ ОРГАНАМ (ревью раунда 4, MIN-1): спиннер CLEAR — только его флаг; плитки,
     роли, ✕ и сам CLEAR — любая занятость входа; WORDS и `ai ✦` — только прогон, CLEAR и рекол,
     который пишет слова. Кроп, деталь и правка роли держат строки, а не слова: набор в поле посреди
     них не теряется. */
  const clearing = flatInput.clearing;
  const inputBusy = flatInputBusy(flatInput);
  const wordsBusy = wordsLocked(flatInput);

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
    if (flatInputBusy(readFlatInput(card))) return;
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
  /* Засев — общий хук флэта и FABRIC RENDER › IN WORDS (`use-words-seeding.ts`, O-61 r2): тот же
     эффект, те же входы, перенесён как есть; правила засева расписаны там. Здесь — только то, что
     нужно полю: видно ли предложение (`wordsLive`, (c)) и контекст `ai ✦` из фактов карточки. */
  const { wordsLive, factsContext, rewrite, rewriting } = useWordsSeeding(
    techCardId,
    band,
    readOnly,
  );

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
    if (!rowsWritable(readFlatInput(card))) {
      if (cardOnScreen(card)) {
        showMessage(
          'the input is busy — a run is being saved or started, or the prompt is being cleared; the crop is filed as a band picture and the reference was left as it was',
          'error',
        );
      }
      return;
    }

    const live = (getValues('moodboardMedia') ?? []) as BoardItem[];
    const at = live.findIndex((item) => isInputRow(item) && item.mediaId === oldMediaId);
    if (at < 0) {
      showMessage(
        'the cropped reference is no longer in the input — nothing was replaced',
        'error',
      );
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
    /* ДВЕ ЗАПИСИ РОЛИ — ПОД УДЕРЖАНИЕМ СТРОК (m1): пока роль переезжает со старой картинки на кроп,
       GENERATE ждёт («the prompt is being changed»), иначе прогон мог бы снять вход с двумя строками
       одной роли или с кропом без неё. Удержание — до ответа второй записи, и после смены шага тоже.
       Слова НЕ запираются (ревью раунда 4, MIN-1): набор сразу после «crop it» не теряется. */
    const release = holdFlatInput(card);
    void (async () => {
      try {
        await carryReferenceRole(
          setReferenceRole.mutateAsync,
          carried,
          oldMediaId,
          newMediaId,
          ordinal,
        );
      } catch {
        // Отказ уже сказан швом записи (`onError` мутации, над карточкой на экране); вторая запись
        // после отказа первой не делается — как и прежде: картинка без роли хуже двух строк.
      } finally {
        release();
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
  const shown = pickShownWords(seed, garment.field.value, wordsLive);
  /** Кнопке нечего чистить — она выключена, а не спрятана: пустое место не объясняет, куда она делась. */
  const garmentChars = shown.trim().length;
  const nothingToClear = refOf.size === 0 && garmentChars === 0;
  /* Сколько секций не влезло — из засева: строка переживает смену шага, пока на экране тот же текст,
     что засеян. */
  const omittedShown = omittedOf(seed, shown);

  return (
    <Section
      title='input — references'
      question='— what this run is given'
      /* ═══ CLEAR — В ШАПКЕ, ТИХИМ ДЕЙСТВИЕМ ЗАГОЛОВКА (item 26, 04.10; снимает D-21) ═══════════
         Владелец: «INPUT — REFERENCES в хедер перенеси CLEAR THE INPUT ✕». Вид — подчёркнутое
         слово, как у каждого действия шапки техкарты (item 32: «если кнопка то она всегда
         подчеркиванием везде в техкарте»), а не кнопка в рамке. Поведение прежнее: вопрос с объёмом
         числами, роли уходят с сервера, слова — пустой строкой в форме, картинки остаются.
         Нечего чистить — дверь погашена, а не спрятана: пустое место не объясняет, куда она
         делась. */
      action={
        !readOnly && (
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            data-clear-prompt=''
            loading={clearing}
            disabled={inputBusy || nothingToClear}
            onClick={() => setClearAsk(true)}
            title='clears the words and the reference roles — the pictures stay'
          >
            clear the input ✕
          </Button>
        )
      }
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
        /* 230 (item 42 «сделай картинки чуть больше», ~+20 %). */
        <Tiles min={230}>
          {members.map((mediaId) => (
            <ReferenceCell
              key={mediaId}
              mediaId={mediaId}
              full={mediaById.get(mediaId)}
              role={refOf.get(mediaId)?.role ?? ''}
              figure={figures.has(mediaId)}
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
                if (full)
                  split.openForMedia(full, `reference ${promptNumber.get(mediaId) ?? mediaId}`);
              }}
              /* Не разрешилось — `unknown`: угла нет (item 25), разбор у карты `splitOffered`. */
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

      {/* ═══ 1.2 WORDS — один текст на весь промпт (SPEC п.10): записок у картинок нет. Поле
          `garmentDescription`; `data-field` — якорь двери «edit the description ▸» из панели
          WHAT THE MODEL GETS (`revealField` ищет по `[data-field]`). */}
      <div>
        {/* ЗАЗОР «ПОДПИСЬ → ПОЛЕ» — ОДИН ТОКЕН НА ВСЮ СТУДИЮ (`GROUP_GAP`, r3 п.3/5). Здесь стоял
            свой `mb-0.5` (2px): подпись липла к полю, и владелец назвал это на четырёх экранах
            разом («больше спейсинга от хедеров к контенту, как в CARD DETAILS»). */}
        {/* T56: мудборд сменился, а WORDS правлены руками — тихая ссылка переписать. */}
        {rewrite ? (
          <div className={cn('flex items-baseline justify-between gap-2', GROUP_GAP)}>
            <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
              words
            </Text>
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              data-words-rewrite=''
              disabled={rewriting}
              title='the moodboard changed since these words were written — rewrite them from it'
              onClick={rewrite}
            >
              {rewriting ? 'rewriting…' : 'moodboard changed · rewrite ✦'}
            </Button>
          </div>
        ) : (
          <Text
            size='nano'
            variant='label'
            component='span'
            className={cn('block uppercase tracking-label', GROUP_GAP)}
          >
            words
          </Text>
        )}
        {/* ═══ ОРГАН ПОЛЯ — ОБЩИЙ С IN WORDS РЕНДЕРА (27.09, O-61, D-60): `./words-field.tsx` ═══════
            Поле, счётчик `N / 2000` и `ai ✦` в правом нижнем углу, строка «+N omitted» — один орган
            на оба экрана, вынесенный отсюда без изменения поведения: те же пропы, тот же DOM. Здесь
            остаётся только то, что знает флэт: поле формы, засев и замок входа. */}
        <WordsField
          {...garment.field}
          data-field='garmentDescription'
          id={garmentId}
          label='words for the model'
          disabled={readOnly}
          readOnly={wordsBusy}
          /* D-20'''': поле показывает засев, пока значение формы пусто; первая правка отдаёт в форму
             то, что человек видит и поправил, — «грязным», как любая правка, — и засев больше не
             подставляется (стёртое руками остаётся пустым). */
          value={shown}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            garment.field.onChange(event);
            settleWords(techCardId, event.target.value);
          }}
          placeholder='what this flat has to show'
          omitted={omittedShown}
          aiContext={factsContext}
          aiDisabled={readOnly || wordsBusy}
          onApply={(text) => {
            setValue('garmentDescription', text, { shouldDirty: true });
            settleWords(techCardId, text);
          }}
        />
      </div>

      {/* ═══ РЯДЫ ПРОГОНА — ОДИН КОМПОНЕНТ, ОДИН РИТМ (r3 п.5; ряд источников снят D-20) ═══════════
          Были три полосы: виды → источники (`from construction ▸`, `also send the flat slots` и
          лента плит) → запуск. Средняя снята владельцем целиком (T24): её слова стоят в WORDS с
          самого начала, а плиты в прогон флэта не едут. Остались виды и запуск.

          ⚠ НЕ ЗАВОРАЧИВАТЬ В СВОРАЧИВАНИЕ (`collapsible`/`Fold`): ниже смонтирован приёмник рекола
          `RecalledRunPrompt`, при размонтировании реестр стирает выбор (`recalled.delete`), и жест
          теряется молча. */}
      {/* JOINS left the screen (82-INPUT-REDESIGN, 06.10): the list is a read-only section of
          `what the model gets ▸`, its questions stand above GENERATE (`flat-run-row.tsx`). */}
      <FlatRunRow
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        thumbOf={(id) => thumbUrl(mediaById.get(id))}
      />

      {/* ПРИЁМНИК РЕКОЛА (T-10). Видимого органа у него нет — он рисует только вопрос про описание
          изделия, и только когда описание уже непустое. Внутри блока, не сворачивать. */}
      <RecalledRunPrompt
        techCardId={techCardId}
        band={band}
        disabled={disabled}
        onAccepted={(media) => setPicked((prev) => [...prev, ...media])}
      />

      {/* 1.4 ПОСЛЕДНЯЯ ГЕНЕРАЦИЯ — с O-67 (D-73) своим блоком СРАЗУ ПОД этим, см. `studio-tab.tsx`. */}

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
          if (!rowsWritable(readFlatInput(card))) {
            showMessage(
              `the input is busy — a run is being saved or started, or the prompt is being cleared; detail “${name}” was not added`,
              'error',
            );
            return;
          }
          const release = holdFlatInput(card);
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
            release();
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
 * ОДНА ЯЧЕЙКА СЕТКИ РЕФЕРЕНСОВ (`fRefCell` макета): плитка, и больше ничего под ней (T16).
 *
 * КАДР РИСУЕТ ОБЩИЙ ПРИМИТИВ `PictureTile`, И ЭТО ВЕСЬ ОТВЕТ НА T-7. Владелец: «на тамбнейлах
 * картинок на ховер кнопка сплит должна быть снизу слева я уже второй раз это прошу» — раскладка
 * углов решение примитива (ярлык слева сверху, zoom и ✕ справа сверху, split и crop СЛЕВА СНИЗУ),
 * ячейка объявляет только РОЛИ.
 *
 * ЯРЛЫК — НОМЕР В ПРОМПТЕ `#N`; без роли ярлыка нет, снимок приглушён (`dim`), а угол роли
 * говорит `not sent ▾`.
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
  figure,
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
  /** T70: no role, sent anyway — the model works out what it shows. */
  figure?: boolean;
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

  /**
   * «PROPOSED» — ДЕТАЛЬ, КОТОРУЮ ЗАВЁЛ ЧЕРНОВИК И ЧЕЛОВЕК ЕЩЁ НЕ ПРИНЯЛ (26.09, O-34). Владелец: «в
   * самом окне INPUT — REFERENCES они не помечены как PROPOSED, они так помечены только в FLAT
   * SLOTS». Источник один — журнал черновика (`slotProposed`, тот же, что читает бенч и чипы VIEWS);
   * здесь он спрашивается по указателю строки на слот. Флаг `proposed` под ярлыком — тот же тон,
   * что у слота на бенче. Снимается там же, где у бенча: касание
   * слота (картинка, перо, имя, снос) или `accept all`; своей двери принятия у строки нет.
   */
  const drafted = useDrafted();
  const proposed =
    detailSlotId > 0 &&
    normaliseViewKey(role) === DETAIL_VIEW &&
    drafted.slotProposed(detailSlotId);

  /**
   * ═══ РОЛЬ — МЕНЮ В УГЛУ ПЛИТКИ, А НЕ СЕЛЕКТ ПОД НЕЙ (T16) ═══════════════════════════════════
   * Владелец: «в INPUT — REFERENCES селектор должны быть внутри плитки по принципу как это сделано
   * в flat slots а не отдельным блоком». Угол `not sent ▾` / `front ▾` первым в нижнем правом
   * кластере; список — те же пункты, что были у селекта, текущий отмечен.
   *
   * ПОВТОРНЫЙ ВЫБОР ТЕКУЩЕГО — НИЧЕГО НЕ ДЕЛАЕТ, как у прежнего селекта (Radix не слал
   * `onValueChange` на то же значение): иначе `detail` по уже названной детали заводил бы ВТОРОЙ
   * слот. Исключение одно — деталь без имени: её пункт подписан `detail · name it…` и открывает
   * то же окно называния, что открывала кнопка «name it» рядом с селектом.
   */
  const current = role.trim();
  const isDetail = normaliseViewKey(role) === DETAIL_VIEW;
  const unnamedDetail = isDetail && !detailName;
  const detailWord = detailName
    ? `detail · ${detailName}`
    : detailSlotId > 0
      ? 'detail · slot removed'
      : 'detail · unnamed';
  const menu = readOnly
    ? undefined
    : {
        label: current ? viewLabel(current) || current : figure ? 'figure it out ✦' : 'not sent',
        ariaLabel: `role of ${label}`,
        title: isDetail ? detailWord : undefined,
        disabled: locked,
        'data-menu': `role:${mediaId}`,
        items: roleItemsFor(role).map((item) => {
          const here =
            item.value === FIGURE_ITEM
              ? !current && !!figure
              : item.value === DETAIL_VIEW
                ? isDetail
                : !isDetail && item.value === current && !(figure && !current);
          return {
            value: item.value,
            disabled: item.disabled,
            current: here,
            label:
              item.value === DETAIL_VIEW && isDetail ? (
                <span data-ref-detail={mediaId}>
                  {unnamedDetail ? 'detail · name it…' : detailWord}
                </span>
              ) : (
                item.label
              ),
            title:
              item.value === DETAIL_VIEW && unnamedDetail
                ? 'name this detail — the prompt reads an unnamed one as just “detail”'
                : undefined,
          };
        }),
        onPick: (value: string) => {
          if (value === DETAIL_VIEW && unnamedDetail) return onNameDetail();
          // `not sent` on a role-less picture is still a choice: remembered, GENERATE stops asking.
          if (value === '' && !current) return onRole('');
          if (
            value === FIGURE_ITEM
              ? !current && figure
              : value === DETAIL_VIEW
                ? isDetail
                : !isDetail && value === current && !(figure && !current)
          )
            return;
          onRole(value);
        },
      };
  /**
   * ЯРЛЫК — НОМЕР И РОЛЬ, ВИДНЫ В ПОКОЕ (N3). Меню угла тихое (`TILE_QUIET`), и роль без ярлыка
   * читалась бы только на наведении; у FLAT SLOTS имя слота видно всегда — здесь так же:
   * `#1 · front`, `#2 · detail · collar`. Не отправленная картинка ярлыка не носит.
   */
  const roleWord = isDetail
    ? detailName
      ? `detail · ${detailName}`
      : 'detail'
    : viewLabel(current) || current;
  const badge =
    number != null && current
      ? `#${number} · ${roleWord}`
      : number != null && figure
        ? `#${number} · ✦`
        : undefined;
  const flag = unnamedDetail
    ? {
        word: 'name it',
        tone: 'warn' as const,
        title:
          detailSlotId > 0
            ? 'the detail slot this reference pointed at is gone — name the detail again'
            : 'this detail has no name — pick “detail · name it…” in its role menu',
      }
    : proposed
      ? {
          word: 'proposed',
          tone: 'attention' as const,
          title:
            'the construction draft proposed this detail — put a picture in its flat slot, draw, rename or remove it there to accept',
        }
      : undefined;

  return (
    <div
      className='group flex min-w-0 flex-col gap-1'
      data-ref-cell={mediaId}
      data-ref-proposed={proposed || undefined}
    >
      {/* КАДР 1:1, КАРТИНКА ВПИСЫВАЕТСЯ ЦЕЛИКОМ (`contain`). Навязанное соотношение законно
          ровно потому, что на референсе НЕТ выносок: доля кадра здесь ничего не адресует. */}
      <PictureTile
        url={url}
        alt={label}
        aspect='1/1'
        fit='contain'
        className='w-full'
        badge={badge}
        flag={flag}
        menu={menu}
        dim={!role && !figure}
        gallery={
          url && full
            ? // `meta` НЕСЁТ ID МЕДИА: без него дверь «сохранить как новую картинку» отказывает.
              { ...mediaFullToViewerItem(full), thumbnail: url, alt: label }
            : undefined
        }
        /* ═══ РЕЗ — ТОЛЬКО НА ИЗВЕСТНОМ ЛИСТЕ (item 25, снимает r3 п.4) ═════════════════════════
           `declared` — полоса знает, что это лист: объявленные виды, цепочка правок к ним или
           параметры `one`-прогона (`readSplit`). Остальным кадрам угла нет; кроп стоит на всех. */
        onSplit={
          !readOnly && url && splitOffer === 'declared'
            ? {
                onClick: onSplit,
                pending: splitPending,
                disabled: locked,
                ariaLabel: `cut ${label} into views`,
                title:
                  'split — this picture holds several views at once; cut them out into ' +
                  'pictures of their own',
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

      {/* ПОД КАДРОМ НИЧЕГО (T16): подписи `picture <media_id>` нет с R2 п.17, а роль, флаг
          `proposed` и дверь «name it» переехали в саму плитку — угол меню и флаг под ярлыком. */}
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
