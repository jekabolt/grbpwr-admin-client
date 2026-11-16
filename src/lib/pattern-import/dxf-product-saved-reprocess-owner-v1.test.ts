import { describe, expect, it, vi } from 'vitest';

import {
  createDxfProductSavedReprocessOwnerV1,
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
});
