import type { common_TechCardBomSection } from 'api/proto-http/admin';

// Thread carries no fibre composition of the garment (D-44, O-47): it sews the garment together,
// it is not what the garment is made of. D-50: this is the ONE rule every AGGREGATE of the
// garment's composition applies — the care label and «is composition set» below, a colourway's
// derived composition (colorway-recipe.tsx), the labels → BOM handoff (bom-field.tsx). Per-line
// views (a BOM row, a release's frozen BOM, the draft's inventory) keep printing a thread's own
// composition: that is a fact about the article, not the garment. A linked thread article keeps
// its catalog snapshot on the line; the aggregates simply never read it.
const THREAD_SECTION: common_TechCardBomSection = 'TECH_CARD_BOM_SECTION_THREAD';
export function carriesGarmentComposition(line: { section?: string }): boolean {
  return line.section !== THREAD_SECTION;
}

// The EN care-label TEXT generator (`generateCareLabel`) and its colourway pick lived here for the
// legacy LABELS tab. Both left with that tab (labels rework, 02-DESIGN §4.2): the composition label
// is typeset by the care-labels engine (`care-labels/*`), which reads the same resolver.
