// The slot-role vocabulary. A BOM line's `name` is the ROLE the material plays in the garment
// («main fabric», «lining», «main zipper») — never the article's catalog name. The
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
    'main fabric',
    'contrast fabric',
    'hood fabric',
    'pocket fabric',
    'trim fabric',
  ],
  TECH_CARD_BOM_SECTION_LINING: ['lining', 'pocket lining', 'hood lining'],
  TECH_CARD_BOM_SECTION_INTERLINING: ['fusing', 'collar interlining', 'placket interlining'],
  TECH_CARD_BOM_SECTION_INSULATION: ['insulation'],
  TECH_CARD_BOM_SECTION_HARDWARE: [
    'main zipper',
    'pocket zipper',
    'buttons',
    'snaps',
    'eyelets',
    'cord stopper',
  ],
  TECH_CARD_BOM_SECTION_THREAD: ['main seam thread', 'topstitch thread', 'overlock thread'],
  TECH_CARD_BOM_SECTION_TRIM: ['elastic', 'drawcord', 'binding', 'tape'],
  TECH_CARD_BOM_SECTION_LABEL: ['main label', 'size label', 'content label', 'hangtag'],
  TECH_CARD_BOM_SECTION_PACKAGING: ['polybag', 'carton'],
  TECH_CARD_BOM_SECTION_DECORATION: ['print', 'embroidery', 'patch'],
};

export function roleSuggestions(section?: string): string[] {
  return BOM_ROLE_SUGGESTIONS[section ?? ''] ?? [];
}

// The natural first role of a section — prefill for the section's FIRST slot only. A second
// fabric must be a deliberate answer («hood fabric»?), which is the whole point of asking.
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
