import { describe, expect, it } from 'vitest';

import { createPdfT, htmlLang, parsePdfLang, PDF_LANGS } from '.';
import { cn } from './cn';
import { de } from './de';
import { en, type Message, type PluralMessage } from './en';
import { es } from './es';
import { fr } from './fr';
import { it as italian } from './it';
import { ja } from './ja';
import { kr } from './kr';
import { pl } from './pl';
import { ru } from './ru';

const dictionaries = { fr, de, it: italian, es, pl, ru, cn, ja, kr } as const;
type Locale = keyof typeof dictionaries;

const localeTags: Record<Locale, string> = {
  fr: 'fr',
  de: 'de',
  it: 'it',
  es: 'es',
  pl: 'pl',
  ru: 'ru',
  cn: 'zh-Hans',
  ja: 'ja',
  kr: 'ko',
};

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]))].sort();

const asSections = (dictionary: object) =>
  dictionary as Record<string, Record<string, string | Partial<PluralMessage>>>;

const sourceForCategory = (message: Message, category?: keyof PluralMessage): string => {
  if (typeof message === 'string') return message;
  return (category && message[category]) || message.other;
};

// These are intentional non-translations: the placeholder-only passthrough has no copy, and the
// remaining French/Spanish/Italian entries are standard words or abbreviations spelled identically.
export const NOT_TRANSLATED_ALLOWLIST: Record<Locale, ReadonlySet<string>> = {
  fr: new Set([
    'common.composition',
    'common.machine',
    'common.source',
    'common.article',
    'common.date',
    'common.section',
    'common.action',
    'common.photos',
    'common.points',
    'common.generated',
    'cover.machine',
    'pieces.net',
    'pieces.code',
    'patterns.netSquareMetres',
    'labels.composition',
    'assembly.machineDelta',
    'assembly.deltaMm',
    'assembly.photo',
    'assembly.resolvedDate',
    'measurements.point',
    'qc.signature',
    'gaps.article',
    'gaps.code',
    'gaps.composition',
    'gaps.machine',
  ]),
  de: new Set(['common.generated', 'assembly.hand', 'assembly.deltaMm']),
  it: new Set(['common.revisionDotValue', 'common.generated', 'assembly.deltaMm']),
  es: new Set([
    'common.continued',
    'common.revisionDotValue',
    'common.material',
    'common.generated',
    'vocab.genderUnisex',
    'assembly.deltaMm',
    'gaps.material',
  ]),
  pl: new Set(['common.generated', 'assembly.deltaMm']),
  ru: new Set(['common.generated']),
  cn: new Set(['common.generated']),
  ja: new Set(['common.generated', 'assembly.deltaMm']),
  kr: new Set(['common.generated', 'assembly.deltaMm']),
};

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

  it('uses self-contained plural copy for findings', () => {
    expect(createPdfT('en')('notices.openFindings', { count: 1 })).toBe('1 open finding');
    expect(createPdfT('en')('notices.openFindings', { count: 3 })).toBe('3 open findings');
    expect(createPdfT('fr')('notices.openFindings', { count: 3 })).toBe('3 anomalies ouvertes');
    expect(createPdfT('ru')('notices.openFindings', { count: 3 })).toBe('3 открытых замечания');
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

describe.each(Object.entries(dictionaries) as [Locale, (typeof dictionaries)[Locale]][])(
  '%s PDF dictionary',
  (locale, dictionary) => {
    const translatedSections = asSections(dictionary);

    it('has every English key with non-empty copy', () => {
      for (const [section, messages] of Object.entries(en)) {
        expect(translatedSections[section], `missing section ${section}`).toBeDefined();
        for (const [key, english] of Object.entries(messages) as [string, Message][]) {
          const translated = translatedSections[section]?.[key];
          expect(translated, `missing ${section}.${key}`).toBeDefined();
          expect(typeof translated, `message kind ${section}.${key}`).toBe(typeof english);
          const forms = typeof translated === 'string' ? [translated] : Object.values(translated!);
          for (const form of forms) {
            expect(form?.trim(), `empty ${section}.${key}`).toBeTruthy();
          }
        }
      }
    });

    it('preserves placeholders in every form', () => {
      for (const [section, messages] of Object.entries(en)) {
        for (const [key, english] of Object.entries(messages) as [string, Message][]) {
          const translated = translatedSections[section][key]!;
          if (typeof translated === 'string') {
            expect(placeholders(translated), `${section}.${key}`).toEqual(
              placeholders(english as string),
            );
            continue;
          }
          for (const [category, form] of Object.entries(translated) as [
            keyof PluralMessage,
            string,
          ][]) {
            expect(placeholders(form), `${section}.${key}.${category}`).toEqual(
              placeholders(sourceForCategory(english, category)),
            );
          }
        }
      }
    });

    it('implements every plural category reported by Intl', () => {
      const required = new Intl.PluralRules(localeTags[locale]).resolvedOptions().pluralCategories;
      for (const [section, messages] of Object.entries(en)) {
        for (const [key, english] of Object.entries(messages) as [string, Message][]) {
          if (typeof english === 'string') continue;
          const translated = translatedSections[section][key];
          expect(typeof translated, `${section}.${key}`).toBe('object');
          expect(Object.keys(translated!), `${section}.${key}`).toEqual(
            expect.arrayContaining(required),
          );
        }
      }
    });

    it('does not silently retain English copy', () => {
      const allowlist = NOT_TRANSLATED_ALLOWLIST[locale];
      for (const [section, messages] of Object.entries(en)) {
        for (const [key, english] of Object.entries(messages) as [string, Message][]) {
          const fullKey = `${section}.${key}`;
          const translated = translatedSections[section][key]!;
          if (typeof translated === 'string') {
            if (!allowlist.has(fullKey)) expect(translated, fullKey).not.toBe(english);
            continue;
          }
          for (const [category, form] of Object.entries(translated) as [
            keyof PluralMessage,
            string,
          ][]) {
            if (!allowlist.has(fullKey)) {
              expect(form, `${fullKey}.${category}`).not.toBe(sourceForCategory(english, category));
            }
          }
        }
      }
    });
  },
);
