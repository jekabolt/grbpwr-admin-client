import { describe, expect, it } from 'vitest';
import { isAttachStep, slotQtyFromSteps, stepQtyOfLine } from './button-qty';

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
