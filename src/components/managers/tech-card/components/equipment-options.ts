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

// ЭКСПОРТИРОВАН РАДИ operation-options.ts, а не «на всякий случай»: там жили ДВА словаря,
// выписанных руками парами `{value,label}`, и вывод списка из тотальной карты — единственное, что
// делает их полноту предметом проверки tsc. Второй такой же helper рядом был бы третьей копией
// одного правила.
//
// ПОРЯДОК ПУНКТОВ ПИКЕРА = ПОРЯДОК КЛЮЧЕЙ КАРТЫ. `Object.keys` над строковыми (не числоподобными)
// ключами отдаёт порядок вставки — значит карту пишут в том порядке, в каком список должен
// читаться на экране, и «причесать» её по алфавиту или по перечислению = молча переставить пикер.
export function optionsFrom<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

// The machines of the park + OTHER. UNKNOWN is «not picked yet» and reads as a picker placeholder;
// use machineTypeLabel() where a blank is wanted instead.
//
// LOCKSTITCH_DOUBLE_NEEDLE ЖИВЁТ В СЛОВАРЕ, НО НЕ В ПИКЕРЕ (см. machineTypeOptions ниже). Он
// единственная цель канонизации замороженного легаси-глагола `double_needle`, поэтому снять его с
// контракта нельзя — старые строки перестали бы читаться; но двухигольность выразима числом игл, и
// с 0328 сервер ТРЕБУЕТ при этой машинке needle_count = 2. Писать её теперь полагается прямострочкой
// с двумя иглами, а подпись здесь нужна, чтобы уже записанный шаг прочитался словами.
//
// HARDWARE_ATTACH СНЯТ (0328): `MACHINE + hardware_attach` и `HARDWARE_SET + attach_method` говорили
// об одном факте, и машинки, которая делает только это, на floor не существует — прессы для
// фурнитуры не шьют. Глагол `HARDWARE_SET` остался единственным написанием.
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
  // TWO MACHINES THAT MAKE NO STITCH — and that is why neither carries an ISO 4915 number while
  // every other entry above either carries one or names an automat that does. They join fabric with
  // heat instead of thread: one lays a sealing tape with hot air, the other welds the plies
  // outright. The number is not omitted for brevity, it does not exist, and ISO4915_FIXED /
  // ISO4915_BY_THREADS are deliberately left without an entry for them so stitchTypeNumber() answers
  // '' rather than a guess printed on a sheet that goes to the floor.
  //
  // «seam-sealing tape» and not «taping»: BINDING_TAPING above is a SEWING machine with a binder on
  // it, the two would read as the same machine, and they are set up by different people.
  TECH_CARD_MACHINE_TYPE_SEAM_TAPING: 'seam-sealing tape (hot air)',
  TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER: 'ultrasonic welder',
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
//
// И ПОТОМУ БЕЗ `OTHER` (снят 0327): шкала с «другим» перестаёт быть шкалой — прецедент
// TechCardAutomationLevel. Всё, что «другое», это ступень плюс проза в threadTensionNote, а сам по
// себе `OTHER` не говорил даже, туже или слабее, — и на печатный лист уезжало слово ни о чём.
export const THREAD_TENSION_LABELS: Record<common_TechCardThreadTension, string> = {
  TECH_CARD_THREAD_TENSION_UNKNOWN: '— inherit —',
  TECH_CARD_THREAD_TENSION_LOOSER: 'looser than normal',
  TECH_CARD_THREAD_TENSION_NORMAL: 'normal',
  TECH_CARD_THREAD_TENSION_TIGHTER: 'tighter than normal',
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
  // The release sheet a heat-transfer step presses through — same slot as the teflon sheet, and the
  // reason this member arrives with the PRINT verb: a transfer pressed bare takes the adhesive onto
  // the platen.
  TECH_CARD_PRESS_CLOTH_SILICONE_PAPER: 'silicone paper',
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
  // «tape seam» and not «tape»: beside BINDING_TAPING's «bind» a bare «tape» reads as the same
  // operation done with a different word, and these two machines are not interchangeable.
  TECH_CARD_MACHINE_TYPE_SEAM_TAPING: 'tape seam',
  TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER: 'weld',
  // «other» has no verb to give: the step keeps the type's own word and its note says the rest.
  TECH_CARD_MACHINE_TYPE_OTHER: '',
};

// ПИКЕР — НЕ ВЕСЬ СЛОВАРЬ. Ровно одно исключение, и оно выписано здесь, а не спрятано в вызывающем:
// двухигольная прямострочка говорит то же, что прямострочка с needle_count = 2, и с 0328 сервер
// ТРЕБУЕТ при ней это число. Предлагать её значит предлагать выбор между двумя написаниями одного
// факта, из которых второе ещё и заставляет заполнить соседнюю ячейку строго определённым образом.
// Подпись при этом остаётся в MACHINE_TYPE_LABELS: уже записанный шаг обязан прочитаться словами, и
// machineTypeOptionsFor вернёт ему его собственную строку.
const OFF_THE_PICKER: ReadonlySet<common_TechCardMachineType> = new Set([
  'TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE',
]);

export const machineTypeOptions = optionsFrom(MACHINE_TYPE_LABELS).filter(
  (o) => !OFF_THE_PICKER.has(o.value),
);
export const pressEquipmentOptions = optionsFrom(PRESS_EQUIPMENT_LABELS);
export const needleTypeOptions = optionsFrom(NEEDLE_TYPE_LABELS);
export const bedTypeOptions = optionsFrom(BED_TYPE_LABELS);
export const automationLevelOptions = optionsFrom(AUTOMATION_LEVEL_LABELS);
export const threadTensionOptions = optionsFrom(THREAD_TENSION_LABELS);
export const pressClothOptions = optionsFrom(PRESS_CLOTH_LABELS);

/** The machine picker for ONE row: the whole park plus whatever that row already holds. A token
 *  outside the list cannot be a legacy value — MACHINE_TYPE_LABELS is total over the contract — so
 *  it is a machine NEWER than this bundle, which is the ordinary state of things between a backend
 *  deploy and a client deploy. Radix renders a select whose value is absent from its own items as a
 *  BLANK trigger, and a blank machine field on a step that HAS a machine is read as «nobody said
 *  which», which is the one thing this axis exists to stop. Same shape as operationTypeOptionsFor. */
export function machineTypeOptionsFor(
  current?: string,
): Array<{ value: common_TechCardMachineType; label: string }> {
  const v = (current ?? '') as common_TechCardMachineType;
  if (!v || (v in MACHINE_TYPE_LABELS && !OFF_THE_PICKER.has(v))) return machineTypeOptions;
  // ДВА РАЗНЫХ СЛУЧАЯ, ОДИН ОТВЕТ — ДОБАВИТЬ СТРОКУ ЭТОГО ШАГА. Токен, снятый с пикера, но живой в
  // словаре, получает СВОЮ подпись; токен вне словаря — это машинка НОВЕЕ бандла, и подпись у неё
  // честно техническая. Пустой триггер не годится ни там, ни там: он читается как «никто не сказал,
  // на чём», а это ровно то, что ось «на чём» существует чтобы исключить.
  const label = MACHINE_TYPE_LABELS[v] ?? `${v} — unknown to this app version`;
  return [...machineTypeOptions, { value: v, label }];
}

// WHICH PROCESS a press profile is for, so the step form can offer the right one by default. The
// server accepts exactly these four and refuses anything else — a press profile «for a lockstitch
// step» is not a thing a press can mean — so this list is a closed set, not a convenience subset.
export const pressProfileProcessOptions: Array<{
  value: common_TechCardOperationType;
  label: string;
}> = [
  { value: 'TECH_CARD_OPERATION_TYPE_UNKNOWN', label: 'any pressing step' },
  { value: 'TECH_CARD_OPERATION_TYPE_PRESS', label: 'press (to one side / steam)' },
  { value: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN', label: 'press open' },
  { value: 'TECH_CARD_OPERATION_TYPE_FUSING', label: 'fusing' },
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

/** The three types that ARE pressing, and therefore the three for which the equipment picker is
 *  REQUIRED. NOT the same question as «may this step carry press settings» — since the print verb
 *  arrived a step can be given a temperature and a dwell without pressing being what it is. Ask
 *  stepTypeOwnsBlock(t, 'pressSettings') for that one; this predicate stays the obligation. */
export const isPressStepType = (t?: string) =>
  t === 'TECH_CARD_OPERATION_TYPE_PRESS' ||
  t === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' ||
  t === 'TECH_CARD_OPERATION_TYPE_FUSING';

// WHICH FIELD FAMILIES A STEP TYPE MAY CARRY AT ALL — the same question the two predicates above
// ask about equipment, asked once for every family the operation-kinds wave added, and answered in
// ONE place for the same reason: the server refuses a field from the wrong family BY NAME and
// refuses the whole card with it, so the editor (which block to render), the clearing effect (what
// to wipe when the type changes), the save mapper (what may go on the wire) and the printed sheet
// must all agree. Four copies of this table would be four chances to disagree.
//
// A TOTAL `Record`, like every dictionary in this file, and here the totality earns the most: the
// next verb the contract gains fails the build on this map — which is the moment to decide what it
// carries — instead of quietly owning nothing, rendering as a bare row, and having its equipment
// wiped by the clearing effect on first open.
//
// IT IS THE VERB-LEVEL GATE AND ONLY THAT. Two families are narrowed further downstream and the
// narrowing deliberately does NOT live here, because it is not a fact about the verb:
//   · 'weld' also demands an EXPLICIT machine_type of seam_taping | ultrasonic_welder
//     (isWeldMachineType below) — a type reached through a profile key does not count;
//   · 'hardware' is whole only on HARDWARE_SET; on MACHINE it is the cycle trio (hole prep,
//     reinforcement, cycle stitch count) and the attach method is refused;
//   · 'fastening' fields each answer to their own machine_type (buttonhole, button_attach,
//     bartack, zipper_setting);
//   · 'pressSettings' is refused on PRINT when the print method is laser_engrave — a method with
//     no carrier and no platen. That is a fact about the METHOD, not about the verb.
// The bare fields print_method and wet_process_kind travel with 'print' and 'wetProcess'.
export type StepBlock =
  | 'stitching'
  | 'placement'
  | 'hardware'
  | 'print'
  | 'weld'
  | 'trim'
  | 'threadTrim'
  | 'clean'
  | 'inspect'
  | 'wetProcess'
  | 'fastening'
  | 'pressSettings';

const NO_BLOCKS: readonly StepBlock[] = [];

export const STEP_TYPE_BLOCKS: Record<common_TechCardOperationType, readonly StepBlock[]> = {
  TECH_CARD_OPERATION_TYPE_UNKNOWN: NO_BLOCKS,
  // 1-9: legacy. They cannot arrive from a read (0306 canonicalises on write) and are not offered
  // as a choice, but an archived release snapshot still renders through this map — and a snapshot
  // written before the wave carries none of these families, so an empty list is the true answer,
  // not a placeholder.
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_OVERLOCK: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_BLINDHEM: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_BARTACK: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_FUSING: ['pressSettings'],
  TECH_CARD_OPERATION_TYPE_HANDWORK: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_OTHER: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_MACHINE: ['stitching', 'placement', 'hardware', 'weld', 'fastening'],
  TECH_CARD_OPERATION_TYPE_PRESS: ['pressSettings'],
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: ['pressSettings'],
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: ['placement', 'hardware'],
  // PRINT BORROWS THE PRESS. A heat transfer is pressed — temperature, dwell, pressure and a
  // silicone-paper release sheet — so the ВТО block is legal here even though pressing is not what
  // the step IS: press_equipment stays optional for print and required for the three press verbs.
  TECH_CARD_OPERATION_TYPE_PRINT: ['placement', 'print', 'pressSettings'],
  TECH_CARD_OPERATION_TYPE_TRIM: ['trim'],
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: ['threadTrim'],
  TECH_CARD_OPERATION_TYPE_CLEAN: ['clean'],
  TECH_CARD_OPERATION_TYPE_INSPECT: ['inspect'],
  // Fold and pack carry NO fields at all, and that is the finding, not an omission: the wave asked
  // what a folding step needs to be told and the answer was «where it goes in the sequence, how
  // long it takes» — both of which every step already has.
  TECH_CARD_OPERATION_TYPE_FOLD: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_PACK: NO_BLOCKS,
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: ['wetProcess'],
};

/** Does this step type own that family of fields. An unrecognised token owns nothing — the safe
 *  direction, and the same one the label helpers take: a block that fails to render is fixed by
 *  adding a line here, a block rendered for a verb the server refuses fails the whole card. */
export const stepTypeOwnsBlock = (t: string | undefined, block: StepBlock): boolean =>
  (STEP_TYPE_BLOCKS[t as common_TechCardOperationType] ?? NO_BLOCKS).includes(block);

/** The two machines that join with heat rather than thread — the ONLY carriers of the weld block,
 *  and the reason it is a machine question and not a verb one. They also refuse the needle- and
 *  thread-side overrides of a sewing step (thread count, needle, tension, stitch width): there is
 *  no needle and no thread to have an opinion about. */
export const isWeldMachineType = (m?: string) =>
  m === 'TECH_CARD_MACHINE_TYPE_SEAM_TAPING' || m === 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER';

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
