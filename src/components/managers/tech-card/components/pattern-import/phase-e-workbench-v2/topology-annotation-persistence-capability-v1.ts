import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import {
  isPatternImportDxfProductCompositeSidecarProductionPersistenceV5,
  type PatternImportDxfProductCompositeSidecarProductionPersistenceV5,
} from './composite-sidecar-persistence-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import type { PatternImportDxfPhaseEDraftCadTopologyScopeV1 } from './draft-cad-topology-scope-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CAPABILITY_V1 =
  'pattern-import-dxf-phase-e-topology-annotation-persistence-capability/1' as const;

/**
 * Current server/storage audit.
 *
 * TechCardCallout and TechCardOperationMedia.annotations are genuine card writers, but their
 * points are media-frame coordinates in [0, 1]. They cannot round-trip a DXF contour/vertex anchor
 * or its millimetre coordinate. TechCardCallout.spec is already owned by the closed callout-purpose
 * union, so putting topology JSON there would create an unowned schema inside another feature.
 *
 * The semantic-sidecar RPC is the correct transport and CAS owner. The client now has a strict
 * Composite V5 codec and storage transaction which nests the current V4 bytes unchanged. The
 * backend contract now admits and validates the V5 media type. Runtime admission remains false
 * until a real transaction succeeds. The client enables Save only when the caller supplies the
 * genuine production persistence owner and proves that the current saved-row sidecar is V4 or V5.
 * Every Save remains verified by PUT echo and a fresh GET readback.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_AUDIT_V1 = Object.freeze({
  techCardCallout: Object.freeze({
    canonicalWriterExists: true,
    coordinateSpace: 'normalised-media-frame-0..1' as const,
    exactPatternTopologyIds: false,
    millimetreCoordinates: false,
    calloutText: true,
    usableAsTopologyAnnotationOwner: false,
    rejection:
      'The row is media-owned, and its spec JSON is owned by the closed callout-purpose schema.',
  }),
  operationMediaAnnotation: Object.freeze({
    canonicalWriterExists: true,
    coordinateSpace: 'normalised-media-frame-0..1' as const,
    exactPatternTopologyIds: false,
    millimetreCoordinates: false,
    calloutText: true,
    usableAsTopologyAnnotationOwner: false,
    rejection: 'The annotation belongs to operation media, not to one saved DXF pattern row.',
  }),
  patternRow: Object.freeze({
    stableLineKey: true,
    savedRowRevision: true,
    dxfSha256: true,
    topologyAnnotationsField: false,
    usableAsTopologyAnnotationOwner: false,
  }),
  semanticSidecar: Object.freeze({
    canonicalGetAndPutExist: true,
    exactSavedRowCasExists: true,
    exactCardLockGuardExists: true,
    assemblyRevisionAndTopologyCasExist: true,
    singleBlobPerPatternLine: true,
    currentCompositeVersion: 4,
    maxSupportedCompositeVersion: 5,
    currentTopologyAnnotationComponentExists: false,
    standaloneReplacementAllowed: false,
    clientCompositeV5CodecExists: true,
    clientCompositeV5StorageTransactionExists: true,
    serverContractCompositeV5MediaAdmissionImplemented: true,
    runtimeServerCompositeV5MediaAdmissionProven: false,
    transportReusableAfterVersionedComponentExists: true,
  }),
} as const);

/** Exact schema seam required before the existing sidecar writer can be reused. */
export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_REQUIRED_SCHEMA_SEAM_V1 = Object.freeze(
  {
    transportOwner: 'TechCardPatternSemanticSidecar' as const,
    getRpc: 'GetTechCardPatternSemanticSidecar' as const,
    putRpc: 'PutTechCardPatternSemanticSidecar' as const,
    newCompositeSchema: 'pattern-import-dxf-product-composite-sidecar-document/5' as const,
    newCompositeMediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json' as const,
    newComponentKind: 'phase-e-topology-annotations-v1' as const,
    newComponentMediaType:
      'application/vnd.grbpwr.pattern-dxf-phase-e-topology-annotations.v1+json' as const,
    preserveCurrentCompositeV4BytesExactly: true,
    canonicalJsonAndSha256Required: true,
    putEchoAndFreshGetReadbackRequired: true,
    serverMediaTypeAdmissionRequired: true,
    serverCompositeV5ValidationRequired: true,
    requiredBindings: Object.freeze([
      'techCardId',
      'scopeKey',
      'patternLineKey',
      'savedRowRevision',
      'cardLockVersion',
      'dxfSha256',
      'sourceIdentity',
      'sourceRevision',
      'sourceSha256',
      'serverAssemblyRevision',
      'assemblyTopologySha256',
    ] as const),
    requiredMeasurementFields: Object.freeze([
      'id',
      'kind',
      'pieceId',
      'pieceLineKey',
      'contourId',
      'vertexId',
      'pointMm.x',
      'pointMm.y',
      'valueMm',
    ] as const),
    requiredCalloutFields: Object.freeze([
      'id',
      'pieceId',
      'pieceLineKey',
      'contourId',
      'vertexId',
      'pointMm.x',
      'pointMm.y',
      'text',
    ] as const),
    protoRpcShapeChangeRequired: false,
    explanation:
      'The existing sidecar RPC carries opaque canonical bytes and exact CAS bindings. Composite V5 and backend admission now exist; each UI Save must still receive the genuine production owner and a fresh current V4/V5 authority.',
  } as const,
);

export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1 = Object.freeze({
  capabilityExplicit: true,
  currentCanonicalWriterAvailable: true,
  currentCanonicalReadbackAvailable: true,
  serverContractCompositeV5AdmissionImplemented: true,
  runtimeServerMediaAdmissionProven: false,
  durablePersistenceClaimed: false,
  manualSaveActionAllowed: false,
  autosaveAllowed: false,
  localStorageAllowed: false,
  staleCardFailsClosed: true,
  stalePatternScopeFailsClosed: true,
  staleSourceIdentityFailsClosed: true,
  staleSavedRowRevisionFailsClosed: true,
  staleCardLockVersionFailsClosed: true,
  staleAssemblyRevisionFailsClosed: true,
  staleAssemblyTopologyFailsClosed: true,
  existingSidecarTransportReusableAfterSchemaSeam: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseETopologyAnnotationPersistenceBlockerCodeV1 =
  | 'invalid-authority'
  | 'stale-card'
  | 'stale-pattern-scope'
  | 'stale-source-identity'
  | 'stale-source-revision'
  | 'stale-saved-row-revision'
  | 'stale-card-lock-version'
  | 'stale-server-assembly-revision'
  | 'stale-assembly-topology'
  | 'current-composite-v4-or-v5-unavailable'
  | 'production-v5-writer-unavailable';

export type PatternImportDxfPhaseETopologyAnnotationPersistenceAuthorityV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  sourceIdentity: string;
  sourceRevision: string;
  sourceSha256: string;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
}>;

export type PatternImportDxfPhaseETopologyAnnotationPersistenceCurrentV1 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  savedRowRevision: number;
  cardLockVersion: number;
  dxfSha256: string;
  sourceIdentity: string;
  sourceRevision: string;
  sourceSha256: string;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
}>;

export type PatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1 =
  | Readonly<{
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CAPABILITY_V1;
      status: 'unavailable';
      durableSaveAvailable: false;
      durableReadbackAvailable: false;
      saveActionAllowed: false;
      autosaveAllowed: false;
      persistence: null;
      blocker: Readonly<{
        code: PatternImportDxfPhaseETopologyAnnotationPersistenceBlockerCodeV1;
        detail: string;
      }>;
      requiredSchemaSeam: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_REQUIRED_SCHEMA_SEAM_V1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1;
    }>
  | Readonly<{
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CAPABILITY_V1;
      status: 'available';
      durableSaveAvailable: true;
      durableReadbackAvailable: true;
      saveActionAllowed: true;
      autosaveAllowed: false;
      persistence: PatternImportDxfProductCompositeSidecarProductionPersistenceV5;
      blocker: null;
      requiredSchemaSeam: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_REQUIRED_SCHEMA_SEAM_V1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;

function unavailable(
  code: PatternImportDxfPhaseETopologyAnnotationPersistenceBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CAPABILITY_V1,
    status: 'unavailable',
    durableSaveAvailable: false,
    durableReadbackAvailable: false,
    saveActionAllowed: false,
    autosaveAllowed: false,
    persistence: null,
    blocker: Object.freeze({ code, detail }),
    requiredSchemaSeam: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_REQUIRED_SCHEMA_SEAM_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1,
  });
}

function validAuthority(
  authority: PatternImportDxfPhaseETopologyAnnotationPersistenceAuthorityV1,
): boolean {
  const { row } = authority;
  return (
    Number.isSafeInteger(row.techCardId) &&
    row.techCardId > 0 &&
    !!row.scopeKey &&
    !!row.patternLineKey &&
    Number.isSafeInteger(row.revision) &&
    row.revision > 0 &&
    Number.isSafeInteger(row.cardLockVersion) &&
    row.cardLockVersion >= 0 &&
    SHA256.test(row.sha256) &&
    !!authority.sourceIdentity &&
    !!authority.sourceRevision &&
    SHA256.test(authority.sourceSha256) &&
    !!authority.serverAssemblyRevision &&
    SHA256.test(authority.assemblyTopologySha256)
  );
}

/**
 * Production/session boundary for an explicit Save action. The ordered comparisons are
 * intentional: stale card/source/revision input is rejected before the storage owner is exposed.
 */
export function resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1(input: {
  scope: PatternImportDxfPhaseEDraftCadTopologyScopeV1;
  expected: PatternImportDxfPhaseETopologyAnnotationPersistenceAuthorityV1;
  current: PatternImportDxfPhaseETopologyAnnotationPersistenceCurrentV1;
  currentCompositeMediaType?: string | null;
  productionPersistence?: unknown;
}): PatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1 {
  const { scope, expected, current } = input;
  if (!validAuthority(expected))
    return unavailable(
      'invalid-authority',
      'Topology annotation persistence requires one exact saved-row and assembly authority.',
    );
  if (
    current.techCardId !== expected.row.techCardId ||
    current.patternLineKey !== expected.row.patternLineKey
  )
    return unavailable(
      'stale-card',
      'The current card or pattern row differs from the annotation authority.',
    );
  if (scope.scopeKey !== expected.row.scopeKey || current.scopeKey !== expected.row.scopeKey)
    return unavailable(
      'stale-pattern-scope',
      'The current material scope differs from the annotation authority.',
    );
  if (
    scope.sourceIdentity !== expected.sourceIdentity ||
    scope.session.sourceIdentity !== expected.sourceIdentity ||
    current.sourceIdentity !== expected.sourceIdentity
  )
    return unavailable(
      'stale-source-identity',
      'The current DXF/catalog projection identity differs from the annotation authority.',
    );
  if (
    current.sourceRevision !== expected.sourceRevision ||
    current.sourceSha256 !== expected.sourceSha256
  )
    return unavailable(
      'stale-source-revision',
      'The current DXF source revision or SHA differs from the annotation authority.',
    );
  if (
    current.savedRowRevision !== expected.row.revision ||
    current.dxfSha256 !== expected.row.sha256
  )
    return unavailable(
      'stale-saved-row-revision',
      'The saved pattern row revision or DXF digest changed after annotations were authored.',
    );
  if (current.cardLockVersion !== expected.row.cardLockVersion)
    return unavailable(
      'stale-card-lock-version',
      'The card lock version changed after annotations were authored.',
    );
  if (current.serverAssemblyRevision !== expected.serverAssemblyRevision)
    return unavailable(
      'stale-server-assembly-revision',
      'The server assembly revision changed after annotations were authored.',
    );
  if (current.assemblyTopologySha256 !== expected.assemblyTopologySha256)
    return unavailable(
      'stale-assembly-topology',
      'The canonical assembly topology changed after annotations were authored.',
    );
  if (
    input.currentCompositeMediaType !==
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 &&
    input.currentCompositeMediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
  )
    return unavailable(
      'current-composite-v4-or-v5-unavailable',
      'Save requires a fresh current Composite V4 or V5 sidecar for this exact saved row. The editable exact-two workbench currently owns Composite V3 and cannot write annotations through V5.',
    );
  if (
    !isPatternImportDxfProductCompositeSidecarProductionPersistenceV5(input.productionPersistence)
  )
    return unavailable(
      'production-v5-writer-unavailable',
      'A genuine production Composite V5 persistence owner is required before Save can be shown.',
    );
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CAPABILITY_V1,
    status: 'available' as const,
    durableSaveAvailable: true as const,
    durableReadbackAvailable: true as const,
    saveActionAllowed: true as const,
    autosaveAllowed: false as const,
    persistence: input.productionPersistence,
    blocker: null,
    requiredSchemaSeam: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_REQUIRED_SCHEMA_SEAM_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1,
  });
}
