import { LANGUAGES } from 'constants/constants';

export type TranslatableField = {
  name: string;
  value: string;
  /** Optional character limit the translation must respect. */
  maxLength?: number;
};

type TranslateResponse = {
  translations?: Record<string, Record<string, string>>;
  error?: string;
};

/**
 * Translate the given fields from one source language into every other
 * supported language via the /api/translate endpoint (Vercel serverless fn in
 * prod, vite dev middleware locally). The model translates per-language —
 * unlike the legacy "copy to all" which duplicated the source verbatim.
 *
 * @returns map of `languageId` -> `{ [fieldName]: translatedText }` for each
 *          target language the model returned. The source language is omitted.
 */
export async function translateToAllLanguages({
  sourceLanguageId,
  fields,
}: {
  sourceLanguageId: number;
  fields: TranslatableField[];
}): Promise<Record<number, Record<string, string>>> {
  const sourceLang = LANGUAGES.find((l) => l.id === sourceLanguageId);
  if (!sourceLang) throw new Error('Unknown source language');

  const nonEmpty = fields.filter((f) => f.value.trim().length > 0);
  if (nonEmpty.length === 0) throw new Error('Nothing to translate yet');

  const targets = LANGUAGES.filter((l) => l.id !== sourceLanguageId).map((l) => ({
    code: l.code,
    langName: l.name,
  }));

  const constraints: Record<string, { maxLength: number }> = {};
  for (const f of nonEmpty) {
    if (f.maxLength) constraints[f.name] = { maxLength: f.maxLength };
  }

  const source = {
    langName: sourceLang.name,
    fields: Object.fromEntries(nonEmpty.map((f) => [f.name, f.value])),
  };

  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, targets, constraints }),
  });

  const data = (await res.json().catch(() => ({}))) as TranslateResponse;
  if (!res.ok) {
    throw new Error(data.error || `Translation failed (${res.status})`);
  }

  const translations = data.translations || {};
  const byLanguageId: Record<number, Record<string, string>> = {};
  for (const lang of LANGUAGES) {
    if (lang.id === sourceLanguageId) continue;
    const translated = translations[lang.code];
    if (translated && typeof translated === 'object') {
      byLanguageId[lang.id] = translated;
    }
  }
  return byLanguageId;
}
