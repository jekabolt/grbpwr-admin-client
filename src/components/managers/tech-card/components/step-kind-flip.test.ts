import { describe, expect, it } from 'vitest';

import { stepKindFlip } from './step-kind-flip';

const topstitch = {
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
};

const bindingByMachine = {
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_BINDING_TAPING',
};

describe('step kind flip (E1: plain selects tear down like the work picker)', () => {
  it('machine LOCKSTITCH → OVERLOCK takes the step out of topstitch', () => {
    const next = { ...topstitch, machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK' };
    expect(stepKindFlip(topstitch, next)).toEqual({
      binding: false,
      topstitch: true,
      seams: false,
    });
  });

  it('clearing the topstitch mode takes the step out of topstitch', () => {
    expect(stepKindFlip(topstitch, { ...topstitch, topstitchMode: '' })).toEqual({
      binding: false,
      topstitch: true,
      seams: false,
    });
  });

  it('operation type change takes the step out of topstitch', () => {
    const next = { ...topstitch, operationType: 'TECH_CARD_OPERATION_TYPE_MANUAL' };
    expect(stepKindFlip(topstitch, next).topstitch).toBe(true);
  });

  it('legacy OS_TOPSTITCH seam class cleared takes the step out of topstitch', () => {
    const legacy = {
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      seamClass: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
    };
    expect(stepKindFlip(legacy, { ...legacy, seamClass: '' }).topstitch).toBe(true);
  });

  it('a step that is binding only by its machine leaves binding when the machine changes', () => {
    const next = { ...bindingByMachine, machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH' };
    expect(stepKindFlip(bindingByMachine, next)).toEqual({
      binding: true,
      topstitch: false,
      seams: false,
    });
  });

  it('a named bind work keeps the step binding whatever the machine', () => {
    const named = { ...bindingByMachine, work: 'bind_tape_edge' };
    const next = { ...named, machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH' };
    expect(stepKindFlip(named, next).binding).toBe(false);
  });

  it('a change that keeps the kind tears nothing down', () => {
    const next = { ...topstitch, machineType: 'TECH_CARD_MACHINE_TYPE_CHAINSTITCH' };
    expect(stepKindFlip(topstitch, next)).toEqual({
      binding: false,
      topstitch: false,
      seams: false,
    });
  });
});

describe('step kind flip (Р3: a sewing step that stops sewing drops its seams)', () => {
  const join = {
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  };

  it.each([
    ['pressing', 'TECH_CARD_OPERATION_TYPE_PRESS'],
    ['fusing', 'TECH_CARD_OPERATION_TYPE_FUSING'],
    ['a button', 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET'],
  ])('a machine step that becomes %s unlinks its seams', (_, operationType) => {
    expect(stepKindFlip(join, { ...join, operationType }).seams).toBe(true);
  });

  it('a machine change keeps the seams', () => {
    const next = { ...join, machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK' };
    expect(stepKindFlip(join, next).seams).toBe(false);
  });

  it('a non-machine step that names its own seam class keeps it while the class stays', () => {
    const hand = {
      operationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
      seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    };
    const next = { ...hand, operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' };
    expect(stepKindFlip(hand, next).seams).toBe(false);
    expect(stepKindFlip(hand, { ...hand, seamClass: '' }).seams).toBe(true);
  });
});
