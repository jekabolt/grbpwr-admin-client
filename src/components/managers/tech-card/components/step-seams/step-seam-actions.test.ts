import { describe, expect, it } from 'vitest';
import type { StoredSeam } from 'lib/seams';

import { bindingRowsOf, planStepSeamRemoval, seamsToClear } from './step-seam-actions';
import { NO_SPANS, samePick } from './span-pick';

describe('planStepSeamRemoval', () => {
  it('drops the seam key from its step and deletes its unreferenced row', () => {
    const operations = [{ seamKeys: ['side', 'armhole', 'side'] }, { seamKeys: ['collar'] }];

    expect(planStepSeamRemoval(operations, 0, 'side')).toEqual({
      seamKeys: ['armhole'],
      deleteRow: true,
    });
  });

  it('keeps the row when another step still references the seam key', () => {
    const operations = [
      { seamKeys: ['side', 'armhole'] },
      { seamKeys: ['side'] },
      { seamKeys: ['collar'] },
    ];

    expect(planStepSeamRemoval(operations, 0, 'side')).toEqual({
      seamKeys: ['armhole'],
      deleteRow: false,
    });
    expect(operations[1].seamKeys).toEqual(['side']);
  });

  it('does not delete a row the target step did not reference', () => {
    expect(planStepSeamRemoval([{ seamKeys: ['side'] }], 0, 'collar')).toEqual({
      seamKeys: ['side'],
      deleteRow: false,
    });
  });
});

describe('CLEAR SEAMS (C4)', () => {
  it('removes every stored row of the step, a pair stored twice included', () => {
    const stored = [
      { key: 'K1', sides: 'BP#1~FP#3' },
      { key: 'K2', sides: 'BP#1~FP#3' },
      { key: 'K1', sides: 'BP#1~FP#3' },
      { key: 'K3', sides: 'BP#2~FP#2' },
    ];
    expect(seamsToClear(stored).map((s) => s.key)).toEqual(['K1', 'K2', 'K3']);
  });

  it('a pick with a stretch is not the whole-edge proposal it started from', () => {
    const shown = { a: ['BP#1'], b: ['FP#3'], spans: NO_SPANS };
    const narrowed = { ...shown, spans: { a: { 'BP#1': [[0, 120]] as const }, b: {} } };
    expect(samePick(shown, { ...shown })).toBe(true);
    expect(samePick(shown, narrowed)).toBe(false);
    expect(samePick(narrowed, narrowed)).toBe(true);
  });
});

describe('one edge bound once on the card (C6)', () => {
  const row = (seamKey: string, a: string, b: string) =>
    ({
      seamKey,
      kind: 'edge',
      sideA: [{ piece: a }],
      sideB: [{ piece: b }],
    }) as unknown as StoredSeam;

  it('the binding rows of every step, not only this one, are what a new binding is checked against', () => {
    const rows = [
      row('S1', 'BODY', 'BIND_NECK'),
      row('S2', 'BODY', 'SLEEVE'),
      row('S3', 'BIND_ARM', 'SLV'),
    ];
    expect(bindingRowsOf(rows, new Set(['BIND_NECK', 'BIND_ARM'])).map((r) => r.seamKey)).toEqual([
      'S1',
      'S3',
    ]);
    expect(bindingRowsOf(rows, new Set())).toEqual([]);
  });
});
