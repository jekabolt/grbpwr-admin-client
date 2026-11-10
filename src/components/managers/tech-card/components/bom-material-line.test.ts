import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { materialLineFields } from './bom-material-line';

const material = (unit: string, price: string, length?: string): common_Material =>
  ({
    section: 'TECH_CARD_BOM_SECTION_THREAD',
    unit,
    unitCode: 'MATERIAL_UNIT_UNKNOWN',
    latestPrice: { price: { value: price }, currency: 'EUR' },
    threadAttrs:
      length === undefined
        ? undefined
        : { lengthPerConeM: { value: length }, ticketTex: '', needleReco: '' },
  }) as common_Material;

describe('materialLineFields', () => {
  it('creates package-bought thread lines in metres with a per-metre price', () => {
    expect(materialLineFields(material('cone', '5', '5000'))).toMatchObject({
      section: 'TECH_CARD_BOM_SECTION_THREAD',
      unit: 'm',
      unitPrice: '0.0010',
      currency: 'EUR',
    });
  });

  it('leaves a package-bought thread unpriced when its length is missing', () => {
    expect(materialLineFields(material('cone', '5'))).toMatchObject({
      unit: 'm',
      unitPrice: '',
    });
  });

  it('does not convert mass-bought thread lines', () => {
    expect(materialLineFields(material('kg', '5', '5000'))).toMatchObject({
      unit: 'kg',
      unitPrice: '5',
    });
  });

  it('does not change other BOM sections', () => {
    expect(
      materialLineFields(material('roll', '5', '5000'), 'TECH_CARD_BOM_SECTION_FABRIC'),
    ).toMatchObject({
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      unit: 'roll',
      unitPrice: '5',
    });
  });
});
