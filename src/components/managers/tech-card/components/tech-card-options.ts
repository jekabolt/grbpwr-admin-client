// Guided-but-open vocabularies for the tech-card form (ComboField suggestion lists +
// closed-select item lists). Hints, not closed sets, unless used via SelectField.

// Units of measure for a BOM article / usage (ComboField → bom_item.unit).
export const unitOptions = ['м', 'см', 'г', 'кг', 'pcs', 'компл', 'м²', 'пог.м', 'рулон'];

// FOUR LISTS USED TO LIVE HERE AND ARE GONE with the columns they described (0289):
// `placementOptions` (operation.placement — the garment zone absorbed it), `mainStitchTypeOptions`
// (the stitch type is the step's own operation_type), `machineClassOptions` (it repeated the
// operation type), and `overlockThreadsOptions`. The last one was the dangerous one to leave lying
// around: it held '3-нит.' / '4-нит.' / '5-нит.' for a field that is now the NUMERIC
// `overlock_thread_count`, and the whole reason that column got a new name instead of a new type was
// so nobody could reconnect the old strings to it by reflex.
//
// The two below survive because hem finish and pressing are still free text on the card's defaults.
// They are ENGLISH now: the operations they sit beside moved to English with ISO codes, they print on
// the same tech pack, and half a tab in each language is worse than either language. Stored values
// are NOT rewritten — these are suggestions, and somebody's typed instruction is theirs to keep.
export const hemFinishOptions = [
  'turned twice, closed edge',
  'turned once, overlocked edge',
  'bound',
  'blindstitched',
  'coverstitched',
];

export const pressingOptions = [
  'press open',
  'press to one side',
  'steam only',
  'fuse (interlining)',
  'final press, finished garment',
];

// Packaging suggestion lists.
export const foldingMethodOptions = [
  'на вешалке',
  'сложить пополам',
  'сложить втрое',
  'рулоном',
  'в коробке плоско',
];

export const polybagOptions = [
  'индивидуальный пакет',
  'пакет с клапаном',
  'biodegradable',
  'без пакета',
];

export const bagStickerOptions = ['размерный', 'штрих-код', 'состав/уход', 'без стикера'];

// inserts = loose items dropped in the box alongside the product, not part of it. Everyone
// starts blank — hint list only, backend takes free text.
export const insertsOptions = [
  'папиросная бумага',
  'thank-you card',
  'care card',
  'стикер',
  'без вложений',
];

// Construction-description aspects (details[]). The editor seeds these named rows; users can
// add custom keys too. key is the stable proto value; label is what the tailor sees.
export const detailAspects: Array<{ key: string; label: string }> = [
  { key: 'silhouette', label: 'силуэт / посадка' },
  { key: 'collar', label: 'воротник / горловина' },
  { key: 'fastening', label: 'застёжка' },
  { key: 'pockets', label: 'карманы' },
  { key: 'sleeveCuff', label: 'рукав / манжета' },
  { key: 'topstitching', label: 'отстрочка' },
  { key: 'extraDetails', label: 'доп. детали' },
  { key: 'auxMaterials', label: 'вспом. материалы' },
];

export const detailKeyLabel = (key?: string): string =>
  detailAspects.find((a) => a.key === key)?.label || key?.trim() || 'аспект';

// Label placement / attachment suggestion lists.
export const labelPlacementOptions = [
  'горловина (центр)',
  'боковой шов (левый)',
  'боковой шов (правый)',
  'пояс (внутри)',
  'подкладка',
  'карман',
];

export const labelAttachmentOptions = ['втачать в шов', 'настрочить', 'термоперенос', 'подвесная'];
