import { common_Size } from 'api/proto-http/admin';

// Size naming convention used across the catalog:
//   tops      → letter sizes (XXS..XXL, OS), no suffix
//   shoes     → plain numeric (35, 35.5, …)
//   bottoms   → "<letter>_<n>BO_<F|M>" (gendered)
//   tailored  → "<letter>_<n>TA_<F|M>" (gendered)
export type SizeCategoryKey = 'tops' | 'bottoms' | 'tailored' | 'shoes' | 'other';

export const SIZE_CATEGORY_ORDER: { key: SizeCategoryKey; label: string }[] = [
  { key: 'tops', label: 'tops' },
  { key: 'bottoms', label: 'bottoms' },
  { key: 'tailored', label: 'tailored' },
  { key: 'shoes', label: 'shoes' },
  { key: 'other', label: 'other' },
];

export function categorizeSize(name = ''): SizeCategoryKey {
  const n = name.toLowerCase();
  if (/bo_[fm]$/.test(n)) return 'bottoms';
  if (/ta_[fm]$/.test(n)) return 'tailored';
  if (/^\d+(\.\d+)?$/.test(n)) return 'shoes';
  if (/^[a-z]+$/.test(n)) return 'tops'; // xxs..xxl, os
  return 'other';
}

// 'F' female-only, 'M' male-only, 'U' unisex/any.
export function sizeGender(name = ''): 'F' | 'M' | 'U' {
  const n = name.toLowerCase();
  if (n.endsWith('_f')) return 'F';
  if (n.endsWith('_m')) return 'M';
  return 'U';
}

// Which sizes are relevant for a model of the given gender. Female models see
// female + unisex sizes, male models see male + unisex; otherwise everything.
export function sizeMatchesGender(name: string, modelGender?: string): boolean {
  const g = sizeGender(name);
  if (g === 'U') return true;
  if (modelGender === 'GENDER_ENUM_FEMALE') return g === 'F';
  if (modelGender === 'GENDER_ENUM_MALE') return g === 'M';
  return true; // unisex / unset → show both
}

export type SizeGroup = { key: SizeCategoryKey; label: string; sizes: common_Size[] };

export function groupSizesByCategory(
  sizes: common_Size[],
  modelGender?: string,
): SizeGroup[] {
  const buckets: Record<SizeCategoryKey, common_Size[]> = {
    tops: [],
    bottoms: [],
    tailored: [],
    shoes: [],
    other: [],
  };
  for (const s of sizes) {
    if (!sizeMatchesGender(s.name ?? '', modelGender)) continue;
    buckets[categorizeSize(s.name ?? '')].push(s);
  }
  return SIZE_CATEGORY_ORDER.map(({ key, label }) => ({
    key,
    label,
    sizes: buckets[key],
  })).filter((g) => g.sizes.length > 0);
}
