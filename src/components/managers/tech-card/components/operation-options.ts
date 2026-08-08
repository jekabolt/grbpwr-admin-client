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

export const operationTypeOptions: Array<{ value: common_TechCardOperationType; label: string }> = [
  { value: 'TECH_CARD_OPERATION_TYPE_UNKNOWN', label: '— operation —' },
  { value: 'TECH_CARD_OPERATION_TYPE_LOCKSTITCH', label: 'join — lockstitch 301' },
  { value: 'TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE', label: 'topstitch — twin needle' },
  { value: 'TECH_CARD_OPERATION_TYPE_OVERLOCK', label: 'overlock — 504 / 514 / 516' },
  { value: 'TECH_CARD_OPERATION_TYPE_COVERSTITCH', label: 'coverstitch — 602 / 605' },
  { value: 'TECH_CARD_OPERATION_TYPE_CHAINSTITCH', label: 'chainstitch — 401' },
  { value: 'TECH_CARD_OPERATION_TYPE_BLINDHEM', label: 'blindhem — 103' },
  { value: 'TECH_CARD_OPERATION_TYPE_BARTACK', label: 'bartack — 304' },
  { value: 'TECH_CARD_OPERATION_TYPE_BUTTONHOLE', label: 'buttonhole' },
  { value: 'TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH', label: 'button attach' },
  { value: 'TECH_CARD_OPERATION_TYPE_FUSING', label: 'fuse / press' },
  { value: 'TECH_CARD_OPERATION_TYPE_HANDWORK', label: 'hand' },
  { value: 'TECH_CARD_OPERATION_TYPE_OTHER', label: 'other' },
];

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
// one value. Pressing direction is prose on the card's defaults, not a seam class.
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

// No «none» entry, deliberately: for a presser foot «none» and «not specified» are the same fact to
// everyone downstream, and offering both makes the operator choose between two spellings of nothing.
export const attachmentOptions: Array<{ value: common_TechCardAttachmentKind; label: string }> = [
  { value: 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN', label: '— none —' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_BINDER', label: 'binder' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_HEMMER_FOLDER', label: 'hemmer folder' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_SCROLL_FOOT', label: 'scroll foot' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_ZIPPER_FOOT', label: 'zipper foot' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_INVISIBLE_ZIPPER_FOOT', label: 'invisible zipper foot' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_EDGE_GUIDE', label: 'edge guide' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_PIPING_FOOT', label: 'piping foot' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_ELASTIC_ATTACHMENT', label: 'elastic attachment' },
  { value: 'TECH_CARD_ATTACHMENT_KIND_OTHER', label: 'other' },
];

export const topstitchModeOptions: Array<{ value: common_TechCardTopstitchMode; label: string }> = [
  { value: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN', label: '— none —' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_EDGE', label: 'edge' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_WIDTH', label: 'at width' },
];

const OPERATION_TYPE_VERB: Partial<Record<common_TechCardOperationType, string>> = {
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
