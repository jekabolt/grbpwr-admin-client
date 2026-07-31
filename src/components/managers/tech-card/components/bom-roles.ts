// The slot-role vocabulary. A BOM line's `name` is the ROLE the material plays in the garment
// («основная ткань», «подкладка», «основная молния») — never the article's catalog name. The
// article is per-colourway data: the slot's default (bom_item.material_id) plus each colourway's
// pin (usage.material_id). The server agrees: bi.name wins verbatim on the read path and falls
// back to the material name only when the stored role is EMPTY (store/techcard/materials.go), and
// the production material plan emits SlotName and MaterialName as two separate fields.
//
// Suggestions only — free text always wins. A client-side list rather than a backend dictionary:
// the real vocabulary is per-garment-type, and ~40 strings do not survive the proto-submodule
// cost of a dictionary round-trip.

const BOM_ROLE_SUGGESTIONS: Record<string, string[]> = {
  TECH_CARD_BOM_SECTION_FABRIC: [
    'основная ткань',
    'контрастная ткань',
    'ткань капюшона',
    'ткань карманов',
    'отделочная ткань',
  ],
  TECH_CARD_BOM_SECTION_LINING: ['подкладка', 'подкладка карманов', 'подкладка капюшона'],
  TECH_CARD_BOM_SECTION_INTERLINING: ['клеевая', 'дублерин воротника', 'дублерин планки'],
  TECH_CARD_BOM_SECTION_INSULATION: ['утеплитель'],
  TECH_CARD_BOM_SECTION_HARDWARE: [
    'основная молния',
    'молния кармана',
    'пуговицы',
    'кнопки',
    'люверсы',
    'шнур-стоппер',
  ],
  TECH_CARD_BOM_SECTION_THREAD: [
    'нитки основных швов',
    'нитки отделочной строчки',
    'нитки оверлока',
  ],
  TECH_CARD_BOM_SECTION_TRIM: ['резинка', 'шнур', 'бейка', 'тесьма'],
  TECH_CARD_BOM_SECTION_LABEL: ['основная этикетка', 'размерник', 'составник', 'навесная бирка'],
  TECH_CARD_BOM_SECTION_PACKAGING: ['пакет', 'коробка'],
  TECH_CARD_BOM_SECTION_DECORATION: ['принт', 'вышивка', 'патч'],
};

export function roleSuggestions(section?: string): string[] {
  return BOM_ROLE_SUGGESTIONS[section ?? ''] ?? [];
}

// The natural first role of a section — prefill for the section's FIRST slot only. A second
// fabric must be a deliberate answer («ткань капюшона»?), which is the whole point of asking.
export function defaultRoleFor(section?: string): string {
  return roleSuggestions(section)[0] ?? '';
}

// Role identity for duplicate detection: trim, collapse whitespace, case-fold.
export function normalizeRole(name?: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Card-global (NOT per-section) duplicate check: SlotSelect, BomLineSelect and the production
// material plan all render the role without a section qualifier, so two same-named roles are
// indistinguishable everywhere it matters. Advisory only — never a save rule: a hard uniqueness
// rule on save is exactly the class of bug that made a card with a blank BOM line unsavable.
export function roleCollision(
  items: Array<{ name?: string }>,
  name: string | undefined,
  exceptIndex = -1,
): number {
  const needle = normalizeRole(name);
  if (!needle) return -1;
  return items.findIndex((b, i) => i !== exceptIndex && normalizeRole(b.name) === needle);
}

// A role that merely repeats the linked article's catalog name — the tell of a line created while
// "add BOM article" stamped the article name into the role field (fixed), or of a role nobody set.
export function looksLikeArticleName(lineName?: string, materialName?: string): boolean {
  const n = normalizeRole(lineName);
  return !!n && n === normalizeRole(materialName);
}
