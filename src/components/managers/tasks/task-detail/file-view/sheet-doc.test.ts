import { describe, expect, it } from 'vitest';
import { copyName, formatWhen, sheetByline } from './sheet-doc';

describe('copyName', () => {
  it('puts copy before the extension', () => {
    expect(copyName('plan.final.xlsx')).toBe('plan.final copy.xlsx');
    expect(copyName('plan')).toBe('plan copy');
  });
});

describe('sheetByline', () => {
  it('drops what the server does not know', () => {
    expect(sheetByline('changed by', 'nina', '2026-01-02T12:00:00')).toBe(
      'changed by nina · 02.01',
    );
    expect(sheetByline('changed', '', '2026-01-02T12:00:00')).toBe('changed · 02.01');
    expect(sheetByline('changed', '', '')).toBe('changed');
  });
});

describe('formatWhen', () => {
  it('shows time today and date otherwise', () => {
    const now = new Date();
    now.setHours(9, 5, 0, 0);
    expect(formatWhen(now.toISOString())).toBe('09:05');
    expect(formatWhen('not a date')).toBe('');
  });
});
