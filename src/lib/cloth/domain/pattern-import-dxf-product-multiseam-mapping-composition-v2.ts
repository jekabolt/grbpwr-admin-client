import {
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  computePatternImportDxfBridgeArtifactBindingSha256V1,
  computePatternImportDxfBridgeBindingDigestsV1,
  type PatternImportDxfBridgeUnsignedBindingV1,
  type PatternImportDxfManifestBridgeViewV1,
} from './pattern-import-dxf-handoff-bridge-v1';
import {
  PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
  buildPatternImportDxfPipelineHandoffV1,
  type PatternImportDxfPipelineHandoffInputV1,
} from './pattern-import-dxf-pipeline-handoff-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
  type PatternImportDxfTwoSidedSeamMappingInputV1,
} from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingInputV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';
import {
  PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_REQUEST_V1,
  buildPatternImportDxfTwoSeamMappingAggregateV1,
  type PatternImportDxfTwoSeamMappingAggregateV1,
  type PatternImportDxfTwoSeamMappingAggregateSealV1,
} from './pattern-import-dxf-two-seam-mapping-aggregate-v1';
import { compileDxfAssemblyHandoffV1, type DxfAssemblyHandoffV1 } from './dxf-assembly-handoff-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2,
  computePatternImportDxfProductPhaseEMultiseamProposalFingerprintV2,
  type PatternImportDxfProductPhaseEMultiseamChoicesV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
} from '../../pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import type { CardDraft } from '../../pattern-import/types';
import { writeDxfDetailed } from '../../pattern-import/write';

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2 =
  'pattern-import-dxf-product-multiseam-mapping-composition-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2 =
  'pattern-import-dxf-product-multiseam-mapping-composition/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_SEAL_V2 =
  'pattern-import-dxf-product-multiseam-mapping-composition-seal/2' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();

export type PatternImportDxfProductMultiseamSavedRowEvidenceV2 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  dxfSha256: string;
  patternVersion: number;
  cardLockVersion: number;
}>;

export type PatternImportDxfProductMultiseamPreparedChronologyV2 = Readonly<{
  importGeneration: number;
  row: PatternImportDxfProductMultiseamSavedRowEvidenceV2;
  sizeSelectionSha256: string;
  catalogCanonicalSha256: string;
  proposalFingerprint: string;
  phaseEPlanSha256: string;
  documentId: string;
  revision: string;
}>;

export type PatternImportDxfProductMultiseamCurrentChronologyV2 = Readonly<{
  importGeneration: number;
  row: PatternImportDxfProductMultiseamSavedRowEvidenceV2;
}>;

export type PatternImportDxfProductMultiseamMappingCompositionRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2;
  draft: CardDraft;
  selection: DxfProductPhaseDSizeSelectionResultV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
  prepared: PatternImportDxfProductMultiseamPreparedChronologyV2;
  current: PatternImportDxfProductMultiseamCurrentChronologyV2;
}>;

export type PatternImportDxfProductMultiseamMappingCompositionSealV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_SEAL_V2;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  authority: 'unsigned-card-session-consistency-only';
  atomicTwoSeamAuthority: true;
  persistentAuthority: false;
  productionReady: false;
}>;

export type PatternImportDxfProductMultiseamMappingCompositionBlockerV2 = Readonly<{
  code:
    | 'invalid-input'
    | 'chronology-mismatch'
    | 'catalog-selection-mismatch'
    | 'proposal-choice-mismatch'
    | 'plan-seal-mismatch'
    | 'writer-replay-unavailable'
    | 'writer-replay-mismatch'
    | 'artifact-binding-blocked'
    | 'handoff-blocked'
    | 'handoff-compile-blocked'
    | 'handoff-binding-mismatch'
    | 'aggregate-mapping-blocked'
    | 'aggregate-binding-mismatch'
    | 'sha256-unavailable';
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_CLAIMS_V2 = Object.freeze({
  freshPhaseDSelectionRequired: true,
  exactCatalogProposalAndChoicesBound: true,
  importGenerationAndSavedRowChronologyBound: true,
  productionWriterReplayFreshRerun: true,
  productionHandoffFreshBuilt: true,
  productionHandoffFreshCompiled: true,
  bothProductionSeamMappingsFreshBuilt: true,
  aggregateTwoSeamSealBound: true,
  partialAuthorityPublished: false,
  sourceOperationNumberUsedAsLocalOrder: false,
  emittedLocalOperationOrder: 0,
  closingContourMappingUsesDirectedProgressOne: true,
  closingContourHandoffCompilesToPeriodicRangeOne: true,
  phase1ProofIntegrated: false,
  phase1CompilationReady: false,
  nearestGeometryRecoveryUsed: false,
  persistenceIntegrated: false,
  arbitraryGarmentSupported: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshPhaseDSelectionRequired: false as const,
  exactCatalogProposalAndChoicesBound: false as const,
  importGenerationAndSavedRowChronologyBound: false as const,
  productionWriterReplayFreshRerun: false as const,
  productionHandoffFreshBuilt: false as const,
  productionHandoffFreshCompiled: false as const,
  bothProductionSeamMappingsFreshBuilt: false as const,
  aggregateTwoSeamSealBound: false as const,
  partialAuthorityPublished: false as const,
  sourceOperationNumberUsedAsLocalOrder: false as const,
  emittedLocalOperationOrder: 0 as const,
  closingContourMappingUsesDirectedProgressOne: false as const,
  closingContourHandoffCompilesToPeriodicRangeOne: false as const,
  phase1ProofIntegrated: false as const,
  phase1CompilationReady: false as const,
  nearestGeometryRecoveryUsed: false as const,
  persistenceIntegrated: false as const,
  arbitraryGarmentSupported: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductMultiseamMappingCompositionResultV2 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2;
      handoff: DxfAssemblyHandoffV1;
      aggregate: PatternImportDxfTwoSeamMappingAggregateV1;
      aggregateSeal: PatternImportDxfTwoSeamMappingAggregateSealV1;
      compositionSeal: PatternImportDxfProductMultiseamMappingCompositionSealV2;
      downstreamCompilation: Readonly<{
        status: 'blocked';
        code: 'phase1-proof-not-integrated';
        detail: string;
      }>;
      evidence: Readonly<{
        techCardId: number;
        scopeKey: string;
        patternLineKey: string;
        patternVersion: number;
        cardLockVersion: number;
        importGeneration: number;
        sourceOperationNumber: number;
        localOperationOrder: 0;
        sizeSelectionSha256: string;
        catalogSha256: string;
        proposalFingerprint: string;
        phaseEPlanSha256: string;
        sourceFileSha256: string;
        productExportSha256: string;
        sourceManifestMode?: 'saved-product-direct-source';
        handoffCanonicalSha256: string;
        twoSeamMappingAggregateSha256: string;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2;
      handoff: null;
      aggregate: null;
      aggregateSeal: null;
      compositionSeal: null;
      downstreamCompilation: null;
      evidence: null;
      blockers: readonly [PatternImportDxfProductMultiseamMappingCompositionBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_CONTRACT_V2 = Object.freeze({
  betaBound: 'two pieces + two equal seams + one existing stitch operation',
  phaseEInput: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2,
  childMappingOwner: 'buildPatternImportDxfTwoSeamMappingAggregateV1',
  callerSuppliedHandoffAccepted: false,
  callerSuppliedChildMappingsAccepted: false,
  partialAuthorityPolicy: 'never published',
  sourceOperationNumberPolicy: 'selection evidence only',
  localOperationOrder: 0,
  phase1CompilationPolicy: 'blocked-until-exact-triangulation-and-seam-proofs-are-integrated',
  reloadPersistenceIntegrated: false,
  arbitraryGarmentSupport: false,
  productionReady: false,
} as const);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function blocked(
  code: PatternImportDxfProductMultiseamMappingCompositionBlockerV2['code'],
  detail: string,
): PatternImportDxfProductMultiseamMappingCompositionResultV2 {
  return deepFreeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2,
    handoff: null,
    aggregate: null,
    aggregateSeal: null,
    compositionSeal: null,
    downstreamCompilation: null,
    evidence: null,
    blockers: [{ code, detail }] as const,
    claims: BLOCKED_CLAIMS,
  });
}

async function digest(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const bytes = textEncoder.encode(`${domain}\0${canonical(value)}`);
    if (bytes.byteLength > MAX_CANONICAL_BYTES) return null;
    const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (result.byteLength !== 32) return null;
    return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function digestTextBytes(
  value: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const result = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
    if (result.byteLength !== 32) return null;
    return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function validRow(value: PatternImportDxfProductMultiseamSavedRowEvidenceV2): boolean {
  return (
    !!value &&
    Number.isSafeInteger(value.techCardId) &&
    value.techCardId > 0 &&
    STABLE_ID.test(value.scopeKey ?? '') &&
    STABLE_ID.test(value.patternLineKey ?? '') &&
    SHA256.test(value.dxfSha256 ?? '') &&
    Number.isSafeInteger(value.patternVersion) &&
    value.patternVersion > 0 &&
    Number.isSafeInteger(value.cardLockVersion) &&
    value.cardLockVersion > 0
  );
}

function sameChronology(
  prepared: PatternImportDxfProductMultiseamPreparedChronologyV2,
  current: PatternImportDxfProductMultiseamCurrentChronologyV2,
): boolean {
  return (
    Number.isSafeInteger(prepared.importGeneration) &&
    prepared.importGeneration > 0 &&
    prepared.importGeneration === current.importGeneration &&
    prepared.row !== current.row &&
    validRow(prepared.row) &&
    validRow(current.row) &&
    canonical(prepared.row) === canonical(current.row) &&
    STABLE_ID.test(prepared.documentId ?? '') &&
    STABLE_ID.test(prepared.revision ?? '')
  );
}

function manifestView(
  manifest: CardDraft['scopes'][number]['manifest'],
): PatternImportDxfManifestBridgeViewV1 {
  return {
    v: manifest.v,
    generator: manifest.generator,
    createdAt: manifest.createdAt,
    techCardId: manifest.techCardId,
    units: manifest.units,
    cutLayerIsFinal: manifest.cutLayerIsFinal,
    source: manifest.source,
  };
}

/**
 * Product-writer replay proves the exact saved export bytes, while Phase D describes the file that
 * was directly decoded for this composition. On a normal fresh import they are already the same
 * source descriptor. A saved-row reconstruction is different: its reproducible writer manifest
 * must retain the original product-export provenance, but Phase D is intentionally rebound to the
 * verified saved DXF itself. Keep those two facts separate instead of mutating writer replay and
 * invalidating the exact-byte proof.
 */
function handoffManifestView(
  productManifest: PatternImportDxfManifestBridgeViewV1,
  scopeFilename: string,
  productExportSha256: string,
  productExportByteLength: number,
  phaseDSourceSha256: string,
  savedRowSha256: string,
): PatternImportDxfManifestBridgeViewV1 | null {
  if (
    productManifest.source.files.length === 1 &&
    productManifest.source.files[0]?.kind === 'dxf' &&
    productManifest.source.files[0].sha256 === phaseDSourceSha256
  )
    return productManifest;
  if (
    !SHA256.test(phaseDSourceSha256) ||
    phaseDSourceSha256 !== savedRowSha256 ||
    phaseDSourceSha256 !== productExportSha256 ||
    typeof scopeFilename !== 'string' ||
    scopeFilename.length === 0 ||
    !Number.isSafeInteger(productExportByteLength) ||
    productExportByteLength <= 0
  )
    return null;
  return {
    ...productManifest,
    source: {
      files: [
        {
          name: scopeFilename,
          sha256: phaseDSourceSha256,
          bytes: productExportByteLength,
          kind: 'dxf',
          pages: 1,
        },
      ],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: productManifest.source.sizeEncoding,
      variant: productManifest.source.variant,
      ...(productManifest.source.generatedFusing === true
        ? { generatedFusing: true as const }
        : {}),
      ...(productManifest.source.presegmentedIdentities
        ? { presegmentedIdentities: [...productManifest.source.presegmentedIdentities] }
        : {}),
    },
  };
}

function catalogWithoutSha256(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
): Omit<PatternImportDxfProductPhaseEAuthoringCatalogV1, 'canonicalSha256'> {
  const copy = { ...catalog };
  Reflect.deleteProperty(copy, 'canonicalSha256');
  return copy;
}

function choicesWithoutSeal(choices: PatternImportDxfProductPhaseEMultiseamChoicesV2) {
  return {
    schemaVersion: choices.schemaVersion,
    expectedCatalogCanonicalSha256: choices.expectedCatalogCanonicalSha256,
    expectedProposalFingerprint: choices.expectedProposalFingerprint,
    importGeneration: choices.importGeneration,
    documentId: choices.documentId,
    revision: choices.revision,
    physicalSurface: choices.physicalSurface,
    seams: choices.seams,
    operations: choices.operations,
    materials: choices.materials,
    tolerance: choices.tolerance,
  };
}

function seamInput(
  composition: PatternImportDxfPipelineHandoffInputV1,
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2,
  selection: Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>,
  seamId: string,
): PatternImportDxfTwoSidedSeamMappingInputV2 {
  const base: PatternImportDxfTwoSidedSeamMappingInputV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
    composition,
    expected: {
      sourceFileId: composition.sourceFileId,
      documentId: choices.documentId,
      revision: choices.revision,
      finalCoordinateSha256: composition.binding.selectedGeometrySha256,
    },
    scopes: [
      { scopeId: selection.selection.scopeKey, pieceIds: [...selection.selection.pieceIds] },
    ],
    seamId,
    tolerance: choices.tolerance,
  };
  return {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
    base,
    phaseD: selection.phaseD,
  };
}

let claimed = false;

/**
 * Fresh in-memory V2 composition. It rebuilds the product writer, handoff and both seam mappings;
 * it cannot mint a save receipt or persistent authority.
 */
export async function buildPatternImportDxfProductMultiseamMappingCompositionV2(
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductMultiseamMappingCompositionResultV2> {
  if (claimed) return blocked('invalid-input', 'Reentrant V2 composition was refused.');
  claimed = true;
  try {
    if (
      !request ||
      request.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2 ||
      !request.draft ||
      !request.selection ||
      !request.catalog ||
      !request.proposal ||
      !request.choices ||
      !request.prepared ||
      !request.current
    )
      return blocked('invalid-input', 'Exact V2 composition inputs are required.');
    if (!request.selection.ok)
      return blocked(
        'catalog-selection-mismatch',
        'A successful fresh Phase-D selection is required.',
      );
    const { selection, catalog, proposal, choices, prepared, current, draft } = request;
    if (!sameChronology(prepared, current))
      return blocked(
        'chronology-mismatch',
        'Import generation and exact saved-row evidence must remain unchanged since preparation.',
      );
    if (
      draft.techCardId !== current.row.techCardId ||
      catalog.techCardId !== current.row.techCardId ||
      catalog.scopeKey !== current.row.scopeKey ||
      catalog.scopeKey !== selection.selection.scopeKey ||
      catalog.sizeToken !== selection.selection.sizeToken ||
      catalog.sourceFileId !== selection.pipeline.carrier?.sourceFileId ||
      catalog.sizeSelectionCanonicalSha256 !== selection.selection.canonicalSha256 ||
      catalog.pieces.length !== 2 ||
      selection.selection.pieceIds.length !== 2 ||
      [...catalog.pieces.map(({ pieceId }) => pieceId)].sort().join('\0') !==
        [...selection.selection.pieceIds].sort().join('\0')
    )
      return blocked(
        'catalog-selection-mismatch',
        'Catalog, saved row and fresh Phase-D selection must bind the same card, scope, size and two pieces.',
      );
    const unsignedCatalog = catalogWithoutSha256(catalog);
    const freshCatalogSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
      unsignedCatalog,
      crypto,
    );
    if (!freshCatalogSha256)
      return blocked('sha256-unavailable', 'Fresh catalog SHA-256 is unavailable.');
    if (
      freshCatalogSha256 !== catalog.canonicalSha256 ||
      freshCatalogSha256 !== prepared.catalogCanonicalSha256 ||
      selection.selection.canonicalSha256 !== prepared.sizeSelectionSha256
    )
      return blocked(
        'catalog-selection-mismatch',
        'Fresh catalog content and retained Phase-D/catalog evidence must exact-match.',
      );
    const freshProposalFingerprint =
      computePatternImportDxfProductPhaseEMultiseamProposalFingerprintV2(proposal);
    if (
      proposal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2 ||
      choices.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2 ||
      proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
      choices.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
      choices.expectedProposalFingerprint !== proposal.deterministicFingerprint ||
      freshProposalFingerprint !== proposal.deterministicFingerprint ||
      freshProposalFingerprint !== prepared.proposalFingerprint ||
      choices.importGeneration !== prepared.importGeneration ||
      choices.importGeneration !== current.importGeneration ||
      choices.documentId !== prepared.documentId ||
      choices.revision !== prepared.revision ||
      proposal.operation.sourceOperationNumber <= 0 ||
      proposal.operation.order !== 0 ||
      choices.operations.length !== 1 ||
      choices.operations[0]?.id !== proposal.operation.authoringOperationId ||
      choices.operations[0]?.order !== 0 ||
      choices.operations[0]?.kind !== 'stitch' ||
      choices.seams.length !== 2 ||
      choices.operations[0]?.seamIds.length !== 2 ||
      choices.operations[0]?.seamIds.some(
        (seamId, index) => seamId !== proposal.operation.seamIds[index],
      ) ||
      choices.seams.some((seam, index) => seam.id !== proposal.seams[index]?.id)
    )
      return blocked(
        'proposal-choice-mismatch',
        'Catalog, proposal, document revision and atomic two-seam choices must exact-match.',
      );
    const expectedPlanSha = await digest(
      'pattern-import-dxf-product-phase-e-multiseam-plan-v2',
      choicesWithoutSeal(choices),
      crypto,
    );
    if (
      !expectedPlanSha ||
      choices.aggregatePlanSeal.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2 ||
      choices.aggregatePlanSeal.canonicalSha256 !== expectedPlanSha ||
      expectedPlanSha !== prepared.phaseEPlanSha256 ||
      choices.aggregatePlanSeal.authority !== 'explicit-bounded-two-piece-two-seam'
    )
      return blocked('plan-seal-mismatch', 'The atomic V2 choices plan seal did not verify.');

    const scopes = draft.scopes.filter(({ target }) => target.scopeKey === catalog.scopeKey);
    if (scopes.length !== 1 || !scopes[0].writerReplay)
      return blocked(
        'writer-replay-unavailable',
        'One retained production writer replay is required for the selected scope.',
      );
    const scope = scopes[0];
    const replay = scope.writerReplay!;
    const replayDate = new Date(replay.createdAt);
    if (
      Number.isNaN(replayDate.getTime()) ||
      replayDate.toISOString() !== replay.createdAt ||
      replay.job.techCardId !== draft.techCardId ||
      replay.job.scope.scopeKey !== catalog.scopeKey
    )
      return blocked('writer-replay-mismatch', 'Writer replay card, scope or clock is invalid.');
    let rerun: ReturnType<typeof writeDxfDetailed>;
    try {
      rerun = writeDxfDetailed(replay.job, { now: () => new Date(replayDate.getTime()) });
    } catch {
      return blocked('writer-replay-mismatch', 'Production writer replay failed.');
    }
    const productExportSha256 = await digestTextBytes(rerun.dxfText, crypto);
    if (
      !productExportSha256 ||
      productExportSha256 !== current.row.dxfSha256 ||
      JSON.stringify(rerun.manifest) !== JSON.stringify(scope.manifest)
    )
      return blocked(
        'writer-replay-mismatch',
        'Fresh production writer bytes or manifest do not exact-match the current saved row.',
      );
    const productExportManifest = manifestView(rerun.manifest);
    const currentManifest = handoffManifestView(
      productExportManifest,
      scope.filename,
      productExportSha256,
      textEncoder.encode(rerun.dxfText).byteLength,
      selection.phaseD.sourceSha256,
      current.row.dxfSha256,
    );
    if (!currentManifest)
      return blocked(
        'handoff-blocked',
        'Direct saved-row source lineage could not be bound without changing the exact product-writer replay.',
      );
    const selections = selection.pipeline.carrier?.pieces.map(({ pieceId, sizeToken }) => ({
      pieceId,
      sizeToken,
    }));
    if (!selections || selections.length !== 2)
      return blocked('catalog-selection-mismatch', 'Two selected carrier pieces are required.');
    const digests = await computePatternImportDxfBridgeBindingDigestsV1(
      currentManifest,
      replay.job.pieces,
      selections,
      { crypto },
    );
    if (!digests.ok) return blocked('artifact-binding-blocked', digests.errors.join('; '));
    const unsignedBinding: PatternImportDxfBridgeUnsignedBindingV1 = {
      documentId: choices.documentId,
      revision: choices.revision,
      exporterId: 'grbpwr.pattern-import.writeDxfDetailed',
      exporterVersion: 'product-multiseam-v2-replay/1',
      exportSha256: productExportSha256,
      manifestIdentitySha256: digests.value.manifestIdentitySha256,
      selectedGeometrySha256: digests.value.selectedGeometrySha256,
      manifestCreatedAt: currentManifest.createdAt,
      manifestGenerator: currentManifest.generator,
      techCardId: currentManifest.techCardId,
      provenanceKind: 'untrusted-product',
      corpusEntryId: null,
    };
    const artifactBinding = await computePatternImportDxfBridgeArtifactBindingSha256V1(
      unsignedBinding,
      { crypto },
    );
    if (!artifactBinding.ok)
      return blocked('artifact-binding-blocked', 'Artifact binding SHA-256 is unavailable.');
    const composition: PatternImportDxfPipelineHandoffInputV1 = {
      schemaVersion: PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
      sourceFileId: catalog.sourceFileId,
      pipeline: selection.pipeline,
      manifest: currentManifest,
      pieces: replay.job.pieces,
      binding: {
        ...unsignedBinding,
        artifactBindingSha256: artifactBinding.artifactBindingSha256,
      },
      physicalSurface: choices.physicalSurface,
      seams: choices.seams.map((seam) => ({
        id: seam.id,
        operationId: seam.operationId,
        mapping: seam.mapping,
        lengthRatio: seam.lengthRatio,
        sides: seam.sides.map((side) => ({
          pieceId: side.pieceId,
          contourId: side.contourId,
          anchors:
            side.direction === 'forward'
              ? ([
                  side.boundaryVertexIds[0]!,
                  side.boundaryVertexIds[side.boundaryVertexIds.length - 1]!,
                ] as [string, string])
              : ([
                  side.boundaryVertexIds[side.boundaryVertexIds.length - 1]!,
                  side.boundaryVertexIds[0]!,
                ] as [string, string]),
          direction: side.direction,
        })) as [
          {
            pieceId: string;
            contourId: string;
            anchors: [string, string];
            direction: 'forward' | 'reverse';
          },
          {
            pieceId: string;
            contourId: string;
            anchors: [string, string];
            direction: 'forward' | 'reverse';
          },
        ],
      })),
      operations: choices.operations,
      materials: choices.materials,
    };
    const handoffResult = await buildPatternImportDxfPipelineHandoffV1(composition, { crypto });
    if (!handoffResult.ok)
      return blocked(
        'handoff-blocked',
        handoffResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    const compiledHandoff = await compileDxfAssemblyHandoffV1(handoffResult.handoff, { crypto });
    if (!compiledHandoff.ok)
      return blocked(
        'handoff-compile-blocked',
        `${compiledHandoff.code}: ${compiledHandoff.errors.join('; ')}`,
      );
    if (
      compiledHandoff.sourceHandoffSha256 !== handoffResult.handoff.seal.canonicalSha256 ||
      compiledHandoff.assembly.source.documentId !== choices.documentId ||
      compiledHandoff.assembly.source.revision !== choices.revision ||
      compiledHandoff.assembly.operations.length !== 1 ||
      compiledHandoff.assembly.operations[0]?.order !== 0 ||
      compiledHandoff.assembly.operations[0]?.id !== choices.operations[0]?.id ||
      [...(compiledHandoff.assembly.operations[0]?.seamIds ?? [])].sort().join('\0') !==
        [...(choices.operations[0]?.seamIds ?? [])].sort().join('\0') ||
      compiledHandoff.assembly.seams.length !== 2 ||
      [...compiledHandoff.assembly.seams.map(({ id }) => id)].sort().join('\0') !==
        [...choices.seams.map(({ id }) => id)].sort().join('\0') ||
      compiledHandoff.assembly.pieces.length !== 2 ||
      [...compiledHandoff.assembly.pieces.map(({ id }) => id)].sort().join('\0') !==
        [...selection.selection.pieceIds].sort().join('\0')
    )
      return blocked(
        'handoff-binding-mismatch',
        'Fresh compiled handoff must retain the exact document, revision, operation, pair and seam identities.',
      );
    const pieceIds = [...selection.selection.pieceIds].sort() as [string, string];
    const seamIds = [...choices.operations[0]!.seamIds].sort() as [string, string];
    const aggregateResult = await buildPatternImportDxfTwoSeamMappingAggregateV1(
      {
        schemaVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_REQUEST_V1,
        operation: {
          id: choices.operations[0]!.id,
          sourceOperationNumber: proposal.operation.sourceOperationNumber,
          stage: choices.operations[0]!.stage,
          order: 0,
          kind: 'stitch',
          pieceIds,
          seamIds,
        },
        mappings: [
          seamInput(composition, choices, selection, seamIds[0]),
          seamInput(composition, choices, selection, seamIds[1]),
        ],
      },
      crypto,
    );
    if (!aggregateResult.ok)
      return blocked(
        'aggregate-mapping-blocked',
        aggregateResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (
      aggregateResult.aggregate.sourceBinding.documentId !== choices.documentId ||
      aggregateResult.aggregate.sourceBinding.revision !== choices.revision ||
      aggregateResult.aggregate.sourceBinding.baseFinalCoordinateSha256 !==
        digests.value.selectedGeometrySha256 ||
      aggregateResult.aggregate.childSeals.some((child, index) => {
        const mapping = aggregateResult.childMappings[index];
        const seal = aggregateResult.childSeals[index];
        return (
          !mapping ||
          !seal ||
          child.seamId !== mapping.seam.id ||
          child.mappingCanonicalSha256 !== seal.canonicalSha256 ||
          child.handoffCanonicalSha256 !== mapping.sourceBinding.handoffCanonicalSha256
        );
      })
    )
      return blocked(
        'aggregate-binding-mismatch',
        'Both seam mappings must bind the exact fresh handoff, document revision and geometry.',
      );
    const evidence = {
      techCardId: current.row.techCardId,
      scopeKey: current.row.scopeKey,
      patternLineKey: current.row.patternLineKey,
      patternVersion: current.row.patternVersion,
      cardLockVersion: current.row.cardLockVersion,
      importGeneration: current.importGeneration,
      sourceOperationNumber: proposal.operation.sourceOperationNumber,
      localOperationOrder: 0 as const,
      sizeSelectionSha256: selection.selection.canonicalSha256,
      catalogSha256: catalog.canonicalSha256,
      proposalFingerprint: proposal.deterministicFingerprint,
      phaseEPlanSha256: choices.aggregatePlanSeal.canonicalSha256,
      sourceFileSha256: selection.phaseD.sourceSha256,
      productExportSha256,
      ...(currentManifest === productExportManifest
        ? {}
        : { sourceManifestMode: 'saved-product-direct-source' as const }),
      handoffCanonicalSha256: handoffResult.handoff.seal.canonicalSha256,
      twoSeamMappingAggregateSha256: aggregateResult.seal.canonicalSha256,
    };
    const canonicalSha256 = await digest(
      'pattern-import-dxf-product-multiseam-mapping-composition-v2',
      evidence,
      crypto,
    );
    if (!canonicalSha256)
      return blocked('sha256-unavailable', 'Composition SHA-256 is unavailable.');
    return deepFreeze({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2,
      handoff: handoffResult.handoff,
      aggregate: aggregateResult.aggregate,
      aggregateSeal: aggregateResult.seal,
      compositionSeal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_SEAL_V2,
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
        atomicTwoSeamAuthority: true as const,
        persistentAuthority: false as const,
        productionReady: false as const,
      },
      downstreamCompilation: {
        status: 'blocked' as const,
        code: 'phase1-proof-not-integrated' as const,
        detail:
          'The handoff compiles to GarmentAssemblyIR, but exact piece triangulation and seam proofs are not owned by this composition.',
      },
      evidence,
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_CLAIMS_V2,
    });
  } catch {
    return blocked('invalid-input', 'V2 composition rejected inaccessible or malformed input.');
  } finally {
    claimed = false;
  }
}
