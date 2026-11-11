import { describe, expect, it } from 'vitest';

import { cutCellLocked } from './cut-cell';

describe('cut cell (E5: an ungraded size of a binding strip takes a typed cut)', () => {
  const base = { readOnly: false, binding: true, mode: 'from_seam' as const };

  it('a binding size with a seam length stays computed', () => {
    expect(cutCellLocked({ ...base, seamMm: 612 })).toBe(true);
  });

  it('a binding size the pattern does not grade is typed by hand', () => {
    expect(cutCellLocked({ ...base, seamMm: undefined })).toBe(false);
  });

  it('a plain strip keeps its typed cut whatever the seam', () => {
    expect(cutCellLocked({ ...base, binding: false, seamMm: 612 })).toBe(false);
  });

  it('one length and a released card stay locked', () => {
    expect(cutCellLocked({ ...base, mode: 'one_length', seamMm: undefined })).toBe(true);
    expect(cutCellLocked({ ...base, readOnly: true, seamMm: undefined })).toBe(true);
  });
});
