import { describe, expect, it } from 'vitest';

import {
  planMove,
  sweepOperationOrder,
  type MovePlanOperation,
  type OperationMovePlan,
} from './operation-move';

const pieces = [
  { lineKey: 'A', name: 'A' },
  { lineKey: 'B', name: 'B' },
  { lineKey: 'C', name: 'C' },
];

const apply = (
  operations: readonly MovePlanOperation[],
  from: number,
  to: number,
  plan: Extract<OperationMovePlan, { kind: 'move' }>,
): MovePlanOperation[] => {
  const next = [...operations];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, { ...moved, inputKeys: plan.inputKeys });
  return next;
};

describe('planMove', () => {
  it('silently re-points above a producer with one candidate', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'join', inputKeys: ['A'], outputUnitKey: 'X' },
      { historyKey: 'press', inputKeys: ['X'] },
    ];

    expect(planMove(operations, 1, 0, { pieces })).toEqual({
      kind: 'move',
      inputKeys: ['A'],
    });
  });

  it('silently re-points below a join to the live unit', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'press', inputKeys: ['A'] },
      { historyKey: 'join', inputKeys: ['A', 'B'], outputUnitKey: 'X' },
    ];

    expect(planMove(operations, 0, 1, { pieces })).toEqual({
      kind: 'move',
      inputKeys: ['X'],
    });
  });

  it('asks when two producer inputs are on the table', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'join', inputKeys: ['A', 'B'], outputUnitKey: 'X' },
      { historyKey: 'topstitch', inputKeys: ['X'] },
    ];

    expect(planMove(operations, 1, 0, { pieces })).toEqual({
      kind: 'choose',
      stepKey: 'topstitch',
      options: ['A', 'B'],
    });
  });

  it('offers a nested live unit rather than its leaves', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'inner', inputKeys: ['A', 'B'], outputUnitKey: 'N' },
      { historyKey: 'outer', inputKeys: ['N', 'C'], outputUnitKey: 'X' },
      { historyKey: 'press', inputKeys: ['X'] },
    ];

    expect(planMove(operations, 2, 1, { pieces })).toEqual({
      kind: 'choose',
      stepKey: 'press',
      options: ['N', 'C'],
    });
  });

  it('uses geometry to pick one of two producer inputs', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'join', inputKeys: ['A', 'B'], outputUnitKey: 'X' },
      {
        historyKey: 'topstitch',
        inputKeys: ['X'],
        topstitchLines: [{ parts: [{ piece: 'B' }] }],
      },
    ];

    expect(planMove(operations, 1, 0, { pieces })).toEqual({
      kind: 'move',
      inputKeys: ['B'],
    });
  });

  it('refuses a moved join that breaks another step', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'join', inputKeys: ['A', 'B'], outputUnitKey: 'X' },
      { historyKey: 'topstitch', inputKeys: ['X'] },
    ];

    const plan = planMove(operations, 0, 1, { pieces });
    expect(plan.kind).toBe('refuse');
    expect(plan.kind === 'refuse' ? plan.reason : '').toContain('appears only at step 2');
  });

  it('refuses a move that reverses fold order', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'first', inputKeys: ['A'], foldKeys: ['fold-1'] },
      { historyKey: 'second', inputKeys: ['A'], foldKeys: ['fold-2'] },
    ];

    expect(
      planMove(operations, 0, 1, {
        pieces,
        foldRows: [
          { foldKey: 'fold-1', pieceKey: 'A', seq: 1 },
          { foldKey: 'fold-2', pieceKey: 'A', seq: 2 },
        ],
      }),
    ).toEqual({ kind: 'refuse', reason: 'MOVE THE FOLD FIRST' });
  });

  it('leaves a clean move inputs unchanged', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'a', inputKeys: ['A'] },
      { historyKey: 'b', inputKeys: ['B'] },
    ];

    expect(planMove(operations, 0, 1, { pieces })).toEqual({
      kind: 'move',
      inputKeys: ['A'],
    });
  });

  it('produces an order accepted by the existing frontier sweep', () => {
    const operations: MovePlanOperation[] = [
      { historyKey: 'join', inputKeys: ['A', 'B'], outputUnitKey: 'X' },
      { historyKey: 'topstitch', inputKeys: ['X'] },
    ];
    const plan = planMove(operations, 1, 0, { pieces, choice: 'A' });
    expect(plan.kind).toBe('move');
    if (plan.kind !== 'move') return;

    expect(sweepOperationOrder(pieces, apply(operations, 1, 0, plan)).violations).toEqual([]);
  });
});
