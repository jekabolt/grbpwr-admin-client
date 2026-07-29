import { careInstruction } from './careInstruction';

type CareMethod = { code: string; img: string };
export type SelectedInstructions = { [category: string]: string };

// The care taxonomy is flat except for Professional Care, which nests one level (dry / wet). Every
// walker in here has to special-case that, so the name is spelled once.
const PROFESSIONAL_CARE = 'Professional Care';

// code → { name, img } across all categories, so a stored "MWN,DNB,…" string can be rendered as the
// laundry SYMBOLS it stands for.
function buildCodeMeta(): Record<string, { name: string; img: string }> {
  const map: Record<string, { name: string; img: string }> = {};
  for (const [category, methods] of Object.entries(careInstruction.care_instructions)) {
    if (category === PROFESSIONAL_CARE) {
      for (const sub of Object.values(methods as Record<string, Record<string, CareMethod>>)) {
        for (const [name, m] of Object.entries(sub)) map[m.code] = { name, img: m.img };
      }
    } else {
      for (const [name, m] of Object.entries(methods as Record<string, CareMethod>)) {
        map[m.code] = { name, img: m.img };
      }
    }
  }
  return map;
}

/**
 * Precomputed code → { name, img }. Lives in its own module rather than beside the picker because
 * both the picker and the symbol component need it, and having one import the other made a cycle —
 * which ESM resolves by handing whichever module loaded second an uninitialised binding.
 */
export const CARE_CODE_META = buildCodeMeta();

/** Parse the stored comma-joined codes back into the picker's per-category selection map. */
export function parseSelectedCare(value: string): SelectedInstructions {
  const codes = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: SelectedInstructions = {};
  for (const [category, methods] of Object.entries(careInstruction.care_instructions)) {
    if (category === PROFESSIONAL_CARE) {
      for (const [subCategory, sub] of Object.entries(
        methods as Record<string, Record<string, CareMethod>>,
      )) {
        for (const m of Object.values(sub)) {
          if (codes.includes(m.code)) out[`${category}-${subCategory}`] = m.code;
        }
      }
    } else {
      for (const m of Object.values(methods as Record<string, CareMethod>)) {
        if (codes.includes(m.code)) out[category] = m.code;
      }
    }
  }
  return out;
}

/**
 * A short name for a slot, for when there is 44px to say which one is empty.
 * Falls back to the first word of the category, so a new category still labels
 * itself rather than rendering blank.
 */
const SLOT_LABEL: Record<string, string> = {
  Washing: 'wash',
  Bleaching: 'bleach',
  Drying: 'dry',
  Ironing: 'iron',
  [`${PROFESSIONAL_CARE}-Dry Cleaning`]: 'dry cl',
  [`${PROFESSIONAL_CARE}-Wet Cleaning`]: 'wet cl',
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

/**
 * Every pick the tag can hold, in the order the codes are stored — one per
 * category, except Professional Care which holds one dry and one wet.
 *
 * This is what lets the picker show the tag as a SET: a category with no pick is
 * an empty slot in a known position, not an absence you have to notice.
 */
export const CARE_SLOTS: CareSlot[] = Object.entries(careInstruction.care_instructions).flatMap(
  ([category, methods]) => {
    if (category !== PROFESSIONAL_CARE) {
      return [
        {
          key: category,
          category,
          label: SLOT_LABEL[category] ?? category.split(' ')[0].toLowerCase(),
          name: category.toLowerCase(),
        },
      ];
    }
    return Object.keys(methods as Record<string, unknown>).map((subCategory) => {
      const key = `${category}-${subCategory}`;
      return {
        key,
        category,
        subCategory,
        label: SLOT_LABEL[key] ?? subCategory.split(' ')[0].toLowerCase(),
        name: subCategory.toLowerCase(),
      };
    });
  },
);

/** Split a stored care value into its codes. Empty and whitespace-only both yield []. */
export function careCodes(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The selection key a pick is stored under: Professional Care is scoped to its sub-category (you
 * may pick one dry AND one wet), everything else to the category.
 */
export function careSelectionKey(category: string, subCategory?: string): string {
  return category === PROFESSIONAL_CARE && subCategory ? `${category}-${subCategory}` : category;
}
