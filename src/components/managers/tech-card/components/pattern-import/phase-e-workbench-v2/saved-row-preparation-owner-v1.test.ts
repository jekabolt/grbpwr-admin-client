import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  catalog: vi.fn(),
  projection: vi.fn(),
  materials: vi.fn(),
}));

vi.mock('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1', async (load) => {
  const actual =
    await load<
      typeof import('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1')
    >();
  return { ...actual, selectPatternImportDxfProductDraftPhaseDSizeV1: mocks.select };
});

vi.mock(
  'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1',
  async (load) => {
    const actual =
      await load<
        typeof import('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1')
      >();
    return { ...actual, buildPatternImportDxfProductPhaseEAuthoringCatalogV1: mocks.catalog };
  },
);

vi.mock('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1', async (load) => {
  const actual =
    await load<typeof import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1')>();
  return { ...actual, projectPatternImportDxfProductPhaseEAssemblyV1: mocks.projection };
});

vi.mock('../phase-e-workbench-beta-material-presets-v1', async (load) => {
  const actual = await load<typeof import('../phase-e-workbench-beta-material-presets-v1')>();
  return { ...actual, loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1: mocks.materials };
});

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  type DxfProductSavedReprocessHostV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type {
  AssemblyContext,
  CardDraft,
  DraftScopeTarget,
  WriteJob,
} from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';

import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_CONFIRMED_COMPILER_SOURCE_REQUEST_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1,
  createPatternImportDxfPhaseESavedRowPreparationOwnerV1,
  isPatternImportDxfPhaseESavedRowPreparedV1,
  type PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1,
  type PatternImportDxfPhaseESavedRowPreparedV1,
  type PatternImportDxfPhaseESavedRowPreparationHostV1,
} from './saved-row-preparation-owner-v1';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { restorePatternImportDxfPhaseESavedExactPrefillV1 } from './saved-exact-prefill-v1';

const CREATED_AT = '2026-11-14T00:00:00.000Z';
const TARGET: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: 'bom:main',
  label: 'main',
  isInterlining: false,
  sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
};

function writerJobFor(techCardId = 44, target: DraftScopeTarget = TARGET): WriteJob {
  return {
    techCardId,
    scope: structuredClone(target),
    pieces: [],
    sizes: [],
    source: {
      files: [
        {
          name: 'original-source.dxf',
          sha256: 'a'.repeat(64),
          bytes: 123,
          kind: 'dxf',
          pages: 1,
        },
      ],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'single',
      variant: null,
    },
    generator: 'saved-row-preparation-test',
    dialect: 'r12',
  };
}

function writtenFor(techCardId = 44, target: DraftScopeTarget = TARGET) {
  const job = writerJobFor(techCardId, target);
  const detail = writeDxfDetailed(job, { now: () => new Date(CREATED_AT) });
  return { job, detail };
}

const FIXTURE_WRITTEN = writtenFor();
const FIXTURE_BYTES = new TextEncoder().encode(FIXTURE_WRITTEN.detail.dxfText);
const FIXTURE_SHA256 = createHash('sha256').update(FIXTURE_BYTES).digest('hex');

function row(patch: Partial<DxfProductSavedRowIdentityV1> = {}): DxfProductSavedRowIdentityV1 {
  return {
    techCardId: 44,
    scopeKey: TARGET.scopeKey,
    patternLineKey: 'pattern:main:44',
    revision: 7,
    cardLockVersion: 19,
    url: 'https://media.example/card-44/main-r7.dxf',
    sizeBytes: FIXTURE_BYTES.byteLength,
    sha256: FIXTURE_SHA256,
    ...patch,
  };
}

function draftFor(identity: DxfProductSavedRowIdentityV1, sourceFileId: string): CardDraft {
  const target = { ...TARGET, scopeKey: identity.scopeKey, fabricPurpose: identity.scopeKey };
  const written = writtenFor(identity.techCardId, target);
  return {
    techCardId: identity.techCardId,
    scopes: [
      {
        target,
        filename: 'ignored-name.dxf',
        name: 'main',
        dxfText: written.detail.dxfText,
        manifest: written.detail.manifest,
        identities: ['BACK', 'FRONT'],
        writerReplay: {
          schemaVersion: 'pattern-import-dxf-product-writer-replay-carrier/1',
          createdAt: CREATED_AT,
          job: written.job,
        },
      },
    ],
    pieces: [],
    aliases: [
      {
        scopeKey: identity.scopeKey,
        fabricPurpose: identity.scopeKey,
        bomLineKey: 'bom:main',
        blockName: 'BACK_M',
        pieceLineKey: 'piece-back',
      },
      {
        scopeKey: identity.scopeKey,
        fabricPurpose: identity.scopeKey,
        bomLineKey: 'bom:main',
        blockName: 'FRONT_M',
        pieceLineKey: 'piece-front',
      },
    ],
    pieceUpdates: [],
    downloads: [{ filename: 'raw.dxf', dxfText: 'RAW-DXF-MUST-NOT-ESCAPE' }],
    dxfProvenance: {
      pipelineIntegrated: true,
      contentBinding: { sourceSha256: identity.sha256, sourceFileId },
    } as never,
    dxfPhaseDReplay: {
      replayReady: true,
      carrier: { sourceSha256: identity.sha256, sourceFileId },
    } as never,
  };
}

function savedReprocessHost(
  patch: Partial<DxfProductSavedReprocessHostV1> = {},
): DxfProductSavedReprocessHostV1 {
  return {
    readAuthoritativeRow: vi.fn(async (expected) => ({
      row: expected,
      bytes: FIXTURE_BYTES.slice(),
    })),
    reprocess: vi.fn(async ({ row: expected, sourceFileId }) => ({
      row: expected,
      draft: draftFor(expected, sourceFileId),
    })),
    readCurrentRowIdentity: vi.fn(async (expected) => expected),
    ...patch,
  };
}

function anchor(pieceLineKey: string, seamKey: string) {
  return {
    pieceLineKey,
    edgeHint: `${pieceLineKey}#${seamKey}`,
    range: [0.1, 0.8] as [number, number],
    lenMm: 320,
    contourSig: `${pieceLineKey}:${seamKey}`,
    samples: [
      [0.1, 0.2],
      [0.4, 0.5],
      [0.8, 0.9],
    ] as [number, number][],
  };
}

function assembly(): AssemblyContext {
  const seam = (seamKey: string) => ({
    seamKey,
    pieces: ['piece-front', 'piece-back'],
    confirmed: true,
    stale: false,
    kind: 'edge' as const,
    direction: 'reversed' as const,
    source: 'order' as const,
    anchoredSize: 'M',
    sideA: [anchor('piece-front', seamKey)],
    sideB: [anchor('piece-back', seamKey)],
  });
  return {
    ops: [
      {
        number: 120,
        work: 'overlock_serge',
        inputKeys: ['piece-front', 'piece-back'],
        outputUnitKey: 'skirt-shell',
        outputUnitName: 'SKIRT SHELL',
        seamKeys: ['side-left', 'side-right'],
      },
    ],
    seams: [seam('side-left'), seam('side-right')],
  };
}

const SERVER_ASSEMBLY_REVISION = 'assembly-revision:card-44:tx-000019';

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('plain canonical data required');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function serverTopologySha256(value: AssemblyContext, selectedOperationNumber = 120): string {
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    value,
    selectedOperationNumber,
  );
  if (!adapted.ok) return 'f'.repeat(64);
  return createHash('sha256')
    .update(
      `${PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1}\0${canonical(adapted.existingAssembly)}`,
    )
    .digest('hex');
}

function authorityEvidence(
  expected: DxfProductSavedRowIdentityV1,
  selectedOperationNumber: number,
  value: AssemblyContext = assembly(),
  patch: Partial<PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1> = {},
): PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1 {
  const serverAssemblyRevision = patch.serverAssemblyRevision ?? SERVER_ASSEMBLY_REVISION;
  const topologySha256 =
    patch.serverTopologySha256 ?? serverTopologySha256(value, selectedOperationNumber);
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1,
    origin: 'server-transactional-saved-assembly',
    serverAssemblyRevision,
    serverTopologySha256: topologySha256,
    row: structuredClone(expected),
    selectedOperationNumber,
    assembly: value,
    exactTopology: {
      carrier: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
        status: 'exact-phase-e-topology-authoring-binding',
        bindings: {
          row: structuredClone(expected),
          serverAssemblyRevision,
          assemblyTopologySha256: topologySha256,
          selectedOperation: {
            sourceOperationNumber: selectedOperationNumber,
            authoringOperationId: 'phase-e:operation:120',
            localOperationOrder: 0,
            seamIds: ['side-left', 'side-right'],
          },
          catalogCanonicalSha256: 'b'.repeat(64),
          proposalFingerprint: 'pidpemsv2-fnv1a64:0123456789abcdef',
          phaseEAggregatePlanSha256: 'e'.repeat(64),
        },
        sides: [] as never,
        claims: {} as never,
      },
      seal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
        algorithm: 'SHA-256',
        canonicalSha256: 'd'.repeat(64),
        canonicalByteLength: 128,
        authority: 'unsigned-exact-authoring-subdocument-consistency-only',
        persistenceIntegrated: false,
        productionReady: false,
      },
      compositeSha256: '9'.repeat(64),
      compositeByteLength: 2048,
    },
    ...patch,
  };
}

function contour(pieceId: string, contourId: string) {
  return {
    contourId,
    role: 'sewing-boundary' as const,
    geometry: { kind: 'seam' as const },
    closed: true,
    boundaryVertices: [
      { ordinal: 0, vertexId: `${pieceId}:v0`, normalizedArc: 0 },
      { ordinal: 1, vertexId: `${pieceId}:v1`, normalizedArc: 0.25 },
      { ordinal: 2, vertexId: `${pieceId}:v2`, normalizedArc: 0.5 },
      { ordinal: 3, vertexId: `${pieceId}:v3`, normalizedArc: 0.75 },
    ],
  };
}

function catalog() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: 44,
    scopeKey: TARGET.scopeKey,
    sizeToken: 'M',
    sourceFileId: 'pattern-import/saved/card-44/source',
    sizeSelectionCanonicalSha256: 'a'.repeat(64),
    pieces: [
      {
        pieceId: 'BACK',
        pieceLineKey: 'piece-back',
        contours: [contour('BACK', 'back-seam')],
      },
      {
        pieceId: 'FRONT',
        pieceLineKey: 'piece-front',
        contours: [contour('FRONT', 'front-seam')],
      },
    ],
    requiredExplicitFields: [
      'documentId-and-revision',
      'physical-surface',
      'two-seam-sides-and-anchor-ranges',
      'side-directions',
      'mapping-and-length-ratio',
      'operation-stage-and-order',
      'immutable-material-revisions',
      'tolerances',
    ] as const,
    canonicalSha256: 'b'.repeat(64),
    geometryCoordinatesExposed: false as const,
    rawDxfExposed: false as const,
    assemblyInferred: false as const,
    productionReady: false as const,
  };
}

function selected() {
  return {
    ok: true as const,
    selection: {
      ok: true as const,
      schemaVersion: DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1,
      selection: {
        scopeKey: TARGET.scopeKey,
        sizeToken: 'M',
        pieceIds: ['BACK', 'FRONT'],
        fullSelectedGeometrySha256: 'c'.repeat(64),
        selectedGeometrySha256: 'd'.repeat(64),
        canonicalSha256: 'a'.repeat(64),
      },
      pipeline: {},
      phaseD: {},
      blockers: [],
      claims: {},
    },
    blockers: [],
  } as never;
}

function projection() {
  return {
    schemaVersion: 'pattern-import-dxf-product-phase-e-assembly-projection/1' as const,
    expectedCatalogCanonicalSha256: 'b'.repeat(64),
    sizeSelectionCanonicalSha256: 'a'.repeat(64),
    sourceFileId: 'pattern-import/saved/card-44/source',
    sizeToken: 'M',
    joinMode: 'catalog-ordinal-to-phase-d-point' as const,
    pieces: [
      {
        pieceId: 'BACK',
        pieceLineKey: 'piece-back',
        contours: [],
        cameraMm: { minX: 0, minY: 0, maxX: 1, maxY: 1, padding: 0.04 },
      },
      {
        pieceId: 'FRONT',
        pieceLineKey: 'piece-front',
        contours: [],
        cameraMm: { minX: 0, minY: 0, maxX: 1, maxY: 1, padding: 0.04 },
      },
    ] as const,
    geometryPlacementApplied: false as const,
  };
}

function request() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1,
    row: row(),
    selectedOperationNumber: 120,
  };
}

function confirmedChoices(prepared: PatternImportDxfPhaseESavedRowPreparedV1) {
  return {
    ok: true as const,
    choices: {
      expectedCatalogCanonicalSha256: prepared.catalog.canonicalSha256,
      expectedProposalFingerprint: prepared.proposal.deterministicFingerprint,
      importGeneration: prepared.preparationGeneration,
      documentId: prepared.documentAuthority.documentId,
      revision: prepared.documentAuthority.revision,
      aggregatePlanSeal: { canonicalSha256: '7'.repeat(64) },
    },
    blockers: [] as const,
  } as never;
}

function verifiedPersistence() {
  return Object.freeze({
    status: 'verified-exact-topology-persisted' as const,
    previewReady: false as const,
    persistence: 'verified' as const,
    composition: null,
    blockers: Object.freeze([]) as readonly [],
  });
}

function confirmedCompilerSourceRequest(prepared: PatternImportDxfPhaseESavedRowPreparedV1) {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_CONFIRMED_COMPILER_SOURCE_REQUEST_V1,
    prepared,
    choices: confirmedChoices(prepared),
    persistence: verifiedPersistence(),
    signal: new AbortController().signal,
  };
}

function harness(
  options: Readonly<{
    readAssembly?: PatternImportDxfPhaseESavedRowPreparationHostV1['readAuthoritativeAssembly'];
    createSavedHost?: () => DxfProductSavedReprocessHostV1;
    crypto?: Pick<Crypto, 'subtle'>;
  }> = {},
) {
  const createSavedReprocessHost = vi.fn(options.createSavedHost ?? (() => savedReprocessHost()));
  const readAuthoritativeAssembly = vi.fn(
    options.readAssembly ??
      (async ({ row: expected, selectedOperationNumber }) =>
        authorityEvidence(expected, selectedOperationNumber)),
  );
  return {
    host: {
      createSavedReprocessHost,
      readAuthoritativeAssembly,
      ...(options.crypto ? { crypto: options.crypto } : {}),
    },
    createSavedReprocessHost,
    readAuthoritativeAssembly,
  };
}

beforeEach(() => {
  mocks.select.mockReset().mockResolvedValue(selected());
  mocks.catalog.mockReset().mockResolvedValue({ ok: true, catalog: catalog(), blockers: [] });
  mocks.projection.mockReset().mockReturnValue({
    ok: true,
    projection: projection(),
    blockers: [],
  });
  mocks.materials
    .mockReset()
    .mockResolvedValue([{ id: 'material-visual', label: 'Visual', materialRevision: 'visual-r1' }]);
});

describe('saved-row Phase-E preparation owner V1', () => {
  it('fresh-reprocesses and prepares an exact raw-free two-seam saved-row envelope', async () => {
    const state = harness();
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host);
    const result = await owner.prepare(request());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.blockers[0].detail);
    expect(result.preparationGeneration).toBe(1);
    expect(result.prepared.origin).toBe('verified-saved-row');
    expect(isPatternImportDxfPhaseESavedRowPreparedV1(result.prepared)).toBe(true);
    expect(isPatternImportDxfPhaseESavedRowPreparedV1({ ...result.prepared })).toBe(false);
    expect(state.createSavedReprocessHost).toHaveBeenCalledOnce();
    expect(state.readAuthoritativeAssembly).toHaveBeenCalledTimes(2);
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(mocks.projection).toHaveBeenCalledOnce();
    expect(result.prepared.documentAuthority.row).toEqual(row());
    expect('patternVersion' in result.prepared.documentAuthority.row).toBe(false);
    expect(result.prepared.documentAuthority.documentId).toMatch(
      /^phase-e-v2:saved-document:[0-9a-f]{64}$/,
    );
    expect(result.prepared.documentAuthority.revision).toMatch(
      /^phase-e-v2:saved-revision:[0-9a-f]{64}$/,
    );
    expect(result.prepared.serverAssemblyRevision).toBe(SERVER_ASSEMBLY_REVISION);
    expect(result.prepared.documentAuthority.serverAssemblyRevision).toBe(SERVER_ASSEMBLY_REVISION);
    expect(result.prepared.assemblyTopologySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.claims.serverAssemblyRevisionRequired).toBe(true);
    expect(result.claims.serverCanonicalTopologySha256Verified).toBe(true);
    expect(result.claims.getTechCardProjectionAccepted).toBe(false);
    expect(result.claims.localFormOrOptimisticOverlayAccepted).toBe(false);
    expect(result.claims.transactionalAssemblyRpcIntegrated).toBe(false);
    expect(result.prepared.initialState.expectedImportGeneration).toBe(1);
    expect(result.prepared.initialState.seams.map(({ seamId }) => seamId)).toEqual([
      'side-left',
      'side-right',
    ]);
    expect(result.prepared.initialState.seams[0].sides).toMatchObject([
      { pieceId: 'FRONT', direction: 'forward', contourId: null, boundaryVertexIds: [] },
      { pieceId: 'BACK', direction: 'reverse', contourId: null, boundaryVertexIds: [] },
    ]);
    expect(result.claims.twoSeamIdentityPieceAndDirectionPrefilled).toBe(true);
    expect(result.claims.storedAnchorRangePromotedToPhaseDGeometryAuthority).toBe(false);
    expect(result.claims.contourOrVertexChoiceInferred).toBe(false);
    expect(result.claims.sidecarRead).toBe(true);
    expect(result.claims.verifiedCompositeExactTopologyReadBeforeAndAfter).toBe(true);
    expect(result.prepared.exactTopology.compositeSha256).toBe('9'.repeat(64));
    expect(result.claims.sidecarWritten).toBe(false);
    expect(result.claims.persistenceIntegrated).toBe(false);
    expect(result.claims.placementIntegrated).toBe(false);
    expect(result.claims.previewReady).toBe(false);
    expect(result.claims.runtimeReady).toBe(false);
    expect(result.claims.uiIntegrated).toBe(false);
    expect(result.claims.productionReady).toBe(false);
    expect(result.claims.draftCadCompileSourceRawDxfFree).toBe(true);
    expect(result.prepared.draftCadCompileSource.scopes[0].writerReplay).toBeDefined();
    expect(JSON.stringify(result)).not.toContain('RAW-DXF-MUST-NOT-ESCAPE');
    expect(JSON.stringify(result)).not.toContain('dxfText');
    expect(owner.snapshot()).toEqual({ disposed: false, running: false, preparationGeneration: 1 });
  });

  it('keeps the native source private and hands the exact replay draft to one confirmed consumer', async () => {
    const state = harness();
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host);
    const preparedResult = await owner.prepare(request());
    if (!preparedResult.ok) throw new Error(preparedResult.blockers[0].detail);
    const replayDraft = mocks.select.mock.calls[0]?.[0] as CardDraft;
    const consumer = vi.fn(async ({ sourceOwner, compositionRequest }) => {
      expect(sourceOwner).toMatchObject({ opaque: 'module-private-weak-owner' });
      expect(compositionRequest.draft).toBe(replayDraft);
      expect(compositionRequest.selection).toBe(preparedResult.prepared.selection);
      expect(compositionRequest.catalog).toBe(preparedResult.prepared.catalog);
      expect(compositionRequest.proposal).toBe(preparedResult.prepared.proposal);
      expect(compositionRequest.prepared.row).not.toBe(compositionRequest.current.row);
      expect(compositionRequest.prepared.row).toEqual(compositionRequest.current.row);
      expect(Object.isFrozen(compositionRequest.prepared.row)).toBe(true);
      expect(Object.isFrozen(compositionRequest.current.row)).toBe(true);
      expect(compositionRequest.current.row).toEqual({
        techCardId: 44,
        scopeKey: TARGET.scopeKey,
        patternLineKey: 'pattern:main:44',
        dxfSha256: FIXTURE_SHA256,
        patternVersion: 7,
        cardLockVersion: 19,
      });
      return 'compiler-owned';
    });

    expect('draft' in preparedResult.prepared).toBe(false);
    expect('sourceOwner' in preparedResult.prepared).toBe(false);
    expect(JSON.stringify(preparedResult.prepared)).not.toContain('RAW-DXF-MUST-NOT-ESCAPE');
    const first = await owner.consumeConfirmedCompilerSource(
      confirmedCompilerSourceRequest(preparedResult.prepared),
      consumer,
    );
    expect(first).toMatchObject({ ok: true, value: 'compiler-owned', blockers: [] });
    const replay = await owner.consumeConfirmedCompilerSource(
      confirmedCompilerSourceRequest(preparedResult.prepared),
      consumer,
    );
    expect(replay).toMatchObject({
      ok: false,
      blockers: [{ code: 'source-already-consumed' }],
    });
    expect(consumer).toHaveBeenCalledOnce();
  });

  it('rejects preview, unconfirmed, forged and aborted attempts without burning the capability', async () => {
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const preparedResult = await owner.prepare(request());
    if (!preparedResult.ok) throw new Error(preparedResult.blockers[0].detail);
    const prepared = preparedResult.prepared;
    const consumer = vi.fn(() => 'accepted');
    const preview = confirmedCompilerSourceRequest(prepared);
    const previewResult = await owner.consumeConfirmedCompilerSource(
      {
        ...preview,
        persistence: { ...preview.persistence, previewReady: true },
      } as never,
      consumer,
    );
    expect(previewResult).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-confirmation' }],
    });
    const mismatched = confirmedCompilerSourceRequest(prepared);
    const choices = structuredClone(confirmedChoices(prepared)) as never;
    (choices as { choices: { importGeneration: number } }).choices.importGeneration += 1;
    const mismatchResult = await owner.consumeConfirmedCompilerSource(
      { ...mismatched, choices } as never,
      consumer,
    );
    expect(mismatchResult).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-confirmation' }],
    });
    const forgedResult = await owner.consumeConfirmedCompilerSource(
      { ...confirmedCompilerSourceRequest(prepared), prepared: { ...prepared } } as never,
      consumer,
    );
    expect(forgedResult).toMatchObject({
      ok: false,
      blockers: [{ code: 'stale-preparation' }],
    });
    const controller = new AbortController();
    controller.abort();
    const abortedResult = await owner.consumeConfirmedCompilerSource(
      { ...confirmedCompilerSourceRequest(prepared), signal: controller.signal },
      consumer,
    );
    expect(abortedResult).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-confirmation' }],
    });
    let getterInvoked = false;
    const hostile = confirmedCompilerSourceRequest(prepared) as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, 'prepared', {
      enumerable: true,
      get() {
        getterInvoked = true;
        return prepared;
      },
    });
    const hostileResult = await owner.consumeConfirmedCompilerSource(hostile as never, consumer);
    expect(hostileResult).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-confirmation' }],
    });
    expect(getterInvoked).toBe(false);
    expect(consumer).not.toHaveBeenCalled();

    const accepted = await owner.consumeConfirmedCompilerSource(
      confirmedCompilerSourceRequest(prepared),
      consumer,
    );
    expect(accepted).toMatchObject({ ok: true, value: 'accepted' });
    expect(consumer).toHaveBeenCalledOnce();
  });

  it('revokes on cancel, supersede and dispose, and burns a thrown one-shot handoff', async () => {
    const cancelledOwner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const cancelled = await cancelledOwner.prepare(request());
    if (!cancelled.ok) throw new Error(cancelled.blockers[0].detail);
    cancelledOwner.cancel();
    await expect(
      cancelledOwner.consumeConfirmedCompilerSource(
        confirmedCompilerSourceRequest(cancelled.prepared),
        vi.fn(),
      ),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'stale-preparation' }] });

    const supersededOwner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const stale = await supersededOwner.prepare(request());
    const current = await supersededOwner.prepare(request());
    if (!stale.ok || !current.ok) throw new Error('Expected both preparations to complete.');
    await expect(
      supersededOwner.consumeConfirmedCompilerSource(
        confirmedCompilerSourceRequest(stale.prepared),
        vi.fn(),
      ),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'stale-preparation' }] });

    const disposedOwner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const disposed = await disposedOwner.prepare(request());
    if (!disposed.ok) throw new Error(disposed.blockers[0].detail);
    disposedOwner.dispose();
    await expect(
      disposedOwner.consumeConfirmedCompilerSource(
        confirmedCompilerSourceRequest(disposed.prepared),
        vi.fn(),
      ),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'stale-preparation' }] });

    const thrown = vi.fn(() => {
      throw new Error('compiler exploded');
    });
    const failed = await supersededOwner.consumeConfirmedCompilerSource(
      confirmedCompilerSourceRequest(current.prepared),
      thrown,
    );
    expect(failed).toMatchObject({ ok: false, blockers: [{ code: 'consumer-failed' }] });
    const retried = await supersededOwner.consumeConfirmedCompilerSource(
      confirmedCompilerSourceRequest(current.prepared),
      vi.fn(),
    );
    expect(retried).toMatchObject({
      ok: false,
      blockers: [{ code: 'source-already-consumed' }],
    });
    expect(thrown).toHaveBeenCalledOnce();
  });

  it('restores only exact persisted topology into the fresh saved-row state', async () => {
    const rawCatalog = catalog();
    const { canonicalSha256: fixtureCatalogSha256, ...unsignedCatalog } = rawCatalog;
    expect(fixtureCatalogSha256).toMatch(/^[0-9a-f]{64}$/);
    const catalogSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
      unsignedCatalog,
      globalThis.crypto,
    );
    if (!catalogSha256) throw new Error('catalog SHA unavailable');
    const exactCatalog = { ...unsignedCatalog, canonicalSha256: catalogSha256 };
    const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
      assembly(),
      120,
    );
    if (!adapted.ok) throw new Error(adapted.blockers[0].detail);
    const proposalResult = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
      exactCatalog,
      adapted.existingAssembly,
    );
    if (!proposalResult.ok) throw new Error(proposalResult.blockers[0].detail);
    const proposal = proposalResult.proposal;
    const initial = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
      exactCatalog,
      proposal,
      { documentId: 'document:44', revision: 'revision:7' },
      1,
    );
    const exactState = {
      ...initial,
      documentRevisionConfirmed: true,
      physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
      physicalSurfaceConfirmed: true,
      operationStage: 4,
      operationConfirmed: true,
      seams: proposal.seams.map((seam, seamIndex) => ({
        seamId: seam.id,
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: seam.sides.map((side) => {
          const prefix = side.pieceId;
          const pair = seamIndex === 0 ? [0, 1] : [2, 3];
          const ordered = side.requiredDirection === 'forward' ? pair : [...pair].reverse();
          return {
            pieceId: side.pieceId,
            contourId: `${side.pieceId.toLowerCase()}-seam`,
            boundaryVertexIds: ordered.map((ordinal) => `${prefix}:v${ordinal}`),
            direction: side.requiredDirection,
            confirmed: true,
          };
        }),
      })),
      materialSelections: proposal.seams[0].sides.map((side) => ({
        pieceId: side.pieceId,
        optionId: 'material-visual',
        confirmed: true,
      })),
      tolerance: {
        endpointMm: 0,
        fullLengthMm: 0.001,
        fullLengthRelative: 0,
        confirmed: true,
      },
    } as never;
    const choices = await buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
      exactCatalog,
      proposal,
      exactState,
      [{ id: 'material-visual', label: 'Visual', materialRevision: 'visual-r1' }],
      globalThis.crypto,
    );
    if (!choices.ok) throw new Error(choices.blockers[0].detail);
    const topologySha256 = serverTopologySha256(assembly());
    const current = {
      row: row(),
      serverAssemblyRevision: SERVER_ASSEMBLY_REVISION,
      assemblyTopologySha256: topologySha256,
      selectedOperation: {
        sourceOperationNumber: proposal.operation.sourceOperationNumber,
        authoringOperationId: proposal.operation.authoringOperationId,
        localOperationOrder: 0 as const,
        seamIds: [...proposal.operation.seamIds] as [string, string],
      },
      catalogCanonicalSha256: exactCatalog.canonicalSha256,
      proposalFingerprint: proposal.deterministicFingerprint,
      phaseEAggregatePlanSha256: choices.choices.aggregatePlanSeal.canonicalSha256,
    };
    const binding = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
      current,
      catalog: exactCatalog,
      proposal,
      choices: choices.choices,
    });
    if (!binding.ok) throw new Error(JSON.stringify(binding.blockers));

    mocks.catalog.mockResolvedValue({ ok: true, catalog: exactCatalog, blockers: [] });
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) =>
        authorityEvidence(expected, selectedOperationNumber, assembly(), {
          exactTopology: {
            carrier: binding.carrier,
            seal: binding.seal,
            compositeSha256: '9'.repeat(64),
            compositeByteLength: 4096,
          },
        }),
    });
    const prepared = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
      state.host,
    ).prepare(request());
    if (!prepared.ok) throw new Error(prepared.blockers[0].detail);
    const restored = await restorePatternImportDxfPhaseESavedExactPrefillV1(prepared.prepared);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.blockers[0].detail);
    expect(restored.state.seams).toMatchObject([
      {
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          { contourId: 'front-seam', boundaryVertexIds: ['FRONT:v0', 'FRONT:v1'] },
          { contourId: 'back-seam', boundaryVertexIds: ['BACK:v1', 'BACK:v0'] },
        ],
      },
      {
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          { contourId: 'front-seam', boundaryVertexIds: ['FRONT:v2', 'FRONT:v3'] },
          { contourId: 'back-seam', boundaryVertexIds: ['BACK:v3', 'BACK:v2'] },
        ],
      },
    ]);
    expect(restored.state.documentRevisionConfirmed).toBe(false);
    expect(restored.state.physicalSurfaceConfirmed).toBe(false);
    expect(restored.state.operationConfirmed).toBe(false);
    expect(restored.state.materialSelections.every(({ confirmed }) => !confirmed)).toBe(true);
    expect(restored.state.tolerance.confirmed).toBe(false);
    expect(restored.claims.aggregatePlanSha256Origin).toBe('historical-sealed-carrier-binding');
    expect(restored.claims.aggregateMaterialToleranceChoicesReconstructed).toBe(false);
    await expect(
      restorePatternImportDxfPhaseESavedExactPrefillV1({ ...prepared.prepared }),
    ).resolves.toMatchObject({
      ok: false,
      blockers: [{ code: 'saved-preparation-unavailable' }],
    });
  });

  it('uses monotonic local generations while keeping saved document digests deterministic', async () => {
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const first = await owner.prepare(request());
    const second = await owner.prepare(request());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.preparationGeneration).toBe(1);
    expect(second.preparationGeneration).toBe(2);
    expect(first.prepared.documentAuthority.documentId).toBe(
      second.prepared.documentAuthority.documentId,
    );
    expect(first.prepared.documentAuthority.revision).toBe(
      second.prepared.documentAuthority.revision,
    );
    expect(first.prepared.assemblyTopologySha256).toBe(second.prepared.assemblyTopologySha256);
    expect(second.prepared.initialState.expectedImportGeneration).toBe(2);
  });

  it.each(['19', '00', '01'])(
    'rejects all-decimal Assembly token %s that could be a copied revision',
    async (serverAssemblyRevision) => {
      const state = harness({
        readAssembly: async ({ row: expected, selectedOperationNumber }) =>
          authorityEvidence(expected, selectedOperationNumber, assembly(), {
            serverAssemblyRevision,
          }),
      });
      const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
        state.host,
      ).prepare(request());
      expect(result.ok).toBe(false);
      expect(!result.ok && result.blockers[0].code).toBe('assembly-authority-receipt-invalid');
      expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized Assembly token before UTF-8 encoding it', async () => {
    const oversized = `asm:${'x'.repeat(509)}`;
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) =>
        authorityEvidence(expected, selectedOperationNumber, assembly(), {
          serverAssemblyRevision: oversized,
        }),
    });
    try {
      const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
        state.host,
      ).prepare(request());
      expect(result.ok).toBe(false);
      expect(!result.ok && result.blockers[0].code).toBe('assembly-authority-receipt-invalid');
      expect(encode.mock.calls.some(([value]) => value === oversized)).toBe(false);
      expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
    } finally {
      encode.mockRestore();
    }
  });

  it('new prepare supersedes an unabortable older read and only the newer generation publishes', async () => {
    let release = (): void => undefined;
    const firstRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        call += 1;
        if (call === 1) await firstRead;
        return authorityEvidence(expected, selectedOperationNumber);
      },
    });
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host);
    const stale = owner.prepare(request());
    const current = owner.prepare(request());
    const currentResult = await current;
    release();
    const staleResult = await stale;

    expect(currentResult.ok).toBe(true);
    expect(currentResult.preparationGeneration).toBe(2);
    expect(staleResult.ok).toBe(false);
    expect(!staleResult.ok && staleResult.blockers[0].code).toBe('preparation-superseded');
    expect(state.createSavedReprocessHost).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing marker', { schemaVersion: undefined }],
    ['forged schema', { schemaVersion: 'get-tech-card-projection/1' }],
    ['forged origin', { origin: 'local-form' }],
  ])('rejects a %s as an invalid authority receipt', async (_name, patch) => {
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        const receipt = authorityEvidence(expected, selectedOperationNumber) as unknown as Record<
          string,
          unknown
        >;
        if ('schemaVersion' in patch) {
          if (patch.schemaVersion === undefined) delete receipt.schemaVersion;
          else receipt.schemaVersion = patch.schemaVersion;
        }
        if ('origin' in patch) receipt.origin = patch.origin;
        return receipt as never;
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-authority-receipt-invalid');
    expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
  });

  it('rejects a forged server topology SHA before creating a reprocess capability', async () => {
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) =>
        authorityEvidence(expected, selectedOperationNumber, assembly(), {
          serverTopologySha256: '0'.repeat(64),
        }),
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-authority-receipt-invalid');
    expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
  });

  it('distinguishes server Assembly revision drift from topology drift', async () => {
    let read = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        read += 1;
        return authorityEvidence(expected, selectedOperationNumber, assembly(), {
          serverAssemblyRevision:
            read === 1 ? SERVER_ASSEMBLY_REVISION : 'assembly-revision:card-44:tx-000020',
        });
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-revision-stale-after-prepare');
  });

  it('detects seam drift under the same card lock and Assembly revision from the server SHA', async () => {
    let read = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        read += 1;
        const current = assembly();
        if (read === 2) {
          const first = current.seams[0];
          if ('seamKey' in first) first.sideA[0].range = [0.25, 0.75];
        }
        return authorityEvidence(expected, selectedOperationNumber, current);
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-topology-stale-after-prepare');
    expect(state.readAuthoritativeAssembly.mock.calls[0]?.[0].row.cardLockVersion).toBe(19);
    expect(state.readAuthoritativeAssembly.mock.calls[1]?.[0].row.cardLockVersion).toBe(19);
  });

  it('fails closed when the verified Composite exact-topology identity drifts after prepare', async () => {
    let read = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        read += 1;
        const evidence = authorityEvidence(expected, selectedOperationNumber);
        return read === 1
          ? evidence
          : {
              ...evidence,
              exactTopology: {
                ...evidence.exactTopology,
                compositeSha256: '8'.repeat(64),
              },
            };
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-topology-stale-after-prepare');
    expect(state.createSavedReprocessHost).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'anchor range',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam) seam.sideA[0].range = [0.2, 0.8];
      },
    ],
    [
      'anchor samples',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam) seam.sideA[0].samples[1] = [0.45, 0.5];
      },
    ],
    [
      'direction',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam) seam.direction = 'same';
      },
    ],
    [
      'size',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam) seam.anchoredSize = 'L';
      },
    ],
    [
      'confirmed status',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam) seam.confirmed = false;
      },
    ],
    [
      'unselected topology',
      (value: AssemblyContext) => {
        const seam = value.seams[0];
        if ('seamKey' in seam)
          value.seams.push({ ...structuredClone(seam), seamKey: 'unselected-seam' });
      },
    ],
  ])('fails closed when authoritative %s drifts after preparation', async (_name, mutate) => {
    let read = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        read += 1;
        const current = assembly();
        if (read === 2) mutate(current);
        return authorityEvidence(expected, selectedOperationNumber, current);
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-topology-stale-after-prepare');
  });

  it('fails closed when any saved-row identity is stale after preparation', async () => {
    let read = 0;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) => {
        read += 1;
        return authorityEvidence(
          read === 2 ? { ...expected, cardLockVersion: expected.cardLockVersion + 1 } : expected,
          selectedOperationNumber,
        );
      },
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('saved-row-stale-after-prepare');
  });

  it('blocks invalid saved topology before creating a reprocess capability', async () => {
    const invalid = assembly();
    const first = invalid.seams[0];
    if ('seamKey' in first) first.confirmed = false;
    const state = harness({
      readAssembly: async ({ row: expected, selectedOperationNumber }) =>
        authorityEvidence(expected, selectedOperationNumber, invalid),
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('assembly-evidence-invalid');
    expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('propagates a genuine saved reprocess failure without accepting a caller result', async () => {
    const state = harness({
      createSavedHost: () =>
        savedReprocessHost({
          readAuthoritativeRow: vi.fn(async (expected) => ({
            row: expected,
            bytes: new Uint8Array(expected.sizeBytes),
          })),
        }),
    });
    const result = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host).prepare(
      request(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('saved-reprocess-blocked');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1).toMatchObject({
      callerSuppliedReprocessOwnerAccepted: false,
      callerSuppliedReprocessResultAccepted: false,
      freshImportDocumentAuthorityUsed: false,
      confirmationPerformed: false,
      compositionBuilt: false,
    });
  });

  it('cancel and dispose are terminal publication gates for late unabortable work', async () => {
    for (const action of ['cancel', 'dispose'] as const) {
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const state = harness({
        readAssembly: async ({ row: expected, selectedOperationNumber }) => {
          await gate;
          return authorityEvidence(expected, selectedOperationNumber);
        },
      });
      const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(state.host);
      const pending = owner.prepare(request());
      owner[action]();
      release();
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(!result.ok && result.blockers[0].code).toBe(
        action === 'cancel' ? 'preparation-cancelled' : 'owner-disposed',
      );
      expect(state.createSavedReprocessHost).not.toHaveBeenCalled();
      if (action === 'dispose') {
        const after = await owner.prepare(request());
        expect(after.ok).toBe(false);
        expect(after.preparationGeneration).toBeNull();
      }
    }
  });

  it('does not publish when cancellation wins an unabortable material-loader race', async () => {
    let release = (): void => undefined;
    let materialLoadStarted = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      materialLoadStarted = resolve;
    });
    mocks.materials.mockImplementationOnce(async () => {
      materialLoadStarted();
      await gate;
      return [{ id: 'material-visual', label: 'Visual', materialRevision: 'visual-r1' }];
    });
    const owner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1(harness().host);
    const pending = owner.prepare(request());
    await started;
    owner.cancel();
    release();

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('preparation-cancelled');
    expect(isPatternImportDxfPhaseESavedRowPreparedV1(result.prepared)).toBe(false);
  });

  it('rejects dishonest SHA and hostile request accessors without invoking them', async () => {
    const dishonest = harness({
      crypto: {
        subtle: {
          digest: vi.fn(async () => new ArrayBuffer(32)),
        } as unknown as SubtleCrypto,
      },
    });
    const digestResult = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
      dishonest.host,
    ).prepare(request());
    expect(digestResult.ok).toBe(false);
    expect(!digestResult.ok && digestResult.blockers[0].code).toBe('sha256-unavailable');
    expect(dishonest.createSavedReprocessHost).not.toHaveBeenCalled();

    let invoked = false;
    const hostile = request() as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, 'row', {
      enumerable: true,
      get: () => {
        invoked = true;
        return row();
      },
    });
    const hostileHost = harness();
    const rejected = await createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
      hostileHost.host,
    ).prepare(hostile);
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.blockers[0].code).toBe('invalid-request');
    expect(invoked).toBe(false);
    expect(hostileHost.readAuthoritativeAssembly).not.toHaveBeenCalled();
  });
});
