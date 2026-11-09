import { describe, expect, it } from 'vitest';

import { labelSideLength, spanOfLength } from './span-pick';

describe('a garment edge picked against a label edge', () => {
  const isLabel = (id: string) => id.startsWith('label');
  const len = (id: string) => (id === 'label#1' ? 30 : 500);

  it('takes the length of the label side', () => {
    const pick = { a: ['label#1'], b: [], spans: { a: {}, b: {} } };
    expect(labelSideLength(pick, 'b', isLabel, len)).toBe(30);
  });

  it('counts only the picked span of a label edge', () => {
    const pick = { a: ['label#1'], b: [], spans: { a: { 'label#1': [[5, 25]] as const }, b: {} } };
    expect(labelSideLength(pick, 'b', isLabel, len)).toBe(20);
  });

  it('does nothing when the other side is not a label', () => {
    const pick = { a: ['front#1'], b: [], spans: { a: {}, b: {} } };
    expect(labelSideLength(pick, 'b', isLabel, len)).toBeNull();
  });

  it('centres the span on the click and keeps it on the edge', () => {
    expect(spanOfLength(30, 500, 100)).toEqual([85, 115]);
    expect(spanOfLength(30, 500, 5)).toEqual([0, 30]);
    expect(spanOfLength(30, 500, 499)).toEqual([470, 500]);
  });
});
