import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  dispose: vi.fn(),
  decodeV4: vi.fn(),
  decodeV5: vi.fn(),
  decodeV6: vi.fn(),
  decodeV7: vi.fn(),
  buildV5: vi.fn(),
  buildV6: vi.fn(),
  saveV5: vi.fn(),
  saveV6: vi.fn(),
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
  readPatternImportDxfProductCompositeComponentBytesV6: () => mocks.nestedBytes,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6: 'v6',
}));
vi.mock('./composite-sidecar-v7', () => ({
  decodePatternImportDxfProductCompositeSidecarV7: mocks.decodeV7,
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

import {
  readSavedCadMannequinArrangementV1,
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
  mocks.buildV5.mockResolvedValue({ ok: true, owner: { v: 5 } });
  mocks.buildV6.mockResolvedValue({ ok: true, owner: { v: 6 } });
  mocks.annotations.mockResolvedValue({ ok: true, bytes: new Uint8Array([9]) });
  mocks.saveV5.mockResolvedValue({ ok: true, receipt: { sidecarSha256: 'saved-v5' } });
  mocks.saveV6.mockResolvedValue({ ok: true, receipt: { sidecarSha256: 'saved-v6' } });
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
  it('preserves nested V5 when updating V6 and rejects V7 instead of downgrading', async () => {
    mocks.read.mockResolvedValue(snapshot(6));
    await saveSavedCadMannequinArrangementV1(request(), new AbortController().signal);
    expect(mocks.buildV6.mock.calls[0][0].compositeV5Bytes).toEqual(mocks.nestedBytes);
    mocks.saveV6.mockClear();
    mocks.read.mockResolvedValue(snapshot(7));
    await expect(
      saveSavedCadMannequinArrangementV1(request(), new AbortController().signal),
    ).rejects.toThrow();
    expect(mocks.saveV6).not.toHaveBeenCalled();
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
  function hydration() {
    const input = request();
    const document = createCadMannequinArrangementDocumentV1(input.arrangement);
    const decoded = {
      ok: true,
      document: { bindings: { serverAssemblyRevision: 'current-assembly' } },
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
