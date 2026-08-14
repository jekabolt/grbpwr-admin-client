import {
  common_TechCardAutomationLevel,
  common_TechCardBedType,
  common_TechCardConstruction,
  common_TechCardMachineType,
  common_TechCardNeedleType,
  common_TechCardOperationType,
  common_TechCardPressCloth,
  common_TechCardPressEquipment,
  common_TechCardThreadTension,
} from 'api/proto-http/admin';

// THE EQUIPMENT VOCABULARY — the «на чём» axis of a step (0306).
//
// A step used to answer «what is done» and «on what machine» with ONE enum, which is why the old
// TechCardOperationType read like a machine list. The second axis lives here: TechCardMachineType
// for sewing, TechCardPressEquipment for ВТО, plus the settings a machine profile carries.
//
// EVERY DICTIONARY BELOW IS AN EXHAUSTIVE `Record<Enum, string>`, NOT A PARTIAL AND NOT AN ARRAY,
// and that shape is the whole point: this repo has no script that diffs the client's labels against
// the contract, so the type checker is the diff. Add a member to the proto and bump the submodule
// and `tsc` fails HERE, on a missing key, instead of the token leaking onto a printed tech pack as
// a raw `TECH_CARD_MACHINE_TYPE_COVERLOCK`. Remove one and it fails on the extra key. A
// `Partial<Record<…>>` or an `Array<{value,label}>` catches neither, which is how
// `OPERATION_TYPE_VERB` silently lost the members the operations break added.
//
// The picker lists are DERIVED from the dictionaries (`optionsFrom`) rather than typed out beside
// them — a vocabulary written twice is a vocabulary that drifts, and the half that drifts is always
// the one nobody looked at.
//
// LANGUAGE: English with the ISO 4915 stitch numbers, matching operation-options.ts. Half these
// names carry a number (301, 504, 602) that belongs to no language at all, the sewing happens in
// Poland, and the printed tech pack has been English on every column since the break.

function optionsFrom<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

// The 24 machines of the park + OTHER. UNKNOWN is «not picked yet» and reads as a picker
// placeholder; use machineTypeLabel() where a blank is wanted instead.
//
// LOCKSTITCH_DOUBLE_NEEDLE is not a duplicate of «topstitch»: it exists so migration 0306 could
// carry the legacy `double_needle` operation type across without collapsing it into the plain
// lockstitch and losing the fact somebody recorded.
export const MACHINE_TYPE_LABELS: Record<common_TechCardMachineType, string> = {
  TECH_CARD_MACHINE_TYPE_UNKNOWN: '— machine —',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: 'lockstitch 301',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: 'twin-needle lockstitch',
  TECH_CARD_MACHINE_TYPE_OVERLOCK: 'overlock 504 / 514 / 516',
  TECH_CARD_MACHINE_TYPE_COVERSTITCH: 'coverstitch 602 / 605',
  TECH_CARD_MACHINE_TYPE_COVERLOCK: 'coverlock',
  TECH_CARD_MACHINE_TYPE_CHAINSTITCH: 'chainstitch 401',
  TECH_CARD_MACHINE_TYPE_BLINDSTITCH: 'blindstitch 103',
  TECH_CARD_MACHINE_TYPE_ZIGZAG: 'zigzag 304',
  TECH_CARD_MACHINE_TYPE_BARTACK: 'bartack',
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: 'buttonhole',
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: 'button attach',
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: 'embroidery',
  TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION: 'AMF hand-stitch imitation',
  TECH_CARD_MACHINE_TYPE_HARDWARE_ATTACH: 'hardware attach',
  TECH_CARD_MACHINE_TYPE_ELASTIC_ATTACH: 'elastic attach',
  TECH_CARD_MACHINE_TYPE_BINDING_TAPING: 'binding / taping',
  TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING: 'zipper setting',
  TECH_CARD_MACHINE_TYPE_GATHERING: 'gathering',
  TECH_CARD_MACHINE_TYPE_PATCH_POCKET_AUTO: 'patch-pocket automat',
  TECH_CARD_MACHINE_TYPE_WELT_POCKET_AUTO: 'welt-pocket automat',
  TECH_CARD_MACHINE_TYPE_TEMPLATE_AUTO: 'template automat',
  TECH_CARD_MACHINE_TYPE_COLLAR_CUFF_AUTO: 'collar / cuff automat',
  TECH_CARD_MACHINE_TYPE_SLEEVE_SETTING_AUTO: 'sleeve-setting automat',
  TECH_CARD_MACHINE_TYPE_WAISTBAND_AUTO: 'waistband automat',
  TECH_CARD_MACHINE_TYPE_OTHER: 'other (see note)',
};

export const PRESS_EQUIPMENT_LABELS: Record<common_TechCardPressEquipment, string> = {
  TECH_CARD_PRESS_EQUIPMENT_UNKNOWN: '— equipment —',
  TECH_CARD_PRESS_EQUIPMENT_IRON: 'iron (pressing table)',
  TECH_CARD_PRESS_EQUIPMENT_PRESS: 'press',
  TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS: 'fusing press',
  TECH_CARD_PRESS_EQUIPMENT_STEAM_DUMMY: 'steam dummy',
  TECH_CARD_PRESS_EQUIPMENT_STEAMER: 'steamer',
  TECH_CARD_PRESS_EQUIPMENT_OTHER: 'other (see note)',
};

// The needle POINT — the fact that decides whether a knit is pierced or pushed aside. UNKNOWN is
// «inherit», never «universal by default»: defaulting it would state a choice nobody made.
export const NEEDLE_TYPE_LABELS: Record<common_TechCardNeedleType, string> = {
  TECH_CARD_NEEDLE_TYPE_UNKNOWN: '— inherit —',
  TECH_CARD_NEEDLE_TYPE_UNIVERSAL: 'universal (R)',
  TECH_CARD_NEEDLE_TYPE_BALLPOINT: 'ballpoint (SES / SUK)',
  TECH_CARD_NEEDLE_TYPE_STRETCH: 'stretch',
  TECH_CARD_NEEDLE_TYPE_JEANS: 'jeans / denim',
  TECH_CARD_NEEDLE_TYPE_LEATHER: 'leather',
  TECH_CARD_NEEDLE_TYPE_MICROTEX: 'microtex',
  TECH_CARD_NEEDLE_TYPE_EMBROIDERY: 'embroidery',
  TECH_CARD_NEEDLE_TYPE_OTHER: 'other (see note)',
};

// Bed and automation are machine IDENTITY, not step settings — they live on the profile only, and
// a step that needs a different bed picks a different machine_type instead.
export const BED_TYPE_LABELS: Record<common_TechCardBedType, string> = {
  TECH_CARD_BED_TYPE_UNKNOWN: '— bed —',
  TECH_CARD_BED_TYPE_FLATBED: 'flatbed',
  TECH_CARD_BED_TYPE_CYLINDER_BED: 'cylinder bed',
  TECH_CARD_BED_TYPE_POST_BED: 'post bed',
  TECH_CARD_BED_TYPE_FEED_OFF_ARM: 'feed-off-arm',
  TECH_CARD_BED_TYPE_OTHER: 'other',
};

// An ORDERED SCALE, and therefore with no «other» member — a scale with an «other» in it is no
// longer a scale.
export const AUTOMATION_LEVEL_LABELS: Record<common_TechCardAutomationLevel, string> = {
  TECH_CARD_AUTOMATION_LEVEL_UNKNOWN: '— automation —',
  TECH_CARD_AUTOMATION_LEVEL_BASIC: 'basic (mechanical)',
  TECH_CARD_AUTOMATION_LEVEL_SEMI_AUTO: 'semi-auto (trimmer / positioning)',
  TECH_CARD_AUTOMATION_LEVEL_AUTO: 'auto (programmable)',
};

// A CLOSED SCALE relative to the machine's own normal, plus a free note for the dial number a
// particular machine wants. A raw dial number as the only field was rejected: it means nothing
// across two machines of the same class.
export const THREAD_TENSION_LABELS: Record<common_TechCardThreadTension, string> = {
  TECH_CARD_THREAD_TENSION_UNKNOWN: '— inherit —',
  TECH_CARD_THREAD_TENSION_LOOSER: 'looser than normal',
  TECH_CARD_THREAD_TENSION_NORMAL: 'normal',
  TECH_CARD_THREAD_TENSION_TIGHTER: 'tighter than normal',
  TECH_CARD_THREAD_TENSION_OTHER: 'other (see note)',
};

// NONE IS NOT A SPELLING OF UNKNOWN HERE, and the labels have to keep them apart on screen: with a
// profile above the step, «not specified» means «take the profile's press cloth», so without an
// explicit «none» a step could never say «press this one bare». Same argument added NONE to the
// attachment kinds in operation-options.ts.
export const PRESS_CLOTH_LABELS: Record<common_TechCardPressCloth, string> = {
  TECH_CARD_PRESS_CLOTH_UNKNOWN: '— inherit —',
  TECH_CARD_PRESS_CLOTH_NONE: 'none — press bare',
  TECH_CARD_PRESS_CLOTH_PRESS_CLOTH: 'press cloth (dry)',
  TECH_CARD_PRESS_CLOTH_DAMP_PRESS_CLOTH: 'press cloth (damp)',
  TECH_CARD_PRESS_CLOTH_TEFLON_SHEET: 'teflon sheet',
  TECH_CARD_PRESS_CLOTH_OTHER: 'other (see note)',
};

export const machineTypeOptions = optionsFrom(MACHINE_TYPE_LABELS);
export const pressEquipmentOptions = optionsFrom(PRESS_EQUIPMENT_LABELS);
export const needleTypeOptions = optionsFrom(NEEDLE_TYPE_LABELS);
export const bedTypeOptions = optionsFrom(BED_TYPE_LABELS);
export const automationLevelOptions = optionsFrom(AUTOMATION_LEVEL_LABELS);
export const threadTensionOptions = optionsFrom(THREAD_TENSION_LABELS);
export const pressClothOptions = optionsFrom(PRESS_CLOTH_LABELS);

// WHICH PROCESS a press profile is for, so the step form can offer the right one by default. The
// server accepts exactly these four and refuses anything else — a press profile «for a lockstitch
// step» is not a thing a press can mean — so this list is a closed set, not a convenience subset.
export const pressProfileProcessOptions: Array<{
  value: common_TechCardOperationType;
  label: string;
}> = [
  { value: 'TECH_CARD_OPERATION_TYPE_UNKNOWN', label: 'any ВТО step' },
  { value: 'TECH_CARD_OPERATION_TYPE_PRESS', label: 'press (заутюжить / отпарить)' },
  { value: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN', label: 'press open (разутюжить)' },
  { value: 'TECH_CARD_OPERATION_TYPE_FUSING', label: 'fusing (дублирование)' },
];

// The label helpers return '' for the UNKNOWN member, exactly like zoneLabel: the dictionaries hold
// a PICKER placeholder there («— machine —»), and printing that on a tech pack or in a step heading
// would state a choice as if it were made.
export const machineTypeLabel = (v?: common_TechCardMachineType): string =>
  !v || v === 'TECH_CARD_MACHINE_TYPE_UNKNOWN' ? '' : MACHINE_TYPE_LABELS[v];
export const pressEquipmentLabel = (v?: common_TechCardPressEquipment): string =>
  !v || v === 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN' ? '' : PRESS_EQUIPMENT_LABELS[v];
export const needleTypeLabel = (v?: common_TechCardNeedleType): string =>
  !v || v === 'TECH_CARD_NEEDLE_TYPE_UNKNOWN' ? '' : NEEDLE_TYPE_LABELS[v];
export const bedTypeLabel = (v?: common_TechCardBedType): string =>
  !v || v === 'TECH_CARD_BED_TYPE_UNKNOWN' ? '' : BED_TYPE_LABELS[v];
export const automationLevelLabel = (v?: common_TechCardAutomationLevel): string =>
  !v || v === 'TECH_CARD_AUTOMATION_LEVEL_UNKNOWN' ? '' : AUTOMATION_LEVEL_LABELS[v];
export const threadTensionLabel = (v?: common_TechCardThreadTension): string =>
  !v || v === 'TECH_CARD_THREAD_TENSION_UNKNOWN' ? '' : THREAD_TENSION_LABELS[v];
export const pressClothLabel = (v?: common_TechCardPressCloth): string =>
  !v || v === 'TECH_CARD_PRESS_CLOTH_UNKNOWN' ? '' : PRESS_CLOTH_LABELS[v];

// --- the two construction fields the park RETIRED ------------------------------------------------
//
// `pressing` (free text) and `overlock_thread_count` (a single number per card) left
// TechCardConstruction with 0306: one thread count could describe one overlock, and a card is sewn
// on several. Migration 0306 moved the prose into construction.notes and turned the thread count
// into a real overlock profile.
//
// THE READER STAYS FOREVER, and not out of nostalgia: a RELEASE SNAPSHOT is immutable protojson
// written when those fields existed, and `tech_card_release` holds the whole enriched card as JSON.
// Rendering a frozen release through the CURRENT generated type would silently drop two lines that
// were part of what somebody signed. The cast is narrow and one-way — nothing writes these back.
type RetiredConstructionFields = {
  pressing?: string;
  overlockThreadCount?: number;
};

export function legacyPressingText(c?: common_TechCardConstruction): string {
  return (c as RetiredConstructionFields | undefined)?.pressing?.trim() ?? '';
}

export function legacyOverlockThreadsText(c?: common_TechCardConstruction): string {
  const n = (c as RetiredConstructionFields | undefined)?.overlockThreadCount ?? 0;
  return n > 0 ? `${n}-thread` : '';
}
