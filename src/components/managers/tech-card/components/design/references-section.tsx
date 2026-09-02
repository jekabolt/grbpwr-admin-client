import { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
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
import { RecalledRunPrompt } from './history-recall';
import { VectorModal } from './modals';
import { PictureTile } from './picture-tile';
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
    const m = new Map<number, { role: string; note: string }>();
    for (const r of band.references ?? []) {
      const role = (r.role ?? '').trim();
      if (r.mediaId != null && role) m.set(r.mediaId, { role, note: r.note ?? '' });
    }
    return m;
  }, [band.references]);

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

  function writeRef(mediaId: number, role: string, note: string) {
    // ORDINAL — ЭТО ПОЗИЦИЯ ВО ВХОДЕ, а не номер промпта. Номер промпта выводится сканом (см.
    // выше), и класть его в хранимое поле значило бы завести второй источник одной величины,
    // который расходится с первым при каждом снятии роли.
    setReferenceRole.mutate({ mediaId, role, ordinal: role ? ordinalOf(mediaId) : 0, note });
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
  });

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
              readOnly={readOnly}
              onRole={(role) => setRole(mediaId, role)}
              onNote={(note) => commitNote(mediaId, note)}
              onRemove={() => setPendingRemove(mediaId)}
              onSplit={() => {
                const full = mediaById.get(mediaId);
                if (full) split.openForMedia(full, `reference ${promptNumber.get(mediaId) ?? mediaId}`);
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
              <MediaSlot
                frameAspect='4/5'
                heightPx={200}
                label='+ reference'
                purpose='design reference'
                allowMultiple
                showVideos={false}
                onSelect={addReferences}
              />
            )}
            {/* ВТОРАЯ ДВЕРЬ СТОИТ В ПУСТОЙ ПРАВОЙ КОЛОНКЕ ЭТОЙ ЖЕ ЯЧЕЙКИ, а не отдельной
                пунктирной клеткой рядом. Два одинаковых пунктирных прямоугольника читались бы как
                два пустых слота, а не как две двери; здесь же колонка справа всё равно пустовала —
                у плейсхолдера нет ни роли, ни записки, которые она держит у остальных.
                ОБЪЯСНЯЮЩЕГО АБЗАЦА НЕТ НАРОЧНО (R-16, K-5, K-19): «or» — связка между двумя
                дверями, а не подпись к ним. Что делает кнопка, сказано глаголом на самой кнопке. */}
            {!readOnly && (
              <div className='flex min-w-0 flex-col items-start gap-2 pt-1'>
                <Text size='micro' variant='label' component='span'>
                  or
                </Text>
                <Button
                  size='xs'
                  variant='secondary'
                  onClick={() => setDrawOpen(true)}
                  title='opens the picture editor on a blank plate; what you draw joins the input'
                >
                  draw a reference
                </Button>
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
        onConfirm={(name, comment) => {
          const target = namingDetail;
          setNamingDetail(null);
          if (!target) return;
          // ДВЕ ЗАПИСИ, И ПОРЯДОК ВАЖЕН. Сначала роль с запиской — она и есть существование
          // строки промпта; потом ПУСТОЙ слот с именем. Слот заводится пустым намеренно: он
          // держит ЧЕРТЁЖ детали, а не фотографию, ради которой его завели.
          writeRef(target.mediaId, DETAIL_VIEW, comment);
          setBenchSlot.mutate(
            {
              // Деталь — строка ФЛЭТОВОГО верстака, а у него колорвея нет (L-4): положительное
              // значение здесь сервер отвергает, а не проглатывает.
              slot: { viewKey: DETAIL_VIEW, kind: 'flat', colorwayId: 0 },
              pictureId: 0,
              expectedSlotRev: 0,
              newDetailName: name,
            },
            {
              onSuccess: () =>
                showMessage(`detail “${name}” added — tick it in generation — flat`, 'success'),
            },
          );
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
function ReferenceCell({
  mediaId,
  full,
  role,
  number,
  note,
  readOnly,
  onRole,
  onNote,
  onRemove,
  onSplit,
  splitPending,
}: {
  mediaId: number;
  full?: common_MediaFull;
  role: string;
  number?: number;
  note: string;
  readOnly: boolean;
  onRole: (role: string) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
  onSplit: () => void;
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
          url ? { src: fullUrl(full), thumbnail: url, type: 'image', alt: label } : undefined
        }
        onSplit={
          !readOnly && url
            ? {
                onClick: onSplit,
                pending: splitPending,
                ariaLabel: `split ${label} into views`,
                title: 'split — cut the views out of this picture',
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
        <div className='flex min-w-0 items-center'>
          <Select
            name={`ref-role-${mediaId}`}
            items={ROLE_ITEMS}
            value={role}
            placeholder='— not in prompt —'
            readOnly={readOnly}
            onValueChange={onRole}
            className='w-[172px]'
          />
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
