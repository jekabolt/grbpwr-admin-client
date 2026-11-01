import { describe, expect, it } from 'vitest';
import { planStepSeamRemoval } from './step-seam-actions';

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
