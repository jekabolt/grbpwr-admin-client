import { common_CareSymbol } from 'api/proto-http/admin';
import { CARE_ARTWORK } from './care-artwork';

/**
 * The care vocabulary, read from the backend dictionary.
 *
 * It used to live here as a hand-maintained TypeScript object, duplicated a third time in
 * `utils/care-label.ts` for the storefront wording. That made the client the only place that knew
 * what "MW30" meant — so the backend could not render care on the storefront, could not reject a
 * typo on write, and could not translate a care tag. The vocabulary now comes from
 * `GetDictionary().careSymbols` (the `care_symbol` table), exactly as fibers back composition.
 *
 * What stayed client-side is the ARTWORK (`care-artwork.ts`, keyed by code) and the 44px slot
 * labels below — assets and layout, not data.
 */

/** A stored care selection, keyed by slot: category, or `category-subCategory` where it nests. */
export type SelectedInstructions = { [slotKey: string]: string };

/** One symbol as the UI needs it: dictionary data with its picture attached. */
export type CareSymbolView = {
  code: string;
  name: string;
  category: string;
  /** Only Professional Care nests today; anything the dictionary nests behaves the same way. */
  subCategory?: string;
  /** Customer-facing wording ("machine wash 30°"), which is what the storefront prints. */
  shortProse: string;
  sortOrder: number;
  archived: boolean;
  /** Undefined when this deployment ships no drawing for the code — the code still renders. */
  img?: string;
};

/** One tab of the picker: a category, and the one or more grids it holds. */
export type CareGroup = {
  category: string;
  sections: Array<{ subCategory?: string; symbols: CareSymbolView[] }>;
};

export type CareSlot = {
  key: string;
  category: string;
  subCategory?: string;
  /** 44px-wide label for an empty slot. */
  label: string;
  /** Spoken form, for the title on an empty slot. */
  name: string;
};

export type CareVocabulary = {
  /** False until the dictionary has loaded, or if this backend serves no care vocabulary. */
  loaded: boolean;
  /** Everything the picker may offer, in print order. Archived symbols are excluded. */
  symbols: CareSymbolView[];
  /** Lookup by code, INCLUDING archived ones: a style already carrying a retired code must render. */
  byCode: Record<string, CareSymbolView>;
  /** The picker's tabs, in print order. */
  groups: CareGroup[];
  /** Every pick a tag can hold, in print order — one per category, plus one per sub-category. */
  slots: CareSlot[];
  /** Parse a stored `"MW30,DNB"` value into the picker's per-slot selection map. */
  parseSelected(value: string): SelectedInstructions;
  /** Render a stored value as the sentence a customer reads. */
  prose(value: string): string;
};

/**
 * A short name for a slot, for when there is 44px to say which one is empty. Presentation, not
 * taxonomy — a category the dictionary adds gets the first word of its name rather than nothing.
 */
const SLOT_LABEL: Record<string, string> = {
  Washing: 'wash',
  Bleaching: 'bleach',
  Drying: 'dry',
  Ironing: 'iron',
  'Professional Care-Dry Cleaning': 'dry cl',
  'Professional Care-Wet Cleaning': 'wet cl',
};

/** Split a stored care value into its codes. Empty and whitespace-only both yield []. */
export function careCodes(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The slot a pick is stored under: a symbol with a sub-category is scoped to it (you may pick one
 * dry-clean AND one wet-clean), everything else to its category.
 */
export function careSelectionKey(category: string, subCategory?: string): string {
  return subCategory ? `${category}-${subCategory}` : category;
}

function shortLabel(text: string): string {
  return text.split(' ')[0].toLowerCase();
}

/**
 * Build the vocabulary from the dictionary payload. Pure, so it memoises cleanly and so a test or a
 * story can hand it a fixture; `useCareVocabulary` is the hook that feeds it the real dictionary.
 */
export function buildCareVocabulary(dictionarySymbols?: common_CareSymbol[]): CareVocabulary {
  const all: CareSymbolView[] = (dictionarySymbols ?? [])
    .filter((s): s is common_CareSymbol & { code: string } => !!s.code)
    .map((s) => ({
      code: s.code,
      name: s.name || s.code,
      category: s.category || '',
      subCategory: s.subCategory || undefined,
      shortProse: s.shortProse || '',
      sortOrder: s.sortOrder ?? 0,
      archived: !!s.archived,
      img: CARE_ARTWORK[s.code],
    }))
    // The server already sorts by sort_order; sorting again means the print order survives any
    // transport that does not preserve array order.
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const byCode: Record<string, CareSymbolView> = {};
  for (const s of all) byCode[s.code] = s;

  const symbols = all.filter((s) => !s.archived);

  // Categories, sub-categories and sections all come out in first-seen order, which is print order
  // because `all` is already sorted.
  const groups: CareGroup[] = [];
  const groupIndex = new Map<string, CareGroup>();
  const sectionIndex = new Map<string, { subCategory?: string; symbols: CareSymbolView[] }>();
  for (const s of symbols) {
    let group = groupIndex.get(s.category);
    if (!group) {
      group = { category: s.category, sections: [] };
      groupIndex.set(s.category, group);
      groups.push(group);
    }
    const sectionKey = careSelectionKey(s.category, s.subCategory);
    let section = sectionIndex.get(sectionKey);
    if (!section) {
      section = { subCategory: s.subCategory, symbols: [] };
      sectionIndex.set(sectionKey, section);
      group.sections.push(section);
    }
    section.symbols.push(s);
  }

  const slots: CareSlot[] = Array.from(sectionIndex.entries()).map(([key, section]) => {
    const category = section.symbols[0].category;
    const spoken = section.subCategory ?? category;
    return {
      key,
      category,
      subCategory: section.subCategory,
      label: SLOT_LABEL[key] ?? shortLabel(spoken),
      name: spoken.toLowerCase(),
    };
  });

  return {
    loaded: all.length > 0,
    symbols,
    byCode,
    groups,
    slots,

    parseSelected(value: string) {
      const out: SelectedInstructions = {};
      for (const code of careCodes(value)) {
        const symbol = byCode[code];
        // Unknown tokens — legacy free text, or a code this backend has never heard of — are not a
        // selection. `CarePicker` shows them as the raw value it is about to replace.
        if (symbol) out[careSelectionKey(symbol.category, symbol.subCategory)] = code;
      }
      return out;
    },

    /**
     * `"IL,DNB,MW30"` → `machine wash 30°, do not bleach, iron low`.
     *
     * Always in the dictionary's print order, so the same selection reads the same regardless of
     * the order it was clicked in — which is also the order the backend canonicalises to, so this
     * preview and the stored value can never disagree. Unknown tokens keep their position and pass
     * through verbatim, which is what makes a legacy free-text value render as itself.
     */
    prose(value: string) {
      const codes = careCodes(value);
      const unique = codes.filter((c, i) => codes.indexOf(c) === i);
      return unique
        .map((code, i) => ({ code, i }))
        .sort((a, b) => {
          const oa = byCode[a.code]?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const ob = byCode[b.code]?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          return oa - ob || a.i - b.i;
        })
        .map(({ code }) => {
          const symbol = byCode[code];
          if (!symbol) return code;
          return symbol.shortProse || symbol.name.toLowerCase();
        })
        .join(', ');
    },
  };
}
