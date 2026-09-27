import type { common_TechCardBomSection } from 'api/proto-http/admin';
import { composition as dict } from 'constants/garment-composition';

// reverse map material CODE → display name across every garment-composition category
const codeToName: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const cat of Object.values(dict.garment_composition)) {
    for (const [name, code] of Object.entries(cat as Record<string, string>)) m[code] = name;
  }
  return m;
})();

type Item = { code: string; percent: number };

// parse a BOM composition cell: either the structured JSON the picker writes
// ({ part: [{code, percent}] }) or the legacy "COT:60, POL:40" string.
function parseComposition(value?: string): Item[] {
  const v = value?.trim();
  if (!v) return [];
  let struct: unknown = null;
  try {
    struct = JSON.parse(v);
  } catch {
    struct = null;
  }
  if (struct && typeof struct === 'object') {
    const items: Item[] = [];
    for (const part of Object.values(struct as Record<string, unknown>)) {
      if (Array.isArray(part)) {
        for (const it of part) {
          if (it?.code) items.push({ code: String(it.code), percent: Number(it.percent) || 0 });
        }
      }
    }
    return items;
  }
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((it) => {
      const [code, p] = it.split(':').map((x) => x.trim());
      return { code, percent: parseInt(p, 10) || 0 };
    })
    .filter((i) => i.code);
}

function formatItems(items: Item[]): string {
  const byCode = new Map<string, number>();
  for (const it of items) byCode.set(it.code, (byCode.get(it.code) ?? 0) + it.percent);
  return Array.from(byCode.entries())
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, p]) => `${p}% ${codeToName[code] ?? code}`)
    .join(', ');
}

// section → care-label group name; the order is the preferred print order too. An unknown section
// prints as Material. Thread has no entry: its lines never reach the label
// (`carriesGarmentComposition`).
const SECTION_LABELS: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'Shell',
  TECH_CARD_BOM_SECTION_LINING: 'Lining',
  TECH_CARD_BOM_SECTION_INSULATION: 'Filling',
  TECH_CARD_BOM_SECTION_INTERLINING: 'Interlining',
  TECH_CARD_BOM_SECTION_TRIM: 'Trim',
  TECH_CARD_BOM_SECTION_DECORATION: 'Decoration',
  TECH_CARD_BOM_SECTION_HARDWARE: 'Hardware',
  TECH_CARD_BOM_SECTION_LABEL: 'Label',
  TECH_CARD_BOM_SECTION_PACKAGING: 'Packaging',
  TECH_CARD_BOM_SECTION_OTHER: 'Other',
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

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

// The care line is NOT built here. `careInstructions` is a comma-joined ISO-3758 code string
// ("MW30,DNB,DNTD"), and the wording for each code — plus its print order — is dictionary data
// served by the backend, not a table the client maintains. Read it through
// `useCareVocabulary().prose(value)`; that is the same wording the storefront renders, so the
// preview on the header tab and the printed tag can never word the same symbols differently.

// True if at least one article other than thread carries a non-blank composition string (used to
// tell apart "nothing filled" from "filled but not parseable").
export function hasAnyComposition(
  bomItems: Array<{ section?: string; composition?: string }>,
): boolean {
  return (bomItems ?? []).some((b) => carriesGarmentComposition(b) && !!b.composition?.trim());
}

// Build a care-label composition block from the BOM catalog: one line per section that has a
// parseable composition (Shell / Lining / Filling / …), using that section's primary article,
// plus an optional "Made in …". Thread lines are skipped (`carriesGarmentComposition`). Returns ''
// when nothing parseable is found.
export function generateCareLabel(
  bomItems: Array<{ section?: string; composition?: string }>,
  originCountry?: string,
): string {
  // first parseable composition per section
  const bySection = new Map<string, string>();
  for (const b of bomItems ?? []) {
    if (!carriesGarmentComposition(b)) continue;
    const section = b.section || 'TECH_CARD_BOM_SECTION_OTHER';
    if (bySection.has(section)) continue;
    const formatted = formatItems(parseComposition(b.composition));
    if (formatted) bySection.set(section, formatted);
  }

  const order = [...SECTION_ORDER, ...bySection.keys()].filter((s, i, a) => a.indexOf(s) === i);
  const lines: string[] = [];
  for (const section of order) {
    const formatted = bySection.get(section);
    if (formatted) lines.push(`${SECTION_LABELS[section] ?? 'Material'}: ${formatted}`);
  }
  if (originCountry?.trim()) lines.push(`Made in ${originCountry.trim()}`);
  return lines.join('\n');
}
