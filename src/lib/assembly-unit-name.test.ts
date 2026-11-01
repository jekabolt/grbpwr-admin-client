import { describe, expect, it } from 'vitest';

import { humanizeUnitKey } from './assembly-unit-name';

describe('humanizeUnitKey', () => {
  it('reads a mostly-uppercase key case-insensitively', () => {
    expect(humanizeUnitKey('FRONT lEFT WITH POCKET DETAIL')).toBe('Front left with pocket detail');
    expect(humanizeUnitKey('BACK_YOKE')).toBe('Back yoke');
  });

  it('still splits real camelCase keys', () => {
    expect(humanizeUnitKey('frontLeftPocket')).toBe('Front left pocket');
    expect(humanizeUnitKey('sleeve_cuffLeft')).toBe('Sleeve cuff left');
  });

  it('falls back to Unit for an empty key', () => {
    expect(humanizeUnitKey('  ')).toBe('Unit');
  });
});
