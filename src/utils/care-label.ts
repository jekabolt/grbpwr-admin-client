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

// section → care-label group name; the order is the preferred print order too
const SECTION_LABELS: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'Shell',
  TECH_CARD_BOM_SECTION_LINING: 'Lining',
  TECH_CARD_BOM_SECTION_INSULATION: 'Filling',
  TECH_CARD_BOM_SECTION_INTERLINING: 'Interlining',
  TECH_CARD_BOM_SECTION_TRIM: 'Trim',
  TECH_CARD_BOM_SECTION_DECORATION: 'Decoration',
  TECH_CARD_BOM_SECTION_HARDWARE: 'Hardware',
  TECH_CARD_BOM_SECTION_THREAD: 'Thread',
  TECH_CARD_BOM_SECTION_LABEL: 'Label',
  TECH_CARD_BOM_SECTION_PACKAGING: 'Packaging',
  TECH_CARD_BOM_SECTION_OTHER: 'Other',
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

// True if at least one article carries a non-blank composition string (used to tell apart
// "nothing filled" from "filled but not parseable").
export function hasAnyComposition(bomItems: Array<{ composition?: string }>): boolean {
  return (bomItems ?? []).some((b) => !!b.composition?.trim());
}

// Build a care-label composition block from the BOM catalog: one line per section that has a
// parseable composition (Shell / Lining / Filling / …), using that section's primary article,
// plus an optional "Made in …". Returns '' when nothing parseable is found.
export function generateCareLabel(
  bomItems: Array<{ section?: string; composition?: string }>,
  originCountry?: string,
): string {
  // first parseable composition per section
  const bySection = new Map<string, string>();
  for (const b of bomItems ?? []) {
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
