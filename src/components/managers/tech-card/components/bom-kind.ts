import {
  common_TechCardBomKind,
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';

// ЧТО ЭТО ЗА ПОЗИЦИЯ (kind, 0278) — the client half of the closed vocabulary that classifies a
// NON-roll-goods BOM line. The server owns the truth (entity.bomKindHomeSection + chk_bom_item_kind);
// this file mirrors it so the UI can offer only the kinds a section may legally carry, instead of
// letting the operator pick a value the store will refuse on save.
//
// KIND ANSWERS «WHAT IS IT», THE LINE'S NAME ANSWERS «WHICH ONE OF THOSE, ON THIS CARD». The two
// coexist and neither replaces the other: «main zipper» and «pocket zipper» are both ZIPPER and
// must stay tellable apart, which is why the free-text role is still the slot's identity everywhere
// (the material plan and the tech pack both print it).
//
// If the server's map changes, this one must change with it — there is no generated bridge. The
// failure is loud rather than silent: a kind offered here but rejected there comes back as a
// field-tagged violation on bom_items[i].kind naming the section, not as bad data.

/** «Ещё не классифицировали» — a real state, never a validation failure. */
export const UNSET_KIND = 'TECH_CARD_BOM_KIND_UNSET' as const;

/** The section each kind belongs to. `other` is deliberately absent — it is legal everywhere. */
export const KIND_HOME_SECTION: Partial<Record<common_TechCardBomKind, string>> = {
  // фурнитура
  TECH_CARD_BOM_KIND_ZIPPER: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_ZIPPER_SLIDER: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_BUTTON: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_SNAP: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_RIVET: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_EYELET: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_HOOK_AND_BAR: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_SNAP_HOOK: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_BUCKLE: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_STRAP_ADJUSTER: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_RING: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_TOGGLE: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_CORD_STOPPER: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_CORD_END: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_MAGNET: 'TECH_CARD_BOM_SECTION_HARDWARE',
  TECH_CARD_BOM_KIND_CHAIN: 'TECH_CARD_BOM_SECTION_HARDWARE',
  // тесьма / резинка
  TECH_CARD_BOM_KIND_ELASTIC: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_DRAWCORD: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_BINDING: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_TAPE: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_PIPING: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_WEBBING: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_HOOK_LOOP: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_BONING: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_LACE: 'TECH_CARD_BOM_SECTION_TRIM',
  TECH_CARD_BOM_KIND_RIBBING: 'TECH_CARD_BOM_SECTION_TRIM',
  // Лента с ГОРЯЧИМ КЛЕЕМ, а не пришивная: её кладёт машинка seam_taping поверх готового шва. Дом —
  // TRIM, к остальным лентам (tape, binding, piping, webbing): секция отвечает на «чем это лежит в
  // спецификации», а не «чем это ставят», и по этой мерке она соседка ленты, а не машинки.
  TECH_CARD_BOM_KIND_SEAM_SEALING_TAPE: 'TECH_CARD_BOM_SECTION_TRIM',
  // прокладки
  //
  // ЭТА СЕКЦИЯ НЕ ВЫДАЁТ ВИДОВ В ПИКЕРЕ, и запись здесь всё равно обязательна. INTERLINING —
  // рулонный материал, он не входит в KIND_ELIGIBLE_SECTIONS ниже, поэтому строка прокладки
  // контрола «вид» не показывает вовсе и стабилизатор из интерфейса выбрать нельзя. Но дом —
  // зеркало серверного bomKindHomeSection, из которого выведен сам список допустимых видов
  // (ValidTechCardBomKinds): вид без дома для валидации не существует. Поставить его в
  // DECORATION ради того, чтобы он появился в пикере, значит предложить оператору значение,
  // которое стор отвергнет по bom_items[i].kind, — ровно та беда, ради которой этот файл и
  // написан. Подпись при этом работает: строка, приехавшая по проводу, читается словом и на
  // экране, и на бумаге, а это и есть то, что чинится здесь.
  TECH_CARD_BOM_KIND_EMBROIDERY_STABILIZER: 'TECH_CARD_BOM_SECTION_INTERLINING',
  // декор
  TECH_CARD_BOM_KIND_PRINT: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_EMBROIDERY: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_APPLIQUE: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_PATCH: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_HEAT_TRANSFER: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_RHINESTONE: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_SEQUIN: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_STUD: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_FOIL: 'TECH_CARD_BOM_SECTION_DECORATION',
  TECH_CARD_BOM_KIND_LASER: 'TECH_CARD_BOM_SECTION_DECORATION',
  // нитки
  TECH_CARD_BOM_KIND_SEWING_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TECH_CARD_BOM_KIND_TOPSTITCH_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TECH_CARD_BOM_KIND_OVERLOCK_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TECH_CARD_BOM_KIND_EMBROIDERY_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TECH_CARD_BOM_KIND_ELASTIC_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  // упаковка
  TECH_CARD_BOM_KIND_POLYBAG: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_CARTON: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_HANGER: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_HANGTAG_STRING: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_STICKER: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_TISSUE: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_DUST_BAG: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_GARMENT_CASE: 'TECH_CARD_BOM_SECTION_PACKAGING',
  TECH_CARD_BOM_KIND_INSERT_CARD: 'TECH_CARD_BOM_SECTION_PACKAGING',
};

export const KIND_LABEL: Partial<Record<common_TechCardBomKind, string>> = {
  TECH_CARD_BOM_KIND_ZIPPER: 'zipper',
  TECH_CARD_BOM_KIND_ZIPPER_SLIDER: 'zipper slider',
  TECH_CARD_BOM_KIND_BUTTON: 'button',
  TECH_CARD_BOM_KIND_SNAP: 'snap',
  TECH_CARD_BOM_KIND_RIVET: 'rivet',
  TECH_CARD_BOM_KIND_EYELET: 'eyelet',
  TECH_CARD_BOM_KIND_HOOK_AND_BAR: 'hook and bar',
  TECH_CARD_BOM_KIND_SNAP_HOOK: 'snap hook',
  TECH_CARD_BOM_KIND_BUCKLE: 'buckle',
  TECH_CARD_BOM_KIND_STRAP_ADJUSTER: 'strap adjuster',
  TECH_CARD_BOM_KIND_RING: 'ring / d-ring',
  TECH_CARD_BOM_KIND_TOGGLE: 'toggle',
  TECH_CARD_BOM_KIND_CORD_STOPPER: 'cord stopper',
  TECH_CARD_BOM_KIND_CORD_END: 'cord end',
  TECH_CARD_BOM_KIND_MAGNET: 'magnet',
  TECH_CARD_BOM_KIND_CHAIN: 'chain',
  TECH_CARD_BOM_KIND_ELASTIC: 'elastic',
  TECH_CARD_BOM_KIND_DRAWCORD: 'drawcord',
  TECH_CARD_BOM_KIND_BINDING: 'binding',
  TECH_CARD_BOM_KIND_TAPE: 'tape',
  TECH_CARD_BOM_KIND_PIPING: 'piping',
  TECH_CARD_BOM_KIND_WEBBING: 'webbing',
  TECH_CARD_BOM_KIND_HOOK_LOOP: 'hook and loop',
  TECH_CARD_BOM_KIND_BONING: 'boning',
  TECH_CARD_BOM_KIND_LACE: 'lace',
  TECH_CARD_BOM_KIND_RIBBING: 'ribbing',
  TECH_CARD_BOM_KIND_SEAM_SEALING_TAPE: 'seam sealing tape',
  TECH_CARD_BOM_KIND_EMBROIDERY_STABILIZER: 'embroidery stabilizer',
  TECH_CARD_BOM_KIND_PRINT: 'print',
  TECH_CARD_BOM_KIND_EMBROIDERY: 'embroidery',
  TECH_CARD_BOM_KIND_APPLIQUE: 'applique',
  TECH_CARD_BOM_KIND_PATCH: 'patch',
  TECH_CARD_BOM_KIND_HEAT_TRANSFER: 'heat transfer',
  TECH_CARD_BOM_KIND_RHINESTONE: 'rhinestones',
  TECH_CARD_BOM_KIND_SEQUIN: 'sequins',
  TECH_CARD_BOM_KIND_STUD: 'stud',
  TECH_CARD_BOM_KIND_FOIL: 'foil',
  TECH_CARD_BOM_KIND_LASER: 'laser cutting / engraving',
  TECH_CARD_BOM_KIND_SEWING_THREAD: 'sewing thread',
  TECH_CARD_BOM_KIND_TOPSTITCH_THREAD: 'topstitch thread',
  TECH_CARD_BOM_KIND_OVERLOCK_THREAD: 'overlock thread',
  TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD: 'buttonhole thread',
  TECH_CARD_BOM_KIND_EMBROIDERY_THREAD: 'embroidery thread',
  TECH_CARD_BOM_KIND_ELASTIC_THREAD: 'elastic thread',
  TECH_CARD_BOM_KIND_POLYBAG: 'polybag',
  TECH_CARD_BOM_KIND_CARTON: 'carton',
  TECH_CARD_BOM_KIND_HANGER: 'hanger',
  TECH_CARD_BOM_KIND_HANGTAG_STRING: 'hangtag string',
  TECH_CARD_BOM_KIND_STICKER: 'sticker',
  TECH_CARD_BOM_KIND_TISSUE: 'tissue paper',
  TECH_CARD_BOM_KIND_DUST_BAG: 'dust bag',
  TECH_CARD_BOM_KIND_GARMENT_CASE: 'garment case',
  TECH_CARD_BOM_KIND_INSERT_CARD: 'insert card',
  TECH_CARD_BOM_KIND_OTHER: 'other',
};

/** The operator-facing name of a kind, for a value that arrives as a plain form string. */
export const kindLabel = (kind?: string): string | undefined =>
  kind && kind !== UNSET_KIND ? KIND_LABEL[kind as common_TechCardBomKind] ?? kind : undefined;

/** Sections that may carry a kind — the roll-goods complement minus labels, same as the server. */
export const KIND_ELIGIBLE_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_PACKAGING',
  'TECH_CARD_BOM_SECTION_OTHER',
]);

export const isKindEligibleSection = (section?: string): boolean =>
  KIND_ELIGIBLE_SECTIONS.has(section ?? '');

/**
 * The kinds a section may legally carry, in vocabulary order, with `other` always last. An
 * ineligible section gets an EMPTY list rather than a fallback — the caller hides the control, and
 * offering a value the store would refuse is worse than offering nothing.
 */
export function kindsForSection(section?: string): common_TechCardBomKind[] {
  if (!isKindEligibleSection(section)) return [];
  const own = (Object.keys(KIND_HOME_SECTION) as common_TechCardBomKind[]).filter(
    (k) => KIND_HOME_SECTION[k] === section,
  );
  return [...own, 'TECH_CARD_BOM_KIND_OTHER'];
}

export const kindOptionsForSection = (
  section?: string,
): Array<{ value: common_TechCardBomKind; label: string }> =>
  kindsForSection(section).map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }));

/**
 * Which kinds a step most likely consumes, offered FIRST in the operation's material picker. A
 * presentation heuristic and nothing more — it reorders, never filters, so a step that genuinely
 * takes something unexpected is one scroll away rather than unreachable. It lives on the client
 * deliberately: the vocabulary is stored data, this ordering is a hunch we will retune.
 *
 * IT IS KEYED ON THE MACHINE NOW, not on the step type (0306). Every entry this map ever had —
 * button attach, buttonhole, overlock, bartack, twin needle — named a MACHINE, and those tokens left
 * the type enum; keyed on the type the whole map went silently dead, because `Record<string, …>`
 * accepts any key and the lookup for a retired token simply misses. The maps below are
 * `Partial<Record<Enum, …>>` for exactly that reason: a key outside the contract is now a build
 * error, while a machine nobody has a hunch about is legitimately absent.
 */
export const MACHINE_TYPE_PREFERRED_KINDS: Partial<
  Record<common_TechCardMachineType, common_TechCardBomKind[]>
> = {
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: [
    'TECH_CARD_BOM_KIND_BUTTON',
    'TECH_CARD_BOM_KIND_SNAP',
    'TECH_CARD_BOM_KIND_RIVET',
  ],
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: ['TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD'],
  TECH_CARD_MACHINE_TYPE_OVERLOCK: ['TECH_CARD_BOM_KIND_OVERLOCK_THREAD'],
  TECH_CARD_MACHINE_TYPE_COVERLOCK: ['TECH_CARD_BOM_KIND_OVERLOCK_THREAD'],
  TECH_CARD_MACHINE_TYPE_BARTACK: ['TECH_CARD_BOM_KIND_SEWING_THREAD'],
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: ['TECH_CARD_BOM_KIND_TOPSTITCH_THREAD'],
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: [
    'TECH_CARD_BOM_KIND_EMBROIDERY_THREAD',
    'TECH_CARD_BOM_KIND_EMBROIDERY_STABILIZER',
  ],
  TECH_CARD_MACHINE_TYPE_SEAM_TAPING: ['TECH_CARD_BOM_KIND_SEAM_SEALING_TAPE'],
  TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING: [
    'TECH_CARD_BOM_KIND_ZIPPER',
    'TECH_CARD_BOM_KIND_ZIPPER_SLIDER',
  ],
  TECH_CARD_MACHINE_TYPE_ELASTIC_ATTACH: [
    'TECH_CARD_BOM_KIND_ELASTIC',
    'TECH_CARD_BOM_KIND_ELASTIC_THREAD',
  ],
  TECH_CARD_MACHINE_TYPE_BINDING_TAPING: [
    'TECH_CARD_BOM_KIND_BINDING',
    'TECH_CARD_BOM_KIND_TAPE',
    'TECH_CARD_BOM_KIND_PIPING',
  ],
  TECH_CARD_MACHINE_TYPE_HARDWARE_ATTACH: [
    'TECH_CARD_BOM_KIND_EYELET',
    'TECH_CARD_BOM_KIND_RIVET',
    'TECH_CARD_BOM_KIND_HOOK_AND_BAR',
  ],
};

/**
 * The handful of hunches that still belong to the step TYPE rather than to a machine. Interlining is
 * roll goods and carries no kind at all, so fusing has nothing to prefer — the advisory that a
 * fusing step should link some fusible lives in the step editor, on the SECTION.
 */
export const OPERATION_TYPE_PREFERRED_KINDS: Partial<
  Record<common_TechCardOperationType, common_TechCardBomKind[]>
> = {};

/** The kinds to float to the top for a step, from whichever axis has an opinion about it. */
export function preferredBomKinds(operationType?: string, machineType?: string): Set<string> {
  const byType =
    OPERATION_TYPE_PREFERRED_KINDS[operationType as common_TechCardOperationType] ?? [];
  const byMachine = MACHINE_TYPE_PREFERRED_KINDS[machineType as common_TechCardMachineType] ?? [];
  return new Set<string>([...byType, ...byMachine]);
}
