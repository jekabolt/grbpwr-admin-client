import {
  common_TechCardAttachmentKind,
  common_TechCardGarmentZone,
  common_TechCardMachineType,
  common_TechCardOperationType,
  common_TechCardSeamClass,
  common_TechCardTopstitchMode,
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
};

// The PICKER is a curated SUBSET of the dictionary above — the label map is total because rendering
// must cover every token that can arrive, while offering a deprecated token as a choice would let
// somebody create new work in a retired vocabulary. Only the values are listed here; the labels come
// from the one map, so the picker and the printed sheet cannot say different things about a token.
//
// SIX CHOICES, DOWN FROM THIRTEEN, and the nine that left are not a simplification: they were the
// answer to a DIFFERENT question. «Overlock» never said what the step does, it said what it is done
// on, so the list forced «стачать» and «обметать» into one field and had no room at all for the
// machines the shop actually owns (coverlock, zigzag, the automats). Since 0306 the step says
// MACHINE and the machine picker beside it says which one — see equipment-options.ts.
//
// Ordered by how often a step is one of them, not alphabetically: almost every step is machine work,
// and press / press open are the межоперационные steps that used to be smuggled into a seam class.
const OPERATION_TYPE_PICKER: common_TechCardOperationType[] = [
  'TECH_CARD_OPERATION_TYPE_UNKNOWN',
  'TECH_CARD_OPERATION_TYPE_MACHINE',
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  'TECH_CARD_OPERATION_TYPE_FUSING',
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

export const topstitchModeOptions: Array<{ value: common_TechCardTopstitchMode; label: string }> = [
  { value: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN', label: '— none —' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_EDGE', label: 'edge' },
  { value: 'TECH_CARD_TOPSTITCH_MODE_WIDTH', label: 'at width' },
];

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
}): string {
  const typeVerb = args.operationType ? (OPERATION_TYPE_VERB[args.operationType] ?? '') : '';
  const verb =
    args.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE'
      ? machineTypeVerb(args.machineType) || typeVerb
      : typeVerb;
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
