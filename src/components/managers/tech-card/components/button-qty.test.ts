import { describe, expect, it } from 'vitest';
import {
  isAttachStep,
  isCountedLine,
  qtyStepFromFormOperation,
  qtyStepFromOperation,
  resolveCountedPair,
  slotQtyFromSteps,
  stepQtyOfLine,
} from './button-qty';

const attach = (n: number, count: number | null, keys = ['BTN']) => ({
  operationNumber: n,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
  placementCount: count,
  bomLineKeys: keys,
});

describe('button qty from steps', () => {
  it('sums REPEATS of attach steps that set the line', () => {
    const steps = [attach(330, 2), attach(450, 2), attach(850, 7), attach(1080, 1)];
    expect(slotQtyFromSteps(steps, 'BTN')).toEqual({
      qty: 12,
      steps: [
        { operationNumber: 330, qty: 2 },
        { operationNumber: 450, qty: 2 },
        { operationNumber: 850, qty: 7 },
        { operationNumber: 1080, qty: 1 },
      ],
    });
  });

  it('reads empty REPEATS as one', () => {
    expect(stepQtyOfLine(attach(10, null), 'BTN')).toBe(1);
    expect(stepQtyOfLine(attach(10, 0), 'BTN')).toBe(1);
  });

  it('a buttonhole step repeats without spending a button', () => {
    const hole = { ...attach(20, 6), machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE' };
    expect(isAttachStep(hole)).toBe(false);
    expect(stepQtyOfLine(hole, 'BTN')).toBeNull();
  });

  it('an explicit step qty wins over REPEATS, on any step', () => {
    const hole = {
      ...attach(20, 6),
      machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
      explicitQty: () => 3,
    };
    expect(stepQtyOfLine(hole, 'BTN')).toBe(3);
  });

  it('adapts wire and form placement shapes without changing precedence', () => {
    const wire = qtyStepFromOperation({
      operationNumber: 20,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
      placementLayout: { count: 6 },
      bomLineKeys: ['BTN'],
      bomQuantities: [{ lineKey: 'BTN', qtyPerGarment: { value: '4' } }],
    });
    const form = qtyStepFromFormOperation({
      operationNumber: 20,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
      placementCount: 6,
      bomLineKeys: ['BTN'],
    });

    expect(stepQtyOfLine(wire, 'BTN')).toBe(4);
    expect(stepQtyOfLine(form, 'BTN')).toBe(6);
  });

  it('reads a saved explicit qty on a non-attach form step matched by operation number', () => {
    const form = qtyStepFromFormOperation(
      {
        operationNumber: 20,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        placementCount: 6,
        bomLineKeys: ['BTN'],
      },
      {
        operationNumber: 20,
        bomQuantities: [{ lineKey: 'BTN', qtyPerGarment: { value: '3' } }],
      },
    );

    expect(stepQtyOfLine(form, 'BTN')).toBe(3);
  });

  it('hardware set counts per linked article', () => {
    const rivet = {
      operationNumber: 30,
      operationType: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
      placementCount: 4,
      bomLineKeys: ['CAP', 'POST'],
    };
    expect(stepQtyOfLine(rivet, 'CAP')).toBe(4);
    expect(stepQtyOfLine(rivet, 'POST')).toBe(4);
  });

  it('a line no step sets has no qty', () => {
    expect(slotQtyFromSteps([attach(1, 3, ['OTHER'])], 'BTN')).toEqual({ qty: null, steps: [] });
  });
});

const countedLine = {
  id: 10,
  lineKey: 'BTN',
  section: 'TECH_CARD_BOM_SECTION_HARDWARE',
  qtyPerGarment: { value: '9' },
  spareQty: { value: '1' },
};

describe('counted colourway pair', () => {
  it('buys nothing when the recipe does not mention the slot', () => {
    expect(
      resolveCountedPair({ line: countedLine, lineIndex: 0, usages: [], stepQty: 7 }),
    ).toMatchObject({
      mentioned: false,
      basis: null,
      used: null,
      spare: 0,
      toBuy: null,
    });
  });

  it('sums two explicit garment rows and adds spare once', () => {
    expect(
      resolveCountedPair({
        line: countedLine,
        lineIndex: 0,
        usages: [
          { bomItemId: 10, quantity: { value: '4' } },
          { bomLineKey: 'BTN', quantity: { value: '3' } },
        ],
        stepQty: 12,
      }),
    ).toEqual({
      mentioned: true,
      basis: 'rows',
      pairUsed: 7,
      legacyUsed: 0,
      used: 7,
      spare: 1,
      toBuy: 8,
    });
  });

  it('ignores piece-bound quantities', () => {
    expect(
      resolveCountedPair({
        line: countedLine,
        lineIndex: 0,
        usages: [
          { bomLineKey: 'BTN' },
          { bomLineKey: 'BTN', pieceIndex: 0, quantity: { value: '100' } },
        ],
        stepQty: 2,
      }),
    ).toMatchObject({ basis: 'steps', used: 2, spare: 1, toBuy: 3 });
  });

  it('adds a positional legacy row by its own quantity only', () => {
    expect(
      resolveCountedPair({
        line: countedLine,
        lineIndex: 0,
        usages: [{ bomItemIndex: 0, quantity: { value: '4' } }],
        stepQty: 12,
      }),
    ).toMatchObject({
      mentioned: false,
      basis: null,
      pairUsed: null,
      legacyUsed: 4,
      used: 4,
      spare: 0,
      toBuy: 4,
    });
  });

  it('does not buy spare without a used basis', () => {
    expect(
      resolveCountedPair({
        line: { ...countedLine, qtyPerGarment: undefined, spareQty: { value: '2' } },
        lineIndex: 0,
        usages: [{ bomLineKey: 'BTN' }],
        stepQty: null,
      }),
    ).toMatchObject({ mentioned: true, basis: null, used: null, spare: 0, toBuy: null });
  });

  it('rejects measured and cut-to-length lines at the shared guard', () => {
    expect(isCountedLine({ section: 'TECH_CARD_BOM_SECTION_TRIM' })).toBe(false);
    expect(isCountedLine({ section: 'TECH_CARD_BOM_SECTION_HARDWARE', cutToLength: true })).toBe(
      false,
    );
    expect(isCountedLine({})).toBe(true);
  });
});
