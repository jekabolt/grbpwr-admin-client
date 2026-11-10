import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { articleForUsage, type BomLine } from './use-colourway-auto';

const pin = (length?: string): common_Material =>
  ({
    id: 22,
    unit: 'cone',
    unitCode: 'MATERIAL_UNIT_CONE',
    latestPrice: { price: { value: '5' }, currency: 'EUR' },
    threadAttrs:
      length === undefined
        ? undefined
        : { lengthPerConeM: { value: length }, ticketTex: '', needleReco: '' },
  }) as common_Material;

const slot: BomLine = {
  section: 'TECH_CARD_BOM_SECTION_THREAD',
  unit: 'm',
  unitPrice: '0.0010',
  currency: 'EUR',
  materialId: 11,
};

describe('articleForUsage thread pin pricing', () => {
  it('uses the pin article own length for a metre slot', () => {
    expect(articleForUsage(slot, pin('3000'), 22)).toMatchObject({
      materialId: 22,
      unit: 'm',
      unitPrice: '0.0017',
      currency: 'EUR',
    });
  });

  it('leaves a pin unpriced when its length is missing', () => {
    expect(articleForUsage(slot, pin(), 22)).toMatchObject({
      materialId: 22,
      unit: 'm',
      unitPrice: '',
    });
  });
});
