// Guided-but-open vocabularies for the tech-card form (ComboField suggestion lists +
// closed-select item lists). Hints, not closed sets, unless used via SelectField.

// Units of measure for a BOM article / usage (ComboField → bom_item.unit).
export const unitOptions = ['м', 'см', 'г', 'кг', 'pcs', 'компл', 'м²', 'пог.м', 'рулон'];

// Garment parts. Shared by colourway usages (usage.placement) and operations
// (operation.placement) so the construction tab can resolve an operation's real material
// through the selected colourway's usage on the same part. Matched trim+lower server-side.
export const placementOptions = [
  'outer',
  'front',
  'back',
  'side panel',
  'yoke',
  'sleeve',
  'cuff',
  'collar',
  'inner collar',
  'collar stand',
  'lapel',
  'placket',
  'pocket',
  'pocket bag',
  'waistband',
  'belt',
  'hood',
  'lining',
  'facing',
  'gusset',
  'vent',
  'hem',
  'binding',
  'trim',
];

// Construction (workmanship) suggestion lists — guided ComboFields on TechCardConstruction.
export const mainStitchTypeOptions = [
  'челночный (301)',
  '2-ниточный цепной (401)',
  'плоский (605)',
  'оверлочный (514)',
  'потайной',
];

export const overlockThreadsOptions = ['3-нит.', '4-нит.', '5-нит.'];

export const hemFinishOptions = [
  'в подгибку с закрытым срезом',
  'в подгибку с открытым срезом (оверлок)',
  'окантовка',
  'потайная подшивка',
  'распошивальный',
];

export const pressingOptions = [
  'разутюжить',
  'заутюжить',
  'отпарить',
  'дублировать (клеевой)',
  'ВТО готового изделия',
];

export const machineClassOptions = [
  'стачивающая (301)',
  '2-игольная (401)',
  'оверлок 4-нит. (514)',
  'плоскошовная (602)',
  'распошивальная (605)',
  'петельная',
  'пуговичная',
  'закрепочная (304)',
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
