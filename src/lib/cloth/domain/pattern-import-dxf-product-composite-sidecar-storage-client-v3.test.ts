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
  it('holds the current GET, then rejects a replacement with zero PUTs', async () => {
    let releaseCurrentGet!: () => void;
    let current = true;
    const currentGet = new Promise<never>((_resolve, reject) => {
      releaseCurrentGet = () => reject(Object.assign(new Error('absent'), { status: 404 }));
    });
    const get = vi.fn().mockReturnValue(currentGet);
    const put = vi.fn();
    const beforeRequest = vi.fn(async () => {
      if (!current) throw new Error('host generation changed');
    });
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

    const inFlight = writer.persist(
      Object.freeze({ schemaVersion: REQUEST, currentAuthority: authority }),
      controller.signal,
    );
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    current = false;
    releaseCurrentGet();
    const result = await inFlight;

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
