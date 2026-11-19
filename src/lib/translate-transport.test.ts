import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { translateFields } = vi.hoisted(() => ({ translateFields: vi.fn() }));
vi.mock('api/api', () => ({ adminService: { TranslateFields: translateFields } }));

import { requestTranslations, translateViaRpc, translationsFromRpc } from './translate-transport';

const body = {
  source: { langName: 'English', fields: { f0: 'sleeve' } },
  targets: [{ code: 'fr', langName: 'French' }],
  constraints: {},
  context: 'techpack' as const,
};

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('translationsFromRpc', () => {
  it('reads one level deeper: translations[code].fields', () => {
    expect(
      translationsFromRpc({
        translations: {
          fr: { fields: { f0: 'manche', f1: 'col' } },
          de: { fields: { f0: 'Ärmel' } },
        },
      }),
    ).toEqual({ fr: { f0: 'manche', f1: 'col' }, de: { f0: 'Ärmel' } });
  });

  it('drops a language without fields and survives an empty answer', () => {
    expect(translationsFromRpc({ translations: { fr: { fields: undefined } } })).toEqual({});
    expect(translationsFromRpc({ translations: undefined })).toEqual({});
    expect(translationsFromRpc(undefined)).toEqual({});
  });
});

describe('requestTranslations', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    translateFields.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('variable unset → the legacy /api/translate with the body as is', async () => {
    vi.stubEnv('VITE_TRANSLATE_RPC', '');
    expect(translateViaRpc()).toBe(false);
    fetchMock.mockResolvedValue(jsonResponse(200, { translations: { fr: { f0: 'manche' } } }));

    const out = await requestTranslations(body, (s) => `translate ${s}`);

    expect(out).toEqual({ fr: { f0: 'manche' } });
    expect(translateFields).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/translate');
    expect(init).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('variable unset → the legacy error text', async () => {
    vi.stubEnv('VITE_TRANSLATE_RPC', '');
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    await expect(requestTranslations(body, (s) => `translate ${s}`)).rejects.toThrow(
      'translate 500',
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: 'busy' }));
    await expect(requestTranslations(body, (s) => `translate ${s}`)).rejects.toThrow('busy');
  });

  it("'1' → the RPC, without the legacy-only context, answer mapped from .fields", async () => {
    vi.stubEnv('VITE_TRANSLATE_RPC', '1');
    translateFields.mockResolvedValue({ translations: { fr: { fields: { f0: 'manche' } } } });

    const out = await requestTranslations(body, (s) => `translate ${s}`);

    expect(out).toEqual({ fr: { f0: 'manche' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(translateFields).toHaveBeenCalledWith({
      source: body.source,
      targets: body.targets,
      constraints: body.constraints,
    });
  });
});
