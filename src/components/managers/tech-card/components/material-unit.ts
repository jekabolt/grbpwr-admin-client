import type { common_Material } from 'api/proto-http/admin';

type MaterialUnitSource = Pick<common_Material, 'unit' | 'unitCode' | 'threadAttrs'>;

const UNIT_ALIASES = new Map<string, string>([
  ['m', 'm'],
  ['м', 'm'],
  ['meter', 'm'],
  ['meters', 'm'],
  ['metre', 'm'],
  ['metres', 'm'],
  ['material_unit_m', 'm'],
  ['cm', 'cm'],
  ['см', 'cm'],
  ['centimeter', 'cm'],
  ['centimeters', 'cm'],
  ['centimetre', 'cm'],
  ['centimetres', 'cm'],
  ['material_unit_cm', 'cm'],
  ['mm', 'mm'],
  ['мм', 'mm'],
  ['millimeter', 'mm'],
  ['millimeters', 'mm'],
  ['millimetre', 'mm'],
  ['millimetres', 'mm'],
  ['material_unit_mm', 'mm'],
  ['m2', 'm2'],
  ['m²', 'm2'],
  ['м2', 'm2'],
  ['м²', 'm2'],
  ['sq m', 'm2'],
  ['sqm', 'm2'],
  ['square meter', 'm2'],
  ['square meters', 'm2'],
  ['square metre', 'm2'],
  ['square metres', 'm2'],
  ['material_unit_m2', 'm2'],
  ['g', 'g'],
  ['г', 'g'],
  ['gram', 'g'],
  ['grams', 'g'],
  ['gramme', 'g'],
  ['grammes', 'g'],
  ['material_unit_g', 'g'],
  ['kg', 'kg'],
  ['кг', 'kg'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['kilogramme', 'kg'],
  ['kilogrammes', 'kg'],
  ['material_unit_kg', 'kg'],
  ['material_unit_pcs', 'pcs'],
  ['material_unit_pair', 'pair'],
  ['material_unit_set', 'set'],
  ['material_unit_cone', 'cone'],
  ['material_unit_roll', 'roll'],
]);

/** The material-unit spellings the backend treats as the same physical unit. */
export function normalizeMaterialUnit(unit?: string): string {
  const value = (unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return UNIT_ALIASES.get(value) ?? value;
}

function materialUnit(material: Pick<MaterialUnitSource, 'unit' | 'unitCode'>): string {
  const code = material.unitCode;
  return normalizeMaterialUnit(code && code !== 'MATERIAL_UNIT_UNKNOWN' ? code : material.unit);
}

const MASS_UNITS = new Set([
  'mg',
  'milligram',
  'milligrams',
  'g',
  'kg',
  't',
  'ton',
  'tons',
  'tonne',
  'tonnes',
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
]);
const VOLUME_UNITS = new Set([
  'ml',
  'milliliter',
  'milliliters',
  'millilitre',
  'millilitres',
  'cl',
  'dl',
  'l',
  'liter',
  'liters',
  'litre',
  'litres',
  'gal',
  'gallon',
  'gallons',
]);

/** Package units may use thread length; mass, area, and volume units never may. */
export function isMassAreaOrVolumeUnit(
  material: Pick<MaterialUnitSource, 'unit' | 'unitCode'>,
): boolean {
  const unit = materialUnit(material);
  if (MASS_UNITS.has(unit) || VOLUME_UNITS.has(unit)) return true;
  const compact = unit
    .replace(/[.·\s_-]+/g, '')
    .replace(/\^/g, '')
    .replace(/²/g, '2')
    .replace(/³/g, '3');
  return (
    MASS_UNITS.has(compact) ||
    VOLUME_UNITS.has(compact) ||
    compact === 'gsm' ||
    compact === 'sqm' ||
    /^(?:m|cm|mm|km|in|ft|yd)(?:2|3)$/.test(compact) ||
    /^(?:mg|g|kg)\/(?:m|cm|mm)(?:2)?$/.test(compact)
  );
}

/** Metres represented by one catalogue purchase unit, or null when units do not reconcile. */
export function metresPerArticleUnit(material: MaterialUnitSource): number | null {
  const unit = materialUnit(material);
  if (unit === 'm') return 1;
  if (unit === 'cm') return 0.01;
  if (unit === 'mm') return 0.001;
  if (isMassAreaOrVolumeUnit(material)) return null;
  const length = Number(material.threadAttrs?.lengthPerConeM?.value ?? '');
  return Number.isFinite(length) && length > 0 ? length : null;
}

type DecimalParts = { digits: bigint; scale: number; negative: boolean };

function decimalParts(input: string | number): DecimalParts | null {
  const raw = String(input).trim().replace(',', '.');
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) return null;
  const fraction = match[3] ?? match[4] ?? '';
  let digits = `${match[2] ?? '0'}${fraction}`.replace(/^0+(?=\d)/, '');
  let scale = fraction.length - Number(match[5] ?? 0);
  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }
  return { digits: BigInt(digits || '0'), scale, negative: match[1] === '-' };
}

const pow10 = (power: number): bigint => BigInt(`1${'0'.repeat(power)}`);

/** Article price divided by metres per purchase unit, rounded half-up to the BOM scale. */
export function pricePerMetre(
  price: string | number | undefined,
  factor: number | null | undefined,
): string {
  if (price == null || factor == null) return '';
  const p = decimalParts(price);
  const f = decimalParts(factor);
  if (!p || !f || f.negative || f.digits === 0n) return '';

  const numerator = p.digits * pow10(f.scale) * 10_000n;
  const denominator = f.digits * pow10(p.scale);
  let rounded = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) rounded += 1n;
  if (p.negative && rounded !== 0n) rounded = -rounded;

  const negative = rounded < 0n;
  const absolute = (negative ? -rounded : rounded).toString().padStart(5, '0');
  return `${negative ? '-' : ''}${absolute.slice(0, -4)}.${absolute.slice(-4)}`;
}
