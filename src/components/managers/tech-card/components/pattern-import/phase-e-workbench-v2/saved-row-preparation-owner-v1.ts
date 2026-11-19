import {
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  type PatternImportDxfProductMultiseamSavedRowEvidenceV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import type {
  PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1,
  PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedReprocessHostV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  createDxfProductSavedNativeReprocessOwnerV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  projectPatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
  type PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import {
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
  type PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type AssemblyContext,
  type CardDraft,
} from 'lib/pattern-import/types';

import { loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1 } from '../phase-e-workbench-beta-material-presets-v1';
import {
  adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2,
  type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
} from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import {
  createPatternImportDxfPhaseEDraftCadCompileSourceV1,
  type PatternImportDxfPhaseEDraftCadCompileSourceV1,
} from './draft-cad-compile-source-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical,
  computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1,
} from './saved-assembly-topology-hash-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1 =
  'pattern-import-dxf-phase-e-saved-row-preparation-request/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_DOCUMENT_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-saved-row-document-authority/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARED_V1 =
  'pattern-import-dxf-phase-e-saved-row-prepared/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_OWNER_V1 =
  'pattern-import-dxf-phase-e-saved-row-preparation-owner/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_CONFIRMED_COMPILER_SOURCE_REQUEST_V1 =
  'pattern-import-dxf-phase-e-saved-row-confirmed-compiler-source-request/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1 =
  'pattern-import-dxf-phase-e-server-transactional-saved-assembly/1' as const;
export { PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1 } from './saved-assembly-topology-hash-v1';

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
// Assembly Order rows are tiny in production. These fail-closed ceilings leave ample headroom for
// genuine cards while bounding host-controlled reflection, detachment and hashing before allocation.
const MAX_ASSEMBLY_DEPTH = 24;
const MAX_ASSEMBLY_NODES = 25_000;
const MAX_ASSEMBLY_PROPERTIES = 100_000;
const MAX_ASSEMBLY_ARRAY_LENGTH = 4_096;
const MAX_ASSEMBLY_STRING_BYTES = 16 * 1_024;
const MAX_ASSEMBLY_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAX_ROW_STABLE_ID_LENGTH = 256;
const MAX_ROW_URL_LENGTH = 4_096;
const MAX_SERVER_ASSEMBLY_REVISION_BYTES = 512;
const encoder = new TextEncoder();

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;
type SuccessfulAdapter = Extract<
  PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
  { ok: true }
>;

export type PatternImportDxfPhaseESavedRowPreparationRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1;
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
}>;

export type PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1;
  origin: 'server-transactional-saved-assembly';
  /**
   * Opaque token minted by the future transactional server read. The explicit non-decimal wire
   * contract prevents accidentally substituting a row, pattern or card-lock revision.
   */
  serverAssemblyRevision: string;
  /** Server canonical SHA-256 of the normalized selected operation and its exact two seams. */
  serverTopologySha256: string;
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  assembly: AssemblyContext;
  /** Client-decoded and verified Composite V3 exact-topology subdocument; never a server summary. */
  exactTopology: Readonly<{
    carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
    seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
    compositeSha256: string;
    compositeByteLength: number;
  }>;
}>;

export type PatternImportDxfPhaseESavedRowInitialAssemblyEvidenceV1 = Omit<
  PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1,
  'exactTopology'
> &
  Readonly<{ exactTopology: null; semanticV1Sha256: string }>;

type ReadAssemblyEvidence<T> = (
  expected: Readonly<{ row: DxfProductSavedRowIdentityV1; selectedOperationNumber: number }>,
  signal: AbortSignal,
) => Promise<T>;

export type PatternImportDxfPhaseESavedRowPreparationHostV1 = Readonly<{
  /** A fresh host capability is requested for every preparation generation. */
  createSavedReprocessHost: () => DxfProductSavedReprocessHostV1;
  /**
   * Must be backed by a future server transactional read. A GetTechCard projection, local form or
   * optimistic seam overlay cannot satisfy this capability.
   */
  readAuthoritativeAssembly: ReadAssemblyEvidence<PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1>;
  readInitialAssembly?: ReadAssemblyEvidence<PatternImportDxfPhaseESavedRowInitialAssemblyEvidenceV1>;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfPhaseESavedRowDocumentAuthorityV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_DOCUMENT_AUTHORITY_V1;
  origin: 'verified-saved-row';
  row: DxfProductSavedRowIdentityV1;
  sizeSelectionCanonicalSha256: string;
  catalogCanonicalSha256: string;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  documentId: string;
  revision: string;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1 = Object.freeze({
  freshSavedReprocessOwnerCreated: true,
  nativeSavedReprocessOwnerCreated: true,
  compilerSourceOwnerHeldPrivately: true,
  exactReplayDraftIdentityPreserved: true,
  confirmedCompilerSourceOneShot: true,
  previewCompilerSourceExposed: false,
  callerSuppliedReprocessOwnerAccepted: false,
  callerSuppliedReprocessResultAccepted: false,
  authoritativeAssemblyReadBeforeAndAfter: true,
  verifiedCompositeExactTopologyReadBeforeAndAfter: true,
  serverDecodedExactTopologySummaryAccepted: false,
  exactSavedRowEightFieldsBound: true,
  savedRevisionUsedAsPatternVersion: false,
  serverAssemblyRevisionRequired: true,
  serverCanonicalTopologySha256Required: true,
  serverCanonicalTopologySha256Verified: true,
  getTechCardProjectionAccepted: false,
  localFormOrOptimisticOverlayAccepted: false,
  transactionalAssemblyRpcIntegrated: false,
  selectedOperationAndBothStoredSeamsBound: true,
  fullStoredAnchorEvidenceCompared: true,
  assemblyTopologySha256Derived: true,
  localSavedRowDocumentAuthorityDerived: true,
  freshImportDocumentAuthorityUsed: false,
  localPreparationGenerationBound: true,
  twoSeamIdentityPieceAndDirectionPrefilled: true,
  storedAnchorRangePromotedToPhaseDGeometryAuthority: false,
  contourOrVertexChoiceInferred: false,
  nearestGeometryRecoveryUsed: false,
  rawDxfReturned: false,
  rawDxfRetained: false,
  draftCadCompileSourceRawDxfFree: true,
  confirmationPerformed: false,
  compositionBuilt: false,
  sidecarRead: true,
  sidecarWritten: false,
  persistenceIntegrated: false,
  placementIntegrated: false,
  previewReady: false,
  runtimeReady: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1,
  freshSavedReprocessOwnerCreated: false as const,
  nativeSavedReprocessOwnerCreated: false as const,
  compilerSourceOwnerHeldPrivately: false as const,
  exactReplayDraftIdentityPreserved: false as const,
  authoritativeAssemblyReadBeforeAndAfter: false as const,
  verifiedCompositeExactTopologyReadBeforeAndAfter: false as const,
  exactSavedRowEightFieldsBound: false as const,
  selectedOperationAndBothStoredSeamsBound: false as const,
  fullStoredAnchorEvidenceCompared: false as const,
  assemblyTopologySha256Derived: false as const,
  serverCanonicalTopologySha256Verified: false as const,
  localSavedRowDocumentAuthorityDerived: false as const,
  localPreparationGenerationBound: false as const,
  twoSeamIdentityPieceAndDirectionPrefilled: false as const,
  draftCadCompileSourceRawDxfFree: false as const,
  sidecarRead: false as const,
});

export type PatternImportDxfPhaseESavedRowPreparationBlockerCodeV1 =
  | 'invalid-request'
  | 'owner-disposed'
  | 'preparation-cancelled'
  | 'preparation-superseded'
  | 'assembly-read-failed'
  | 'assembly-authority-receipt-invalid'
  | 'assembly-evidence-invalid'
  | 'saved-row-mismatch-before-prepare'
  | 'saved-row-stale-after-prepare'
  | 'assembly-revision-stale-after-prepare'
  | 'assembly-topology-stale-after-prepare'
  | 'saved-reprocess-host-invalid'
  | 'saved-reprocess-blocked'
  | 'draft-cad-compile-source-blocked'
  | 'scope-binding-blocked'
  | 'size-binding-blocked'
  | 'piece-pair-binding-blocked'
  | 'phase-d-selection-blocked'
  | 'catalog-blocked'
  | 'catalog-piece-pair-mismatch'
  | 'proposal-blocked'
  | 'projection-blocked'
  | 'material-options-blocked'
  | 'sha256-unavailable'
  | 'workbench-state-blocked'
  | 'unexpected-preparation-failure';

export type PatternImportDxfPhaseESavedRowPreparationBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseESavedRowPreparationBlockerCodeV1;
  detail: string;
}>;

declare const preparedBrand: unique symbol;
export type PatternImportDxfPhaseESavedRowPreparedV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARED_V1;
  origin: 'verified-saved-row';
  preparationGeneration: number;
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  scopeKey: string;
  sizeToken: string;
  pieceLineKeys: readonly [string, string];
  pieceIds: readonly [string, string];
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  topology: SuccessfulAdapter['existingAssembly'];
  exactTopology: PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1['exactTopology'];
  draftCadCompileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  initialState: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  documentAuthority: PatternImportDxfPhaseESavedRowDocumentAuthorityV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1;
  readonly [preparedBrand]: never;
}>;

const INITIAL_PREPARATION_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1,
  verifiedCompositeExactTopologyReadBeforeAndAfter: false as const,
  compilerSourceOwnerHeldPrivately: false as const,
  confirmedCompilerSourceOneShot: false as const,
  semanticV1VerifiedBeforeAndAfter: true as const,
});

export type PatternImportDxfPhaseESavedRowInitialPreparedV1 = Omit<
  PatternImportDxfPhaseESavedRowPreparedV1,
  'exactTopology' | 'claims'
> &
  Readonly<{
    exactTopology: null;
    semanticV1Sha256: string;
    claims: typeof INITIAL_PREPARATION_CLAIMS;
  }>;

export type PatternImportDxfPhaseESavedRowWorkbenchPreparedV1 =
  | PatternImportDxfPhaseESavedRowPreparedV1
  | PatternImportDxfPhaseESavedRowInitialPreparedV1;

export type PatternImportDxfPhaseESavedRowPreparationResultV1<
  Prepared extends
    PatternImportDxfPhaseESavedRowWorkbenchPreparedV1 = PatternImportDxfPhaseESavedRowPreparedV1,
> =
  | Readonly<{
      ok: true;
      preparationGeneration: number;
      prepared: Prepared;
      blockers: readonly [];
      claims: Prepared['claims'];
    }>
  | Readonly<{
      ok: false;
      preparationGeneration: number | null;
      prepared: null;
      blockers: readonly [PatternImportDxfPhaseESavedRowPreparationBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type PatternImportDxfPhaseESavedRowVerifiedPersistenceV1 = Readonly<{
  status: 'verified-exact-topology-persisted';
  previewReady: false;
  persistence: 'verified';
  composition: null;
  blockers: readonly [];
}>;

export type PatternImportDxfPhaseESavedRowConfirmedCompilerSourceRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_CONFIRMED_COMPILER_SOURCE_REQUEST_V1;
  prepared: PatternImportDxfPhaseESavedRowPreparedV1;
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>;
  persistence: PatternImportDxfPhaseESavedRowVerifiedPersistenceV1;
  signal: AbortSignal;
}>;

export type PatternImportDxfPhaseESavedRowConfirmedCompilerSourceInputV1 = Readonly<{
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
}>;

export type PatternImportDxfPhaseESavedRowConfirmedCompilerSourceBlockerCodeV1 =
  | 'invalid-confirmation'
  | 'stale-preparation'
  | 'source-already-consumed'
  | 'consumer-failed';

export type PatternImportDxfPhaseESavedRowConfirmedCompilerSourceResultV1<T> =
  | Readonly<{ ok: true; value: T; blockers: readonly [] }>
  | Readonly<{
      ok: false;
      value: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export type PatternImportDxfPhaseESavedRowConfirmedCompilerSourceConsumerV1<T> = (
  input: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceInputV1,
) => T | Promise<T>;

type ActivePreparation = {
  generation: number;
  controller: AbortController;
  invalidatedBy: 'cancelled' | 'superseded' | 'disposed' | null;
  reprocessOwner: ReturnType<typeof createDxfProductSavedNativeReprocessOwnerV1> | null;
};

type PreparedCompilerSourceState = {
  status: 'available' | 'revoked' | 'consumed';
  draft: CardDraft | null;
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1 | null;
};

class PreparationFailure extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseESavedRowPreparationBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

const genuinePrepared = new WeakSet<object>();

function fail(code: PatternImportDxfPhaseESavedRowPreparationBlockerCodeV1, detail: string): never {
  throw new PreparationFailure(code, detail);
}

function blocked(
  error: unknown,
  generation: number | null,
): PatternImportDxfPhaseESavedRowPreparationResultV1 {
  const failure =
    error instanceof PreparationFailure
      ? error
      : new PreparationFailure(
          'unexpected-preparation-failure',
          'Saved-row Phase-E preparation failed.',
        );
  return Object.freeze({
    ok: false as const,
    preparationGeneration: generation,
    prepared: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [PatternImportDxfPhaseESavedRowPreparationBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

function confirmedCompilerSourceBlocked<T>(
  code: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseESavedRowConfirmedCompilerSourceResultV1<T> {
  return Object.freeze({
    ok: false as const,
    value: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{
        code: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function savedCompositionRow(
  row: DxfProductSavedRowIdentityV1,
): PatternImportDxfProductMultiseamSavedRowEvidenceV2 {
  return Object.freeze({
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    dxfSha256: row.sha256,
    patternVersion: row.revision,
    cardLockVersion: row.cardLockVersion,
  });
}

function isVerifiedPersistence(
  value: unknown,
): value is PatternImportDxfPhaseESavedRowVerifiedPersistenceV1 {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = ['blockers', 'composition', 'persistence', 'previewReady', 'status'].sort();
    const actual = Object.keys(descriptors).sort();
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Reflect.ownKeys(descriptors).length !== expected.length ||
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index]) ||
      actual.some((key) => !descriptors[key]?.enumerable || !('value' in descriptors[key]))
    )
      return false;
    const receipt = value as PatternImportDxfPhaseESavedRowVerifiedPersistenceV1;
    return (
      receipt.status === 'verified-exact-topology-persisted' &&
      receipt.previewReady === false &&
      receipt.persistence === 'verified' &&
      receipt.composition === null &&
      Array.isArray(receipt.blockers) &&
      receipt.blockers.length === 0
    );
  } catch {
    return false;
  }
}

function choicesExactMatchPrepared(
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>,
  prepared: PatternImportDxfPhaseESavedRowPreparedV1,
): boolean {
  try {
    return (
      choices.ok === true &&
      Array.isArray(choices.blockers) &&
      choices.blockers.length === 0 &&
      choices.choices.importGeneration === prepared.preparationGeneration &&
      choices.choices.documentId === prepared.documentAuthority.documentId &&
      choices.choices.revision === prepared.documentAuthority.revision &&
      choices.choices.expectedCatalogCanonicalSha256 === prepared.catalog.canonicalSha256 &&
      choices.choices.expectedProposalFingerprint === prepared.proposal.deterministicFingerprint &&
      typeof choices.choices.aggregatePlanSeal?.canonicalSha256 === 'string' &&
      SHA256.test(choices.choices.aggregatePlanSeal.canonicalSha256)
    );
  } catch {
    return false;
  }
}

function buildConfirmedCompositionRequest(
  prepared: PatternImportDxfPhaseESavedRowPreparedV1,
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>,
  draft: CardDraft,
): PatternImportDxfProductMultiseamMappingCompositionRequestV2 {
  // Chronology deliberately compares two independently captured immutable observations. Reusing
  // one object would make `prepared.row === current.row` and fail closed even when their canonical
  // evidence is identical.
  const preparedRow = savedCompositionRow(prepared.row);
  const currentRow = savedCompositionRow(prepared.row);
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
    draft,
    selection: prepared.selection,
    catalog: prepared.catalog,
    proposal: prepared.proposal,
    choices: choices.choices,
    prepared: Object.freeze({
      importGeneration: prepared.preparationGeneration,
      row: preparedRow,
      sizeSelectionSha256: prepared.selection.selection.canonicalSha256,
      catalogCanonicalSha256: prepared.catalog.canonicalSha256,
      proposalFingerprint: prepared.proposal.deterministicFingerprint,
      phaseEPlanSha256: choices.choices.aggregatePlanSeal.canonicalSha256,
      documentId: prepared.documentAuthority.documentId,
      revision: prepared.documentAuthority.revision,
    }),
    current: Object.freeze({
      importGeneration: prepared.preparationGeneration,
      row: currentRow,
    }),
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function same(left: unknown, right: unknown): boolean {
  try {
    return canonical(left) === canonical(right);
  } catch {
    return false;
  }
}

function descriptorRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(descriptors).length > 0) return null;
    const actual = Object.keys(descriptors).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
      return null;
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      Object.defineProperty(output, key, {
        value: descriptor.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  } catch {
    return null;
  }
}

type AssemblyScanState = {
  nodes: number;
  properties: number;
  canonicalBytes: number;
  seen: Set<object>;
};

function detachBoundedAssembly(value: unknown): AssemblyContext | null {
  const state: AssemblyScanState = {
    nodes: 0,
    properties: 0,
    canonicalBytes: 0,
    seen: new Set<object>(),
  };
  const account = (fragment: string) => {
    state.canonicalBytes += encoder.encode(fragment).byteLength;
    if (state.canonicalBytes > MAX_ASSEMBLY_CANONICAL_BYTES) throw new TypeError();
  };
  const detach = (candidate: unknown, depth: number): unknown => {
    if (depth > MAX_ASSEMBLY_DEPTH) throw new TypeError();
    if (candidate === null || typeof candidate === 'boolean') {
      account(JSON.stringify(candidate));
      return candidate;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) throw new TypeError();
      account(JSON.stringify(candidate));
      return candidate;
    }
    if (typeof candidate === 'string') {
      if (
        candidate.length > MAX_ASSEMBLY_STRING_BYTES ||
        encoder.encode(candidate).byteLength > MAX_ASSEMBLY_STRING_BYTES
      )
        throw new TypeError();
      account(JSON.stringify(candidate));
      return candidate;
    }
    if (!candidate || typeof candidate !== 'object' || state.seen.has(candidate))
      throw new TypeError();
    state.seen.add(candidate);
    state.nodes += 1;
    if (state.nodes > MAX_ASSEMBLY_NODES) throw new TypeError();

    const array = Array.isArray(candidate);
    let capturedArrayLength: number | null = null;
    if (array) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(candidate, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor)) throw new TypeError();
      const length = lengthDescriptor.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ASSEMBLY_ARRAY_LENGTH)
        throw new TypeError();
      capturedArrayLength = length;
    }
    const prototype = Object.getPrototypeOf(candidate);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(descriptors);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key === 'symbol')
    )
      throw new TypeError();

    if (array) {
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !('value' in lengthDescriptor)) throw new TypeError();
      const length = lengthDescriptor.value;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length !== capturedArrayLength ||
        keys.length !== length + 1
      )
        throw new TypeError();
      const output: unknown[] = [];
      account('[');
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new TypeError();
        if (index > 0) account(',');
        output.push(detach(descriptor.value, depth + 1));
      }
      state.properties += length;
      account(']');
      if (state.properties > MAX_ASSEMBLY_PROPERTIES) throw new TypeError();
      return output;
    }

    const output = Object.create(null) as Record<string, unknown>;
    const stringKeys = keys as string[];
    state.properties += stringKeys.length;
    if (state.properties > MAX_ASSEMBLY_PROPERTIES) throw new TypeError();
    account('{');
    stringKeys.sort();
    stringKeys.forEach((key, index) => {
      const descriptor = descriptors[key];
      if (
        key.length > MAX_ASSEMBLY_STRING_BYTES ||
        encoder.encode(key).byteLength > MAX_ASSEMBLY_STRING_BYTES ||
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      )
        throw new TypeError();
      if (index > 0) account(',');
      account(JSON.stringify(key));
      account(':');
      Object.defineProperty(output, key, {
        value: detach(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });
    account('}');
    return output;
  };

  try {
    const detached = detach(value, 0);
    canonical(detached, MAX_ASSEMBLY_CANONICAL_BYTES);
    return detached as AssemblyContext;
  } catch {
    return null;
  }
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > MAX_ROW_URL_LENGTH) return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  const lower = value.trimStart().toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('javascript:');
}

function validRowStableId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_ROW_STABLE_ID_LENGTH && STABLE_ID.test(value)
  );
}

function validServerAssemblyRevision(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false;
  if (value.length > MAX_SERVER_ASSEMBLY_REVISION_BYTES) return false;
  if (encoder.encode(value).byteLength > MAX_SERVER_ASSEMBLY_REVISION_BYTES) return false;
  if (/^[0-9]+$/.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

function detachRow(value: unknown): DxfProductSavedRowIdentityV1 | null {
  const row = descriptorRecord(value, [
    'techCardId',
    'scopeKey',
    'patternLineKey',
    'revision',
    'cardLockVersion',
    'url',
    'sizeBytes',
    'sha256',
  ]);
  if (
    !row ||
    !Number.isSafeInteger(row.techCardId) ||
    Number(row.techCardId) <= 0 ||
    !validRowStableId(row.scopeKey) ||
    !validRowStableId(row.patternLineKey) ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) <= 0 ||
    !Number.isSafeInteger(row.cardLockVersion) ||
    Number(row.cardLockVersion) < 0 ||
    !validUrl(row.url) ||
    !Number.isSafeInteger(row.sizeBytes) ||
    Number(row.sizeBytes) <= 0 ||
    typeof row.sha256 !== 'string' ||
    !SHA256.test(row.sha256)
  )
    return null;
  return Object.freeze({
    ...row,
    revision: row.revision,
    cardLockVersion: Number(row.cardLockVersion) === 0 ? 0 : row.cardLockVersion,
  }) as DxfProductSavedRowIdentityV1;
}

function detachRequest(value: unknown): PatternImportDxfPhaseESavedRowPreparationRequestV1 {
  const request = descriptorRecord(value, ['schemaVersion', 'row', 'selectedOperationNumber']);
  const row = detachRow(request?.row);
  if (
    !request ||
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1 ||
    !row ||
    !Number.isSafeInteger(request.selectedOperationNumber) ||
    Number(request.selectedOperationNumber) <= 0
  )
    fail(
      'invalid-request',
      'An exact saved-row identity and positive selected operation number are required.',
    );
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1,
    row,
    selectedOperationNumber: request.selectedOperationNumber as number,
  });
}

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  try {
    return await computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      domain,
      value,
      crypto,
    );
  } catch {
    fail(
      'sha256-unavailable',
      'Saved-row preparation evidence is not canonical or Web Crypto SHA-256 is unavailable.',
    );
  }
}

function lifecycleFailure(ticket: ActivePreparation, disposed: boolean): PreparationFailure {
  if (disposed || ticket.invalidatedBy === 'disposed')
    return new PreparationFailure('owner-disposed', 'The preparation owner is disposed.');
  if (ticket.invalidatedBy === 'cancelled')
    return new PreparationFailure('preparation-cancelled', 'Saved-row preparation was cancelled.');
  return new PreparationFailure(
    'preparation-superseded',
    'A newer saved-row preparation superseded this generation.',
  );
}

function resolveScope(
  draft: CardDraft,
  adapted: SuccessfulAdapter,
): Readonly<{
  scopeKey: string;
  sizeToken: string;
  pieceLineKeys: readonly [string, string];
}> {
  const seams = adapted.existingAssembly.seams;
  const pieceLineKeys = [
    ...new Set(seams.flatMap((seam) => [seam.sideA[0]?.pieceLineKey, seam.sideB[0]?.pieceLineKey])),
  ].filter((value): value is string => !!value);
  if (pieceLineKeys.length !== 2)
    fail('piece-pair-binding-blocked', 'Both saved seams must bind the same two piece lines.');
  const sizes = [...new Set(seams.map(({ anchoredSize }) => anchoredSize.trim()))].filter(Boolean);
  if (sizes.length !== 1)
    fail('size-binding-blocked', 'Both saved seams must bind one identical non-empty size.');
  const scopes = draft.scopes
    .filter(
      ({ target, writerReplay }) =>
        !!target.scopeKey &&
        writerReplay?.schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 &&
        pieceLineKeys.every((pieceLineKey) =>
          draft.aliases.some(
            (alias) => alias.scopeKey === target.scopeKey && alias.pieceLineKey === pieceLineKey,
          ),
        ),
    )
    .map(({ target }) => target.scopeKey);
  if (scopes.length !== 1 || new Set(scopes).size !== 1)
    fail(
      'scope-binding-blocked',
      'The reconstructed draft must expose one writer-replay scope covering both saved piece lines.',
    );
  return Object.freeze({
    scopeKey: scopes[0],
    sizeToken: sizes[0],
    pieceLineKeys: Object.freeze([...pieceLineKeys].sort()) as readonly [string, string],
  });
}

function validateAssemblyEvidence(
  candidate: unknown,
  request: PatternImportDxfPhaseESavedRowPreparationRequestV1,
  phase: 'before' | 'after',
  initial: boolean,
): Readonly<{
  snapshot: AssemblyContext;
  adapted: SuccessfulAdapter;
  serverAssemblyRevision: string;
  serverTopologySha256: string;
  exactTopology:
    | PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1['exactTopology']
    | null;
  semanticV1Sha256: string | null;
}> {
  const evidence = descriptorRecord(candidate, [
    'schemaVersion',
    'origin',
    'serverAssemblyRevision',
    'serverTopologySha256',
    'row',
    'selectedOperationNumber',
    'assembly',
    'exactTopology',
    ...(initial ? ['semanticV1Sha256'] : []),
  ]);
  if (
    !evidence ||
    evidence.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1 ||
    evidence.origin !== 'server-transactional-saved-assembly' ||
    !validServerAssemblyRevision(evidence.serverAssemblyRevision) ||
    typeof evidence.serverTopologySha256 !== 'string' ||
    !SHA256.test(evidence.serverTopologySha256)
  )
    fail(
      'assembly-authority-receipt-invalid',
      `A genuine server-transactional Assembly authority receipt is required ${phase} prepare.`,
    );
  const row = detachRow(evidence?.row);
  const assembly = detachBoundedAssembly(evidence?.assembly);
  const exactTopology = detachBoundedAssembly(evidence?.exactTopology) as unknown as
    | PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1['exactTopology']
    | null;
  if (!row)
    fail(
      'assembly-authority-receipt-invalid',
      `The server-transactional Assembly receipt row is invalid ${phase} prepare.`,
    );
  if (!assembly)
    fail(
      'assembly-evidence-invalid',
      `Authoritative Assembly evidence is invalid ${phase} prepare.`,
    );
  if (evidence.selectedOperationNumber !== request.selectedOperationNumber)
    fail(
      phase === 'before' ? 'assembly-evidence-invalid' : 'assembly-topology-stale-after-prepare',
      `The selected Assembly operation changed ${phase} prepare.`,
    );
  if (!same(row, request.row))
    fail(
      phase === 'before' ? 'saved-row-mismatch-before-prepare' : 'saved-row-stale-after-prepare',
      `The saved row no longer exact-matches all eight identity fields ${phase} prepare.`,
    );
  let semanticV1Sha256: string | null = null;
  if (initial) {
    if (
      evidence.exactTopology !== null ||
      typeof evidence.semanticV1Sha256 !== 'string' ||
      !SHA256.test(evidence.semanticV1Sha256)
    )
      fail(
        'assembly-authority-receipt-invalid',
        `A current standalone Product Semantic V1 is required ${phase} first two-seam preparation.`,
      );
    semanticV1Sha256 = evidence.semanticV1Sha256;
  } else {
    const exact = descriptorRecord(exactTopology, [
      'carrier',
      'seal',
      'compositeSha256',
      'compositeByteLength',
    ]);
    const carrier = descriptorRecord(exact?.carrier, [
      'schemaVersion',
      'status',
      'bindings',
      'sides',
      'claims',
    ]);
    const bindings = descriptorRecord(carrier?.bindings, [
      'row',
      'serverAssemblyRevision',
      'assemblyTopologySha256',
      'selectedOperation',
      'catalogCanonicalSha256',
      'proposalFingerprint',
      'phaseEAggregatePlanSha256',
    ]);
    const selectedOperation = descriptorRecord(bindings?.selectedOperation, [
      'sourceOperationNumber',
      'authoringOperationId',
      'localOperationOrder',
      'seamIds',
    ]);
    const carrierRow = detachRow(bindings?.row);
    if (
      !exact ||
      !carrier ||
      !bindings ||
      !selectedOperation ||
      !carrierRow ||
      !same(carrierRow, request.row) ||
      bindings.serverAssemblyRevision !== evidence.serverAssemblyRevision ||
      bindings.assemblyTopologySha256 !== evidence.serverTopologySha256 ||
      selectedOperation.sourceOperationNumber !== request.selectedOperationNumber ||
      selectedOperation.localOperationOrder !== 0 ||
      !Array.isArray(selectedOperation.seamIds) ||
      selectedOperation.seamIds.length !== 2 ||
      typeof exact.compositeSha256 !== 'string' ||
      !SHA256.test(exact.compositeSha256) ||
      !Number.isSafeInteger(exact.compositeByteLength) ||
      Number(exact.compositeByteLength) <= 0
    )
      fail(
        phase === 'before'
          ? 'assembly-authority-receipt-invalid'
          : 'assembly-topology-stale-after-prepare',
        `The verified serialized exact-topology carrier is invalid ${phase} prepare.`,
      );
  }
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    assembly,
    request.selectedOperationNumber,
  );
  if (!adapted.ok)
    fail(
      phase === 'before' ? 'assembly-evidence-invalid' : 'assembly-topology-stale-after-prepare',
      `Authoritative Assembly topology is not admissible ${phase} prepare: ${adapted.blockers[0].code}.`,
    );
  return Object.freeze({
    snapshot: assembly,
    adapted,
    serverAssemblyRevision: evidence.serverAssemblyRevision,
    serverTopologySha256: evidence.serverTopologySha256,
    exactTopology,
    semanticV1Sha256,
  });
}

async function verifyServerTopologySha256(
  evidence: ReturnType<typeof validateAssemblyEvidence>,
  phase: 'before' | 'after',
  crypto: Pick<Crypto, 'subtle'>,
): Promise<string> {
  const localTopologySha256 = await sha256(
    PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
    evidence.adapted.existingAssembly,
    crypto,
  );
  if (localTopologySha256 !== evidence.serverTopologySha256)
    fail(
      'assembly-authority-receipt-invalid',
      `The server topology SHA does not match the locally normalized selected topology ${phase} prepare.`,
    );
  return localTopologySha256;
}

type CapturedPreparationHost = Readonly<{
  createSavedReprocessHost: () => DxfProductSavedReprocessHostV1;
  readAuthoritativeAssembly: PatternImportDxfPhaseESavedRowPreparationHostV1['readAuthoritativeAssembly'];
  readInitialAssembly?: PatternImportDxfPhaseESavedRowPreparationHostV1['readInitialAssembly'];
  crypto: Pick<Crypto, 'subtle'>;
}>;

function captureCryptoProvider(candidate: unknown): Pick<Crypto, 'subtle'> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  let subtle: unknown;
  try {
    const defaultCrypto = globalThis.crypto;
    const defaultSubtle = defaultCrypto.subtle;
    if (candidate === defaultCrypto) {
      subtle = defaultSubtle;
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Reflect.ownKeys(descriptors);
      const descriptor = descriptors.subtle;
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        keys.length !== 1 ||
        keys[0] !== 'subtle' ||
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      )
        return null;
      subtle = descriptor.value;
    }
    if (!subtle || typeof subtle !== 'object') return null;
    let digest: unknown;
    if (subtle === defaultSubtle) {
      digest = defaultSubtle.digest;
    } else {
      const prototype = Object.getPrototypeOf(subtle);
      const descriptors = Object.getOwnPropertyDescriptors(subtle);
      const keys = Reflect.ownKeys(descriptors);
      const descriptor = descriptors.digest;
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        keys.length !== 1 ||
        keys[0] !== 'digest' ||
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      )
        return null;
      digest = descriptor.value;
    }
    if (typeof digest !== 'function') return null;
    const capturedSubtle = subtle;
    const capturedDigest = digest as SubtleCrypto['digest'];
    return Object.freeze({
      subtle: Object.freeze({
        digest: (...args: Parameters<SubtleCrypto['digest']>) =>
          Reflect.apply(capturedDigest, capturedSubtle, args),
      }) as unknown as SubtleCrypto,
    });
  } catch {
    return null;
  }
}

function capturePreparationHost(value: unknown): CapturedPreparationHost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key === 'symbol')
    )
      return null;
    const expected = ['createSavedReprocessHost', 'readAuthoritativeAssembly'];
    if (Object.prototype.hasOwnProperty.call(descriptors, 'crypto')) expected.push('crypto');
    if (Object.prototype.hasOwnProperty.call(descriptors, 'readInitialAssembly'))
      expected.push('readInitialAssembly');
    const actual = (keys as string[]).sort();
    expected.sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
      return null;
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    }
    const create = descriptors.createSavedReprocessHost.value;
    const read = descriptors.readAuthoritativeAssembly.value;
    const readInitial = descriptors.readInitialAssembly?.value;
    if (
      typeof create !== 'function' ||
      typeof read !== 'function' ||
      (descriptors.readInitialAssembly && typeof readInitial !== 'function')
    )
      return null;
    const cryptoCandidate = descriptors.crypto?.value ?? globalThis.crypto;
    const crypto = captureCryptoProvider(cryptoCandidate);
    if (!crypto) return null;
    // Host seam types carry no `this` contract. Invoke captured functions with `undefined` so a
    // mutable host object cannot remain an ambient authority after this one-time descriptor read.
    const captured: CapturedPreparationHost = {
      createSavedReprocessHost: () =>
        Reflect.apply(create, undefined, []) as DxfProductSavedReprocessHostV1,
      readAuthoritativeAssembly: (expectedRow, signal) =>
        Reflect.apply(read, undefined, [expectedRow, signal]) as ReturnType<
          PatternImportDxfPhaseESavedRowPreparationHostV1['readAuthoritativeAssembly']
        >,
      ...(typeof readInitial === 'function' && {
        readInitialAssembly: (
          expectedRow: Parameters<ReadAssemblyEvidence<unknown>>[0],
          signal: AbortSignal,
        ) =>
          Reflect.apply(readInitial, undefined, [
            expectedRow,
            signal,
          ]) as Promise<PatternImportDxfPhaseESavedRowInitialAssemblyEvidenceV1>,
      }),
      crypto,
    };
    return Object.freeze(captured);
  } catch {
    return null;
  }
}

function captureSavedReprocessHost(
  value: unknown,
  crypto: Pick<Crypto, 'subtle'>,
): DxfProductSavedReprocessHostV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key === 'symbol')
    )
      return null;
    const required = ['readAuthoritativeRow', 'reprocess', 'readCurrentRowIdentity'];
    const allowed = new Set([...required, 'crypto', 'dispose']);
    if (keys.some((key) => !allowed.has(key as string))) return null;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    }
    if (required.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key)))
      return null;
    const read = descriptors.readAuthoritativeRow.value;
    const reprocess = descriptors.reprocess.value;
    const revalidate = descriptors.readCurrentRowIdentity.value;
    const dispose = descriptors.dispose?.value;
    if (
      typeof read !== 'function' ||
      typeof reprocess !== 'function' ||
      typeof revalidate !== 'function' ||
      (dispose !== undefined && typeof dispose !== 'function')
    )
      return null;
    // As above, a method-style host that depends on mutable `this` is intentionally unsupported.
    return Object.freeze({
      readAuthoritativeRow: (...args) => Reflect.apply(read, undefined, args),
      reprocess: (...args) => Reflect.apply(reprocess, undefined, args),
      readCurrentRowIdentity: (...args) => Reflect.apply(revalidate, undefined, args),
      crypto,
      ...(dispose === undefined
        ? {}
        : { dispose: () => Reflect.apply(dispose, undefined, []) as void }),
    });
  } catch {
    return null;
  }
}

export function isPatternImportDxfPhaseESavedRowPreparedV1(
  candidate: unknown,
): candidate is PatternImportDxfPhaseESavedRowPreparedV1 {
  return !!candidate && typeof candidate === 'object' && genuinePrepared.has(candidate);
}

/**
 * Owns saved-row preparations one generation at a time. The only accepted reconstruction input is
 * a fresh genuine `createDxfProductSavedNativeReprocessOwnerV1` invocation over an injected host
 * capability. No caller-supplied draft, replay result, Assembly snapshot or document authority is
 * accepted.
 */
export function createPatternImportDxfPhaseESavedRowPreparationOwnerV1(
  host: PatternImportDxfPhaseESavedRowPreparationHostV1,
) {
  const capturedHost = capturePreparationHost(host);
  if (!capturedHost)
    throw new TypeError('Saved reprocess and authoritative Assembly host seams are required.');

  let disposed = false;
  let preparationGeneration = 0;
  let active: ActivePreparation | null = null;
  let currentInitial: PatternImportDxfPhaseESavedRowInitialPreparedV1 | null = null;
  const preparedCompilerSources = new WeakMap<object, PreparedCompilerSourceState>();
  const livePreparedSources = new Set<object>();

  const revokePreparedSources = () => {
    for (const prepared of livePreparedSources) {
      const state = preparedCompilerSources.get(prepared);
      if (state) {
        state.status = 'revoked';
        state.draft = null;
        state.sourceOwner = null;
      }
    }
    livePreparedSources.clear();
  };

  const invalidate = (reason: NonNullable<ActivePreparation['invalidatedBy']>) => {
    revokePreparedSources();
    currentInitial = null;
    if (!active) return;
    active.invalidatedBy = reason;
    active.controller.abort();
    active.reprocessOwner?.cancel();
    active.reprocessOwner?.dispose();
    active = null;
  };

  const runPreparation = async (
    candidate: unknown,
    initial: boolean,
  ): Promise<
    PatternImportDxfPhaseESavedRowPreparationResultV1<PatternImportDxfPhaseESavedRowWorkbenchPreparedV1>
  > => {
    if (disposed) return blocked(new PreparationFailure('owner-disposed', 'Owner disposed.'), null);
    invalidate('superseded');
    preparationGeneration += 1;
    const ticket: ActivePreparation = {
      generation: preparationGeneration,
      controller: new AbortController(),
      invalidatedBy: null,
      reprocessOwner: null,
    };
    active = ticket;
    const assertCurrent = () => {
      if (disposed || active !== ticket || ticket.controller.signal.aborted || ticket.invalidatedBy)
        throw lifecycleFailure(ticket, disposed);
    };

    try {
      const request = detachRequest(candidate);
      assertCurrent();
      const read = initial
        ? capturedHost.readInitialAssembly
        : capturedHost.readAuthoritativeAssembly;
      if (!read)
        fail(
          'assembly-authority-receipt-invalid',
          'A current Product Semantic V1 read capability is required for initial authoring.',
        );
      let beforeEvidence: Awaited<ReturnType<typeof read>>;
      try {
        beforeEvidence = await read(
          { row: request.row, selectedOperationNumber: request.selectedOperationNumber },
          ticket.controller.signal,
        );
      } catch {
        assertCurrent();
        fail(
          'assembly-read-failed',
          'Authoritative Assembly topology could not be read before prepare.',
        );
      }
      assertCurrent();
      const before = validateAssemblyEvidence(beforeEvidence, request, 'before', initial);
      assertCurrent();
      const topologySha256 = await verifyServerTopologySha256(
        before,
        'before',
        capturedHost.crypto,
      );
      assertCurrent();

      let candidateHost: DxfProductSavedReprocessHostV1;
      try {
        candidateHost = capturedHost.createSavedReprocessHost();
      } catch {
        assertCurrent();
        fail(
          'saved-reprocess-host-invalid',
          'A fresh genuine saved-DXF reprocess capability could not be created.',
        );
      }
      assertCurrent();
      const reprocessHost = captureSavedReprocessHost(candidateHost, capturedHost.crypto);
      assertCurrent();
      if (!reprocessHost)
        fail(
          'saved-reprocess-host-invalid',
          'A fresh genuine saved-DXF reprocess capability could not be created.',
        );
      ticket.reprocessOwner = createDxfProductSavedNativeReprocessOwnerV1(reprocessHost);
      const replay = await ticket.reprocessOwner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row: request.row,
      });
      assertCurrent();
      if (!replay.ok)
        fail(
          'saved-reprocess-blocked',
          `Saved-DXF reconstruction was blocked: ${replay.blockers[0].code}.`,
        );
      const draftCadCompileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
        replay.draft,
      );
      if (!draftCadCompileSource)
        fail(
          'draft-cad-compile-source-blocked',
          'The reconstructed draft could not expose a raw-free Pattern/Draft compile source.',
        );
      const scope = resolveScope(replay.draft, before.adapted);

      const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(
        replay.draft,
        scope.scopeKey,
        scope.sizeToken,
        capturedHost.crypto,
      );
      assertCurrent();
      if (!selected.ok)
        fail(
          'phase-d-selection-blocked',
          `Fresh reconstructed Phase-D selection was blocked: ${selected.blockers[0].code}.`,
        );

      const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        replay.draft,
        scope.scopeKey,
        scope.sizeToken,
        capturedHost.crypto,
      );
      assertCurrent();
      if (!catalogResult.ok)
        fail(
          'catalog-blocked',
          `Fresh authoring catalog was blocked: ${catalogResult.blockers[0].code}.`,
        );
      const catalog = catalogResult.catalog;
      const catalogLines = catalog.pieces.map(({ pieceLineKey }) => pieceLineKey).sort();
      if (
        catalogLines.length !== 2 ||
        catalogLines[0] !== scope.pieceLineKeys[0] ||
        catalogLines[1] !== scope.pieceLineKeys[1]
      )
        fail(
          'catalog-piece-pair-mismatch',
          'The reconstructed catalog no longer exact-matches both saved seam piece lines.',
        );

      const proposalResult = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
        catalog,
        before.adapted.existingAssembly,
      );
      if (!proposalResult.ok)
        fail(
          'proposal-blocked',
          `Two-seam proposal was blocked: ${proposalResult.blockers[0].code}.`,
        );
      const projectionResult = projectPatternImportDxfProductPhaseEAssemblyV1(
        catalog,
        selected.selection,
      );
      if (!projectionResult.ok)
        fail(
          'projection-blocked',
          `Exact Phase-D projection was blocked: ${projectionResult.blockers[0].code}.`,
        );

      let materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
      try {
        materialOptions = await loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1();
      } catch {
        assertCurrent();
        fail(
          'material-options-blocked',
          'Canonical workbench material options could not be loaded.',
        );
      }
      assertCurrent();

      const authorityPayload = {
        origin: 'verified-saved-row' as const,
        row: request.row,
        sizeSelectionCanonicalSha256: selected.selection.selection.canonicalSha256,
        catalogCanonicalSha256: catalog.canonicalSha256,
        serverAssemblyRevision: before.serverAssemblyRevision,
        assemblyTopologySha256: topologySha256,
        ...(before.semanticV1Sha256 ? { semanticV1Sha256: before.semanticV1Sha256 } : {}),
      };
      const documentDigest = await sha256(
        'pattern-import-dxf-phase-e-saved-row-document/1',
        authorityPayload,
        capturedHost.crypto,
      );
      assertCurrent();
      const revisionDigest = await sha256(
        'pattern-import-dxf-phase-e-saved-row-revision/1',
        authorityPayload,
        capturedHost.crypto,
      );
      assertCurrent();
      const documentAuthority: PatternImportDxfPhaseESavedRowDocumentAuthorityV1 = deepFreeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_DOCUMENT_AUTHORITY_V1,
        ...authorityPayload,
        documentId: `phase-e-v2:saved-document:${documentDigest}`,
        revision: `phase-e-v2:saved-revision:${revisionDigest}`,
      });

      let initialState: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
      try {
        initialState = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
          catalog,
          proposalResult.proposal,
          documentAuthority,
          ticket.generation,
        );
      } catch {
        fail('workbench-state-blocked', 'The two-seam workbench state could not be created.');
      }

      let afterEvidence: Awaited<ReturnType<typeof read>>;
      try {
        afterEvidence = await read(
          { row: request.row, selectedOperationNumber: request.selectedOperationNumber },
          ticket.controller.signal,
        );
      } catch {
        assertCurrent();
        fail(
          'assembly-read-failed',
          'Authoritative Assembly topology could not be read after prepare.',
        );
      }
      assertCurrent();
      const after = validateAssemblyEvidence(afterEvidence, request, 'after', initial);
      assertCurrent();
      const afterTopologySha256 = await verifyServerTopologySha256(
        after,
        'after',
        capturedHost.crypto,
      );
      assertCurrent();
      if (after.serverAssemblyRevision !== before.serverAssemblyRevision)
        fail(
          'assembly-revision-stale-after-prepare',
          'The server transactional Assembly revision changed during preparation.',
        );
      if (after.serverTopologySha256 !== before.serverTopologySha256)
        fail(
          'assembly-topology-stale-after-prepare',
          'The server canonical Assembly topology SHA changed during preparation.',
        );
      if (
        !same(before.snapshot, after.snapshot) ||
        !same(before.adapted.existingAssembly, after.adapted.existingAssembly) ||
        !same(before.exactTopology, after.exactTopology) ||
        before.semanticV1Sha256 !== after.semanticV1Sha256
      )
        fail(
          'assembly-topology-stale-after-prepare',
          'Selected operation or full saved seam/anchor topology changed during preparation.',
        );
      if (afterTopologySha256 !== topologySha256)
        fail(
          'assembly-topology-stale-after-prepare',
          'Authoritative Assembly topology digest changed during preparation.',
        );

      const pieceIds = catalog.pieces.map(({ pieceId }) => pieceId).sort();
      if (pieceIds.length !== 2 || pieceIds[0] === pieceIds[1])
        fail(
          'catalog-piece-pair-mismatch',
          'The catalog must expose two distinct piece identities.',
        );
      assertCurrent();
      const common = {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARED_V1,
        origin: 'verified-saved-row' as const,
        preparationGeneration: ticket.generation,
        row: request.row,
        selectedOperationNumber: request.selectedOperationNumber,
        scopeKey: scope.scopeKey,
        sizeToken: scope.sizeToken,
        pieceLineKeys: scope.pieceLineKeys,
        pieceIds: Object.freeze(pieceIds) as readonly [string, string],
        serverAssemblyRevision: before.serverAssemblyRevision,
        assemblyTopologySha256: topologySha256,
        topology: before.adapted.existingAssembly,
        draftCadCompileSource,
        selection: selected.selection,
        catalog,
        proposal: proposalResult.proposal,
        projection: projectionResult.projection,
        initialState,
        materialOptions,
        documentAuthority,
      };
      if (before.semanticV1Sha256) {
        const prepared = deepFreeze({
          ...common,
          exactTopology: null,
          semanticV1Sha256: before.semanticV1Sha256,
          claims: INITIAL_PREPARATION_CLAIMS,
        }) as PatternImportDxfPhaseESavedRowInitialPreparedV1;
        currentInitial = prepared;
        return Object.freeze({
          ok: true as const,
          preparationGeneration: ticket.generation,
          prepared,
          blockers: Object.freeze([]) as readonly [],
          claims: INITIAL_PREPARATION_CLAIMS,
        });
      }
      const prepared = deepFreeze({
        ...common,
        exactTopology: before.exactTopology!,
        claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1,
      }) as PatternImportDxfPhaseESavedRowPreparedV1;
      genuinePrepared.add(prepared);
      preparedCompilerSources.set(prepared, {
        status: 'available',
        draft: replay.draft,
        sourceOwner: replay.sourceOwner,
      });
      livePreparedSources.add(prepared);
      return Object.freeze({
        ok: true as const,
        preparationGeneration: ticket.generation,
        prepared,
        blockers: Object.freeze([]) as readonly [],
        claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_CLAIMS_V1,
      });
    } catch (error) {
      return blocked(error, ticket.generation);
    } finally {
      ticket.reprocessOwner?.dispose();
      ticket.reprocessOwner = null;
      if (active === ticket) active = null;
    }
  };

  // The restore API keeps its original strict type and never exposes first-authoring state.
  const prepare = (candidate: unknown) =>
    runPreparation(candidate, false) as Promise<PatternImportDxfPhaseESavedRowPreparationResultV1>;
  const prepareInitial = (candidate: unknown) =>
    runPreparation(candidate, true) as Promise<
      PatternImportDxfPhaseESavedRowPreparationResultV1<PatternImportDxfPhaseESavedRowInitialPreparedV1>
    >;

  const consumeConfirmedCompilerSource = async <T>(
    request: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceRequestV1,
    consumer: PatternImportDxfPhaseESavedRowConfirmedCompilerSourceConsumerV1<T>,
  ): Promise<PatternImportDxfPhaseESavedRowConfirmedCompilerSourceResultV1<T>> => {
    let prepared: PatternImportDxfPhaseESavedRowPreparedV1;
    let choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>;
    let persistence: PatternImportDxfPhaseESavedRowVerifiedPersistenceV1;
    let signal: AbortSignal;
    try {
      const captured = descriptorRecord(request, [
        'schemaVersion',
        'prepared',
        'choices',
        'persistence',
        'signal',
      ]);
      if (
        !captured ||
        captured.schemaVersion !==
          PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_CONFIRMED_COMPILER_SOURCE_REQUEST_V1 ||
        typeof consumer !== 'function'
      )
        return confirmedCompilerSourceBlocked(
          'invalid-confirmation',
          'A live signal and the exact confirmed compiler-source request are required.',
        );
      prepared = captured.prepared as PatternImportDxfPhaseESavedRowPreparedV1;
      choices = captured.choices as Extract<
        PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
        { ok: true }
      >;
      persistence = captured.persistence as PatternImportDxfPhaseESavedRowVerifiedPersistenceV1;
      signal = captured.signal as AbortSignal;
      if (signal?.aborted !== false)
        return confirmedCompilerSourceBlocked(
          'invalid-confirmation',
          'A live signal and the exact confirmed compiler-source request are required.',
        );
    } catch {
      return confirmedCompilerSourceBlocked(
        'invalid-confirmation',
        'The confirmed compiler-source request could not be inspected safely.',
      );
    }

    if (disposed || !genuinePrepared.has(prepared))
      return confirmedCompilerSourceBlocked(
        'stale-preparation',
        'The saved preparation is not a live genuine preparation of this owner.',
      );
    const state = preparedCompilerSources.get(prepared);
    if (!state || state.status === 'revoked')
      return confirmedCompilerSourceBlocked(
        'stale-preparation',
        'The saved source capability was cancelled, superseded or disposed.',
      );
    if (state.status === 'consumed')
      return confirmedCompilerSourceBlocked(
        'source-already-consumed',
        'The saved source capability was already handed to its compiler consumer.',
      );
    if (!isVerifiedPersistence(persistence) || !choicesExactMatchPrepared(choices, prepared))
      return confirmedCompilerSourceBlocked(
        'invalid-confirmation',
        'Exact verified persistence and confirmed choices bound to this preparation are required.',
      );
    if (!state.draft || !state.sourceOwner)
      return confirmedCompilerSourceBlocked(
        'stale-preparation',
        'The saved source capability no longer owns its exact replay draft.',
      );

    const compositionRequest = buildConfirmedCompositionRequest(prepared, choices, state.draft);
    const sourceOwner = state.sourceOwner;
    state.status = 'consumed';
    state.draft = null;
    state.sourceOwner = null;
    livePreparedSources.delete(prepared);

    try {
      const value = await consumer(Object.freeze({ sourceOwner, compositionRequest }));
      if (signal.aborted)
        return confirmedCompilerSourceBlocked(
          'consumer-failed',
          'The confirmed compiler consumer was cancelled after one-shot handoff.',
        );
      return Object.freeze({
        ok: true as const,
        value,
        blockers: Object.freeze([]) as readonly [],
      });
    } catch (error) {
      return confirmedCompilerSourceBlocked(
        'consumer-failed',
        error instanceof Error
          ? `The confirmed compiler consumer failed after one-shot handoff: ${error.message}`
          : 'The confirmed compiler consumer failed after one-shot handoff.',
      );
    }
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_OWNER_V1,
    prepare,
    prepareInitial,
    isCurrentInitial(prepared: PatternImportDxfPhaseESavedRowInitialPreparedV1) {
      return !disposed && currentInitial === prepared;
    },
    consumeConfirmedCompilerSource,
    cancel() {
      invalidate('cancelled');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate('disposed');
    },
    snapshot() {
      return Object.freeze({
        disposed,
        running: active !== null,
        preparationGeneration,
      });
    },
  });
}
