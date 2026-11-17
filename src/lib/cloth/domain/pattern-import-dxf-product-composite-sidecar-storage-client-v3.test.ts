import { describe, expect, it, vi } from 'vitest';

import {
  createPatternImportDxfProductCompositeSidecarStorageWriterV3,
  type PatternImportDxfProductCompositeSidecarStorageServiceV3,
} from './pattern-import-dxf-product-composite-sidecar-storage-client-v3';

const REQUEST = 'test-composite-storage-request/1' as const;
const RECEIPT = 'test-composite-storage-receipt/1' as const;
const MEDIA_TYPE = 'application/vnd.grbpwr.test-composite.v1+json' as const;

const authority = Object.freeze({
  row: Object.freeze({
    techCardId: 156,
    scopeKey: 'MAIN',
    patternLineKey: 'pattern-main',
    revision: 7,
    cardLockVersion: 13,
    url: 'https://example.invalid/pattern.dxf',
    sizeBytes: 1234,
    sha256: 'a'.repeat(64),
  }),
  serverAssemblyRevision: 'asm:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:13',
  assemblyTopologySha256: 'b'.repeat(64),
});

describe('StorageWriterV3 pre-PUT currentness phase', () => {
  it('returns not-attempted and performs zero PUTs when beforeRequest fails closed', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('absent'), { status: 404 }));
    const put = vi.fn();
    const beforeRequest = vi.fn().mockRejectedValue(new Error('host generation changed'));
    const client = {
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    } as unknown as PatternImportDxfProductCompositeSidecarStorageServiceV3;
    const writer = createPatternImportDxfProductCompositeSidecarStorageWriterV3(
      { createClient: () => client, crypto },
      {
        requestSchemaVersion: REQUEST,
        receiptSchemaVersion: RECEIPT,
        mediaType: MEDIA_TYPE,
        acceptedCurrentMediaTypes: Object.freeze([]),
        label: 'Test composite',
        prepare: async (request, current) => {
          expect(current).toEqual({ status: 'absent', source: 'verified-get-absence' });
          return Object.freeze({
            authority: request.currentAuthority,
            transport: Object.freeze({
              patternVersion: 11,
              postSaveReceiptSha256: 'c'.repeat(64),
              selectedOperationNumber: 20,
            }),
            previousSidecarSha256: null,
            sidecarSha256: 'd'.repeat(64),
            byteLength: 1,
            bytes: new Uint8Array([1]),
            mediaType: MEDIA_TYPE,
          });
        },
        beforeRequest,
        verifyCanonical: async () => true,
      },
    );
    const controller = new AbortController();

    const result = await writer.persist(
      Object.freeze({ schemaVersion: REQUEST, currentAuthority: authority }),
      controller.signal,
    );

    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [
        {
          code: 'pre-put-blocked',
          phase: 'pre-put',
          detail: expect.stringContaining('host generation changed'),
        },
      ],
    });
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(beforeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: REQUEST }),
      expect.objectContaining({ sidecarSha256: 'd'.repeat(64) }),
      controller.signal,
    );
    expect(get).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });
});
