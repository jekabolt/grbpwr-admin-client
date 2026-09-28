// ЧАСТИ ЭТИКЕТКИ — на какую колонку составника идёт строка BOM (план §3.4, §5.2).
//
// На строке BOM хранится только ЯВНЫЙ выбор (`label_part`, энум `TechCardBomLabelPart`); NULL /
// UNSPECIFIED значит «авто», и авто считает КЛИЕНТ — вот этим `defaultLabelPart`. Тот же дефолт
// рисует плейсхолдер `auto → SHELL` в селекте строки BOM: оператор видит ровно то, что
// напечатается. Смена правила дефолта не требует миграции данных.
//
// Значения энума — строками, без импорта генерата: движок не ждёт регена прото (задача B3).
import type { common_TechCardBomPurpose, common_TechCardBomSection } from 'api/proto-http/admin';

/** Часть этикетки — ключ. `NOT_ON_LABEL` — строка на ленту не идёт. */
export type LabelPart =
  | 'SHELL'
  | 'BODY_LINING'
  | 'SLEEVE_LINING'
  | 'POCKET_LINING'
  | 'HOOD_LINING'
  | 'FILLING'
  | 'TRIM'
  | 'NOT_ON_LABEL';

/** Колонка составника: часть на ленте либо псевдо-часть NOTE (фраза ст. 12, §3.3). */
export type PrintedPart = Exclude<LabelPart, 'NOT_ON_LABEL'> | 'NOTE';

/** Порядок печати колонок. NOTE — всегда последней. */
export const LABEL_PARTS: readonly PrintedPart[] = [
  'SHELL',
  'BODY_LINING',
  'SLEEVE_LINING',
  'POCKET_LINING',
  'HOOD_LINING',
  'FILLING',
  'TRIM',
  'NOTE',
];

/** Заголовок колонки на ленте (только EN, как на макете) и подпись в селекте. */
export const LABEL_PART_NAME: Record<LabelPart | 'NOTE', string> = {
  SHELL: 'SHELL',
  BODY_LINING: 'BODY LINING',
  SLEEVE_LINING: 'SLEEVE LINING',
  POCKET_LINING: 'POCKET LINING',
  HOOD_LINING: 'HOOD LINING',
  FILLING: 'FILLING',
  TRIM: 'TRIM',
  NOTE: 'NOTE',
  NOT_ON_LABEL: 'NOT ON LABEL',
};

/** Значения энума `TechCardBomLabelPart` на проводе (proto `techcard.proto`, B1). */
export type LabelPartWire =
  | 'TECH_CARD_BOM_LABEL_PART_UNSPECIFIED'
  | 'TECH_CARD_BOM_LABEL_PART_SHELL'
  | 'TECH_CARD_BOM_LABEL_PART_BODY_LINING'
  | 'TECH_CARD_BOM_LABEL_PART_SLEEVE_LINING'
  | 'TECH_CARD_BOM_LABEL_PART_POCKET_LINING'
  | 'TECH_CARD_BOM_LABEL_PART_HOOD_LINING'
  | 'TECH_CARD_BOM_LABEL_PART_FILLING'
  | 'TECH_CARD_BOM_LABEL_PART_TRIM'
  | 'TECH_CARD_BOM_LABEL_PART_NOT_ON_LABEL';

const WIRE_PREFIX = 'TECH_CARD_BOM_LABEL_PART_';

export const LABEL_PART_UNSPECIFIED: LabelPartWire = 'TECH_CARD_BOM_LABEL_PART_UNSPECIFIED';

/** Все явные части в порядке энума — для селекта строки BOM. */
export const SELECTABLE_LABEL_PARTS: readonly LabelPart[] = [
  'SHELL',
  'BODY_LINING',
  'SLEEVE_LINING',
  'POCKET_LINING',
  'HOOD_LINING',
  'FILLING',
  'TRIM',
  'NOT_ON_LABEL',
];

export const labelPartToWire = (p: LabelPart | undefined): LabelPartWire =>
  p ? (`${WIRE_PREFIX}${p}` as LabelPartWire) : LABEL_PART_UNSPECIFIED;

/**
 * Провод → явная часть. `undefined` / UNSPECIFIED / незнакомое значение (новее клиента) → `undefined`,
 * то есть «авто»: незнакомую часть честнее вывести дефолтом, чем выкинуть строку с ленты.
 */
export function labelPartFromWire(wire: string | undefined | null): LabelPart | undefined {
  if (!wire || !wire.startsWith(WIRE_PREFIX)) return undefined;
  const key = wire.slice(WIRE_PREFIX.length) as LabelPart;
  return (SELECTABLE_LABEL_PARTS as readonly string[]).includes(key) ? key : undefined;
}

type Section = common_TechCardBomSection | string | undefined;
type Purpose = common_TechCardBomPurpose | string | undefined;

/**
 * Дефолт части по секции и назначению строки (§5.2).
 * FABRIC: MAIN/CONTRAST/MESH/UNSET/OTHER → SHELL; LINING → BODY LINING; POCKETING → POCKET LINING;
 * INSULATION → FILLING; INTERFACING → NOT ON LABEL.
 * LINING-секция → BODY LINING (с POCKETING → POCKET LINING); INSULATION → FILLING;
 * INTERLINING, THREAD, HARDWARE, LABEL, PACKAGING, TRIM, DECORATION, OTHER, UNKNOWN → NOT ON LABEL.
 * TRIM-секция по умолчанию НЕ на ленте (резинки/тесьма — не состав изделия); кожаная отделка
 * ставится явно.
 */
export function defaultLabelPart(section: Section, purpose: Purpose): LabelPart {
  switch (section) {
    case 'TECH_CARD_BOM_SECTION_FABRIC':
      switch (purpose) {
        case 'TECH_CARD_BOM_PURPOSE_LINING':
          return 'BODY_LINING';
        case 'TECH_CARD_BOM_PURPOSE_POCKETING':
          return 'POCKET_LINING';
        case 'TECH_CARD_BOM_PURPOSE_INSULATION':
          return 'FILLING';
        case 'TECH_CARD_BOM_PURPOSE_INTERFACING':
          return 'NOT_ON_LABEL';
        default:
          return 'SHELL';
      }
    case 'TECH_CARD_BOM_SECTION_LINING':
      return purpose === 'TECH_CARD_BOM_PURPOSE_POCKETING' ? 'POCKET_LINING' : 'BODY_LINING';
    case 'TECH_CARD_BOM_SECTION_INSULATION':
      return 'FILLING';
    default:
      return 'NOT_ON_LABEL';
  }
}

/** Итоговая часть строки: явное значение всегда побеждает дефолт. */
export const effectiveLabelPart = (line: {
  section: Section;
  purpose?: Purpose;
  labelPart?: string | null;
}): LabelPart => labelPartFromWire(line.labelPart) ?? defaultLabelPart(line.section, line.purpose);
