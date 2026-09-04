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
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { displayDetailName, readBench } from './bench-slot';
import {
  filledFlatSlots,
  sentFlatSlotIds,
  useFlatSlotsSend,
  useFlatSlotsSendWrites,
} from './flat-slots-send';
import { cropFamilies } from './generation/composite';
import { RecalledRunPrompt } from './history-recall';
import { VectorModal } from './modals';
import { PictureTile } from './picture-tile';
import { pictureOffersSplit } from './render/model';
import { useSplitToInput } from './split-to-input';
import { DETAIL_VIEW, normaliseViewKey } from './views';
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
 * ✕ УНОСИТ СУЩНОСТЬ ЦЕЛИКОМ — картинку входа, её роль и её записку — и спрашивает перед этим,
 * называя, в скольких прогонах эта картинка участвовала. Доски он не касается: там своя строка со
 * своим ✕, который называет свою цену.
 *
 * БЛОК СТАТИЧЕН (T-11, круг 4): «INPUT — REFERENCES статичны там только референсы и тексты промпта
 * все остальное там не нужно». Здесь нет и не должно появиться ни состояний прогона, ни описей
 * снимка («the pictures it was given», «the plates it was given» — НИКОГДА, слово владельца), ни
 * кнопки запуска: прогон стартует только из GENERATION — FLAT → GENERATE. Всё, что рисует этот
 * блок, — описание изделия, картинки входа с ролями и записками и дверь добавления.
 *
 * ФЛЭТЫ САМИ СЮДА НЕ ПОПАДАЮТ (T-15): «в INPUT — REFERENCES не должны уходить все флеты если мы их
 * явно туда сами не добавим». Строку входа заводят ровно три ЖЕСТА ЧЕЛОВЕКА — слот «+ reference»
 * ниже, «take into input» на плитке мудборда и разрез СВОЕГО референса угловой кнопкой split. Тот
 * же хук разреза работает и на верстаке, но там он входа не пополняет (`addToInput` ниже).
 */

/**
 * Роли промпта. Значения — проводные (`front | back | side_l | side_r | detail`, см.
 * `common.DesignReference`); пустая строка это ПУНКТ СПИСКА, а не отсутствие пункта, и потому
 * законный выбор: примитив селекта пропускает пустоту только когда её кто-то предложил, иначе
 * гасит фантомную пустоту скрытого нативного `<select>`.
 */
const ROLE_ITEMS = [
  { value: '', label: '— not in prompt —' },
  { value: 'front', label: 'front' },
  { value: 'back', label: 'back' },
  { value: 'side_l', label: 'side L' },
  { value: 'side_r', label: 'side R' },
  { value: 'detail', label: 'detail' },
];

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

const fullUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

/**
 * ЯЧЕЙКА ГРИДА — две колонки: кадр 160px и всё остальное. Ни рамки вокруг ячейки, ни заголовка
 * группы: блок один, внутри — рулёная сетка, строки разделены волосяной линией (внутренний вес),
 * колонки — зазором в 24px. Рамка ячейки была бы блоком в блоке.
 */
const CELL = 'grid min-w-0 grid-cols-[160px_1fr] items-start gap-3 py-3';

/**
 * Глиф нижней половины плейсхолдера (C-4) — перо, тем же штрихом и в той же коробке 24×24, что
 * фотоглиф верхней половины у `MediaSlot`: две половины одной плитки обязаны читаться одной парой
 * «знак + глагол», а не «знак + глагол» против «глагол». Тот глиф примитив не экспортирует, и
 * этот ему не пара по коду — только по метрике: `aria-hidden`, `currentColor`, штрих 1.25.
 */
function PenGlyph() {
  return (
    <svg
      aria-hidden
      width={24}
      height={24}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
      className='shrink-0'
    >
      <path d='M4.5 19.5 6 14.5 16.5 4l3.5 3.5L9.5 18z' />
      <path d='M14.5 6l3.5 3.5' />
      <path d='M6 14.5l3.5 3.5' />
    </svg>
  );
}

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
   * едет нулём, а ноль на проводе значит «оставь как было», НЕ «очисти»: правка одной записки не
   * смеет разорвать связь с деталью, о которой её никто не спрашивал. Роль, отличная от `detail`,
   * очищает связь на сервере сама — присылать что-либо ради этого не нужно.
   */
  function writeRef(mediaId: number, role: string, note: string, detailSlotId?: number) {
    // ORDINAL — ЭТО ПОЗИЦИЯ ВО ВХОДЕ, а не номер промпта. Номер промпта выводится сканом (см.
    // выше), и класть его в хранимое поле значило бы завести второй источник одной величины,
    // который расходится с первым при каждом снятии роли.
    setReferenceRole.mutate({
      mediaId,
      role,
      ordinal: role ? ordinalOf(mediaId) : 0,
      note,
      detailSlotId,
    });
  }

  function setRole(mediaId: number, role: string) {
    const note = refOf.get(mediaId)?.note ?? '';
    /* ─── РОЛЬ `detail` ЗАВОДИТ СЛОТ, А НЕ ТОЛЬКО ПОДПИСЫВАЕТ КАРТИНКУ ───
     *
     * Владелец (V-1): «я добавил в INPUT — REFERENCES реффренс с фото детали но GENERATION — FLAT
     * его не оказалось и выбрать генерацию детали нельзя». Жест был ВЕРНЫЙ — в списке ролей стоит
     * `detail`, он его и выбрал. Дефект в том, что выбор роли говорил только «модель увидит эту
     * картинку как деталь» и НЕ заводил слота на верстаке, а форма генерации предлагает ровно
     * слоты (`bench.details` → `detail_slot_ids` круга 4). Деталь существовала для модели и не
     * существовала для человека.
     *
     * ПОЧЕМУ СЛОТ РОЖДАЕТСЯ ПУСТЫМ. Слот держит ПЛИТУ — технический чертёж детали, который и
     * печатается на листе. Референс — это фотография, которую модель СМОТРИТ. Положить фотографию
     * в слот значило бы напечатать снимок там, где обязан быть чертёж. Поэтому слот заводится
     * пустым и ждёт того, что вернёт генерация, а фотография остаётся референсом с ролью.
     *
     * ИМЯ ОБЯЗАТЕЛЬНО, И ЭТО НЕ ФОРМАЛЬНОСТЬ: `detail_slot_ids` адресует деталь ИМЕНЕМ СЛОТА, и
     * безымянный слот приезжает в промпт словом «detail» — ровно тем, от чего уходили в круге 4.
     * Комментарий необязателен и едет ЗАПИСКОЙ РЕФЕРЕНСА: это и есть «что эта картинка добавляет»,
     * поле уже существует и уже читается промптом. Второго места для тех же слов заводить нельзя. */
    if (normaliseViewKey(role) === DETAIL_VIEW) {
      setNamingDetail({ mediaId, note });
      return;
    }
    // СНЯТИЕ РОЛИ УНОСИТ ЗАПИСКУ, и это не наш выбор, а форма хранения: строка полосы И ЕСТЬ
    // существование роли, записка — её колонка. Раз цена не наша, тем более она обязана быть
    // названа ДО, а не обнаружена после: молчащий селект стёр бы набранные руками слова.
    if (!role && note.trim()) {
      setPendingRoleClear(mediaId);
      return;
    }
    // Записка переносится на новую роль ЯВНО. Не передать её — значит стереть: у поля семантика
    // «пустая строка на живой строке очищает».
    writeRef(mediaId, role, note);
  }

  /**
   * Записка коммитится по УХОДУ ФОКУСА, а не по нажатию клавиши: это сетевой upsert, и запрос на
   * каждый символ — это и деньги, и гонка, в которой побеждает самый медленный ответ.
   */
  function commitNote(mediaId: number, note: string) {
    const current = refOf.get(mediaId);
    // Без роли записку хранить негде — строки полосы не существует. Поле в этом состоянии и не
    // редактируется (см. ячейку), но сторож стоит и здесь: путь записи один, и он обязан отвечать
    // за себя сам.
    if (!current) return;
    if ((current.note ?? '') === note) return;
    writeRef(mediaId, current.role, note);
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
  /** Снятие роли, которое уносит с собой набранную записку, — спрашивается отдельно. */
  const [pendingRoleClear, setPendingRoleClear] = useState<number | null>(null);
  /** Референс, который назначают деталью: ждём имени (обязательного) и комментария. */
  const [namingDetail, setNamingDetail] = useState<{ mediaId: number; note: string } | null>(null);

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

  // ── clear: весь вход одним движением (R-15) ─────────────────────────────────────────────────
  const [clearAsk, setClearAsk] = useState(false);
  const [clearing, setClearing] = useState(false);

  /**
   * СНОС ВХОДА — картинки, роли, записки, описание изделия. Три вещи, которые обязаны быть
   * сказаны, потому что их диктует провод, а не наш вкус:
   *
   * 1. РОЛИ СНИМАЮТСЯ ПО ОДНОЙ. Bulk-глагола на проводе нет — это N вызовов
   *    `SetDesignReferenceRole(role='')`, и они НЕ атомарны. Поэтому (а) перед сносом стоит
   *    вопрос с числами (разрушение без вопроса запрещено правилами продукта), (б) частичный
   *    провал НЕ съедается: роль, которую снять не удалось, ОСТАЁТСЯ на экране вместе со своей
   *    строкой входа, и итог говорит «cleared K of N», а не «готово».
   * 2. ПОРЯДОК: сначала роли, потом строки — тот же, что у одиночного ✕: снятая строка при живой
   *    роли рождала бы носителя роли без строки на карточке (стрея) на ровном месте.
   * 3. ОПИСАНИЕ ИЗДЕЛИЯ чистится ТОЛЬКО В ФОРМЕ — у поля нет своего RPC, оно едет с документом.
   *    `''` здесь — не «пусто по незнанию», а КОМАНДА «сотри» трёхсостоянийного протокола
   *    (absent = сохрани, '' = сотри): следующий сейв карточки унесёт описание и с сервера.
   *    До сейва — и при закрытой без сейва вкладке — сервер держит старый текст. Вопрос ниже
   *    называет это словами, чтобы «clear» не обещал больше, чем делает.
   */
  async function runClear() {
    setClearAsk(false);
    setClearing(true);
    const roleIds = [...refOf.keys()];
    const failed = new Set<number>();
    // Последовательно, а не залпом: залп из N мутаций делает порядок отказов случайным, а «кто
    // не очистился» должно совпадать с тем, что осталось на экране, детерминированно.
    for (const mediaId of roleIds) {
      try {
        await setReferenceRole.mutateAsync({ mediaId, role: '', ordinal: 0, note: '' });
      } catch {
        failed.add(mediaId);
      }
    }
    // Строки входа: уходят все, КРОМЕ носителей неснявшейся роли — их референс переживает снос
    // ЦЕЛИКОМ (картинка+роль+записка), чтобы на экране осталась ровно та сущность, которую есть
    // чем снять повторно. Доски фильтр не касается.
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter(
        (i) => !isInputRow(i) || failed.has(i.mediaId),
      ),
    );
    setValue('garmentDescription', '', { shouldDirty: true });
    setClearing(false);
    if (failed.size) {
      // Каждый отказ уже прокричал своей сноской из шва записи; эта строка — ИТОГ, по которому
      // видно, что снос был частичным, даже если сноски отказа промелькнули.
      showMessage(
        `cleared ${roleIds.length - failed.size} of ${roleIds.length} prompt roles — ${failed.size} reference${failed.size === 1 ? '' : 's'} stayed`,
        'error',
      );
    } else {
      showMessage('the input is clear', 'success');
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
  const nothingToClear =
    members.length === 0 && refOf.size === 0 && !(garment.field.value ?? '').trim();

  return (
    <Section
      title='input — references'
      question='— what the model is shown when it draws a flat'
      action={
        <span className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span'>
            {members.length} picture{members.length === 1 ? '' : 's'} · {inPrompt} in the prompt
          </Text>
          {/* CLEAR СНОСИТ ВЕСЬ ВХОД (R-15) и потому спрашивает: под ним N сетевых снятий ролей
              вместе с записками. Кнопка стоит у заголовка блока — она про блок целиком, а не про
              одну ячейку. */}
          {!readOnly && (
            <Button
              size='xs'
              variant='secondary'
              loading={clearing}
              disabled={clearing || nothingToClear}
              onClick={() => setClearAsk(true)}
            >
              clear
            </Button>
          )}
        </span>
      }
    >
      {/* ОПИСАНИЕ ИЗДЕЛИЯ — ОДНО НА ВСЁ, и оно уходит в КАЖДЫЙ прогон. Стоит НАД картинками,
          потому что читается вместе с каждой из них: каждая ячейка ниже добавляет строку про
          СЕБЯ, а общее про изделие сказано здесь один раз.
          ⚠ Провода у поля пока нет — см. TODO(`garment_description`) в `schema.ts`. */}
      <div>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label' component='span'>
              read with all {members.length} picture{members.length === 1 ? '' : 's'} · goes into
              every run
            </Text>
          }
        >
          garment description
        </GroupLabel>
        <label htmlFor={garmentId} className='sr-only'>
          garment description
        </label>
        {/* `data-field` — ЯКОРЬ ДВЕРИ. `revealField` (`utils/field-errors.ts:226`) ищет поле по
            `[data-field="<путь>"]`, и обычно этот штамп ставит `FormItem` из `ui/form`; здесь стоит
            голая `Textarea`, поэтому штамп нужен руками. Без него дверь «edit the description ▸» из
            панели WHAT THE MODEL GETS отвечает «it is not on this tab», стоя на той самой вкладке. */}
        <Textarea
          {...garment.field}
          data-field='garmentDescription'
          id={garmentId}
          disabled={readOnly}
          value={garment.field.value ?? ''}
          rows={3}
          maxLength={2000}
          placeholder='what the garment is — read together with every picture below'
          className='resize-none'
        />
        <Text size='micro' variant='label' className='mt-px'>
          one description for the whole garment. each picture below adds a line about itself.
        </Text>
      </div>

      <div>
        <GroupLabel
          action={
            <Text size='micro' variant='label' component='span'>
              each one is read together with the description above
            </Text>
          }
        >
          the pictures
        </GroupLabel>

        {/* ГРИД 2×N: `auto-fit` с минимумом 470px даёт при ширине админки ровно две колонки и
            честно схлопывается в одну на узком окне. Между колонками — зазор, между строками —
            волосяная линия на самих ячейках. */}
        <div className='grid gap-x-gutter [grid-template-columns:repeat(auto-fit,minmax(470px,1fr))]'>
          {members.map((mediaId) => (
            <ReferenceCell
              key={mediaId}
              mediaId={mediaId}
              full={mediaById.get(mediaId)}
              role={refOf.get(mediaId)?.role ?? ''}
              number={promptNumber.get(mediaId)}
              note={refOf.get(mediaId)?.note ?? ''}
              /* J-9: УКАЗАТЕЛЬ И РАЗРЕШЁННОЕ ПО НЕМУ ИМЯ — ДВА РАЗНЫХ ФАКТА, и ячейке нужны оба.
                 По имени она печатает `detail · collar`; по указателю РАЗЛИЧАЕТ два молчания —
                 «строка старше поля» (0) и «слот удалён» (id есть, слота нет), — которые зовут
                 к одной и той же двери, но врать друг за друга не должны. */
              detailSlotId={refOf.get(mediaId)?.detailSlotId ?? 0}
              detailName={detailNameOf(refOf.get(mediaId)?.detailSlotId ?? 0)}
              onNameDetail={() =>
                setNamingDetail({ mediaId, note: refOf.get(mediaId)?.note ?? '' })
              }
              readOnly={readOnly}
              onRole={(role) => setRole(mediaId, role)}
              onNote={(note) => commitNote(mediaId, note)}
              onRemove={() => setPendingRemove(mediaId)}
              onSplit={() => {
                const full = mediaById.get(mediaId);
                if (full) split.openForMedia(full, `reference ${promptNumber.get(mediaId) ?? mediaId}`);
              }}
              /* Разрешить не удалось — «не знаю», а НЕ «нет»: разбор у самой карты
                 (`splitOffered`). Ссылка из библиотеки живёт ровно здесь, и `?? false` отбирал у
                 неё единственную дверь к резу. */
              splitOffer={splitOffered.get(mediaId) ?? 'unknown'}
              /* ═══ КРОП ЭТОЙ ЖЕ СТРОКИ (J-8) ═════════════════════════════════════════════════
                 Та же дверь режет, что и `split`, и потому стоит с ним в одном кластере (закон
                 углов, `picture-tile.tsx`); разный у них ИСХОД: сплит рождает несколько картинок
                 и дописывает их, кроп рождает одну и ЗАМЕЩАЕТ ею эту строку.

                 ЦЕНА НАЗЫВАЕТСЯ ДО РЕЗА, ЧИСЛОМ. Указания приколоты долей кадра, а кроп двигает
                 рамку — перенести их некуда, и узнать об этом после реза человек не должен. */
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

          {/* ПОСЛЕДНЯЯ ЯЧЕЙКА — ВСЕГДА ПЛЕЙСХОЛДЕР, и это не логика, а порядок разметки: она
              стоит литералом ПОСЛЕ обхода списка и потому не может пропасть при пустом входе,
              полном входе или отказе сервера. Волосяной линии у неё нет — под последней строкой
              рулёной сетки линии не рисуют.
              ПОДПИСИ РЯДОМ НЕТ (R-16): владелец снял объясняющий текст и ссылку на мудборд.
              Дверь при этом ОСТАЛАСЬ дверью — сам слот держит все три жеста (клик/⌘V/бросок) и
              видимое состояние перетаскивания (рамка чернеет, подпись меняется на «drop the
              image») — без этого немая зона была бы невидимой дверью. */}
          <div className={CELL}>
            {readOnly ? (
              <div className='h-[200px] w-[160px] border border-dashed border-borderColor' />
            ) : (
              /* ═══ ПЛЕЙСХОЛДЕР ПОДЕЛЕН ПОПОЛАМ ПО ГОРИЗОНТАЛИ (C-4, круг 18) ════════════════════
                 Владелец, дословно: «плейсхолдер-бокс "+ REFERENCE / DRAW A REFERENCE" — этот бокс
                 надо поделить горизонтально пополам и нижняя половина будет кнопка DRAW A
                 REFERENCE а не как классическая кнопка».

                 ЧТО БЫЛО (J-7). Дверь «draw a reference» стояла ВНУТРИ рамки плейсхолдера, но в
                 коже вторичной кнопки системы (`MediaSlot.doors` → `Button variant='secondary'
                 size='xs'`): белая пилюля с серой рамкой на полосатом поле. Ровно это владелец и
                 назвал «классической кнопкой». Обе двери по-прежнему заводят ОДИН предмет — новую
                 строку входа, — и по-прежнему стоят на одной коробке; изменилась ДОЛЯ коробки, а не
                 её адрес.

                 ДВЕ ПОЛОВИНЫ ОДНОЙ ПЛИТКИ, А НЕ ПЛИТКА С КНОПКОЙ. Верхняя половина — тот же слот
                 библиотеки, что и был (клик / ⌘V / бросок файла — всё внутри примитива); нижняя —
                 ТА ЖЕ ПОВЕРХНОСТЬ, что у верхней: полосатое поле, пунктирная рамка, подпись по
                 центру, чернеет по наведению и по фокусу так же, как верхняя. Кожа берётся из тех же
                 примитивов (`PLACEHOLDER_SURFACE` + `placeholderClass`), которыми рисует себя
                 `MediaSlot`, — второго начертания «пустой поверхности» здесь не заводится.

                 ⚠ ДЕЛЕНИЕ — ГЕОМЕТРИЕЙ, А НЕ ВЕРОЙ. `<button>` меряется по содержимому и в
                 плиточной раскладке уже ложился поверх соседа, пока `truncate` молчал (см. довод в
                 `ui/components/tiles.tsx`). Поэтому размер живёт на КОРОБКЕ (`h-[200px] w-[160px]`,
                 колонка-flex), а половинам заданы `h-1/2`, `w-full` и `min-w-0`; проба меряет
                 `getBoundingClientRect` обеих половин против коробки.

                 ОДНА ЛИНИЯ МЕЖДУ ПОЛОВИНАМИ, А НЕ ДВЕ. У каждой половины своя пунктирная рамка (её
                 чернение по наведению — единственное состояние поверхности), и две рамки встык дали
                 бы двойную линию посередине. Нижняя половина заезжает на пиксель вверх (`-mt-px`,
                 рост на тот же пиксель), так что две линии ложатся в один ряд; наведённая половина
                 поднимается над соседкой (`hover:z-[1]`), и её потемневшая рамка видна всеми
                 четырьмя сторонами.

                 Правая колонка ячейки по-прежнему пуста, объясняющего абзаца по-прежнему нет
                 (R-16, K-5, K-19): что делает половина, сказано глаголом на ней самой. */
              <div data-ref-placeholder='' className='flex h-[200px] w-[160px] flex-col'>
                <MediaSlot
                  frameAspect='4/5'
                  label='+ reference'
                  purpose='design reference'
                  allowMultiple
                  showVideos={false}
                  onSelect={addReferences}
                  sizeClassName='w-full'
                  className='relative h-1/2 min-w-0 shrink-0 hover:z-[1] focus-visible:z-[1]'
                />
                <button
                  type='button'
                  data-ref-draw=''
                  title='opens the picture editor on a blank plate; what you draw joins the input'
                  onClick={() => setDrawOpen(true)}
                  /* Рост и заезд на пиксель — ИНЛАЙНОМ, а не классами. Замерено: сборка СТЕНДА
                     (cwd `tmp/dsgprobe`) не выпустила `h-[calc(50%+1px)]` и `-mt-px` из этого
                     файла, и нижняя половина сжималась до 42px по содержимому; продовая сборка их
                     выпускает. Геометрия деления не должна зависеть от того, откуда сканер читает
                     исходники, — это не токен системы; классами остаётся всё, что несёт кожу. */
                  style={{ ...PLACEHOLDER_SURFACE, height: 'calc(50% + 1px)', marginTop: -1 }}
                  className={cn(
                    placeholderClass({ dashed: true }),
                    'relative w-full min-w-0 shrink-0 cursor-pointer flex-col gap-1 px-2 text-center text-labelColor',
                    'hover:z-[1] hover:border-textColor hover:text-textColor',
                    'focus-visible:z-[1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  )}
                >
                  <PenGlyph />
                  <span className='leading-tight'>
                    draw a reference
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {members.length >= INPUT_MAX && (
        <Text size='micro' variant='label'>
          the input holds {INPUT_MAX} pictures — the moodboard counts separately.
        </Text>
      )}

      <FlatPlatesShown
        techCardId={techCardId}
        band={band}
        readOnly={readOnly}
        firstNumber={inPrompt + 1}
        referenceMediaNumbers={promptNumber}
      />

      {/* ПРИЁМНИК РЕКОЛА (T-10). Панели «recalled — run N» с описью снимка здесь больше НЕТ: жест
          на строке истории просто добавляет картинки и тексты того прогона в обычные референсы
          выше, и дальше это обычные референсы. Видимого органа у приёмника нет — он рисует только
          вопрос про описание изделия, и только когда описание уже непустое. */}
      <RecalledRunPrompt
        techCardId={techCardId}
        band={band}
        disabled={disabled}
        onAccepted={(media) => setPicked((prev) => [...prev, ...media])}
      />

      {/* Модалка сплита (R-17) — монтируется хуком, когда для картинки получена картинка полосы. */}
      {split.modal}

      {/* РЕДАКТОР НА ЧИСТОЙ ПЛАТЕ (M-2). Смонтирован только когда открыт: у модалки есть
          собственные оконные слушатели клавиш (⌘Z, ⌘C/⌘V, [ и ]), и держать их живыми под
          закрытым диалогом значило бы отбирать эти клавиши у страницы. */}
      {!readOnly && drawOpen && (
        <VectorModal
          open={drawOpen}
          onOpenChange={setDrawOpen}
          techCardId={techCardId}
          band={band}
          base={null}
          disabled={readOnly}
          onFlattened={(picture) => {
            // Медиа берётся ИЗ ОТВЕТА СЕРВЕРА, а не из того, что клиент только что загрузил:
            // строку входа заводит `appendBoardPictures` по `common_MediaFull`, и половинчатая
            // запись без адресов нарисовала бы ячейку с пустым кадром.
            const full = picture.media;
            if (full) addReferences([full]);
          }}
        />
      )}

      {/* ВОПРОС ПЕРЕД СНОСОМ ВХОДА (R-15) — с числами и с границей честности: роли и записки
          уходят с сервера СЕЙЧАС, строки и описание — с карточки при её сохранении. */}
      <ConfirmationModal
        open={clearAsk}
        onOpenChange={(open) => !open && setClearAsk(false)}
        onConfirm={runClear}
        onCancel={() => setClearAsk(false)}
        title='clear the input'
        confirmLabel='clear it all'
        width='sm'
      >
        <div className='space-y-2'>
          <Text size='control'>
            This takes out all {members.length} picture{members.length === 1 ? '' : 's'}
            {inPrompt > 0
              ? ` — ${inPrompt} of them in the prompt, with their notes —`
              : ''}{' '}
            and clears the garment description.
          </Text>
          <Text size='control'>
            Roles and notes are removed from the server now, one by one. The picture rows and the
            description leave the card when you next save it. The moodboard is not touched.
          </Text>
        </div>
      </ConfirmationModal>

      {/* ИМЯ ДЕТАЛИ СПРАШИВАЕТСЯ ДО ЗАПИСИ, А НЕ ПОСЛЕ. Слот без имени сервер отвергает
          (`detail_name_required`), а безымянная деталь в промпте читается словом «detail» — то,
          от чего уходили кругом раньше. Комментарий необязателен и уезжает ЗАПИСКОЙ РЕФЕРЕНСА:
          поле «что эта картинка добавляет» уже есть и уже читается промптом, второго места для
          тех же слов заводить нельзя. */}
      <DetailNamingModal
        open={namingDetail != null}
        initialNote={namingDetail?.note ?? ''}
        onCancel={() => setNamingDetail(null)}
        onConfirm={async (name, comment) => {
          const target = namingDetail;
          setNamingDetail(null);
          if (!target) return;
          /* ═══ ПОРЯДОК ДВУХ ЗАПИСЕЙ ПЕРЕВЁРНУТ, И ЭТО САМА ПОЧИНКА J-9 ══════════════════════
           *
           * Владелец: «когда мы добавляем в INPUT — REFERENCES detail у нас должен в плейсхолдере
           * разметки меняться название на то что мы вписали (название детали)».
           *
           * Раньше сначала писалась РОЛЬ, потом заводился слот, — и связать их было нечем: id
           * слота рождается только в ОТВЕТЕ на его заведение, а роль к тому моменту уже уехала.
           * Имя, которое человек набрал, жило на слоте, строка референса о нём не знала, и ячейка
           * могла напечатать только голое слово «detail». Теперь слот заводится ПЕРВЫМ, его id
           * берётся из ответа и едет со ролью тем же запросом.
           *
           * ⚠ ОТКАЗ ЗАВЕДЕНИЯ ОТМЕНЯЕТ И РОЛЬ — НАМЕРЕННО, И ЭТО ЛУЧШАЯ ИЗ ДВУХ ПОЛОВИН. Прежний
           * порядок ломался ровно наоборот: роль вставала, слот не заводился, и на карточке
           * оставался референс со словом «detail», не показывающий ни на что, — то самое
           * состояние V-1, где деталь существует для модели и не существует для человека, причём
           * человеку об этом никто не говорит. Теперь неудача не делает НИЧЕГО и говорит об этом
           * словами (`onError` мутации), а жест повторяется целиком.
           */
          let slotId = 0;
          try {
            const created = await setBenchSlot.mutateAsync({
              // Деталь — строка ФЛЭТОВОГО верстака, а у него колорвея нет (L-4): положительное
              // значение здесь сервер отвергает, а не проглатывает.
              slot: { viewKey: DETAIL_VIEW, kind: 'flat', colorwayId: 0 },
              // Слот заводится ПУСТЫМ намеренно: он держит ЧЕРТЁЖ детали, а не фотографию, ради
              // которой его завели.
              pictureId: 0,
              expectedSlotRev: 0,
              newDetailName: name,
            });
            slotId = created?.slot?.id ?? 0;
          } catch {
            // Сообщение уже показано `onError` мутации; второго текста об одной беде не нужно.
            return;
          }
          // Ноль сюда доехать может только если сервер завёл слот и не назвал его id — состояние,
          // которого контракт не допускает. Проводом это читается как «оставь связь как была», то
          // есть деградация до вчерашнего поведения, а не порча чужой связи.
          writeRef(target.mediaId, DETAIL_VIEW, comment, slotId);
          showMessage(`detail “${name}” added — tick it in generation — flat`, 'success');
        }}
      />

      <ConfirmationModal
        open={pendingRoleClear != null}
        onOpenChange={(open) => !open && setPendingRoleClear(null)}
        onConfirm={() => {
          const mediaId = pendingRoleClear;
          setPendingRoleClear(null);
          if (mediaId != null) writeRef(mediaId, '', '');
        }}
        onCancel={() => setPendingRoleClear(null)}
        title='take it out of the prompt'
        confirmLabel='take it out'
        width='sm'
      >
        <Text size='control'>
          The note on this picture goes with the role — the two are one row, and there is nowhere to
          keep a note for a picture the prompt never sees. Copy it first if you want to keep it.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
        title='remove the reference'
        confirmLabel='remove it'
        width='sm'
      >
        <div className='space-y-2'>
          <Text size='control'>
            The picture, its role and its note go together — a reference is one thing.
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
 * Одна ячейка: слева ПЛИТКА, справа роль и записка. Без своей рамки-блока — ячейка это СТРОКА
 * внутри блока, а блок в блоке в этой системе запрещён.
 *
 * КАДР РИСУЕТ ОБЩИЙ ПРИМИТИВ `PictureTile`, И ЭТО ВЕСЬ ОТВЕТ НА T-7. Владелец, дословно и во
 * второй раз: «в INPUT — REFERENCES на тамбнейлах картинок на ховер кнопка сплит должна быть снизу
 * слева я уже второй раз это прошу». Второй раз просьба прозвучала потому, что первый раз её
 * выполнили в ОДНОМ месте — на плите верстака, — а эта ячейка держала свои органы по собственной
 * раскладке: номер и split колонкой в ЛЕВОМ ВЕРХНЕМ углу (`left-0 top-0`), zoom в правом верхнем,
 * плашка «not in prompt» подвалом во всю ширину, ✕ вообще в соседней колонке рядом с селектом.
 *
 * Поэтому чинится это не координатами, а переездом: у `PictureTile` нет пропа «где рисовать
 * сплит», раскладка углов — решение примитива (ярлык слева сверху, zoom и ✕ справа сверху, split
 * СЛЕВА СНИЗУ), и разойтись с верстаком физически больше негде. Ячейка объявляет только РОЛИ.
 *
 * ЧТО ПЕРЕЕХАЛО ВМЕСТЕ С УГЛАМИ. ✕ ушёл из правой колонки на плитку — иначе один и тот же орган
 * стоял бы на двух экранах в двух разных местах, что и есть предмет жалобы. Номер промпта стал
 * ЯРЛЫКОМ примитива, а слова «not in prompt» встали в тот же ярлык, потому что номер и его
 * отсутствие — одно утверждение и им незачем два места: пустой ярлык читался бы как «ещё не
 * посчитали». Подвал во всю ширину снят и по существу: он лёг бы поверх кнопки split.
 */
/**
 * ═══ «ALSO SHOWN — FLAT SLOTS»: ПЕРЕКЛЮЧАТЕЛЬ И САМИ ПЛИТЫ, ЗДЕСЬ (J-10) ═══════════════════════
 *
 * Владелец: «WHAT THE MODEL IS SHOWN должно быть в INPUT — REFERENCES и переключатель и сами
 * картинки должны быть в тамбнейлах с разметкой но с серой пеленой поверх типо инэктив и дожны
 * убираться по кнопке так же они всегда добавляются в конец промпта».
 *
 * ПОЧЕМУ ОРГАН СТОИТ ИМЕННО ЗДЕСЬ, А НЕ В ФОРМЕ. Вопрос «что увидит модель» обязан стоять рядом с
 * ТЕМ, ЧТО ОНА УВИДИТ. В форме он был списком имён без картинок — согласиться на оплаченный вход
 * приходилось по описанию. Здесь вход виден целиком: сначала референсы, потом плиты, в том самом
 * порядке, в котором их пронумерует сервер.
 *
 * ⚠ ПЕЛЕНА — НА СНИМКЕ, И ТОЛЬКО НА НЁМ (`PictureTile.dim`). Гасить ЯЧЕЙКУ целиком классом
 * прозрачности нельзя: прозрачность наследуется и ребёнком не отменяется, и кнопка «✕» вышла бы
 * серым по белому около 1.6:1 при пороге 4.5:1 — примитив несёт этот замер у себя в шапке.
 * Дверь, которую не прочесть, — не дверь, а «инэктив» относится к КАРТИНКЕ.
 *
 * ⚠ СОСТОЯНИЕ НЕСУТ СЛОВА, А НЕ ОДНА ПЕЛЕНА. Пелена стоит на ВСЕХ плитах всегда — она говорит
 * «это не референсы», а не «эта не едет». Едет плита или нет, сказано ярлыком (`3` против
 * `not sent`) и глаголом на двери (`✕` против `send`), то есть двумя независимыми словесными
 * носителями. Так требует и PRODUCT.md: состояние никогда не несётся одной заливкой.
 *
 * ⚠ НОМЕРА ЗДЕСЬ — НЕ УКРАШЕНИЕ, А ОБЕЩАНИЕ ПРО ПРОВОД. Сервер на флэтовом маршруте кладёт
 * СНАЧАЛА референсы, ПОТОМ плиты (`referenceList`, ветка `kind == flat`), поэтому счёт плит
 * продолжается с `firstNumber`. Если бы порядок был прежним (плиты первыми), эти цифры были бы
 * уверенной ложью рядом с кнопкой, которая тратит деньги.
 *
 * ⚠ И ОДНА ЧЕСТНОСТЬ ПРО ДУБЛИКАТ. Дедупликация на сервере оставляет ПЕРВОЕ вхождение медиа.
 * Плита, чей файл уже стоит референсом, второго номера не получает — и не притворяется, что
 * получила: она говорит, под каким номером её файл уже едет. Случай редкий (одну картинку надо
 * положить и в слот, и во вход), но цена ошибки — неверная цифра рядом с деньгами.
 */
function FlatPlatesShown({
  techCardId,
  band,
  readOnly,
  firstNumber,
  referenceMediaNumbers,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  readOnly: boolean;
  /** Номер, с которого продолжается счёт после последнего референса. */
  firstNumber: number;
  /** Медиа референсов → их номер в промпте. Нужен ровно для случая дубликата выше. */
  referenceMediaNumbers: ReadonlyMap<number, number>;
}): JSX.Element | null {
  const plates = useMemo(() => filledFlatSlots(band), [band]);
  const state = useFlatSlotsSend(techCardId);
  const { setOn, exclude, restore } = useFlatSlotsSendWrites();

  const sent = new Set(sentFlatSlotIds(state, plates.map((p) => p.slotId)));

  // Номера присваиваются сканом по ТОМУ ЖЕ порядку, что уедет на сервер, и только едущим —
  // снятая плита номера не занимает, ровно как безролевой референс не занимает его выше.
  let next = firstNumber;
  const rows = plates.map((plate) => {
    const already = referenceMediaNumbers.get(plate.mediaId);
    const travels = sent.has(plate.slotId);
    return {
      ...plate,
      travels,
      duplicateOf: already,
      number: travels && already == null ? next++ : null,
    };
  });

  const travelling = rows.filter((r) => r.travels);
  const numbered = travelling.filter((r) => r.number != null);

  return (
    <div data-flat-plates={plates.length}>
      {/* ЧИП — В `lead`, А НЕ В `action`. Это переключатель, принадлежащий самому заголовку, и его
          место не должно зависеть от того, какой ширины блок оказался в текущей раскладке;
          правый край отдан сводке, которая читается последней. */}
      <GroupLabel
        lead={
          <ChipRow>
            <Chip
              selected={state.on}
              pressed={state.on}
              disabled={readOnly || plates.length === 0}
              data-use-flat-slots=''
              onClick={() => setOn(techCardId, !state.on)}
              title='the plates already in flat slots go to the model as references — they are usually flats it drew before, so it tends to redraw them'
            >
              also send the flat slots
            </Chip>
          </ChipRow>
        }
        action={
          <Text size='micro' variant='label' component='span' data-flat-slots-line={plates.length}>
            {plates.length === 0
              ? 'no flat slots are filled — nothing extra to send'
              : !state.on
                ? 'only the card’s references travel'
                : travelling.length === 0
                  ? 'no plates travel — every one is taken out'
                  : /* ⚠ «ЕДЕТ» И «ПОЛУЧАЕТ НОМЕР» — РАЗНЫЕ ЧИСЛА, И РАСХОДЯТСЯ ОНИ НА ДУБЛИКАТЕ.
                       Слот дубликата уезжает в `flat_slot_ids` как всякий не снятый — человек его
                       не снимал, — но НОВОЙ картинки в промпт не добавляет: сервер дедуплицирует
                       и оставляет первое вхождение, то есть референс. Строка, считавшая только
                       пронумерованных, говорила «едут 2», пока на проводе ехало 3. Замерено на
                       стенде: `flatSlotIds [41,43,44]` при «2 plates travel». */
                    numbered.length === travelling.length
                      ? `${plural(travelling.length, 'plate')} travel${travelling.length === 1 ? 's' : ''}, ${numberSpan(numbered)}`
                      : `${plural(travelling.length, 'plate')} travel — ${numbered.length ? `${numberSpan(numbered)}` : 'none numbered'}, ${travelling.length - numbered.length} already in the prompt`}
          </Text>
        }
      >
        also shown — flat slots
      </GroupLabel>

      {plates.length === 0 ? (
        /* ПУСТОЙ ВЕРСТАК ГОВОРИТ, ГДЕ ЕГО ЗАПОЛНИТЬ. Пустое состояние обязано учить экрану, а не
           сообщать «здесь ничего нет»: слоты стоят ниже, на этой же вкладке. */
        <Text size='nano' variant='label' component='p' className='py-2'>
          plates put into FLAT SLOTS below can be sent to the model with the picture references.
        </Text>
      ) : !state.on ? (
        /* ═══ ТАМБНЕЙЛЫ ТОЛЬКО ПРИ ВКЛЮЧЁННОМ ЧИПЕ — E-24 ═════════════════════════════════════
           Владелец, дословно: «в FLAT — SHEET ALSO SHOWN — FLAT SLOTS тамбнейлы показываются
           только если ALSO SEND THE FLAT SLOTS включена».

           И ЭТО ЧИНИТ РАСХОЖДЕНИЕ, А НЕ ЭКОНОМИТ МЕСТО. Ряд плит стоит внутри блока «what the
           model is shown»: пока чип выключен, модель не видит НИ ОДНОЙ из них — то есть ряд
           показывал шесть картинок под заголовком «что показано», ни одна из которых не
           показывается. Пелена и слово `not sent` объясняли это на каждой плите по отдельности,
           шесть раз, вместо одного выключателя.

           ⚠ ЧИСЛО ОСТАЁТСЯ ВИДИМЫМ ВСЕГДА (`action` заголовка, `data-flat-slots-line`), поэтому
           «сколько плит есть» и «сколько едет» по-прежнему читается не наводя мышь: сворачивается
           РЯД КАРТИНОК, а не факт. */
        <Text size='nano' variant='label' component='p' className='py-2'>
          {plates.length === 1 ? 'one plate stands' : `${plates.length} plates stand`} in FLAT SLOTS
          below. Turn <b>also send the flat slots</b> on to see them and choose which ones travel.
        </Text>
      ) : (
        /* ОДНОМЕРНЫЙ РЯД — `flex-wrap`, А НЕ ГРИД. Плит от одной до примерно шести, они равные и
           переносятся по ширине; сетка завела бы дорожки, которых этому ряду нечем заполнить. */
        <div className='flex flex-wrap gap-3 py-2'>
          {rows.map((plate) => {
            const badge =
              plate.duplicateOf != null
                ? `already #${plate.duplicateOf}`
                : plate.number != null
                  ? plate.number
                  : 'not sent';
            return (
              <div key={plate.slotId} className='w-[104px] min-w-0' data-flat-plate={plate.slotId}>
                <PictureTile
                  url={plate.mediaId ? thumbUrl(mediaOfPlate(band, plate.mediaId)) : ''}
                  alt={`flat slot ${plate.label}`}
                  aspect='4/5'
                  fit='contain'
                  className='w-[104px]'
                  // ПЕЛЕНА ВСЕГДА: эти снимки не референсы, и выглядеть как референсы не должны.
                  dim
                  badge={badge}
                />
                <div className='mt-1 flex min-w-0 items-center justify-between gap-1'>
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='min-w-0 truncate'
                    title={`flat slot · ${plate.label}`}
                  >
                    {plate.label}
                  </Text>
                  {/* ДВЕРЬ РИСУЕТСЯ, ТОЛЬКО КОГДА ЕЙ ЕСТЬ ЧТО СДЕЛАТЬ. При выключенном чипе не
                      едет ничего, и «убрать» было бы нажатием без последствий — орган, который
                      жмётся и молчит, читается как сломанный. Дубликат снимать тоже нечего: его
                      файл едет референсом, а не этой плитой. */}
                  {!readOnly && state.on && plate.duplicateOf == null && (
                    <Button
                      variant='secondary'
                      size='xs'
                      data-flat-plate-door={plate.slotId}
                      aria-label={
                        plate.travels
                          ? `do not send the ${plate.label} plate`
                          : `send the ${plate.label} plate again`
                      }
                      onClick={() =>
                        plate.travels
                          ? exclude(techCardId, plate.slotId)
                          : restore(techCardId, plate.slotId)
                      }
                    >
                      {plate.travels ? '✕' : 'send'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `numbered 6` для одной и `numbered 6–8` для нескольких — диапазон из одного числа не пишут. */
function numberSpan(rows: readonly { number: number | null }[]): string {
  if (!rows.length) return 'none numbered';
  const first = rows[0].number;
  const last = rows[rows.length - 1].number;
  return first === last ? `numbered ${first}` : `numbered ${first}–${last}`;
}

/** Медиа плиты по её id — плита уже приехала в полосе, второй запрос за ней не нужен. */
function mediaOfPlate(band: GetDesignBandResponse, mediaId: number): common_MediaFull | undefined {
  for (const row of band.bench ?? []) {
    const media = row.picture?.media;
    if (media?.id === mediaId) return media;
  }
  return undefined;
}

function ReferenceCell({
  mediaId,
  full,
  role,
  number,
  note,
  detailSlotId,
  detailName,
  onNameDetail,
  readOnly,
  onRole,
  onNote,
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
  note: string;
  /** `design_bench_slot(id)` этой детали, 0 = не сказано (строка старше поля или слот удалён). */
  detailSlotId: number;
  /** Имя, разрешённое по указателю из живого верстака, или null — если разрешить не удалось. */
  detailName: string | null;
  /** Дверь починки: завести деталь заново. Рисуется ТОЛЬКО когда имени нет (см. ниже). */
  onNameDetail: () => void;
  readOnly: boolean;
  onRole: (role: string) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
  onSplit: () => void;
  /**
   * ОБЪЯВЛЯТЬ ЛИ РОЛЬ `split` И ЧТО ЕЙ ГОВОРИТЬ. Считает вызывающий (`splitOffered`), потому что
   * ответ живёт в полосе, а не в строке входа: ячейка держит `media_id`, а правило спрашивает про
   * чертёж — «мультивью ли он и не резан ли уже» (`pictureOffersSplit`, `render/model.ts`).
   * Значений три, и третье («не знаю») ячейка обязана отличать от «нет»: подсказка у них разная.
   */
  splitOffer: SplitOffer;
  /** Кроп этой же картинки на месте (J-8) — см. вызывающего. */
  onCrop: () => void;
  splitPending: boolean;
}) {
  const noteId = useId();
  const url = thumbUrl(full);
  const off = !role;

  /**
   * ЧЕРНОВИК ЗАПИСКИ ЖИВЁТ В ЯЧЕЙКЕ, а уходит на сервер по потере фокуса.
   *
   * Записка — это `design_reference.note`, то есть СЕТЕВОЙ upsert, а не поле формы: запрос на
   * каждое нажатие клавиши стоил бы и денег, и гонки, в которой выигрывает самый медленный ответ.
   * Черновик пере-синхронизируется по `note` из полосы (ключ ниже), поэтому пришедший ответ
   * сервера — и чужая правка из соседней вкладки — видны сразу, а не после перезагрузки.
   */
  const [draft, setDraft] = useState(note);
  const [seen, setSeen] = useState(note);
  // Синхронизация по ИЗМЕНЕНИЮ ПРИШЕДШЕГО, а не по расхождению с ним. Разница видна ровно на
  // отказе: сравнивая с `note`, черновик откатывался бы к старому тексту сразу после потери
  // фокуса — то есть набранное исчезало бы с экрана раньше, чем сервер вообще ответил, и
  // навсегда, если ответ был ошибкой. Сравнение с ПРЕДЫДУЩИМ значением полосы этого не делает:
  // не изменилось на проводе — не трогаем набранное.
  if (seen !== note) {
    setSeen(note);
    setDraft(note);
  }

  const label = `reference ${number ?? mediaId}`;

  return (
    <div className={cn(CELL, 'border-b border-hairline')}>
      {/* КАДР ФИКСИРОВАН 160×200, КАРТИНКА ВПИСЫВАЕТСЯ ЦЕЛИКОМ (`fit='contain'`).
          Навязанное соотношение законно ровно потому, что на референсе НЕТ выносок: доля кадра
          здесь ничего не адресует, и обрезать нечего. На мудборде и на флэте кадр обязан быть в
          пропорциях снимка — там по кадру ставят указания. */}
      <PictureTile
        url={url}
        alt={label}
        aspect='4/5'
        fit='contain'
        className='w-[160px]'
        // ЯРЛЫК ГОВОРИТ ОДНО ИЗ ДВУХ: номер в промпте — или что промпт этой картинки не видит.
        // Приглушать кадр вместо слова нельзя: приглушённый кадр читается как «картинка сломана».
        badge={number ?? 'not in prompt'}
        // Ряд листания собирает сам примитив, поэтому здесь объявляется только КАДР этой плитки.
        // Пустой адрес зума не обещает — примитив в этом случае не рисует ни кнопки, ни курсора.
        gallery={
          url && full
            ? // `meta` НЕСЁТ ID МЕДИА, и без него дверь «сохранить как новую картинку» отказывает
              // сообщением, которое САМО называет референс рабочим путём: `item.meta?.id ?? 0`
              // даёт ноль. Все прочие галереи собираются `mediaFullToViewerItem`, эта одна
              // собиралась литералом — и потому была единственной, где дверь не открывалась.
              { ...mediaFullToViewerItem(full), thumbnail: url, alt: label }
            : undefined
        }
        /* ═══ РЕЗ ПРЕДЛАГАЕТСЯ ТОЛЬКО СКЛЕЕННОМУ И ЕЩЁ НЕ РЕЗАНОМУ КАДРУ (F-8, F-18) ═══════════
           Здесь стояло `!readOnly && url` — «файл есть и карточка пишется», — и это были ЕДИНСТВЕННЫЕ
           ворота угла на всём экране: ни «мультивью ли», ни «не резан ли». Владелец, дословно:
           «везде где картинка не мультивью флет или рендер там не должно на ховер показываться
           сплит». Оба факта считает секция и передаёт одним словом; правило — `pictureOffersSplit`.
           `onCrop` рядом НЕ трогается: кроп режет один кадр из любого снимка, и его условие —
           другое условие, а не копия этого.

           ⚠ ПОДСКАЗКА ВЕТВИТСЯ ВМЕСТЕ С ОТВЕТОМ, И ЭТО ВЕСЬ СМЫСЛ ТРЕТЬЕГО ЗНАЧЕНИЯ. `declared` —
           виды заявлены полосой, о них можно говорить фактом. `unknown` — за ссылкой чертежа нет
           вовсе, и та же фраза стала бы утверждением о файле, которого никто не читал: у обычной
           фотографии ткани она была бы просто ложью. Формула ветки «не знаю» — дословно та же, что
           на полосе флэтов (`render/render-input-strip.tsx`), чтобы два экрана отвечали на один
           вопрос одинаково не только предикатом, но и словами. */
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
                  'crop — cut one frame out of this picture and put it in this row, with the same role and note',
              }
            : undefined
        }
        onRemove={
          !readOnly
            ? {
                onClick: onRemove,
                ariaLabel: `remove ${label} — picture, role and note together`,
                title: 'remove this reference — picture, role and note together',
              }
            : undefined
        }
      >
        {/* ПРИЧИНА ПУСТОГО КАДРА. Примитив говорит СОСТОЯНИЕ («no image»); карточка знает, почему
            именно: строка есть, а файла под её `media_id` не нашлось ни в библиотеке, ни в полосе.
            Низ кадра здесь свободен — split у безадресной плитки не рисуется. */}
        {!url && (
          <div className='pointer-events-none absolute inset-x-0 bottom-1 z-20 px-1 text-center'>
            <Text size='nano' variant='label' component='span'>
              media #{mediaId} not resolved
            </Text>
          </div>
        )}
      </PictureTile>

      {/* ПРАВАЯ КОЛОНКА РОСТОМ В КАДР: строка роли фиксированной высоты, записка занимает
          остаток. Иначе поле записки росло бы по тексту и рвало ряд грида. */}
      <div className='grid h-[200px] min-w-0 grid-rows-[26px_1fr] gap-1.5'>
        {/* ═══ РОЛЬ, А У ДЕТАЛИ — ЕЁ ИМЯ (J-9) ══════════════════════════════════════════════════
            Владелец: «когда мы добавляем в INPUT — REFERENCES detail у нас должен в плейсхолдере
            разметки меняться название на то что мы вписали».

            ИМЯ ПЕЧАТАЕТСЯ НА ТРИГГЕРЕ, А НЕ В СПИСКЕ. Пункт списка — это ВОПРОС («сделать
            деталью?»), один на все детали; имя — ОТВЕТ про эту строку. Класть ответ в список
            значило бы отвечать за все строки сразу.

            ДВЕРЬ ПОЧИНКИ СТОИТ РЯДОМ, А НЕ В ТРИГГЕРЕ, И ЭТО НЕ УКРАШЕНИЕ. Слова «name it again»
            зовут к жесту, которого у человека НЕ БЫЛО БЫ: пункт `detail` уже выбран, а Radix не
            шлёт `onValueChange` на повторный выбор того же значения — модалка не открылась бы
            никогда. Кнопка в триггер не вкладывается (кнопка в кнопке), поэтому дверь — соседняя
            и появляется РОВНО в сломанном состоянии. */}
        {/* ЯКОРЬ ДЛЯ ПРОБЫ, а не украшение: у всех триггеров селекта один `aria-label`
            (плейсхолдер), а `name` примитив в DOM не выносит — адресовать роль КОНКРЕТНОЙ строки
            было бы нечем. */}
        <div className='flex min-w-0 items-center gap-2' data-ref-role={mediaId}>
          <Select
            name={`ref-role-${mediaId}`}
            items={ROLE_ITEMS}
            value={role}
            placeholder='— not in prompt —'
            readOnly={readOnly}
            onValueChange={onRole}
            className='w-[172px]'
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
          {/* ⚠ ДВА МОЛЧАНИЯ РАЗЛИЧАЮТСЯ СЛОВАМИ, ХОТЯ ЗОВУТ К ОДНОЙ ДВЕРИ. `0` — строка старше
              поля; `id`, который не разрешился, — слот удалён (FK ON DELETE SET NULL). Сказать
              «slot removed» про строку, у которой слота никогда не было, значило бы сообщить
              человеку событие, которого не происходило. */}
          {normaliseViewKey(role) === DETAIL_VIEW && !detailName && !readOnly && (
            <Button variant='secondary' size='xs' onClick={onNameDetail} data-name-detail={mediaId}>
              name it
            </Button>
          )}
        </div>

        <label htmlFor={noteId} className='sr-only'>
          what this picture adds
        </label>
        {/* ЗАПИСКА ЖИВЁТ НА СТРОКЕ РОЛИ, поэтому без роли её негде хранить — и поле говорит это
            словами вместо того, чтобы принять текст и потерять его. Это не наш выбор интерфейса:
            строка полосы И ЕСТЬ существование роли (см. `DesignReference`). */}
        <Textarea
          name={`ref-note-${mediaId}`}
          id={noteId}
          // ЯКОРЬ ДЛЯ ПРОБЫ, а не украшение: примитив `Textarea` кладёт `name` в `id`, поэтому
          // адресовать записку по имени поля невозможно, а `useId` от прогона к прогону разный.
          data-ref-note={mediaId}
          // ЗАМОК ОДИН — «нет роли» (S-6): записка живёт на строке роли, и у носителя роли она
          // пишется всегда, держит ли карточка строку или нет. Второй замок `!onCard` был тихой
          // половиной снятой плашки «off the card» — отказом без слов при живом плейсхолдере.
          disabled={readOnly || off}
          value={draft}
          maxLength={500}
          autoGrow={false}
          placeholder={
            off ? 'give it a role first — the note rides with it' : '+ what this picture adds'
          }
          className='h-full resize-none'
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== note) onNote(draft);
          }}
        />
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
  initialNote,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initialNote: string;
  onCancel: () => void;
  onConfirm: (name: string, comment: string) => void;
}) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [seenOpen, setSeenOpen] = useState(false);

  // Поля сбрасываются на КАЖДОЕ открытие, а не на монтировании: диалог живёт весь сеанс, и
  // второй референс унаследовал бы имя первого.
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setName('');
      setComment(initialNote);
    }
  }

  const ready = name.trim().length > 0;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      onConfirm={() => ready && onConfirm(name.trim(), comment.trim())}
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
        <div className='space-y-1'>
          <label htmlFor='detail-comment' className='block'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              comment — optional, goes to the model with the picture
            </Text>
          </label>
          <Textarea
            name='detail-comment'
            id='detail-comment'
            value={comment}
            maxLength={500}
            autoGrow={false}
            placeholder='+ what this picture adds'
            className='h-20 resize-none'
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
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
