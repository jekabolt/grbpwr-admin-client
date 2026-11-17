import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
  type PatternImportDxfProductPhaseEMultiseamChoicesV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from '../../pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_REQUEST_V1,
  type PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingRequestV1,
  type PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1,
  type PatternImportDxfProductPhaseEExactTopologyRestoreRequestV1,
} from './pattern-import-dxf-product-phase-e-exact-topology-binding-v1';

const REQUIRED_EXPLICIT_FIELDS = [
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const;

function vertices(prefix: string) {
  return [0, 1, 2, 3].map((ordinal) => ({
    ordinal,
    vertexId: `${prefix}:v${ordinal}`,
    normalizedArc: ordinal / 4,
  }));
}

async function catalog(): Promise<PatternImportDxfProductPhaseEAuthoringCatalogV1> {
  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: 120,
    scopeKey: 'main',
    sizeToken: 'M',
    sourceFileId: 'source:file-120',
    sizeSelectionCanonicalSha256: '1'.repeat(64),
    pieces: [
      {
        pieceId: 'FRONT',
        pieceLineKey: 'piece-front',
        contours: [
          {
            contourId: 'front:sewing',
            role: 'sewing-boundary' as const,
            geometry: { kind: 'seam' as const },
            closed: true,
            boundaryVertices: vertices('front'),
          },
        ],
      },
      {
        pieceId: 'BACK',
        pieceLineKey: 'piece-back',
        contours: [
          {
            contourId: 'back:sewing',
            role: 'sewing-boundary' as const,
            geometry: { kind: 'seam' as const },
            closed: true,
            boundaryVertices: vertices('back'),
          },
        ],
      },
    ],
    requiredExplicitFields: REQUIRED_EXPLICIT_FIELDS,
    geometryCoordinatesExposed: false as const,
    rawDxfExposed: false as const,
    assemblyInferred: false as const,
    productionReady: false as const,
  };
  const canonicalSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsigned,
    globalThis.crypto,
  );
  if (!canonicalSha256) throw new Error('catalog SHA unavailable');
  return { ...unsigned, canonicalSha256 };
}

function anchor(pieceLineKey: string, suffix: string) {
  return {
    pieceLineKey,
    edgeHint: `${pieceLineKey}#${suffix}`,
    range: [0, 1] as const,
    lenMm: 100,
    contourSig: `${pieceLineKey}:${suffix}`,
  };
}

function proposal(catalogValue: PatternImportDxfProductPhaseEAuthoringCatalogV1) {
  const result = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(catalogValue, {
    selectedOperationNumber: 120,
    operations: [
      {
        authoringOperationId: 'operation:side-seams',
        number: 120,
        work: 'overlock_serge',
        phaseEKind: 'stitch',
        inputKeys: ['piece-front', 'piece-back'],
        outputUnitKey: 'shell',
        outputUnitName: 'Shell',
        seamKeys: ['side-open', 'side-close'],
      },
    ],
    seams: [
      {
        seamKey: 'side-open',
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'open')],
        sideB: [anchor('piece-back', 'open')],
      },
      {
        seamKey: 'side-close',
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'close')],
        sideB: [anchor('piece-back', 'close')],
      },
    ],
  });
  if (!result.ok) throw new Error(result.blockers[0].detail);
  return result.proposal;
}

async function choices(
  catalogValue: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposalValue: PatternImportDxfProductPhaseEMultiseamProposalV2,
): Promise<PatternImportDxfProductPhaseEMultiseamChoicesV2> {
  const initial = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
    catalogValue,
    proposalValue,
    { documentId: 'document:120', revision: 'revision:7' },
    1,
  );
  const state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = {
    ...initial,
    documentRevisionConfirmed: true,
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    physicalSurfaceConfirmed: true,
    operationStage: 4,
    operationConfirmed: true,
    seams: [
      {
        seamId: 'side-open',
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          {
            pieceId: 'FRONT',
            contourId: 'front:sewing',
            boundaryVertexIds: ['front:v0', 'front:v1'],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back:sewing',
            boundaryVertexIds: ['back:v1', 'back:v0'],
            direction: 'reverse',
            confirmed: true,
          },
        ],
      },
      {
        seamId: 'side-close',
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          {
            pieceId: 'FRONT',
            contourId: 'front:sewing',
            boundaryVertexIds: ['front:v2', 'front:v3'],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back:sewing',
            boundaryVertexIds: ['back:v3', 'back:v2'],
            direction: 'reverse',
            confirmed: true,
          },
        ],
      },
    ],
    materialSelections: [
      { pieceId: 'FRONT', optionId: 'material-front', confirmed: true },
      { pieceId: 'BACK', optionId: 'material-back', confirmed: true },
    ],
    tolerance: {
      endpointMm: 0,
      fullLengthMm: 0.001,
      fullLengthRelative: 0,
      confirmed: true,
    },
  };
  const result = await buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
    catalogValue,
    proposalValue,
    state,
    [
      { id: 'material-front', label: 'Front', materialRevision: 'material:front:r1' },
      { id: 'material-back', label: 'Back', materialRevision: 'material:back:r1' },
    ],
    globalThis.crypto,
  );
  if (!result.ok) throw new Error(result.blockers.map(({ detail }) => detail).join('; '));
  return result.choices;
}

export type PatternImportDxfProductPhaseEExactTopologyFixtureV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
  buildRequest: PatternImportDxfProductPhaseEExactTopologyBindingRequestV1;
  restoreRequest: (
    owner: PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  ) => PatternImportDxfProductPhaseEExactTopologyRestoreRequestV1;
}>;

export async function createPatternImportDxfProductPhaseEExactTopologyFixtureV1(): Promise<PatternImportDxfProductPhaseEExactTopologyFixtureV1> {
  const catalogValue = await catalog();
  const proposalValue = proposal(catalogValue);
  const choicesValue = await choices(catalogValue, proposalValue);
  const row: DxfProductSavedRowIdentityV1 = {
    techCardId: 120,
    scopeKey: 'main',
    patternLineKey: 'pattern:main',
    revision: 7,
    cardLockVersion: 11,
    url: '/patterns/main.dxf',
    sizeBytes: 4_096,
    sha256: '2'.repeat(64),
  };
  const current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1 = {
    row,
    serverAssemblyRevision: 'assembly-revision:card-120:tx-000007',
    assemblyTopologySha256: '3'.repeat(64),
    selectedOperation: {
      sourceOperationNumber: proposalValue.operation.sourceOperationNumber,
      authoringOperationId: proposalValue.operation.authoringOperationId,
      localOperationOrder: 0,
      seamIds: [...proposalValue.operation.seamIds],
    },
    catalogCanonicalSha256: catalogValue.canonicalSha256,
    proposalFingerprint: proposalValue.deterministicFingerprint,
    phaseEAggregatePlanSha256: choicesValue.aggregatePlanSeal.canonicalSha256,
  };
  const buildRequest: PatternImportDxfProductPhaseEExactTopologyBindingRequestV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
    current,
    catalog: catalogValue,
    proposal: proposalValue,
    choices: choicesValue,
  };
  return {
    row,
    current,
    catalog: catalogValue,
    proposal: proposalValue,
    choices: choicesValue,
    buildRequest,
    restoreRequest: (owner) => ({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_REQUEST_V1,
      bindingOwner: owner,
      current,
      catalog: catalogValue,
      proposal: proposalValue,
    }),
  };
}
