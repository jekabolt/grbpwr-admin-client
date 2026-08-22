import {
  common_TechCardAttachmentKind,
  common_TechCardBindingStyle,
  common_TechCardButtonAttachPattern,
  common_TechCardButtonholeOrientation,
  common_TechCardButtonholeStyle,
  common_TechCardCleaningKind,
  common_TechCardGarmentZone,
  common_TechCardHardwareAttachMethod,
  common_TechCardHolePrep,
  common_TechCardInspectCoverage,
  common_TechCardLabelAttachStitch,
  common_TechCardMachineType,
  common_TechCardOperationType,
  common_TechCardPeelMode,
  common_TechCardPressAction,
  common_TechCardPressToward,
  common_TechCardPrintMethod,
  common_TechCardReinforcement,
  common_TechCardSeamClass,
  common_TechCardSeamSecuring,
  common_TechCardTopstitchMode,
  common_TechCardTrimAction,
  common_TechCardWetProcessKind,
  common_TechCardZipperApplication,
} from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';
import {
  automationLevelLabel,
  bedTypeLabel,
  isMachineStepType,
  machineTypeVerb,
  needleTypeLabel,
  optionsFrom,
  pressClothLabel,
  threadTensionLabel,
} from './equipment-options';
// ГЛАГОЛ ЗАГОЛОВКА СПРАШИВАЕТ ВИД. Значение, а не тип: `operationHeading` — единственное место,
// где слово шага собирается, и вид обязан отвечать в нём же. Обратного импорта нет — граф
// односторонний (`operation-kinds` берёт отсюда только ТИП строки формы), цикла не возникает.
import { kindHeadingVerb } from './operation-kinds';
// ИМЯ РАБОТЫ — ЗНАЧЕНИЕ, И ЦИКЛА ЭТО НЕ ДАЁТ: `operation-work` берёт значения только у
// `operation-kinds`, а обратно к `operation-options` ходит лишь ЗА ТИПОМ. Граф остаётся
// односторонним ровно по той же причине, по которой им был импорт `kindHeadingVerb` строкой выше.
import { cutLengthNoun, workHeadingWord, type WorkCatalog } from './operation-work';
// ТОЛЬКО ТИП, И ЭТО УСЛОВИЕ, А НЕ СТИЛЬ: `schema.ts` импортирует ЗНАЧЕНИЯ отсюда, поэтому обратный
// импорт значения замкнул бы цикл в рантайме. `import type` стирается при трансформации (в
// tsconfig нет `verbatimModuleSyntax`), путь ведёт в модуль напрямую, а не через бочку с
// re-export'ом, — ребра в графе бандла не появляется.
import type { TechCardFormData } from './schema';

// The assembly-order vocabularies, in ENGLISH with the ISO numbers the trade already uses.
//
// WHY NOT RUSSIAN, and why this is not merely a translation. Half of these labels carry a NUMBER —
// 301, 504, 602, SS/LS/EF — and those are ISO 4915 (stitch types) and ISO 4916 (seam classes), which
// are not in any language at all. The sewing happens in Poland, the printed tech pack was already
// English on every column, and the editor was the one Russian island inside a tab whose own
// defaults block was labelled in English. Picking the standard codes settles the language question
// and the vocabulary question with one move.
//
// One vocabulary that is NOT here: the old free-text suggestion lists (nodeOptions, machineOptions,
// needleOptions, threadOptions). They described fields that no longer exist — machine repeated the
// operation type, needle duplicated the thread article's needle_reco, thread duplicated the linked
// BOM chip, and `node` asked a question with four different kinds of answer in its own list.

// WHAT A STEP DOES — the total dictionary, exhaustive by type (see equipment-options.ts for why
// every vocabulary in this feature is a `Record<Enum, string>` and not an array: tsc is the drift
// check this repo has no script for).
//
// THE NINE LEGACY MEMBERS LIVE HERE FOREVER. Since 0306 the read path never emits them — a
// lockstitch step comes back as (MACHINE, machine_type=lockstitch) — but a RELEASE SNAPSHOT is
// immutable protojson written with the old names, and `tech_card_release` stores the whole card as
// JSON. Dropping a member would make an archived release render its steps as blanks. They are
// deprecated on the wire, not deletable from this map.
export const OPERATION_TYPE_LABELS: Record<common_TechCardOperationType, string> = {
  TECH_CARD_OPERATION_TYPE_UNKNOWN: '— operation —',
  // 1-9: legacy, накрыты канонизацией на записи, никогда не приходят с чтения.
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: 'join — lockstitch 301',
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: 'topstitch — twin needle',
  TECH_CARD_OPERATION_TYPE_OVERLOCK: 'overlock — 504 / 514 / 516',
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: 'coverstitch — 602 / 605',
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: 'chainstitch — 401',
  TECH_CARD_OPERATION_TYPE_BLINDHEM: 'blindhem — 103',
  TECH_CARD_OPERATION_TYPE_BARTACK: 'bartack — 304',
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: 'buttonhole',
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: 'button attach',
  // 10-15: the six a step may be given today.
  TECH_CARD_OPERATION_TYPE_FUSING: 'fusing',
  TECH_CARD_OPERATION_TYPE_HANDWORK: 'hand work',
  TECH_CARD_OPERATION_TYPE_OTHER: 'other',
  TECH_CARD_OPERATION_TYPE_MACHINE: 'machine — sewn on…',
  TECH_CARD_OPERATION_TYPE_PRESS: 'press (to one side / steam)',
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: 'press open',
  // 16-24: the work that is neither sewing nor pressing. Until this wave every one of them was a
  // HANDWORK or OTHER step with the instruction typed into the note, which is why none of them had
  // a duration anybody could cost or a field anybody could check.
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: 'hardware set (rivet / snap / eyelet)',
  TECH_CARD_OPERATION_TYPE_PRINT: 'print (screen / transfer / foil)',
  // «trim» here is the ALLOWANCE — grade, clip, notch — and not the thread tails, which are their
  // own step below. Two different tools, two different moments, and the floor confuses them if the
  // sheet calls both «trim».
  TECH_CARD_OPERATION_TYPE_TRIM: 'trim allowance (grade / clip / notch)',
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: 'thread trim (tails)',
  TECH_CARD_OPERATION_TYPE_CLEAN: 'clean (spot / lint / chalk)',
  TECH_CARD_OPERATION_TYPE_INSPECT: 'inspect (QC)',
  TECH_CARD_OPERATION_TYPE_FOLD: 'fold',
  TECH_CARD_OPERATION_TYPE_PACK: 'pack',
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: 'wet process (rinse / dye / softener)',
};

// The PICKER is a curated SUBSET of the dictionary above — the label map is total because rendering
// must cover every token that can arrive, while offering a deprecated token as a choice would let
// somebody create new work in a retired vocabulary. Only the values are listed here; the labels come
// from the one map, so the picker and the printed sheet cannot say different things about a token.
//
// SIX CHOICES BECAME FIFTEEN, and the two movements are opposite in kind. The NINE THAT LEFT were
// not a simplification: they were the answer to a DIFFERENT question. «Overlock» never said what
// the step does, it said what it is done on, so the list forced «стачать» and «обметать» into one
// field and had no room at all for the machines the shop actually owns (coverlock, zigzag, the
// automats). Since 0306 the step says MACHINE and the machine picker beside it says which one —
// see equipment-options.ts.
//
// The NINE THAT ARRIVED are work that is not sewing and not pressing, and until now had exactly one
// home: a HANDWORK or OTHER step with the instruction typed into the note. Setting a rivet,
// pressing a transfer, grading an allowance, rinsing, inspecting, folding and packing each take
// time, happen in a zone and cost money, and none of them borrows a verb from a machine_type the
// way a MACHINE step does — each is its own answer to «what is done».
//
// Ordered the way the work happens, not alphabetically. The assembly verbs first (almost every step
// is machine work, and press / press open are the межоперационные steps that used to be smuggled
// into a seam class), then the processes that are their own trade — hardware, print, wet — then the
// finishing chain in the order the floor walks it: thread trim, clean, inspect, fold, pack.
// HANDWORK and OTHER stay LAST on purpose: they are the escape hatches, and an escape hatch offered
// early is an escape hatch taken early — which is precisely how these nine verbs spent years as
// free text in a note.
const OPERATION_TYPE_PICKER: common_TechCardOperationType[] = [
  'TECH_CARD_OPERATION_TYPE_UNKNOWN',
  // assembly
  'TECH_CARD_OPERATION_TYPE_MACHINE',
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  'TECH_CARD_OPERATION_TYPE_FUSING',
  'TECH_CARD_OPERATION_TYPE_TRIM',
  // processes of their own
  'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
  'TECH_CARD_OPERATION_TYPE_PRINT',
  'TECH_CARD_OPERATION_TYPE_WET_PROCESS',
  // finishing, in floor order
  'TECH_CARD_OPERATION_TYPE_THREAD_TRIM',
  'TECH_CARD_OPERATION_TYPE_CLEAN',
  'TECH_CARD_OPERATION_TYPE_INSPECT',
  'TECH_CARD_OPERATION_TYPE_FOLD',
  'TECH_CARD_OPERATION_TYPE_PACK',
  // escape hatches
  'TECH_CARD_OPERATION_TYPE_HANDWORK',
  'TECH_CARD_OPERATION_TYPE_OTHER',
];

// ЭПОХА ЧЛЕНА — ТОТАЛЬНОЙ КАРТОЙ, А НЕ НАБОРОМ, И ЭТО ПРАВИЛО ЭТОГО ФАЙЛА, а не вкус: «каждый
// словарь здесь — `Record<Enum, …>`, а не массив, потому что tsc и есть тот диффчек контракта,
// которого у репозитория нет скриптом» (шапка карты подписей выше). Рукописный `Set` был здесь
// единственным словарём, который своему же правилу не следовал, — и молчал бы ровно так же, как
// молчит любой массив: выпади из него член, никто бы не заметил.
//
// НАБОР И КАРТА ЛОВЯТ РАЗНОЕ, И ПОТОМУ КАРТА. Набор умеет сказать только «этот здесь есть»; сказать
// «а про ЭТОГО я решил, что он не легаси» он не умеет вовсе. Тотальная карта обязана назвать
// каждого члена контракта поимённо, поэтому новый член ломает СБОРКУ — до пробы дело не доходит.
// Чего она НЕ ловит — перевёрнутого значения: `false` вместо `true` компилируется молча, и это
// сторожит поимённая цитата в пробе. Два механизма, два разных отказа, ни один не лишний.
const OPERATION_TYPE_IS_LEGACY: Record<common_TechCardOperationType, boolean> = {
  TECH_CARD_OPERATION_TYPE_UNKNOWN: false,
  // Девятеро до 0306: машинка сидит В САМОМ ТИПЕ, поля `machine_type` у такой записи нет.
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: true,
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: true,
  TECH_CARD_OPERATION_TYPE_OVERLOCK: true,
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: true,
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: true,
  TECH_CARD_OPERATION_TYPE_BLINDHEM: true,
  TECH_CARD_OPERATION_TYPE_BARTACK: true,
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: true,
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: true,
  // Все прочие несут машинку своим полем и в подписи типа её не держат.
  TECH_CARD_OPERATION_TYPE_FUSING: false,
  TECH_CARD_OPERATION_TYPE_HANDWORK: false,
  TECH_CARD_OPERATION_TYPE_OTHER: false,
  TECH_CARD_OPERATION_TYPE_MACHINE: false,
  TECH_CARD_OPERATION_TYPE_PRESS: false,
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: false,
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: false,
  TECH_CARD_OPERATION_TYPE_PRINT: false,
  TECH_CARD_OPERATION_TYPE_TRIM: false,
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: false,
  TECH_CARD_OPERATION_TYPE_CLEAN: false,
  TECH_CARD_OPERATION_TYPE_INSPECT: false,
  TECH_CARD_OPERATION_TYPE_FOLD: false,
  TECH_CARD_OPERATION_TYPE_PACK: false,
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: false,
};

/** Разделитель подписи типа: слева ГЛАГОЛ, справа — факт о машине. Пробел, длинное тире, пробел. */
const TYPE_LABEL_SEPARATOR = ' — ';

/** ЧТО ПОДПИСЬ ТИПА ГОВОРИТ О МАШИНЕ СВЕРХ ГЛАГОЛА — «lockstitch 301», «twin needle», иначе пусто.
 *
 *  ЗАЧЕМ ХВОСТ, А НЕ ПОДПИСЬ ЦЕЛИКОМ. Клетка «machine / mode» отвечает на вопрос «на чём это шло»,
 *  а подпись типа начинается с ГЛАГОЛА («join — lockstitch 301»). Печатая её целиком, клетка
 *  пересказывала имя шага, которое стоит рядом своей колонкой: у семи членов повтор был не виден,
 *  потому что к нему приклеен настоящий факт, а у `buttonhole` и `button attach` подпись РАВНА
 *  глаголу байт в байт — и бумага печатала одно слово в двух соседних полях. Хвост убирает повтор
 *  у всех девяти разом и делает легаси-клетку той же формы, что современная: у современного шага
 *  там стоит «zigzag 304», у легаси теперь «lockstitch 301», а не «join — lockstitch 301».
 *
 *  ПЕРЕЧИСЛЕНИЕ У ОВЕРЛОКА (`504 / 514 / 516`) ОСТАВЛЕНО НАРОЧНО, и это не та же ошибка, против
 *  которой заведён `machineTypeLabelWithStitch`. Там довод был «номер стежка конкретный, а не
 *  перечисление: три номера предлагали оператору выбрать стежок самому» — но там машинка НАЗВАНА
 *  полем, и число ниток шага говорит, который из трёх; перечисление было отказом этим
 *  воспользоваться. У записи до 0306 машинка не названа НИГДЕ: `stitchTypeNumber` ключуется на
 *  `machineType`, которого у такой записи не существует. Три номера здесь — честный отчёт о
 *  недосказанной записи, а не лень. Сузить до одного можно только через карту «легаси-тип → тип
 *  машинки», то есть нашу копию серверной канонизации 0306, которой мы не видим, — а такая копия
 *  хуже трёх номеров: она разошлась бы с сервером молча.
 *
 *  ДВА ЧЛЕНА ОТВАЛИВАЮТСЯ САМИ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ: у петли и пришивания пуговицы подпись не
 *  говорит о машине НИЧЕГО сверх глагола, поэтому хвоста у них нет, и клетка честно пуста — ровно
 *  как была до переезда. Отдельным списком исключений это записывать не надо: список исключений
 *  разошёлся бы с подписями, а хвост выводится из них. */
export function legacyMachineFact(operationType?: string): string {
  const t = operationType as common_TechCardOperationType | undefined;
  if (!t || !OPERATION_TYPE_IS_LEGACY[t]) return '';
  const label = OPERATION_TYPE_LABELS[t] ?? '';
  const at = label.indexOf(TYPE_LABEL_SEPARATOR);
  return at < 0 ? '' : label.slice(at + TYPE_LABEL_SEPARATOR.length).trim();
}

/** Легаси-члены поимённо — только для ФИКСТУРЫ ПРОБЫ, чтобы цитата перечисляла их не своей копией
 *  списка, а тем же источником, из которого читает экран. */
export const LEGACY_OPERATION_TYPES: ReadonlyArray<common_TechCardOperationType> = (
  Object.keys(OPERATION_TYPE_IS_LEGACY) as common_TechCardOperationType[]
).filter((t) => OPERATION_TYPE_IS_LEGACY[t]);

export const operationTypeOptions: Array<{ value: common_TechCardOperationType; label: string }> =
  OPERATION_TYPE_PICKER.map((value) => ({ value, label: OPERATION_TYPE_LABELS[value] }));

// The picker for ONE row, which is the same list plus whatever that row already holds. A legacy
// token cannot arrive off the wire any more (the server canonicalises on write and never emits one),
// but it CAN come back from a localStorage draft written before this bundle — and a select whose
// value is absent from its own items renders BLANK, so the row would report «no type» on a step
// that has one and quietly re-save as unknown. Same defensive shape as the sketch-pin picker.
export function operationTypeOptionsFor(
  current?: string,
): Array<{ value: common_TechCardOperationType; label: string }> {
  const v = (current ?? '') as common_TechCardOperationType;
  if (!v || OPERATION_TYPE_PICKER.includes(v)) return operationTypeOptions;
  return [
    ...operationTypeOptions,
    { value: v, label: `${OPERATION_TYPE_LABELS[v] ?? v} — legacy, pick a current type` },
  ];
}

// WHERE on the garment — and the reason the free-text `placement` could go. The three material
// bands stay at the top because a step genuinely can be about the lining AS A LAYER; the garment
// areas follow. Same eighteen tokens the fitting change-request zone uses, from one server-side
// vocabulary.
//
// ТОТАЛЬНАЯ КАРТА, А НЕ МАССИВ ПАР, И ЭТО СТОРОЖ, А НЕ СТИЛЬ. Пока здесь лежал
// `Array<{value,label}>`, ПОЛНОТУ НЕ ПРОВЕРЯЛ НИКТО: член зоны, приехавший бампом прото,
// собирался бы молча и просто не появлялся в пикере — а технолог, не найдя глазами зону,
// которая в контракте есть, читает это как сломанный экран, а не как отставший клиент. Диффа
// клиента против контракта в репозитории нет (см. шапку equipment-options.ts), поэтому диффом
// работает tsc — и работать он может только над `Record<Enum, …>`.
//
// ПОРЯДОК ПУНКТОВ ВЫБРАН ГЛАЗАМИ И ЖИВЁТ В ПОРЯДКЕ КЛЮЧЕЙ: три материальных слоя, затем корпус
// сверху вниз (перёд, спинка, плечо, грудь, талия, бедро), рукав с проймой, горловина с
// воротником, низ, застёжка, «прочее» последним. В САМОМ ПЕРЕЧИСЛЕНИИ порядок другой — там OTHER
// объявлен четвёртым, а FRONT последним, — так что «причесать» карту по контракту значит молча
// перетасовать пикер и печатный лист (tech-pack-document обходит зоны в этом же порядке).
export const GARMENT_ZONE_LABELS: Record<common_TechCardGarmentZone, string> = {
  TECH_CARD_GARMENT_ZONE_UNKNOWN: '— zone —',
  // материальные слои: шаг бывает про подклад КАК СЛОЙ, а не про место на изделии
  TECH_CARD_GARMENT_ZONE_OUTER: 'outer shell',
  TECH_CARD_GARMENT_ZONE_LINING: 'lining',
  TECH_CARD_GARMENT_ZONE_INTERLINING: 'interlining',
  // корпус сверху вниз
  TECH_CARD_GARMENT_ZONE_FRONT: 'front',
  TECH_CARD_GARMENT_ZONE_BACK: 'back',
  TECH_CARD_GARMENT_ZONE_SHOULDER: 'shoulder',
  TECH_CARD_GARMENT_ZONE_CHEST: 'chest',
  TECH_CARD_GARMENT_ZONE_WAIST: 'waist',
  TECH_CARD_GARMENT_ZONE_HIP: 'hip',
  // рукав, горловина, низ, застёжка
  TECH_CARD_GARMENT_ZONE_SLEEVE: 'sleeve',
  TECH_CARD_GARMENT_ZONE_ARMHOLE: 'armhole',
  TECH_CARD_GARMENT_ZONE_COLLAR: 'collar',
  TECH_CARD_GARMENT_ZONE_NECKLINE: 'neckline',
  TECH_CARD_GARMENT_ZONE_HEM: 'hem',
  TECH_CARD_GARMENT_ZONE_POCKET: 'pocket',
  TECH_CARD_GARMENT_ZONE_CLOSURE: 'closure',
  // запасной выход — последним, чтобы его не брали первым
  TECH_CARD_GARMENT_ZONE_OTHER: 'other',
};

export const zoneOptions: Array<{ value: common_TechCardGarmentZone; label: string }> =
  optionsFrom(GARMENT_ZONE_LABELS);

// ISO 4916, grouped by its six families. The old Russian list held «стачной взаутюжку» and «стачной
// вразутюжку» as two entries — one class pressed two ways — so the field answered two questions with
// one value. The pressing DIRECTION is a step of its own since 0306 — PRESS (заутюжить) and
// PRESS_OPEN (разутюжить) — not a seam class, and no longer prose on the card's defaults either.
//
// ТОТАЛЬНАЯ КАРТА ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО И ЗОНА, и здесь цена промаха выше: класс шва уходит НА
// БУМАГУ ДЛЯ ФАБРИКИ. Новый член ISO, доехавший бампом прото, при массиве пар не появился бы в
// пикере вовсе — шаг получил бы соседний класс или «other», и это прочли бы как решение технолога,
// а не как отставший бандл.
//
// ПОРЯДОК — ПО СЕМЕЙСТВАМ ISO 4916 (SS → LS → EF → BS → FS → OS, «прочее» последним), а не по
// алфавиту. Сегодня он совпадает с порядком членов в контракте, и это совпадение, а не правило:
// порядок обязан оставаться семейным, даже если следующий бамп объявит члены иначе.
export const SEAM_CLASS_LABELS: Record<common_TechCardSeamClass, string> = {
  TECH_CARD_SEAM_CLASS_UNKNOWN: '— inherit —',
  TECH_CARD_SEAM_CLASS_SS_PLAIN: 'SS — plain seam',
  TECH_CARD_SEAM_CLASS_SS_FRENCH: 'SS — French seam',
  TECH_CARD_SEAM_CLASS_LS_LAPPED: 'LS — lapped / topstitched',
  TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED: 'LS — flat-felled',
  TECH_CARD_SEAM_CLASS_EF_HEM_RAW: 'EF — hem, raw edge',
  TECH_CARD_SEAM_CLASS_EF_HEM_TURNED: 'EF — hem, turned twice',
  TECH_CARD_SEAM_CLASS_EF_FACED: 'EF — faced',
  TECH_CARD_SEAM_CLASS_BS_BOUND: 'BS — bound',
  TECH_CARD_SEAM_CLASS_FS_FLAT: 'FS — flat / butted',
  // «соединительного шва нет вовсе» — требует непустого topstitch.mode, см. контракт
  TECH_CARD_SEAM_CLASS_OS_TOPSTITCH: 'OS — ornamental topstitch',
  TECH_CARD_SEAM_CLASS_OTHER: 'other',
};

export const seamClassOptions: Array<{ value: common_TechCardSeamClass; label: string }> =
  optionsFrom(SEAM_CLASS_LABELS);

// КЛАСС ШВА СЛОВАМИ — '' у UNKNOWN («наследовать») и у токена, о котором этот бандл ничего не знает.
// Ровно та же форма, что у `attachmentKindLabel` ниже, и по тем же двум доводам: строку эту зовут
// экраны, держащие перечисления СТРОКАМИ формы, а сырой «TECH_CARD_SEAM_CLASS_…» на глазах хуже
// пустоты — пустота видимо неполна, токен выглядит ответом.
//
// ЗАВЕДЁН ПОТОМУ, ЧТО ЕГО НЕ БЫЛО: карта примерки и редактор искали ярлык каждый своим
// `seamClassOptions.find(...)` с собственной проверкой UNKNOWN. Расходились они пока не в тексте —
// карта у обоих одна, — но два поиска по одному массиву это две редакции одного правила, и первая
// же ступень, дописанная в одну из них, стала бы третьим прочтением одного поля.
//
// РЕЛИЗНЫЙ СНАПШОТ ЭТОТ ЯРЛЫК НЕ ЗОВЁТ, И ЭТО РЕШЕНИЕ. Панели релизов нужен ДРУГОЙ фолбэк —
// незнакомый токен печатается токеном, — потому что подписанный документ не имеет права потерять
// строку, которую кто-то подписал. Живым поверхностям нужен этот. Две разные потребности, две
// функции; см. `seamClassLabel` в releases-field.tsx.
export const seamClassLabel = (v?: string): string =>
  !v || v === 'TECH_CARD_SEAM_CLASS_UNKNOWN'
    ? ''
    : (SEAM_CLASS_LABELS[v as common_TechCardSeamClass] ?? '');

// THERE IS A «NONE» NOW, AND IT IS NOT A SPELLING OF UNKNOWN. The old comment here said the
// opposite — «none» and «not specified» are one fact — and it was true for exactly as long as
// nothing sat above the step to inherit from. Since the card carries machine profiles (0306),
// UNKNOWN means «take the profile's foot» and a step had no way left to say «this one runs bare».
// NONE is that sentence, and the labels have to keep the two distinguishable on screen.
//
// `walking_foot` is deliberately not here: in an industrial shop that is a machine with a unison /
// top feed — a property of the transport, not a snap-on foot fitted per step.
export const ATTACHMENT_KIND_LABELS: Record<common_TechCardAttachmentKind, string> = {
  TECH_CARD_ATTACHMENT_KIND_UNKNOWN: '— inherit —',
  TECH_CARD_ATTACHMENT_KIND_NONE: 'no foot / bare',
  TECH_CARD_ATTACHMENT_KIND_BINDER: 'binder',
  TECH_CARD_ATTACHMENT_KIND_HEMMER_FOLDER: 'hemmer folder',
  TECH_CARD_ATTACHMENT_KIND_SCROLL_FOOT: 'scroll foot',
  TECH_CARD_ATTACHMENT_KIND_ZIPPER_FOOT: 'zipper foot',
  TECH_CARD_ATTACHMENT_KIND_INVISIBLE_ZIPPER_FOOT: 'invisible zipper foot',
  TECH_CARD_ATTACHMENT_KIND_EDGE_GUIDE: 'edge guide',
  TECH_CARD_ATTACHMENT_KIND_PIPING_FOOT: 'piping foot',
  TECH_CARD_ATTACHMENT_KIND_ELASTIC_ATTACHMENT: 'elastic attachment',
  TECH_CARD_ATTACHMENT_KIND_TEFLON_FOOT: 'teflon foot',
  TECH_CARD_ATTACHMENT_KIND_ROLLER_FOOT: 'roller foot',
  TECH_CARD_ATTACHMENT_KIND_OTHER: 'other',
};

export const attachmentOptions: Array<{ value: common_TechCardAttachmentKind; label: string }> =
  optionsFrom(ATTACHMENT_KIND_LABELS);

// '' for UNKNOWN («inherit»), the real label for NONE («runs bare») — the two are different facts
// since the card grew machine profiles, and a helper that folded them together would put the word
// «none» on a step that simply inherits the profile's foot. Takes a plain string for the reason
// spelled out over the equipment helpers: the form holds these enums as strings.
export const attachmentKindLabel = (v?: string): string =>
  !v || v === 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN'
    ? ''
    : (ATTACHMENT_KIND_LABELS[v as common_TechCardAttachmentKind] ?? '');

// ОДНА КАРТА НА ВЕСЬ РЕЖИМ ОТСТРОЧКИ: как он называется, есть ли у него число, ОБЯЗАТЕЛЬНО ли оно и
// ОТ КАКОЙ ЛИНИИ меряется. Четыре вопроса — один ответ на член перечисления.
//
// ПОЧЕМУ СПИСОК СЖАЛСЯ ДО ТРЁХ. Владелец — практикующий технолог — прочитал пикер и спросил, чем
// «at the edge» отличается от «at width from the edge», если «по краю» — тот же приём, просто без
// числа. Он прав: это никогда не были два приёма. Настоящая структура — ДВЕ ОСИ: от чего меряем
// (край детали / линия шва) и названо ли число, — а `EDGE` и `WIDTH` занимали одну и ту же клетку
// этой сетки дважды. Поэтому `WIDTH` снят из САМОГО КОНТРАКТА (переносить нечего: колонка пуста во
// всех строках на обеих средах, ни один релиз её не подписывал), а число переехало к `EDGE`:
//
//   at the edge          — отступ НЕОБЯЗАТЕЛЕН. Задан — столько-то мм от края; пуст — вплотную.
//   in the ditch         — числа нет вовсе; сервер отвергает его прямо.
//   parallel to the seam — отступ ОБЯЗАТЕЛЕН и меряется от ЛИНИИ ШВА, а на настрочном или
//                          запошивочном шве это не та же линия, что готовый край.
//
// ОДНА КАРТА, А НЕ ЧЕТЫРЕ СПИСКА. «Есть ли число», «обязательно ли», «от чего меряют» и «как это
// называется» имеют одни и те же члены и не имеют права разойтись, поэтому отвечаются в одном
// месте: подпись поля, печатный лист, карта сборки, отказ zod и сам пикер читают эту карту — и ни
// один из них не может назвать линию или правило, отличные от остальных.
//
// НЕВЕРНОЕ СОСТОЯНИЕ ЗДЕСЬ НЕВЫРАЗИМО, а не просто не написано: у `need: 'none'` ПОЛЯ `datum` НЕТ
// (режим без числа не может назвать линию), а два режима с числом не могут линию не назвать.
//
// ТОТАЛЬНЫЙ `Record`, а не массив, по той же причине, что и всякий словарь этой фичи (см. шапку
// equipment-options.ts): диффа клиента против контракта в репозитории нет, поэтому диффом работает
// tsc — член, добавленный бампом прото, не соберётся, пока его здесь не классифицируют, и до этого
// момента пикер его не предложит.
//
// `null` ЗНАЧИТ «ЭТОТ БАНДЛ НИЧЕГО НЕ УТВЕРЖДАЕТ» — третье состояние, ради которого существуют
// предикаты ниже. Его получает снятый член, пока сгенерированные типы всё ещё его несут, и ведёт
// себя он ровно как токен, о котором бандл не слышал вовсе, — обычное состояние проекта между
// выкаткой бэка и выкаткой клиента. Сказанное как «нет числа», а не как «не знаю», это ломало три
// вещи молча: редактор стирал отступ и число рядов ПРИ ОТКРЫТИИ шага (с shouldDirty, так что
// следующее сохранение записывало потерю), схема отвергала шаг, а с ним и всю карточку, а маппер
// ронял число по дороге на провод.
type TopstitchModeSpec = { readonly label: string } & (
  | { readonly need: 'none' }
  | { readonly need: 'optional' | 'required'; readonly datum: string }
);

export const TOPSTITCH_MODES: Record<common_TechCardTopstitchMode, TopstitchModeSpec | null> = {
  // «отстрочки нет» — числу не к чему принадлежать.
  TECH_CARD_TOPSTITCH_MODE_UNKNOWN: { label: '— none —', need: 'none' },
  // ОТ КРАЯ ДЕТАЛИ, и число НЕОБЯЗАТЕЛЬНО: заполнено — отступ в мм от края, пусто — строчка идёт
  // вплотную к краю. Это и есть тот единственный приём, который прежде стоял в списке дважды.
  TECH_CARD_TOPSTITCH_MODE_EDGE: { label: 'at the edge', need: 'optional', datum: 'the edge' },
  // Утоплена в сам шов: расстояние ноль по определению, и число здесь было бы числом ни о чём —
  // сервер отвергает его прямо.
  TECH_CARD_TOPSTITCH_MODE_IN_DITCH: { label: 'in the ditch', need: 'none' },
  // Число ОБЯЗАТЕЛЬНО, и это НЕ то же число, что у края: меряется оно от ЛИНИИ ШВА. «Параллельно»
  // без расстояния — не инструкция, поэтому пустым этот режим не бывает.
  TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM: {
    label: 'parallel to the seam',
    need: 'required',
    datum: 'the seam line',
  },
};

/** Что бандл ЗНАЕТ про режим — или `null`, если не знает ничего (член новее бандла либо снятый).
 *  Единственный вход в карту: всё, что ниже, читает её только отсюда. */
const topstitchSpec = (mode?: string): TopstitchModeSpec | null =>
  TOPSTITCH_MODES[mode as common_TechCardTopstitchMode] ?? null;

// ПРЕДЛАГАЕМЫЙ СПИСОК — ВЫВОД ИЗ КАРТЫ, а не второй её экземпляр. Снятый член (`null`) не попадает
// в пикер никогда и ни при каких данных, а член, добавленный бампом прото, попадёт в него ровно
// тогда, когда его классифицируют выше, — то есть на том же коммите, на котором он вообще
// соберётся. Списка, который можно забыть обновить, здесь больше нет.
export const topstitchModeOptions: Array<{ value: common_TechCardTopstitchMode; label: string }> = (
  Object.entries(TOPSTITCH_MODES) as Array<[common_TechCardTopstitchMode, TopstitchModeSpec | null]>
)
  .filter((e): e is [common_TechCardTopstitchMode, TopstitchModeSpec] => e[1] !== null)
  .map(([value, spec]) => ({ value, label: spec.label }));

/** Пикер для ОДНОГО шага: весь список плюс то, что в шаге уже лежит. Та же оборонительная форма,
 *  что у operationTypeOptionsFor, и теперь у неё два повода: токен вне списка — это либо режим
 *  НОВЕЕ этого бандла (обычное состояние между выкаткой бэка и выкаткой клиента), либо снятый
 *  `WIDTH` из записи, сделанной до волны. Radix рисует значение, которого нет среди его items,
 *  ПУСТЫМ триггером — и без этой добавки строка читалась бы как «отстрочки нет» на шаге, где она
 *  есть, а редактор пишет форму обратно при сохранении, так что именно это прочтение и записалось
 *  бы. Пункт появляется ТОЛЬКО для записи, которая уже несёт такой токен: выбрать его из списка
 *  нельзя — его там нет. */
export function topstitchModeOptionsFor(
  current?: string,
): Array<{ value: common_TechCardTopstitchMode; label: string }> {
  const v = (current ?? '') as common_TechCardTopstitchMode;
  if (!v || topstitchModeOptions.some((o) => o.value === v)) return topstitchModeOptions;
  return [...topstitchModeOptions, { value: v, label: `${v} — unknown to this app version` }];
}

/** РЕЖИМ ПРИНИМАЕТ ЧИСЛО: рисовать поле отступа, печатать его, пропускать через схему. Про режим,
 *  о котором бандл ничего не утверждает, ответ `false` — безопасная сторона: одного контрола нет,
 *  и ничего не тронуто. */
export const topstitchModeTakesWidth = (mode?: string): boolean => {
  const spec = topstitchSpec(mode);
  return spec !== null && spec.need !== 'none';
};

/** РЕЖИМ ОТВЕРГАЕТ ЧИСЛО — единственная лицензия ОЧИСТИТЬ, ОТКАЗАТЬ или УРОНИТЬ отступ. Не
 *  `!topstitchModeTakesWidth`: неизвестный токен отвечает `false` ОБОИМ, и это третье состояние —
 *  весь смысл того, что предикатов два, а не один. */
export const topstitchModeRefusesWidth = (mode?: string): boolean =>
  topstitchSpec(mode)?.need === 'none';

/** РЕЖИМ ТРЕБУЕТ ЧИСЛО. Отдельный вопрос от «принимает»: у края число необязательно (пусто значит
 *  «вплотную»), у параллели — обязательно, и требовать его у края было бы формой, спорящей с
 *  сервером, который его как раз принимает. */
export const topstitchModeNeedsWidth = (mode?: string): boolean =>
  topstitchSpec(mode)?.need === 'required';

/** ЛИНИЯ, ОТ КОТОРОЙ МЕРЯЕТ ЭТОТ РЕЖИМ, в словах, которыми её зовут все поверхности — «the edge»,
 *  «the seam line», — и '' у режима без расстояния (и у токена, которого бандл не знает). Четырём
 *  вызывающим она нужна в четырёх разных предложениях — подпись поля, отказ, ячейка листа, карта
 *  сборки, — а предложение как раз и нельзя делить, поэтому делится существительное. */
export const topstitchDatumOf = (mode?: string): string => {
  const spec = topstitchSpec(mode);
  return spec && spec.need !== 'none' ? spec.datum : '';
};

/** ПОДПИСЬ ПОЛЯ ОТСТУПА, сказанная под тот режим, в котором шаг сейчас стоит, — «topstitch distance
 *  from the edge, mm» или «… from the seam line, mm». «distance», а не «width»: у шага уже есть
 *  вторая ширина (`stitch_width_mm`, амплитуда зигзага / захват оверлока), и «width» не называла ни
 *  которая из двух это, ни от чего она меряется. Фолбэк без линии достижим только для режима,
 *  который бандл классифицировать не может, — там поле и не рисуется, — и остаётся честным вместо
 *  того, чтобы выдумать линию. */
export const topstitchWidthLabel = (mode?: string): string => {
  const datum = topstitchDatumOf(mode);
  return datum ? `topstitch distance from ${datum}, mm` : 'topstitch distance, mm';
};

/** ЧТО ЗНАЧИТ ПУСТОЕ ПОЛЕ — и только там, где пустым его оставить МОЖНО. Ровно этот вопрос владелец
 *  и задал списку: «по краю» и «на столько-то от края» были двумя пунктами, потому что пустоте
 *  негде было значить «вплотную». Теперь ей есть где, и это надо сказать вслух: незаполненное
 *  числовое поле само по себе читается как «забыли», а не как ответ. Слова — из той же карты. */
export const topstitchBlankMeans = (mode?: string): string => {
  const spec = topstitchSpec(mode);
  return spec && spec.need === 'optional'
    ? `leave empty and the stitch runs flush along ${spec.datum}`
    : '';
};

/** РАССТОЯНИЕ В ЧЕРНИЛАХ — «6 mm from the edge» / «6 mm from the seam line», а без числа, там где
 *  число необязательно, — «at the edge»: строчка идёт по самому краю, и это ПОЛНАЯ инструкция, а не
 *  пропуск. Пусто у режима без расстояния и у режима, требующего число, но его не получившего:
 *  расстояние без линии рядом хуже, чем никакого, — цех не видит, что чего-то не хватает. */
export const topstitchDistanceText = (mode?: string, widthMm?: string): string => {
  const spec = topstitchSpec(mode);
  if (!spec || spec.need === 'none') return '';
  const v = (widthMm ?? '').trim();
  if (v) return `${v} mm from ${spec.datum}`;
  return spec.need === 'optional' ? `at ${spec.datum}` : '';
};

/** ВСЯ ОТСТРОЧКА ОДНОЙ ФРАЗОЙ — для печатного листа и карты сборки, чтобы бумага и схема не могли
 *  сказать про один шаг разное. Расстояние, если оно есть, иначе имя режима: «in the ditch» несёт
 *  инструкцию целиком и без всяких миллиметров, а прежде обе поверхности молчали о нём — лист
 *  печатал голое «topstitch», схема не печатала ничего. Пусто для «отстрочки нет» и для токена, о
 *  котором бандл ничего не утверждает: назвать чужой режим своими словами хуже, чем промолчать. */
export const topstitchPhrase = (mode?: string, widthMm?: string): string => {
  if (!mode || mode === 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN') return '';
  const spec = topstitchSpec(mode);
  if (!spec) return '';
  return topstitchDistanceText(mode, widthMm) || spec.label;
};

/** ВСЯ СТРОЧКА ЦЕЛИКОМ — СУЩЕСТВИТЕЛЬНОЕ, СКОЛЬКО РЯДОВ И ГДЕ: «topstitch 2 × 6 mm from the edge».
 *
 *  ПОЧЕМУ НЕ ХВАТИЛО `topstitchPhrase`. Та отвечает на вопрос «где строчить» и ровно на него; слово
 *  «topstitch» и множитель рядов собирались ПОСЛЕ неё, руками, и собирались ДВАЖДЫ — на печатном
 *  листе и на карте примерки. Совпасть они не могли по построению: `topstitch.rows` знал только
 *  лист. Технолог, глядя на карту примерки, видел одну строчку там, где швея по листу прокладывала
 *  две, — а число рядов это поле, которое человек заполняет руками (контрол «rows of topstitching»
 *  стоит в зоне свойств вида) и которое поэтому обязано быть видно везде, где строчка называется.
 *
 *  РЯД ОДИН — НЕ ПЕЧАТАЕТСЯ. Контракт считает незаполненное число одним рядом, значит «1 ×» и
 *  пустота — один факт, и чернил заслуживает только один из них. Тот же довод, что у `× N` в
 *  `stepPlacementText`.
 *
 *  РЕЖИМ БЕЗ ФРАЗЫ ВСЁ РАВНО НАЗЫВАЕТСЯ СЛОВОМ. Режим новее бандла (или снятый) фразы не даёт, и
 *  здесь остаётся голое «topstitch»: НЕПОЛНО — и это видно, — вместо молчания, которое читается как
 *  «строчки нет». Правило пришло с печатного листа, где было записано дословно; карта примерки
 *  молчала, то есть теряла факт целиком, и общий составитель переносит на неё лучшую половину. */
export const topstitchLine = (mode?: string, widthMm?: string, rows?: number): string => {
  if (!mode || mode === 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN') return '';
  const n = rows ?? 0;
  const multiplier = n > 1 ? `${n} × ` : '';
  return `topstitch ${multiplier}${topstitchPhrase(mode, widthMm)}`.trim();
};

// THE VERB OF A STEP HEADING — total, not `Partial`, and that change is the point: as a Partial this
// map went silently blank on every token the contract added, which is precisely what a bump is
// supposed to surface. UNKNOWN maps to '' because a step with no type has no verb to speak.
//
// MACHINE's verb here is the FALLBACK, used only while the machine is still unpicked: a machine
// step's verb comes from its machine_type (MACHINE_TYPE_VERB), because otherwise every seam, hem,
// buttonhole and zip on the card would read «machine». operationHeading does that lookup, and it is
// the ONE place a step heading is composed — the four callers all go through it.
const OPERATION_TYPE_VERB: Record<common_TechCardOperationType, string> = {
  TECH_CARD_OPERATION_TYPE_UNKNOWN: '',
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: 'join',
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: 'topstitch',
  TECH_CARD_OPERATION_TYPE_OVERLOCK: 'overlock',
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: 'coverstitch',
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: 'chainstitch',
  TECH_CARD_OPERATION_TYPE_BLINDHEM: 'blindhem',
  TECH_CARD_OPERATION_TYPE_BARTACK: 'bartack',
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: 'buttonhole',
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: 'button attach',
  TECH_CARD_OPERATION_TYPE_FUSING: 'fuse',
  TECH_CARD_OPERATION_TYPE_HANDWORK: 'hand',
  TECH_CARD_OPERATION_TYPE_OTHER: 'step',
  TECH_CARD_OPERATION_TYPE_MACHINE: 'machine',
  TECH_CARD_OPERATION_TYPE_PRESS: 'press',
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: 'press open',
  // The nine verbs of this wave DO carry their own word: unlike MACHINE they have no second axis to
  // borrow one from, so what stands here is what the heading says. «set hardware» rather than the
  // machine verb «attach hardware» (that one is a sewn-on attachment, this one is clinched or
  // pressed), and «trim allowance» / «trim threads» kept apart for the reason their labels are.
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: 'set hardware',
  TECH_CARD_OPERATION_TYPE_PRINT: 'print',
  TECH_CARD_OPERATION_TYPE_TRIM: 'trim allowance',
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: 'trim threads',
  TECH_CARD_OPERATION_TYPE_CLEAN: 'clean',
  TECH_CARD_OPERATION_TYPE_INSPECT: 'inspect',
  TECH_CARD_OPERATION_TYPE_FOLD: 'fold',
  TECH_CARD_OPERATION_TYPE_PACK: 'pack',
  // The kind of bath is the step's own required field (rinse / enzyme / dye / softener), so the
  // heading states the family and lets the field say which one.
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: 'wet-process',
};

export function zoneLabel(zone?: common_TechCardGarmentZone): string {
  if (!zone || zone === 'TECH_CARD_GARMENT_ZONE_UNKNOWN') return '';
  return zoneOptions.find((z) => z.value === zone)?.label ?? '';
}

// THE STEP HEADING IS COMPOSED, NEVER TYPED — this function is the whole replacement for the removed
// «УЗЕЛ / ЧТО *» field. A working pattern-maker could not fill that field and asked whether it was
// needed; the answer is that everything it was trying to say is already in the three controls next
// to it, so the heading is derived from them and reads the same on every card.
//
// «join · side seams · Front + Back». Falls back to the first line of the note for the steps the
// formula cannot describe (hand work, «other» in an «other» zone) — one escape hatch, no new field.
//
// THE VERB OF A MACHINE STEP COMES FROM THE MACHINE (0306). `machineType` is optional because a
// heading is also built from archived release snapshots, where a step still carries a legacy type
// that names its own machine — those keep the verb they always had.
//
// РАБОТА (0330) СПРАШИВАЕТСЯ РАНЬШЕ ВСЕХ — И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ШАГ ПОЛУЧАЕТ ИМЯ. Строка,
// у которой работа названа, зовётся подписью каталога везде разом: рельс, редактор, печатный лист,
// карта примерки, схема сборки, ссылки жалоб, архив релизов. Строка без работы зовётся сегодняшней
// деривацией — двоекодье переходного периода живёт ровно здесь, лестницей ниже, а не восемью
// копиями по экранам. Восьми копий и боимся: остаток, названный в R6, был именно таким — шаг с
// классом шва отстрочки, которому назначили работу без пункта, продолжал зваться отстрочкой во
// всех заголовках, потому что заголовок про работу не спрашивал.
export function operationHeading(args: {
  operationType?: common_TechCardOperationType;
  machineType?: common_TechCardMachineType;
  zone?: common_TechCardGarmentZone;
  pieceNames: string[];
  note?: string;
  /**
   * КЛАСС ШВА — НЕ УКРАШЕНИЕ ЗАГОЛОВКА, А ЯКОРЬ ВИДА. Отстрочка на одноигольной несёт машинку
   * `lockstitch`, чей глагол буквально «join», — и без этого поля заголовок называл бы её «join»,
   * пока пикер вида называет её «topstitch». Необязательно: заголовок собирается и по архивному
   * снапшоту, где спрашивать нечего, и там лестница ниже уже права.
   */
  seamClass?: string;
  /**
   * Токен работы из строки шага (`TechCardOperation.work`). Пусто или `undefined` — работы нет.
   *
   * ОБЯЗАТЕЛЬНЫЙ, ХОТЬ И ПУСТОЙ. Дефект, ради которого заведена R8, состоит РОВНО в том, что экран
   * зовёт композитор, не спрашивая работу; необязательное поле позволяет это молча, а компилятор
   * молчит вместе с ним. Восьмой экран, который однажды заведут, обязан либо привезти работу, либо
   * НАПИСАТЬ `undefined` — то есть сказать вслух, что называет шаг по-старому.
   */
  work: string | undefined;
  /**
   * Каталог работ, если он доехал до этого экрана. `undefined` или каталог не с сервера — имя
   * деградирует до СЕГОДНЯШНЕГО поведения (снимок бандла знает 49 работ из 53), а незнакомая
   * работа доезжает до глаз ТОКЕНОМ. Пустоты не бывает ни в одном из трёх случаев.
   *
   * Обязательный по той же причине, что и `work`: имя без каталога — решение, а не умолчание.
   */
  workCatalog: WorkCatalog | undefined;
}): string {
  const typeVerb = args.operationType ? (OPERATION_TYPE_VERB[args.operationType] ?? '') : '';
  // ВИД СПРАШИВАЕТСЯ ПЕРВЫМ, и отвечает он только там, где говорит больше второй оси.
  const kindVerb = kindHeadingVerb({
    operationType: args.operationType,
    machineType: args.machineType,
    seamClass: args.seamClass,
  });
  // РАБОТА БЬЁТ ОБЕ ВЫВЕДЕННЫЕ ЛЕСТНИЦЫ. Она НАЗВАНА человеком и хранится, а они выведены из
  // соседних полей; давать выведенному перебить записанное значило бы называть шаг словом, которое
  // технолог не выбирал, — ровно тот дефект, что R8 закрывает.
  const workWord = workHeadingWord(args.workCatalog, args.work);
  const verb =
    workWord ||
    kindVerb ||
    (args.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE'
      ? machineTypeVerb(args.machineType) || typeVerb
      : typeVerb);
  const zone = zoneLabel(args.zone);
  const parts = [verb, zone].filter(Boolean);
  if (args.pieceNames.length > 0) parts.push(args.pieceNames.join(' + '));
  const composed = parts.join(' · ');
  const meaningful = verb && verb !== 'step' && verb !== 'hand';
  if (composed && (meaningful || zone || args.pieceNames.length > 0)) return composed;
  const firstNoteLine = (args.note ?? '').trim().split('\n')[0]?.trim();
  return firstNoteLine || composed || 'step';
}

// THE STITCH LENGTH IS NOT STORED (§10). The card records DENSITY in stitches per cm and the length
// in mm is `10 / density`, computed wherever it is shown and written into no field at all — a second
// column would be a second truth, and the two would disagree the first time somebody edited one.
// One implementation of that division, because it is shown in three places (the editor's mirror
// input, its inherited placeholder, and the printed sheet) and three copies of a formula is how the
// paper ends up rounding differently from the screen.
export function stitchLengthMm(density?: string): string {
  const n = parseDecimalNumber(density);
  return Number.isFinite(n) && n > 0 ? String(Math.round((10 / n) * 10) / 10) : '';
}

// DENSITY AND LENGTH AS ONE READING — «4 st/cm (2.5 mm)». They are the same setting in the two units
// the floor uses, and quoting only the density means the operator with a stitch-length dial converts
// it in their head at the machine. The pair is printed everywhere the density is.
export function densityText(density?: string): string {
  const d = (density ?? '').trim();
  if (!d) return '';
  const mm = stitchLengthMm(d);
  return mm ? `${d} st/cm (${mm} mm)` : `${d} st/cm`;
}

// ПРИПУСК ОДНИМ ЧТЕНИЕМ — «allowance 10 mm», «allowance 12 mm (card)», «allowance 15 mm (workshop)».
//
// ЗАЧЕМ СОСТАВИТЕЛЬ. Тот же довод, что у `densityText` строкой выше, только дефект был вдвое хуже.
// Одно поле читалось РУКАМИ на двух экранах и читалось по-разному: карта примерки печатала
// «SA 10 mm», редактор — «allowance 10 mm». Это была меньшая половина.
//
// БОЛЬШАЯ — В ТОМ, ЧТО ЭКРАНЫ ХОДИЛИ ПО РАЗНЫМ ЛЕСТНИЦАМ. Припуск хранится ТОЛЬКО там, где шаг его
// ПЕРЕОПРЕДЕЛЯЕТ: пустая колонка значит «возьми стандарт карточки, а нет его — цеховой», и сервер
// унаследованную половину не материализует никогда (§3, тот же довод, по которому заведён
// `effectiveMachineSettings`). Редактор лестницу знал, карта — нет: шаг, ИСПРАВНО наследующий
// припуск, показывал число в редакторе и НЕ ПОКАЗЫВАЛ НИЧЕГО на карте примерки. Технолог, стоящий
// над образцом с булавкой, читал пустоту как «припуск не назначен».
//
// ПОЭТОМУ ЛЕСТНИЦА ВНУТРИ, А НЕ СНАРУЖИ. Составитель, умеющий только назвать собственное значение
// шага, оставил бы вторую поверхность ре-выводить лестницу самостоятельно — то есть ровно то, что
// сейчас чинится, только с общей функцией посередине. Ступени ПЕРЕДАЮТСЯ параметрами (их источники
// у поверхностей разные: форма, снапшот, ответ настроек цеха), а ПОРЯДОК ступеней и СЛОВА их
// источников живут здесь, в одном экземпляре.
//
// «ALLOWANCE», А НЕ «SA». Строка спецификации карты примерки несёт коды ISO 4916 — SS, LS, EF, BS,
// FS, OS, — и «SA» вставало в тот же список · двухбуквенным токеном в верхнем регистре, неотличимым
// с виду от класса шва, которым оно не является. Слово стоит дороже двух сэкономленных символов;
// подпись поля в редакторе и так говорит «seam allowance, mm».
//
// ЕДИНИЦЫ — ВСЕГДА, И У УНАСЛЕДОВАННОЙ СТУПЕНИ ТОЖЕ. Ручная сборка редактора печатала «allowance 10
// mm» у собственного значения и «allowance 12 (card)» у карточного: миллиметры терялись ровно на
// той ступени, где число НЕ выбирал человек, читающий строку. Это то же правило, что волна фактов
// вывела для бумаги дословно («UNITS ARE IN THE TEXT, always»).
// ЧТЕНИЕ ОТДЕЛЕНО ОТ ФРАЗЫ, потому что ЧИТАТЕЛЕЙ СТАЛО ТРИ, а фраза нужна не всем троим одинаково.
//
// Экраны зовут `seamAllowanceText` и печатают её ответ как есть. ПЕЧАТНЫЙ ЛИСТ — третий читатель, и
// у него есть то, чего нет у бегущей строки: КЛЕТКА, которая рисуется ВСЕГДА. Пустая клетка на
// бумаге — это утверждение «припуска нет», и лист обязан отличать «ни одна ступень числа не
// назвала» (сказать вслух) от «лестница к этому шагу неприменима вовсе» (промолчать, как экраны).
//
// РАЗЛИЧАТЬ ЭТО САМОСТОЯТЕЛЬНО ЛИСТ НЕ ИМЕЕТ ПРАВА: гейт «есть ли у шага шов» — половина лестницы,
// и его копия у третьей поверхности и есть ровно тот дефект, ради которого всё это сведено в один
// экземпляр. Поэтому лестница ОТВЕЧАЕТ ОБЕИМИ ПОЛОВИНАМИ РАЗОМ — фразой и своим вердиктом о гейте, —
// а спросить их порознь и с разными аргументами нельзя: вызов один.
export type SeamAllowanceReading = {
  /** Фраза для глаз, та же на всех поверхностях. Пусто — числа не назвала ни одна ступень. */
  text: string;
  /**
   * Осмысленны ли ступени НАД шагом (у шага есть шов). `text === '' && inherits` читается как
   * «шов есть, а припуска не назвал никто» — единственное состояние, о котором бумаге стоит
   * сказать словами, а экрану — промолчать: в форме пустое поле и так видимо не заполнено.
   */
  inherits: boolean;
};

export function seamAllowanceReading(o: {
  /** Собственное значение шага (мм, строкой — так его держит форма). */
  own?: string;
  /** Стандарт карточки — `requiredSeamAllowanceMm`. Ступень под собственной. */
  card?: string;
  /** Стандарт цеха — настройки цеха, `defaultSeamAllowanceMm`. Последняя ступень. */
  workshop?: string;
  /**
   * ЛЕСТНИЦА ПРИМЕНИМА НЕ КО ВСЯКОМУ ШАГУ, и это не оформление, а смысл. У подрезки, чистки и
   * упаковки строка «allowance 12 mm (card)» ВЕРНА и БЕССМЫСЛЕННА разом: она называет стандарт
   * карточки, а не факт этого шага, — а три таких подряд учат не читать спецификацию вовсе.
   * Редактор этот отказ уже выносил (`showSeamSummary`), и здесь стоит ровно он же — чтобы вторая
   * поверхность не получила его копией.
   *
   * СОБСТВЕННОЕ ЗНАЧЕНИЕ ГЕЙТ НЕ СПРАШИВАЕТ: число, которое НАПИСАНО на шаге, показывается там,
   * где оно написано, каким бы глаголом шаг ни был. Молчать о записанном — потеря, а не порядок.
   */
  operationType?: string;
  /** Второй вход того же гейта: у шага с НАЗВАННЫМ классом шва шов есть по определению. */
  seamClass?: string;
}): SeamAllowanceReading {
  const cls = (o.seamClass ?? '').trim();
  const inherits = isMachineStepType(o.operationType) || (cls !== '' && !cls.endsWith('_UNKNOWN'));
  // `.trim() !== ''`, А НЕ TRUTHY: «0» — ЗАКОННЫЙ припуск («кроить по линии»), и по truthy он
  // провалился бы на ступень ниже, подменив назначенный ноль карточным стандартом. Печатный лист
  // отличает отсутствие поля от нуля по этой же причине и теми же словами.
  const own = (o.own ?? '').trim();
  if (own !== '') return { text: `allowance ${own} mm`, inherits };
  if (!inherits) return { text: '', inherits };
  const card = (o.card ?? '').trim();
  if (card !== '') return { text: `allowance ${card} mm (card)`, inherits };
  const workshop = (o.workshop ?? '').trim();
  return { text: workshop !== '' ? `allowance ${workshop} mm (workshop)` : '', inherits };
}

/** Та же лестница, только фразой: то, что печатают ЭКРАНЫ, где клетки нет и молчание допустимо. */
export function seamAllowanceText(o: Parameters<typeof seamAllowanceReading>[0]): string {
  return seamAllowanceReading(o).text;
}

// WHAT A PARK PROFILE IS SET TO — the tile's second line on CARD DEFAULTS and the settings column of
// the printed tech pack. One composer for both, for the reason operationHeading is one composer: a
// profile summarised differently on screen and on paper is two answers to «what is this machine
// threaded with», and the paper one is the one nobody can check against the form.
//
// IT LIVES HERE, NOT IN equipment-options, only because of the import direction: the foot comes from
// ATTACHMENT_KIND_LABELS (this file) and everything else from the equipment vocabulary, and
// operation-options is the half that is allowed to import the other. Reversing it would close a
// cycle.
//
// IT YIELDS PARTS, and the one-line summary is the join of them. The printed sheet has to mark WHICH
// of a step's settings the technologist chose and which came off the profile (§3: the server stores
// NULL for «inherit» and never materialises the value, so paper is the only place the two can be
// told apart) — and a marker cannot be hung on a sentence that has already been joined. Hence
// (field, text) pairs here and `joinSummary` for the callers that only want the sentence.
//
// DECIMALS ARE STRINGS on the way in. The form holds them that way; a caller reading the WIRE
// (a printed sheet over a release snapshot) passes them through decimalToInput first. Typed
// structurally over exactly the fields read, so both shapes satisfy it — the same trick the ladder
// resolvers use.
export type MachineSettingField =
  | 'threads'
  | 'needle'
  | 'bed'
  | 'automation'
  | 'tension'
  | 'density'
  | 'stitchWidth'
  | 'attachment';

export type PressSettingField = 'temperature' | 'dwell' | 'pressure' | 'steam' | 'cloth';

export type SettingPart<F extends string> = { field: F; text: string };

/** The machine settings a PROFILE carries — and, field for field, the ones a step may override. */
export type MachineSettings = {
  threadCount?: number;
  needleType?: string;
  needleSizeNm?: number;
  bedType?: string;
  automation?: string;
  threadTension?: string;
  threadTensionNote?: string;
  attachmentKind?: string;
  /** ONLY a step carries this: a profile names the foot, not the width of the tape in it. */
  attachmentSizeMm?: string;
  stitchesPerCm?: string;
  stitchWidthMm?: string;
};

export type PressSettings = {
  pressTemperatureC?: number;
  pressDwellSec?: number;
  pressPressureNCm2?: string;
  pressSteam?: boolean;
  pressCloth?: string;
};

const joinSummary = (parts: Array<string | false | undefined>): string =>
  parts.filter(Boolean).join(' · ');

const nonEmpty = <F extends string>(parts: Array<SettingPart<F>>): Array<SettingPart<F>> =>
  parts.filter((p) => p.text !== '');

export function machineProfileParts(p: MachineSettings): Array<SettingPart<MachineSettingField>> {
  // The point and the size are ONE fact about the needle («ballpoint Nm 90»), so they are joined by
  // a space and enter the list as a single item — separated by the dot they would read as two
  // independent settings, and a summary is scanned, not parsed.
  const needle = [
    needleTypeLabel(p.needleType),
    (p.needleSizeNm ?? 0) > 0 ? `Nm ${p.needleSizeNm}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  // THE TENSION AND ITS NOTE ARE ONE FACT, and on the OTHER member of the scale the note is the
  // whole of it: «other (see note)» printed alone tells the floor to look somewhere this summary is
  // the only copy of. The note qualifies the scale and never appears without it, which is exactly
  // the pair the server enforces.
  // Never the note on its own: the scale is what the note qualifies, and the save mapper drops a
  // note whose scale went back to «inherit» — printing it here would show a setting that is about
  // to disappear.
  const tensionLabel = threadTensionLabel(p.threadTension);
  const tensionNote = (p.threadTensionNote ?? '').trim();
  const tension = tensionLabel && tensionNote ? `${tensionLabel} — ${tensionNote}` : tensionLabel;
  // The foot and the size it is set to are one fact as well («binder 8 mm»); a size with no foot
  // above it is refused by the server and can only reach here from a legacy row.
  const foot = attachmentKindLabel(p.attachmentKind);
  const footSize = (p.attachmentSizeMm ?? '').trim();
  return nonEmpty<MachineSettingField>([
    { field: 'threads', text: (p.threadCount ?? 0) > 0 ? `${p.threadCount} threads` : '' },
    { field: 'needle', text: needle },
    { field: 'bed', text: bedTypeLabel(p.bedType) },
    { field: 'automation', text: automationLevelLabel(p.automation) },
    { field: 'tension', text: tension },
    { field: 'density', text: densityText(p.stitchesPerCm) },
    // «STITCH WIDTH», SPELLED OUT, and never just «width»: the other width on a step is
    // topstitch.width_mm, which is a distance from an edge, and a zigzag amplitude read as a
    // topstitch inset (or the reverse) is sewn wrong and noticed after the batch.
    {
      field: 'stitchWidth',
      text: (p.stitchWidthMm ?? '').trim() ? `stitch width ${(p.stitchWidthMm ?? '').trim()} mm` : '',
    },
    // '' for UNKNOWN, the real words for NONE: «runs bare» is a настройка somebody chose, and the
    // summary of a profile that states it must not read the same as one that says nothing.
    { field: 'attachment', text: foot && footSize ? `${foot} ${footSize} mm` : foot },
  ]);
}

export const machineProfileSummary = (p: MachineSettings): string =>
  joinSummary(machineProfileParts(p).map((s) => s.text));

export function pressProfileParts(p: PressSettings): Array<SettingPart<PressSettingField>> {
  return nonEmpty<PressSettingField>([
    { field: 'temperature', text: (p.pressTemperatureC ?? 0) > 0 ? `${p.pressTemperatureC} °C` : '' },
    { field: 'dwell', text: (p.pressDwellSec ?? 0) > 0 ? `${p.pressDwellSec} s` : '' },
    // THE UNIT IS IN THE TEXT, always: press pressure is quoted in bar, in kg and in N/cm² by three
    // different people, and a bare number on a printed sheet gets read in whichever the reader uses.
    // A column heading is not enough — the number is what gets copied onto a machine.
    {
      field: 'pressure',
      text: (p.pressPressureNCm2 ?? '').trim() ? `${(p.pressPressureNCm2 ?? '').trim()} N/cm²` : '',
    },
    // Tri-state: absent says nothing, `false` says «press it DRY» — an instruction, not a silence.
    { field: 'steam', text: p.pressSteam === undefined ? '' : p.pressSteam ? 'steam' : 'dry' },
    { field: 'cloth', text: pressClothLabel(p.pressCloth) },
  ]);
}

export const pressProfileSummary = (p: PressSettings): string =>
  joinSummary(pressProfileParts(p).map((s) => s.text));

// --- the ladder, applied (§3) --------------------------------------------------------------------
//
// WHAT THE FLOOR ACTUALLY HAS TO DO — the step's own value where it has one, the profile's where it
// does not. The server deliberately never materialises the inherited half (a NULL column means «ask
// the profile», and it stays NULL even when the technologist would have typed the same number), so
// a printed sheet that quoted only the stored row would leave a correctly inherited setting blank on
// the paper the machine is set up from. Resolving it is the CLIENT's job — the editor does it for
// its placeholders, this does it for the sheet, and both walk the same rungs.
//
// PER FIELD, because that is how it is stored: a step may override the needle size and inherit the
// point, and the two rungs are decided independently. `overridden` is the one extra bit paper needs
// — «this number is the step's own», printed as a marker beside it — and it is never a reason to
// hide the inherited ones.
export type EffectiveSetting<F extends string> = SettingPart<F> & { overridden: boolean };

// «Is this enum answered?» — every dictionary of this feature names its zero member `*_UNKNOWN`, and
// that token is the ONE spelling of «inherit». NONE (no foot, no press cloth) is an ANSWER and must
// resolve as an override, which is exactly why the two tokens exist apart.
const enumSet = (v?: string): boolean => {
  const t = (v ?? '').trim();
  return t !== '' && !t.endsWith('_UNKNOWN');
};
const textSet = (v?: string): boolean => (v ?? '').trim() !== '';

export function effectiveMachineSettings(
  step: MachineSettings,
  profile?: MachineSettings,
  /** The card's own default density — the rung below the profile, and the last one (§3.4). */
  cardDensity?: string,
): Array<EffectiveSetting<MachineSettingField>> {
  const ownTension = enumSet(step.threadTension);
  const merged: MachineSettings = {
    threadCount: (step.threadCount ?? 0) > 0 ? step.threadCount : profile?.threadCount,
    needleType: enumSet(step.needleType) ? step.needleType : profile?.needleType,
    needleSizeNm: (step.needleSizeNm ?? 0) > 0 ? step.needleSizeNm : profile?.needleSizeNm,
    // Bed and automation are machine IDENTITY: a step has no field for either (a different bed is a
    // different machine), so they can only ever be the profile's and are never marked.
    bedType: profile?.bedType,
    automation: profile?.automation,
    // The note travels with whichever scale won — a profile's note pasted under a step's own tension
    // would qualify a setting it was not written about.
    threadTension: ownTension ? step.threadTension : profile?.threadTension,
    threadTensionNote: ownTension ? step.threadTensionNote : profile?.threadTensionNote,
    stitchesPerCm: textSet(step.stitchesPerCm)
      ? step.stitchesPerCm
      : textSet(profile?.stitchesPerCm)
        ? profile?.stitchesPerCm
        : cardDensity,
    stitchWidthMm: textSet(step.stitchWidthMm) ? step.stitchWidthMm : profile?.stitchWidthMm,
    attachmentKind: enumSet(step.attachmentKind) ? step.attachmentKind : profile?.attachmentKind,
    // The size measures the step's own tool and has no rung above it.
    attachmentSizeMm: step.attachmentSizeMm,
  };
  const own = new Set<MachineSettingField>();
  if ((step.threadCount ?? 0) > 0) own.add('threads');
  // ONE MARKER FOR THE PAIR: point and size are printed as one item, so the step answering either
  // half of it makes the item the step's own — silently dropping the marker because the other half
  // was inherited would be the worse of the two roundings.
  if (enumSet(step.needleType) || (step.needleSizeNm ?? 0) > 0) own.add('needle');
  if (ownTension) own.add('tension');
  if (textSet(step.stitchesPerCm)) own.add('density');
  if (textSet(step.stitchWidthMm)) own.add('stitchWidth');
  if (enumSet(step.attachmentKind)) own.add('attachment');
  return machineProfileParts(merged).map((p) => ({ ...p, overridden: own.has(p.field) }));
}

export function effectivePressSettings(
  step: PressSettings,
  profile?: PressSettings,
): Array<EffectiveSetting<PressSettingField>> {
  const merged: PressSettings = {
    pressTemperatureC:
      (step.pressTemperatureC ?? 0) > 0 ? step.pressTemperatureC : profile?.pressTemperatureC,
    pressDwellSec: (step.pressDwellSec ?? 0) > 0 ? step.pressDwellSec : profile?.pressDwellSec,
    pressPressureNCm2: textSet(step.pressPressureNCm2)
      ? step.pressPressureNCm2
      : profile?.pressPressureNCm2,
    // `false` IS AN ANSWER («press it dry»), so the rung is decided on presence, not on truthiness —
    // `||` here would silently let a profile's «with steam» overrule a step that said dry.
    pressSteam: step.pressSteam !== undefined ? step.pressSteam : profile?.pressSteam,
    pressCloth: enumSet(step.pressCloth) ? step.pressCloth : profile?.pressCloth,
  };
  const own = new Set<PressSettingField>();
  if ((step.pressTemperatureC ?? 0) > 0) own.add('temperature');
  if ((step.pressDwellSec ?? 0) > 0) own.add('dwell');
  if (textSet(step.pressPressureNCm2)) own.add('pressure');
  if (step.pressSteam !== undefined) own.add('steam');
  if (enumSet(step.pressCloth)) own.add('cloth');
  return pressProfileParts(merged).map((p) => ({ ...p, overridden: own.has(p.field) }));
}

// --- THE FAMILIES THE OPERATION-KINDS WAVE ADDED (Ф2) --------------------------------------------
//
// ELEVEN NEW FAMILIES OF FACT ARRIVE ON A STEP, and every one of them has to reach PAPER or it does
// not exist: the sheet is the only copy of a tech card that stands beside the machine. The wave put
// them on the wire as block messages (stitching, placement_layout, hardware, print, weld, trim,
// thread_trim, clean, inspect, fastening) plus two bare discriminator fields (print_method,
// wet_process_kind), and the printed sheet composes them here — beside machineProfileParts and
// pressProfileParts, for the reason those two live here: a summary written twice is two answers to
// the same question, and the paper one is the one nobody can check against the form.
//
// THE COMPOSERS PRINT WHAT ARRIVED AND ASK NO PERMISSION. Which family a verb is ALLOWED to carry is
// STEP_TYPE_BLOCKS' question and it is a question about WRITING — the server refuses a field from
// the wrong family by name. Gating the printers on it as well would mean a fact that IS stored and
// IS in the response silently missing from the sheet, which is the one failure paper cannot survive:
// a wrong verb is visible to the floor, a missing setting is not. So a block that came back is
// printed, whatever verb it came back on.
//
// UNITS ARE IN THE TEXT, always — the same rule press pressure earned the hard way. A bare «6.4» on
// a sheet is read in whatever unit the reader works in, and these numbers get copied onto machines.
//
// DECIMALS ARE STRINGS on the way in, exactly like MachineSettings: a caller reading the wire passes
// them through decimalToInput first, and the form already holds them that way.

const enumText = <T extends string>(labels: Record<T, string>, v?: string): string => {
  const t = (v ?? '').trim();
  // '' for the UNKNOWN member and for a token this bundle has never heard of — the same direction
  // the equipment label helpers take. A raw «TECH_CARD_TRIM_ACTION_…» on a sheet for the floor is
  // worse than a blank, because a blank is visibly incomplete and a token looks like an answer.
  return !t || t.endsWith('_UNKNOWN') ? '' : (labels[t as T] ?? '');
};
const mm = (v?: string): string => ((v ?? '').trim() ? `${(v ?? '').trim()} mm` : '');
const positive = (n?: number): number => ((n ?? 0) > 0 ? (n as number) : 0);

// A «none» member is an ANSWER and is printed as one — «no backtack» is an instruction, and a step
// that says it must not read the same as a step that says nothing. Every map below is a total
// `Record`, for the reason every dictionary of this feature is (see the header of
// equipment-options.ts): nothing in this repo diffs the client against the contract, so tsc is the
// diff, and a member added by a proto bump fails the build until somebody words it.

/** S3 — how the ends of a stitch line are secured. */
export const SEAM_SECURING_LABELS: Record<common_TechCardSeamSecuring, string> = {
  TECH_CARD_SEAM_SECURING_UNKNOWN: '',
  TECH_CARD_SEAM_SECURING_NONE: 'no backtack',
  TECH_CARD_SEAM_SECURING_BACKTACK: 'backtack',
  TECH_CARD_SEAM_SECURING_CONDENSED: 'condensed stitches',
  TECH_CARD_SEAM_SECURING_LATCHED: 'latch-back',
};

/** S14 — how the binding is folded. */
export const BINDING_STYLE_LABELS: Record<common_TechCardBindingStyle, string> = {
  TECH_CARD_BINDING_STYLE_UNKNOWN: '',
  TECH_CARD_BINDING_STYLE_RAW: 'raw-edge binding',
  TECH_CARD_BINDING_STYLE_SINGLE_FOLD: 'single-fold binding',
  TECH_CARD_BINDING_STYLE_DOUBLE_FOLD: 'double-fold binding',
};

/** S17 — the stitch scheme a label is attached with. Each label carries the word «label» so the
 *  fact stands alone in a settings list where nothing above it says what is being stitched. */
export const LABEL_ATTACH_STITCH_LABELS: Record<common_TechCardLabelAttachStitch, string> = {
  TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN: '',
  TECH_CARD_LABEL_ATTACH_STITCH_FOUR_SIDES: 'label stitched on four sides',
  TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_TOP_BOTTOM: 'label stitched top and bottom',
  TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_LEFT_RIGHT: 'label stitched left and right',
  TECH_CARD_LABEL_ATTACH_STITCH_ONE_EDGE: 'label stitched along one edge',
  TECH_CARD_LABEL_ATTACH_STITCH_CAUGHT_IN_SEAM: 'label caught in the seam',
  TECH_CARD_LABEL_ATTACH_STITCH_CORNERS_TACK: 'label tacked at the corners',
  TECH_CARD_LABEL_ATTACH_STITCH_OTHER: 'label stitched, other scheme',
};

/** H1 — how the hardware is held on. The discriminator of a HARDWARE_SET step, so it is the head of
 *  the «machine / mode» column and not one of its settings: it is what the step IS. */
export const HARDWARE_ATTACH_METHOD_LABELS: Record<common_TechCardHardwareAttachMethod, string> = {
  TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN: '',
  TECH_CARD_HARDWARE_ATTACH_METHOD_SEW: 'sewn on',
  TECH_CARD_HARDWARE_ATTACH_METHOD_PRONG_CLINCH: 'prong-clinched',
  TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET: 'press-set',
  TECH_CARD_HARDWARE_ATTACH_METHOD_CRIMP: 'crimped',
  TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED: 'threaded through',
  TECH_CARD_HARDWARE_ATTACH_METHOD_OTHER: 'held on some other way (see note)',
};

/** H2 — how the hole under the hardware is made: the axis is «is the hole prepared as a step of its
 *  own, or not». `PRONG_PIERCE` was retired in 0327 — «the prong pierces the cloth itself» is the
 *  same answer as `NONE`, and offering both made the technologist pick between two spellings of it. */
export const HOLE_PREP_LABELS: Record<common_TechCardHolePrep, string> = {
  TECH_CARD_HOLE_PREP_UNKNOWN: '',
  TECH_CARD_HOLE_PREP_NONE: 'no hole prep',
  TECH_CARD_HOLE_PREP_AWL_PIERCE: 'awl-pierced hole',
  TECH_CARD_HOLE_PREP_PUNCH: 'punched hole',
};

/** H3 — what sits behind the hardware, the buttonhole or the bartack. The MATERIAL of it is a BOM
 *  line; this says only which way it is done. */
export const REINFORCEMENT_LABELS: Record<common_TechCardReinforcement, string> = {
  TECH_CARD_REINFORCEMENT_UNKNOWN: '',
  TECH_CARD_REINFORCEMENT_NONE: 'no reinforcement',
  // ОДИН ЧЛЕН ВМЕСТО ДВУХ (0328). `FUSIBLE_PATCH` и `FABRIC_STAY` описывали ОДИН способ — заплату
  // за деталью — и различались тем, ЧЕМ она сделана; а материал усилителя живёт строкой BOM, где
  // ему и место. Подпись поэтому не называет материал: «patch behind», а чем именно — в строке.
  TECH_CARD_REINFORCEMENT_PATCH: 'patch behind',
  TECH_CARD_REINFORCEMENT_TAPE: 'tape behind',
  TECH_CARD_REINFORCEMENT_SEAM_CATCH: 'caught into the seam',
  TECH_CARD_REINFORCEMENT_OTHER: 'other reinforcement',
};

/** ДВА СНЯТЫХ НАПИСАНИЯ ЧИТАЮТСЯ КАК `PATCH`, А НЕ КАК ПУСТОТА. 0328 — ПЕРЕНОС, а не удаление:
 *  строки, записанные до неё, несут старый токен, и прочитать его пустотой значило бы стереть
 *  ответ технолога на экране, а следующим сохранением — и в базе. Канонизация стоит ОДНА на
 *  клиент: её зовут оба пути чтения (`schema.operationsFromPb`, редактор шагов) и подпись, поэтому
 *  на провод из формы уходит уже только `PATCH`.
 *
 *  Карта НЕ типизирована `Record<common_TechCardReinforcement, …>` намеренно: её ключи — токены,
 *  которых в контракте больше НЕТ, и тотальная запись их бы просто не приняла. */
const RETIRED_REINFORCEMENT: Record<string, common_TechCardReinforcement> = {
  TECH_CARD_REINFORCEMENT_FUSIBLE_PATCH: 'TECH_CARD_REINFORCEMENT_PATCH',
  TECH_CARD_REINFORCEMENT_FABRIC_STAY: 'TECH_CARD_REINFORCEMENT_PATCH',
};

/** Токен усилителя, каким его понимает ЭТОТ бандл: снятое написание — как `PATCH`, всё остальное —
 *  как есть (в том числе член НОВЕЕ бандла: выдумывать за него нельзя). */
export const canonicalReinforcement = (v?: string): string =>
  (v && RETIRED_REINFORCEMENT[v]) || v || '';

/** P1 — the discriminator of a PRINT step, and the head of its «machine / mode» column. */
export const PRINT_METHOD_LABELS: Record<common_TechCardPrintMethod, string> = {
  TECH_CARD_PRINT_METHOD_UNKNOWN: '',
  TECH_CARD_PRINT_METHOD_SCREEN: 'screen print',
  TECH_CARD_PRINT_METHOD_DTF: 'DTF transfer',
  TECH_CARD_PRINT_METHOD_HEAT_TRANSFER: 'heat transfer',
  TECH_CARD_PRINT_METHOD_FOIL: 'foil',
  TECH_CARD_PRINT_METHOD_LASER_ENGRAVE: 'laser engrave',
  TECH_CARD_PRINT_METHOD_OTHER: 'another method (see note)',
};

/** P2 — when the carrier film comes off, and the temperature word is the whole instruction: a hot
 *  peel pulled cold lifts the print.
 *
 *  «НОСИТЕЛЯ НЕТ» ЗДЕСЬ БОЛЬШЕ НЕ ЧЛЕН, А ПРАВИЛО (0327). `NONE` был истинен ОДНОВРЕМЕННО с «не
 *  указано» ровно на тех методах, у которых носителя нет вовсе, — шелкография и гравировка, — то
 *  есть заполняющий выбирал наугад между двумя правдами. Теперь поле при этих методах просто
 *  отвергается, и отказ называет метод. */
export const PEEL_MODE_LABELS: Record<common_TechCardPeelMode, string> = {
  TECH_CARD_PEEL_MODE_UNKNOWN: '',
  TECH_CARD_PEEL_MODE_HOT: 'hot peel',
  TECH_CARD_PEEL_MODE_WARM: 'warm peel',
  TECH_CARD_PEEL_MODE_COLD: 'cold peel',
};

/** T1 — the discriminator of a TRIM step: WHICH cut, with the shape of the edge it is made on,
 *  because «clip» and «notch» are opposite operations and the curve is what tells them apart. */
export const TRIM_ACTION_LABELS: Record<common_TechCardTrimAction, string> = {
  TECH_CARD_TRIM_ACTION_UNKNOWN: '',
  TECH_CARD_TRIM_ACTION_TRIM_EVEN: 'trim even',
  TECH_CARD_TRIM_ACTION_GRADE_LAYERS: 'grade the layers',
  TECH_CARD_TRIM_ACTION_CLIP_CONCAVE: 'clip the concave curve',
  TECH_CARD_TRIM_ACTION_NOTCH_CONVEX: 'notch the convex curve',
  TECH_CARD_TRIM_ACTION_CORNER_DIAGONAL: 'trim the corner diagonally',
  TECH_CARD_TRIM_ACTION_TURN_AND_SHAPE: 'turn and shape',
  TECH_CARD_TRIM_ACTION_OTHER: 'another cut (see note)',
};

/** C1 — the discriminator of a CLEAN step. */
export const CLEANING_KIND_LABELS: Record<common_TechCardCleaningKind, string> = {
  TECH_CARD_CLEANING_KIND_UNKNOWN: '',
  TECH_CARD_CLEANING_KIND_SPOT_CLEAN: 'spot clean',
  TECH_CARD_CLEANING_KIND_DUST_LINT: 'dust / lint removal',
  TECH_CARD_CLEANING_KIND_OTHER: 'something else (see note)',
};

/** Q1 — the discriminator of an INSPECT step, and the one fact that says how much work it is:
 *  «every unit» and «one per bundle» are the same verb over a hundredfold difference in time.
 *
 *  СЛОВАРЬ ОТВЕЧАЕТ НА ОДИН ВОПРОС — СКОЛЬКО ИЗДЕЛИЙ СМОТРИМ. `FIRST_OUTPUT` отвечал на другой
 *  («когда смотрим») и снят в 0327: первая единица прогона — это выборка по правилу «одна на
 *  запуск», а МОМЕНТ контроля несёт порядок шага в сборке. */
export const INSPECT_COVERAGE_LABELS: Record<common_TechCardInspectCoverage, string> = {
  TECH_CARD_INSPECT_COVERAGE_UNKNOWN: '',
  TECH_CARD_INSPECT_COVERAGE_EACH_UNIT: 'check every unit',
  TECH_CARD_INSPECT_COVERAGE_SAMPLE_PER_BUNDLE: 'sample per bundle',
  TECH_CARD_INSPECT_COVERAGE_AQL_PLAN: 'AQL plan',
  TECH_CARD_INSPECT_COVERAGE_OTHER: 'another coverage (see note)',
};

/** WP1 — the discriminator of a WET_PROCESS step. */
export const WET_PROCESS_KIND_LABELS: Record<common_TechCardWetProcessKind, string> = {
  TECH_CARD_WET_PROCESS_KIND_UNKNOWN: '',
  TECH_CARD_WET_PROCESS_KIND_RINSE: 'rinse',
  TECH_CARD_WET_PROCESS_KIND_ENZYME: 'enzyme wash',
  TECH_CARD_WET_PROCESS_KIND_GARMENT_DYE: 'garment dye',
  TECH_CARD_WET_PROCESS_KIND_SOFTENER: 'softener',
  TECH_CARD_WET_PROCESS_KIND_OTHER: 'another bath (see note)',
};

// ВТО — ДВА СЛОВАРЯ 0325, И ОНИ РАЗНЫЕ ПО ЖАНРУ. Первый называет РАБОТУ («что именно делает
// утюг»), второй — НАЗНАЧЕНИЕ ПРИПУСКА («куда он лёг»), и второй законен только при «заутюжить».
//
// ПОДПИСИ — ТЕРМИНЫ ЦЕХА, А НЕ ПЕРЕВОД ТОКЕНОВ. `BODY` в токене — «изделие», но технолог про
// втачной рукав говорит «на изделие, в сторону проймы», и без второй половины подпись читалась бы
// как «куда угодно, лишь бы не в рукав». Ровно так же `SHELL` — не «верх», а «на верх, от
// обтачки»: пара «facing / shell» описывает ОДИН шов с двух сторон, и различает их именно то, от
// чего припуск уводят.
//
// «Прочее» у обоих — ОТВЕТ, а не пустота: пустая подпись в этом файле значит ровно одно — сентинел
// `*_UNKNOWN`, и он тут ровно один (см. `stepDiscriminatorUnset`).

/** G1 — ЧТО ИМЕННО делает ВТО-шаг. Не required ни на одном глаголе: старая строка PRESS без
 *  под-глагола обязана читаться и сохраняться как есть.
 *
 *  РАЗУТЮЖКИ В СПИСКЕ НЕТ, И ЭТО НЕ ПРОПУСК: она выражается ГЛАГОЛОМ `PRESS_OPEN` — единственным
 *  написанием. Член `OPEN` был вторым написанием того же факта, и два написания давали два разных
 *  кортежа в проекции дайджеста секции: одна и та же разутюжка на двух карточках получала разные
 *  отпечатки. 0327 снял его — за глаголом стояли живые строки прода, за членом ни одной. */
export const PRESS_ACTION_LABELS: Record<common_TechCardPressAction, string> = {
  TECH_CARD_PRESS_ACTION_UNKNOWN: '',
  TECH_CARD_PRESS_ACTION_PRESS_FLAT: 'press flat',
  TECH_CARD_PRESS_ACTION_TO_ONE_SIDE: 'press to one side',
  TECH_CARD_PRESS_ACTION_STEAM: 'steam',
  TECH_CARD_PRESS_ACTION_FINAL: 'final press',
  TECH_CARD_PRESS_ACTION_EASE_IN: 'ease in the fullness',
  TECH_CARD_PRESS_ACTION_STRETCH: 'stretch the edge',
  TECH_CARD_PRESS_ACTION_MOULD: 'mould on a form',
  TECH_CARD_PRESS_ACTION_OTHER: 'another press action (see note)',
};

/** G2 — КУДА лёг припуск. Собственный словарь, а НЕ `TechCardGarmentZone`: «вверх», «вниз» и «к
 *  центру» зонами не являются, а второе поле зонного типа на шаге, у которого уже есть zone, —
 *  ловушка «два ключа под одним именем». */
export const PRESS_TOWARD_LABELS: Record<common_TechCardPressToward, string> = {
  TECH_CARD_PRESS_TOWARD_UNKNOWN: '',
  TECH_CARD_PRESS_TOWARD_FRONT: 'toward the front',
  TECH_CARD_PRESS_TOWARD_BACK: 'toward the back',
  TECH_CARD_PRESS_TOWARD_UP: 'upward',
  TECH_CARD_PRESS_TOWARD_DOWN: 'downward',
  TECH_CARD_PRESS_TOWARD_TOWARD_CENTER: 'toward the centre',
  TECH_CARD_PRESS_TOWARD_AWAY_FROM_CENTER: 'away from the centre',
  TECH_CARD_PRESS_TOWARD_SLEEVE: 'into the sleeve',
  TECH_CARD_PRESS_TOWARD_BODY: 'onto the body, toward the armhole',
  TECH_CARD_PRESS_TOWARD_FACING: 'onto the facing',
  TECH_CARD_PRESS_TOWARD_SHELL: 'onto the shell, away from the facing',
  TECH_CARD_PRESS_TOWARD_LINING: 'toward the lining',
  TECH_CARD_PRESS_TOWARD_OTHER: 'somewhere else (see note)',
};

// FA1 and FA5 are ADJECTIVES, not phrases, because they describe the same buttonhole and are
// printed as one item: «horizontal round-end buttonhole». Worded as standalone phrases they would
// have to repeat the noun, and «round-end buttonhole · horizontal buttonhole» is one buttonhole
// reported twice on a sheet with no room for it.
const BUTTONHOLE_STYLE_ADJECTIVE: Record<common_TechCardButtonholeStyle, string> = {
  TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN: '',
  TECH_CARD_BUTTONHOLE_STYLE_STRAIGHT: 'straight',
  TECH_CARD_BUTTONHOLE_STYLE_EYELET: 'eyelet',
  TECH_CARD_BUTTONHOLE_STYLE_ROUND_END: 'round-end',
  TECH_CARD_BUTTONHOLE_STYLE_OTHER: 'other-shape',
};

const BUTTONHOLE_ORIENTATION_ADJECTIVE: Record<common_TechCardButtonholeOrientation, string> = {
  TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN: '',
  TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL: 'horizontal',
  TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL: 'vertical',
  TECH_CARD_BUTTONHOLE_ORIENTATION_ANGLED: 'angled',
};

/** FA9 — how the thread lies across the holes of a button. Self-standing phrases: this one is not
 *  merged with anything, and «cross (X)» alone would not say what is crossed. */
export const BUTTON_ATTACH_PATTERN_LABELS: Record<common_TechCardButtonAttachPattern, string> = {
  TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN: '',
  TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X: 'button sewn cross (X)',
  TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL: 'button sewn parallel bars',
  TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE: 'button sewn square',
  TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE: 'button sewn U-shape',
  TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER: 'button sewn, other pattern',
};

/** FA13 — how the zip is set in. The word «zip» is in every member for the same reason the label
 *  scheme carries «label»: in a settings list nothing above it says what is being set.
 *
 *  ЗДЕСЬ ТОЛЬКО ИСПОЛНЕНИЕ — то, КАК закрыта лента. Ни МЕСТА, ни свойств самого артикула: 0327 снял
 *  `SEPARATING_CF` (место — это zone шага, разъёмность — свойство молнии из строки BOM) и
 *  `IN_SEAM_POCKET` (втачивание в шов — это `CENTERED` в кармане, а карман — снова zone). */
export const ZIPPER_APPLICATION_LABELS: Record<common_TechCardZipperApplication, string> = {
  TECH_CARD_ZIPPER_APPLICATION_UNKNOWN: '',
  TECH_CARD_ZIPPER_APPLICATION_CENTERED: 'centred zip',
  TECH_CARD_ZIPPER_APPLICATION_LAPPED: 'lapped zip',
  TECH_CARD_ZIPPER_APPLICATION_INVISIBLE: 'invisible zip',
  TECH_CARD_ZIPPER_APPLICATION_EXPOSED: 'exposed zip',
  TECH_CARD_ZIPPER_APPLICATION_FLY: 'fly zip',
  TECH_CARD_ZIPPER_APPLICATION_OTHER: 'zip, other application',
};

export const seamSecuringLabel = (v?: string): string => enumText(SEAM_SECURING_LABELS, v);
export const bindingStyleLabel = (v?: string): string => enumText(BINDING_STYLE_LABELS, v);
export const labelAttachStitchLabel = (v?: string): string =>
  enumText(LABEL_ATTACH_STITCH_LABELS, v);
export const hardwareAttachMethodLabel = (v?: string): string =>
  enumText(HARDWARE_ATTACH_METHOD_LABELS, v);
export const holePrepLabel = (v?: string): string => enumText(HOLE_PREP_LABELS, v);
export const reinforcementLabel = (v?: string): string =>
  enumText(REINFORCEMENT_LABELS, canonicalReinforcement(v));
export const printMethodLabel = (v?: string): string => enumText(PRINT_METHOD_LABELS, v);
export const peelModeLabel = (v?: string): string => enumText(PEEL_MODE_LABELS, v);
export const trimActionLabel = (v?: string): string => enumText(TRIM_ACTION_LABELS, v);
export const cleaningKindLabel = (v?: string): string => enumText(CLEANING_KIND_LABELS, v);
export const inspectCoverageLabel = (v?: string): string => enumText(INSPECT_COVERAGE_LABELS, v);
export const wetProcessKindLabel = (v?: string): string => enumText(WET_PROCESS_KIND_LABELS, v);
export const buttonAttachPatternLabel = (v?: string): string =>
  enumText(BUTTON_ATTACH_PATTERN_LABELS, v);
export const zipperApplicationLabel = (v?: string): string =>
  enumText(ZIPPER_APPLICATION_LABELS, v);
export const pressActionLabel = (v?: string): string => enumText(PRESS_ACTION_LABELS, v);
export const pressTowardLabel = (v?: string): string => enumText(PRESS_TOWARD_LABELS, v);

// --- the blocks, as the sheet reads them ---------------------------------------------------------

/** The step's own field names of each block, so a printed setting can be pointed at. Same role
 *  MachineSettingField plays for the equipment park. */
export type StepFactField =
  | 'needles'
  | 'securing'
  | 'rowSpacing'
  | 'fullness'
  | 'binding'
  | 'labelStitch'
  | 'holePrep'
  | 'reinforcement'
  | 'foldback'
  | 'cycleStitches'
  | 'peel'
  | 'secondPress'
  | 'weldAir'
  | 'weldFeed'
  | 'residualTail'
  | 'buttonhole'
  | 'bartack'
  | 'buttonPattern'
  | 'zipper';

/** The wave's blocks, typed over exactly what is read and with decimals as strings — so the wire
 *  shape (decimals as messages, passed through decimalToInput) and the form's row shape both
 *  satisfy it, the same trick the ladder resolvers use. */
export type StepFacts = {
  /**
   * ТОКЕН РАБОТЫ ШАГА (`TechCardOperation.work`). Пусто или `undefined` — работы нет.
   *
   * ОБЯЗАТЕЛЬНЫЙ ЧЛЕН, ХОТЬ И ПУСТОЙ, — по той же причине, по которой обязателен `work` у
   * `operationHeading`. Заголовок эту правку получил в R8, а составители ФАКТОВ — нет, и фраза
   * длины продолжала звать разрез петлёй, потому что про работу не спрашивала: необязательный
   * член позволяет промолчать, а компилятор молчит вместе с ним. Здесь этот отказ уже случался
   * дословно — блок `press` волны 0325 не доехал до `wireStepFacts`, компилятор промолчал, и семь
   * приёмов ВТО уехали в цех одним словом. Член, который обязан быть НАПИСАН, превращает
   * забывчивость в ошибку сборки.
   */
  work: string | undefined;
  operationType?: string;
  printMethod?: string;
  wetProcessKind?: string;
  stitching?: {
    needleCount?: number;
    needleGaugeMm?: string;
    seamSecuring?: string;
    rowSpacingMm?: string;
    fullnessRatio?: string;
    bindingStyle?: string;
    labelAttachStitch?: string;
  };
  placementLayout?: { count?: number; pitchMm?: string };
  hardware?: {
    attachMethod?: string;
    holePrep?: string;
    reinforcement?: string;
    foldbackMm?: string;
    cycleStitchCount?: number;
  };
  print?: { peelMode?: string; secondPressSec?: number };
  weld?: { airTemperatureC?: number; feedSpeedMMin?: string };
  trim?: { action?: string; residualAllowanceMm?: string };
  threadTrim?: { residualTailMaxMm?: string };
  clean?: { kind?: string };
  inspect?: { coverageMode?: string };
  /** ВТО (0325) — под-глагол и, при «на сторону», направление припуска. */
  press?: { action?: string; toward?: string };
  fastening?: {
    buttonholeStyle?: string;
    cutLengthMm?: string;
    buttonholeOrientation?: string;
    bartackLengthMm?: string;
    attachPattern?: string;
    zipperApplication?: string;
  };
};

/** The six REQUIRED discriminators alone — no decimals, so the WIRE step satisfies this directly and
 *  a caller that only wants the phrase does not have to convert its numbers first. */
export type StepDiscriminators = {
  printMethod?: string;
  wetProcessKind?: string;
  hardware?: { attachMethod?: string };
  trim?: { action?: string };
  clean?: { kind?: string };
  inspect?: { coverageMode?: string };
};

/** WHAT KIND OF WORK THIS STEP IS, in one phrase — the REQUIRED discriminator of whichever of the
 *  new verbs it carries. It heads the «machine / mode» column of the printed sheet exactly where a
 *  sewing step names its machine, and it is the line the frozen release prints beside the heading:
 *  one function, so a signed release and the sheet of the same card cannot describe a step
 *  differently. Empty for the verbs that have no discriminator (fold, pack, the press family and
 *  every legacy token) — and empty is the honest answer there, not a gap. */
export function stepDiscriminatorText(o: StepDiscriminators): string {
  return [
    printMethodLabel(o.printMethod),
    hardwareAttachMethodLabel(o.hardware?.attachMethod),
    trimActionLabel(o.trim?.action),
    cleaningKindLabel(o.clean?.kind),
    inspectCoverageLabel(o.inspect?.coverageMode),
    wetProcessKindLabel(o.wetProcessKind),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** ЧТО ИМЕННО ДЕЛАЕТ УТЮГ — и, при «на сторону», КУДА ЛЁГ ПРИПУСК (0325).
 *
 *  ПЕЧАТАЕТСЯ В КОЛОНКЕ «MACHINE / MODE», ПЕРВЫМ, ровно там же и по тому же доводу, по которому
 *  девять новых глаголов печатают там свой дискриминатор: колонка отвечает «на чём и в каком
 *  режиме», а под-глагол и есть режим. Без него в цех уезжало слово «press» одинаково для
 *  приутюживания, заутюживания, отпаривания, окончательной ВТО, посадки, оттяжки и формования —
 *  то есть ровно та дыра, ради которой волна и заводилась.
 *
 *  ОДНИМ ЭЛЕМЕНТОМ, А НЕ ДВУМЯ ЧЕРЕЗ «·»: направление не второй факт о шаге, а вторая половина
 *  одной фразы («press to one side, toward the front»), и разнесённое точкой оно читалось бы как
 *  ещё одна настройка пресса. Тот же приём, что у петли, где форма и направление — прилагательные
 *  к одной прорези.
 *
 *  ПОДПИСИ — ТЕ ЖЕ САМЫЕ КАРТЫ, что рисуют оба пикера в форме: второй копии слов не заводится,
 *  иначе технолог выбрал бы одно слово, а швея прочитала другое.
 *
 *  ПРО `PRESS_OPEN` СПЕЦИАЛЬНОГО ПРАВИЛА НЕТ. Пикер туда под-глагол не пишет (каноническая запись
 *  разутюжки — сам глагол), и у такого шага здесь пусто; а прочитанный с чужой записи `open`
 *  печатается как есть — молчать о том, что в записи стоит, композитору фактов не положено. */
export function stepPressText(o: StepFacts): string {
  const action = pressActionLabel(o.press?.action);
  if (!action) return '';
  const toward = pressTowardLabel(o.press?.toward);
  return toward ? `${action}, ${toward}` : action;
}

/** HOW MANY OF THEM AND HOW FAR APART — printed in the ZONE column, under the zone word, because
 *  that column answers «where on the garment» and this is the rest of that same answer. A count of
 *  one is not printed: the contract says an unset count MEANS one repeat, so the two are the same
 *  fact and only one of them deserves ink. */
export function stepPlacementText(o: StepFacts): string {
  const count = positive(o.placementLayout?.count);
  const pitch = mm(o.placementLayout?.pitchMm);
  return [count > 1 ? `× ${count}` : '', pitch ? `pitch ${pitch}` : ''].filter(Boolean).join(' · ');
}

/** THE FACTS ABOUT THE SEAM ITSELF, for the seam column — securing, the gap between rows, the
 *  fullness fed in, how the binding is folded, how a label is stitched on, and how much allowance a
 *  TRIM step leaves behind. That last one belongs here and not with the equipment for one reason:
 *  the cell above it already prints the allowance the piece was cut with, and «12 mm → trim back to
 *  5 mm» is one instruction split across two lines of the same cell. */
export function stepSeamFactTexts(o: StepFacts): string[] {
  const s = o.stitching;
  const fullness = (s?.fullnessRatio ?? '').trim();
  const residual = mm(o.trim?.residualAllowanceMm);
  return [
    seamSecuringLabel(s?.seamSecuring),
    // «STITCH ROWS», NOT A BARE «rows»: the same cell can carry «2 × 6 mm from the edge», where the
    // rows are the topstitch passes, and this number is the gap BETWEEN those passes — not the
    // gauge between the needles of one pass, which is a different fact in a different column. The
    // contract keeps the two apart by name («не путать с needle_gauge_mm»); paper has to as well.
    mm(s?.rowSpacingMm) ? `stitch rows ${mm(s?.rowSpacingMm)} apart` : '',
    // A RATIO, NOT A PERCENTAGE, and printed as one: 1.0 is «ply for ply», 2.0 is «gather it to
    // half its length». Quoted as «15%» the same number would be read as an allowance to add.
    fullness ? `fullness ${fullness} : 1` : '',
    bindingStyleLabel(s?.bindingStyle),
    labelAttachStitchLabel(s?.labelAttachStitch),
    residual ? `trim back to ${residual}` : '',
  ].filter(Boolean);
}

/** THE FACTS ABOUT THE TOOL AND ITS PROGRAM, for the «machine / mode» column — everything the
 *  operator sets before the first unit. The needle count and gauge lead because they join the
 *  needle point and size already printed there off the machine profile: one needle bar, one reading
 *  («2 needles, 6.4 mm apart · ballpoint Nm 90»). */
export function stepToolFactParts(
  o: StepFacts,
  /**
   * Каталог работ, если он доехал до этого экрана. Обязательный, хоть и пустой, ровно по доводу
   * одноимённого параметра `operationHeading`: имя без каталога — РЕШЕНИЕ, а не умолчание, и
   * экран, который называет шаг по-старому, обязан сказать это вслух, написав `undefined`.
   */
  workCatalog: WorkCatalog | undefined,
): Array<SettingPart<StepFactField>> {
  const s = o.stitching;
  const h = o.hardware;
  const p = o.print;
  const w = o.weld;
  const f = o.fastening;
  const needleCount = positive(s?.needleCount);
  const gauge = mm(s?.needleGaugeMm);
  // «2 needles, 6.4 mm apart» — ONE phrase, and the millimetres say what they span. Printed as
  // «gauge 6.4 mm» they stood in the same cell as the needle SIZE that comes off the machine
  // profile («ballpoint Nm 90»), and «gauge» is the trade word for BOTH: the spacing between needle
  // bars and the thickness of the needle itself. Joined with « · » the two even read as separate
  // settings, so the cell offered the floor two numbers about needles and named neither.
  const needles = [
    needleCount > 0 ? `${needleCount} ${needleCount === 1 ? 'needle' : 'needles'}` : '',
    gauge ? (needleCount > 0 ? `${gauge} apart` : `${gauge} between needles`) : '',
  ]
    .filter(Boolean)
    .join(', ');
  // ONE BUTTONHOLE, ONE ITEM. Shape and direction are adjectives on the same hole and the cut is
  // its size, so they are joined rather than listed: three items would read as three settings.
  const bhWords = [
    enumText(BUTTONHOLE_ORIENTATION_ADJECTIVE, f?.buttonholeOrientation),
    enumText(BUTTONHOLE_STYLE_ADJECTIVE, f?.buttonholeStyle),
  ]
    .filter(Boolean)
    .join(' ');
  const cut = mm(f?.cutLengthMm);
  // СУЩЕСТВИТЕЛЬНОЕ СПРАШИВАЕТ РАБОТУ, А НЕ ОДНУ МАШИНКУ (R8 / 0331). Слово здесь стояло
  // ЛИТЕРАЛОМ — «buttonhole» на любом шаге с длиной, — и на прорези под пояс (работа
  // `slit_overcast`) в цех уезжала бумага со словом «петля»: экран после 0331 звал поле «slit
  // cut», а печать спорила с ним ровно в ту сторону, где ошибку исправляет не разработчик, а
  // раскройщик. Лестница из четырёх ступеней живёт ОДНИМ местом (`cutLengthNoun`) и читается
  // отсюда же, откуда её читает ярлык контрола в редакторе: два написания одного слова — это тот
  // самый разъезд, который уже случился.
  const cutNoun = cutLengthNoun(workCatalog, o.work);
  const buttonhole = [bhWords || cut ? `${bhWords ? `${bhWords} ` : ''}${cutNoun}` : '', cut ? `cut ${cut}` : '']
    .filter(Boolean)
    .join(', ');
  const secondPress = positive(p?.secondPressSec);
  const air = positive(w?.airTemperatureC);
  const cycle = positive(h?.cycleStitchCount);
  const feed = (w?.feedSpeedMMin ?? '').trim();
  const foldback = mm(h?.foldbackMm);
  const bartack = mm(f?.bartackLengthMm);
  const tail = mm(o.threadTrim?.residualTailMaxMm);
  return nonEmpty<StepFactField>([
    { field: 'needles', text: needles },
    { field: 'holePrep', text: holePrepLabel(h?.holePrep) },
    { field: 'reinforcement', text: reinforcementLabel(h?.reinforcement) },
    { field: 'foldback', text: foldback ? `foldback ${foldback}` : '' },
    { field: 'cycleStitches', text: cycle > 0 ? `${cycle} stitches per cycle` : '' },
    { field: 'peel', text: peelModeLabel(p?.peelMode) },
    { field: 'secondPress', text: secondPress > 0 ? `second press ${secondPress} s` : '' },
    // ТОЛЬКО у проклейки: у ультразвука горячего воздуха нет вовсе, и «hot air» на его строке
    // отправило бы оператора искать регулятор, которого на машине не существует.
    { field: 'weldAir', text: air > 0 ? `hot air ${air} °C` : '' },
    { field: 'weldFeed', text: feed ? `feed ${feed} m/min` : '' },
    { field: 'residualTail', text: tail ? `thread tails max ${tail}` : '' },
    { field: 'buttonhole', text: buttonhole },
    { field: 'bartack', text: bartack ? `bartack ${bartack}` : '' },
    { field: 'buttonPattern', text: buttonAttachPatternLabel(f?.attachPattern) },
    { field: 'zipper', text: zipperApplicationLabel(f?.zipperApplication) },
  ]);
}


// ОБЯЗАТЕЛЬНЫЙ ВОПРОС ГЛАГОЛА — ОДНА ТАБЛИЦА НА ВЕСЬ ЭКРАН, И ЖИВЁТ ОНА ЗДЕСЬ, А НЕ В РЕДАКТОРЕ.
// Спрашивают её ДВОЕ: `operations-field` — в сетке открытого шага, `assembly-create-dialog` — на
// создании, где без ответа шаг рождается заведомо несохраняемым. Вторая копия таблицы означала бы,
// что седьмой глагол с дискриминатором добавят в один список и забудут в другом, — и диалог снова
// начнёт выпускать шаги, которые сервер отвергает. Подписи взяты из этого же файла, где их берёт
// печатный лист.
// ПИКЕР ИЗ ПЕЧАТНОГО СЛОВАРЯ, И ТОЛЬКО ОДНА СТРОКА ДОБАВЛЕНА СВОЯ. Карты подписей в
// operation-options пишут UNKNOWN пустой строкой намеренно: на бумаге «не указано» печатается
// НИЧЕМ. В селекте пустая строка — это пустая первая строка списка, поэтому шапку («— не указано —»)
// даёт вызывающий, а все содержательные слова остаются одними на экран и на лист.
//
// И ТА ЖЕ ЗАЩИТА ОТ НЕЗНАКОМОГО ТОКЕНА, что у machineTypeOptionsFor: каждая из этих карт ТОТАЛЬНА
// над контрактом, значит токен вне списка — не легаси, а значение НОВЕЕ этого бандла (обычное
// состояние проекта между выкаткой бэка и выкаткой клиента). Radix рисует селект со значением вне
// своих items ПУСТЫМ триггером, и технолог читает «свойства нет» там, где оно есть.
export function stepEnumOptions<T extends string>(
  labels: Record<T, string>,
  unsetCaption: string,
  current?: string,
): Array<{ value: string; label: string }> {
  const items = (Object.keys(labels) as T[]).map((value) => ({
    value: value as string,
    label: labels[value] || unsetCaption,
  }));
  const v = (current ?? '').trim();
  if (!v || v in labels) return items;
  return [...items, { value: v, label: `${v} — unknown to this app version` }];
}

// ДИСКРИМИНАТОР ГЛАГОЛА — ВТОРАЯ ОСЬ ТОЧНО ТАК ЖЕ, КАК МАШИНКА У «MACHINE». Шесть новых глаголов
// без своего поля — заголовок, а не инструкция: «печать» не говорит, шелкография это или
// гравировка, «контроль» — сплошной он или по выборке. Сервер требует их БЕЗУСЛОВНО, поэтому они
// стоят в ЯДРЕ сетки рядом с типом, а не в фолде: обязательное поле за закрытым аккордеоном — это
// сохранение, падающее на контроле, которого нет на экране (тот же довод, что у machine * и
// equipment *).
//
// ИМЯ ПОЛЯ ЗДЕСЬ — КЛЮЧ СТРОКИ ФОРМЫ, А НЕ `string`, И ЭТО НЕ ПЕДАНТИЗМ. Диалог создания пишет
// ответ технолога динамически, по имени из этой таблицы (`{ [field]: value }`), а маппер записи
// собирает операцию поле за полем и МОЛЧА выбрасывает имена, которых не знает. Значит опечатка в
// имени не доезжает до провода мусором — она доезжает законным `*_UNKNOWN` в требуемом поле, и
// сервер отвергает сохранение щитом `operation_kinds_aware`, не назвав причины: в полезной
// нагрузке всё выглядит правильно. Единственное место, где такую опечатку ещё можно поймать, —
// компиляция, поэтому тип берётся ИЗ САМОЙ ФОРМЫ (`z.input` схемы шага), а не выписывается вторым
// списком: список разошёлся бы со схемой ровно так же молча.
//
// Ключи сужены до СТРОКОВЫХ: ответ дискриминатора — токен enum'а, то есть строка, и указание на
// `topstitchRows` (число) или `inputKeys` (массив) — такая же опечатка, как и несуществующее имя.
type OperationFormRow = NonNullable<TechCardFormData['operations']>[number];
export type OperationFormStringField = {
  [K in keyof OperationFormRow]-?: NonNullable<OperationFormRow[K]> extends string ? K : never;
}[keyof OperationFormRow];

export const STEP_DISCRIMINATORS: Partial<
  Record<
    common_TechCardOperationType,
    {
      field: OperationFormStringField;
      label: string;
      labels: Record<string, string>;
      unset: string;
    }
  >
> = {
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: {
    field: 'attachMethod',
    label: 'held on by *',
    labels: HARDWARE_ATTACH_METHOD_LABELS,
    unset: '— how —',
  },
  TECH_CARD_OPERATION_TYPE_PRINT: {
    field: 'printMethod',
    label: 'print method *',
    labels: PRINT_METHOD_LABELS,
    unset: '— method —',
  },
  TECH_CARD_OPERATION_TYPE_TRIM: {
    field: 'trimAction',
    label: 'cut *',
    labels: TRIM_ACTION_LABELS,
    unset: '— which cut —',
  },
  TECH_CARD_OPERATION_TYPE_CLEAN: {
    field: 'cleaningKind',
    label: 'clean off *',
    labels: CLEANING_KIND_LABELS,
    unset: '— what —',
  },
  TECH_CARD_OPERATION_TYPE_INSPECT: {
    field: 'coverageMode',
    label: 'coverage *',
    labels: INSPECT_COVERAGE_LABELS,
    unset: '— how much —',
  },
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: {
    field: 'wetProcessKind',
    label: 'bath *',
    labels: WET_PROCESS_KIND_LABELS,
    unset: '— which bath —',
  },
};

/**
 * СЕНТИНЕЛ «НЕ ВЫБРАНО» У СЛОВАРЯ ДИСКРИМИНАТОРА — тот единственный член, чья подпись пуста; он
 * же и есть `*_UNKNOWN` контракта. Выводится ровно тем правилом, каким `stepEnumOptions` рисует
 * плейсхолдер, — иначе шесть токенов пришлось бы выписать третьим списком рядом с картами подписей
 * и `emptyOperation`, и разошёлся бы он молча.
 *
 * Нужен ТОМУ, КТО ДЕРЖИТ ЗНАЧЕНИЕ САМ (диалог создания): Radix запрещает `Select.Item` с пустым
 * value, поэтому «ещё не ответили» — это UNKNOWN-токен, а не пустая строка. В редакторе шага то же
 * значение приходит из `emptyOperation`, и спрашивать его там незачем.
 */
export function stepDiscriminatorUnset(labels: Record<string, string>): string {
  return Object.keys(labels).find((k) => !labels[k]) ?? '';
}
