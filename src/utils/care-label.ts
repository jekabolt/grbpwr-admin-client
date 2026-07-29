import { careInstruction } from 'components/managers/product/components/care/careInstruction';
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

// ─── care symbols → prose ────────────────────────────────────────────────────────────────────
// `careInstructions` is stored as the CarePicker's comma-joined ISO-3758 codes ("MW30,DNB,DNTD").
// Two places have to say the same thing about it in words — the storefront preview on the header
// tab and the printed care label — so the wording lives HERE, next to generateCareLabel, and is
// never re-derived in a component.
//
// The code → phrase table below is short-copy for the storefront ("iron low", not "Iron at Low
// Temperature (110°C)"). Anything the table does not name falls back to the picker's own dictionary
// name, so a code can never surface as a raw token; anything the picker does not know either (a
// legacy free-text care value from before the ISO codes) passes through verbatim.

type CodeMeta = { code: string };

// code → picker name, and code → print order, straight off the picker's dictionary. Built once.
const { careNameByCode, careOrderByCode } = (() => {
  const names: Record<string, string> = {};
  const order: Record<string, number> = {};
  let i = 0;
  const put = (name: string, m: CodeMeta) => {
    names[m.code] = name;
    order[m.code] = i++;
  };
  for (const [category, methods] of Object.entries(careInstruction.care_instructions)) {
    if (category === 'Professional Care') {
      for (const sub of Object.values(methods as Record<string, Record<string, CodeMeta>>)) {
        for (const [name, m] of Object.entries(sub)) put(name, m);
      }
    } else {
      for (const [name, m] of Object.entries(methods as Record<string, CodeMeta>)) put(name, m);
    }
  }
  return { careNameByCode: names, careOrderByCode: order };
})();

// Storefront wording. Keys must exist in the picker dictionary above — a typo here just means the
// full dictionary name is used instead, never a broken line.
const CARE_PROSE: Record<string, string> = {
  MWN: 'machine wash',
  MW30: 'machine wash 30°',
  MW40: 'machine wash 40°',
  MW50: 'machine wash 50°',
  MW60: 'machine wash 60°',
  GW: 'gentle wash',
  VGW: 'very gentle wash',
  HW: 'hand wash only',
  DNW: 'do not wash',
  BA: 'bleach allowed',
  NCB: 'non-chlorine bleach only',
  DNB: 'do not bleach',
  TDN: 'tumble dry normal',
  TDL: 'tumble dry low',
  TDM: 'tumble dry medium',
  TDH: 'tumble dry high',
  DNTD: 'do not tumble dry',
  LD: 'line dry',
  DF: 'dry flat',
  DD: 'drip dry',
  DIS: 'dry in shade',
  LDS: 'line dry in shade',
  DFS: 'dry flat in shade',
  DDS: 'drip dry in shade',
  IL: 'iron low',
  IM: 'iron medium',
  IH: 'iron high',
  DNS: 'do not steam',
  DNI: 'do not iron',
  DCAS: 'dry clean, any solvent',
  DCPS: 'dry clean, petroleum solvent only',
  DCASE: 'dry clean, any solvent except trichloroethylene',
  GDC: 'gentle dry clean',
  VGDC: 'very gentle dry clean',
  DNDC: 'do not dry clean',
  PWC: 'professional wet clean',
  GPWC: 'gentle professional wet clean',
  VGPWC: 'very gentle professional wet clean',
  DNWC: 'do not wet clean',
};

/**
 * Render the stored care codes as the sentence a customer reads:
 * `"MW30,DNB,DNTD,IL"` → `machine wash 30°, do not bleach, do not tumble dry, iron low`.
 *
 * Always ordered wash → bleach → dry → iron → professional care (the picker's own order), so the
 * same selection always prints the same line regardless of the order it was clicked in. Returns ''
 * when nothing is selected.
 */
export function careToProse(careInstructions?: string): string {
  const codes = (careInstructions ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return '';
  const unique: string[] = [];
  for (const c of codes) if (!unique.includes(c)) unique.push(c);
  return unique
    .map((code, i) => ({ code, i }))
    .sort((a, b) => {
      // unknown tokens (legacy free text) keep their position, after everything the picker knows
      const oa = careOrderByCode[a.code] ?? Number.MAX_SAFE_INTEGER;
      const ob = careOrderByCode[b.code] ?? Number.MAX_SAFE_INTEGER;
      return oa - ob || a.i - b.i;
    })
    .map(({ code }) => CARE_PROSE[code] ?? careNameByCode[code]?.toLowerCase() ?? code)
    .join(', ');
}

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
