import { describe, expect, it } from 'vitest';
import {
  assignFold,
  FOLD_STEP_REFUSAL,
  foldRefusalOf,
  foldsClosingOn,
  foldStepBlocked,
  stepOfFold,
  suggestStep,
} from './fold-step';

const ops = [
  {
    operationNumber: 110,
    operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
    inputKeys: ['FLAP_L'],
    foldKeys: [],
  },
  {
    operationNumber: 120,
    operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
    inputKeys: ['FLAP_L'],
    foldKeys: ['fold-1'],
  },
  {
    operationNumber: 130,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    inputKeys: ['FLAP_L'],
    foldKeys: ['fold-2'],
  },
];

describe('fold steps', () => {
  it('finds the operation that closes a fold', () => {
    expect(stepOfFold(ops, 'fold-1')).toBe(1);
    expect(stepOfFold(ops, 'missing')).toBeNull();
    expect(foldsClosingOn(ops, 2)).toEqual(['fold-2']);
  });

  it('suggests the piece first non-fusing operation', () => {
    expect(suggestStep(ops, 'flap_l')).toBe(1);
    expect(suggestStep(ops, 'CUFF')).toBeNull();
  });

  it('never suggests a join or a step on two pieces', () => {
    const joined = [
      { operationType: 'TECH_CARD_OPERATION_TYPE_FUSING', inputKeys: ['FLAP_L'] },
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        inputKeys: ['FLAP_L', 'FRONT'],
        outputUnitKey: 'FLAP_UNIT',
      },
      { operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['FLAP_L', 'FRONT'] },
      { operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['FLAP_L'] },
    ];
    expect(suggestStep(joined, 'FLAP_L')).toBe(3);
    expect(suggestStep(joined.slice(0, 3), 'FLAP_L')).toBeNull();
  });

  it('moves one fold without mutating the operations', () => {
    const next = assignFold(ops, 'fold-1', 2);
    expect(next).toEqual([[], [], ['fold-2', 'fold-1']]);
    expect(ops[1].foldKeys).toEqual(['fold-1']);
  });

  it('removes a step and keeps unrelated folds', () => {
    expect(assignFold(ops, 'fold-2', null)).toEqual([[], ['fold-1'], []]);
  });

  it('blocks a higher sequence on an earlier step', () => {
    const rows = [
      { foldKey: 'fold-1', seq: 1 },
      { foldKey: 'fold-2', seq: 2 },
    ];
    const reversed = [ops[0], { ...ops[1], foldKeys: ['fold-2'] }, { ...ops[2], foldKeys: [] }];
    expect(foldStepBlocked(ops, rows, 'fold-2', 0)).toBe(true);
    expect(foldStepBlocked(ops, rows, 'fold-2', 1)).toBe(false);
    expect(foldStepBlocked(reversed, rows, 'fold-1', 2)).toBe(true);
  });

  it('ignores folds without a step and permits a shared step', () => {
    const sparse = [ops[0], ops[1], { ...ops[2], foldKeys: [] }];
    const rows = [
      { foldKey: 'fold-1', seq: 1 },
      { foldKey: 'fold-2', seq: 2 },
      { foldKey: 'fold-3', seq: 3 },
    ];
    expect(foldStepBlocked(ops, rows, 'fold-2', 1)).toBe(false);
    expect(foldStepBlocked(sparse, rows, 'fold-1', 0)).toBe(false);
  });
});

describe('foldRefusalOf', () => {
  const refused = (description: string) => ({
    status: 400,
    details: [{ fieldViolations: [{ field: 'operations[3].fold_keys[0]', description }] }],
  });

  it('names the fold refusals and leaves the rest alone', () => {
    expect(foldRefusalOf(refused('fold_order (used by operations[1]); keep the order'))).toBe(
      'FOLD ORDER',
    );
    expect(foldRefusalOf(refused('fold_step_gone; move the fold'))).toBe(FOLD_STEP_REFUSAL);
    expect(foldRefusalOf(refused('required'))).toBeNull();
    expect(foldRefusalOf(new Error('boom'))).toBeNull();
  });
});
