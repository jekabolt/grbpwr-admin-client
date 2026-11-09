import { describe, expect, it } from 'vitest';
import type { common_TechCardOperation } from 'api/proto-http/admin';

import {
  colourwayToBuy,
  countedPairOut,
  formQtySteps,
  slotNorm,
  slotSpare,
  slotUsed,
} from './slot-norm';

const HW = 'TECH_CARD_BOM_SECTION_HARDWARE';
const FABRIC = 'TECH_CARD_BOM_SECTION_FABRIC';

const attach = (n: number, count: number, keys = ['BTN']) => ({
  operationNumber: n,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
  placementCount: count,
  bomLineKeys: keys,
});
const buttonhole = (n: number, count: number, keys = ['BTN']) => ({
  operationNumber: n,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
  placementCount: count,
  bomLineKeys: keys,
});

const ownerSteps = formQtySteps([
  attach(330, 2),
  attach(450, 2),
  attach(850, 7),
  attach(1080, 1),
  buttonhole(840, 7),
]);

describe('slot NORM cell', () => {
  it('shows the steps sum read-only on a counted line', () => {
    const norm = slotNorm({ section: HW, lineKey: 'BTN' }, ownerSteps, new Set());
    expect(norm).toEqual({ kind: 'ops', qty: 12, ops: 4, opNumbers: [330, 450, 850, 1080] });
    expect(slotUsed(norm, '15')).toBe(12);
  });

  it('falls back to the manual input when no step sets the line', () => {
    const norm = slotNorm({ section: HW, lineKey: 'ZIP' }, ownerSteps, new Set());
    expect(norm).toEqual({ kind: 'manual' });
    expect(slotUsed(norm, '3')).toBe(3);
    expect(slotUsed(norm, '')).toBeNull();
    expect(slotUsed(norm, undefined)).toBeNull();
  });

  it('has no counted norm on measured or cut-to-length lines', () => {
    expect(slotNorm({ section: FABRIC, lineKey: 'BTN' }, ownerSteps, new Set())).toEqual({
      kind: 'none',
    });
    expect(slotNorm({ section: HW, lineKey: 'BTN' }, ownerSteps, new Set(['BTN']))).toEqual({
      kind: 'none',
    });
  });

  it('takes the explicit step qty from the card read', () => {
    const read = [
      { operationNumber: 840, bomQuantities: [{ lineKey: 'BTN', qtyPerGarment: { value: '3' } }] },
    ] as unknown as common_TechCardOperation[];
    const steps = formQtySteps([attach(330, 2), buttonhole(840, 7)], read);
    expect(slotNorm({ section: HW, lineKey: 'BTN' }, steps, new Set())).toMatchObject({
      kind: 'ops',
      qty: 5,
    });
  });

  it('reads spare as zero when empty', () => {
    expect(slotSpare('')).toBe(0);
    expect(slotSpare(undefined)).toBe(0);
    expect(slotSpare('1')).toBe(1);
  });
});

describe('qty / spare wire pair', () => {
  it('omits both when the form knows neither', () => {
    expect(countedPairOut(undefined, undefined)).toEqual({});
  });

  it('sends both when either is known, empty as an explicit clear', () => {
    expect(countedPairOut(undefined, '1')).toEqual({
      qtyPerGarment: { value: '' },
      spareQty: { value: '1' },
    });
    expect(countedPairOut('12.', '')).toEqual({
      qtyPerGarment: { value: '12' },
      spareQty: { value: '' },
    });
  });
});

describe('to buy per colourway', () => {
  it('adds spare once per slot and keeps missing articles apart', () => {
    expect(
      colourwayToBuy([
        { used: 12, spare: 1, explicit: null, hasArticle: true },
        { used: 2, spare: 0, explicit: null, hasArticle: false },
      ]),
    ).toEqual({ total: 13, missing: 2 });
  });

  it('lets an explicit colourway quantity override used', () => {
    expect(colourwayToBuy([{ used: 12, spare: 1, explicit: 10, hasArticle: true }])).toEqual({
      total: 11,
      missing: 0,
    });
  });

  it('buys nothing for spare without a basis', () => {
    expect(colourwayToBuy([{ used: null, spare: 2, explicit: null, hasArticle: true }])).toEqual({
      total: 0,
      missing: 0,
    });
  });
});
