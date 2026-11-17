import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  dispose: vi.fn(),
  decodeV4: vi.fn(),
  decodeV5: vi.fn(),
  decodeV6: vi.fn(),
  decodeV7: vi.fn(),
  buildV7: vi.fn(),
  encodeV7: vi.fn(),
  readV7Component: vi.fn(),
  buildV5: vi.fn(),
  buildV6: vi.fn(),
  encodeV6: vi.fn(),
  readV6Component: vi.fn(),
  saveV5: vi.fn(),
  saveV6: vi.fn(),
  saveV7: vi.fn(),
  annotations: vi.fn(),
  nestedBytes: new Uint8Array([5, 1, 2]),
}));
vi.mock('./saved-full-assembly-snapshot-production-v1', () => ({
  readSavedFullAssemblySnapshotV1: mocks.read,
  projectSavedFullAssemblySnapshotV1: (value: unknown) => value,
  disposeSavedFullAssemblySnapshotV1: mocks.dispose,
}));
vi.mock('./composite-sidecar-v4', () => ({
  decodePatternImportDxfProductCompositeSidecarV4: mocks.decodeV4,
}));
vi.mock('./composite-sidecar-v5', () => ({
  buildPatternImportDxfProductCompositeSidecarV5: mocks.buildV5,
  decodePatternImportDxfProductCompositeSidecarV5: mocks.decodeV5,
  derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1: (
    authority: unknown,
    source: unknown,
  ) => ({ authority, source }),
  encodePatternImportDxfPhaseETopologyAnnotationsV1: mocks.annotations,
  PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1: 'annotations',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5: 'v5',
}));
vi.mock('./composite-sidecar-v6', () => ({
  buildPatternImportDxfProductCompositeSidecarV6: mocks.buildV6,
  decodePatternImportDxfProductCompositeSidecarV6: mocks.decodeV6,
  encodePatternImportDxfProductCompositeSidecarV6: mocks.encodeV6,
  readPatternImportDxfProductCompositeComponentBytesV6: mocks.readV6Component,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6: 'v6',
}));
vi.mock('./composite-sidecar-v7', () => ({
  buildPatternImportDxfProductCompositeSidecarV7: mocks.buildV7,
  decodePatternImportDxfProductCompositeSidecarV7: mocks.decodeV7,
  encodePatternImportDxfProductCompositeSidecarV7: mocks.encodeV7,
  readPatternImportDxfProductCompositeComponentBytesV7: mocks.readV7Component,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7: 'v7',
}));
vi.mock('./composite-sidecar-persistence-v5', () => ({
  createPatternImportDxfProductCompositeSidecarProductionPersistenceV5: () => ({
    adapter: { persist: mocks.saveV5 },
  }),
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5: 'store-v5',
}));
vi.mock('./composite-sidecar-persistence-v6', () => ({
  createPatternImportDxfProductCompositeSidecarProductionPersistenceV6: () => ({
    save: mocks.saveV6,
  }),
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6: 'store-v6',
}));
vi.mock('./composite-sidecar-persistence-v7', () => ({
  createPatternImportDxfProductCompositeSidecarProductionArrangementStorageAdapterV7: () => ({
    persist: mocks.saveV7,
  }),
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7: 'store-v7',
}));

import {
  readSavedCadMannequinArrangementV1,
  readSavedCadMannequinModelIdV1,
  saveSavedCadMannequinArrangementV1,
  type SavedCadMannequinArrangementSaveRequestV1,
} from './saved-cad-mannequin-arrangement-production-v1';
import { createCadMannequinArrangementDocumentV1 } from './cad-mannequin-arrangement-document-v1';
import type { CadWorkbenchMannequinArrangementSaveV1 } from './cad-workbench-physical-host-v1';

const row = {
  techCardId: 11,
  cardLockVersion: 7,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 3,
  sha256: 'a'.repeat(64),
  url: 'https://example.com/pattern.dxf',
  sizeBytes: 42,
};
function request(): SavedCadMannequinArrangementSaveRequestV1 {
  return {
    row,
    seedOperationNumber: 30,
    source: { identity: 'saved-pattern-main', revision: '3', sha256: row.sha256 },
    arrangement: {
      bindings: {
        card: { techCardId: 11, cardLockVersion: 7 },
        scope: { scopeKey: 'main', patternLineKey: 'pattern-main', sizeToken: 'M' },
        savedRow: { revision: 3, dxfSha256: row.sha256 },
        source: {
          catalogCanonicalSha256: 'b'.repeat(64),
          sizeSelectionCanonicalSha256: 'c'.repeat(64),
        },
        mannequin: {
          baseModelId: 42,
          modelFormRevisionKeyV1: 'current-model-revision',
          poseBinding: { canonicalKey: 'saved-pose' },
        },
      },
      pieces: [
        {
          pieceKey: 'main:front:piece-front',
          scopeKey: 'main',
          pieceId: 'front',
          pieceLineKey: 'piece-front',
          transform: { offsetM: [0.1, 0, 0], rotationRad: 0.4 },
        },
      ],
    },
  };
}
function snapshot(version: number, hash = 'prior') {
  return {
    serverAssemblyRevision: 'current-assembly',
    outer: {
      status: 'present',
      currentRowBound: true,
      mediaType: `application/vnd.grbpwr.pattern-dxf-product-composite.v${version}+json`,
      sha256: hash,
      bytes: new Uint8Array([version, 8, 9]),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  const decoded = {
    ok: true,
    owner: {},
    document: { bindings: { row, serverAssemblyRevision: 'current-assembly' } },
  };
  mocks.decodeV4.mockResolvedValue(decoded);
  mocks.decodeV5.mockResolvedValue(decoded);
  mocks.decodeV6.mockResolvedValue(decoded);
  mocks.readV6Component.mockImplementation((_owner, kind) =>
    kind === 'composite-v5' ? mocks.nestedBytes : new Uint8Array([8]),
  );
  mocks.buildV5.mockResolvedValue({ ok: true, owner: { v: 5 } });
  mocks.buildV6.mockResolvedValue({ ok: true, owner: { v: 6 } });
  mocks.encodeV6.mockReturnValue({ ok: true, bytes: new Uint8Array([6, 9]) });
  mocks.buildV7.mockResolvedValue({ ok: true, owner: { v: 7 } });
  mocks.encodeV7.mockReturnValue({
    ok: true,
    bytes: new Uint8Array([7, 9]),
    canonicalSha256: 'saved-v7',
    canonicalByteLength: 2,
  });
  mocks.annotations.mockResolvedValue({ ok: true, bytes: new Uint8Array([9]) });
  mocks.saveV5.mockResolvedValue({ ok: true, receipt: { sidecarSha256: 'saved-v5' } });
  mocks.saveV6.mockResolvedValue({ ok: true, receipt: { sidecarSha256: 'saved-v6' } });
  mocks.saveV7.mockResolvedValue({ ok: true, receipt: { sidecarSha256: 'saved-v7' } });
});

describe('explicit production mannequin arrangement transaction', () => {
  it('preserves current V5 bytes and actual user transforms without rewriting annotations', async () => {
    const current = snapshot(5);
    mocks.read.mockResolvedValue(current);
    await saveSavedCadMannequinArrangementV1(request(), new AbortController().signal);
    expect(mocks.buildV6.mock.calls[0][0].compositeV5Bytes).toEqual(current.outer.bytes);
    const bytes = mocks.buildV6.mock.calls[0][0].mannequinArrangementBytes;
    expect(JSON.parse(new TextDecoder().decode(bytes)).pieces[0].transform).toEqual({
      offsetM: [0.1, 0, 0],
      rotationRad: 0.4,
    });
    expect(mocks.annotations).not.toHaveBeenCalled();
    expect(mocks.saveV5).not.toHaveBeenCalled();
    expect(mocks.saveV6).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
  it('adds empty annotations only for V4 and requires fresh verified V5 before V6', async () => {
    mocks.read.mockResolvedValueOnce(snapshot(4)).mockResolvedValueOnce(snapshot(5, 'saved-v5'));
    await saveSavedCadMannequinArrangementV1(request(), new AbortController().signal);
    expect(mocks.annotations.mock.calls[0][0]).toMatchObject({ measurements: [], callouts: [] });
    expect(mocks.saveV5).toHaveBeenCalledOnce();
    expect(mocks.saveV6).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it('does not continue to V6 after an intervening V5 change', async () => {
    mocks.read
      .mockResolvedValueOnce(snapshot(4))
      .mockResolvedValueOnce(snapshot(5, 'foreign-write'));
    await expect(
      saveSavedCadMannequinArrangementV1(request(), new AbortController().signal),
    ).rejects.toThrow('changed before arrangement save');
    expect(mocks.saveV6).not.toHaveBeenCalled();
  });
  it('requires the exact annotation source before upgrading V4', async () => {
    mocks.read.mockResolvedValue(snapshot(4));
    await expect(
      saveSavedCadMannequinArrangementV1(
        { ...request(), source: undefined },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Prepare the current exact source');
    expect(mocks.saveV5).not.toHaveBeenCalled();
    expect(mocks.saveV6).not.toHaveBeenCalled();
  });
  it('preserves nested V5 when updating V6 and rewraps V7 without changing physical bytes', async () => {
    mocks.read.mockResolvedValue(snapshot(6));
    await saveSavedCadMannequinArrangementV1(request(), new AbortController().signal);
    expect(mocks.buildV6.mock.calls[0][0].compositeV5Bytes).toEqual(mocks.nestedBytes);
    mocks.saveV6.mockClear();
    mocks.buildV6.mockClear();
    const topologySha = 'd'.repeat(64);
    const currentOwner = { id: 'current-v7' };
    const verifiedOwner = { id: 'verified-v7' };
    const currentV6Owner = { id: 'current-v6' };
    const verifiedV6Owner = { id: 'verified-v6' };
    const currentV6Bytes = new Uint8Array([6, 1]);
    const verifiedV6Bytes = new Uint8Array([6, 9]);
    const physicalBytes = new Uint8Array([4, 4, 4]);
    const initial = {
      ...snapshot(7),
      operations: [{ operationNumber: 20, seamKeys: ['side-seam'] }],
      selectedTopologyReceipts: [{ sourceOperationNumber: 20, sha256: topologySha }],
    };
    const reloaded = {
      ...snapshot(7, 'saved-v7'),
      operations: initial.operations,
      selectedTopologyReceipts: initial.selectedTopologyReceipts,
    };
    mocks.read.mockResolvedValueOnce(initial).mockResolvedValueOnce(reloaded);
    const bindings = {
      row,
      serverAssemblyRevision: 'current-assembly',
      assemblyTopologySha256: topologySha,
    };
    const graph = {
      operations: [
        {
          kind: 'stitch',
          sourceOperationNumber: 20,
          clientOperationId: 'operation-20',
          seamIds: ['seam-20'],
        },
      ],
      seams: [
        {
          id: 'seam-20',
          clientOperationId: 'operation-20',
          sourceSeamKey: 'side-seam',
        },
      ],
    };
    mocks.decodeV7
      .mockResolvedValueOnce({
        ok: true,
        owner: currentOwner,
        document: { bindings },
        fullAssemblyPhysicalEnvelope: { document: { graph } },
      })
      .mockResolvedValueOnce({ ok: true, owner: verifiedOwner });
    mocks.readV7Component.mockImplementation((owner, kind) => {
      if (kind === 'composite-v6') return owner === currentOwner ? currentV6Bytes : verifiedV6Bytes;
      return physicalBytes.slice();
    });
    const decoded = {
      ok: true,
      document: { bindings: { row, serverAssemblyRevision: 'current-assembly' } },
    };
    mocks.decodeV6
      .mockResolvedValueOnce({ ...decoded, owner: currentV6Owner })
      .mockResolvedValueOnce({ ...decoded, owner: verifiedV6Owner });
    mocks.readV6Component.mockImplementation((owner, kind) => {
      if (kind === 'composite-v5') return mocks.nestedBytes;
      if (owner === verifiedV6Owner)
        return mocks.buildV6.mock.calls[0][0].mannequinArrangementBytes;
      return new Uint8Array([8]);
    });
    mocks.buildV6.mockResolvedValue({ ok: true, owner: { v: 6 } });
    mocks.encodeV6.mockReturnValue({ ok: true, bytes: verifiedV6Bytes });
    mocks.buildV7.mockResolvedValue({ ok: true, owner: { v: 7 } });
    await saveSavedCadMannequinArrangementV1(request(), new AbortController().signal);
    expect(mocks.buildV7.mock.calls[0][0]).toMatchObject({
      expectedPreviousSidecarSha256: 'prior',
      bindings,
      compositeV6Bytes: verifiedV6Bytes,
      fullAssemblyPhysicalBytes: physicalBytes,
    });
    expect(mocks.saveV7).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionIntent: 'arrangement',
        currentAuthority: bindings,
        transportAnchor: { sourceOperationNumber: 20, serverTopologySha256: topologySha },
      }),
      expect.any(AbortSignal),
    );
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(mocks.saveV6).not.toHaveBeenCalled();
  });

  it('fails V7 save when fresh readback does not preserve the physical component', async () => {
    const topologySha = 'd'.repeat(64);
    const currentOwner = { id: 'current-v7' };
    const verifiedOwner = { id: 'verified-v7' };
    const initial = {
      ...snapshot(7),
      operations: [{ operationNumber: 20, seamKeys: ['side-seam'] }],
      selectedTopologyReceipts: [{ sourceOperationNumber: 20, sha256: topologySha }],
    };
    mocks.read.mockResolvedValueOnce(initial).mockResolvedValueOnce({
      ...initial,
      outer: { ...initial.outer, sha256: 'saved-v7', bytes: new Uint8Array([7, 9]) },
    });
    const bindings = {
      row,
      serverAssemblyRevision: 'current-assembly',
      assemblyTopologySha256: topologySha,
    };
    mocks.decodeV7
      .mockResolvedValueOnce({
        ok: true,
        owner: currentOwner,
        document: { bindings },
        fullAssemblyPhysicalEnvelope: {
          document: {
            graph: {
              operations: [
                {
                  kind: 'stitch',
                  sourceOperationNumber: 20,
                  clientOperationId: 'operation-20',
                  seamIds: ['seam-20'],
                },
              ],
              seams: [
                {
                  id: 'seam-20',
                  clientOperationId: 'operation-20',
                  sourceSeamKey: 'side-seam',
                },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, owner: verifiedOwner });
    mocks.readV7Component.mockImplementation((owner, kind) => {
      if (kind === 'composite-v6') return new Uint8Array([6, owner === currentOwner ? 1 : 9]);
      return new Uint8Array([owner === currentOwner ? 4 : 3]);
    });
    mocks.decodeV6.mockResolvedValue({
      ok: true,
      owner: {},
      document: { bindings: { row, serverAssemblyRevision: 'current-assembly' } },
    });
    await expect(
      saveSavedCadMannequinArrangementV1(request(), new AbortController().signal),
    ).rejects.toThrow('did not preserve physical initialization');
  });
  it('rejects foreign arrangement bindings before any read or partial V5 write', async () => {
    const input = request();
    await expect(
      saveSavedCadMannequinArrangementV1(
        { ...input, row: { ...row, revision: 4 } },
        new AbortController().signal,
      ),
    ).rejects.toThrow('another saved DXF revision');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.saveV5).not.toHaveBeenCalled();
  });
});

describe('saved arrangement hydration', () => {
  function hydration(savedRow = row, serverAssemblyRevision = 'current-assembly') {
    const input = request();
    const document = createCadMannequinArrangementDocumentV1(input.arrangement);
    const decoded = {
      ok: true,
      document: { bindings: { row: savedRow, serverAssemblyRevision } },
      mannequinArrangement: document,
    };
    mocks.decodeV6.mockResolvedValue(decoded);
    mocks.decodeV7.mockResolvedValue({ ok: true, nestedCompositeV6: decoded });
    const expected: Omit<CadWorkbenchMannequinArrangementSaveV1, 'pieces'> = {
      scopeKey: 'main',
      mannequin: input.arrangement.bindings.mannequin,
      projection: {
        schemaVersion: 'pattern-import-dxf-product-phase-e-assembly-projection/1',
        expectedCatalogCanonicalSha256: 'b'.repeat(64),
        sizeSelectionCanonicalSha256: 'c'.repeat(64),
        sourceFileId: 'saved-pattern-main',
        sizeToken: 'M',
        joinMode: 'catalog-ordinal-to-phase-d-point',
        geometryPlacementApplied: false,
        pieces: [
          {
            pieceId: 'front',
            pieceLineKey: 'piece-front',
            contours: [],
            cameraMm: { minX: 0, minY: 0, maxX: 1, maxY: 1, padding: 0 },
          },
        ],
      },
    };
    return { row, seedOperationNumber: 30, expected };
  }
  it.each([6, 7])(
    'restores exact presentation transforms from V%i without writes',
    async (version) => {
      const input = hydration();
      mocks.read.mockResolvedValue(snapshot(version));
      const result = await readSavedCadMannequinArrangementV1(input, new AbortController().signal);
      expect(result?.[0].transform).toEqual({ offsetM: [0.1, 0, 0], rotationRad: 0.4 });
      expect(mocks.saveV6).not.toHaveBeenCalled();
      expect(mocks.saveV5).not.toHaveBeenCalled();
    },
  );
  it.each([6, 7])('reads only the current saved model ID from V%i', async (version) => {
    hydration();
    mocks.read.mockResolvedValue(snapshot(version));
    const expected = { row, seedOperationNumber: 30 };
    const signal = new AbortController().signal;
    await expect(readSavedCadMannequinModelIdV1(expected, signal)).resolves.toBe(42);
    expect(mocks.read).toHaveBeenCalledWith(expected, signal);
    expect(mocks.saveV5).not.toHaveBeenCalled();
    expect(mocks.saveV6).not.toHaveBeenCalled();
    expect(mocks.saveV7).not.toHaveBeenCalled();
  });
  it.each([
    ['saved revision', { ...row, revision: row.revision - 1 }, 'current-assembly'],
    ['scope', { ...row, scopeKey: 'lining' }, 'current-assembly'],
    ['DXF hash', { ...row, sha256: 'f'.repeat(64) }, 'current-assembly'],
    ['Assembly revision', row, 'old-assembly'],
  ])('refuses a model hint with stale %s', async (_label, savedRow, assemblyRevision) => {
    hydration(savedRow, assemblyRevision);
    mocks.read.mockResolvedValue(snapshot(7));
    await expect(
      readSavedCadMannequinModelIdV1(
        { row, seedOperationNumber: 30 },
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
  });
  it('does not decode arrangements for an outdated card lock or a cancelled selection', async () => {
    hydration();
    const stale = snapshot(6);
    stale.outer.currentRowBound = false;
    mocks.read.mockResolvedValue(stale);
    const request = { row, seedOperationNumber: 30 };
    const controller = new AbortController();
    await expect(readSavedCadMannequinModelIdV1(request, controller.signal)).resolves.toBeNull();
    controller.abort();
    await expect(readSavedCadMannequinModelIdV1(request, controller.signal)).resolves.toBeNull();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.decodeV6).not.toHaveBeenCalled();
  });
  it('does not hydrate a different pose or piece set', async () => {
    const input = hydration();
    mocks.read.mockResolvedValue(snapshot(6));
    expect(
      await readSavedCadMannequinArrangementV1(
        {
          ...input,
          expected: {
            ...input.expected,
            mannequin: {
              ...input.expected.mannequin,
              poseBinding: { canonicalKey: 'changed-pose' },
            },
          },
        },
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(
      await readSavedCadMannequinArrangementV1(
        {
          ...input,
          expected: { ...input.expected, projection: { ...input.expected.projection, pieces: [] } },
        },
        new AbortController().signal,
      ),
    ).toBeNull();
  });
  it('leaves absent and stale arrangements empty without a write', async () => {
    const input = hydration();
    mocks.read.mockResolvedValue({ outer: { status: 'absent' } });
    expect(
      await readSavedCadMannequinArrangementV1(input, new AbortController().signal),
    ).toBeNull();
    const stale = snapshot(6);
    stale.outer.currentRowBound = false;
    mocks.read.mockResolvedValue(stale);
    expect(
      await readSavedCadMannequinArrangementV1(input, new AbortController().signal),
    ).toBeNull();
    expect(mocks.saveV6).not.toHaveBeenCalled();
  });
});
