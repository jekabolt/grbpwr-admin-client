import { beforeEach, describe, expect, it, vi } from 'vitest';

const codec = vi.hoisted(() => ({
  buildExact: vi.fn(),
  encodeExact: vi.fn(),
  buildV3: vi.fn(),
  encodeV3: vi.fn(),
  decodeV3: vi.fn(),
  readV3Component: vi.fn(),
  buildV4: vi.fn(),
  decodeV4: vi.fn(),
  decodeV5: vi.fn(),
  decodePlacement: vi.fn(),
  restore: vi.fn(),
  readPatch: vi.fn(),
  project: vi.fn(),
  initialUi: vi.fn(),
  selectUi: vi.fn(),
  publish: vi.fn(),
  hash: vi.fn(),
  restoredCurrent: null as unknown,
  restoredSides: [] as unknown[],
}));

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1:
    'application/vnd.grbpwr.pattern-dxf-product-semantic.v1+json',
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2', () => ({
  decodePatternImportDxfProductMultiseamPlacementSidecarV2: codec.decodePlacement,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v3+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3: 'composite-v3-request',
  buildPatternImportDxfProductCompositeSidecarV3: codec.buildV3,
  decodePatternImportDxfProductCompositeSidecarV3: codec.decodeV3,
  encodePatternImportDxfProductCompositeSidecarV3: codec.encodeV3,
  readPatternImportDxfProductCompositeComponentBytesV3: codec.readV3Component,
}));
vi.mock('./exact-n-seam-consistency-carrier-v2', () => ({
  buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2: codec.buildExact,
}));
vi.mock('./exact-n-seam-authority-gap-v2', () => ({
  PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2: 'exact-n-candidate',
}));
vi.mock('./composite-sidecar-v4', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v4+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4: 'composite-v4-request',
  buildPatternImportDxfProductCompositeSidecarV4: codec.buildV4,
  decodePatternImportDxfProductCompositeSidecarV4: codec.decodeV4,
  encodePatternImportDxfProductExactNSeamComponentV4: codec.encodeExact,
}));
vi.mock('./composite-sidecar-v5', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json',
  decodePatternImportDxfProductCompositeSidecarV5: codec.decodeV5,
}));
vi.mock('./composite-sidecar-restore-authority-v4', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4:
    'composite-v4-durable-restore-request',
  restorePatternImportDxfProductCompositeSidecarDurableV4: codec.restore,
  readPatternImportDxfProductExactNSeamRestorePatchV2: codec.readPatch,
}));
vi.mock('./exact-n-seam-saved-card-projection-v2', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3: 'prepared-proposal-v3',
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2:
    'saved-card-projection-v2',
  projectPatternImportDxfProductExactNSeamSavedCardV2: codec.project,
}));
vi.mock('./exact-n-seam-atomic-ui-selection-v2', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2: 'ui-selection-v2',
  createPatternImportDxfProductExactNSeamInitialUiStateV2: codec.initialUi,
  applyPatternImportDxfProductExactNSeamUiSelectionV2: codec.selectUi,
}));
vi.mock('./exact-n-seam-production-session-v2', () => ({
  publishPatternImportDxfProductExactNSeamDurableReloadSessionV2: codec.publish,
}));
vi.mock('./saved-assembly-topology-hash-v1', () => ({
  computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1: codec.hash,
}));

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
  createPatternImportDxfPhaseEZeroConnectDurableBridgeV1,
} from './zero-connect-durable-composite-v4';

const digest = (character: string) => character.repeat(64);
const bindingId = `zero-connect-binding-v1:${digest('a')}`;
const row = Object.freeze({
  techCardId: 11,
  scopeKey: 'fabric:main',
  patternLineKey: 'pattern:main',
  revision: 8,
  cardLockVersion: 301,
  url: 'https://media.example.invalid/pants.dxf',
  sizeBytes: 42,
  sha256: digest('d'),
});
const gestureSides = Object.freeze([
  Object.freeze({
    pieceId: 'front-id',
    pieceLineKey: 'piece-front',
    contourId: 'front-contour',
    boundaryVertexIds: Object.freeze(['front:v0', 'front:v1']),
    direction: 'forward' as const,
  }),
  Object.freeze({
    pieceId: 'back-id',
    pieceLineKey: 'piece-back',
    contourId: 'back-contour',
    boundaryVertexIds: Object.freeze(['back:v9', 'back:v8']),
    direction: 'reverse' as const,
  }),
]);
const durableSides = Object.freeze(
  gestureSides.map((side, sideIndex) =>
    Object.freeze({
      seamId: 'seam-side',
      sideIndex,
      ...side,
    }),
  ),
);

function pending() {
  return {
    status: 'in-memory-final-seam-attached-awaiting-second-save',
    savedOperationNumber: 7,
    finalSeamKey: 'seam-side',
    candidate: {
      connection: {
        mapping: 'equal',
        lengthRatio: 1,
        sides: gestureSides,
      },
    },
    catalog: {
      canonicalSha256: digest('c'),
    },
    refreshedAuthoringAuthority: { row },
  } as never;
}

function sidecar(mediaType: string = PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4) {
  const bytes = new Uint8Array([1, 2, 3]);
  return {
    semanticSidecar: {
      techCardId: row.techCardId,
      patternLineKey: row.patternLineKey,
      dxfSha256: row.sha256,
      savedRowRevision: row.revision,
      cardLockVersion: row.cardLockVersion,
      mediaType,
      sidecarSha256: digest('e'),
      byteLength: bytes.byteLength,
      sidecarBytes: btoa(String.fromCharCode(...bytes)),
    },
  };
}

function decodedV4(authoringOperationId = bindingId) {
  return {
    ok: true,
    exactNSeam: {
      carrier: {
        bindings: {
          selectedOperation: {
            sourceOperationNumber: 7,
            authoringOperationId,
            seamIds: ['seam-side'],
          },
        },
        seams: [{ seamId: 'seam-side', sides: durableSides }],
      },
    },
  };
}

function rig(mediaType?: string) {
  const execute = vi.fn();
  const GetTechCardPatternSemanticSidecar = vi.fn(async () => sidecar(mediaType));
  const bridge = createPatternImportDxfPhaseEZeroConnectDurableBridgeV1({
    authorityAdapter: {
      readCurrentAssemblyTopology: vi.fn(async () => ({
        serverAssemblyRevision: 'assembly:revision:7',
        assemblyTopologySha256: digest('b'),
        topology: {
          operations: [
            {
              number: 7,
              inputKeys: ['piece-front', 'piece-back'],
              seamKeys: ['seam-side'],
            },
          ],
        },
      })) as never,
    },
    application: { transaction: { execute } } as never,
    createClient: () =>
      ({
        GetTechCardPatternSemanticSidecar,
        PutTechCardPatternSemanticSidecar: vi.fn(),
      }) as never,
    crypto: globalThis.crypto,
  });
  return { bridge, execute, GetTechCardPatternSemanticSidecar };
}

async function persist(test: ReturnType<typeof rig>) {
  return test.bridge.persist(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
      pending: pending(),
      row,
    },
    new AbortController().signal,
  );
}

describe('zero-connect durable Composite V4 single-operation policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codec.hash.mockImplementation(async (domain: string) =>
      domain.includes('operation-binding') ? digest('a') : digest('f'),
    );
    codec.buildExact.mockResolvedValue({ ok: true, carrier: {}, seal: {} });
    codec.encodeExact.mockResolvedValue({ ok: true, bytes: new Uint8Array([9]) });
    codec.decodeV4.mockResolvedValue(decodedV4());
    codec.decodeV5.mockResolvedValue({ ok: true, nestedCompositeV4: decodedV4() });
    codec.decodePlacement.mockResolvedValue({ ok: true, compatibility: 'legacy-v1-no-placement' });
    codec.buildV3.mockResolvedValue({ ok: true, owner: { v3: true } });
    codec.encodeV3.mockReturnValue({ ok: true, bytes: new Uint8Array([7]) });
    codec.buildV4.mockResolvedValue({ ok: true, owner: { v4: true } });
    codec.restore.mockImplementation(async (request: { current: unknown }) => {
      codec.restoredCurrent = request.current;
      return { ok: true, owner: { durable: true } };
    });
    codec.readPatch.mockImplementation(() => ({
      bindings: codec.restoredCurrent,
      seams: [{ seamId: 'seam-side', sides: durableSides }],
    }));
    codec.project.mockResolvedValue({ ok: true, owner: { projection: true } });
    codec.initialUi.mockReturnValue({ initial: true });
    codec.selectUi.mockReturnValue({ ok: true, owner: { selection: true } });
    codec.publish.mockReturnValue(true);
  });

  it('restores an identical durable binding without issuing another CAS transaction', async () => {
    const test = rig();

    const result = await persist(test);

    expect(result).toMatchObject({ ok: true, compositeOperationBindingId: bindingId });
    expect(test.execute).not.toHaveBeenCalled();
    expect(codec.restore).toHaveBeenCalledTimes(1);
    expect(codec.publish).toHaveBeenCalledTimes(1);
    expect(codec.buildExact.mock.calls[0][0].sides).toEqual(durableSides);
  });

  it('restores the identical binding through a Composite V5 wrapper without overwriting it', async () => {
    const test = rig(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5);

    const result = await persist(test);

    expect(result).toMatchObject({ ok: true, compositeOperationBindingId: bindingId });
    expect(codec.decodeV5).toHaveBeenCalledTimes(1);
    expect(test.execute).not.toHaveBeenCalled();
    expect(codec.restore).toHaveBeenCalledTimes(1);
  });

  it('fails closed instead of overwriting a second distinct durable operation', async () => {
    codec.decodeV4.mockResolvedValueOnce(decodedV4(`zero-connect-binding-v1:${digest('9')}`));
    const test = rig();

    const result = await persist(test);

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'durable-existing-operation-conflict' },
    });
    expect(test.execute).not.toHaveBeenCalled();
    expect(codec.restore).not.toHaveBeenCalled();
    expect(codec.publish).not.toHaveBeenCalled();
  });

  it('never overwrites a corrupt Composite V6 carrier', async () => {
    const test = rig('application/vnd.grbpwr.pattern-dxf-product-composite.v6+json');

    const result = await persist(test);

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'durable-existing-composite-invalid' },
    });
    expect(test.execute).not.toHaveBeenCalled();
    expect(codec.restore).not.toHaveBeenCalled();
  });

  it('never drops an existing exact two-seam component while migrating Composite V3', async () => {
    codec.decodeV3.mockResolvedValueOnce({
      ok: true,
      document: { bindings: { row } },
      exactTopology: { carrier: { selected: 'two-seam' } },
    });
    const test = rig(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3);

    const result = await persist(test);

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'durable-existing-v3-exact-conflict' },
    });
    expect(codec.buildV3).not.toHaveBeenCalled();
    expect(test.execute).not.toHaveBeenCalled();
  });

  it('sends the first exact carrier through the existing CAS transaction', async () => {
    const test = rig('application/vnd.grbpwr.pattern-dxf-product-semantic.v1+json');
    test.execute.mockImplementationOnce(async (request) => {
      codec.restoredCurrent = request.current;
      return { ok: true, owner: { durable: true } };
    });

    const result = await persist(test);

    expect(result).toMatchObject({ ok: true, compositeOperationBindingId: bindingId });
    expect(test.execute).toHaveBeenCalledTimes(1);
    expect(test.execute.mock.calls[0][0]).toMatchObject({
      current: {
        row,
        selectedOperation: {
          sourceOperationNumber: 7,
          authoringOperationId: bindingId,
          seamIds: ['seam-side'],
        },
      },
      storage: {
        currentAuthority: {
          row,
          serverAssemblyRevision: 'assembly:revision:7',
          assemblyTopologySha256: digest('b'),
        },
      },
    });
    expect(codec.buildExact.mock.calls[0][0].sides).toEqual(durableSides);
    expect(codec.publish).toHaveBeenCalledTimes(1);
  });

  it('checks caller cancellation again immediately before session publication', async () => {
    const test = rig();
    let finishProjection!: (value: unknown) => void;
    codec.project.mockReturnValueOnce(
      new Promise((resolve) => {
        finishProjection = resolve;
      }),
    );
    const controller = new AbortController();
    const resultPromise = test.bridge.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
        pending: pending(),
        row,
      },
      controller.signal,
    );
    await vi.waitFor(() => expect(codec.project).toHaveBeenCalledTimes(1));

    controller.abort();
    finishProjection({ ok: true, owner: { projection: true } });
    const result = await resultPromise;

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'durable-session-cancelled' },
    });
    expect(codec.publish).not.toHaveBeenCalled();
  });
});
