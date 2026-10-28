import { afterEach, describe, expect, it } from 'vitest';

import { own, setOwnState } from './own';

afterEach(() => setOwnState({ lang: 'en', table: new Map(), seen: new Set() }));

describe('own', () => {
  it('is verbatim and records nothing in English', () => {
    const seen = new Set<string>();
    setOwnState({ lang: 'en', table: new Map([['Hem', 'Подшить низ']]), seen });
    expect(own('Hem')).toBe('Hem');
    expect(seen.size).toBe(0);
  });

  it('returns the translation and records misses once', () => {
    const seen = new Set<string>();
    setOwnState({ lang: 'ru', table: new Map([['Hem', 'Подшить низ']]), seen });
    expect(own('Hem')).toBe('Подшить низ');
    expect(own('Attach yoke')).toBe('Attach yoke');
    expect(own('Attach yoke')).toBe('Attach yoke');
    expect([...seen]).toEqual(['Attach yoke']);
  });

  it('leaves text without letters alone', () => {
    const seen = new Set<string>();
    setOwnState({ lang: 'ru', table: new Map(), seen });
    expect(own('12.5')).toBe('12.5');
    expect(own(undefined)).toBe('');
    expect(seen.size).toBe(0);
  });
});
