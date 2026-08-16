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
// coexist and neither replaces the other: «основная молния» and «молния кармана» are both ZIPPER and
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
  TECH_CARD_BOM_KIND_ZIPPER: 'молния',
  TECH_CARD_BOM_KIND_ZIPPER_SLIDER: 'бегунок молнии',
  TECH_CARD_BOM_KIND_BUTTON: 'пуговица',
  TECH_CARD_BOM_KIND_SNAP: 'кнопка',
  TECH_CARD_BOM_KIND_RIVET: 'заклёпка / хольнитен',
  TECH_CARD_BOM_KIND_EYELET: 'люверс',
  TECH_CARD_BOM_KIND_HOOK_AND_BAR: 'крючок-петля',
  TECH_CARD_BOM_KIND_SNAP_HOOK: 'карабин',
  TECH_CARD_BOM_KIND_BUCKLE: 'пряжка / фастекс',
  TECH_CARD_BOM_KIND_STRAP_ADJUSTER: 'регулятор лямки',
  TECH_CARD_BOM_KIND_RING: 'кольцо / полукольцо',
  TECH_CARD_BOM_KIND_TOGGLE: 'тоггл',
  TECH_CARD_BOM_KIND_CORD_STOPPER: 'шнур-стоппер',
  TECH_CARD_BOM_KIND_CORD_END: 'наконечник шнура',
  TECH_CARD_BOM_KIND_MAGNET: 'магнит',
  TECH_CARD_BOM_KIND_CHAIN: 'цепь',
  TECH_CARD_BOM_KIND_ELASTIC: 'резинка',
  TECH_CARD_BOM_KIND_DRAWCORD: 'шнур',
  TECH_CARD_BOM_KIND_BINDING: 'бейка',
  TECH_CARD_BOM_KIND_TAPE: 'тесьма',
  TECH_CARD_BOM_KIND_PIPING: 'кант',
  TECH_CARD_BOM_KIND_WEBBING: 'стропа',
  TECH_CARD_BOM_KIND_HOOK_LOOP: 'липучка',
  TECH_CARD_BOM_KIND_BONING: 'регилин / косточка',
  TECH_CARD_BOM_KIND_LACE: 'кружево',
  TECH_CARD_BOM_KIND_RIBBING: 'довяз / рибана',
  TECH_CARD_BOM_KIND_PRINT: 'принт',
  TECH_CARD_BOM_KIND_EMBROIDERY: 'вышивка',
  TECH_CARD_BOM_KIND_APPLIQUE: 'аппликация',
  TECH_CARD_BOM_KIND_PATCH: 'патч / нашивка',
  TECH_CARD_BOM_KIND_HEAT_TRANSFER: 'термотрансфер',
  TECH_CARD_BOM_KIND_RHINESTONE: 'стразы',
  TECH_CARD_BOM_KIND_SEQUIN: 'пайетки',
  TECH_CARD_BOM_KIND_STUD: 'декоративный шип',
  TECH_CARD_BOM_KIND_FOIL: 'фольга',
  TECH_CARD_BOM_KIND_LASER: 'лазерная резка / гравировка',
  TECH_CARD_BOM_KIND_SEWING_THREAD: 'нитка стачивания',
  TECH_CARD_BOM_KIND_TOPSTITCH_THREAD: 'нитка отстрочки',
  TECH_CARD_BOM_KIND_OVERLOCK_THREAD: 'нитка оверлока',
  TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD: 'нитка петель',
  TECH_CARD_BOM_KIND_EMBROIDERY_THREAD: 'нитка вышивки',
  TECH_CARD_BOM_KIND_ELASTIC_THREAD: 'эластичная нитка',
  TECH_CARD_BOM_KIND_POLYBAG: 'полибэг',
  TECH_CARD_BOM_KIND_CARTON: 'короб',
  TECH_CARD_BOM_KIND_HANGER: 'вешалка',
  TECH_CARD_BOM_KIND_HANGTAG_STRING: 'шнурок хэнгтега',
  TECH_CARD_BOM_KIND_STICKER: 'стикер',
  TECH_CARD_BOM_KIND_TISSUE: 'папиросная бумага',
  TECH_CARD_BOM_KIND_DUST_BAG: 'пыльник',
  TECH_CARD_BOM_KIND_GARMENT_CASE: 'чехол',
  TECH_CARD_BOM_KIND_INSERT_CARD: 'вкладыш',
  TECH_CARD_BOM_KIND_OTHER: 'другое',
};

/** The operator-facing name of a kind, for a value that arrives as a plain form string. */
export const kindLabel = (kind?: string): string | undefined =>
  kind && kind !== UNSET_KIND ? (KIND_LABEL[kind as common_TechCardBomKind] ?? kind) : undefined;

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
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: ['TECH_CARD_BOM_KIND_EMBROIDERY_THREAD'],
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
