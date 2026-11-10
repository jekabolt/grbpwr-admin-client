import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { catalogPrice, resolveBomPrice } from './bom-price';

const material = (length?: string): common_Material =>
  ({
    unit: 'cone',
    unitCode: 'MATERIAL_UNIT_CONE',
    latestPrice: { price: { value: '5' }, currency: 'EUR' },
    threadAttrs:
      length === undefined
        ? undefined
        : { lengthPerConeM: { value: length }, ticketTex: '', needleReco: '' },
  }) as common_Material;

const line = {
  section: 'TECH_CARD_BOM_SECTION_THREAD',
  unit: 'm',
  currency: 'EUR',
};

describe('thread BOM catalogue price', () => {
  it('compares a metre line with the converted catalogue price', () => {
    expect(resolveBomPrice({ ...line, unitPrice: '0.0010' }, material('5000'))).toEqual({
      source: 'line',
      value: '0.0010',
      currency: 'EUR',
      unit: 'm',
      label: '0.0010 EUR / m',
      drift: undefined,
    });
  });

  it('reports converted price drift in metres', () => {
    expect(resolveBomPrice({ ...line, unitPrice: '0.0020' }, material('5000')).drift).toEqual({
      value: '0.0010',
      currency: 'EUR',
      unit: 'm',
      label: '0.0010',
    });
  });

  it('treats metre synonyms as the converted catalogue unit', () => {
    expect(
      resolveBomPrice({ ...line, unit: 'metres', unitPrice: '0.0010' }, material('5000')).drift,
    ).toBeUndefined();
  });

  it('keeps the catalogue unit when conversion is unavailable', () => {
    expect(catalogPrice(material(), line)).toEqual({ value: '5', currency: 'EUR', unit: 'cone' });
  });

  it('offers a converted catalogue fallback for an unpriced metre line', () => {
    expect(resolveBomPrice(line, material('5000'))).toMatchObject({
      source: 'catalog',
      value: '0.0010',
      currency: 'EUR',
      unit: 'm',
    });
  });
});
