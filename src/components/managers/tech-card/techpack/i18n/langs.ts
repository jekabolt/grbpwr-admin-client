export const PDF_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'cn', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'kr', name: '한국어' },
] as const;

export type PdfLang = (typeof PDF_LANGS)[number]['code'];
export type PdfLocale = PdfLang | 'xx';

const PDF_LANG_CODES = new Set<string>(PDF_LANGS.map(({ code }) => code));

export function parsePdfLang(searchParams: URLSearchParams): PdfLang {
  const value = searchParams.get('lang');
  return value && PDF_LANG_CODES.has(value) ? (value as PdfLang) : 'en';
}

export function htmlLang(lang: PdfLocale): string {
  if (lang === 'cn') return 'zh-Hans';
  if (lang === 'kr') return 'ko';
  return lang;
}
