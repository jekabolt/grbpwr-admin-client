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

// How the garment itself is folded for the carton (the carton row's «garment fold»).
export const foldingMethodOptions = [
  'on a hanger',
  'folded in half',
  'folded in three',
  'rolled',
  'flat in the box',
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
  { key: 'seams', label: 'seams' },
  { key: 'extraDetails', label: 'extra details' },
  { key: 'auxMaterials', label: 'aux materials' },
];

export const detailKeyLabel = (key?: string): string =>
  detailAspects.find((a) => a.key === key)?.label || key?.trim() || 'aspect';

// ═══ LABELS REWORK — the known kinds and the pick-or-type hints (02-DESIGN §2.3–2.5, D-11) ═══════
//
// Known-ness is a CLIENT constant, exactly like `detailAspects`: the server stores the key as typed
// (no CHECK, the lesson of 0070's regex), and any other key is a custom label. Composition is not in
// the list — it is the mandatory block above; carton is not an item — its facts are the carton row.

export type LabelKind = { key: string; label: string };

export const garmentLabelKinds: LabelKind[] = [
  { key: 'brand', label: 'brand label' },
  { key: 'size', label: 'size label' },
  { key: 'flag', label: 'flag label' },
  { key: 'hangtag', label: 'hangtag' },
  { key: 'barcode', label: 'barcode / price sticker' },
  { key: 'special', label: 'special / promo' },
];

// Spelled like the TechCardBomKind packaging kinds, so a BOM line and an item read as one word.
export const packagingItemKinds: LabelKind[] = [
  { key: 'polybag', label: 'polybag' },
  { key: 'tissue', label: 'tissue paper' },
  { key: 'sticker', label: 'sticker' },
  { key: 'insert_card', label: 'insert card' },
  { key: 'dust_bag', label: 'dust bag' },
  { key: 'garment_case', label: 'garment case' },
  { key: 'tote_bag', label: 'tote bag' },
  { key: 'hanger', label: 'hanger' },
  { key: 'hangtag_string', label: 'hangtag string' },
  { key: 'spare_kit_bag', label: 'spare kit bag' },
];

/** A known key reads as its word; a custom key reads as typed. Case-blind like the writers. */
export function kindLabel(kinds: LabelKind[], key?: string): string {
  const k = (key ?? '').trim();
  return kinds.find((x) => x.key.toLowerCase() === k.toLowerCase())?.label || k;
}

export const labelPlacementOptions = [
  'neckline, centre back',
  'left side seam',
  'right side seam',
  'waistband, inside',
  'lining',
  'pocket',
  'hem',
  'sleeve',
];

export const labelAttachmentOptions = [
  'sewn into the seam',
  'topstitched, four sides',
  'topstitched, top edge',
  'heat transfer',
  'hung on a string through the brand label',
  'inserted in the polybag',
];

export const labelFoldingOptions = ['flat', 'end fold', 'centre fold', 'mitre fold', 'loop fold'];

export const packagingUsageOptions = [
  'one per garment',
  'one per order',
  'in the polybag',
  'in the box',
  'on the hanger',
];

export const packagingPackingOptions = [
  'garment folded inside',
  'on top, face up',
  'flat',
  'rolled',
  'sealed with a sticker',
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
