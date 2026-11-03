import { describe, expect, it } from 'vitest';

import { DEFAULT_SEAM_TOLERANCE_MM, lengthsDiffer, seamToleranceOf } from './seam-length';

describe('seam tolerance', () => {
  it('an empty step takes the default, and 0 is a real value', () => {
    expect(seamToleranceOf('')).toBe(DEFAULT_SEAM_TOLERANCE_MM);
    expect(seamToleranceOf(undefined)).toBe(DEFAULT_SEAM_TOLERANCE_MM);
    expect(seamToleranceOf('0')).toBe(0);
    expect(seamToleranceOf('2,5')).toBe(2.5);
    expect(seamToleranceOf('-1')).toBe(DEFAULT_SEAM_TOLERANCE_MM);
  });

  it('the owner’s 51 / 50 and 82 / 81 pass at the default and fail at 0', () => {
    expect(lengthsDiffer(51, 50, DEFAULT_SEAM_TOLERANCE_MM)).toBe(false);
    expect(lengthsDiffer(82, 81, DEFAULT_SEAM_TOLERANCE_MM)).toBe(false);
    expect(lengthsDiffer(51, 50, 0)).toBe(true);
    expect(lengthsDiffer(82, 81, 0)).toBe(true);
  });

  it('0 is the old rule: equal when the printed whole millimetres are equal', () => {
    expect(lengthsDiffer(50.4, 49.6, 0)).toBe(false);
    expect(lengthsDiffer(50.6, 50.4, 0)).toBe(true);
  });

  it('a bigger difference stays red until the tolerance covers it', () => {
    expect(lengthsDiffer(52, 50, DEFAULT_SEAM_TOLERANCE_MM)).toBe(true);
    expect(lengthsDiffer(120, 114, 5)).toBe(true);
    expect(lengthsDiffer(120, 114, 6)).toBe(false);
  });
});
