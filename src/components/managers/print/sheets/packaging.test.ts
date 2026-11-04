import { describe, expect, it } from 'vitest';

import { runWeightGrams } from './packaging';

describe('runWeightGrams', () => {
  it('gross is one packed piece, whatever the box holds', () => {
    expect(runWeightGrams(120, 745, 600)).toBe(89400);
  });

  it('falls back to net, and to nothing', () => {
    expect(runWeightGrams(120, 0, 600)).toBe(72000);
    expect(runWeightGrams(120, 0, 0)).toBe(0);
    expect(runWeightGrams(0, 745, 600)).toBe(0);
  });
});
