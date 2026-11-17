import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import type { ApplyResult, CardDraft } from '../../pattern-import/types';
import {
  replayCommittedPatternImportDxfProductScopeV1,
  type PatternImportDxfProductCommitReplayResultV1,
} from './pattern-import-dxf-product-commit-replay-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
  admitPatternImportDxfProductPhaseEIntentV1,
  type PatternImportDxfProductPhaseEIntentV1,
  type PatternImportDxfProductPhaseEPlanV1,
} from './pattern-import-dxf-product-phase-e-intent-v1';
import {
  computePatternImportDxfBridgeArtifactBindingSha256V1,
  computePatternImportDxfBridgeBindingDigestsV1,
  type PatternImportDxfBridgeUnsignedBindingV1,
  type PatternImportDxfManifestBridgeViewV1,
} from './pattern-import-dxf-handoff-bridge-v1';
import {
  PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
  type PatternImportDxfPipelineHandoffInputV1,
} from './pattern-import-dxf-pipeline-handoff-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
  type PatternImportDxfTwoSidedSeamMappingInputV1,
} from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  buildPatternImportDxfTwoSidedSeamMappingV2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1 =
  'pattern-import-dxf-product-mapping-composition/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1 =
  'pattern-import-dxf-product-mapping-composition-seal/1' as const;

export type PatternImportDxfProductExpectedSavedRowV1 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  dxfSha256: string;
  patternVersion: number;
  cardLockVersion: number;
  /** First Semantic V1 must not replace an existing carrier on this saved DXF row. */
  firstAttachmentSavedRowRevision?: number;
}>;

export type PatternImportDxfProductMappingCompositionInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1;
  scopeKey: string;
  draft: CardDraft;
  apply: ApplyResult;
  selection: DxfProductPhaseDSizeSelectionResultV1;
  intent: PatternImportDxfProductPhaseEIntentV1;
  /** Optional UI chronology precondition; when present, fresh readback must exact-match it. */
  expectedSavedRow?: PatternImportDxfProductExpectedSavedRowV1;
}>;

export type PatternImportDxfProductMappingCompositionBlockerV1 = Readonly<{
  code:
    | 'invalid-input'
    | 'phase-e-admission-blocked'
    | 'commit-replay-blocked'
    | 'scope-missing-or-ambiguous'
    | 'writer-piece-binding-blocked'
    | 'artifact-binding-blocked'
    | 'g4f1-mapping-blocked'
    | 'sha256-unavailable';
  detail: string;
}>;

export type PatternImportDxfProductMappingCompositionSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  authority: 'unsigned-product-consistency-only';
  trustedAuthorityIntegrated: false;
  postSaveReadbackIntegrated: false;
  productionReady: false;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_CLAIMS_V1 = Object.freeze({
  phaseEIntentFreshAdmitted: true,
  exactPhaseDSizeSelectionConsumed: true,
  retainedProductWriterPiecesConsumed: true,
  committedProductWriterReplayVerified: true,
  fullLengthCompatibilityVerified: true,
  g4f1SourcePathMappingProduced: true,
  productWriterShaBoundByComposition: true,
  callerSuppliedDxfBytesAccepted: false,
  callerSuppliedExportShaAcceptedAsAuthority: false,
  provenanceKind: 'untrusted-product',
  g4f3PostSaveReadbackIntegrated: false,
  trustedAuthorityIntegrated: false,
  sidecarPersisted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  phaseEIntentFreshAdmitted: false as const,
  exactPhaseDSizeSelectionConsumed: false as const,
  retainedProductWriterPiecesConsumed: false as const,
  committedProductWriterReplayVerified: false as const,
  fullLengthCompatibilityVerified: false as const,
  g4f1SourcePathMappingProduced: false as const,
  productWriterShaBoundByComposition: false as const,
  callerSuppliedDxfBytesAccepted: false as const,
  callerSuppliedExportShaAcceptedAsAuthority: false as const,
  provenanceKind: 'untrusted-product' as const,
  g4f3PostSaveReadbackIntegrated: false as const,
  trustedAuthorityIntegrated: false as const,
  sidecarPersisted: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductMappingCompositionResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1;
      mapping: PatternImportDxfTwoSidedSeamMappingV2;
      mappingSeal: PatternImportDxfTwoSidedSeamMappingSealV2;
      compositionSeal: PatternImportDxfProductMappingCompositionSealV1;
      evidence: Readonly<{
        scopeKey: string;
        phaseEPlanSha256: string;
        sizeSelectionSha256: string;
        productExportSha256: string;
        byteLength: number;
        patternLineKey: string;
        patternUrl: string;
        patternSizeId: number;
        previousLockVersion: number;
        pieceLineKeys: readonly string[];
        aliases: readonly Readonly<{
          scopeKey: string;
          blockName: string;
          pieceLineKey: string;
        }>[];
        handoffCanonicalSha256: string;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1;
      mapping: null;
      mappingSeal: null;
      compositionSeal: null;
      evidence: null;
      blockers: readonly [PatternImportDxfProductMappingCompositionBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

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
  code: PatternImportDxfProductMappingCompositionBlockerV1['code'],
  detail: string,
): PatternImportDxfProductMappingCompositionResultV1 {
  return deepFreeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1,
    mapping: null,
    mappingSeal: null,
    compositionSeal: null,
    evidence: null,
    blockers: [{ code, detail }] as const,
    claims: BLOCKED_CLAIMS,
  });
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

async function sha256Canonical(
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        textEncoder.encode(
          `pattern-import-dxf-product-mapping-composition-v1\0${canonical(value)}`,
        ),
      ),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function baseInput(
  plan: PatternImportDxfProductPhaseEPlanV1,
  selection: Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>,
  manifest: PatternImportDxfManifestBridgeViewV1,
  pieces: NonNullable<CardDraft['scopes'][number]['writerReplay']>['job']['pieces'],
  binding: PatternImportDxfPipelineHandoffInputV1['binding'],
): PatternImportDxfTwoSidedSeamMappingInputV1 {
  const composition: PatternImportDxfPipelineHandoffInputV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
    sourceFileId: plan.sourceFileId,
    pipeline: selection.pipeline,
    manifest,
    pieces,
    binding,
    physicalSurface: plan.physicalSurface,
    seams: plan.seams,
    operations: plan.operations,
    materials: plan.materials,
  };
  return {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
    composition,
    expected: {
      sourceFileId: plan.sourceFileId,
      documentId: plan.documentId,
      revision: plan.revision,
      finalCoordinateSha256: binding.selectedGeometrySha256,
    },
    scopes: [{ scopeId: plan.scopeKey, pieceIds: [...selection.selection.pieceIds] }],
    seamId: plan.seams[0].id,
    tolerance: plan.tolerance,
  };
}

/**
 * Fresh-composes the product's retained writer geometry, exact Phase-D selection and explicit
 * Phase-E intent. This closes G4F1 mapping/length compatibility and binds it to the committed
 * product byte SHA, but deliberately stops before fresh G4F3 card readback or persistence.
 */
export async function buildPatternImportDxfProductMappingCompositionV1(
  input: PatternImportDxfProductMappingCompositionInputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductMappingCompositionResultV1> {
  if (
    !input ||
    input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1 ||
    !STABLE_ID.test(input.scopeKey ?? '') ||
    !input.draft ||
    !input.apply ||
    !input.selection ||
    !input.intent
  )
    return blocked('invalid-input', 'Exact product composition V1 inputs are required.');

  const admitted = await admitPatternImportDxfProductPhaseEIntentV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
      draft: input.draft,
      selection: input.selection,
      intent: input.intent,
    },
    crypto,
  );
  if (!admitted.ok)
    return blocked(
      'phase-e-admission-blocked',
      admitted.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );
  if (admitted.plan.scopeKey !== input.scopeKey)
    return blocked('invalid-input', 'Requested scope does not equal the admitted Phase-E scope.');

  const committed: PatternImportDxfProductCommitReplayResultV1 =
    await replayCommittedPatternImportDxfProductScopeV1(
      input.draft,
      input.apply,
      input.scopeKey,
      crypto,
    );
  if (!committed.ok)
    return blocked(
      'commit-replay-blocked',
      committed.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );
  if (!input.selection.ok)
    return blocked('invalid-input', 'Successful Phase-D selection disappeared after admission.');

  const scopes = input.draft.scopes.filter(({ target }) => target.scopeKey === input.scopeKey);
  if (scopes.length !== 1)
    return blocked(
      'scope-missing-or-ambiguous',
      'The exact product scope and retained writer job are required once.',
    );
  const scope = scopes[0];
  const replay = scope.writerReplay;
  if (!replay)
    return blocked(
      'scope-missing-or-ambiguous',
      'The exact product scope and retained writer job are required once.',
    );
  if (
    replay.job.scope.scopeKey !== input.scopeKey ||
    replay.job.techCardId !== input.draft.techCardId ||
    committed.evidence.techCardId !== input.draft.techCardId ||
    scope.manifest.techCardId !== input.draft.techCardId
  )
    return blocked(
      'writer-piece-binding-blocked',
      'Writer job, manifest, draft and confirmed commit card identities differ.',
    );

  const currentManifest = manifestView(scope.manifest);
  const selections = input.selection.pipeline.carrier?.pieces.map(({ pieceId, sizeToken }) => ({
    pieceId,
    sizeToken,
  }));
  if (!selections || selections.length !== input.selection.selection.pieceIds.length)
    return blocked(
      'writer-piece-binding-blocked',
      'Selected public Phase-D pieces are missing or have different cardinality.',
    );
  // Writer replay above keeps all graded sizes. The sealed Phase-D selection below contains
  // exactly one rank, so G4F0 must receive only the matching PieceSpecs and sizes.
  const selectedWriterPieces = replay.job.pieces.flatMap((piece) => {
    const selected = selections.find(({ pieceId }) => pieceId === piece.identity);
    if (!selected) return [];
    return [
      { ...piece, sizes: piece.sizes.filter(({ sizeToken }) => sizeToken === selected.sizeToken) },
    ];
  });
  if (
    selectedWriterPieces.length !== selections.length ||
    selectedWriterPieces.some(({ sizes }) => sizes.length !== 1) ||
    new Set(selectedWriterPieces.map(({ identity }) => identity)).size !== selections.length
  )
    return blocked(
      'writer-piece-binding-blocked',
      'Each selected Phase-D piece must match one exact size in the committed writer job.',
    );
  const digests = await computePatternImportDxfBridgeBindingDigestsV1(
    currentManifest,
    selectedWriterPieces,
    selections,
    { crypto },
  );
  if (!digests.ok) return blocked('writer-piece-binding-blocked', digests.errors.join('; '));

  const unsignedBinding: PatternImportDxfBridgeUnsignedBindingV1 = {
    documentId: admitted.plan.documentId,
    revision: admitted.plan.revision,
    exporterId: 'grbpwr.pattern-import.writeDxfDetailed',
    exporterVersion: 'product-r12-replay/1',
    exportSha256: committed.evidence.productExportSha256,
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
  const binding = {
    ...unsignedBinding,
    artifactBindingSha256: artifactBinding.artifactBindingSha256,
  };

  const base = baseInput(
    admitted.plan,
    input.selection,
    currentManifest,
    selectedWriterPieces,
    binding,
  );
  const mapped = await buildPatternImportDxfTwoSidedSeamMappingV2(
    {
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      base,
      phaseD: input.selection.phaseD,
    },
    crypto,
    input.expectedSavedRow?.firstAttachmentSavedRowRevision !== undefined &&
      input.expectedSavedRow.scopeKey === input.scopeKey &&
      input.expectedSavedRow.techCardId === committed.evidence.techCardId &&
      input.expectedSavedRow.dxfSha256 === committed.evidence.productExportSha256 &&
      input.expectedSavedRow.patternLineKey === committed.evidence.patternLineKey
      ? committed
      : undefined,
  );
  if (!mapped.ok)
    return blocked(
      'g4f1-mapping-blocked',
      mapped.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );
  if (
    mapped.mapping.sourceBinding.sourceFileId !== admitted.plan.sourceFileId ||
    mapped.mapping.sourceBinding.documentId !== admitted.plan.documentId ||
    mapped.mapping.sourceBinding.revision !== admitted.plan.revision ||
    mapped.mapping.sourceBinding.baseFinalCoordinateSha256 !==
      digests.value.selectedGeometrySha256 ||
    !SHA256.test(committed.evidence.productExportSha256)
  )
    return blocked(
      'g4f1-mapping-blocked',
      'Fresh mapping source binding does not equal the admitted product artifacts.',
    );

  const sealPayload = {
    scopeKey: input.scopeKey,
    phaseEPlanSha256: admitted.plan.canonicalSha256,
    sizeSelectionSha256: input.selection.selection.canonicalSha256,
    productExportSha256: committed.evidence.productExportSha256,
    byteLength: committed.evidence.byteLength,
    patternLineKey: committed.evidence.patternLineKey,
    patternUrl: committed.evidence.patternUrl,
    patternSizeId: committed.evidence.patternSizeId,
    previousLockVersion: committed.evidence.previousLockVersion,
    pieceLineKeys: committed.evidence.pieceLineKeys,
    aliases: committed.evidence.aliases,
    handoffCanonicalSha256: mapped.mapping.sourceBinding.handoffCanonicalSha256,
    mappingSha256: mapped.seal.canonicalSha256,
  };
  const canonicalSha256 = await sha256Canonical(sealPayload, crypto);
  if (!canonicalSha256)
    return blocked('sha256-unavailable', 'Product mapping composition SHA-256 is unavailable.');

  return deepFreeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1,
    mapping: mapped.mapping,
    mappingSeal: mapped.seal,
    compositionSeal: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256,
      authority: 'unsigned-product-consistency-only' as const,
      trustedAuthorityIntegrated: false as const,
      postSaveReadbackIntegrated: false as const,
      productionReady: false as const,
    },
    evidence: sealPayload,
    blockers: [] as const,
    claims: PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_CLAIMS_V1,
  });
}
