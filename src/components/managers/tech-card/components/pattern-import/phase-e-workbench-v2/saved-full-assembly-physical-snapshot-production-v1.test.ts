import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readBase: vi.fn(),
  projectBase: vi.fn(),
  disposeBase: vi.fn(),
  decodeV7: vi.fn(),
  verifyV7: vi.fn(),
  isAuthority: vi.fn(),
  disposeAuthority: vi.fn(),
  readInitialization: vi.fn(),
  decodeInitialization: vi.fn(),
}));

vi.mock('./saved-full-assembly-snapshot-production-v1', () => ({
  readSavedFullAssemblySnapshotV1: mocks.readBase,
  projectSavedFullAssemblySnapshotV1: mocks.projectBase,
  disposeSavedFullAssemblySnapshotV1: mocks.disposeBase,
}));

vi.mock('./composite-sidecar-v7', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composite-sidecar-v7')>()),
  decodePatternImportDxfProductCompositeSidecarV7: mocks.decodeV7,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority: mocks.verifyV7,
  isSavedFullAssemblyPhysicalAuthorityReceiptV1: mocks.isAuthority,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1: mocks.disposeAuthority,
}));

vi.mock('./saved-full-assembly-physical-component-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./saved-full-assembly-physical-component-v1')>()),
  readSavedFullAssemblyPhysicalInitializationBytesV1: mocks.readInitialization,
}));

vi.mock('lib/cloth/domain/dxf-garment-physical-initialization-v1', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('lib/cloth/domain/dxf-garment-physical-initialization-v1')
  >()),
  decodeDxfGarmentPhysicalInitializationV1: mocks.decodeInitialization,
}));

import {
  disposeSavedFullAssemblyPhysicalSnapshotV1,
  projectSavedFullAssemblyPhysicalSnapshotV1,
  readSavedFullAssemblyPhysicalSnapshotV1,
} from './saved-full-assembly-physical-snapshot-production-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 } from './composite-sidecar-v7';

const sha = (character: string) => character.repeat(64);
const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 4,
  cardLockVersion: 8,
  url: 'https://media.example.invalid/main.dxf',
  sizeBytes: 4_096,
  sha256: sha('a'),
});
const serverAssemblyRevision = `asm:v1:${'1'.repeat(32)}:4`;
const outerBytes = Uint8Array.of(1, 2, 3);
const graph = Object.freeze({ schemaVersion: 'graph' });
const physicalInitialization = Object.freeze({
  graphCanonicalSha256: sha('d'),
  compileInputSha256: sha('e'),
});
const physicalDocument = Object.freeze({
  graph,
  graphCanonicalSha256: sha('d'),
  compileInputSha256: sha('e'),
  physicalInitialization: Object.freeze({ canonicalSha256: sha('f') }),
});

function snapshot(snapshotSha256 = sha('b'), outerSha256 = sha('c')) {
  return {
    row,
    serverAssemblyRevision,
    operations: [],
    operationsPayloadCanonicalJson: '[]',
    seams: [],
    selectedTopologyReceipts: [],
    outer: {
      status: 'present' as const,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
      sha256: outerSha256,
      byteLength: outerBytes.byteLength,
      bytes: outerBytes,
      persistedCardLockVersion: row.cardLockVersion,
      persistedSavedRowRevision: row.revision,
      currentRowBound: true,
    },
    snapshotSha256,
    rpcReadCount: 3,
    claims: {},
  };
}

const request = Object.freeze({ row, seedOperationNumber: 10 });

beforeEach(() => {
  vi.clearAllMocks();
  const firstReceipt = Object.freeze({ id: 'first' });
  const confirmationReceipt = Object.freeze({ id: 'confirmation' });
  const projections = new Map<object, ReturnType<typeof snapshot>>([
    [firstReceipt, snapshot()],
    [confirmationReceipt, snapshot()],
  ]);
  mocks.readBase.mockResolvedValueOnce(firstReceipt).mockResolvedValueOnce(confirmationReceipt);
  mocks.projectBase.mockImplementation((receipt: object) => {
    const value = projections.get(receipt);
    if (!value) throw new TypeError('base receipt unavailable');
    return structuredClone(value);
  });
  const outerOwner = Object.freeze({ id: 'outer-owner' });
  mocks.decodeV7.mockResolvedValue({
    ok: true,
    owner: outerOwner,
    document: { bindings: { row, serverAssemblyRevision } },
    seal: { canonicalSha256: sha('c'), canonicalByteLength: outerBytes.byteLength },
    blockers: [],
  });
  const authorityReceipt = Object.freeze({ id: 'authority' });
  mocks.verifyV7.mockResolvedValue({
    ok: true,
    receipt: authorityReceipt,
    physicalOwner: Object.freeze({ id: 'physical-owner' }),
    physicalDocument,
    blocker: null,
  });
  mocks.isAuthority.mockImplementation((candidate) => candidate === authorityReceipt);
  mocks.readInitialization.mockReturnValue(Uint8Array.of(7, 8, 9));
  mocks.decodeInitialization.mockResolvedValue({
    document: physicalInitialization,
    canonicalSha256: sha('f'),
  });
});

describe('fixed Full Assembly physical snapshot production reader', () => {
  it('retains the genuine first snapshot receipt, verifies V7, and rereads after verification', async () => {
    const receipt = await readSavedFullAssemblyPhysicalSnapshotV1(request);
    expect(mocks.readBase).toHaveBeenCalledTimes(2);
    const firstReceipt = await mocks.readBase.mock.results[0]!.value;
    const confirmationReceipt = await mocks.readBase.mock.results[1]!.value;
    expect(mocks.verifyV7).toHaveBeenCalledWith(expect.any(Object), firstReceipt);
    expect(mocks.disposeBase).toHaveBeenCalledWith(confirmationReceipt);
    expect(mocks.disposeBase).not.toHaveBeenCalledWith(firstReceipt);
    const projected = projectSavedFullAssemblyPhysicalSnapshotV1(receipt);
    expect(projected).toMatchObject({
      row,
      seedOperationNumber: 10,
      serverAssemblyRevision,
      freshSnapshotSha256: sha('b'),
      graphCanonicalSha256: sha('d'),
      compileInputSha256: sha('e'),
      physicalInitializationCanonicalSha256: sha('f'),
      outer: { mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 },
    });
    expect(Object.isFrozen(projected)).toBe(true);
    disposeSavedFullAssemblyPhysicalSnapshotV1(receipt);
    expect(mocks.disposeAuthority).toHaveBeenCalledWith(projected.authorityReceipt);
    expect(mocks.disposeBase).toHaveBeenCalledWith(firstReceipt);
    expect(() => projectSavedFullAssemblyPhysicalSnapshotV1(receipt)).toThrow('unavailable');
  });

  it('rejects post-verification snapshot/outer drift and revokes borrowed authority', async () => {
    const firstReceipt = Object.freeze({ id: 'first-drift' });
    const confirmationReceipt = Object.freeze({ id: 'confirmation-drift' });
    const projections = new Map<object, ReturnType<typeof snapshot>>([
      [firstReceipt, snapshot()],
      [confirmationReceipt, snapshot(sha('9'), sha('8'))],
    ]);
    mocks.readBase
      .mockReset()
      .mockResolvedValueOnce(firstReceipt)
      .mockResolvedValueOnce(confirmationReceipt);
    mocks.projectBase.mockImplementation((receipt: object) =>
      structuredClone(projections.get(receipt)!),
    );
    await expect(readSavedFullAssemblyPhysicalSnapshotV1(request)).rejects.toThrow(
      'moved after physical verification',
    );
    expect(mocks.disposeAuthority).toHaveBeenCalledTimes(1);
    expect(mocks.disposeBase).toHaveBeenCalledWith(firstReceipt);
    expect(mocks.disposeBase).toHaveBeenCalledWith(confirmationReceipt);
  });

  it('requires a current V7 before physical verification', async () => {
    const firstReceipt = Object.freeze({ id: 'wrong-outer' });
    mocks.readBase.mockReset().mockResolvedValue(firstReceipt);
    mocks.projectBase.mockReturnValue({
      ...snapshot(),
      outer: { status: 'absent' },
    });
    await expect(readSavedFullAssemblyPhysicalSnapshotV1(request)).rejects.toThrow(
      'current Composite V7',
    );
    expect(mocks.verifyV7).not.toHaveBeenCalled();
  });

  it('revokes the retained snapshot and authority when the caller aborts', async () => {
    const controller = new AbortController();
    const receipt = await readSavedFullAssemblyPhysicalSnapshotV1(request, controller.signal);
    const projected = projectSavedFullAssemblyPhysicalSnapshotV1(receipt);
    const firstReceipt = await mocks.readBase.mock.results[0]!.value;
    controller.abort();
    expect(() => projectSavedFullAssemblyPhysicalSnapshotV1(receipt)).toThrow('unavailable');
    expect(mocks.disposeAuthority).toHaveBeenCalledWith(projected.authorityReceipt);
    expect(mocks.disposeBase).toHaveBeenCalledWith(firstReceipt);
  });
});
