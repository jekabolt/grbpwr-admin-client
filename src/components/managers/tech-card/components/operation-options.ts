import {
  common_TechCardAttachmentKind,
  common_TechCardGarmentZone,
  common_TechCardOperationType,
  common_TechCardSeamClass,
  common_TechCardTopstitchMode,
} from 'api/proto-http/admin';

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
  TECH_CARD_OPERATION_TYPE_FUSING: 'fusing (дублирование)',
  TECH_CARD_OPERATION_TYPE_HANDWORK: 'hand work',
  TECH_CARD_OPERATION_TYPE_OTHER: 'other',
  TECH_CARD_OPERATION_TYPE_MACHINE: 'machine — sewn on…',
  TECH_CARD_OPERATION_TYPE_PRESS: 'press (заутюжить / отпарить)',
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: 'press open (разутюжить)',
};

// The PICKER is a curated SUBSET of the dictionary above — the label map is total because rendering
// must cover every token that can arrive, while offering a deprecated token as a choice would let
// somebody create new work in a retired vocabulary. Only the values are listed here; the labels come
// from the one map, so the picker and the printed sheet cannot say different things about a token.
const OPERATION_TYPE_PICKER: common_TechCardOperationType[] = [
  'TECH_CARD_OPERATION_TYPE_UNKNOWN',
  'TECH_CARD_OPERATION_TYPE_LOCKSTITCH',
  'TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE',
  'TECH_CARD_OPERATION_TYPE_OVERLOCK',
  'TECH_CARD_OPERATION_TYPE_COVERSTITCH',
  'TECH_CARD_OPERATION_TYPE_CHAINSTITCH',
  'TECH_CARD_OPERATION_TYPE_BLINDHEM',
  'TECH_CARD_OPERATION_TYPE_BARTACK',
  'TECH_CARD_OPERATION_TYPE_BUTTONHOLE',
  'TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH',
  'TECH_CARD_OPERATION_TYPE_FUSING',
  'TECH_CARD_OPERATION_TYPE_HANDWORK',
  'TECH_CARD_OPERATION_TYPE_OTHER',
];

export const operationTypeOptions: Array<{ value: common_TechCardOperationType; label: string }> =
  OPERATION_TYPE_PICKER.map((value) => ({ value, label: OPERATION_TYPE_LABELS[value] }));

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

export const topstitchModeOptions: Array<{ value: common_TechCardTopstitchMode; label: string }> = [
  { value: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN', label: '— none —' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_EDGE', label: 'edge' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_WIDTH', label: 'at width' },
];

// THE VERB OF A STEP HEADING — total, not `Partial`, and that change is the point: as a Partial this
// map went silently blank on every token the contract added, which is precisely what a bump is
// supposed to surface. UNKNOWN maps to '' because a step with no type has no verb to speak.
//
// MACHINE's verb here is a PLACEHOLDER. A machine step's real verb comes from its machine_type —
// otherwise every seam, hem and buttonhole on the card reads «machine» — and that lookup belongs
// with the step editor (TC2), which is also where the three other heading builders
// (sample-assembly-map, releases-field, issues-field) will be pointed at it.
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
export function operationHeading(args: {
  operationType?: common_TechCardOperationType;
  zone?: common_TechCardGarmentZone;
  pieceNames: string[];
  note?: string;
}): string {
  const verb = args.operationType ? (OPERATION_TYPE_VERB[args.operationType] ?? '') : '';
  const zone = zoneLabel(args.zone);
  const parts = [verb, zone].filter(Boolean);
  if (args.pieceNames.length > 0) parts.push(args.pieceNames.join(' + '));
  const composed = parts.join(' · ');
  const meaningful = verb && verb !== 'step' && verb !== 'hand';
  if (composed && (meaningful || zone || args.pieceNames.length > 0)) return composed;
  const firstNoteLine = (args.note ?? '').trim().split('\n')[0]?.trim();
  return firstNoteLine || composed || 'step';
}
