import { GetDesignBandResponse, common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Tiles } from 'ui/components/tiles';
import { revealField } from 'utils/field-errors';

import type { TechCardFormData } from '../schema';
import { detailKeyLabel } from '../tech-card-options';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { InertDoor, displayDetailName, readBench } from './bench-slot';
import {
  filledFlatSlots,
  sentFlatSlotIds,
  useFlatSlotsSend,
  useFlatSlotsSendWrites,
} from './flat-slots-send';
import { cropFamilies } from './generation/composite';
import { FlatRunRow } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { DrawHalf, AskModal, Counter, EmptyState } from './core';
import { VectorModal } from './modals';
import { PictureTile } from './picture-tile';
import { LockBar } from './render/generate-row';
import { pictureOffersSplit } from './render/model';
import { useSplitToInput } from './split-to-input';
import { DETAIL_VIEW, SILHOUETTE_VIEWS, normaliseViewKey, viewLabel } from './views';
import { useDesignWrites } from './use-design-band';

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
 *   заголовок  INPUT — REFERENCES · what this run is given ·                            [CLEAR]
 *   1.1  сетка плиток референсов (кадр 1:1, `#N` в углу, селект вида СРАЗУ под кадром) +
 *        последняя ячейка — плитка на две половины: слот медиа сверху, «draw a reference» снизу;
 *        пусто → та же плитка одна в сетке (второй пары кнопок больше нет);
 *   1.2  WORDS [N CHARACTERS] — textarea во всю ширину (`garmentDescription`);
 *   1.3  FROM CONSTRUCTION ▸ · ALSO SEND THE FLAT SLOTS, под рядом — полосы
 *        LOCKED с причиной и дверью, и чипы плит при включённом тумблере;
 *   1.4  ряд запуска (`./flat-run-row.tsx`): VIEWS (продуктовая строка — проводу нужны
 *        `views[]`), GENERATE · цена · WHAT THE MODEL GETS ▸.
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
 * Роли промпта. Значения — проводные (`front | back | side_l | side_r | three_quarter_l |
 * three_quarter_r | detail`, см. `common.DesignReference`); пустая строка это ПУНКТ СПИСКА, а не
 * отсутствие пункта, и потому законный выбор: примитив селекта пропускает пустоту только когда её
 * кто-то предложил, иначе гасит фантомную пустоту скрытого нативного `<select>`.
 */
/**
 * Потолок `garmentDescription` — ЕДИНСТВЕННОЕ НАПИСАНИЕ ЭТОГО ЧИСЛА. Его читают `maxLength`
 * самого поля и дверь «from construction ▸» (B-15), которая обязана отказать словами, а не
 * молча обрезать хвост описания. Два разных потолка на одно поле — это способ потерять текст на
 * том из них, который меньше (ровно тот же довод, что у `CONCEPT_MAX` в `./mood-board`).
 */
const GARMENT_MAX = 2000;

const ROLE_ITEMS = [
  { value: '', label: '— not sent —' },
  // РОВНО СЛОВАРЬ ПРОВОДА, В ЕГО ПОРЯДКЕ (`views.ts`): шесть силуэтов и деталь. Слов макета
  // «silhouette / stitching / hardware» на проводе НЕТ — селект остаётся продуктовым.
  ...SILHOUETTE_VIEWS.map((view) => ({ value: view, label: viewLabel(view) })),
  { value: DETAIL_VIEW, label: viewLabel(DETAIL_VIEW) },
];

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

const fullUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

/** Строка указаний карточки. Поле одно на всю карточку и приколото к `media_id` (см. J-8 ниже). */
type CalloutRow = NonNullable<TechCardFormData['callouts']>[number];

/**
 * ПРЕДЛАГАТЬ ЛИ РЕЗ — ОТВЕТ ТРОИЧНЫЙ, И ТРЕТЬЕ ЗНАЧЕНИЕ ТЕПЕРЬ НАЗВАНО ТИПОМ, А НЕ `?? false`.
 *
 *   · `declared` — полоса ЗАЯВИЛА виды (`composite_views`), и подсказка вправе говорить факт;
 *   · `no`       — полоса заявила обратное (одновидовой чертёж, уже резаный кадр) — угла нет;
 *   · `unknown`  — за медиа чертежа полосы нет вовсе (обычная ссылка из библиотеки). Система не
 *                  знает и знать не может; угол стоит, но ПРЕДЛАГАЕТ, а не утверждает.
 *
 * Булев тип третье состояние выразить не мог, и оно молча становилось вторым — ровно тот приём,
 * которого стоит избегать: сначала спроси, нельзя ли сделать неправильное состояние невыразимым.
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
   * ═══ ПРЕДЛАГАТЬ ЛИ РЕЗ НА ЭТОЙ СТРОКЕ ВХОДА (F-8, F-18) ══════════════════════════════════════
   *
   * Владелец, дословно: «везде где картинка не мультивью флет или рендер там не должно на ховер
   * показываться сплит» и «на уже заспличеных картинках на ховер сплит писать не нужно».
   *
   * ⚠ ЭТА ПЛИТКА БЫЛА ЕДИНСТВЕННЫМ МЕСТОМ, ГДЕ УГОЛ НЕ СВЕРЯЛСЯ НИ С ОДНИМ ИЗ ДВУХ УСЛОВИЙ.
   * Ворота стояли `!readOnly && url` — то есть «файл есть и карточка пишется», — и потому `split`
   * предъявлялся ЛЮБОМУ снимку, принесённому в референсы руками: одиночной фотографии ткани,
   * куску чужого разреза, уже разрезанному листу. Правило при этом было записано прозой в
   * `picture-tile.tsx` и переписано на трёх других экранах; здесь его просто не переписали.
   * Носитель правила теперь один — `pictureOffersSplit` (`render/model.ts`), и эта карта готовит
   * ему ровно два факта, которых у строки входа нет на руках.
   *
   * СТРОКА ВХОДА — ЭТО `media_id`, А ПРЕДИКАТ СПРАШИВАЕТ ПРО `DesignPicture`. Разрешение идёт по
   * тому же обходу, что и `mediaById` выше (прогоны и партии полосы), и результат ТРОИЧЕН — теперь
   * и по типу, а не только по смыслу.
   *
   * ⚠ ТРЕТЬЕ ЗНАЧЕНИЕ ХРАНИЛОСЬ БУЛЕВЫМ И СХЛОПЫВАЛОСЬ В `false` У МЕСТА ВЫЗОВА (`?? false`), А
   * ДОВОД РЯДОМ ЗВУЧАЛ ТАК: «угол это тихий орган, и предъявлять его на догадке нельзя». Довод
   * верен ровно наполовину, и вторую половину видно только рядом с полосой флэтов. Ссылка,
   * ВЫБРАННАЯ ИЗ БИБЛИОТЕКИ, чертежа полосы не имеет вовсе — за ней не стоит ни прогона, ни
   * партии, — то есть в «разрешить не удалось» попадает НЕ край, а обычный, ежедневный случай.
   * Исход: лукбук на четыре вида, брошенный в INPUT — REFERENCES, не режется НИГДЕ. `onCrop`
   * рядом жив, но он режет ОДИН кадр и замещает им строку — это другой глагол, а не замена.
   * А полоса флэтов на тот же вопрос отвечает ИНАЧЕ: там для этого заведено именованное
   * исключение (`broughtByHandAndUncut`), потому что у принесённого руками листа `composite_views`
   * пусты ПО ОПРЕДЕЛЕНИЮ и объявить его многовидовым может только человек. Два экрана отвечали на
   * один вопрос по-разному, и одна из двух копий правила просто не была дописана.
   *
   * ПОЭТОМУ «НЕ ЗНАЮ» ЗДЕСЬ БОЛЬШЕ НЕ ЗНАЧИТ «НЕТ»: `unknown` — своё значение, и угол на нём
   * стоит. Ценой ОДНОГО условия: он ПРЕДЛАГАЕТ ДЕЙСТВИЕ и ничего не утверждает о файле — то же
   * правило и та же формула, что у флэтов («nothing on record says it does, so only you can
   * tell»). Тихим орган остаётся не отсутствием, а тем, что не врёт.
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
  const [clearing, setClearing] = useState(false);
  const flatSend = useFlatSlotsSend(techCardId);
  const { setOn: setFlatSendOn, exclude, restore } = useFlatSlotsSendWrites();

  /**
   * ЧТО ЧИСТИТСЯ: слова (`garmentDescription`), роли референсов (и с ними — порядок промпта),
   * переключатель «also send the flat slots» вместе с поимённым списком снятых плит.
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
   *    ниже называет это словами, чтобы «clear» не обещал больше, чем делает.
   * 3. `flatSlotsSend` — местное состояние вкладки, выключается вместе со списком исключений.
   */
  async function runClear() {
    setClearAsk(false);
    setClearing(true);
    const roleIds = [...refOf.keys()];
    const failed = new Set<number>();
    // Последовательно, а не залпом: «кто не очистился» должно совпадать с тем, что осталось на
    // экране, детерминированно.
    for (const mediaId of roleIds) {
      try {
        await setReferenceRole.mutateAsync({ mediaId, role: '', ordinal: 0 });
      } catch {
        failed.add(mediaId);
      }
    }
    setValue('garmentDescription', '', { shouldDirty: true });
    setFlatSendOn(techCardId, false);
    setClearing(false);
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

  // ── описание из CONSTRUCTION (B-15) ─────────────────────────────────────────────────────────
  //
  // ЧИТАЕТСЯ ТО ЖЕ, ЧТО РИСУЕТ `DetailsEditor`: массив `details[]`, где ключ — аспект, а текст —
  // его описание, в порядке формы. Имя аспекта берётся ОДНОЙ функцией со всеми прочими экранами
  // (`detailKeyLabel`). ПЛЮС `fit` — поле GENERAL INFORMATION, отдельной строкой перед аспектами:
  // посадка — тоже конструкция, а `silhouette` и `fabric` уже есть среди аспектов `details[]`.
  // `concept` НЕ берётся намеренно: это проза для цеха, другой документ (входит в подпись DESIGN).
  const aspects = (useWatch({ control, name: 'details' }) ?? []) as {
    key?: string;
    text?: string;
    mediaIds?: number[];
  }[];
  const fit = ((useWatch({ control, name: 'fit' }) ?? '') as string).trim();
  const aspectText = useMemo(() => {
    const lines = aspects
      .map((d) => ({ label: detailKeyLabel(d.key), text: (d.text ?? '').trim() }))
      .filter((d) => !!d.text)
      .map((d) => `${d.label}: ${d.text}`);
    return [...(fit ? [`fit: ${fit}`] : []), ...lines].join('\n');
  }, [aspects, fit]);
  /**
   * КАРТИНКИ АСПЕКТОВ НЕ ЕДУТ (WAVE2 п.6). `from construction ▸` материализует ТОЛЬКО ТЕКСТ; у
   * аспекта могут быть приколотые картинки (`details[].mediaIds`), и молчание о них читалось бы
   * как «поехали вместе со словами». Число считается здесь дёшево, из той же формы, и говорится
   * состоянием у самой двери — только пока такие картинки есть.
   */
  const aspectPictures = useMemo(
    () => aspects.reduce((n, d) => n + (d.mediaIds?.length ?? 0), 0),
    [aspects],
  );
  /** Перезапись НЕПУСТОГО описания спрашивается: чужой текст исчезает без единого следа (PRODUCT.md). */
  const [askTakeAspects, setAskTakeAspects] = useState(false);

  function writeAspects() {
    if (aspectText.length > GARMENT_MAX) {
      // Молча обрезанное описание — это предложение, потерявшее хвост без единого слова об этом.
      showMessage(
        `the aspects do not fit — the description holds ${GARMENT_MAX} characters and they are ${aspectText.length}; shorten them in CONSTRUCTION first`,
        'error',
      );
      return;
    }
    setValue('garmentDescription', aspectText, { shouldDirty: true });
    showMessage('the description is taken from the construction aspects', 'success');
  }

  function takeAspects() {
    if (!aspectText) return;
    if (((getValues('garmentDescription') ?? '') as string).trim()) {
      setAskTakeAspects(true);
      return;
    }
    writeAspects();
  }

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
    const media = crop.media;
    const newMediaId = media?.id;
    if (newMediaId == null || newMediaId === oldMediaId) return;

    // Кроп рисуется ДО того, как библиотечная карта о нём узнает: без этого ячейка, которую мы
    // сами и завели, нарисовала бы «media #N not resolved».
    setPicked((prev) => [...prev, media as common_MediaFull]);

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
    setReferenceRole.mutate(
      { mediaId: newMediaId, role: carried.role, ordinal, note: carried.note },
      { onSuccess: () => setReferenceRole.mutate({ mediaId: oldMediaId, role: '', ordinal: 0, note: '' }) },
    );
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

  /** Кнопке нечего чистить — она выключена, а не спрятана: пустое место не объясняет, куда она делась. */
  const garmentChars = ((garment.field.value ?? '') as string).trim().length;
  const nothingToClear = refOf.size === 0 && garmentChars === 0 && !flatSend.on;

  /**
   * ═══ ПЛИТЫ, КОТОРЫЕ ЕДУТ С ПРОМПТОМ — ЧИПЫ ПОД РЯДОМ ДВЕРЕЙ (J-10, форма макета) ═════════════
   *
   * Здесь стояла линейка «also shown — flat slots» с миниатюрами плит под пеленой и нумерацией.
   * Макет (`fPromptDoors`) рисует ПО ЧИПУ на заполненную плиту, только пока тумблер включён:
   * чип залит — плита едет, снят — вычеркнута поимённо. Снятое поимённо переживает выключение
   * тумблера (`flat-slots-send.ts`). Что именно уедет и под какими номерами — опись в модалке
   * WHAT THE MODEL GETS ▸, одна на все шаги; здесь только выключатели.
   *
   * ⚠ ДУБЛИКАТ ЧЕСТЕН В `title`: плита, чей файл уже стоит референсом, в `flat_slot_ids` уезжает
   * как всякая не снятая (человек её не снимал), но новой картинки в промпт не добавляет — сервер
   * дедуплицирует и оставляет первое вхождение, референс. Замерено на стенде.
   */
  const plates = useMemo(() => filledFlatSlots(band), [band]);
  const sentIds = new Set(sentFlatSlotIds(flatSend, plates.map((p) => p.slotId)));

  /**
   * ДВЕРЬ «GENERAL INFORMATION ›» лок-полосы — тем же механизмом, которым отказ сейва ведёт к полю:
   * `revealField('fit')` не находит якоря на этом шаге, спрашивает документ, и композитор
   * (`studio-tab.tsx`, `stepOfField`) переключает студию на MOODBOARD и мигает полем FIT. Второго
   * писателя `?step=` здесь не заводится.
   */
  const gotoGeneral = () => {
    if (!revealField('fit')) showMessage('general information is not on this screen', 'error');
  };

  return (
    <Section
      title='input — references'
      question='— what this run is given'
      /* ═══ ШАПКА ДЕРЖИТ ОДНУ ДВЕРЬ, А НЕ ДВЕ ПЛАШКИ (R2 п.19) ══════════════════════════════════
         Владелец, дословно: «кнопку CLEAR помести туда, где STEP 2 · 3 OF 3 REFERENCES; сами эти
         пилюли удалить». Обе плашки были подписями, а не органами: номер шага уже назван рельсой
         студии слева, а счёт референсов виден по самой сетке плиток под шапкой. На их месте
         теперь ОДНА дверь — та, что чистит промпт; из ряда дверей ниже она ушла, чтобы «clear»
         не стоял в двух местах сразу. */
      action={
        !readOnly ? (
          <Button
            variant='secondary'
            size='xs'
            data-clear-prompt=''
            loading={clearing}
            disabled={clearing || nothingToClear}
            onClick={() => setClearAsk(true)}
            title='clears the words and the reference roles — the pictures stay'
          >
            clear
          </Button>
        ) : undefined
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

      {/* ═══ 1.2 WORDS — один текст на весь промпт (SPEC п.10): записок у картинок нет. Поле
          `garmentDescription`; `data-field` — якорь двери «edit the description ▸» из панели
          WHAT THE MODEL GETS (`revealField` ищет по `[data-field]`). */}
      <div>
        <div className='mb-0.5 flex flex-wrap items-center gap-1.5'>
          <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
            words
          </Text>
          {garmentChars > 0 && <Counter n={garmentChars} noun='character' />}
        </div>
        <label htmlFor={garmentId} className='sr-only'>
          words for the model
        </label>
        <Textarea
          {...garment.field}
          data-field='garmentDescription'
          id={garmentId}
          disabled={readOnly}
          value={garment.field.value ?? ''}
          rows={3}
          maxLength={GARMENT_MAX}
          placeholder='what this flat has to show'
          aria-label='words for the model'
          className='resize-y'
        />
        {/* КАРТИНКИ АСПЕКТОВ НЕ ЕДУТ, И ЭТО СКАЗАНО СОСТОЯНИЕМ (WAVE2 п.6) — только пока они есть. */}
        {aspectPictures > 0 && (
          <Text size='micro' variant='label' component='p' data-aspect-pictures={aspectPictures}>
            from construction ▸ takes the words only — the {aspectPictures} picture
            {aspectPictures === 1 ? '' : 's'} pinned to the aspects {aspectPictures === 1 ? 'does' : 'do'}{' '}
            not travel. Add {aspectPictures === 1 ? 'it' : 'them'} as references here if the model
            should see {aspectPictures === 1 ? 'it' : 'them'}.
          </Text>
        )}
      </div>

      {/* ═══ 1.3 ДВЕ ДВЕРИ ПРОМПТА: FROM CONSTRUCTION ▸ · ALSO SEND THE FLAT SLOTS. Погашенная
          дверь объясняется ПОЛОСОЙ под рядом, не title.
          ⚠ CLEAR ОТСЮДА УЕХАЛ В ШАПКУ БЛОКА (R2 п.19) и второй копией здесь не остался: две
          кнопки с одним глаголом на одном экране — это ровно то, что владелец просил не делать. */}
      <div className='flex flex-wrap items-center gap-2' data-prompt-doors=''>
        {/* ВЗЯТЬ ОПИСАНИЕ ИЗ CONSTRUCTION (B-15): `details[]` — аспекты в порядке `DetailsEditor`,
            плюс `fit` первой строкой; пустые аспекты не берутся. Поле трёхсостоянийное (schema.ts):
            дверь ставит ЗНАЧЕНИЕ и только его — команду «сотри» она не отдаёт никогда. Непустое
            описание перезаписывается с вопросом (`AskModal` ниже). */}
        {readOnly ? null : aspectText ? (
          <Button
            variant='secondary'
            size='sm'
            data-take-aspects=''
            onClick={takeAspects}
            title='fill the words from CONSTRUCTION — fit first, then one line per filled aspect, in the order they are described there'
          >
            from construction ▸
          </Button>
        ) : (
          <InertDoor
            label='from construction ▸'
            size='sm'
            reason='no construction text yet — fill GENERAL INFORMATION or CONSTRUCTION above'
          />
        )}
        {/* ТУМБЛЕР ПЛИТ — ЧИП: состояние `on` несёт заливка + `aria-pressed`. Погашен, пока ни
            одна плита не стоит; причина — полосой ниже. */}
        <Chip
          selected={flatSend.on}
          pressed={flatSend.on}
          disabled={readOnly || plates.length === 0}
          data-use-flat-slots=''
          onClick={() => setFlatSendOn(techCardId, !flatSend.on)}
          title='the plates standing in FLAT SLOTS go to the model after the references — they are usually flats it drew before, so it tends to redraw them'
        >
          also send the flat slots
        </Chip>
      </div>
      {!readOnly && !aspectText && (
        <LockBar reason='no construction text yet · fill GENERAL INFORMATION or CONSTRUCTION above'>
          <Button variant='secondary' size='xs' onClick={gotoGeneral}>
            general information ›
          </Button>
        </LockBar>
      )}
      {plates.length === 0 && <LockBar reason='no flat slots are filled · nothing extra to send' />}
      {flatSend.on && plates.length > 0 && (
        <div data-flat-plates={plates.length}>
          <ChipRow>
            {plates.map((plate) => {
              const travels = sentIds.has(plate.slotId);
              const already = promptNumber.get(plate.mediaId);
              return (
                <Chip
                  key={plate.slotId}
                  selected={travels}
                  pressed={travels}
                  disabled={readOnly}
                  data-flat-plate={plate.slotId}
                  aria-label={`${plate.label} plate`}
                  title={
                    already != null
                      ? `its file already travels as reference #${already} — the server keeps the first copy`
                      : travels
                        ? 'travels after the references — click to take it off by name'
                        : 'taken off by name — click to send it again'
                  }
                  onClick={() =>
                    travels
                      ? exclude(techCardId, plate.slotId)
                      : restore(techCardId, plate.slotId)
                  }
                >
                  {plate.label}
                </Chip>
              );
            })}
          </ChipRow>
        </div>
      )}

      {/* ═══ 1.4 РЯД ЗАПУСКА (`runDoors('flat')` макета) — виды, GENERATE, деньги, дверь описи.
          Отдельным компонентом, чтобы его хуки не вмешивались в порядок хуков этой секции.
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
          уходят с сервера СЕЙЧАС, слова — с карточки при её сохранении. Картинки остаются. */}
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
            {flatSend.on ? ', and turns “also send the flat slots” off' : ''}. The pictures stay.
          </Text>
          <Text size='control'>
            Roles are removed from the server now, one by one; the words leave the card when you
            next save it. The {members.length} picture{members.length === 1 ? ' stays' : 's stay'} in
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
          writeRef(target.mediaId, DETAIL_VIEW, slotId);
          showMessage(`detail “${name}” added — tick it in VIEWS below`, 'success');
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

      {/* ЦЕНА ДВЕРИ «FROM CONSTRUCTION» НАЗЫВАЕТСЯ ДО ЖЕСТА, И ТОЛЬКО КОГДА ЕСТЬ ЧТО ТЕРЯТЬ (B-15). */}
      <AskModal
        open={askTakeAspects}
        onDo={() => {
          setAskTakeAspects(false);
          writeAspects();
        }}
        onClose={() => setAskTakeAspects(false)}
        title='replace the words?'
        verb='replace them'
        note={null}
        sentence='The words below are replaced by the construction aspects, one line each. What is written there now is not kept anywhere else — copy it first if you need it.'
      />
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
 * ДВЕ ПОЛОВИНЫ ОДНОЙ ПЛИТКИ, А НЕ ПЛИТКА С КНОПКАМИ. Верх — слот медиа как он есть (клик в
 * библиотеку, ⌘V, бросок файла, фотоглиф — всё внутри примитива, и второго их написания здесь не
 * заводится); низ — перо и «draw a reference» на той же полосатой поверхности. Одна линия между
 * половинами: рамку несёт коробка, у половин своей нет.
 *
 * ТА ЖЕ ПАРА ПОЛОВИН СТОИТ НА ПУСТОЙ ЯЧЕЙКЕ FLAT SLOTS, и обе рисует ОДИН орган — `DrawHalf`
 * (`./bench-slot`). Второе начертание половины разъехалось бы с первым молча.
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
    <div
      data-ref-placeholder=''
      /* Рост и деление — ИНЛАЙНОМ: стенд читает CSS готовой сборки, где произвольного класса,
         которого не было в дереве на момент сборки, нет вовсе (замерено на `h-[calc(50%+1px)]`
         этой же ячейки раньше). Геометрия деления — не кожа системы. */
      style={{
        ...PLACEHOLDER_SURFACE,
        /* КВАДРАТ, КАК КАДР СОСЕДА, И ЭТО ОБЯЗАНО БЫТЬ ОПРЕДЕЛЁННОЙ ВЫСОТОЙ. Пока высота была
           «сколько получится» (`h-full` + `minHeight`), строку грида распирало СОДЕРЖИМОЕ верхней
           половины — у кнопки слота свои пропорции 4/5, — и плитка вырастала до 500 пикселей при
           231 у соседней ячейки (замерено). С определённой высотой две строки `1fr` просто делят
           её пополам, а `alignSelf: start` не даёт растянуть коробку под ряд. */
        aspectRatio: '1/1',
        alignSelf: 'start',
        minHeight: 0,
        ...(full ? {} : { display: 'grid', gridTemplateRows: '1fr 1fr' }),
      }}
      className={cn(
        'min-w-0 overflow-hidden border border-dashed border-borderColor',
        full && 'flex items-center justify-center px-2 text-center',
      )}
    >
      {full ? (
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          the input is full
        </Text>
      ) : (
        <>
          {/* Обёртка с нулевым минимумом — см. разбор у `EmptyCell` в `./bench-slot`: без неё
              собственные пропорции кнопки слота растягивают строку грида, и половина перестаёт
              быть половиной. */}
          <div style={{ minHeight: 0, overflow: 'hidden' }} className='min-w-0'>
            <MediaSlot
              label='+ reference'
              purpose='design reference'
              aspectRatio={['Custom']}
              allowMultiple
              showVideos={false}
              onSelect={onSelect}
              sizeClassName='h-full w-full'
              className='border-0'
            />
          </div>
          <DrawHalf
            anchor='reference'
            label='draw a reference'
            /* Единственное, чем эта половина отличается от трёх соседних: адрес — не слот. */
            into='the input'
            onClick={onDraw}
          />
        </>
      )}
    </div>
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
        /* РЕЗ ПРЕДЛАГАЕТСЯ ТОЛЬКО СКЛЕЕННОМУ И ЕЩЁ НЕ РЕЗАНОМУ КАДРУ (F-8, F-18); третье значение
           «не знаю» ПРЕДЛАГАЕТ и ничего не утверждает о файле — та же формула, что на полосе
           флэтов (`render/render-input-strip.tsx`). */
        onSplit={
          !readOnly && url && splitOffer !== 'no'
            ? {
                onClick: onSplit,
                pending: splitPending,
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
          name={`ref-role-${mediaId}`}
          items={ROLE_ITEMS}
          value={role}
          placeholder='— not sent —'
          readOnly={readOnly}
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
          <Button variant='secondary' size='xs' onClick={onNameDetail} data-name-detail={mediaId}>
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
