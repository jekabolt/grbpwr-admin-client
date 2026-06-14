/**
 * Shared OpenRouter translation helper.
 *
 * Used by both the Vercel serverless function (api/translate.js) and the
 * dev-only vite middleware (translateApiPlugin in vite.config.ts) so the
 * prompt + request logic lives in exactly one place.
 *
 * Unlike the old "copy source verbatim into every language" behaviour, this
 * asks a model to actually translate the provided fields into each target
 * language in a single request, returning structured JSON.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
// Bound the completion size. Translating a few short fields into ~6 languages
// needs little output; an explicit cap also avoids OpenRouter reserving the
// model's full context window during its pre-flight credit check.
const MAX_TOKENS = 4000;

/**
 * @typedef {{ langName: string, fields: Record<string, string> }} Source
 * @typedef {{ code: string, langName: string }} Target
 *
 * @param {Object}  params
 * @param {Source}  params.source       Source language name + field values to translate.
 * @param {Target[]} params.targets     Target languages (code + human-readable name).
 * @param {Record<string, { maxLength?: number }>} [params.constraints] Per-field limits.
 * @param {string}  params.apiKey       OpenRouter API key (server-side only).
 * @param {string}  [params.model]      Model slug; defaults to gemini-2.5-flash.
 * @returns {Promise<Record<string, Record<string, string>>>} translations keyed by target code.
 */
export async function translateFields({ source, targets, constraints = {}, apiKey, model }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  if (!source || !source.fields || Object.keys(source.fields).length === 0) {
    throw new Error('No source fields to translate');
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('No target languages provided');
  }

  const fieldNames = Object.keys(source.fields);
  const targetCodes = targets.map((t) => t.code);

  const systemPrompt = [
    'You are a professional fashion e-commerce translator for the brand grbpwr.',
    `Translate the provided fields from ${source.langName} into each requested target language.`,
    'Rules:',
    '- Preserve brand names, proper nouns, product/model names, sizes, measurements, and SKU-like tokens untranslated.',
    '- Keep the tone concise, premium, and on-brand. Do not add, remove, or explain anything.',
    '- When a field has a maxLength, the translated text MUST NOT exceed that many characters.',
    '- Translate every field for every target language. Never leave a field empty.',
    'Output ONLY a JSON object, no markdown, with this exact shape:',
    '{ "translations": { "<targetCode>": { "<fieldName>": "<translatedText>" } } }',
    `Use exactly these target codes as keys: ${targetCodes.join(', ')}.`,
    `Each target must contain exactly these fields: ${fieldNames.join(', ')}.`,
  ].join('\n');

  const userPayload = {
    sourceLanguage: source.langName,
    targets: targets.map((t) => ({ code: t.code, language: t.langName })),
    fields: source.fields,
    constraints,
  };

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional attribution headers recommended by OpenRouter.
      'X-Title': 'grbpwr-admin',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const errJson = await resp.json();
      detail = errJson?.error?.message || errJson?.message || detail;
    } catch {
      /* keep default */
    }
    throw new Error(`OpenRouter error: ${detail}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned an empty response');
  }

  const parsed = parseJsonContent(content);
  const translations = parsed?.translations;
  if (!translations || typeof translations !== 'object') {
    throw new Error('OpenRouter response did not contain translations');
  }

  return translations;
}

/** Parse model output, tolerating accidental ```json fenced blocks. */
function parseJsonContent(content) {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error('Failed to parse translation JSON from model output');
  }
}
