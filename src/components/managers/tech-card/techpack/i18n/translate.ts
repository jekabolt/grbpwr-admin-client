import { cn } from './cn';
import { de } from './de';
import {
  en,
  type Message,
  type PdfMessageKey,
  type PdfTranslations,
  type PluralMessage,
} from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ja } from './ja';
import { kr } from './kr';
import { htmlLang, type PdfLocale } from './langs';
import { pl } from './pl';
import { ru } from './ru';
import { pseudo } from './xx';

const translations: Record<Exclude<PdfLocale, 'en' | 'xx'>, PdfTranslations> = {
  fr,
  de,
  it,
  es,
  pl,
  ru,
  cn,
  ja,
  kr,
};

export type PdfTValues = Record<string, string | number | undefined | null> & { count?: number };
export type PdfT = (key: PdfMessageKey, values?: PdfTValues) => string;

const localeByTranslator = new WeakMap<PdfT, PdfLocale>();

/** Locale carried by a translator created here; custom test translators remain English. */
export const pdfLocaleOf = (translate: PdfT): PdfLocale =>
  localeByTranslator.get(translate) ?? 'en';

const englishMessage = (key: PdfMessageKey): Message => {
  const [section, name] = key.split('.') as [keyof typeof en, string];
  return en[section][name as keyof (typeof en)[typeof section]] as Message;
};

type TranslatedMessage = string | Partial<PluralMessage>;

const translatedMessage = (
  locale: PdfLocale,
  key: PdfMessageKey,
): TranslatedMessage | undefined => {
  if (locale === 'en' || locale === 'xx') return undefined;
  const [section, name] = key.split('.') as [keyof typeof en, string];
  return translations[locale][section]?.[name as never] as TranslatedMessage | undefined;
};

function pluralCategory(locale: PdfLocale, count: number | undefined): keyof PluralMessage {
  return new Intl.PluralRules(htmlLang(locale === 'xx' ? 'en' : locale)).select(
    count ?? 0,
  ) as keyof PluralMessage;
}

function pluralText(message: Message, locale: PdfLocale, count: number | undefined): string {
  if (typeof message === 'string') return message;
  const category = pluralCategory(locale, count);
  return message[category] ?? message.other;
}

function localizedText(
  english: Message,
  translated: TranslatedMessage | undefined,
  locale: PdfLocale,
  count: number | undefined,
): string {
  if (typeof translated === 'string') return translated;
  if (translated && typeof english !== 'string') {
    const category = pluralCategory(locale, count);
    return translated[category] ?? translated.other ?? english[category] ?? english.other;
  }
  return pluralText(english, locale, count);
}

function interpolate(message: string, values: PdfTValues | undefined): string {
  if (!values) return message;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) => {
    const value = values[key];
    return value == null ? match : String(value);
  });
}

export function createPdfT(locale: PdfLocale): PdfT {
  const translate: PdfT = (key, values) => {
    const english = englishMessage(key);
    const translated = translatedMessage(locale, key);
    const text = interpolate(localizedText(english, translated, locale, values?.count), values);
    return locale === 'xx' ? pseudo(text) : text;
  };
  localeByTranslator.set(translate, locale);
  return translate;
}

export const englishT = createPdfT('en');
