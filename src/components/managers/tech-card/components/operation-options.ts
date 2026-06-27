import {
  common_TechCardConstructionZone,
  common_TechCardOperationType,
} from 'api/proto-http/admin';

// Operation type = the machine / stitch class. Surfaced to the tailor as a verb; stored
// as the proto enum. This is the primary classifier of an operation and drives the
// machine / stitch defaults below.
export const operationTypeOptions: Array<{ value: common_TechCardOperationType; label: string }> = [
  { value: 'TECH_CARD_OPERATION_TYPE_UNKNOWN', label: '— тип —' },
  { value: 'TECH_CARD_OPERATION_TYPE_LOCKSTITCH', label: 'стачать (челночный 301)' },
  { value: 'TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE', label: 'настрочить (2 иглы)' },
  { value: 'TECH_CARD_OPERATION_TYPE_OVERLOCK', label: 'обметать (оверлок)' },
  { value: 'TECH_CARD_OPERATION_TYPE_COVERSTITCH', label: 'распошить / подшить (плоскошовн.)' },
  { value: 'TECH_CARD_OPERATION_TYPE_CHAINSTITCH', label: 'цепной стежок (401)' },
  { value: 'TECH_CARD_OPERATION_TYPE_BLINDHEM', label: 'подшить потайным' },
  { value: 'TECH_CARD_OPERATION_TYPE_BARTACK', label: 'закрепка' },
  { value: 'TECH_CARD_OPERATION_TYPE_BUTTONHOLE', label: 'петля' },
  { value: 'TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH', label: 'пришить пуговицу' },
  { value: 'TECH_CARD_OPERATION_TYPE_FUSING', label: 'дублировать / ВТО' },
  { value: 'TECH_CARD_OPERATION_TYPE_HANDWORK', label: 'вручную' },
  { value: 'TECH_CARD_OPERATION_TYPE_OTHER', label: 'другое' },
];

// Zone groups operations for display only (construction stays one ordered list).
export const zoneOptions: Array<{ value: common_TechCardConstructionZone; label: string }> = [
  { value: 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN', label: '— зона —' },
  { value: 'TECH_CARD_CONSTRUCTION_ZONE_OUTER', label: 'верх' },
  { value: 'TECH_CARD_CONSTRUCTION_ZONE_LINING', label: 'подклад' },
  { value: 'TECH_CARD_CONSTRUCTION_ZONE_INTERLINING', label: 'приклад / дублерин' },
  { value: 'TECH_CARD_CONSTRUCTION_ZONE_OTHER', label: 'другое' },
];

// Picking a verb pre-fills the machine (and a sensible stitch density) when those fields
// are still blank — so a row is usable after one choice, and overridable after.
export const OPERATION_TYPE_PRESETS: Record<string, { machine: string; stitchesPerCm?: string }> = {
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: { machine: 'стачивающая (301)', stitchesPerCm: '4' },
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: { machine: '2-игольная (401)', stitchesPerCm: '4' },
  TECH_CARD_OPERATION_TYPE_OVERLOCK: { machine: 'оверлок 4-нит. (514)' },
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: { machine: 'плоскошовная (602)', stitchesPerCm: '4' },
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: { machine: 'цепной стежок (401)', stitchesPerCm: '4' },
  TECH_CARD_OPERATION_TYPE_BLINDHEM: { machine: 'потайная' },
  TECH_CARD_OPERATION_TYPE_BARTACK: { machine: 'закрепочная (304)' },
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: { machine: 'петельная' },
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: { machine: 'пуговичная' },
  TECH_CARD_OPERATION_TYPE_FUSING: { machine: 'пресс / ВТО' },
  TECH_CARD_OPERATION_TYPE_HANDWORK: { machine: 'вручную' },
};

// Suggestion lists for the free-text-but-guided operation fields (ComboField). These are
// hints, not a closed set — the tailor can always type a value that isn't listed.
export const nodeOptions = [
  'плечевые швы',
  'боковые швы',
  'рукав (втачать)',
  'окат рукава',
  'пройма',
  'горловина',
  'воротник (втачать)',
  'воротник (обтачать)',
  'манжета',
  'низ изделия',
  'низ рукава',
  'застёжка / планка',
  'карман',
  'кокетка',
  'вытачки',
  'пояс',
  'шлёвки',
  'молния',
  'подклад',
];

export const machineOptions = [
  'стачивающая (301)',
  '2-игольная (401)',
  'оверлок 3-нит. (504)',
  'оверлок 4-нит. (514)',
  'оверлок 5-нит. (516)',
  'плоскошовная (602)',
  'распошивальная (605)',
  'цепной стежок (401)',
  'потайная',
  'закрепочная (304)',
  'петельная',
  'пуговичная',
  'пресс / ВТО',
  'вручную',
];

export const seamTypeOptions = [
  'стачной взаутюжку',
  'стачной вразутюжку',
  'настрочной',
  'расстрочной',
  'запошивочный',
  'обтачной',
  'в подгибку с открытым срезом',
  'в подгибку с закрытым срезом',
  'окантовочный',
  'бельевой шов',
  'французский шов',
];

export const seamAllowanceOptions = ['5 мм', '7 мм', '10 мм', '12 мм', '15 мм', '20 мм'];

export const stitchDensityOptions = ['2', '2.5', '3', '3.5', '4', '4.5', '5'];

export const topstitchWidthOptions = ['в край', '1 мм', '2 мм', '5 мм', '6 мм', '2 × 6 мм'];

export const needleOptions = ['70/10', '80/12', '90/14', '100/16', '110/18', '120/19'];

export const threadOptions = ['40/2', '50/2', '120/2', 'Tex 27', 'Tex 30', 'Tex 40', 'Tex 60'];

export const attachmentOptions = [
  'без приспособления',
  'окантовыватель',
  'лапка-улитка',
  'лапка для молнии',
  'лапка для потайной молнии',
  'направитель (стропа)',
  'подгибатель (hemmer)',
  'лапка для канта',
  'лапка для резинки',
];

// "BLK: чёрная · WHT: белая" — the per-colourway colours of a BOM material, so a single
// (colourway-agnostic) operation tells the sewer which colour to use for which colourway.
// Construction stays one process; only the colour differs, and that lives in the BOM.
export function colorwayColorSummary(
  colorwayColors: Array<{ colorwayIndex?: number; color?: string; pantone?: string }> | undefined,
  colorwayLabels: string[],
): string {
  if (!colorwayColors?.length) return '';
  return colorwayColors
    .map((cc) => {
      const color = cc.color?.trim() || cc.pantone?.trim();
      if (!color) return '';
      const i = cc.colorwayIndex ?? -1;
      const label = colorwayLabels[i] ?? `#${i + 1}`;
      return `${label}: ${color}`;
    })
    .filter(Boolean)
    .join(' · ');
}
