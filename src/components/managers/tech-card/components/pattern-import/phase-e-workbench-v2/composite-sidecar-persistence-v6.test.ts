import { beforeEach, describe, expect, it, vi } from 'vitest';

const codec = vi.hoisted(() => ({
  decodeV5: vi.fn(),
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
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
  createPatternImportDxfProductCompositeSidecarPersistenceV6,
  type PatternImportDxfProductCompositeSidecarArrangementTargetV6,
} from './composite-sidecar-persistence-v6';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 } from './composite-sidecar-v6';

const encoder = new TextEncoder();
const hash = (character: string) => character.repeat(64);
const V5_BYTES = encoder.encode('{"fixture":"v5"}');
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
  } = {},
) {
  return {
    ok: true,
    owner: decodedOwner,
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

function request() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
    currentAuthority: authority,
    arrangementTarget: target,
    nextOwner,
  } as never;
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

describe('Composite V6 arrangement persistence', () => {
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
    codec.readV3Component.mockReturnValue(semanticBytes);
  });

  it('uses the generic fresh GET/CAS/PUT/dual-readback path for explicit Save', async () => {
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
        exactNestedV5BytesPreserved: false,
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
      claims: { exactNestedV5BytesPreserved: false },
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
