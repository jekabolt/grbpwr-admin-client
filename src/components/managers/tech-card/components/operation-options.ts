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
  common_TechCardPressureScale,
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
  machineTypeVerb,
  needleTypeLabel,
  pressClothLabel,
  threadTensionLabel,
} from './equipment-options';
// ГЛАГОЛ ЗАГОЛОВКА СПРАШИВАЕТ ВИД. Значение, а не тип: `operationHeading` — единственное место,
// где слово шага собирается, и вид обязан отвечать в нём же. Обратного импорта нет — граф
// односторонний (`operation-kinds` берёт отсюда только ТИП строки формы), цикла не возникает.
import { kindHeadingVerb } from './operation-kinds';
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
export const zoneOptions: Array<{ value: common_TechCardGarmentZone; label: string }> = [
  { value: 'TECH_CARD_GARMENT_ZONE_UNKNOWN', label: '— zone —' },
  { value: 'TECH_CARD_GARMENT_ZONE_OUTER', label: 'outer shell' },
  { value: 'TECH_CARD_GARMENT_ZONE_LINING', label: 'lining' },
  { value: 'TECH_CARD_GARMENT_ZONE_INTERLINING', label: 'interlining' },
  { value: 'TECH_CARD_GARMENT_ZONE_FRONT', label: 'front' },
  { value: 'TECH_CARD_GARMENT_ZONE_BACK', label: 'back' },
  { value: 'TECH_CARD_GARMENT_ZONE_SHOULDER', label: 'shoulder' },
  { value: 'TECH_CARD_GARMENT_ZONE_CHEST', label: 'chest' },
  { value: 'TECH_CARD_GARMENT_ZONE_WAIST', label: 'waist' },
  { value: 'TECH_CARD_GARMENT_ZONE_HIP', label: 'hip' },
  { value: 'TECH_CARD_GARMENT_ZONE_SLEEVE', label: 'sleeve' },
  { value: 'TECH_CARD_GARMENT_ZONE_ARMHOLE', label: 'armhole' },
  { value: 'TECH_CARD_GARMENT_ZONE_COLLAR', label: 'collar' },
  { value: 'TECH_CARD_GARMENT_ZONE_NECKLINE', label: 'neckline' },
  { value: 'TECH_CARD_GARMENT_ZONE_HEM', label: 'hem' },
  { value: 'TECH_CARD_GARMENT_ZONE_POCKET', label: 'pocket' },
  { value: 'TECH_CARD_GARMENT_ZONE_CLOSURE', label: 'closure' },
  { value: 'TECH_CARD_GARMENT_ZONE_OTHER', label: 'other' },
];

// ISO 4916, grouped by its six families. The old Russian list held «стачной взаутюжку» and «стачной
// вразутюжку» as two entries — one class pressed two ways — so the field answered two questions with
// one value. The pressing DIRECTION is a step of its own since 0306 — PRESS (заутюжить) and
// PRESS_OPEN (разутюжить) — not a seam class, and no longer prose on the card's defaults either.
export const seamClassOptions: Array<{ value: common_TechCardSeamClass; label: string }> = [
  { value: 'TECH_CARD_SEAM_CLASS_UNKNOWN', label: '— inherit —' },
  { value: 'TECH_CARD_SEAM_CLASS_SS_PLAIN', label: 'SS — plain seam' },
  { value: 'TECH_CARD_SEAM_CLASS_SS_FRENCH', label: 'SS — French seam' },
  { value: 'TECH_CARD_SEAM_CLASS_LS_LAPPED', label: 'LS — lapped / topstitched' },
  { value: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED', label: 'LS — flat-felled' },
  { value: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW', label: 'EF — hem, raw edge' },
  { value: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED', label: 'EF — hem, turned twice' },
  { value: 'TECH_CARD_SEAM_CLASS_EF_FACED', label: 'EF — faced' },
  { value: 'TECH_CARD_SEAM_CLASS_BS_BOUND', label: 'BS — bound' },
  { value: 'TECH_CARD_SEAM_CLASS_FS_FLAT', label: 'FS — flat / butted' },
  { value: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH', label: 'OS — ornamental topstitch' },
  { value: 'TECH_CARD_SEAM_CLASS_OTHER', label: 'other' },
];

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

export const attachmentOptions: Array<{ value: common_TechCardAttachmentKind; label: string }> = (
  Object.keys(ATTACHMENT_KIND_LABELS) as common_TechCardAttachmentKind[]
).map((value) => ({ value, label: ATTACHMENT_KIND_LABELS[value] }));

// '' for UNKNOWN («inherit»), the real label for NONE («runs bare») — the two are different facts
// since the card grew machine profiles, and a helper that folded them together would put the word
// «none» on a step that simply inherits the profile's foot. Takes a plain string for the reason
// spelled out over the equipment helpers: the form holds these enums as strings.
export const attachmentKindLabel = (v?: string): string =>
  !v || v === 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN'
    ? ''
    : (ATTACHMENT_KIND_LABELS[v as common_TechCardAttachmentKind] ?? '');

// THE LABELS NAME WHAT THE DISTANCE IS MEASURED FROM, because two of these five modes carry a
// number and they do not measure it from the same place: `width` is an inset from the EDGE, and
// `parallel_to_seam` is an offset from the SEAM LINE, which on a lapped or felled seam is a
// different line entirely. The old label «at width» was unambiguous only while it was the sole mode
// with a number; beside «parallel» it stops being one, and the operator with a guide bar has no way
// to tell which line to set it against. Same fact governs the input's own caption and the printed
// sheet — see TOPSTITCH_MODE_HAS_WIDTH below, which is where the question «is there a number at
// all» is asked.
export const topstitchModeOptions: Array<{ value: common_TechCardTopstitchMode; label: string }> = [
  { value: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN', label: '— none —' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_EDGE', label: 'edge' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_WIDTH', label: 'at width from the edge' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH', label: 'in the ditch' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM', label: 'parallel — offset from the seam' },
];

/** The picker for ONE step: the whole list plus whatever that step already holds. Same defensive
 *  shape as operationTypeOptionsFor, for a sharper reason — this vocabulary has no deprecated half,
 *  so a token missing from the list is not legacy, it is a mode NEWER than this bundle, which is the
 *  normal state of the project between a backend deploy and a client deploy. Radix renders a select
 *  whose value is absent from its own items as a BLANK trigger, so without this the row would read
 *  «no topstitch» on a step that has one — and, because the editor writes the form back on save,
 *  that reading is what the next save records. */
export function topstitchModeOptionsFor(
  current?: string,
): Array<{ value: common_TechCardTopstitchMode; label: string }> {
  const v = (current ?? '') as common_TechCardTopstitchMode;
  if (!v || topstitchModeOptions.some((o) => o.value === v)) return topstitchModeOptions;
  return [...topstitchModeOptions, { value: v, label: `${v} — unknown to this app version` }];
}

// DOES THIS MODE CARRY A WIDTH — one answer, stated PER MODE, and deliberately not written as
// «anything that is not WIDTH». Four surfaces asked that question separately and all four asked it
// by negation; this map is the single place they now ask.
//
// WHY POSITIVE. The negative form is a sentence about a mode the bundle has never heard of, and it
// gets that sentence wrong. An older bundle reading a card saved by a newer one is the normal state
// of this project between a backend deploy and a client deploy, and «not WIDTH» made every consumer
// act on it: the editor wiped the width AND the row count merely by OPENING the step (with
// shouldDirty, so the next save wrote the loss), the schema refused the step and the whole card
// with it, and the mapper dropped the number on the way out. Three silent losses, all of them about
// a mode that may well have a width.
//
// Stated positively the same token matches no key, the lookup is `undefined` — neither «has a
// width» nor «has none» — and every consumer leaves it alone. The positive form has its own failure
// and it is the cheap one: a new mode that DOES carry a width, not yet classified here, hides its
// input until somebody adds the line. A control that is missing gets fixed by editing this map; a
// number that was erased is not fixed at all.
//
// A total `Record`, not an array, for the reason every dictionary in this feature is one (see the
// header of equipment-options.ts): nothing in this repo diffs the client against the contract, so
// tsc is the diff — a member added by a proto bump fails to compile until it is classified here.
export const TOPSTITCH_MODE_HAS_WIDTH: Record<common_TechCardTopstitchMode, boolean> = {
  // «none» — there is no topstitch for a width to belong to.
  TECH_CARD_TOPSTITCH_MODE_UNKNOWN: false,
  // Run along the very edge: the distance IS the edge, so there is nothing left to state.
  TECH_CARD_TOPSTITCH_MODE_EDGE: false,
  // The inset from the edge is the entire instruction.
  TECH_CARD_TOPSTITCH_MODE_WIDTH: true,
  // Sunk into the seam line itself. The distance is zero by definition, and a number offered here
  // would be a number about nothing — the server refuses one outright.
  TECH_CARD_TOPSTITCH_MODE_IN_DITCH: false,
  // A number, and NOT the same number as `width`: this one is measured from the SEAM LINE, not from
  // the finished edge. The classification here answers only «is there a number»; what it is
  // measured from is said by the label (topstitchModeOptions) and has to be said again by the
  // input's caption and by the printed sheet, or the operator sets the guide against the wrong line.
  TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM: true,
};

/** The mode is KNOWN and carries a width: show the input, require the number, print it. An unknown
 *  token answers `false` — the safe direction, one control missing and nothing touched. */
export const topstitchModeHasWidth = (mode?: string): boolean =>
  TOPSTITCH_MODE_HAS_WIDTH[mode as common_TechCardTopstitchMode] === true;

/** The mode is KNOWN and carries NO width — the only licence to CLEAR, to REFUSE or to DROP one.
 *  Not `!topstitchModeHasWidth`: an unknown token answers `false` to BOTH, and that third state is
 *  the whole reason this pair exists rather than a single predicate. */
export const topstitchModeHasNoWidth = (mode?: string): boolean =>
  TOPSTITCH_MODE_HAS_WIDTH[mode as common_TechCardTopstitchMode] === false;

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
}): string {
  const typeVerb = args.operationType ? (OPERATION_TYPE_VERB[args.operationType] ?? '') : '';
  // ВИД СПРАШИВАЕТСЯ ПЕРВЫМ, и отвечает он только там, где говорит больше второй оси.
  const kindVerb = kindHeadingVerb({
    operationType: args.operationType,
    machineType: args.machineType,
    seamClass: args.seamClass,
  });
  const verb =
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

/** H2 — how the hole under the hardware is made. */
export const HOLE_PREP_LABELS: Record<common_TechCardHolePrep, string> = {
  TECH_CARD_HOLE_PREP_UNKNOWN: '',
  TECH_CARD_HOLE_PREP_NONE: 'no hole prep',
  TECH_CARD_HOLE_PREP_PRONG_PIERCE: 'prong pierces the cloth',
  TECH_CARD_HOLE_PREP_AWL_PIERCE: 'awl-pierced hole',
  TECH_CARD_HOLE_PREP_PUNCH: 'punched hole',
};

/** H3 — what sits behind the hardware, the buttonhole or the bartack. The MATERIAL of it is a BOM
 *  line; this says only which way it is done. */
export const REINFORCEMENT_LABELS: Record<common_TechCardReinforcement, string> = {
  TECH_CARD_REINFORCEMENT_UNKNOWN: '',
  TECH_CARD_REINFORCEMENT_NONE: 'no reinforcement',
  TECH_CARD_REINFORCEMENT_FUSIBLE_PATCH: 'fusible patch behind',
  TECH_CARD_REINFORCEMENT_FABRIC_STAY: 'fabric stay behind',
  TECH_CARD_REINFORCEMENT_TAPE: 'tape behind',
  TECH_CARD_REINFORCEMENT_SEAM_CATCH: 'caught into the seam',
  TECH_CARD_REINFORCEMENT_OTHER: 'other reinforcement',
};

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
 *  peel pulled cold lifts the print. NONE says there is no carrier at all. */
export const PEEL_MODE_LABELS: Record<common_TechCardPeelMode, string> = {
  TECH_CARD_PEEL_MODE_UNKNOWN: '',
  TECH_CARD_PEEL_MODE_NONE: 'no carrier to peel',
  TECH_CARD_PEEL_MODE_HOT: 'hot peel',
  TECH_CARD_PEEL_MODE_WARM: 'warm peel',
  TECH_CARD_PEEL_MODE_COLD: 'cold peel',
};

/** P6 — an ordered scale, and therefore printed as words: the number the platen gauge shows is a
 *  cylinder reading, not the pressure on the cloth (that one, when it is known, is
 *  press_pressure_n_cm2 and prints in N/cm²). */
export const PRESSURE_SCALE_LABELS: Record<common_TechCardPressureScale, string> = {
  TECH_CARD_PRESSURE_SCALE_UNKNOWN: '',
  TECH_CARD_PRESSURE_SCALE_LIGHT: 'light pressure',
  TECH_CARD_PRESSURE_SCALE_MEDIUM: 'medium pressure',
  TECH_CARD_PRESSURE_SCALE_FIRM: 'firm pressure',
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
  TECH_CARD_CLEANING_KIND_CHALK_REMOVAL: 'chalk removal',
  TECH_CARD_CLEANING_KIND_ADHESIVE_REMOVAL: 'adhesive removal',
  TECH_CARD_CLEANING_KIND_OTHER: 'something else (see note)',
};

/** Q1 — the discriminator of an INSPECT step, and the one fact that says how much work it is:
 *  «every unit» and «one per bundle» are the same verb over a hundredfold difference in time. */
export const INSPECT_COVERAGE_LABELS: Record<common_TechCardInspectCoverage, string> = {
  TECH_CARD_INSPECT_COVERAGE_UNKNOWN: '',
  TECH_CARD_INSPECT_COVERAGE_EACH_UNIT: 'check every unit',
  TECH_CARD_INSPECT_COVERAGE_SAMPLE_PER_BUNDLE: 'sample per bundle',
  TECH_CARD_INSPECT_COVERAGE_AQL_PLAN: 'AQL plan',
  TECH_CARD_INSPECT_COVERAGE_FIRST_OUTPUT: 'first output of the run',
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
 *  под-глагола обязана читаться и сохраняться как есть. */
export const PRESS_ACTION_LABELS: Record<common_TechCardPressAction, string> = {
  TECH_CARD_PRESS_ACTION_UNKNOWN: '',
  TECH_CARD_PRESS_ACTION_PRESS_FLAT: 'press flat',
  TECH_CARD_PRESS_ACTION_TO_ONE_SIDE: 'press to one side',
  // Уживается с ГЛАГОЛОМ `PRESS_OPEN` и не заменяет его: канонической записью разутюжки остаётся
  // глагол, а этот член существует, чтобы прочитать шаг, записанный вторым написанием.
  TECH_CARD_PRESS_ACTION_OPEN: 'press open',
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
  TECH_CARD_PRESS_TOWARD_SIDE: 'toward the side seam',
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
 *  scheme carries «label»: in a settings list nothing above it says what is being set. */
export const ZIPPER_APPLICATION_LABELS: Record<common_TechCardZipperApplication, string> = {
  TECH_CARD_ZIPPER_APPLICATION_UNKNOWN: '',
  TECH_CARD_ZIPPER_APPLICATION_CENTERED: 'centred zip',
  TECH_CARD_ZIPPER_APPLICATION_LAPPED: 'lapped zip',
  TECH_CARD_ZIPPER_APPLICATION_INVISIBLE: 'invisible zip',
  TECH_CARD_ZIPPER_APPLICATION_EXPOSED: 'exposed zip',
  TECH_CARD_ZIPPER_APPLICATION_FLY: 'fly zip',
  TECH_CARD_ZIPPER_APPLICATION_SEPARATING_CF: 'separating zip, centre front',
  TECH_CARD_ZIPPER_APPLICATION_IN_SEAM_POCKET: 'in-seam pocket zip',
  TECH_CARD_ZIPPER_APPLICATION_OTHER: 'zip, other application',
};

export const seamSecuringLabel = (v?: string): string => enumText(SEAM_SECURING_LABELS, v);
export const bindingStyleLabel = (v?: string): string => enumText(BINDING_STYLE_LABELS, v);
export const labelAttachStitchLabel = (v?: string): string =>
  enumText(LABEL_ATTACH_STITCH_LABELS, v);
export const hardwareAttachMethodLabel = (v?: string): string =>
  enumText(HARDWARE_ATTACH_METHOD_LABELS, v);
export const holePrepLabel = (v?: string): string => enumText(HOLE_PREP_LABELS, v);
export const reinforcementLabel = (v?: string): string => enumText(REINFORCEMENT_LABELS, v);
export const printMethodLabel = (v?: string): string => enumText(PRINT_METHOD_LABELS, v);
export const peelModeLabel = (v?: string): string => enumText(PEEL_MODE_LABELS, v);
export const pressureScaleLabel = (v?: string): string => enumText(PRESSURE_SCALE_LABELS, v);
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
  | 'pressure'
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
  print?: { peelMode?: string; secondPressSec?: number; pressureScale?: string };
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
    mm(s?.rowSpacingMm) ? `rows ${mm(s?.rowSpacingMm)} apart` : '',
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
 *  («2 needles · gauge 6.4 mm · ballpoint Nm 90»). */
export function stepToolFactParts(o: StepFacts): Array<SettingPart<StepFactField>> {
  const s = o.stitching;
  const h = o.hardware;
  const p = o.print;
  const w = o.weld;
  const f = o.fastening;
  const needleCount = positive(s?.needleCount);
  const gauge = mm(s?.needleGaugeMm);
  const needles = [
    needleCount > 0 ? `${needleCount} ${needleCount === 1 ? 'needle' : 'needles'}` : '',
    gauge ? `gauge ${gauge}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // ONE BUTTONHOLE, ONE ITEM. Shape and direction are adjectives on the same hole and the cut is
  // its size, so they are joined rather than listed: three items would read as three settings.
  const bhWords = [
    enumText(BUTTONHOLE_ORIENTATION_ADJECTIVE, f?.buttonholeOrientation),
    enumText(BUTTONHOLE_STYLE_ADJECTIVE, f?.buttonholeStyle),
  ]
    .filter(Boolean)
    .join(' ');
  const cut = mm(f?.cutLengthMm);
  const buttonhole = [bhWords || cut ? `${bhWords ? `${bhWords} ` : ''}buttonhole` : '', cut ? `cut ${cut}` : '']
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
    { field: 'pressure', text: pressureScaleLabel(p?.pressureScale) },
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
