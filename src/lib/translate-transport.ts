import { adminService } from 'api/api';
import type { TranslateFieldsResponse } from 'api/proto-http/admin';

// The one way to the translation model. `VITE_TRANSLATE_RPC` unset → the legacy `/api/translate`
// (Vercel function / Vite dev middleware), called exactly as before. '1' → the backend RPC
// `AdminService.TranslateFields` (POST /api/admin/ai/translate), whose answer sits one level
// deeper (`translations[code].fields`); it is mapped back to the legacy shape here, so callers see
// `{ [code]: { [field]: text } }` either way.

export type TranslateBody = {
  source: { langName: string; fields: Record<string, string> };
  targets: Array<{ code: string; langName: string }>;
  constraints: Record<string, { maxLength: number }>;
  /** Legacy endpoint only: the RPC has no such field yet. */
  context?: 'techpack';
};

/** Translations by target code, then by field name. */
export type TranslationsByCode = Record<string, Record<string, string>>;

/** Read per call (tests stub it). */
export function translateViaRpc(): boolean {
  return import.meta.env.VITE_TRANSLATE_RPC === '1';
}

/** `{translations:{code:{fields:{…}}}}` → `{code:{…}}`; a language without fields is dropped. */
export function translationsFromRpc(res: TranslateFieldsResponse | undefined): TranslationsByCode {
  const out: TranslationsByCode = {};
  for (const [code, entry] of Object.entries(res?.translations ?? {})) {
    const fields = entry?.fields;
    if (fields && typeof fields === 'object') out[code] = fields;
  }
  return out;
}

/**
 * Sends one translate request. `failMessage(status)` is the caller's legacy error text for an HTTP
 * failure without an `error` field; the RPC path throws the backend's own message.
 */
export async function requestTranslations(
  body: TranslateBody,
  failMessage: (status: number) => string,
): Promise<TranslationsByCode> {
  if (translateViaRpc()) {
    const res = await adminService.TranslateFields({
      source: body.source,
      targets: body.targets,
      constraints: body.constraints,
    });
    return translationsFromRpc(res);
  }

  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    translations?: TranslationsByCode;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || failMessage(res.status));
  return data.translations || {};
}
