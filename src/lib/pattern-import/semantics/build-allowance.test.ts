import { describe, expect, it } from 'vitest';

import { PATIMPORT, type AllowanceDecision } from '../types';
import { resolvePatternImportSemanticsAllowanceMm } from './build';

const resolve = (decision: AllowanceDecision) => resolvePatternImportSemanticsAllowanceMm(decision);

describe('semantic allowance resolution', () => {
  it('preserves an explicit operator cut-line allowance of zero', () => {
    expect(
      resolve({
        meaning: 'cut',
        allowanceMm: 0,
        origin: 'operator',
        evidence: ['saved-manifest-cut-layer-is-final'],
      }),
    ).toEqual({ allowanceMm: 0, defaulted: false });
  });

  it.each([
    { meaning: 'seam', origin: 'operator' },
    { meaning: 'cut', origin: 'default' },
    { meaning: 'both', origin: 'measured' },
  ] as const)('keeps the existing default for $meaning / $origin zero', ({ meaning, origin }) => {
    expect(resolve({ meaning, allowanceMm: 0, origin, evidence: [] })).toEqual({
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      defaulted: true,
    });
  });

  it('preserves a positive allowance without defaulting', () => {
    expect(resolve({ meaning: 'cut', allowanceMm: 7.5, origin: 'operator', evidence: [] })).toEqual(
      { allowanceMm: 7.5, defaulted: false },
    );
  });
});
