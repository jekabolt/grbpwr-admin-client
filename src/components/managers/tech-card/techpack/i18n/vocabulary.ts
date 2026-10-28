import type { PdfMessageKey } from './en';
import { own } from './own';
import { englishT, type PdfT } from './translate';

type KeyMap = Readonly<Record<string, PdfMessageKey>>;

const valueFor = (map: KeyMap, value: string | undefined, t: PdfT): string | undefined => {
  const key = value ? map[value] : undefined;
  return key ? t(key) : undefined;
};

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

// Словарное слово берём, только если его английский — ровно то, что лист печатал до перевода.
// Иначе на листе стоит другой текст (подпись из каталога, имя из карточки): его переводит модель.
// На английском всегда возвращается прежний текст — английский лист не меняется ни на букву.
const pick = (map: KeyMap, value: string | undefined, fallback: string, t: PdfT): string => {
  const key = value ? map[value] : undefined;
  if (key && same(englishT(key), fallback)) {
    const text = t(key);
    return text === englishT(key) ? fallback : text;
  }
  return own(fallback);
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
  pick(GENDER_KEYS, value, fallback, t);

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
  item.purpose &&
  MATERIAL_ROLE_KEYS[item.purpose] &&
  same(englishT(MATERIAL_ROLE_KEYS[item.purpose]), fallback)
    ? pick(MATERIAL_ROLE_KEYS, item.purpose, fallback, t)
    : pick(MATERIAL_ROLE_KEYS, item.section, fallback, t);

const BOM_KIND_KEYS: KeyMap = {
  TECH_CARD_BOM_KIND_BUTTON: 'vocab.bomButton',
};

export const bomKindText = (value: string | undefined, fallback: string, t: PdfT): string =>
  pick(BOM_KIND_KEYS, value, fallback, t);

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
  pick(LABEL_PART_KEYS, value, fallback, t);

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

/** The operation verb for a heading the catalog printed: dictionary word when it is that word, else the model. */
export const operationVerb = (
  work: string | undefined,
  operationType: string | undefined,
  heading: string,
  t: PdfT,
): string | undefined => {
  const en = operationText(work, operationType, englishT);
  if (!en || !same(en, heading)) return undefined;
  const text = operationText(work, operationType, t) ?? heading;
  return text === en ? heading : text;
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
  pick(MACHINE_KEYS, value, fallback, t);

const PRESS_EQUIPMENT_KEYS: KeyMap = {
  TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS: 'vocab.machineFusingPress',
  TECH_CARD_PRESS_EQUIPMENT_IRON: 'vocab.machineIron',
};

export const pressEquipmentText = (value: string | undefined, fallback: string, t: PdfT): string =>
  pick(PRESS_EQUIPMENT_KEYS, value, fallback, t);

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
  pick(REVISION_ACTION_KEYS, value, fallback, t);

export const revisionSectionText = (value: string | undefined, fallback: string, t: PdfT): string =>
  pick(REVISION_SECTION_KEYS, value, fallback, t);
