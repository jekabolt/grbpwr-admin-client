import { describe, expect, it, vi } from 'vitest';

import {
  createDxfProductSavedReprocessOwnerV1,
  DxfProductSavedForeignDxfDetectedErrorV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedReprocessHostV1,
  type DxfProductSavedRowIdentityV1,
} from './dxf-product-saved-reprocess-owner-v1';

const row: DxfProductSavedRowIdentityV1 = Object.freeze({
  techCardId: 156,
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 13,
  url: 'https://objects.example/pattern-main.dxf',
  sizeBytes: 3,
  sha256: 'a'.repeat(64),
});

describe('saved DXF reprocess owner read failures', () => {
  it('keeps a safe transport reason in the saved-row-read blocker', async () => {
    const host: DxfProductSavedReprocessHostV1 = {
      readAuthoritativeRow: vi.fn(async () => {
        throw new Error('Saved DXF download failed with HTTP 401.');
      }),
      reprocess: vi.fn(async () => {
        throw new Error('Reprocess must not start after a row-read failure.');
      }),
      readCurrentRowIdentity: vi.fn(async () => row),
    };
    const owner = createDxfProductSavedReprocessOwnerV1(host);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row,
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [
        {
          code: 'saved-row-read-failed',
          detail: expect.stringMatching(/authoritative saved DXF row could not be read.*HTTP 401/i),
        },
      ],
    });
    expect(host.reprocess).not.toHaveBeenCalled();
    owner.dispose();
  });

  it('publishes the typed foreign-DXF blocker only for the dedicated manifest-absent signal', async () => {
    const host: DxfProductSavedReprocessHostV1 = {
      crypto: {
        subtle: {
          digest: vi.fn(async () => Uint8Array.from({ length: 32 }, () => 0xaa).buffer),
        },
      } as unknown as Pick<Crypto, 'subtle'>,
      readAuthoritativeRow: vi.fn(async () => ({ row, bytes: new Uint8Array([1, 2, 3]) })),
      reprocess: vi.fn(async () => {
        throw new DxfProductSavedForeignDxfDetectedErrorV1();
      }),
      readCurrentRowIdentity: vi.fn(async () => row),
    };
    const owner = createDxfProductSavedReprocessOwnerV1(host);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row,
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: 'foreign-saved-dxf-detected' }],
    });
    expect(host.readCurrentRowIdentity).not.toHaveBeenCalled();
    owner.dispose();
  });

  it('keeps every untyped reprocessor error on the exact failure path', async () => {
    const host: DxfProductSavedReprocessHostV1 = {
      crypto: {
        subtle: {
          digest: vi.fn(async () => Uint8Array.from({ length: 32 }, () => 0xaa).buffer),
        },
      } as unknown as Pick<Crypto, 'subtle'>,
      readAuthoritativeRow: vi.fn(async () => ({ row, bytes: new Uint8Array([1, 2, 3]) })),
      reprocess: vi.fn(async () => {
        throw new Error('corrupt manifest');
      }),
      readCurrentRowIdentity: vi.fn(async () => row),
    };
    const owner = createDxfProductSavedReprocessOwnerV1(host);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row,
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: 'saved-dxf-reprocess-failed' }],
    });
    expect(host.readCurrentRowIdentity).not.toHaveBeenCalled();
    owner.dispose();
  });
});
