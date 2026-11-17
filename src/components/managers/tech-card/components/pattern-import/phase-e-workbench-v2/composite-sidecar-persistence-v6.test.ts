import { beforeEach, describe, expect, it, vi } from 'vitest';

const codec = vi.hoisted(() => ({
  decodeV5: vi.fn(),
  readV5Component: vi.fn(),
  decodeV6: vi.fn(),
  encodeV6: vi.fn(),
  readV6Component: vi.fn(),
  readV3Component: vi.fn(),
}));

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('./composite-sidecar-v5', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json',
  decodePatternImportDxfProductCompositeSidecarV5: codec.decodeV5,
  readPatternImportDxfProductCompositeComponentBytesV5: codec.readV5Component,
}));
vi.mock('./composite-sidecar-v6', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
  decodePatternImportDxfProductCompositeSidecarV6: codec.decodeV6,
  encodePatternImportDxfProductCompositeSidecarV6: codec.encodeV6,
  readPatternImportDxfProductCompositeComponentBytesV6: codec.readV6Component,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  readPatternImportDxfProductCompositeComponentBytesV3: codec.readV3Component,
}));

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
  createPatternImportDxfProductCompositeSidecarPersistenceV6,
  type PatternImportDxfProductCompositeSidecarArrangementTargetV6,
} from './composite-sidecar-persistence-v6';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 } from './composite-sidecar-v6';

const encoder = new TextEncoder();
const hash = (character: string) => character.repeat(64);
const V5_BYTES = encoder.encode('{"fixture":"v5"}');
const ANNOTATED_V5_BYTES = encoder.encode('{"fixture":"v5-annotations-changed"}');
const V4_BYTES = encoder.encode('{"fixture":"v4"}');
const CHANGED_V4_BYTES = encoder.encode('{"fixture":"v4-changed"}');
const ARRANGEMENT_BYTES = encoder.encode('{"fixture":"arrangement"}');
const CHANGED_ARRANGEMENT_BYTES = encoder.encode('{"fixture":"arrangement-changed"}');
const V5_SHA = 'c51b90f0e11ca020e391eb4d866f1f14e7a81b42fcad82af0b32ff68d4973639';
const V6_BYTES = encoder.encode('{"fixture":"v6"}');
const V6_SHA = '301d2ad0638b595dbae37b465668d813499cc4e3394f344a9181fe75ac8d3be1';
const semanticBytes = encoder.encode(
  JSON.stringify({
    schemaVersion: 'pattern-import-dxf-product-semantic-sidecar-document/1',
    mediaType: 'application/vnd.grbpwr.pattern-dxf-product-semantics.v1+json',
    encoding: 'canonical-json-utf8',
    product: {},
    mapping: {},
    persistence: {
      receiptVersion: 'receipt/1',
      receiptSealVersion: 'seal/1',
      receiptSealSha256: hash('d'),
      card: {},
      pattern: { lineKey: 'pattern:main', version: 4 },
      pieceLineKeys: [],
      aliases: [],
    },
  }),
);

const authority = Object.freeze({
  row: Object.freeze({
    techCardId: 11,
    scopeKey: 'material:main',
    patternLineKey: 'pattern:main',
    revision: 8,
    cardLockVersion: 301,
    url: 'https://media.example.invalid/pants.dxf',
    sizeBytes: 42,
    sha256: hash('a'),
  }),
  serverAssemblyRevision: 'assembly-revision:91',
  assemblyTopologySha256: hash('b'),
});

const target: PatternImportDxfProductCompositeSidecarArrangementTargetV6 = Object.freeze({
  sizeToken: 'M',
  catalogCanonicalSha256: hash('c'),
  sizeSelectionCanonicalSha256: hash('e'),
  baseModelId: 42,
  modelFormRevisionKeyV1: '["model-form:edit",42,"Vera"]',
  poseCanonicalKey: '{"schema":"pose-v2","arms":"rest"}',
});

const nextOwner = Object.freeze({ schemaVersion: 'opaque-v6-owner' });
const decodedOwner = Object.freeze({ verifiedV6: true });
const nestedV3Owner = Object.freeze({ verifiedV3: true });

function decodedV6(
  overrides: {
    expectedPreviousSidecarSha256?: string;
    arrangement?: Partial<typeof target>;
    owner?: object;
  } = {},
) {
  return {
    ok: true,
    owner: overrides.owner ?? decodedOwner,
    document: {
      bindings: authority,
      writeCas: {
        expectedPreviousSidecarSha256: overrides.expectedPreviousSidecarSha256 ?? V5_SHA,
      },
    },
    mannequinArrangement: {
      bindings: {
        card: {
          techCardId: authority.row.techCardId,
          cardLockVersion: authority.row.cardLockVersion,
        },
        scope: {
          scopeKey: authority.row.scopeKey,
          patternLineKey: authority.row.patternLineKey,
          sizeToken: overrides.arrangement?.sizeToken ?? target.sizeToken,
        },
        savedRow: { revision: authority.row.revision, dxfSha256: authority.row.sha256 },
        source: {
          catalogCanonicalSha256:
            overrides.arrangement?.catalogCanonicalSha256 ?? target.catalogCanonicalSha256,
          sizeSelectionCanonicalSha256:
            overrides.arrangement?.sizeSelectionCanonicalSha256 ??
            target.sizeSelectionCanonicalSha256,
        },
        mannequin: {
          baseModelId: overrides.arrangement?.baseModelId ?? target.baseModelId,
          modelFormRevisionKeyV1:
            overrides.arrangement?.modelFormRevisionKeyV1 ?? target.modelFormRevisionKeyV1,
          poseBinding: {
            canonicalKey: overrides.arrangement?.poseCanonicalKey ?? target.poseCanonicalKey,
          },
        },
      },
    },
    nestedCompositeV5: {
      nestedCompositeV4: {
        nestedCompositeV3: { owner: nestedV3Owner },
        exactNSeam: {
          carrier: { bindings: { selectedOperation: { sourceOperationNumber: 120 } } },
        },
      },
    },
    blockers: [],
  };
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function storedV5() {
  return {
    techCardId: authority.row.techCardId,
    patternLineKey: authority.row.patternLineKey,
    dxfSha256: authority.row.sha256,
    patternVersion: 4,
    sidecarSha256: V5_SHA,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    byteLength: V5_BYTES.byteLength,
    sidecarBytes: base64(V5_BYTES),
    postSaveReceiptSha256: hash('d'),
    cardLockVersion: authority.row.cardLockVersion,
    savedRowRevision: authority.row.revision,
  };
}

function storedV6(bytes = V6_BYTES) {
  return {
    ...storedV5(),
    sidecarSha256: V6_SHA,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
    byteLength: bytes.byteLength,
    sidecarBytes: base64(bytes),
  };
}

function request(transitionIntent: 'arrangement' | 'annotations' = 'arrangement') {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
    transitionIntent,
    currentAuthority: authority,
    arrangementTarget: target,
    nextOwner,
  } as never;
}

function restoreRequest() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6,
    currentAuthority: authority,
  } as const;
}

function rig(
  options: {
    gets?: unknown[];
    put?: ReturnType<typeof vi.fn>;
    decoded?: ReturnType<typeof decodedV6>;
    crypto?: Pick<Crypto, 'subtle'>;
  } = {},
) {
  const GetTechCardPatternSemanticSidecar = vi.fn();
  for (const value of options.gets ?? [
    { semanticSidecar: storedV5() },
    { semanticSidecar: storedV6() },
  ]) {
    GetTechCardPatternSemanticSidecar.mockResolvedValueOnce(value);
  }
  const PutTechCardPatternSemanticSidecar =
    options.put ?? vi.fn().mockResolvedValue({ semanticSidecar: storedV6() });
  const createClient = vi.fn(() => ({
    GetTechCardPatternSemanticSidecar,
    PutTechCardPatternSemanticSidecar,
  }));
  if (options.decoded) codec.decodeV6.mockResolvedValue(options.decoded);
  return {
    persistence: createPatternImportDxfProductCompositeSidecarPersistenceV6({
      createClient,
      crypto: options.crypto,
    }),
    GetTechCardPatternSemanticSidecar,
    PutTechCardPatternSemanticSidecar,
    createClient,
  };
}

function configureV6Transition(options: {
  nextNestedV5: Uint8Array;
  currentArrangement: Uint8Array;
  nextArrangement: Uint8Array;
  currentNestedV4?: Uint8Array;
  nextNestedV4?: Uint8Array;
}) {
  const currentV6Owner = Object.freeze({ currentV6: true });
  const nextV6Owner = Object.freeze({ nextV6: true });
  const currentV5Owner = Object.freeze({ currentV5: true });
  const nextV5Owner = Object.freeze({ nextV5: true });
  let decodeV6Calls = 0;
  codec.decodeV6.mockImplementation(async () => {
    decodeV6Calls += 1;
    return decodedV6({
      expectedPreviousSidecarSha256: V6_SHA,
      owner: decodeV6Calls === 2 ? currentV6Owner : nextV6Owner,
    });
  });
  codec.readV6Component.mockImplementation((owner: object, kind: string) => {
    if (owner === currentV6Owner) {
      return kind === 'composite-v5' ? V5_BYTES.slice() : options.currentArrangement.slice();
    }
    return kind === 'composite-v5' ? options.nextNestedV5.slice() : options.nextArrangement.slice();
  });
  codec.decodeV5.mockImplementation(async (bytes: Uint8Array) => ({
    ok: true,
    owner:
      bytes.byteLength === V5_BYTES.byteLength &&
      bytes.every((byte, index) => byte === V5_BYTES[index])
        ? currentV5Owner
        : nextV5Owner,
    document: { bindings: authority },
  }));
  codec.readV5Component.mockImplementation((owner: object) =>
    owner === currentV5Owner
      ? (options.currentNestedV4 ?? V4_BYTES).slice()
      : (options.nextNestedV4 ?? V4_BYTES).slice(),
  );
}

describe('Composite V6 two-lane persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codec.encodeV6.mockReturnValue({
      ok: true,
      bytes: V6_BYTES,
      canonicalSha256: V6_SHA,
      canonicalByteLength: V6_BYTES.byteLength,
    });
    codec.decodeV5.mockResolvedValue({ ok: true, document: { bindings: authority } });
    codec.decodeV6.mockResolvedValue(decodedV6());
    codec.readV6Component.mockReturnValue(V5_BYTES);
    codec.readV5Component.mockReturnValue(V4_BYTES);
    codec.readV3Component.mockReturnValue(semanticBytes);
  });

  describe('read-only restore', () => {
    it('restores verified V6 arrangement and nested V5 bytes through one fresh GET and no PUT', async () => {
      const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({
        ok: true,
        sidecarSha256: V6_SHA,
        canonicalByteLength: V6_BYTES.byteLength,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
        arrangement: decodedV6().mannequinArrangement,
        nestedCompositeV5: decodedV6().nestedCompositeV5,
        blocker: null,
        claims: {
          readOnly: true,
          putAllowed: false,
          futureOwnerRequired: false,
          futureArrangementTargetRequired: false,
          freshCurrentGet: true,
          exactCurrentAuthorityBound: true,
          storedBytesShaAndCanonicalV6Verified: true,
          nestedCompositeV5BytesReturned: true,
        },
      });
      expect(result.ok && result.nestedCompositeV5Bytes).toEqual(V5_BYTES);
      expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
      expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledWith({
        techCardId: authority.row.techCardId,
        patternLineKey: authority.row.patternLineKey,
      });
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('fails closed when the current sidecar is absent', async () => {
      const test = rig({ gets: [{}] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({
        ok: false,
        blocker: { code: 'readback-missing' },
        claims: {
          freshCurrentGet: false,
          exactCurrentAuthorityBound: false,
          storedBytesShaAndCanonicalV6Verified: false,
          nestedCompositeV5BytesReturned: false,
        },
      });
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects stored-row identity drift before decoding', async () => {
      const test = rig({
        gets: [
          {
            semanticSidecar: {
              ...storedV6(),
              savedRowRevision: authority.row.revision + 1,
            },
          },
        ],
      });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-drift' } });
      expect(codec.decodeV6).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects decoded full-authority drift that stored row metadata cannot express', async () => {
      const decoded = decodedV6();
      decoded.document.bindings = {
        ...authority,
        serverAssemblyRevision: 'assembly-revision:changed',
      } as never;
      const test = rig({ gets: [{ semanticSidecar: storedV6() }], decoded });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-drift' } });
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects a hostile row accessor without invoking its getter', async () => {
      const row = storedV6();
      let getterCalls = 0;
      Object.defineProperty(row, 'sidecarSha256', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return V6_SHA;
        },
      });
      const test = rig({ gets: [{ semanticSidecar: row }] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-invalid' } });
      expect(getterCalls).toBe(0);
      expect(codec.decodeV6).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects symbols and unexpected fields on the stored row', async () => {
      const row = { ...storedV6(), unexpected: 'field' };
      Object.defineProperty(row, Symbol('hostile'), { enumerable: true, value: 'symbol' });
      const test = rig({ gets: [{ semanticSidecar: row }] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-invalid' } });
      expect(codec.decodeV6).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('uses the immediate row snapshot when the caller mutates during digest', async () => {
      const row = storedV6();
      let digestCalls = 0;
      const digest = vi.fn(async (...args: Parameters<SubtleCrypto['digest']>) => {
        const value = await globalThis.crypto.subtle.digest(...args);
        digestCalls += 1;
        if (digestCalls === 2) {
          Object.assign(row, {
            sidecarSha256: hash('f'),
            patternVersion: 999,
            postSaveReceiptSha256: hash('f'),
          });
        }
        return value;
      });
      const test = rig({
        gets: [{ semanticSidecar: row }],
        crypto: { subtle: { digest } as unknown as SubtleCrypto },
      });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: true, sidecarSha256: V6_SHA });
      expect(row.sidecarSha256).toBe(hash('f'));
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('uses the immediate row snapshot when the caller mutates during decode', async () => {
      const row = storedV6();
      codec.decodeV6.mockImplementationOnce(async () => {
        Object.assign(row, {
          sidecarSha256: hash('f'),
          patternVersion: 999,
          postSaveReceiptSha256: hash('f'),
        });
        return decodedV6();
      });
      const test = rig({ gets: [{ semanticSidecar: row }] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: true, sidecarSha256: V6_SHA });
      expect(row.patternVersion).toBe(999);
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects a stored SHA that differs from the exact bytes', async () => {
      const test = rig({
        gets: [
          {
            semanticSidecar: {
              ...storedV6(),
              sidecarSha256: hash('f'),
            },
          },
        ],
      });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-invalid' } });
      expect(codec.decodeV6).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('rejects malformed or noncanonical V6 bytes reported by the strict decoder', async () => {
      codec.decodeV6.mockResolvedValue({
        ok: false,
        blockers: [
          {
            code: 'noncanonical-bytes',
            field: 'bytes',
            detail: 'Composite V6 bytes are not canonical.',
          },
        ],
      });
      const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

      const result = await test.persistence.restore(restoreRequest(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-drift' } });
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('does not dispatch GET when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

      const result = await test.persistence.restore(restoreRequest(), controller.signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'cancelled' } });
      expect(test.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('stops after GET when cancellation arrives with the response', async () => {
      const controller = new AbortController();
      const test = rig({ gets: [] });
      test.GetTechCardPatternSemanticSidecar.mockImplementationOnce(async () => {
        controller.abort();
        return { semanticSidecar: storedV6() };
      });

      const result = await test.persistence.restore(restoreRequest(), controller.signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'cancelled' } });
      expect(codec.decodeV6).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });

    it('does not publish restore success when cancellation arrives during decode', async () => {
      const controller = new AbortController();
      codec.decodeV6.mockImplementationOnce(async () => {
        controller.abort();
        return decodedV6();
      });
      const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

      const result = await test.persistence.restore(restoreRequest(), controller.signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'cancelled' } });
      expect(codec.readV6Component).not.toHaveBeenCalled();
      expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    });
  });

  it('permits an exact V5 to V6 arrangement transition through the fresh GET/CAS path', async () => {
    const test = rig();

    const result = await test.persistence.save(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledWith({
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
      expectedDxfSha256: authority.row.sha256,
      expectedPatternVersion: 4,
      expectedPostSaveReceiptSha256: hash('d'),
      expectedCardLockVersion: authority.row.cardLockVersion,
      expectedSavedRowRevision: authority.row.revision,
      expectedPreviousSidecarSha256: V5_SHA,
      expectedServerAssemblyRevision: authority.serverAssemblyRevision,
      expectedAssemblyTopologySha256: authority.assemblyTopologySha256,
      selectedOperationNumber: 120,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
      sidecarSha256: V6_SHA,
      sidecarBytes: base64(V6_BYTES),
    });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
  });

  it('permits an arrangement-only V6 transition while preserving exact nested V5 bytes', async () => {
    configureV6Transition({
      nextNestedV5: V5_BYTES,
      currentArrangement: ARRANGEMENT_BYTES,
      nextArrangement: CHANGED_ARRANGEMENT_BYTES,
    });
    const test = rig({
      gets: [{ semanticSidecar: storedV6() }, { semanticSidecar: storedV6() }],
      put: vi.fn().mockResolvedValue({ semanticSidecar: storedV6() }),
    });

    const result = await test.persistence.save(
      request('arrangement'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPreviousSidecarSha256: V6_SHA }),
    );
  });

  it('permits an annotation-only V6 transition with exact arrangement and nested V4 bytes', async () => {
    configureV6Transition({
      nextNestedV5: ANNOTATED_V5_BYTES,
      currentArrangement: ARRANGEMENT_BYTES,
      nextArrangement: ARRANGEMENT_BYTES,
    });
    const test = rig({
      gets: [{ semanticSidecar: storedV6() }, { semanticSidecar: storedV6() }],
      put: vi.fn().mockResolvedValue({ semanticSidecar: storedV6() }),
    });

    const result = await test.persistence.save(
      request('annotations'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
    expect(codec.readV5Component).toHaveBeenCalledTimes(2);
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
  });

  it('rejects an annotation transition that also changes arrangement bytes', async () => {
    configureV6Transition({
      nextNestedV5: ANNOTATED_V5_BYTES,
      currentArrangement: ARRANGEMENT_BYTES,
      nextArrangement: CHANGED_ARRANGEMENT_BYTES,
    });
    const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

    const result = await test.persistence.save(
      request('annotations'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects an annotation transition with nested V4 byte drift', async () => {
    configureV6Transition({
      nextNestedV5: ANNOTATED_V5_BYTES,
      currentArrangement: ARRANGEMENT_BYTES,
      nextArrangement: ARRANGEMENT_BYTES,
      nextNestedV4: CHANGED_V4_BYTES,
    });
    const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

    const result = await test.persistence.save(
      request('annotations'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects the annotations lane when the fresh current row is V5', async () => {
    const test = rig({ gets: [{ semanticSidecar: storedV5() }] });

    const result = await test.persistence.save(
      request('annotations'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects nested V5 drift in the arrangement lane', async () => {
    codec.readV6Component.mockImplementation((_owner: object, kind: string) =>
      kind === 'composite-v5' ? ANNOTATED_V5_BYTES : ARRANGEMENT_BYTES,
    );
    const test = rig({ gets: [{ semanticSidecar: storedV5() }] });

    const result = await test.persistence.save(
      request('arrangement'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects a corrupt current V6 before dispatching PUT', async () => {
    let decodeCalls = 0;
    codec.decodeV6.mockImplementation(async () => {
      decodeCalls += 1;
      if (decodeCalls === 2) return { ok: false, blockers: [{ detail: 'corrupt current V6' }] };
      return decodedV6({ expectedPreviousSidecarSha256: V6_SHA });
    });
    const test = rig({ gets: [{ semanticSidecar: storedV6() }] });

    const result = await test.persistence.save(
      request('arrangement'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects current V6 full-authority drift and an unaccepted current media type', async () => {
    let decodeCalls = 0;
    codec.decodeV6.mockImplementation(async () => {
      decodeCalls += 1;
      const decoded = decodedV6({ expectedPreviousSidecarSha256: V6_SHA });
      if (decodeCalls === 2) {
        decoded.document.bindings = {
          ...authority,
          serverAssemblyRevision: 'assembly-revision:drifted',
        } as never;
      }
      return decoded;
    });
    const authorityDrift = rig({ gets: [{ semanticSidecar: storedV6() }] });

    expect(
      await authorityDrift.persistence.save(request('arrangement'), new AbortController().signal),
    ).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(authorityDrift.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();

    codec.decodeV6.mockResolvedValue(decodedV6());
    const wrongMedia = rig({
      gets: [
        {
          semanticSidecar: {
            ...storedV5(),
            mediaType: 'application/octet-stream',
          },
        },
      ],
    });
    expect(
      await wrongMedia.persistence.save(request('arrangement'), new AbortController().signal),
    ).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(wrongMedia.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('uses the captured current V6 when the GET row mutates during current decode', async () => {
    const currentRow = storedV6();
    configureV6Transition({
      nextNestedV5: V5_BYTES,
      currentArrangement: ARRANGEMENT_BYTES,
      nextArrangement: CHANGED_ARRANGEMENT_BYTES,
    });
    const decode = codec.decodeV6.getMockImplementation();
    let decodeCalls = 0;
    codec.decodeV6.mockImplementation(async (...args: unknown[]) => {
      decodeCalls += 1;
      if (decodeCalls === 2) {
        Object.assign(currentRow, {
          sidecarSha256: hash('f'),
          sidecarBytes: base64(encoder.encode('mutated')),
          mediaType: 'application/octet-stream',
        });
      }
      return Reflect.apply(decode!, undefined, args);
    });
    const test = rig({
      gets: [{ semanticSidecar: currentRow }, { semanticSidecar: storedV6() }],
      put: vi.fn().mockResolvedValue({ semanticSidecar: storedV6() }),
    });

    const result = await test.persistence.save(
      request('arrangement'),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
    expect(currentRow.mediaType).toBe('application/octet-stream');
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
  });

  it('rejects an accessor transition intent without invoking its getter', async () => {
    const hostile = request() as unknown as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(hostile, 'transitionIntent', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'arrangement';
      },
    });
    const test = rig();

    const result = await test.persistence.save(hostile as never, new AbortController().signal);

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(getterCalls).toBe(0);
    expect(test.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('rejects accessor authority without invoking its getter or issuing transport', async () => {
    let getterCalls = 0;
    const hostileRow = { ...authority.row };
    Object.defineProperty(hostileRow, 'techCardId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return authority.row.techCardId;
      },
    });
    const test = rig();

    const result = await test.persistence.save(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
        transitionIntent: 'arrangement',
        currentAuthority: { ...authority, row: hostileRow },
        arrangementTarget: target,
        nextOwner,
      } as never,
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'readback-invalid' }],
    });
    expect(getterCalls).toBe(0);
    expect(test.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('uses an immutable authority snapshot when the caller mutates during the first GET', async () => {
    const mutableAuthority = structuredClone(authority);
    const mutableRequest = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
      transitionIntent: 'arrangement',
      currentAuthority: mutableAuthority,
      arrangementTarget: target,
      nextOwner,
    } as never;
    const test = rig();
    test.GetTechCardPatternSemanticSidecar.mockReset();
    test.GetTechCardPatternSemanticSidecar.mockImplementationOnce(async () => {
      Object.assign(mutableAuthority.row, {
        techCardId: 999,
        patternLineKey: 'pattern:mutated',
        sha256: hash('f'),
      });
      Object.assign(mutableAuthority, {
        serverAssemblyRevision: 'assembly-revision:mutated',
        assemblyTopologySha256: hash('f'),
      });
      return { semanticSidecar: storedV5() };
    }).mockResolvedValueOnce({ semanticSidecar: storedV6() });

    const result = await test.persistence.save(mutableRequest, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenNthCalledWith(1, {
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
    });
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledWith(
      expect.objectContaining({
        techCardId: authority.row.techCardId,
        patternLineKey: authority.row.patternLineKey,
        expectedDxfSha256: authority.row.sha256,
        expectedServerAssemblyRevision: authority.serverAssemblyRevision,
        expectedAssemblyTopologySha256: authority.assemblyTopologySha256,
      }),
    );
  });

  it('fails before PUT when the next V6 CAS is stale', async () => {
    const test = rig({ decoded: decodedV6({ expectedPreviousSidecarSha256: hash('f') }) });

    const result = await test.persistence.save(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('resolves an unknown PUT outcome only through an exact fresh V6 GET', async () => {
    const test = rig({
      gets: [{ semanticSidecar: storedV5() }, { semanticSidecar: storedV6() }],
      put: vi.fn().mockRejectedValue(new Error('connection dropped after commit')),
    });

    const result = await test.persistence.save(request(), new AbortController().signal);

    expect(result).toMatchObject({
      ok: true,
      writeOutcome: 'verified-after-unknown',
      receipt: { sidecarSha256: V6_SHA },
    });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
  });

  it('never performs recovery traffic after abort', async () => {
    const before = rig();
    const beforeAbort = new AbortController();
    beforeAbort.abort();
    expect(await before.persistence.save(request(), beforeAbort.signal)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'cancelled' }],
      claims: {
        genericSemanticSidecarRpcReused: false,
        freshCurrentGetBeforePut: false,
        exactNestedV5BytesPreservedOnArrangementTransition: false,
        currentAuthorityAndArrangementTargetBound: false,
        putEchoAndFreshGetVerified: false,
        unknownOutcomeFreshGetRecovery: false,
      },
    });
    expect(before.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();

    const duringAbort = new AbortController();
    const put = vi.fn().mockImplementation(async () => {
      duringAbort.abort();
      throw new Error('aborted after dispatch');
    });
    const during = rig({ gets: [{ semanticSidecar: storedV5() }], put });
    expect(await during.persistence.save(request(), duringAbort.signal)).toMatchObject({
      ok: false,
      writeOutcome: 'unknown',
      blockers: [{ code: 'cancelled' }],
    });
    expect(during.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
  });

  it('does not publish success when abort occurs during the final adapter decode', async () => {
    const controller = new AbortController();
    let decodeCalls = 0;
    codec.decodeV6.mockImplementation(async () => {
      decodeCalls += 1;
      if (decodeCalls === 4) {
        await Promise.resolve();
        controller.abort();
      }
      return decodedV6();
    });
    const test = rig();

    const result = await test.persistence.save(request(), controller.signal);

    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'acknowledged-unverified',
      blockers: [{ code: 'cancelled' }],
      claims: {
        putEchoAndFreshGetVerified: false,
        unknownOutcomeFreshGetRecovery: false,
      },
    });
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
  });

  it('rejects a SHA-256 provider that fails the known-answer self-test', async () => {
    const digest = vi.fn(async () => new Uint8Array(32).buffer);
    const test = rig({
      crypto: { subtle: { digest } as unknown as SubtleCrypto },
    });

    const result = await test.persistence.save(request(), new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      claims: { exactNestedV5BytesPreservedOnArrangementTransition: false },
    });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('recomputes encoded V6 bytes instead of trusting the encoder seal', async () => {
    const digest = vi.fn(async (...args: Parameters<SubtleCrypto['digest']>) => {
      const [algorithm, data] = args;
      const input =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (base64(input) === base64(V6_BYTES)) {
        return globalThis.crypto.subtle.digest(algorithm, V5_BYTES);
      }
      return globalThis.crypto.subtle.digest(algorithm, data);
    });
    const test = rig({
      crypto: { subtle: { digest } as unknown as SubtleCrypto },
    });

    const result = await test.persistence.save(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    expect(codec.decodeV6).not.toHaveBeenCalled();
  });

  it('returns cancelled when direct readback aborts during SHA-256', async () => {
    const controller = new AbortController();
    const digest = vi.fn(async (...args: Parameters<SubtleCrypto['digest']>) => {
      const result = await globalThis.crypto.subtle.digest(...args);
      controller.abort();
      return result;
    });
    const test = rig({
      gets: [{ semanticSidecar: storedV6() }],
      crypto: { subtle: { digest } as unknown as SubtleCrypto },
    });

    const result = await test.persistence.read(request(), controller.signal);

    expect(result).toMatchObject({ ok: false, blocker: { code: 'cancelled' } });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
    expect(codec.decodeV6).not.toHaveBeenCalled();
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('stops unknown-outcome recovery when abort occurs during V6 decode', async () => {
    const controller = new AbortController();
    let decodeCalls = 0;
    codec.decodeV6.mockImplementation(async () => {
      decodeCalls += 1;
      if (decodeCalls === 3) controller.abort();
      return decodedV6();
    });
    const test = rig({
      gets: [{ semanticSidecar: storedV5() }, { semanticSidecar: storedV6() }],
      put: vi.fn().mockRejectedValue(new Error('connection dropped after commit')),
    });

    const result = await test.persistence.save(request(), controller.signal);

    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'unknown',
      blockers: [{ code: 'cancelled' }],
    });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
    expect(codec.readV3Component).toHaveBeenCalledTimes(1);
  });

  it('rejects restore for every arrangement-owned source/model/pose drift', async () => {
    const variants: Partial<PatternImportDxfProductCompositeSidecarArrangementTargetV6>[] = [
      { sizeToken: 'L' },
      { catalogCanonicalSha256: hash('f') },
      { sizeSelectionCanonicalSha256: hash('f') },
      { baseModelId: 43 },
      { modelFormRevisionKeyV1: 'model:changed' },
      { poseCanonicalKey: 'pose:changed' },
    ];

    for (const arrangement of variants) {
      const test = rig({
        gets: [{ semanticSidecar: storedV6() }],
        decoded: decodedV6({ arrangement }),
      });

      const result = await test.persistence.read(request(), new AbortController().signal);

      expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-drift' } });
    }
  });

  it('rejects restore when row receipt metadata differs from nested semantic V1', async () => {
    const test = rig({
      gets: [
        {
          semanticSidecar: { ...storedV6(), patternVersion: 5 },
        },
      ],
    });

    const result = await test.persistence.read(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: false, blocker: { code: 'readback-drift' } });
  });
});
