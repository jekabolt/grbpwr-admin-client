import { describe, expect, it, vi } from 'vitest';

import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

const decodeV5Mock = vi.hoisted(() => vi.fn());

vi.mock('./composite-sidecar-v5', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composite-sidecar-v5')>()),
  decodePatternImportDxfProductCompositeSidecarV5: decodeV5Mock,
}));

import {
  createCadMannequinArrangementDocumentV1,
  encodeCadMannequinArrangementDocumentV1,
  type CadMannequinArrangementBindingsV1,
  type CadMannequinArrangementPieceV1,
} from './cad-mannequin-arrangement-document-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
  buildPatternImportDxfProductCompositeSidecarV6,
  decodePatternImportDxfProductCompositeSidecarV6,
  encodePatternImportDxfProductCompositeSidecarV6,
  readPatternImportDxfProductCompositeComponentBytesV6,
} from './composite-sidecar-v6';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hash = (character: string) => character.repeat(64);

const V5_BINDINGS: PatternImportDxfProductCompositeSidecarBindingsV3 = Object.freeze({
  row: Object.freeze({
    techCardId: 11,
    scopeKey: 'material:main',
    patternLineKey: 'pattern:main',
    revision: 3,
    cardLockVersion: 7,
    url: 'https://media.example.invalid/pants.dxf',
    sizeBytes: 4_096,
    sha256: hash('a'),
  }),
  serverAssemblyRevision: 'assembly-revision:91',
  assemblyTopologySha256: hash('b'),
});

const ARRANGEMENT_BINDINGS: CadMannequinArrangementBindingsV1 = Object.freeze({
  card: Object.freeze({ techCardId: 11, cardLockVersion: 7 }),
  scope: Object.freeze({
    scopeKey: 'material:main',
    patternLineKey: 'pattern:main',
    sizeToken: 'M',
  }),
  savedRow: Object.freeze({ revision: 3, dxfSha256: hash('a') }),
  source: Object.freeze({
    catalogCanonicalSha256: hash('c'),
    sizeSelectionCanonicalSha256: hash('d'),
  }),
  mannequin: Object.freeze({
    baseModelId: 42,
    modelFormRevisionKeyV1: '["model-form:edit",42,"Vera"]',
    poseBinding: Object.freeze({ canonicalKey: '{"schema":"pose-v2","arms":"rest"}' }),
  }),
});

const PIECE: CadMannequinArrangementPieceV1 = Object.freeze({
  pieceKey: 'material:main::front',
  scopeKey: 'material:main',
  pieceId: 'front',
  pieceLineKey: 'piece:front',
  transform: Object.freeze({
    offsetM: Object.freeze([0.12, 0.03, -0.04] as const),
    rotationRad: 0.4,
  }),
});

const V5_BYTES = encoder.encode('{"fixture":"canonical-v5-bytes"}');

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function bytesOf(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonical(value));
}

function arrangementBytes(
  bindings: CadMannequinArrangementBindingsV1 = ARRANGEMENT_BINDINGS,
): Uint8Array<ArrayBuffer> {
  const piece =
    PIECE.scopeKey === bindings.scope.scopeKey
      ? PIECE
      : { ...PIECE, scopeKey: bindings.scope.scopeKey };
  return encoder.encode(
    encodeCadMannequinArrangementDocumentV1(
      createCadMannequinArrangementDocumentV1({ bindings, pieces: [piece] }),
    ),
  );
}

function acceptV5(bindings: PatternImportDxfProductCompositeSidecarBindingsV3 = V5_BINDINGS) {
  decodeV5Mock.mockResolvedValue({
    ok: true,
    document: { bindings },
    blockers: [],
  });
}

async function build(
  activeArrangementBytes: Uint8Array<ArrayBuffer> = arrangementBytes(),
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3 = V5_BINDINGS,
) {
  acceptV5(bindings);
  return buildPatternImportDxfProductCompositeSidecarV6({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
    expectedPreviousSidecarSha256: hash('e'),
    compositeV5Bytes: V5_BYTES,
    mannequinArrangementBytes: activeArrangementBytes,
  });
}

describe('Composite sidecar V6', () => {
  it('preserves exact V5 and arrangement bytes in deterministic canonical component order', async () => {
    const first = await build();
    const second = await build();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstEncoded = encodePatternImportDxfProductCompositeSidecarV6(first.owner);
    const secondEncoded = encodePatternImportDxfProductCompositeSidecarV6(second.owner);
    expect(firstEncoded.ok).toBe(true);
    expect(secondEncoded.ok).toBe(true);
    if (!firstEncoded.ok || !secondEncoded.ok) return;

    expect([...firstEncoded.bytes]).toEqual([...secondEncoded.bytes]);
    expect(first.seal.canonicalSha256).toBe(second.seal.canonicalSha256);
    expect(first.document.components.map(({ kind }) => kind)).toEqual([
      'composite-v5',
      'cad-mannequin-arrangement-v1',
    ]);
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV6(first.owner, 'composite-v5') ?? []),
    ]).toEqual([...V5_BYTES]);
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV6(
        first.owner,
        'cad-mannequin-arrangement-v1',
      ) ?? []),
    ]).toEqual([...arrangementBytes()]);
    expect(first.claims).toBe(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6);
    expect(first.claims.dxfAuthorityAdded).toBe(false);
    expect(first.claims.assemblyOrderAuthorityAdded).toBe(false);
    expect(first.claims.clothAuthorityAdded).toBe(false);

    acceptV5();
    const decoded = await decodePatternImportDxfProductCompositeSidecarV6(firstEncoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.seal.canonicalSha256).toBe(first.seal.canonicalSha256);
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV6(decoded.owner, 'composite-v5') ??
        []),
    ]).toEqual([...V5_BYTES]);
  });

  it('fails closed for every exact V5-to-arrangement saved-row binding drift', async () => {
    const variants: CadMannequinArrangementBindingsV1[] = [
      { ...ARRANGEMENT_BINDINGS, card: { ...ARRANGEMENT_BINDINGS.card, techCardId: 12 } },
      { ...ARRANGEMENT_BINDINGS, card: { ...ARRANGEMENT_BINDINGS.card, cardLockVersion: 8 } },
      {
        ...ARRANGEMENT_BINDINGS,
        scope: { ...ARRANGEMENT_BINDINGS.scope, scopeKey: 'material:lining' },
      },
      {
        ...ARRANGEMENT_BINDINGS,
        scope: { ...ARRANGEMENT_BINDINGS.scope, patternLineKey: 'pattern:lining' },
      },
      { ...ARRANGEMENT_BINDINGS, savedRow: { ...ARRANGEMENT_BINDINGS.savedRow, revision: 4 } },
      {
        ...ARRANGEMENT_BINDINGS,
        savedRow: { ...ARRANGEMENT_BINDINGS.savedRow, dxfSha256: hash('f') },
      },
    ];

    for (const variant of variants) {
      const result = await build(arrangementBytes(variant));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.blockers[0].code).toBe('component-binding-mismatch');
      expect(result.blockers[0].field).toBe('components.cad-mannequin-arrangement-v1');
    }
  });

  it('keeps size, source hashes, model revision and pose arrangement-owned', async () => {
    const variants: CadMannequinArrangementBindingsV1[] = [
      { ...ARRANGEMENT_BINDINGS, scope: { ...ARRANGEMENT_BINDINGS.scope, sizeToken: 'L' } },
      {
        ...ARRANGEMENT_BINDINGS,
        source: { ...ARRANGEMENT_BINDINGS.source, catalogCanonicalSha256: hash('f') },
      },
      {
        ...ARRANGEMENT_BINDINGS,
        source: { ...ARRANGEMENT_BINDINGS.source, sizeSelectionCanonicalSha256: hash('f') },
      },
      {
        ...ARRANGEMENT_BINDINGS,
        mannequin: { ...ARRANGEMENT_BINDINGS.mannequin, baseModelId: 43 },
      },
      {
        ...ARRANGEMENT_BINDINGS,
        mannequin: { ...ARRANGEMENT_BINDINGS.mannequin, modelFormRevisionKeyV1: 'model:r2' },
      },
      {
        ...ARRANGEMENT_BINDINGS,
        mannequin: {
          ...ARRANGEMENT_BINDINGS.mannequin,
          poseBinding: { canonicalKey: 'pose:r2' },
        },
      },
    ];

    for (const variant of variants) {
      const result = await build(arrangementBytes(variant));
      expect(result.ok).toBe(true);
    }
  });

  it('rejects schema, authority, order, digest, claim and canonical-byte drift', async () => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductCompositeSidecarV6(built.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const document = JSON.parse(decoder.decode(encoded.bytes)) as Record<string, unknown>;
    const components = document.components as Record<string, unknown>[];

    acceptV5();
    const schemaChanged = await decodePatternImportDxfProductCompositeSidecarV6(
      bytesOf({ ...document, schemaVersion: 'future-v7' }),
    );
    expect(schemaChanged.ok).toBe(false);
    if (!schemaChanged.ok) expect(schemaChanged.blockers[0].code).toBe('unsupported-schema');

    const outerBindings = document.bindings as PatternImportDxfProductCompositeSidecarBindingsV3;
    acceptV5();
    const outerAuthorityChanged = await decodePatternImportDxfProductCompositeSidecarV6(
      bytesOf({
        ...document,
        bindings: {
          ...outerBindings,
          row: { ...outerBindings.row, revision: outerBindings.row.revision + 1 },
        },
      }),
    );
    expect(outerAuthorityChanged.ok).toBe(false);
    if (!outerAuthorityChanged.ok) {
      expect(outerAuthorityChanged.blockers[0].code).toBe('component-binding-mismatch');
      expect(outerAuthorityChanged.blockers[0].field).toBe('components.composite-v5');
    }

    acceptV5();
    const reordered = await decodePatternImportDxfProductCompositeSidecarV6(
      bytesOf({ ...document, components: [...components].reverse() }),
    );
    expect(reordered.ok).toBe(false);
    if (!reordered.ok) expect(reordered.blockers[0].code).toBe('component-order-mismatch');

    const changedBase64 = components.map((component, index) =>
      index === 0
        ? {
            ...component,
            base64: `${String(component.base64).startsWith('A') ? 'B' : 'A'}${String(
              component.base64,
            ).slice(1)}`,
          }
        : component,
    );
    acceptV5();
    const digestChanged = await decodePatternImportDxfProductCompositeSidecarV6(
      bytesOf({ ...document, components: changedBase64 }),
    );
    expect(digestChanged.ok).toBe(false);
    if (!digestChanged.ok) expect(digestChanged.blockers[0].code).toBe('component-digest-mismatch');

    acceptV5();
    const claimsChanged = await decodePatternImportDxfProductCompositeSidecarV6(
      bytesOf({
        ...document,
        claims: { ...(document.claims as Record<string, unknown>), clothAuthorityAdded: true },
      }),
    );
    expect(claimsChanged.ok).toBe(false);
    if (!claimsChanged.ok) expect(claimsChanged.blockers[0].field).toBe('document.claims');

    acceptV5();
    const noncanonical = await decodePatternImportDxfProductCompositeSidecarV6(
      encoder.encode(` ${decoder.decode(encoded.bytes)}`),
    );
    expect(noncanonical.ok).toBe(false);
    if (!noncanonical.ok) expect(noncanonical.blockers[0].code).toBe('noncanonical-bytes');
  });

  it('rejects request accessors and hidden or symbol fields without invoking them', async () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
        expectedPreviousSidecarSha256: null,
        mannequinArrangementBytes: arrangementBytes(),
      },
      'compositeV5Bytes',
      {
        enumerable: true,
        get() {
          getterCalls += 1;
          return V5_BYTES;
        },
      },
    );
    const accessorResult = await buildPatternImportDxfProductCompositeSidecarV6(accessor);
    expect(accessorResult.ok).toBe(false);
    expect(getterCalls).toBe(0);

    const symbol = Symbol('hidden-authority');
    const symbolResult = await buildPatternImportDxfProductCompositeSidecarV6({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
      expectedPreviousSidecarSha256: null,
      compositeV5Bytes: V5_BYTES,
      mannequinArrangementBytes: arrangementBytes(),
      [symbol]: true,
    });
    expect(symbolResult.ok).toBe(false);
    if (!symbolResult.ok) expect(symbolResult.blockers[0].code).toBe('invalid-input');

    const hidden = Object.defineProperty(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
        expectedPreviousSidecarSha256: null,
        compositeV5Bytes: V5_BYTES,
        mannequinArrangementBytes: arrangementBytes(),
      },
      'unexpected',
      { value: true, enumerable: false },
    );
    const hiddenResult = await buildPatternImportDxfProductCompositeSidecarV6(hidden);
    expect(hiddenResult.ok).toBe(false);
  });

  it('rejects noncanonical arrangement bytes and an unavailable SHA-256 implementation', async () => {
    const noncanonicalArrangement = encoder.encode(` ${decoder.decode(arrangementBytes())}`);
    const noncanonical = await build(noncanonicalArrangement);
    expect(noncanonical.ok).toBe(false);
    if (!noncanonical.ok) expect(noncanonical.blockers[0].code).toBe('noncanonical-bytes');

    acceptV5();
    const noCrypto = await buildPatternImportDxfProductCompositeSidecarV6(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
        expectedPreviousSidecarSha256: null,
        compositeV5Bytes: V5_BYTES,
        mannequinArrangementBytes: arrangementBytes(),
      },
      { subtle: undefined } as unknown as Pick<Crypto, 'subtle'>,
    );
    expect(noCrypto.ok).toBe(false);
    if (!noCrypto.ok) expect(noCrypto.blockers[0].code).toBe('sha256-unavailable');
  });
});
