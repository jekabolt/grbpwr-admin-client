import type { common_AgeGroupEnum } from 'api/proto-http/admin';

import type { TechCardFormData } from './schema';

// Guided-but-open vocabularies for the tech-card form (ComboField suggestion lists +
// closed-select item lists). Hints, not closed sets, unless used via SelectField.

// Units of measure for a BOM article / usage (ComboField → bom_item.unit).
export const unitOptions = ['m', 'cm', 'g', 'kg', 'pcs', 'set', 'm2', 'roll'];

// FOUR LISTS USED TO LIVE HERE AND ARE GONE with the columns they described (0289):
// `placementOptions` (operation.placement — the garment zone absorbed it), `mainStitchTypeOptions`
// (the stitch type is the step's own operation_type), `machineClassOptions` (it repeated the
// operation type), and `overlockThreadsOptions`. The last one was the dangerous one to leave lying
// around: it held '3-нит.' / '4-нит.' / '5-нит.' for a field that is now the NUMERIC
// `overlock_thread_count`, and the whole reason that column got a new name instead of a new type was
// so nobody could reconnect the old strings to it by reflex.
//
// `pressingOptions` JOINED THEM with 0306, and for the same kind of reason: `construction.pressing`
// was prose answering «how is this garment pressed» for a whole card, while pressing is a STEP with
// its own equipment, temperature, dwell and press cloth. The five suggestions it held are now three
// step TYPES (press / press open / fusing) and a press profile — see equipment-options.ts. Leaving
// the list would have invited somebody to reconnect free text to a typed vocabulary, which is the
// same reflex `overlockThreadsOptions` was deleted to prevent.
//
// The one below survives because hem finish is still free text on the card's defaults. It is
// ENGLISH: the operations it sits beside moved to English with ISO codes, they print on the same
// tech pack, and half a tab in each language is worse than either language. Stored values are NOT
// rewritten — these are suggestions, and somebody's typed instruction is theirs to keep.
export const hemFinishOptions = [
  'turned twice, closed edge',
  'turned once, overlocked edge',
  'bound',
  'blindstitched',
  'coverstitched',
];

// Packaging suggestion lists.
export const foldingMethodOptions = [
  'on a hanger',
  'folded in half',
  'folded in three',
  'rolled',
  'flat in the box',
];

export const polybagOptions = [
  'individual polybag',
  'polybag with a flap',
  'biodegradable',
  'no polybag',
];

export const bagStickerOptions = ['size', 'barcode', 'composition/care', 'no sticker'];

// inserts = loose items dropped in the box alongside the product, not part of it. Everyone
// starts blank — hint list only, backend takes free text.
export const insertsOptions = [
  'tissue paper',
  'thank-you card',
  'care card',
  'sticker',
  'no inserts',
];

// Construction-description aspects (details[]). The editor seeds these named rows; users can
// add custom keys too. key is the stable proto value; label is what the tailor sees.
export const detailAspects: Array<{ key: string; label: string }> = [
  { key: 'silhouette', label: 'silhouette / fit' },
  // ТКАНЬ — ИМЕНОВАННЫЙ АСПЕКТ, А НЕ САМОДЕЛЬНЫЙ КЛЮЧ. Владелец, круг 20, пункт 5: «плюс новые поля
  // SIZE RANGE, SILHOUETTE (фритекст, напр. „Sleeveless V-neck tank top“), FABRIC (фритекст, напр.
  // „Stretch knit jersey“)». Блок GENERAL INFORMATION пишет `details[]` по ключу `fabric` — ровно
  // как по соседнему `silhouette`; пока ключа не было в этом словаре, редактор аспектов показывал
  // его сырым («fabric» без подписи, в конце списка, среди самодельных), то есть ОДНО И ТО ЖЕ поле
  // на двух поверхностях выглядело как два разных.
  //
  // Стоит вторым, сразу за силуэтом: это два аспекта, которые правятся ещё и из общих сведений, и
  // порядок словаря — это порядок карточек аспектов на экране.
  { key: 'fabric', label: 'fabric' },
  { key: 'collar', label: 'collar / neckline' },
  { key: 'fastening', label: 'fastening' },
  { key: 'pockets', label: 'pockets' },
  { key: 'sleeveCuff', label: 'sleeve / cuff' },
  { key: 'topstitching', label: 'topstitching' },
  { key: 'extraDetails', label: 'extra details' },
  { key: 'auxMaterials', label: 'aux materials' },
];

export const detailKeyLabel = (key?: string): string =>
  detailAspects.find((a) => a.key === key)?.label || key?.trim() || 'aspect';

// Label placement / attachment suggestion lists.
export const labelPlacementOptions = [
  'neckline (centre)',
  'side seam (left)',
  'side seam (right)',
  'waistband (inside)',
  'lining',
  'pocket',
];

export const labelAttachmentOptions = [
  'sewn into the seam',
  'topstitched',
  'heat transfer',
  'hangtag',
];

// AGE GROUP (wave 2026-09-25, T01 / D-01'): a style fact like target gender, stored on the tech
// card and written ONLY through UpdateStyle (StylePatch.age_group, mask path `ageGroup` —
// StyleFactsField). The wire enum, in the ladder order of the size runs. UNKNOWN is «not set»: it
// is shown and never written — the server refuses it under the mask; an unset select stays out.
export const AGE_GROUP_UNSET = 'AGE_GROUP_ENUM_UNKNOWN' as const satisfies common_AgeGroupEnum;

/**
 * What a NEW card starts with (D-01': the new-card UI proposes adult). Only a card being created
 * gets it — an existing card is read with its own value, UNKNOWN included, and is never defaulted.
 */
export const AGE_GROUP_NEW_CARD = 'AGE_GROUP_ENUM_ADULT' as const satisfies common_AgeGroupEnum;

/** The six wire values (UNKNOWN first) — the schema's enum. */
export const AGE_GROUP_VALUES = [
  'AGE_GROUP_ENUM_UNKNOWN',
  'AGE_GROUP_ENUM_ADULT',
  'AGE_GROUP_ENUM_TEEN',
  'AGE_GROUP_ENUM_KIDS',
  'AGE_GROUP_ENUM_TODDLER',
  'AGE_GROUP_ENUM_BABY',
] as const satisfies readonly common_AgeGroupEnum[];

/** The five that can be chosen and written, with their words. */
export const ageGroupOptions: ReadonlyArray<{ value: common_AgeGroupEnum; label: string }> = [
  { value: 'AGE_GROUP_ENUM_ADULT', label: 'adult' },
  { value: 'AGE_GROUP_ENUM_TEEN', label: 'teen' },
  { value: 'AGE_GROUP_ENUM_KIDS', label: 'kids' },
  { value: 'AGE_GROUP_ENUM_TODDLER', label: 'toddler' },
  { value: 'AGE_GROUP_ENUM_BABY', label: 'baby' },
];

/** A real, writable age group (not UNKNOWN, not a token this build does not know). */
export function isAgeGroupSet(value?: string | null): value is common_AgeGroupEnum {
  return !!value && ageGroupOptions.some((o) => o.value === value);
}

export function ageGroupLabel(value?: string | null): string {
  return ageGroupOptions.find((o) => o.value === value)?.label ?? '';
}

/**
 * THE STYLE FACTS — the form fields `StyleFactsField` writes through its own staged `UpdateStyle`,
 * which the card's own save never writes (UpdateTechCard excludes them, R4/§14.7; only
 * CreateTechCard seeds brand, collection, season and gender at creation). ONE list (Codex R8):
 * the panel reads it for its dirty map, its mask and its label (in this order), and the card's
 * body save for the baselines it leaves to that panel (`keepBaseline`). A fact added in one place
 * and not the other would be written by nobody or re-baselined by the wrong writer.
 */
export const STYLE_FACT_KEYS = [
  'fit',
  'careInstructions',
  'brand',
  'collection',
  'season',
  'targetGender',
  'ageGroup',
] as const satisfies readonly (keyof TechCardFormData)[];

export type StyleFact = (typeof STYLE_FACT_KEYS)[number];
