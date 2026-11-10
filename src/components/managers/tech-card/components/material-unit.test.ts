import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import {
  isMassAreaOrVolumeUnit,
  metresPerArticleUnit,
  normalizeMaterialUnit,
  pricePerMetre,
} from './material-unit';

const material = (unit: string, length?: string): common_Material =>
  ({
    unit,
    unitCode: 'MATERIAL_UNIT_UNKNOWN',
    threadAttrs:
      length === undefined
        ? undefined
        : { lengthPerConeM: { value: length }, ticketTex: '', needleReco: '' },
  }) as common_Material;

describe('material unit normalization', () => {
  it.each(['m', 'м', 'meter', 'meters', 'metre', 'metres', 'MATERIAL_UNIT_M'])(
    'normalizes %s to metres',
    (unit) => expect(normalizeMaterialUnit(unit)).toBe('m'),
  );

  it('keeps mass, area, and volume units out of thread-length conversion', () => {
    expect(isMassAreaOrVolumeUnit(material('kg', '5000'))).toBe(true);
    expect(isMassAreaOrVolumeUnit(material('m²', '5000'))).toBe(true);
    expect(isMassAreaOrVolumeUnit(material('cm^2', '5000'))).toBe(true);
    expect(isMassAreaOrVolumeUnit(material('litres', '5000'))).toBe(true);
  });
});

describe('metresPerArticleUnit', () => {
  it.each([
    ['m', 1],
    ['см', 0.01],
    ['millimetres', 0.001],
  ])('maps %s to %s metres', (unit, factor) => {
    expect(metresPerArticleUnit(material(String(unit)))).toBe(factor);
  });

  it('uses thread length for package and free-text units', () => {
    expect(metresPerArticleUnit(material('cone', '5000'))).toBe(5000);
    expect(metresPerArticleUnit(material('large spool', '3000'))).toBe(3000);
  });

  it('returns null for missing lengths and physical non-length units', () => {
    expect(metresPerArticleUnit(material('roll'))).toBeNull();
    expect(metresPerArticleUnit(material('kg', '5000'))).toBeNull();
    expect(metresPerArticleUnit(material('g/m²', '5000'))).toBeNull();
  });
});

describe('pricePerMetre', () => {
  it.each([
    ['5', 5000, '0.0010'],
    ['4.20', 5000, '0.0008'],
    ['2.99', 5000, '0.0006'],
    ['0.25', 5000, '0.0001'],
    ['5', 3000, '0.0017'],
    ['1.23', 10000, '0.0001'],
  ])('converts %s / %s to %s', (price, factor, expected) => {
    expect(pricePerMetre(price, factor)).toBe(expected);
  });

  it('returns an empty price without a positive factor', () => {
    expect(pricePerMetre('5', null)).toBe('');
    expect(pricePerMetre('5', 0)).toBe('');
  });
});
