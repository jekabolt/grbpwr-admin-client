import {
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';
import { STEP_TYPE_BLOCKS, type StepBlock } from './equipment-options';
// ТОЛЬКО ТИП — и это условие, а не стиль. `operation-options` импортирует ЗНАЧЕНИЕ отсюда
// (`kindOf` нужна композитору заголовка), поэтому обратный импорт значения замкнул бы цикл в
// рантайме. `import type` стирается при трансформации (в tsconfig нет `verbatimModuleSyntax`), и
// ребра в графе бандла не появляется — тот же приём, которым `operation-options` берёт тип строки
// формы из `schema`.
import type { OperationFormStringField } from './operation-options';

// ВИД ОПЕРАЦИИ — ОДИН СПИСОК ПОВЕРХ ДВУХ ОСЕЙ.
//
// Волна 0324 развела вид на глагол (`operation_type`) × машинку (`machine_type`) / метод, и это
// инженерно правильно: 0306 и 0311 распутывали ровно эту смесь. Но у технолога вид — ОДНО СЛОВО у
// машины («топстич»), а в форме такого слова нет ни в одном из двух списков. Пикер возвращает
// слово, не трогая данные.
//
// ЧТО ЭТОТ МОДУЛЬ ЕСТЬ И ЧЕГО В НЁМ НЕТ. Пункт несёт ровно три вещи: (а) отображаемое имя,
// (б) НАБОР ЗНАЧЕНИЙ, который он записывает в те же самые поля, что и раньше, (в) список блоков,
// которые у него содержательны. Он НЕ содержит таблицы «какому глаголу какая машинка положена», НЕ
// содержит правил применимости полей и НЕ решает, что валидно: это `STEP_TYPE_BLOCKS` на клиенте и
// `parseOperationKindFields` / `parseOperationEquipment` на сервере. Список блоков пункта — не
// разрешение, а ОПИСАНИЕ: рендер зоны свойств гейтится теми же предикатами, что и раньше, а
// `kindOverreach()` ниже ловит пункт, который назвал блок, не положенный его глаголу.
//
// ЧТО ПУНКТ ПИШЕТ, А ЧТО НЕТ. Глагол, машинка, класс шва у отстрочки, дискриминатор у F/I —
// это ВЫБОР ТЕХНОЛОГА, записанный за него одним кликом, и он уезжает в строку шага. Всё, что
// приходит из парка карточки или карточных дефолтов, не пишется НИКОГДА: день, когда пикер
// запишет унаследованное значение, — это день, когда «технолог выбрал 4 ст/см» перестанет
// отличаться от «так получилось по умолчанию» (прежний preset-эффект в этом файле-соседе уже
// разрушал это различие один раз).

/** Семейство пункта — по нему список разбит на подписанные группы. */
export type KindFamily = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export const KIND_FAMILY_LABEL: Record<KindFamily, string> = {
  A: 'seams & stitching',
  B: 'edges & set-in parts',
  C: 'cycle machines & embroidery',
  D: 'automats',
  E: 'welding & taping',
  F: 'hardware',
  G: 'pressing & fusing',
  H: 'print',
  I: 'finishing',
  J: 'escape hatches',
};

/**
 * ВТО-ПОДГЛАГОЛ ЕЩЁ НЕ В КОНТРАКТЕ — ЭТО ЕДИНСТВЕННЫЙ ПЕРЕКЛЮЧАТЕЛЬ ФАЗЫ 3.
 *
 * `press_action` / `press_toward` заводятся отдельной миграцией (блок 65 у `TechCardOperation`).
 * Пока их нет, семь пунктов ВТО, которые различаются ТОЛЬКО подглаголом (G1, G2, G4…G8),
 * схлопываются в один пункт «Press»: показывать семь пунктов, пишущих одно и то же состояние,
 * значит обещать различие, которого сохранение не переживёт.
 *
 * КАК ВКЛЮЧИТЬ — ОДНОЙ ПРАВКОЙ ЗДЕСЬ, когда поля появятся в строке формы (`schema.ts`,
 * `emptyOperation`, маппер записи — их заводит контрактная сторона): поставить `true`. Запись
 * `press_action` идёт через общий `kindWrites`, а писатель молча пропускает ключи, которых в
 * строке формы нет, — поэтому ранний `true` ничего не ломает, он просто ничего не пишет.
 * Читающая сторона (`kindOf`) поле уже спрашивает и сегодня получает `undefined`.
 */
export const PRESS_ACTION_IN_CONTRACT: boolean = false;

/** Токены `TechCardPressAction` — свои, пока енума в контракте нет (§4.1 карты пикера). */
export type PressActionToken =
  | 'press_flat'
  | 'to_one_side'
  | 'open'
  | 'steam'
  | 'final'
  | 'ease_in'
  | 'stretch'
  | 'mould';

export type OperationKind = {
  id: string;
  family: KindFamily;
  /** Имя в интерфейсе — то же слово, каким пункт называет шаг заголовок и печатный лист. */
  label: string;
  /** Имя, пока ВТО-подглагола нет в контракте: у схлопнутого «Press» оно шире собственного. */
  collapsedLabel?: string;
  /** Ярус 2 — «ещё»: законные, но редкие виды; список открывается пунктом «more kinds». */
  rare?: boolean;
  /**
   * СЛОВО ЗАГОЛОВКА, когда вид говорит БОЛЬШЕ второй оси. Стоит только там, где лестница
   * `MACHINE_TYPE_VERB` ошиблась бы: отстрочка на одноигольной по машинке называется «join».
   * Пусто — прежняя лестница уже права, и второй словарь глаголов рядом с ней разошёлся бы молча.
   */
  headingVerb?: string;
  /** Глагол шага. Он же — ключ, по которому спрашивают `STEP_TYPE_BLOCKS`. */
  verb: common_TechCardOperationType;
  /**
   * ЧТО ПУНКТ ПИШЕТ В СТРОКУ ШАГА, кроме глагола. Имена — ключи строки формы (тип берётся ИЗ
   * САМОЙ ФОРМЫ), потому что опечатка в имени не доезжает до провода мусором: маппер молча
   * выбрасывает ключи, которых не знает, и сервер отвергает шаг щитом, не назвав причины.
   */
  writes?: Partial<Record<OperationFormStringField, string>>;
  /**
   * ВТО-подглагол пункта. Отдельным полем, а не в `writes`: имени `pressAction` в строке формы
   * пока нет, и типизированная карта его не примет. См. `PRESS_ACTION_IN_CONTRACT`.
   */
  pressAction?: PressActionToken;
  /**
   * ПУНКТ СПРАШИВАЕТ «НА ЧЁМ» — суженным списком машинок, СРАЗУ И НА ВИДУ.
   *
   * Только у отстрочки: её якорь — класс шва, а не машинка (`seam_class = OS_TOPSTITCH`), но
   * машинку шаг MACHINE обязан нести (сервер отвергает MACHINE без неё). Молча угадать её нельзя —
   * поэтому вопрос стоит рядом с именем пункта, а не в створке.
   */
  askMachine?: readonly common_TechCardMachineType[];
  /** Чем заполняется вопрос «на чём», когда парк карточки не отвечает однозначно. */
  defaultMachine?: common_TechCardMachineType;
  /**
   * ПУНКТ, В КОТОРЫЙ РЕЗОЛВ ОТВЕЧАЕТ, ПОКА РАЗЛИЧАЮЩИЙ ФАКТ НЕ НАЗВАН.
   *
   * У четырёх пунктов запись САМА ПО СЕБЕ их не опознаёт, и это не дефект таблицы, а свойство
   * модели: кнопку от хольнитена отличает `kind` привязанной строки BOM, а «пришить этикетку» от
   * «стачать» — заполненный `label_attach_stitch`. Пока материал не привязан (а шов этикетки не
   * выбран), резолв обязан отвечать общим пунктом: сказать «Snap» ему НЕОТКУДА, и выдумать было
   * бы враньём о шаге.
   *
   * Отсюда — память пикера на один сеанс: только что выбранный пункт держится, пока сохранённое
   * состояние соответствует ему ИЛИ его общему родителю. Иначе экран переигрывал бы выбор
   * человека у него на глазах.
   */
  pendingResolve?: string;
  /**
   * СУЖЕНИЕ ПИКЕРА МАТЕРИАЛОВ — виды строк BOM, которые этот пункт ставит первыми. Ни одной новой
   * колонки: «что ставим» — это `kind` строки BOM, «как ставим» — `attach_method` шага, и вторая
   * копия первого на шаге рассинхронизировалась бы с первой же правкой спецификации.
   */
  bomKinds?: readonly string[];
  /**
   * БЛОКИ, СОДЕРЖАТЕЛЬНЫЕ У ЭТОГО ВИДА. Описание, а не разрешение: рендер гейтится теми же
   * предикатами, что и до пикера, — иначе короткий список пункта прятал бы законное поле, которое
   * очистка скрытого не стирает (гейт у неё свой), и значение жило бы невидимым.
   */
  featured: readonly StepBlock[];
  /**
   * ГДЕ ФАКТЫ ЖИВУТ НА САМОМ ДЕЛЕ — для шагов, у которых полей нет вовсе. Пустое место читается
   * как «что-то не загрузилось», поэтому вместо пустоты стоит фраза-состояние и указатель.
   */
  pointer?: string;
};

const M = 'TECH_CARD_OPERATION_TYPE_MACHINE' as const;
const mt = (s: string) => `TECH_CARD_MACHINE_TYPE_${s}` as common_TechCardMachineType;

/** Общие семейства машинного шва — их несёт любой MACHINE, какая бы машинка ни стояла. */
const SEW: readonly StepBlock[] = ['stitching', 'placement'];
/** Цикловой автомат: тройка «отверстие / усилитель / стежки цикла» плюс своя программа. */
const CYCLE: readonly StepBlock[] = ['stitching', 'placement', 'hardware', 'fastening'];

/**
 * ТАБЛИЦА ПУНКТОВ. Порядок внутри семейства — порядок списка; семейства идут так, как идёт работа:
 * швы, края, цикловые, автоматы, сварка, фурнитура, ВТО, печать, финиш, аварийные выходы.
 * Аварийные выходы СТОЯТ ПОСЛЕДНИМИ ровно по доводу, записанному в `operation-options`: выход,
 * предложенный рано, будет взят рано — так девять глаголов и прожили годы свободным текстом.
 */
export const OPERATION_KINDS: readonly OperationKind[] = [
  // --- A. швы и строчки -------------------------------------------------------------------------
  { id: 'A1', family: 'A', label: 'Join — lockstitch', verb: M, writes: { machineType: mt('LOCKSTITCH') }, featured: SEW },
  {
    id: 'A2',
    family: 'A',
    label: 'Topstitch',
    headingVerb: 'topstitch',
    verb: M,
    // ЯКОРЬ ВИДА — КЛАСС ШВА, А НЕ МАШИНКА, и это решение, а не удобство. Технолог законно
    // переставит отстрочку с одноигольной на двухигольную — и вид обязан остаться отстрочкой.
    // Поле, которого смена машинки не касается, ровно одно: `seam_class`.
    writes: { seamClass: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH' },
    askMachine: [
      mt('LOCKSTITCH'),
      mt('LOCKSTITCH_DOUBLE_NEEDLE'),
      mt('CHAINSTITCH'),
      mt('COVERSTITCH'),
      mt('HANDSTITCH_IMITATION'),
    ],
    defaultMachine: mt('LOCKSTITCH'),
    bomKinds: ['TECH_CARD_BOM_KIND_TOPSTITCH_THREAD'],
    featured: SEW,
  },
  { id: 'A3', family: 'A', label: 'Overlock / serge', verb: M, writes: { machineType: mt('OVERLOCK') }, bomKinds: ['TECH_CARD_BOM_KIND_OVERLOCK_THREAD'], featured: SEW },
  { id: 'A4', family: 'A', label: 'Coverstitch', verb: M, writes: { machineType: mt('COVERSTITCH') }, featured: SEW },
  { id: 'A5', family: 'A', label: 'Coverlock', rare: true, verb: M, writes: { machineType: mt('COVERLOCK') }, featured: SEW },
  { id: 'A6', family: 'A', label: 'Chainstitch', verb: M, writes: { machineType: mt('CHAINSTITCH') }, featured: SEW },
  { id: 'A7', family: 'A', label: 'Blindhem', verb: M, writes: { machineType: mt('BLINDSTITCH') }, featured: SEW },
  { id: 'A8', family: 'A', label: 'Zigzag', verb: M, writes: { machineType: mt('ZIGZAG') }, featured: SEW },
  { id: 'A9', family: 'A', label: 'AMF hand-stitch imitation', rare: true, verb: M, writes: { machineType: mt('HANDSTITCH_IMITATION') }, featured: SEW },
  { id: 'A10', family: 'A', label: 'Machine — other (see note)', rare: true, verb: M, writes: { machineType: mt('OTHER') }, featured: SEW },

  // --- B. края и вложенные детали ---------------------------------------------------------------
  { id: 'B1', family: 'B', label: 'Bind / tape edge', verb: M, writes: { machineType: mt('BINDING_TAPING') }, bomKinds: ['TECH_CARD_BOM_KIND_BINDING', 'TECH_CARD_BOM_KIND_TAPE', 'TECH_CARD_BOM_KIND_PIPING'], featured: SEW },
  { id: 'B2', family: 'B', label: 'Attach elastic', verb: M, writes: { machineType: mt('ELASTIC_ATTACH') }, bomKinds: ['TECH_CARD_BOM_KIND_ELASTIC'], featured: SEW },
  { id: 'B3', family: 'B', label: 'Set zip', verb: M, writes: { machineType: mt('ZIPPER_SETTING') }, bomKinds: ['TECH_CARD_BOM_KIND_ZIPPER'], featured: ['stitching', 'placement', 'fastening'] },
  { id: 'B4', family: 'B', label: 'Gather / ease', verb: M, writes: { machineType: mt('GATHERING') }, featured: SEW },
  // B5 — МЕРДЖ-ПУНКТ С СИЛЬНЫМ ДОВОДОМ: `label_attach_stitch` не имеет машинного гейта вовсе, то
  // есть законен на любом MACHINE, — и сегодня до него нельзя добраться, не догадавшись открыть
  // створку «differs from standard». Пункт делает существующее поле достижимым, не добавляя ни
  // колонки.
  { id: 'B5', family: 'B', label: 'Attach label', verb: M, writes: { machineType: mt('LOCKSTITCH') }, pendingResolve: 'A1', featured: SEW },

  // --- C. цикловые машины и вышивка -------------------------------------------------------------
  { id: 'C1', family: 'C', label: 'Buttonhole', verb: M, writes: { machineType: mt('BUTTONHOLE') }, bomKinds: ['TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD'], featured: CYCLE },
  { id: 'C2', family: 'C', label: 'Button attach', verb: M, writes: { machineType: mt('BUTTON_ATTACH') }, bomKinds: ['TECH_CARD_BOM_KIND_BUTTON', 'TECH_CARD_BOM_KIND_SNAP'], featured: CYCLE },
  { id: 'C3', family: 'C', label: 'Bartack', verb: M, writes: { machineType: mt('BARTACK') }, featured: CYCLE },
  // C4 — ПРИЗНАННЫЙ ПРОБЕЛ: у вышивки нет ни ссылки на дизайн, ни числа стежков, ни пялец, ни
  // стабилизатора отдельным полем. Обходится существующим: дизайн — снимок шага с выносками,
  // стабилизатор и нить — строки BOM, которые пункт и ставит первыми.
  { id: 'C4', family: 'C', label: 'Embroidery', verb: M, writes: { machineType: mt('EMBROIDERY') }, bomKinds: ['TECH_CARD_BOM_KIND_EMBROIDERY_THREAD', 'TECH_CARD_BOM_KIND_EMBROIDERY_STABILIZER'], featured: SEW },

  // --- D. автоматы. В парке на бете их нет; пункты нужны ТОТАЛЬНОСТИ РЕЗОЛВА -----------------
  { id: 'D1', family: 'D', label: 'Patch-pocket automat', rare: true, verb: M, writes: { machineType: mt('PATCH_POCKET_AUTO') }, featured: SEW },
  { id: 'D2', family: 'D', label: 'Welt-pocket automat', rare: true, verb: M, writes: { machineType: mt('WELT_POCKET_AUTO') }, featured: SEW },
  { id: 'D3', family: 'D', label: 'Template automat', rare: true, verb: M, writes: { machineType: mt('TEMPLATE_AUTO') }, featured: SEW },
  { id: 'D4', family: 'D', label: 'Collar / cuff automat', rare: true, verb: M, writes: { machineType: mt('COLLAR_CUFF_AUTO') }, featured: SEW },
  { id: 'D5', family: 'D', label: 'Sleeve-setting automat', rare: true, verb: M, writes: { machineType: mt('SLEEVE_SETTING_AUTO') }, featured: SEW },
  { id: 'D6', family: 'D', label: 'Waistband automat', rare: true, verb: M, writes: { machineType: mt('WAISTBAND_AUTO') }, featured: SEW },

  // --- E. сварка и проклейка --------------------------------------------------------------------
  // На этих двух машинках сервер отвергает ДЕСЯТЬ ниточно-игольных полей: нитки, игла, номер иглы,
  // натяжение и заметка, ширина стежка, гейдж, число игл, закрепка, шаг рядов. `fullness_ratio`
  // намеренно НЕ отвергнут — обе машины подают материал. Поэтому створка «differs from standard»
  // показывает у них только профиль, и это не недосмотр.
  { id: 'E1', family: 'E', label: 'Tape seam (hot air)', rare: true, verb: M, writes: { machineType: mt('SEAM_TAPING') }, bomKinds: ['TECH_CARD_BOM_KIND_SEAM_SEALING_TAPE'], featured: ['stitching', 'placement', 'weld'] },
  { id: 'E2', family: 'E', label: 'Ultrasonic weld', rare: true, verb: M, writes: { machineType: mt('ULTRASONIC_WELDER') }, featured: ['stitching', 'placement', 'weld'] },

  // --- F. установка фурнитуры -------------------------------------------------------------------
  //
  // ПЯТЬ ПУНКТОВ ПОД ОДНИМ ГЛАГОЛОМ, И РАЗЛИЧАЕТ ИХ СТРОКА BOM. У кнопки, хольнитена и люверса
  // ОДИН И ТОТ ЖЕ `attach_method = press_set`: прото так и задумано — поле отвечает «как ставим», а
  // «что ставим» это `kind` строки BOM. Поэтому пункты пишут ровно то, что законно, и дополнительно
  // СУЖАЮТ пикер материалов. Колонка `hardware_kind` на шаге была бы теневым значением к
  // `bom_item.kind`, и первая же правка спецификации их рассинхронизирует.
  //
  // F0 — НЕ ШЕСТОЙ ВИД РАБОТЫ, А ЧЕСТНЫЙ ОТВЕТ РЕЗОЛВА. Пара (HARDWARE_SET, press_set) без
  // привязанной строки BOM не даёт сказать, кнопка это или люверс, — и выдумать «ближайший» пункт
  // здесь было бы ровно тем, чего §5.2 запрещает. Он же принимает `prong_clinch` и `crimp`:
  // контрол «held on by *» стоит на виду, и зубцы — это F1 с переключённым методом, а не другая
  // работа.
  { id: 'F0', family: 'F', label: 'Set hardware', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', featured: ['placement', 'hardware'] },
  { id: 'F1', family: 'F', pendingResolve: 'F0', label: 'Snap / press stud', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', writes: { attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET' }, bomKinds: ['TECH_CARD_BOM_KIND_SNAP'], featured: ['placement', 'hardware'] },
  { id: 'F2', family: 'F', pendingResolve: 'F0', label: 'Rivet / burr', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', writes: { attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET' }, bomKinds: ['TECH_CARD_BOM_KIND_RIVET'], featured: ['placement', 'hardware'] },
  { id: 'F3', family: 'F', pendingResolve: 'F0', label: 'Eyelet / grommet', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', writes: { attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET' }, bomKinds: ['TECH_CARD_BOM_KIND_EYELET'], featured: ['placement', 'hardware'] },
  { id: 'F4', family: 'F', label: 'Buckle / slider (threaded)', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', writes: { attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED' }, bomKinds: ['TECH_CARD_BOM_KIND_BUCKLE', 'TECH_CARD_BOM_KIND_STRAP_ADJUSTER', 'TECH_CARD_BOM_KIND_RING'], featured: ['placement', 'hardware'] },
  { id: 'F5', family: 'F', label: 'Attach hardware — sewn', verb: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET', writes: { attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_SEW' }, featured: ['placement', 'hardware'] },

  // --- G. ВТО -----------------------------------------------------------------------------------
  //
  // ДВА НАПИСАНИЯ «РАЗУТЮЖИТЬ» УЖИВАЮТСЯ ПО ЧЕТЫРЁМ ПРАВИЛАМ. Каноническая запись — ГЛАГОЛ:
  // пункт G3 пишет `PRESS_OPEN` и `press_action` не пишет вовсе, `PRESS + open` пикер не пишет
  // никогда. Чтение принимает оба. Форма никогда не переписывает одно в другое: два написания
  // дают два разных кортежа в проекции дайджеста секции, и авто-канонизация пометила бы
  // подписанную карточку как «изменена после подписи» без единой человеческой правки.
  { id: 'G1', family: 'G', label: 'Press flat', collapsedLabel: 'Press', verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'press_flat', featured: ['pressSettings'] },
  { id: 'G2', family: 'G', label: 'Press to one side', verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'to_one_side', featured: ['pressSettings'] },
  { id: 'G3', family: 'G', label: 'Press open', verb: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN', featured: ['pressSettings'] },
  { id: 'G4', family: 'G', label: 'Steam', verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'steam', writes: { pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER' }, featured: ['pressSettings'] },
  { id: 'G5', family: 'G', label: 'Final press', verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'final', featured: ['pressSettings'] },
  { id: 'G6', family: 'G', label: 'Ease in', rare: true, verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'ease_in', featured: ['pressSettings'] },
  { id: 'G7', family: 'G', label: 'Stretch', rare: true, verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'stretch', featured: ['pressSettings'] },
  { id: 'G8', family: 'G', label: 'Mould', rare: true, verb: 'TECH_CARD_OPERATION_TYPE_PRESS', pressAction: 'mould', writes: { pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_STEAM_DUMMY' }, featured: ['pressSettings'] },
  {
    id: 'G9',
    family: 'G',
    label: 'Fuse',
    verb: 'TECH_CARD_OPERATION_TYPE_FUSING',
    writes: { pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS' },
    featured: ['pressSettings'],
    pointer: 'how the fusible is laid — whole, allowance only, or a strip — lives on the PIECE, not on this step',
  },

  // --- H. печать --------------------------------------------------------------------------------
  //
  // Пять методов НЕ становятся пятью пунктами: это один печатный участок, метод — подробность, и
  // он и так стоит видимым контролом (дискриминатор глагола). При `laser_engrave` сервер отвергает
  // и блок печати, и все семь полей ВТО — предикат `isLaserPrint` у клиента уже есть, второго
  // такого пикер не заводит.
  { id: 'H1', family: 'H', label: 'Print / transfer', verb: 'TECH_CARD_OPERATION_TYPE_PRINT', bomKinds: ['TECH_CARD_BOM_KIND_PRINT', 'TECH_CARD_BOM_KIND_HEAT_TRANSFER', 'TECH_CARD_BOM_KIND_FOIL'], featured: ['placement', 'print', 'pressSettings'] },

  // --- I. отделка и финиш -----------------------------------------------------------------------
  { id: 'I1', family: 'I', label: 'Trim allowance', verb: 'TECH_CARD_OPERATION_TYPE_TRIM', featured: ['trim'] },
  { id: 'I2', family: 'I', label: 'Thread trim (tails)', verb: 'TECH_CARD_OPERATION_TYPE_THREAD_TRIM', featured: ['threadTrim'] },
  { id: 'I3', family: 'I', label: 'Clean', verb: 'TECH_CARD_OPERATION_TYPE_CLEAN', featured: ['clean'] },
  // I4 / I5 — ДВА СЛОВА ВЛАДЕЛЬЦА, ОДНА МОДЕЛЬ. Глагол один (`INSPECT`), разводит их `coverage_mode`,
  // и в контракте он прямо описан как то, что отделяет межоперационный контроль от финального.
  // Значения `each_unit` и `first_output` пунктов не получают: контрол на виду, заголовок дописывает
  // фактическое покрытие, и резолв остаётся тотальным без четырёх пунктов.
  {
    id: 'I4',
    family: 'I',
    label: 'Inspection (in-line)',
    verb: 'TECH_CARD_OPERATION_TYPE_INSPECT',
    writes: { coverageMode: 'TECH_CARD_INSPECT_COVERAGE_SAMPLE_PER_BUNDLE' },
    featured: ['inspect'],
    pointer: 'what counts as a defect lives on the card’s DEFECTS list',
  },
  {
    id: 'I5',
    family: 'I',
    label: 'Quality control (final)',
    verb: 'TECH_CARD_OPERATION_TYPE_INSPECT',
    writes: { coverageMode: 'TECH_CARD_INSPECT_COVERAGE_AQL_PLAN' },
    featured: ['inspect'],
    // `aql_plan` называет план, которого на карточке нет: ни уровня AQL, ни размера выборки, ни
    // чисел приёмки. Правильное место — карточный лист, а не поля шага (n и Ac/Re зависят от
    // размера партии, то есть это факт ПРОГОНА). Пока листа нет — пометка вместо пустоты.
    pointer: 'there is no AQL plan on this card yet — state the level and the sample in the note',
  },
  { id: 'I6', family: 'I', label: 'Fold', verb: 'TECH_CARD_OPERATION_TYPE_FOLD', featured: [], pointer: 'the fold pattern and the pack mode live on the PACKAGING tab' },
  { id: 'I7', family: 'I', label: 'Pack', verb: 'TECH_CARD_OPERATION_TYPE_PACK', featured: [], pointer: 'polybag, carton and units per bag live on the PACKAGING tab' },
  { id: 'I8', family: 'I', label: 'Wet process', rare: true, verb: 'TECH_CARD_OPERATION_TYPE_WET_PROCESS', featured: ['wetProcess'] },

  // --- J. аварийные выходы ----------------------------------------------------------------------
  { id: 'J1', family: 'J', label: 'Hand work', verb: 'TECH_CARD_OPERATION_TYPE_HANDWORK', featured: [] },
  { id: 'J2', family: 'J', label: 'Other (see note)', verb: 'TECH_CARD_OPERATION_TYPE_OTHER', featured: [] },
];

export const OPERATION_KIND_BY_ID: ReadonlyMap<string, OperationKind> = new Map(
  OPERATION_KINDS.map((k) => [k.id, k]),
);

/** Семь ВТО-пунктов, которые различает ТОЛЬКО подглагол, — те, что схлопываются до миграции. */
const PRESS_ACTION_ONLY = new Set(['G2', 'G4', 'G5', 'G6', 'G7', 'G8']);

/** Виден ли пункт в списке СЕГОДНЯ (см. `PRESS_ACTION_IN_CONTRACT`). */
export const kindIsOffered = (k: OperationKind): boolean =>
  PRESS_ACTION_IN_CONTRACT || !PRESS_ACTION_ONLY.has(k.id);

/** Имя пункта СЕГОДНЯ: у схлопнутого «Press» оно шире собственного, пока подглагола нет. */
export const kindLabelOf = (k: OperationKind): string =>
  !PRESS_ACTION_IN_CONTRACT && k.collapsedLabel ? k.collapsedLabel : k.label;

export const offeredKinds = (): OperationKind[] => OPERATION_KINDS.filter(kindIsOffered);

// --- ПИКЕР: ОДИН СБОРЩИК СПИСКА НА ДВА ВЫЗЫВАЮЩИХ МЕСТА -----------------------------------------
//
// Спрашивают вид ДВОЕ: сетка открытого шага и диалог создания. Владелец открыл СУЩЕСТВУЮЩИЙ шаг и
// не нашёл в нём топстич — пикер только на создании жалобу не закрывает; а два сборщика одного
// списка разошлись бы на первом же добавленном пункте, и разошлись бы молча.

/** «Вид не назван» — Radix запрещает `Select.Item` с пустым value, поэтому сентинел, а не ''. */
export const KIND_UNSET = '__kind_unset__';
/** «Ещё» — раскрывает ярус 2. Выбором вида НЕ является: значение пикера вычисляемое. */
export const KIND_MORE = '__kind_more__';
/** Служебная строка списка (шапка семейства или один из двух сентинелов) — видом не становится. */
export const isKindSentinel = (v: string): boolean =>
  v === KIND_UNSET || v === KIND_MORE || v.startsWith('__fam_');

export type KindPickerItem = { value: string; label: string; disabled?: boolean };

/**
 * СТРОКИ ПИКЕРА. Ярус 2 («ещё») отложен, а не спрятан: список из полусотни строк выбор не
 * сокращает, а расширяет — ровно этим сегодняшний экран и плох. Выбранный редкий вид показывается
 * всегда, иначе сохранённый шаг открылся бы с пустым триггером.
 *
 * ШАПКИ СЕМЕЙСТВ — НЕВЫБИРАЕМЫЕ ПУНКТЫ: групп у примитива нет, а полсотни строк без разделения
 * читаются свалкой; `disabled` у него заведён ровно под «реальное, но не выбираемое».
 */
export function kindPickerItems(
  activeId: string | undefined,
  rareOpen: boolean,
  unsetLabel = '— kind of operation —',
): KindPickerItem[] {
  const out: KindPickerItem[] = [{ value: KIND_UNSET, label: unsetLabel }];
  let family = '';
  let hidden = 0;
  for (const k of OPERATION_KINDS) {
    if (!kindIsOffered(k)) continue;
    if (k.rare && !rareOpen && k.id !== activeId) {
      hidden += 1;
      continue;
    }
    if (k.family !== family) {
      family = k.family;
      out.push({
        value: `__fam_${k.family}__`,
        label: `— ${KIND_FAMILY_LABEL[k.family]} —`,
        disabled: true,
      });
    }
    out.push({ value: k.id, label: kindLabelOf(k) });
  }
  if (hidden > 0) out.push({ value: KIND_MORE, label: `— ${hidden} more kinds… —` });
  return out;
}

/**
 * СПИСОК БЛОКОВ ПУНКТА — ПОДМНОЖЕСТВО ТОГО, ЧТО ПОЗВОЛЯЕТ ЕГО ГЛАГОЛ. Пикер может показать МЕНЬШЕ,
 * никогда больше. Проверяется здесь, а не комментарием: пункт, назвавший чужой блок, вернётся
 * отсюда именем — и проба, которая это читает, покраснеет.
 */
export function kindOverreach(): Array<{ id: string; blocks: StepBlock[] }> {
  const bad: Array<{ id: string; blocks: StepBlock[] }> = [];
  for (const k of OPERATION_KINDS) {
    const allowed = STEP_TYPE_BLOCKS[k.verb] ?? [];
    const over = k.featured.filter((b) => !allowed.includes(b));
    if (over.length) bad.push({ id: k.id, blocks: over });
  }
  return bad;
}

// --- ОБРАТНЫЙ РЕЗОЛВ -----------------------------------------------------------------------------

/**
 * ЧТО ЧИТАЕТ РЕЗОЛВ — ТОЛЬКО СОХРАНЁННЫЕ ПОЛЯ ШАГА, и никогда карточные дефолты: карточный
 * `default_seam_class = OS_TOPSTITCH` не имеет права превращать каждый шов в отстрочку.
 */
export type OperationKindStep = {
  operationType?: string;
  machineType?: string;
  pressEquipment?: string;
  seamClass?: string;
  attachMethod?: string;
  coverageMode?: string;
  labelAttachStitch?: string;
  /** ВТО-подглагол. Сегодня всегда `undefined` — поля в контракте ещё нет (§4.1). */
  pressAction?: string;
  /** Виды строк BOM, привязанных к шагу, — ТОЛЬКО для уточнения F1 / F2 / F3. */
  bomKinds?: readonly string[];
};

const NONE = (v?: string) => !v || v.endsWith('_UNKNOWN');

/**
 * МАШИНКА → ПУНКТ. Тотальная карта над контрактом, и в этом весь смысл её формы: машинка,
 * добавленная в прото, роняет сборку здесь — на пропущенном ключе, — а не превращается молча в
 * «нестандартную комбинацию» на совершенно законном шаге.
 *
 * ДВЕ ЗАПИСИ ЗДЕСЬ — СОГЛАШЕНИЯ ЧТЕНИЯ, А НЕ ЗАПИСИ, и обе выписаны рядом с таблицей нарочно:
 *  · `LOCKSTITCH_DOUBLE_NEEDLE` → A2 БЕЗУСЛОВНО: её собственный глагол в `MACHINE_TYPE_VERB`
 *    буквально `topstitch`, класса шва спрашивать незачем;
 *  · `HARDWARE_ATTACH` → F5: `MACHINE + hardware_attach` и `HARDWARE_SET + sew` описывают один
 *    факт. Пикер ПИШЕТ только второе (там блок фурнитуры законен целиком), а ЧИТАЕТ оба.
 */
const MACHINE_TO_KIND: Record<common_TechCardMachineType, string> = {
  TECH_CARD_MACHINE_TYPE_UNKNOWN: '',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: 'A1',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: 'A2',
  TECH_CARD_MACHINE_TYPE_OVERLOCK: 'A3',
  TECH_CARD_MACHINE_TYPE_COVERSTITCH: 'A4',
  TECH_CARD_MACHINE_TYPE_COVERLOCK: 'A5',
  TECH_CARD_MACHINE_TYPE_CHAINSTITCH: 'A6',
  TECH_CARD_MACHINE_TYPE_BLINDSTITCH: 'A7',
  TECH_CARD_MACHINE_TYPE_ZIGZAG: 'A8',
  TECH_CARD_MACHINE_TYPE_BARTACK: 'C3',
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: 'C1',
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: 'C2',
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: 'C4',
  TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION: 'A9',
  TECH_CARD_MACHINE_TYPE_HARDWARE_ATTACH: 'F5',
  TECH_CARD_MACHINE_TYPE_ELASTIC_ATTACH: 'B2',
  TECH_CARD_MACHINE_TYPE_BINDING_TAPING: 'B1',
  TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING: 'B3',
  TECH_CARD_MACHINE_TYPE_GATHERING: 'B4',
  TECH_CARD_MACHINE_TYPE_PATCH_POCKET_AUTO: 'D1',
  TECH_CARD_MACHINE_TYPE_WELT_POCKET_AUTO: 'D2',
  TECH_CARD_MACHINE_TYPE_TEMPLATE_AUTO: 'D3',
  TECH_CARD_MACHINE_TYPE_COLLAR_CUFF_AUTO: 'D4',
  TECH_CARD_MACHINE_TYPE_SLEEVE_SETTING_AUTO: 'D5',
  TECH_CARD_MACHINE_TYPE_WAISTBAND_AUTO: 'D6',
  TECH_CARD_MACHINE_TYPE_SEAM_TAPING: 'E1',
  TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER: 'E2',
  TECH_CARD_MACHINE_TYPE_OTHER: 'A10',
};

/**
 * ГЛАГОЛ → ПУНКТ, когда пункт у глагола ровно один (или один по умолчанию). Тоже тотальная карта,
 * и тоже ради диффчека: семнадцатый глагол уронит сборку здесь, а не нарисует пустой пикер.
 *
 * ДЕВЯТЬ ЛЕГАСИ-ЧЛЕНОВ ЖИВУТ ЗДЕСЬ ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО И В СЛОВАРЕ ПОДПИСЕЙ: с чтения они не
 * приходят с 0306, но релизный снапшот — неизменяемый protojson со старыми именами, и шаг
 * архивного релиза обязан называться видом, а не пустотой. Это односторонний декодер, не таблица
 * авторинга: пикер таких значений не пишет.
 */
const VERB_TO_KIND: Record<common_TechCardOperationType, string> = {
  TECH_CARD_OPERATION_TYPE_UNKNOWN: '',
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: 'A1',
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: 'A2',
  TECH_CARD_OPERATION_TYPE_OVERLOCK: 'A3',
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: 'A4',
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: 'A6',
  TECH_CARD_OPERATION_TYPE_BLINDHEM: 'A7',
  TECH_CARD_OPERATION_TYPE_BARTACK: 'C3',
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: 'C1',
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: 'C2',
  TECH_CARD_OPERATION_TYPE_FUSING: 'G9',
  TECH_CARD_OPERATION_TYPE_HANDWORK: 'J1',
  TECH_CARD_OPERATION_TYPE_OTHER: 'J2',
  // MACHINE решает вторая ось, HARDWARE_SET и INSPECT — свой дискриминатор, PRESS — подглагол.
  // Значения ниже стоят ПОСЛЕДНЕЙ ступенью: они верны, когда уточнить нечем.
  TECH_CARD_OPERATION_TYPE_MACHINE: '',
  TECH_CARD_OPERATION_TYPE_PRESS: 'G1',
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: 'G3',
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: 'F0',
  TECH_CARD_OPERATION_TYPE_PRINT: 'H1',
  TECH_CARD_OPERATION_TYPE_TRIM: 'I1',
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: 'I2',
  TECH_CARD_OPERATION_TYPE_CLEAN: 'I3',
  TECH_CARD_OPERATION_TYPE_INSPECT: 'I4',
  TECH_CARD_OPERATION_TYPE_FOLD: 'I6',
  TECH_CARD_OPERATION_TYPE_PACK: 'I7',
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: 'I8',
};

/** ВТО-подглагол → пункт. Читается и `PRESS + open` (пикер такого не пишет — см. G3). */
const PRESS_ACTION_TO_KIND: Record<PressActionToken, string> = {
  press_flat: 'G1',
  to_one_side: 'G2',
  open: 'G3',
  steam: 'G4',
  final: 'G5',
  ease_in: 'G6',
  stretch: 'G7',
  mould: 'G8',
};

const byId = (id: string): OperationKind | undefined => OPERATION_KIND_BY_ID.get(id);

/**
 * КАКИМ ПУНКТОМ ЗАВЕДЁН ЭТОТ ШАГ. Чистая функция, порядок правил фиксирован.
 *
 * `undefined` — ЗАКОННЫЙ ОТВЕТ и означает ровно одно: сохранённая пара не соответствует ни одному
 * пункту. Это возможно (ручная комбинация, токен новее бандла, недозаполненный шаг), и делать в
 * этом случае нельзя двух вещей: выдумывать ближайший пункт и что-либо чистить. Вызыватель
 * показывает имя, собранное из самих осей, пометку «нестандартная комбинация» и ОБЕ сырые оси
 * контролами — та же защитная форма, что у `operationTypeOptionsFor`.
 */
export function kindOf(step: OperationKindStep): OperationKind | undefined {
  const verb = (step.operationType ?? '') as common_TechCardOperationType;
  if (NONE(verb)) return undefined;

  // 1. Глаголы, у которых пункты разводит ДИСКРИМИНАТОР.
  if (verb === 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET') {
    const m = step.attachMethod ?? '';
    if (m === 'TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED') return byId('F4');
    if (m === 'TECH_CARD_HARDWARE_ATTACH_METHOD_SEW') return byId('F5');
    if (m === 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET') {
      // Уточнение по СТРОКЕ BOM, а не по теневой колонке шага: «что ставим» живёт там.
      const kinds = new Set(step.bomKinds ?? []);
      if (kinds.has('TECH_CARD_BOM_KIND_SNAP')) return byId('F1');
      if (kinds.has('TECH_CARD_BOM_KIND_RIVET')) return byId('F2');
      if (kinds.has('TECH_CARD_BOM_KIND_EYELET')) return byId('F3');
    }
    return byId('F0');
  }
  if (verb === 'TECH_CARD_OPERATION_TYPE_INSPECT') {
    return byId(step.coverageMode === 'TECH_CARD_INSPECT_COVERAGE_AQL_PLAN' ? 'I5' : 'I4');
  }

  // 2. ВТО. Глагол `PRESS_OPEN` — каноническая запись разутюжки; `PRESS + open` читается тем же
  //    пунктом, но никогда не пишется, и форма ни одно из двух написаний в другое не переводит.
  if (verb === 'TECH_CARD_OPERATION_TYPE_PRESS') {
    const a = (step.pressAction ?? '') as PressActionToken;
    if (a && a in PRESS_ACTION_TO_KIND) return byId(PRESS_ACTION_TO_KIND[a]);
    return byId('G1');
  }

  // 3. MACHINE — вторая ось, с тремя уточнениями перед ней.
  if (verb === 'TECH_CARD_OPERATION_TYPE_MACHINE') {
    const machine = (step.machineType ?? '') as common_TechCardMachineType;
    if (machine === 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE') return byId('A2');
    if (
      step.seamClass === 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH' &&
      (machine === 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH' ||
        machine === 'TECH_CARD_MACHINE_TYPE_CHAINSTITCH' ||
        machine === 'TECH_CARD_MACHINE_TYPE_COVERSTITCH' ||
        machine === 'TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION')
    ) {
      return byId('A2');
    }
    if (!NONE(step.labelAttachStitch) && machine === 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH') {
      return byId('B5');
    }
    return byId(MACHINE_TO_KIND[machine] ?? '');
  }

  // 4. Глагол с одним пунктом (и девять легаси-членов из архивного снапшота).
  return byId(VERB_TO_KIND[verb] ?? '');
}

/**
 * ГЛАГОЛ ЗАГОЛОВКА — ВИДОМ, А НЕ ТОЛЬКО МАШИНКОЙ. Отстрочка на одноигольной печаталась бы как
 * «join», потому что глагол машинного шага берётся из `MACHINE_TYPE_VERB`, — а пикер называл бы её
 * «Topstitch», и экран с печатным листом назвали бы один шаг двумя словами. Спрашивает ВИД, а
 * отвечает сама таблица (`headingVerb`): пусто значит «прежняя лестница уже права».
 */
export function kindHeadingVerb(step: OperationKindStep): string {
  return kindOf(step)?.headingVerb ?? '';
}

// --- ЧТО ПИШЕТ ВЫБОР ПУНКТА ----------------------------------------------------------------------

/**
 * НАБОР ЗНАЧЕНИЙ, КОТОРЫЙ ПУНКТ ЗАПИСЫВАЕТ В СТРОКУ ШАГА, — плоской картой «имя поля → значение».
 *
 * Плоская карта, а не типизированная структура, ровно по одной причине: `pressAction` /
 * `pressToward` в строке формы ЕЩЁ НЕТ, и писатель обязан уметь молча пропустить имя, которого
 * форма не знает (см. `PRESS_ACTION_IN_CONTRACT`). Всё остальное типизировано в самой таблице.
 *
 * МАШИНКА У ОТСТРОЧКИ — ОТДЕЛЬНЫМ АРГУМЕНТОМ: пункт её не угадывает, её приносит парк карточки
 * (единственный подходящий профиль) или дефолт пункта, и решает это вызыватель, который парк видит.
 */
export function kindWrites(k: OperationKind, machineForAsk?: string): Record<string, string> {
  const out: Record<string, string> = { operationType: k.verb, ...(k.writes ?? {}) };
  if (k.askMachine) {
    const picked = (machineForAsk ?? '').trim();
    out.machineType =
      picked && (k.askMachine as readonly string[]).includes(picked)
        ? picked
        : (k.defaultMachine ?? k.askMachine[0]);
  }
  if (PRESS_ACTION_IN_CONTRACT && k.pressAction) out.pressAction = k.pressAction;
  return out;
}

/**
 * ПОЛЯ ЗОНЫ СВОЙСТВ — те, у которых пустое значит «никто не сказал», а не «наследуй».
 *
 * ОДИН СПИСОК НА ДВА ДЕЛА, и оба сломались бы врозь молча:
 *  1. каждое из этих имён обязано попасть в `CORE_STEP_FIELDS` — иначе серверный или зодовский
 *     отказ будет РАСКРЫВАТЬ СТВОРКУ, в которой контрола уже нет (ровно тот дефект, от которого
 *     множество и защищает);
 *  2. предзаполнение с последнего шага того же вида переносит ровно их — и ничего из створки:
 *     то, что наследуется, пишется НИКОГДА.
 *
 * `pressAction` / `pressToward` стоят в списке заранее: их появление в строке формы не должно
 * требовать правки ещё и здесь.
 */
export const KIND_PROPERTY_FIELDS: readonly string[] = [
  // отстрочка — три поля, поднятые из «seam & stitch»
  'topstitchMode',
  'topstitchWidthMm',
  'topstitchRows',
  // S — строчка
  'needleCount',
  'needleGaugeMm',
  'seamSecuring',
  'rowSpacingMm',
  'fullnessRatio',
  'bindingStyle',
  'labelAttachStitch',
  // PL — повторы
  'placementCount',
  'pitchMm',
  // H — фурнитура
  'holePrep',
  'reinforcement',
  'cycleStitchCount',
  'foldbackMm',
  // P — печать
  'peelMode',
  'secondPressSec',
  'pressureScale',
  // W — сварка
  'airTemperatureC',
  'feedSpeedMMin',
  // T / F — подрезка и хвосты
  'residualAllowanceMm',
  'residualTailMaxMm',
  // FA — петли, закрепки, пуговицы, молнии
  'buttonholeStyle',
  'cutLengthMm',
  'buttonholeOrientation',
  'bartackLengthMm',
  'attachPattern',
  'zipperApplication',
  // ВТО-подглагол (§4.1) — полей ещё нет в контракте, имена стоят заранее
  'pressAction',
  'pressToward',
];
