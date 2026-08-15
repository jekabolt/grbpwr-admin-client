import {
  common_TechCardAutomationLevel,
  common_TechCardBedType,
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

// THE VERB OF A MACHINE STEP, and the reason this map exists at all: since 0306 the step type of
// every sewing step is the single word MACHINE, so a heading built from the type alone would read
// «machine · side seams» on the side seam, the buttonhole, the hem and the zip alike — twenty-five
// different operations under one name. The verb has to come from the second axis.
//
// These are VERBS, not machine names: the heading reads «overlock · side seams», so the entry for a
// machine whose name is already a verb is that word, and the automats say what they SET rather than
// what they are. MACHINE_TYPE_LABELS stays the picker's vocabulary (it names the machine, with its
// ISO number); this names the action, and the two are deliberately different strings.
//
// Total, like every other dictionary here: a machine added to the contract fails the build here
// rather than turning into a blank heading on a printed sheet.
export const MACHINE_TYPE_VERB: Record<common_TechCardMachineType, string> = {
  // '' and not 'machine': a step whose machine is not picked yet has no verb of its own, and the
  // heading falls back to the step type's own word (see operationHeading).
  TECH_CARD_MACHINE_TYPE_UNKNOWN: '',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: 'join',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: 'topstitch',
  TECH_CARD_MACHINE_TYPE_OVERLOCK: 'overlock',
  TECH_CARD_MACHINE_TYPE_COVERSTITCH: 'coverstitch',
  TECH_CARD_MACHINE_TYPE_COVERLOCK: 'coverlock',
  TECH_CARD_MACHINE_TYPE_CHAINSTITCH: 'chainstitch',
  TECH_CARD_MACHINE_TYPE_BLINDSTITCH: 'blindhem',
  TECH_CARD_MACHINE_TYPE_ZIGZAG: 'zigzag',
  TECH_CARD_MACHINE_TYPE_BARTACK: 'bartack',
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: 'buttonhole',
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: 'button attach',
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: 'embroider',
  TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION: 'AMF stitch',
  TECH_CARD_MACHINE_TYPE_HARDWARE_ATTACH: 'attach hardware',
  TECH_CARD_MACHINE_TYPE_ELASTIC_ATTACH: 'attach elastic',
  TECH_CARD_MACHINE_TYPE_BINDING_TAPING: 'bind',
  TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING: 'set zip',
  TECH_CARD_MACHINE_TYPE_GATHERING: 'gather',
  TECH_CARD_MACHINE_TYPE_PATCH_POCKET_AUTO: 'set patch pocket',
  TECH_CARD_MACHINE_TYPE_WELT_POCKET_AUTO: 'set welt pocket',
  TECH_CARD_MACHINE_TYPE_TEMPLATE_AUTO: 'template-sew',
  TECH_CARD_MACHINE_TYPE_COLLAR_CUFF_AUTO: 'set collar / cuff',
  TECH_CARD_MACHINE_TYPE_SLEEVE_SETTING_AUTO: 'set sleeve',
  TECH_CARD_MACHINE_TYPE_WAISTBAND_AUTO: 'set waistband',
  // «other» has no verb to give: the step keeps the type's own word and its note says the rest.
  TECH_CARD_MACHINE_TYPE_OTHER: '',
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

// The same four processes in one word, for a tile that has room for a pill and not for a sentence.
// DERIVED from the picker list rather than written out beside it: a second hand-written list of the
// same four members is the drift this file exists to prevent, and the picker's own labels are
// «short (parenthetical)» by construction, so the head of each is already the word.
export const pressProcessShort = (v?: string): string => {
  const label = pressProfileProcessOptions.find((o) => o.value === v)?.label ?? '';
  return label.split(' (')[0] ?? '';
};

// The label helpers return '' for the UNKNOWN member, exactly like zoneLabel: the dictionaries hold
// a PICKER placeholder there («— machine —»), and printing that on a tech pack or in a step heading
// would state a choice as if it were made.
//
// THEY TAKE A PLAIN STRING, not the generated union, and that is deliberate rather than lazy: the
// tech-card form holds every enum as `z.string()` (a nativeEnum would refuse the legacy tokens that
// archived release snapshots still carry), so a union signature would only mean a cast at every one
// of these call sites. The DRIFT CHECK is the exhaustive `Record` above — that is what fails the
// build when the contract gains a member — and it is not weakened by this. An unrecognised token
// returns '' for the same reason UNKNOWN does: rendering a raw wire token is worse than a blank.
const lookup = <T extends string>(labels: Record<T, string>, v: string | undefined, unset: T) =>
  !v || v === unset ? '' : (labels[v as T] ?? '');

export const machineTypeLabel = (v?: string): string =>
  lookup(MACHINE_TYPE_LABELS, v, 'TECH_CARD_MACHINE_TYPE_UNKNOWN');

// ── ISO 4915: ТИП СТЕЖКА ────────────────────────────────────────────────────────────────────────
//
// Цифры в подписях машинок — это ISO 4915, а не часть названия. Для большинства классов машинка и
// стежок — одно и то же: челночная делает 301 и ничего другого, и отдельное поле было бы вторым
// именем той же вещи. Но у ОБМЁТОЧНОЙ это неправда, и слэш в подписи — признание: 504, 514 и 516
// это три разных стежка на одном классе машин, с разной прочностью и разным расходом нитки. Лист,
// уходящий в цех, печатал перечисление, то есть предлагал оператору выбрать самому.
//
// Различающий факт в шаге УЖЕ ЕСТЬ — `thread_count`. Три нитки это 504, четыре 514, пять 516.
// Поэтому номер здесь ВЫВОДИТСЯ, а не заводится третьим полем: новая ось у шага («что × на чём ×
// каким стежком») повторила бы то, от чего уходил разрыв 0306, ради факта, который уже записан.
//
// РАСПОШИВАЛЬНАЯ СОЗНАТЕЛЬНО НЕ ВЫВОДИТСЯ. У неё соответствие ниток и номеров не однозначно (602 —
// двухигольный трёхниточный, 605 — трёхигольный пятиниточный, рядом живёт 604), и печатать догадку
// на бумагу для фабрики нельзя. Пока живой человек не подтвердит таблицу, там остаётся честный
// слэш.

/** Классы, у которых стежок один и не зависит ни от чего. */
const ISO4915_FIXED: Partial<Record<common_TechCardMachineType, string>> = {
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: '301',
  // Две иглы кладут два ряда ОДНОГО стежка: 301 остаётся 301.
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: '301',
  TECH_CARD_MACHINE_TYPE_CHAINSTITCH: '401',
  TECH_CARD_MACHINE_TYPE_BLINDSTITCH: '103',
  TECH_CARD_MACHINE_TYPE_ZIGZAG: '304',
};

/** Классы, у которых стежок определяется числом ниток. */
const ISO4915_BY_THREADS: Partial<Record<common_TechCardMachineType, Record<number, string>>> = {
  TECH_CARD_MACHINE_TYPE_OVERLOCK: { 3: '504', 4: '514', 5: '516' },
};

/**
 * Номер стежка по ISO 4915 для КОНКРЕТНОГО шага. Пусто — если класс машины его не определяет и
 * число ниток не названо: пустая строка честнее догадки.
 */
export function stitchTypeNumber(machineType?: string, threadCount?: number): string {
  const key = (machineType ?? '') as common_TechCardMachineType;
  const fixed = ISO4915_FIXED[key];
  if (fixed) return fixed;
  const byThreads = ISO4915_BY_THREADS[key];
  if (!byThreads) return '';
  const n = Number(threadCount ?? 0);
  return Number.isFinite(n) ? (byThreads[n] ?? '') : '';
}

/**
 * Подпись машинки для конкретного шага: перечисление номеров заменяется тем одним, который шаг и
 * означает. Словарь `MACHINE_TYPE_LABELS` при этом не трогается — он остаётся списком выбора, где
 * перечисление уместно, потому что там ещё не выбран ни один шаг.
 */
export function machineTypeLabelWithStitch(machineType?: string, threadCount?: number): string {
  const base = machineTypeLabel(machineType);
  const n = stitchTypeNumber(machineType, threadCount);
  if (!base || !n) return base;
  // Хвост из номеров срезается целиком: «overlock 504 / 514 / 516» → «overlock» → «overlock 514».
  const plain = base.replace(/\s+\d[\d\s/]*$/, '').trim();
  return `${plain} ${n}`;
}
export const pressEquipmentLabel = (v?: string): string =>
  lookup(PRESS_EQUIPMENT_LABELS, v, 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN');
export const needleTypeLabel = (v?: string): string =>
  lookup(NEEDLE_TYPE_LABELS, v, 'TECH_CARD_NEEDLE_TYPE_UNKNOWN');
export const bedTypeLabel = (v?: string): string =>
  lookup(BED_TYPE_LABELS, v, 'TECH_CARD_BED_TYPE_UNKNOWN');
export const automationLevelLabel = (v?: string): string =>
  lookup(AUTOMATION_LEVEL_LABELS, v, 'TECH_CARD_AUTOMATION_LEVEL_UNKNOWN');
export const threadTensionLabel = (v?: string): string =>
  lookup(THREAD_TENSION_LABELS, v, 'TECH_CARD_THREAD_TENSION_UNKNOWN');
export const pressClothLabel = (v?: string): string =>
  lookup(PRESS_CLOTH_LABELS, v, 'TECH_CARD_PRESS_CLOTH_UNKNOWN');
export const machineTypeVerb = (v?: string): string =>
  lookup(MACHINE_TYPE_VERB, v, 'TECH_CARD_MACHINE_TYPE_UNKNOWN');

// WHICH OF THE TWO EQUIPMENT AXES A STEP TYPE OWNS. One type answers «machine», three answer «ВТО»,
// the rest own neither — and the server refuses a field from the wrong block BY NAME, refusing the
// whole card with it. Three screens have to agree about this (the step editor, the card's equipment
// park and the printed sheet), so the predicate lives with the vocabulary rather than being retyped
// in each of them: a fourth ВТО type added to the contract has one place to be added here.
export const isMachineStepType = (t?: string) => t === 'TECH_CARD_OPERATION_TYPE_MACHINE';
export const isPressStepType = (t?: string) =>
  t === 'TECH_CARD_OPERATION_TYPE_PRESS' ||
  t === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' ||
  t === 'TECH_CARD_OPERATION_TYPE_FUSING';

// --- the inheritance ladder (§3) -----------------------------------------------------------------
//
// WHICH PROFILE A STEP INHERITS FROM. The server never materialises an inherited value — a NULL
// column means «ask the profile», and it stays NULL even when the technologist would have typed the
// same number — so resolving the ladder is the CLIENT's job, in the editor's placeholders and again
// on the printed sheet. Both must walk it the same way, which is why it lives here rather than
// inside the step editor.
//
// The ladder is: the step's own value → the profile it NAMES by key → the profile of its type WHEN
// THE CARD HOLDS EXACTLY ONE → card defaults, where those exist → «not set». The «exactly one» rung
// is not a convenience: with two overlocks on the card, «the overlock» is not an answer, and
// guessing the first one would print a thread count off a machine nobody chose.
//
// A key that resolves to nothing returns nothing (the step is detached — the server does the same
// silently on save), and matching by type is skipped entirely once a key is set: a named profile is
// a decision, and falling back from it would hide that the decision no longer points anywhere.
//
// Typed structurally, over the two fields the lookup actually reads, so the form's row shape (whose
// decimals are strings) and the wire type (whose decimals are messages) both satisfy it.
export function resolveMachineProfile<T extends { profileKey?: string; machineType?: string }>(
  machines: T[] | undefined,
  machineType: string | undefined,
  profileKey: string | undefined,
): T | undefined {
  const list = machines ?? [];
  const key = (profileKey ?? '').trim();
  if (key) return list.find((m) => (m.profileKey ?? '') === key);
  if (!machineType || machineType === 'TECH_CARD_MACHINE_TYPE_UNKNOWN') return undefined;
  const sameType = list.filter((m) => m.machineType === machineType);
  return sameType.length === 1 ? sameType[0] : undefined;
}

// A press profile also declares WHICH ВТО PROCESS it is for, and that narrows BOTH rungs of the
// press ladder: «the press of this card» is not an answer for a fusing step when the card's press
// profile was written for разутюжка, and neither is a profile that step happens to NAME. A profile
// with no process stated is universal and answers for all three.
//
// THE PICKER AND THIS FUNCTION MUST USE THE SAME PREDICATE — if the list offered one profile while
// the ladder counted two, the form would print «— pick one of 2 —» over a card that visibly holds
// one, or quote as inherited a profile the picker refuses to show. Hence the shared helper. It is
// the same one function, for the same reason, that the server keeps as pressProfileFitsStep: the
// process was dropped from one of two copies of this question there, and the answer silently
// widened.
export const pressProfileFitsStep = (
  profile: { operationType?: string },
  stepType: string | undefined,
): boolean =>
  !profile.operationType ||
  profile.operationType === 'TECH_CARD_OPERATION_TYPE_UNKNOWN' ||
  profile.operationType === stepType;

export function resolvePressProfile<
  T extends { profileKey?: string; pressEquipment?: string; operationType?: string },
>(
  presses: T[] | undefined,
  pressEquipment: string | undefined,
  profileKey: string | undefined,
  // The step's own type (PRESS / PRESS_OPEN / FUSING). Omitted, every process matches — which is
  // what a caller that only has a profile list (a printed sheet reading a frozen snapshot) needs.
  stepType?: string,
): T | undefined {
  const list = presses ?? [];
  const key = (profileKey ?? '').trim();
  // THE KEY IS NOT A BYPASS AROUND THE PROCESS, and this rung used to say the opposite: a named
  // profile came back whatever its process declared, on the argument that the technologist pointed
  // at it and the server accepts the reference (only the EQUIPMENT is checked on save — see
  // resolveProfileKey). It does accept the reference. It no longer accepts what the reference was
  // being read to MEAN: the sign-off gate walks this same ladder through pressProfileFitsStep at
  // both rungs, so a fusing step naming an ironing profile resolves to «not set» there and the
  // fresh CONSTRUCTION signature is refused for a fusing step with no temperature or dwell.
  //
  // With the old rule the editor showed 145 °C as inherited and the tech pack printed it onto paper
  // that went to the floor, while the save came back refusing a signature over numbers that are
  // visibly on screen — nothing to fix, because the fix is invisible. Same machine, different
  // program; a delamination after the first wash is what the two being confused costs.
  //
  // AND IT DOES NOT FALL THROUGH to the by-type rung, exactly as the server does not: the step
  // names THIS profile, and quietly resolving it against a different one is a second wrong answer.
  // The key stays on the step (it is the operator's only visible trace of the decision) — the
  // picker marks it as not fitting this process instead of hiding it.
  if (key) {
    const named = list.find((p) => (p.profileKey ?? '') === key);
    return named && (!stepType || pressProfileFitsStep(named, stepType)) ? named : undefined;
  }
  if (!pressEquipment || pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN') return undefined;
  const usable = list.filter(
    (p) => p.pressEquipment === pressEquipment && (!stepType || pressProfileFitsStep(p, stepType)),
  );
  return usable.length === 1 ? usable[0] : undefined;
}

// How a profile NAMES ITSELF wherever it is quoted as a source — «4 threads (оверлок у окна)». The
// human label wins because that is the thing standing in the corner of the shop; the machine's own
// name is the fallback for the profiles nobody has named, and neither is the key: the key is
// identity, and printing an ULID at somebody would say nothing about which machine it is.
export function machineProfileName(p: { label?: string; machineType?: string }): string {
  return p.label?.trim() || machineTypeLabel(p.machineType) || 'machine profile';
}

export function pressProfileName(p: { label?: string; pressEquipment?: string }): string {
  return p.label?.trim() || pressEquipmentLabel(p.pressEquipment) || 'press profile';
}

// --- the two construction fields the park RETIRED ------------------------------------------------
//
// `pressing` (free text) and `overlock_thread_count` (a single number per card) left
// TechCardConstruction with 0306: one thread count could describe one overlock, and a card is sewn
// on several. Migration 0306 moved the prose into construction.notes and turned the thread count
// into a real overlock profile.
//
// THERE IS NO READER FOR THEM HERE, and the two that were (legacyPressingText,
// legacyOverlockThreadsText) are gone rather than kept for archives. The argument for keeping them
// was that a RELEASE SNAPSHOT is immutable protojson written while those fields existed, so the
// frozen card still carries them. It does — IN THE DATABASE. It never reaches this client: the
// snapshot is parsed server-side into the CURRENT pb_common.TechCard with
// `protojson.UnmarshalOptions{DiscardUnknown: true}` (GetTechCardRelease), so a field that left the
// contract is dropped before the response is built, and there is no raw-JSON path beside it. The
// helpers therefore returned '' on every input that can exist, and the two rows they fed — in the
// release list and on the printed sheet — were permanently blank while promising otherwise.
//
// Reading those lines again is a SERVER change (a raw snapshot field, or a legacy-aware parse), and
// it would arrive with its own reader. A dead one standing here only says the archive is covered
// when it is not.
