import type { common_MaterialPrice, common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import {
  AUX_MADE_BY_SUPPLIER,
  AUX_MADE_BY_UNKNOWN,
  AUX_MADE_BY_US,
  auxKind,
  latestSupplierPrice,
  madeByForKind,
  makesMaterialId,
} from './aux-card';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from './schema';

const formWithNorm = (value: string | undefined): TechCardFormData => ({
  ...structuredClone(techCardDefaultData),
  name: 'woven label',
  styleNumber: 'FW26-001',
  purpose: 'TECH_CARD_PURPOSE_AUXILIARY',
  auxMadeBy: AUX_MADE_BY_US,
  bomItems: [
    {
      section: 'TECH_CARD_BOM_SECTION_THREAD',
      lineKey: 'thread-line',
      name: 'thread',
      unit: 'm',
      consumptionPerUnit: value,
    },
  ],
});

describe('auxiliary maker', () => {
  it('reads unspecified as own and persists every kind explicitly', () => {
    expect(auxKind('TECH_CARD_PURPOSE_AUXILIARY', AUX_MADE_BY_UNKNOWN)).toBe('own');
    expect(auxKind('TECH_CARD_PURPOSE_AUXILIARY', AUX_MADE_BY_SUPPLIER)).toBe('bought');
    expect(madeByForKind('product')).toBe(AUX_MADE_BY_UNKNOWN);
    expect(madeByForKind('own')).toBe(AUX_MADE_BY_US);
    expect(madeByForKind('bought')).toBe(AUX_MADE_BY_SUPPLIER);
  });

  it('forces sellable payloads to unspecified', () => {
    const form = formWithNorm('0.125');
    form.purpose = 'TECH_CARD_PURPOSE_SELLABLE';
    form.auxMadeBy = AUX_MADE_BY_SUPPLIER;
    const out = mapFormToTechCardInsert(form);
    expect(out.auxMadeBy).toBe(AUX_MADE_BY_UNKNOWN);
    expect(out.bomItems?.[0]?.consumptionPerUnit).toBeUndefined();
  });

  it('reads maker and norm from the card', () => {
    const card = {
      id: 4,
      techCard: {
        purpose: 'TECH_CARD_PURPOSE_AUXILIARY',
        auxMadeBy: AUX_MADE_BY_SUPPLIER,
        bomItems: [
          {
            section: 'TECH_CARD_BOM_SECTION_THREAD',
            lineKey: 'thread-line',
            consumptionPerUnit: { value: '0.025' },
          },
        ],
      },
    } as unknown as common_TechCard;
    const form = mapTechCardToForm(card);
    expect(form.auxMadeBy).toBe(AUX_MADE_BY_SUPPLIER);
    expect(form.bomItems?.[0]?.consumptionPerUnit).toBe('0.025');
  });
});

describe('own auxiliary norm', () => {
  it('writes values and explicit clears', () => {
    expect(
      mapFormToTechCardInsert(formWithNorm('0.125')).bomItems?.[0]?.consumptionPerUnit,
    ).toEqual({ value: '0.125' });
    expect(mapFormToTechCardInsert(formWithNorm('')).bomItems?.[0]?.consumptionPerUnit).toEqual({
      value: '',
    });
  });

  it('clears a known norm when the line becomes cut-to-length', () => {
    const form = formWithNorm('0.125');
    form.cutStrips = [{ lineKey: 'strip', bomLineKey: 'thread-line' }];
    expect(mapFormToTechCardInsert(form).bomItems?.[0]?.consumptionPerUnit).toEqual({ value: '' });
  });

  it('omits hidden supplier norms', () => {
    const form = formWithNorm('0.125');
    form.auxMadeBy = AUX_MADE_BY_SUPPLIER;
    expect(mapFormToTechCardInsert(form).bomItems?.[0]?.consumptionPerUnit).toBeUndefined();
  });

  it('accepts zero and rejects negative or over-precise values', () => {
    const zero = techCardSchema.safeParse(formWithNorm('0'));
    expect(zero.success, zero.success ? '' : JSON.stringify(zero.error.issues)).toBe(true);
    expect(techCardSchema.safeParse(formWithNorm('-1')).success).toBe(false);
    expect(techCardSchema.safeParse(formWithNorm('0.1234')).success).toBe(false);
  });
});

describe('bought auxiliary sourcing', () => {
  it('uses the first live MAKES material', () => {
    expect(
      makesMaterialId(
        [
          { materialId: 8, active: false },
          { materialId: 12, active: true },
        ] as never,
        3,
      ),
    ).toBe(12);
  });

  it('selects the latest manual or purchase price, never a run receipt', () => {
    const prices = [
      { price: { value: '9' }, validFrom: '2026-11-03T00:00:00Z', source: 'production_run' },
      { price: { value: '5' }, validFrom: '2026-11-01T00:00:00Z', source: 'manual' },
      { price: { value: '6' }, validFrom: '2026-11-02T00:00:00Z', source: 'purchase' },
    ] as common_MaterialPrice[];
    expect(latestSupplierPrice(prices)?.price?.value).toBe('6');
  });
});
