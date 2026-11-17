import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { describe, expect, it, vi } from 'vitest';

import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import { routePatternImportDxfPhaseECadTableZeroOperationSourceV1 } from './cad-table-zero-operation-source-routing-v1';
import { listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from './zero-operation-saved-card-authority-v1';

const SHA = 'a'.repeat(64);

function card(revision = 7, lockVersion = 13): common_TechCard {
  return {
    id: 6,
    lockVersion,
    techCard: {
      sizeIds: [2],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main fabric',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        },
      ],
      patterns: [
        {
          lineKey: 'pattern-main',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
          url: 'https://objects.example/pattern-main.dxf',
          downloadUrl: '/api/p/token/download',
          sizeBytes: 2048,
          sha256: SHA,
          savedRowRevision: revision,
          filename: 'main.dxf',
        },
      ],
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

function cardWithSavedRow(
  saved: Readonly<{
    revision: number;
    url: string;
    sizeBytes: number;
    sha256: string;
  }>,
  lockVersion = 13,
): common_TechCard {
  const current = card(saved.revision, lockVersion);
  const pattern = current.techCard?.patterns?.[0];
  if (!pattern) throw new Error('Saved-row test fixture is missing its pattern row.');
  pattern.url = saved.url;
  pattern.sizeBytes = saved.sizeBytes;
  pattern.sha256 = saved.sha256;
  return current;
}

const row: DxfProductSavedRowIdentityV1 = Object.freeze({
  techCardId: 6,
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 13,
  url: 'https://objects.example/pattern-main.dxf',
  sizeBytes: 2048,
  sha256: SHA,
});

const orderSizeIds = (ids: number[]) => [...ids];
const sizeNameById = new Map([[2, 'M']]);

describe('zero-operation saved card authority', () => {
  it('reads one exact operation-independent row and its server download URL', async () => {
    const readTechCard = vi.fn(async () => card());
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard,
    });
    const controller = new AbortController();

    await expect(runtime.authority.readAuthoritativeRow(row, controller.signal)).resolves.toEqual({
      row,
      downloadUrl: '/api/p/token/download',
    });
    await expect(runtime.resolveCard(row, controller.signal)).resolves.toMatchObject({
      cardLockVersion: 13,
      card: { techCardId: 6, sizes: [{ token: 'M' }] },
    });
    expect(readTechCard).toHaveBeenCalledTimes(2);
  });

  it('recognizes an ordinary save only when the card lock advances without moving the DXF row', async () => {
    const reads = [card(7, 15), cardWithSavedRow({ ...row, sha256: 'b'.repeat(64) }, 16)];
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => reads.shift()!),
    });
    const signal = new AbortController().signal;

    await expect(runtime.resolveLatestCard(row, signal)).resolves.toMatchObject({
      techCard: { lockVersion: 15 },
      row: { ...row, cardLockVersion: 15 },
    });
    await expect(runtime.resolveLatestCard(row, signal)).rejects.toThrow(/saved DXF row changed/i);
  });

  it.each([
    ['equal', 13],
    ['backward', 12],
  ])(
    'fails closed when the ordinary-save lock is %s instead of advancing',
    async (_, lockVersion) => {
      const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds,
        sizeNameById,
        readTechCard: vi.fn(async () => card(7, lockVersion)),
      });

      await expect(runtime.resolveLatestCard(row, new AbortController().signal)).rejects.toThrow(
        /strictly advance/i,
      );
    },
  );

  it('independently reads the post-import card and rejects a save with no lock advance', async () => {
    const readTechCard = vi
      .fn<() => Promise<common_TechCard>>()
      .mockResolvedValueOnce(card(7, 14))
      .mockResolvedValueOnce(card(7, 13));
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard,
    });
    const signal = new AbortController().signal;

    await expect(
      runtime.resolveLatestCommittedCard(
        { techCardId: row.techCardId, previousLockVersion: row.cardLockVersion },
        signal,
      ),
    ).resolves.toMatchObject({ lockVersion: 14 });
    await expect(
      runtime.resolveLatestCommittedCard(
        { techCardId: row.techCardId, previousLockVersion: row.cardLockVersion },
        signal,
      ),
    ).rejects.toThrow(/strictly advance/i);
    expect(readTechCard).toHaveBeenCalledTimes(2);
  });

  it('fails closed when row revision or card lock changes between reads', async () => {
    const reads = [card(), card(8, 14)];
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => reads.shift()!),
    });
    const controller = new AbortController();

    await expect(
      runtime.authority.readAuthoritativeRow(row, controller.signal),
    ).resolves.toBeTruthy();
    await expect(runtime.authority.readAuthoritativeRow(row, controller.signal)).rejects.toThrow(
      /card id or optimistic lock moved|row identity moved/,
    );
  });

  it('rebases a cached row onto the fresh authoritative identity, then fails closed if it moves', async () => {
    const authoritative = Object.freeze({
      ...row,
      revision: 8,
      url: 'https://objects.example/pattern-main-current.dxf',
      sizeBytes: 4096,
      sha256: 'b'.repeat(64),
    });
    const moved = Object.freeze({
      ...authoritative,
      revision: 9,
      url: 'https://objects.example/pattern-main-moved.dxf',
      sizeBytes: 8192,
      sha256: 'c'.repeat(64),
    });
    const reads = [
      cardWithSavedRow(authoritative),
      cardWithSavedRow(authoritative),
      cardWithSavedRow(moved),
    ];
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => reads.shift()!),
    });
    const controller = new AbortController();

    const bootstrap = await runtime.resolveCurrentRow(row, controller.signal);
    expect(bootstrap).toEqual({
      row: authoritative,
      downloadUrl: '/api/p/token/download',
    });
    await expect(runtime.authority.readAuthoritativeRow(row, controller.signal)).rejects.toThrow(
      /row identity moved/i,
    );

    const fetcher = vi.fn<typeof globalThis.fetch>();
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      fetch: fetcher,
      readAuthoritativeRow: runtime.authority.readAuthoritativeRow,
      resolveCard: async () => ({
        card: { techCardId: 6, sizes: [], scopes: [], existingPieces: [], styleLabel: 'TEST' },
        cardLockVersion: 13,
      }),
    });

    await expect(
      host.readAuthoritativeRow(authoritative, controller.signal, () => undefined),
    ).rejects.toThrow(/row identity moved|authority moved/i);
    expect(fetcher).not.toHaveBeenCalled();
    host.dispose();
  });

  it('recovers a missing fresh size only when revision, URL and SHA still match the selector', async () => {
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => cardWithSavedRow({ ...row, sizeBytes: 0 })),
    });

    await expect(runtime.resolveCurrentRow(row, new AbortController().signal)).resolves.toEqual({
      row,
      downloadUrl: '/api/p/token/download',
    });
  });

  it('does not borrow a cached size after the saved row identity changes', async () => {
    const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () =>
        cardWithSavedRow({
          ...row,
          revision: row.revision + 1,
          sizeBytes: 0,
          sha256: 'b'.repeat(64),
        }),
      ),
    });

    await expect(runtime.resolveCurrentRow(row, new AbortController().signal)).rejects.toThrow(
      /sizeBytes/i,
    );
  });

  it('lists only saved scopes with one exact downloadable row', () => {
    const result = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      card(),
      orderSizeIds,
      sizeNameById,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices).toEqual([
      expect.objectContaining({
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        sizes: [expect.objectContaining({ sizeToken: 'M', sizeId: 2 })],
      }),
    ]);
  });

  it('reports the saved-DXF absence instead of requiring a live Phase-E session', () => {
    const withoutSavedDxf = card();
    const pattern = withoutSavedDxf.techCard?.patterns?.[0];
    if (!pattern) throw new Error('Saved-row test fixture is missing its pattern row.');
    pattern.url = undefined;
    pattern.downloadUrl = undefined;

    const result = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      withoutSavedDxf,
      orderSizeIds,
      sizeNameById,
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'saved-pattern-unavailable' },
    });
  });

  it('does not let a stale partial card session shadow the current saved DXF row', () => {
    const staleSession = {
      techCardId: 6,
      importGeneration: 0,
      draft: null,
    } as never;
    const fresh = listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(staleSession, 0);
    const saved = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      card(),
      orderSizeIds,
      sizeNameById,
    );

    const routed = routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, saved);

    expect(fresh.ok).toBe(false);
    expect(routed.mode).toBe('saved');
    expect(routed.choices.ok).toBe(true);
  });

  it.each([
    {
      label: 'missing detached draft',
      session: { techCardId: 6, importGeneration: 1, draft: null },
      expectedGeneration: 1,
      freshCode: 'fresh-session-invalid',
    },
    {
      label: 'stale import generation',
      session: { techCardId: 6, importGeneration: 1, draft: { techCardId: 6 } },
      expectedGeneration: 2,
      freshCode: 'fresh-session-generation-stale',
    },
    {
      label: 'missing Phase-D replay authority',
      session: {
        techCardId: 6,
        importGeneration: 1,
        draft: { techCardId: 6, dxfProvenance: null, dxfPhaseDReplay: null },
      },
      expectedGeneration: 1,
      freshCode: 'phase-d-authority-unavailable',
    },
  ])(
    'routes $label through current saved-card choices',
    ({ session, expectedGeneration, freshCode }) => {
      const fresh = listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(
        session as never,
        expectedGeneration,
      );
      const saved = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        card(),
        orderSizeIds,
        sizeNameById,
      );

      const routed = routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, saved);

      expect(fresh).toMatchObject({ ok: false, blocker: { code: freshCode } });
      expect(routed).toMatchObject({ mode: 'saved', choices: { ok: true } });
      expect(JSON.stringify(routed)).not.toContain(
        'A current positive Phase-E card session and its detached draft are required.',
      );
    },
  );

  it('reports the saved-card blocker when neither fresh nor saved input is usable', () => {
    const withoutSavedDxf = card();
    const pattern = withoutSavedDxf.techCard?.patterns?.[0];
    if (!pattern) throw new Error('Saved-row test fixture is missing its pattern row.');
    pattern.url = undefined;
    pattern.downloadUrl = undefined;

    const fresh = listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(
      { techCardId: 6, importGeneration: 1, draft: null } as never,
      1,
    );
    const saved = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      withoutSavedDxf,
      orderSizeIds,
      sizeNameById,
    );

    const routed = routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, saved);

    expect(routed).toMatchObject({
      mode: 'saved',
      choices: { ok: false, blocker: { code: 'saved-pattern-unavailable' } },
    });
    expect(JSON.stringify(routed)).not.toContain(
      'A current positive Phase-E card session and its detached draft are required.',
    );
  });

  it('resolves a server-relative DXF capability before fetching its presigned object', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const capabilityUrl = 'https://api.beta.example/api/p/token/download?dl=1&mode=json';
    const objectUrl = 'https://objects.example/pattern-main.dxf?token=storage-token';
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input) === capabilityUrl)
        return new Response(JSON.stringify({ url: objectUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (String(input) === objectUrl)
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        });
      throw new TypeError(`Unexpected test fetch: ${String(input)}`);
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      readAuthToken: () => 'beta-token',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/token/download?dl=1',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      capabilityUrl,
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'error',
      }),
    );
    const capabilityRequest = fetcher.mock.calls[0]?.[1];
    expect(new Headers(capabilityRequest?.headers).get('Grpc-Metadata-Authorization')).toBe(
      'Bearer beta-token',
    );
    expect(new Headers(capabilityRequest?.headers).get('Accept')).toBe('application/json');
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      objectUrl,
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    );
    const objectRequest = fetcher.mock.calls[1]?.[1];
    expect(new Headers(objectRequest?.headers).get('Grpc-Metadata-Authorization')).toBeNull();
    host.dispose();
  });

  it('retries one transient capability network failure before downloading saved DXF bytes', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const capabilityUrl = 'https://api.beta.example/api/p/token/download?mode=json';
    const objectUrl = 'https://objects.example/pattern-main.dxf?token=storage-token';
    let capabilityAttempts = 0;
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input) === capabilityUrl) {
        capabilityAttempts += 1;
        if (capabilityAttempts === 1) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify({ url: objectUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (String(input) === objectUrl)
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        });
      throw new TypeError(`Unexpected test fetch: ${String(input)}`);
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      readAuthToken: () => 'beta-token',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/token/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      capabilityUrl,
      expect.objectContaining({ redirect: 'error', credentials: 'same-origin' }),
    );
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Grpc-Metadata-Authorization'),
    ).toBe('Bearer beta-token');
    expect(
      new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('Grpc-Metadata-Authorization'),
    ).toBeNull();
    host.dispose();
  });

  it('bounds repeated capability network failures and does not expose the secret URL', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('Failed to fetch https://api.beta.example/api/p/top-secret/download');
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/top-secret/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    let failure: unknown;
    try {
      await host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected capability network failure.');
    expect(failure.message).toBe('Saved DXF capability lookup failed due to a network error.');
    expect(failure.message).not.toContain('top-secret');
    expect(fetcher).toHaveBeenCalledTimes(2);
    host.dispose();
  });

  it('does not retry capability lookup after cancellation', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const controller = new AbortController();
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => {
      controller.abort();
      throw new TypeError('Failed to fetch');
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/token/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, controller.signal, () => undefined),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('routes an absolute beta backend capability through the local same-origin API proxy', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const backendCapabilityUrl = 'https://backend-beta.grbpwr.com/api/p/token/download?dl=1';
    const localCapabilityUrl = 'http://127.0.0.1:4040/api/p/token/download?dl=1&mode=json';
    const objectUrl = 'https://files.grbpwr.com/pattern-main.dxf?token=storage-token';
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input) === localCapabilityUrl)
        return new Response(JSON.stringify({ url: objectUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (String(input) === objectUrl)
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        });
      throw new TypeError(`Unexpected test fetch: ${String(input)}`);
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: '',
      apiProxyTarget: 'https://backend-beta.grbpwr.com',
      browserOrigin: 'http://127.0.0.1:4040',
      readAuthToken: () => 'beta-token',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: backendCapabilityUrl,
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      localCapabilityUrl,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    const capabilityRequest = fetcher.mock.calls[0]?.[1];
    expect(new Headers(capabilityRequest?.headers).get('Grpc-Metadata-Authorization')).toBe(
      'Bearer beta-token',
    );
    expect(fetcher).not.toHaveBeenCalledWith(backendCapabilityUrl, expect.anything());
    host.dispose();
  });

  it('retries a cross-origin CORS failure through the media proxy without forwarding auth', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const objectUrl = 'https://objects.example/pattern-main.dxf?token=storage-token';
    const proxyUrl = `https://admin.beta.example/media-proxy?url=${encodeURIComponent(objectUrl)}`;
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input) === objectUrl) throw new TypeError('Failed to fetch');
      if (String(input) === proxyUrl)
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        });
      throw new TypeError(`Unexpected test fetch: ${String(input)}`);
    });
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      mediaProxyUrl: 'https://admin.beta.example/media-proxy',
      readAuthToken: () => 'beta-token',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: objectUrl,
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      objectUrl,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      proxyUrl,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Grpc-Metadata-Authorization'),
    ).toBe(null);
    host.dispose();
  });

  it('rejects an unsafe capability object URL before attempting its byte fetch', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const fetcher = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ url: 'javascript:alert(1)' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/token/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).rejects.toThrow(/absolute object URL|HTTP or HTTPS/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('stops before byte download when the capability lookup is unavailable', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 410 }));
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: '/api/p/token/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).rejects.toThrow(/capability lookup failed with HTTP 410/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('does not disclose the backend auth token to a cross-origin saved DXF URL', async () => {
    const exactRow = Object.freeze({ ...row, sizeBytes: 3 });
    const fetcher = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        }),
    );
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      serverUrl: 'https://api.beta.example/',
      readAuthToken: () => 'beta-token',
      fetch: fetcher as typeof globalThis.fetch,
      readAuthoritativeRow: async () => ({
        row: exactRow,
        downloadUrl: 'https://objects.example/pattern-main.dxf?token=storage-token',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenCalledWith(
      'https://objects.example/pattern-main.dxf?token=storage-token',
      expect.objectContaining({ method: 'GET' }),
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('Grpc-Metadata-Authorization')).toBeNull();
    host.dispose();
  });

  it('cancels saved reconstruction before starting its download worker', async () => {
    const authority = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => card()),
    });
    const controller = new AbortController();
    controller.abort();
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      {
        techCard: card(),
        orderSizeIds,
        sizeNameById,
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        sizeToken: 'M',
        authority,
        generation: generationOwner.beginSaved('cancelled-saved-preparation'),
      },
      controller.signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocker.code).toBe('saved-preparation-cancelled');
  });

  it('keeps a safe fresh-authority reason when saved preparation throws', async () => {
    const authority = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
      orderSizeIds,
      sizeNameById,
      readTechCard: vi.fn(async () => {
        throw new Error('Fresh saved-row authority is unavailable.');
      }),
    });
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1({
      techCard: card(),
      orderSizeIds,
      sizeNameById,
      scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
      sizeToken: 'M',
      authority,
      generation: generationOwner.beginSaved('failed-saved-preparation'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocker).toMatchObject({
      code: 'saved-preparation-failed',
      detail: expect.stringMatching(/fresh saved-row authority is unavailable/i),
    });
  });
});
