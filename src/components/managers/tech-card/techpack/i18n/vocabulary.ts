import type { PdfMessageKey } from './en';
import { own } from './own';
import { englishT, type PdfT } from './translate';

type KeyMap = Readonly<Record<string, PdfMessageKey>>;

const valueFor = (map: KeyMap, value: string | undefined, t: PdfT): string | undefined => {
  const key = value ? map[value] : undefined;
  return key ? t(key) : undefined;
};

// Статус — свободная строка карточки («draft», «DRAFT», «released»): ищем без регистра, а
// незнакомый отдаём модели, как остальной свой текст.
const STATUS_KEYS: KeyMap = {
  draft: 'vocab.statusDraft',
  released: 'vocab.statusReleased',
};

export const statusText = (value: string | undefined, t: PdfT): string => {
  const key = value ? STATUS_KEYS[value.toLowerCase()] : undefined;
  if (!key) return own(value);
  // На английском — как записано в карточке: английский лист не меняется ни на букву.
  const text = t(key);
  return text === englishT(key) ? value ?? '' : text;
};

const GENDER_KEYS: KeyMap = {
  GENDER_ENUM_MALE: 'vocab.genderMale',
  GENDER_ENUM_FEMALE: 'vocab.genderFemale',
  GENDER_ENUM_UNISEX: 'vocab.genderUnisex',
  male: 'vocab.genderMale',
  female: 'vocab.genderFemale',
  unisex: 'vocab.genderUnisex',
  TECH_CARD_TARGET_GENDER_MALE: 'vocab.genderMaleLegacy',
  TECH_CARD_TARGET_GENDER_FEMALE: 'vocab.genderFemaleLegacy',
  TECH_CARD_TARGET_GENDER_UNISEX: 'vocab.genderUnisexLegacy',
};

export const genderText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(GENDER_KEYS, value, t) ?? fallback;

const MATERIAL_ROLE_KEYS: KeyMap = {
  TECH_CARD_BOM_PURPOSE_UNSET: 'vocab.purposeUnset',
  TECH_CARD_BOM_PURPOSE_MAIN: 'vocab.purposeMain',
  TECH_CARD_BOM_PURPOSE_LINING: 'vocab.purposeLining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'vocab.purposePocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'vocab.purposeInterfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'vocab.purposeInsulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'vocab.purposeContrast',
  TECH_CARD_BOM_PURPOSE_BINDING: 'vocab.purposeBinding',
  TECH_CARD_BOM_PURPOSE_MESH: 'vocab.purposeMesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'vocab.purposeOther',
  TECH_CARD_BOM_SECTION_LINING: 'vocab.purposeLining',
  TECH_CARD_BOM_SECTION_INTERLINING: 'vocab.purposeInterfacing',
  TECH_CARD_BOM_SECTION_INSULATION: 'vocab.purposeInsulation',
};

export const materialRoleText = (
  item: { purpose?: string; section?: string },
  fallback: string,
  t: PdfT,
): string =>
  valueFor(MATERIAL_ROLE_KEYS, item.purpose, t) ??
  valueFor(MATERIAL_ROLE_KEYS, item.section, t) ??
  fallback;

const BOM_KIND_KEYS: KeyMap = {
  TECH_CARD_BOM_KIND_BUTTON: 'vocab.bomButton',
};

export const bomKindText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(BOM_KIND_KEYS, value, t) ?? fallback;

const LABEL_PART_KEYS: KeyMap = {
  SHELL: 'labels.shell',
  BODY_LINING: 'vocab.labelBodyLining',
  SLEEVE_LINING: 'vocab.labelSleeveLining',
  POCKET_LINING: 'vocab.labelPocketLining',
  HOOD_LINING: 'vocab.labelHoodLining',
  FILLING: 'vocab.labelFilling',
  TRIM: 'vocab.labelTrim',
};

export const labelPartText = (value: string, fallback: string, t: PdfT): string =>
  valueFor(LABEL_PART_KEYS, value, t) ?? fallback;

const OPERATION_WORK_KEYS: KeyMap = {
  join_lockstitch: 'vocab.operationJoin',
  fuse: 'vocab.operationFuse',
  button_attach: 'vocab.operationButtonAttach',
  buttonhole: 'vocab.operationButtonhole',
  press_flat: 'vocab.operationPressFlat',
};

const OPERATION_TYPE_KEYS: KeyMap = {
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: 'vocab.operationJoin',
  TECH_CARD_OPERATION_TYPE_FUSING: 'vocab.operationFuse',
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: 'vocab.operationButtonAttach',
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: 'vocab.operationButtonhole',
  TECH_CARD_OPERATION_TYPE_PRESS: 'vocab.operationPressFlat',
};

export const operationText = (
  work: string | undefined,
  operationType: string | undefined,
  t: PdfT,
): string | undefined =>
  valueFor(OPERATION_WORK_KEYS, work, t) ?? valueFor(OPERATION_TYPE_KEYS, operationType, t);

const MACHINE_KEYS: KeyMap = {
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: 'vocab.machineLockstitch',
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: 'vocab.operationButtonAttach',
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: 'vocab.operationButtonhole',
};

export const machineText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(MACHINE_KEYS, value, t) ?? fallback;

const PRESS_EQUIPMENT_KEYS: KeyMap = {
  TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS: 'vocab.machineFusingPress',
  TECH_CARD_PRESS_EQUIPMENT_IRON: 'vocab.machineIron',
};

export const pressEquipmentText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(PRESS_EQUIPMENT_KEYS, value, t) ?? fallback;

const REVISION_ACTION_KEYS: KeyMap = {
  created: 'vocab.revisionCreated',
  updated: 'vocab.revisionUpdated',
  approved: 'vocab.revisionApproved',
  released: 'vocab.revisionReleased',
  reverted: 'vocab.revisionReverted',
  role_assigned: 'vocab.revisionRoleAssigned',
  other: 'vocab.revisionActionOther',
};

const REVISION_SECTION_KEYS: KeyMap = {
  header: 'vocab.revisionHeader',
  sketch: 'vocab.revisionSketch',
  bom: 'vocab.revisionBom',
  colorway: 'vocab.revisionColorway',
  pieces: 'vocab.revisionPieces',
  construction: 'vocab.revisionConstruction',
  labels: 'vocab.revisionLabels',
  packaging: 'vocab.revisionPackaging',
  costing: 'vocab.revisionCosting',
  signoff: 'vocab.revisionSignoff',
  other: 'vocab.revisionSectionOther',
};

export const revisionActionText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(REVISION_ACTION_KEYS, value, t) ?? fallback;

export const revisionSectionText = (value: string | undefined, fallback: string, t: PdfT): string =>
  valueFor(REVISION_SECTION_KEYS, value, t) ?? fallback;
