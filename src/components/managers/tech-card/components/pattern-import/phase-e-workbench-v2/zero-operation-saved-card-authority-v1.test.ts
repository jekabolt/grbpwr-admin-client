import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { describe, expect, it, vi } from 'vitest';

import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
} from './cad-table-zero-operation-saved-preparation-v1';
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

  it('fetches a server-relative tokenized DXF URL from the backend origin', async () => {
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
        downloadUrl: '/api/p/token/download',
      }),
      resolveCard: async () => {
        throw new Error('Card projection is not used by the byte-read test.');
      },
    });

    await expect(
      host.readAuthoritativeRow(exactRow, new AbortController().signal, () => undefined),
    ).resolves.toMatchObject({ row: exactRow, bytes: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.beta.example/api/p/token/download',
      expect.objectContaining({ method: 'GET' }),
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('Grpc-Metadata-Authorization')).toBe(
      'Bearer beta-token',
    );
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

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      {
        techCard: card(),
        orderSizeIds,
        sizeNameById,
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        sizeToken: 'M',
        authority,
      },
      controller.signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocker.code).toBe('saved-preparation-cancelled');
  });
});
