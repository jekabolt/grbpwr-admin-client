import { describe, expect, it } from 'vitest';

import { createPdfT, htmlLang, parsePdfLang, PDF_LANGS } from '.';

describe('tech-pack PDF languages', () => {
  it('keeps the owner-defined language order', () => {
    expect(PDF_LANGS.map(({ code }) => code)).toEqual([
      'en',
      'fr',
      'de',
      'it',
      'es',
      'pl',
      'ru',
      'cn',
      'ja',
      'kr',
    ]);
  });

  it('parses only supported URL values', () => {
    expect(parsePdfLang(new URLSearchParams())).toBe('en');
    expect(parsePdfLang(new URLSearchParams('lang=fr'))).toBe('fr');
    expect(parsePdfLang(new URLSearchParams('lang=xx'))).toBe('en');
    expect(parsePdfLang(new URLSearchParams('lang=unknown'))).toBe('en');
  });

  it('maps store codes to document language tags', () => {
    expect(htmlLang('cn')).toBe('zh-Hans');
    expect(htmlLang('kr')).toBe('ko');
    expect(htmlLang('pl')).toBe('pl');
  });

  it('falls back to English and interpolates values', () => {
    const french = createPdfT('fr');
    expect(french('notices.openFindings', { count: 3, noun: 'findings' })).toBe('3 open findings');
  });

  it('preserves the existing English count copy', () => {
    const english = createPdfT('en');
    expect(english('common.gaps', { count: 1 })).toBe('1 gaps');
    expect(english('common.gaps', { count: 8 })).toBe('8 gaps');
  });

  it('wraps pseudo-locale messages after interpolation', () => {
    const pseudo = createPdfT('xx');
    expect(pseudo('common.revisionValue', { number: 7 })).toBe('⟦rev 7⟧');
  });
});
