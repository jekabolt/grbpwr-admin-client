import { describe, expect, it, vi } from 'vitest';

const decodeV6Mock = vi.hoisted(() => vi.fn());
const inspectPhysicalMock = vi.hoisted(() => vi.fn());
const decodePhysicalMock = vi.hoisted(() => vi.fn());
const projectSnapshotMock = vi.hoisted(() => vi.fn());
const disposeSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('./composite-sidecar-v6', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composite-sidecar-v6')>()),
  decodePatternImportDxfProductCompositeSidecarV6: decodeV6Mock,
}));
vi.mock('./saved-full-assembly-physical-component-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./saved-full-assembly-physical-component-v1')>()),
  inspectSavedFullAssemblyPhysicalComponentEnvelopeV1: inspectPhysicalMock,
  decodeSavedFullAssemblyPhysicalComponentV1: decodePhysicalMock,
}));
vi.mock('./saved-full-assembly-snapshot-production-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./saved-full-assembly-snapshot-production-v1')>()),
  projectSavedFullAssemblySnapshotV1: projectSnapshotMock,
  disposeSavedFullAssemblySnapshotV1: disposeSnapshotMock,
}));

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
  buildPatternImportDxfProductCompositeSidecarV7,
  decodePatternImportDxfProductCompositeSidecarV7,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1,
  encodePatternImportDxfProductCompositeSidecarV7,
  isSavedFullAssemblyPhysicalAuthorityReceiptV1,
  readPatternImportDxfProductCompositeComponentBytesV7,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority,
  type PatternImportDxfProductCompositeSidecarOwnerV7,
} from './composite-sidecar-v7';
import { SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1 } from './saved-full-assembly-physical-component-v1';
import type { SavedFullAssemblySnapshotProjectionV1 } from './saved-full-assembly-snapshot-production-v1';
import {
  disposeSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotReceiptV1,
} from './saved-full-assembly-snapshot-production-v1';
import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

const encoder = new TextEncoder();
const sha = (character: string) => character.repeat(64);
const V6_BYTES = encoder.encode('{"fixture":"exact-v6-bytes"}');
const PHYSICAL_BYTES = encoder.encode('{"fixture":"registered-fullgraph-component"}');
const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 4,
  cardLockVersion: 8,
  url: 'https://media.example.invalid/main.dxf',
  sizeBytes: 4096,
  sha256: sha('a'),
});
const bindings: PatternImportDxfProductCompositeSidecarBindingsV3 = Object.freeze({
  row,
  serverAssemblyRevision: 'asm:r4',
  assemblyTopologySha256: sha('b'),
});
const physicalDocument = Object.freeze({
  bindings: Object.freeze({ row, serverAssemblyRevision: 'asm:r4', aoContentSha256: sha('c') }),
});
const snapshot = Object.freeze({
  row,
  serverAssemblyRevision: 'asm:r4',
  operationsPayloadCanonicalJson: '[]',
  selectedTopologyReceipts: [],
  snapshotSha256: sha('9'),
  outer: Object.freeze({ status: 'absent' }),
}) as unknown as SavedFullAssemblySnapshotProjectionV1;
let activeSnapshot: SavedFullAssemblySnapshotProjectionV1 = snapshot;
const snapshotReceipt = Object.freeze({
  version: 'saved-full-assembly-snapshot/1',
  opaque: 'module-private-ao-read-receipt',
}) as SavedFullAssemblySnapshotReceiptV1;
let snapshotLive = true;

function acceptSnapshotReceipt() {
  snapshotLive = true;
  activeSnapshot = snapshot;
  projectSnapshotMock.mockImplementation((candidate) => {
    if (candidate !== snapshotReceipt || !snapshotLive) throw new Error('forged-receipt');
    return structuredClone(activeSnapshot);
  });
  disposeSnapshotMock.mockImplementation((candidate) => {
    if (candidate === snapshotReceipt) snapshotLive = false;
  });
}

function bindSnapshotToOwner(
  owner: PatternImportDxfProductCompositeSidecarOwnerV7,
  overrides: Record<string, unknown> = {},
) {
  const encoded = encodePatternImportDxfProductCompositeSidecarV7(owner);
  if (!encoded.ok) throw new Error('fixture owner could not be encoded');
  activeSnapshot = {
    ...snapshot,
    outer: {
      status: 'present',
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
      sha256: owner.seal.canonicalSha256,
      byteLength: encoded.canonicalByteLength,
      bytes: encoded.bytes,
      persistedCardLockVersion: row.cardLockVersion,
      persistedSavedRowRevision: row.revision,
      currentRowBound: true,
      ...overrides,
    },
  } as SavedFullAssemblySnapshotProjectionV1;
  return encoded.bytes;
}

function acceptStructural() {
  acceptSnapshotReceipt();
  decodeV6Mock.mockResolvedValue({
    ok: true,
    document: { bindings },
    blockers: [],
  });
  inspectPhysicalMock.mockResolvedValue({
    ok: true,
    document: physicalDocument,
    canonicalSha256: sha('d'),
    durableAuthority: false,
    blockers: [],
  });
}

async function build(outerBindings: PatternImportDxfProductCompositeSidecarBindingsV3 = bindings) {
  acceptStructural();
  return buildPatternImportDxfProductCompositeSidecarV7({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
    expectedPreviousSidecarSha256: sha('e'),
    bindings: outerBindings,
    compositeV6Bytes: V6_BYTES,
    fullAssemblyPhysicalBytes: PHYSICAL_BYTES,
  });
}

describe('Composite sidecar V7', () => {
  it('registers the fullgraph component after exact immutable V6 bytes', async () => {
    const first = await build();
    const second = await build();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const encoded = encodePatternImportDxfProductCompositeSidecarV7(first.owner);
    const encodedAgain = encodePatternImportDxfProductCompositeSidecarV7(second.owner);
    expect(encoded.ok).toBe(true);
    expect(encodedAgain.ok).toBe(true);
    if (!encoded.ok || !encodedAgain.ok) return;
    expect([...encoded.bytes]).toEqual([...encodedAgain.bytes]);
    expect(first.document.components.map(({ kind }) => kind)).toEqual(
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7.map(({ kind }) => kind),
    );
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV7(first.owner, 'composite-v6') ?? []),
    ]).toEqual([...V6_BYTES]);
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV7(
        first.owner,
        SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
      ) ?? []),
    ]).toEqual([...PHYSICAL_BYTES]);
  });

  it('preserves exact V6 while allowing the fullgraph transport anchor topology SHA to differ', async () => {
    const transportBindings = { ...bindings, assemblyTopologySha256: sha('f') };
    const result = await build(transportBindings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.bindings.assemblyTopologySha256).toBe(sha('f'));
    expect([
      ...(readPatternImportDxfProductCompositeComponentBytesV7(result.owner, 'composite-v6') ?? []),
    ]).toEqual([...V6_BYTES]);
  });

  it('rejects nested V6 saved-row or server revision drift', async () => {
    const result = await build({
      ...bindings,
      row: { ...row, patternLineKey: 'pattern-other' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blockers[0].code).toBe('component-binding-mismatch');
  });

  it('structurally unwraps V6 without AO read and never mints physical authority', async () => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductCompositeSidecarV7(built.owner);
    if (!encoded.ok) return;
    decodePhysicalMock.mockClear();
    acceptStructural();
    const decoded = await decodePatternImportDxfProductCompositeSidecarV7(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.fullAssemblyPhysicalEnvelope.durableAuthority).toBe(false);
    expect(decoded.claims.durableFullAssemblyPhysicalAuthorityVerified).toBe(false);
    expect(decoded.claims).toBe(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7);
    expect(decodePhysicalMock).not.toHaveBeenCalled();
  });

  it('requires a fresh full AO snapshot to mint an unforgeable physical authority receipt', async () => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const physicalOwner = Object.freeze({ canonicalSha256: sha('d') });
    decodePhysicalMock.mockResolvedValue({
      ok: true,
      owner: physicalOwner,
      document: physicalDocument,
      blockers: [],
    });
    bindSnapshotToOwner(built.owner);
    const expectedSnapshot = structuredClone(activeSnapshot);
    const verified = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      snapshotReceipt,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(isSavedFullAssemblyPhysicalAuthorityReceiptV1(verified.receipt)).toBe(true);
    expect(isSavedFullAssemblyPhysicalAuthorityReceiptV1({ ...verified.receipt })).toBe(false);
    expect(decodePhysicalMock).toHaveBeenCalledWith(expect.any(Uint8Array), expectedSnapshot);
    disposeSavedFullAssemblySnapshotV1(snapshotReceipt);
    expect(isSavedFullAssemblyPhysicalAuthorityReceiptV1(verified.receipt)).toBe(false);

    acceptSnapshotReceipt();
    bindSnapshotToOwner(built.owner);
    const verifiedAgain = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      snapshotReceipt,
    );
    expect(verifiedAgain.ok).toBe(true);
    if (!verifiedAgain.ok) return;
    disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(verifiedAgain.receipt);
    expect(isSavedFullAssemblyPhysicalAuthorityReceiptV1(verifiedAgain.receipt)).toBe(false);
    expect(() => projectSnapshotMock(snapshotReceipt)).not.toThrow();
  });

  it.each([
    ['absent', { status: 'absent' }],
    ['wrong media', { mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json' }],
    ['wrong SHA', { sha256: sha('0') }],
    ['wrong length', { byteLength: 1 }],
    ['wrong bytes', { bytes: encoder.encode('{"different":true}') }],
    ['not current-row bound', { currentRowBound: false }],
  ])('rejects a persisted outer with %s', async (_label, override) => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    decodePhysicalMock.mockClear();
    bindSnapshotToOwner(built.owner, override);
    if ('status' in override && override.status === 'absent')
      activeSnapshot = {
        ...snapshot,
        outer: { status: 'absent' },
      } as SavedFullAssemblySnapshotProjectionV1;
    const result = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      snapshotReceipt,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocker.code).toBe('persisted-outer-mismatch');
    expect(decodePhysicalMock).not.toHaveBeenCalled();
  });

  it('rejects the receipt when persisted outer identity moves during async physical decode', async () => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    bindSnapshotToOwner(built.owner);
    decodePhysicalMock.mockImplementation(async () => {
      activeSnapshot = {
        ...activeSnapshot,
        outer: { ...activeSnapshot.outer, sha256: sha('0') },
      } as SavedFullAssemblySnapshotProjectionV1;
      return {
        ok: true,
        owner: Object.freeze({ canonicalSha256: sha('d') }),
        document: physicalDocument,
        blockers: [],
      };
    });
    const result = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      snapshotReceipt,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocker.code).toBe('persisted-outer-mismatch');
  });

  it('rejects a fabricated projection DTO and a disposed snapshot receipt', async () => {
    const built = await build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    decodePhysicalMock.mockClear();
    const fabricated = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      // @ts-expect-error detached projection DTO is deliberately not a durable receipt
      snapshot,
    );
    expect(fabricated.ok).toBe(false);

    disposeSavedFullAssemblySnapshotV1(snapshotReceipt);
    const disposed = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      built.owner,
      snapshotReceipt,
    );
    expect(disposed.ok).toBe(false);
    expect(decodePhysicalMock).not.toHaveBeenCalled();
  });

  it('fails closed when the registered physical envelope names another saved row', async () => {
    decodeV6Mock.mockResolvedValue({ ok: true, document: { bindings }, blockers: [] });
    inspectPhysicalMock.mockResolvedValue({
      ok: true,
      document: {
        bindings: {
          ...physicalDocument.bindings,
          row: { ...row, patternLineKey: 'pattern-other' },
        },
      },
      canonicalSha256: sha('d'),
      durableAuthority: false,
      blockers: [],
    });
    const result = await buildPatternImportDxfProductCompositeSidecarV7({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
      expectedPreviousSidecarSha256: null,
      bindings,
      compositeV6Bytes: V6_BYTES,
      fullAssemblyPhysicalBytes: PHYSICAL_BYTES,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blockers[0].code).toBe('component-binding-mismatch');
  });
});
