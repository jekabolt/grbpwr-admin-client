import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import type {
  GarmentPhase2RefinedVertexProvenanceV1,
  GarmentPhase2SavedLocalFrameRefinementArtifactV2,
  GarmentPhase2SavedLocalFrameTranslationV2,
} from '../mesh/garment-phase2-interior-refinement-v1';
import {
  disposeDxfProductPhase2RefinedBuildOwnerV1,
  projectDxfProductPhase2RefinedBuildOwnerV1,
  type DxfProductPhase2RefinedBuildOwnerV1,
} from './dxf-product-phase2-refined-build-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2,
  consumePatternImportDxfProductGarmentMeshComposerRefinementV3,
  consumePatternImportDxfProductGarmentMeshComposerSavedLocalFrameRefinementV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3 =
  'pattern-import-dxf-product-garment-mesh-composer-request/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V3 =
  'pattern-import-dxf-product-garment-mesh-composer/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V3 =
  'pattern-import-dxf-product-garment-mesh-composer-owner/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V3 =
  'pattern-import-dxf-product-garment-mesh-composer-projection/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2 =
  'pattern-import-dxf-product-garment-mesh-composer-saved-local-frame-internal-request/2' as const;

const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const CANONICAL_MEDIUM_FRESH_LOCAL_SOURCE_IDS_SHA256 =
  '97defb9e034556adbefbd8dc9ff917018f208c87e9ae420105c70649a3f5249b' as const;
const encoder = new TextEncoder();
const capturedStructuredClone = globalThis.structuredClone?.bind(globalThis);

export type PatternImportDxfProductGarmentMeshComposerRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
}>;

export type PatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  translations: readonly GarmentPhase2SavedLocalFrameTranslationV2[];
}>;

export type PatternImportDxfProductGarmentMeshComposerSavedLocalFrameEvidenceV2 = Readonly<{
  composerV2CanonicalSha256: string;
  composerV3CanonicalSha256: string;
  phase2ArtifactSha256: string;
  localArtifactSha256: string;
  writtenArtifactSha256: string;
  writtenFrameDiagnosticArtifactSha256: string;
  phaseEvidenceSha256: string;
  localSourceIdsSha256: string;
  translationSha256: string;
  translations: readonly GarmentPhase2SavedLocalFrameTranslationV2[];
  phaseEvidence: GarmentPhase2SavedLocalFrameRefinementArtifactV2['phaseEvidence'];
  counts: Readonly<{
    vertexCount: 580;
    boundaryVertexCount: 244;
    interiorVertexCount: 336;
    triangleCount: 912;
    seamCount: 2;
    seamPairCount: 34;
    localInteriorVertexCountByPiece: readonly [168, 168];
  }>;
  claims: Readonly<{
    genuineComposerV3OwnerPublished: true;
    originalWrittenFrameEvaluationAccepted: true;
    existingV1LatticeAndCdtUsedInLocalFrame: true;
    outputReturnedToPersistedWrittenFrame: true;
    fullWrittenToLocalLatticePhaseChangeObserved: true;
    boundaryAndAoSourceIdentityOrderPreserved: true;
    geometryExtremaInferenceUsed: false;
    sourceAuthenticityAccepted: false;
    placementAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

export type PatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
      snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
      evidence: PatternImportDxfProductGarmentMeshComposerSavedLocalFrameEvidenceV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3;
    }>
  | Extract<PatternImportDxfProductGarmentMeshComposerResultV3, { ok: false }>;

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3 = Object.freeze({
  genuineComposerV2Consumed: true,
  refinedProductMeshIntegrated: true,
  interiorRefinementIntegrated: true,
  recoveredBoundaryPreserved: true,
  distributedEqualSeamPairsPreserved: true,
  triangleMaterialFramesBound: true,
  sourceAuthenticityAccepted: false,
  staticPreviewReady: false,
  placementReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3,
  genuineComposerV2Consumed: false as const,
  refinedProductMeshIntegrated: false as const,
  interiorRefinementIntegrated: false as const,
  recoveredBoundaryPreserved: false as const,
  distributedEqualSeamPairsPreserved: false as const,
  triangleMaterialFramesBound: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3 = Object.freeze([
  'real-product-fixture-geometry-not-yet-cleared',
  'row-chronology-not-authenticated',
  'source-authenticity-not-established',
  'static-preview-not-integrated',
  'placement-not-proven',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'production-qualification-not-run',
] as const);

export type PatternImportDxfProductGarmentMeshComposerSnapshotV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V3;
  status: 'in-memory-refined-product-mesh-authority-candidate';
  origin: PatternImportDxfProductGarmentMeshComposerSnapshotV2['origin'];
  row: PatternImportDxfProductGarmentMeshComposerSnapshotV2['row'];
  assembly: PatternImportDxfProductGarmentMeshComposerSnapshotV2['assembly'];
  bindings: Readonly<{
    composerV2CanonicalSha256: string;
    phase2OwnerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedOwnerCanonicalSha256: string;
    refinedArtifactSha256: string;
    phase2UpgradeFingerprint: string;
    boundaryRecoveryFingerprint: string;
    boundaryRecoveryEvaluationFingerprint: string;
    refinementFingerprint: string;
    refinementEvaluationFingerprint: string;
  }>;
  mesh: Readonly<{
    pieceCount: number;
    seamCount: number;
    vertexCount: number;
    boundaryVertexCount: number;
    interiorVertexCount: number;
    triangleCount: number;
    seamPairCount: number;
    minimumTriangleEdgeMm: number;
    maximumTriangleEdgeMm: number;
    minimumTriangleAngleDegrees: number;
    maximumEdgeRatio: number;
    maximumRadiusEdgeRatio: number;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3;
  blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3;
}>;

declare const composerV3OwnerBrand: unique symbol;
export type PatternImportDxfProductGarmentMeshComposerOwnerV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V3;
  snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
  readonly [composerV3OwnerBrand]: never;
}>;

export type PatternImportDxfProductGarmentMeshComposerProjectionV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V3;
  composerCanonicalSha256: string;
  composerV2CanonicalSha256: string;
  phase2ArtifactSha256: string;
  refinedArtifactSha256: string;
  refinementFingerprint: string;
  refinementEvaluationFingerprint: string;
  mesh: ClothMeshIR;
  vertexProvenance: readonly GarmentPhase2RefinedVertexProvenanceV1[];
  triangleMaterialFrames2: Float32Array;
  boundaryRecoveryEvidence: NonNullable<
    ReturnType<typeof projectDxfProductPhase2RefinedBuildOwnerV1>
  >['boundaryRecoveryEvidence'];
  callerOwnedMutableCopies: true;
  sourceAuthenticityAccepted: false;
  staticPreviewAuthority: false;
  placementAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductGarmentMeshComposerBlockerCodeV3 =
  | 'invalid-input'
  | 'composer-v2-owner-unavailable'
  | 'refinement-capability-consumed'
  | 'refinement-failed'
  | 'refined-binding-mismatch'
  | 'sha256-unavailable';

export type PatternImportDxfProductGarmentMeshComposerResultV3 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
      snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{ code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV3; detail: string }>,
      ];
    }>;

type LegacyOwnerRecord = {
  kind: 'legacy-v3';
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  refinedOwner: DxfProductPhase2RefinedBuildOwnerV1;
  disposed: boolean;
};

type SavedLocalFrameOwnerRecord = {
  kind: 'saved-local-frame-v2';
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  artifact: GarmentPhase2SavedLocalFrameRefinementArtifactV2;
  disposed: boolean;
};

type OwnerRecord = LegacyOwnerRecord | SavedLocalFrameOwnerRecord;

const owners = new WeakMap<object, OwnerRecord>();

class ComposerV3Failure extends Error {
  constructor(
    readonly code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV3,
    detail: string,
  ) {
    super(detail);
  }
}

function fail(
  code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV3,
  detail: string,
): never {
  throw new ComposerV3Failure(code, detail.slice(0, 2_048));
}

function blocked(
  error: unknown,
): Extract<PatternImportDxfProductGarmentMeshComposerResultV3, { ok: false }> {
  const failure =
    error instanceof ComposerV3Failure
      ? error
      : new ComposerV3Failure(
          'refinement-failed',
          error instanceof Error ? error.message : 'C6 V3 refinement failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: BLOCKED_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [
      Readonly<{ code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV3; detail: string }>,
    ],
  });
}

function exactInput(input: unknown): PatternImportDxfProductGarmentMeshComposerRequestV3 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'C6 V3 request must be one exact object.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  const expected = ['composerV2Owner', 'schemaVersion'];
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    keys.length !== actual.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'C6 V3 request has an unsupported property shape.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('invalid-input', `C6 V3 request ${key} must be enumerable own data.`);
  }
  if (
    descriptors.schemaVersion!.value !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3
  )
    fail('invalid-input', 'C6 V3 request version is unsupported.');
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3,
    composerV2Owner: descriptors.composerV2Owner!
      .value as PatternImportDxfProductGarmentMeshComposerOwnerV2,
  };
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('refined-binding-mismatch', 'Canonical number is invalid.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object')
    fail('refined-binding-mismatch', 'Canonical value is invalid.');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > MAX_CANONICAL_BYTES)
    fail('refined-binding-mismatch', 'C6 V3 canonical payload exceeds the byte bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.length !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof ComposerV3Failure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function freezePlain<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => freezePlain(child, seen));
  return Object.freeze(value);
}

function exactSavedLocalFrameInternalInput(
  input: unknown,
): PatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalRequestV2 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'Saved local-frame V3 internal request must be one exact object.');
  let descriptors: PropertyDescriptorMap;
  try {
    if (Object.getPrototypeOf(input) !== Object.prototype)
      fail('invalid-input', 'Saved local-frame V3 internal request must be plain.');
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    if (error instanceof ComposerV3Failure) throw error;
    fail('invalid-input', 'Saved local-frame V3 internal request reflection failed closed.');
  }
  const expected = ['composerV2Owner', 'schemaVersion', 'translations'];
  const keys = Reflect.ownKeys(descriptors);
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    keys.length !== actual.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'Saved local-frame V3 internal request has unsupported fields.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', `Saved local-frame V3 internal request ${key} must be own data.`);
  }
  if (
    descriptors.schemaVersion!.value !==
    PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2
  )
    fail('invalid-input', 'Saved local-frame V3 internal request version is unsupported.');
  return Object.freeze({
    schemaVersion:
      PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2,
    composerV2Owner: descriptors.composerV2Owner!
      .value as PatternImportDxfProductGarmentMeshComposerOwnerV2,
    translations: descriptors.translations!
      .value as readonly GarmentPhase2SavedLocalFrameTranslationV2[],
  });
}

function ownSavedLocalFrameArtifact(
  artifact: GarmentPhase2SavedLocalFrameRefinementArtifactV2,
): GarmentPhase2SavedLocalFrameRefinementArtifactV2 {
  if (!capturedStructuredClone)
    fail('refined-binding-mismatch', 'Native structuredClone is required for saved V3 ownership.');
  let owned: GarmentPhase2SavedLocalFrameRefinementArtifactV2;
  try {
    owned = capturedStructuredClone(artifact);
  } catch {
    fail('refined-binding-mismatch', 'Saved local-frame refinement could not be detached.');
  }
  return freezePlain(owned);
}

function burnSavedLocalFrameArtifact(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    value.fill(0);
    return;
  }
  for (const child of Object.values(value as Record<string, unknown>))
    burnSavedLocalFrameArtifact(child, seen);
}

function cloneSavedMesh(mesh: ClothMeshIR): ClothMeshIR {
  return Object.freeze({
    ...mesh,
    restPositions2Mm: new Float32Array(mesh.restPositions2Mm),
    triangles: new Uint32Array(mesh.triangles),
    pieceRanges: Object.freeze(mesh.pieceRanges.map((range) => Object.freeze({ ...range }))),
    boundarySamples: Object.freeze(
      mesh.boundarySamples.map((sample) => Object.freeze({ ...sample })),
    ),
    seams: Object.freeze(
      mesh.seams.map((seam) =>
        Object.freeze({ ...seam, vertexPairs: new Uint32Array(seam.vertexPairs) }),
      ),
    ),
    quality: Object.freeze({ ...mesh.quality }),
  });
}

export async function buildPatternImportDxfProductGarmentMeshComposerV3(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductGarmentMeshComposerResultV3> {
  let refinedOwner: DxfProductPhase2RefinedBuildOwnerV1 | null = null;
  let published = false;
  try {
    const request = exactInput(input);
    const upstream = request.composerV2Owner.snapshot;
    if (
      upstream.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2 ||
      upstream.claims.sourceNativeBound !== true ||
      upstream.claims.productionReady !== false
    )
      fail('composer-v2-owner-unavailable', 'A genuine honest C6 V2 owner is required.');
    const refined = await consumePatternImportDxfProductGarmentMeshComposerRefinementV3(
      request.composerV2Owner,
      options,
    );
    if (!refined)
      fail('composer-v2-owner-unavailable', 'The C6 V2 owner is unavailable or disposed.');
    if (!refined.ok) {
      const sourceCode = refined.blockers[0].code;
      fail(
        sourceCode === 'phase2-refinement-capability-consumed'
          ? 'refinement-capability-consumed'
          : 'refinement-failed',
        refined.blockers[0].detail,
      );
    }
    refinedOwner = refined.owner;
    if (
      refined.snapshot.phase2OwnerCanonicalSha256 !== upstream.seals.phase2OwnerCanonicalSha256 ||
      refined.snapshot.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256 ||
      refined.snapshot.claims.interiorRefinementIntegrated !== true ||
      refined.snapshot.claims.sourceAuthenticityAccepted !== false ||
      refined.snapshot.claims.placementReady !== false ||
      refined.snapshot.claims.runtimeReady !== false
    )
      fail('refined-binding-mismatch', 'C5.3 output does not exact-bind the C6 V2 source owner.');
    const bindings = Object.freeze({
      composerV2CanonicalSha256: upstream.seal.canonicalSha256,
      phase2OwnerCanonicalSha256: refined.snapshot.phase2OwnerCanonicalSha256,
      phase2ArtifactSha256: refined.snapshot.phase2ArtifactSha256,
      refinedOwnerCanonicalSha256: refined.snapshot.seal.canonicalSha256,
      refinedArtifactSha256: refined.snapshot.refinedArtifactSha256,
      phase2UpgradeFingerprint: refined.snapshot.phase2UpgradeFingerprint,
      boundaryRecoveryFingerprint: refined.snapshot.boundaryRecoveryFingerprint,
      boundaryRecoveryEvaluationFingerprint: refined.snapshot.boundaryRecoveryEvaluationFingerprint,
      refinementFingerprint: refined.snapshot.refinementFingerprint,
      refinementEvaluationFingerprint: refined.snapshot.refinementEvaluationFingerprint,
    });
    const mesh = Object.freeze({
      pieceCount: refined.snapshot.counts.pieceCount,
      seamCount: refined.snapshot.counts.seamCount,
      vertexCount: refined.snapshot.counts.vertexCount,
      boundaryVertexCount: refined.snapshot.counts.boundaryVertexCount,
      interiorVertexCount: refined.snapshot.counts.interiorVertexCount,
      triangleCount: refined.snapshot.counts.triangleCount,
      seamPairCount: refined.snapshot.counts.seamPairCount,
      minimumTriangleEdgeMm: refined.snapshot.quality.minimumTriangleEdgeMm,
      maximumTriangleEdgeMm: refined.snapshot.quality.maximumTriangleEdgeMm,
      minimumTriangleAngleDegrees: refined.snapshot.quality.minimumTriangleAngleDegrees,
      maximumEdgeRatio: refined.snapshot.quality.maximumEdgeRatio,
      maximumRadiusEdgeRatio: refined.snapshot.quality.maximumRadiusEdgeRatio,
    });
    const payload = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V3,
      status: 'in-memory-refined-product-mesh-authority-candidate' as const,
      origin: upstream.origin,
      row: upstream.row,
      assembly: upstream.assembly,
      bindings,
      mesh,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3,
    };
    const canonicalSha256 = await sha256(
      'pattern-import-dxf-product-garment-mesh-composer-v3',
      payload,
      options.crypto ?? globalThis.crypto,
    );
    const snapshot = freezePlain({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies PatternImportDxfProductGarmentMeshComposerSnapshotV3);
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V3,
      snapshot,
    }) as PatternImportDxfProductGarmentMeshComposerOwnerV3;
    owners.set(owner, {
      kind: 'legacy-v3',
      composerV2Owner: request.composerV2Owner,
      refinedOwner,
      disposed: false,
    });
    published = true;
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    if (refinedOwner && !published) disposeDxfProductPhase2RefinedBuildOwnerV1(refinedOwner);
  }
}

/**
 * Internal additive seam used only by the authenticated saved-frame wrapper. It publishes through
 * this module's genuine V3 WeakMap; no caller-authored pseudo owner or structural cast is accepted.
 */
export async function buildPatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalV2(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalResultV2> {
  let ownedArtifact: GarmentPhase2SavedLocalFrameRefinementArtifactV2 | null = null;
  let transientArtifact: GarmentPhase2SavedLocalFrameRefinementArtifactV2 | null = null;
  let request: PatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalRequestV2 | null =
    null;
  try {
    request = exactSavedLocalFrameInternalInput(input);
    const upstream = request.composerV2Owner.snapshot;
    const before = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    if (
      !before ||
      upstream.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2 ||
      upstream.origin !== 'verified-saved-row' ||
      upstream.claims.sourceNativeBound !== true ||
      upstream.claims.productionReady !== false ||
      before.composerCanonicalSha256 !== upstream.seal.canonicalSha256 ||
      before.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256
    )
      fail(
        'composer-v2-owner-unavailable',
        'A live genuine verified-saved-row Composer V2 owner is required.',
      );
    const refined = consumePatternImportDxfProductGarmentMeshComposerSavedLocalFrameRefinementV2(
      request.composerV2Owner,
      request.translations,
    );
    if (!refined)
      fail('composer-v2-owner-unavailable', 'The Composer V2 owner became unavailable.');
    if ('blocker' in refined)
      fail(
        refined.blocker.code === 'refinement-capability-consumed'
          ? 'refinement-capability-consumed'
          : 'refinement-failed',
        refined.blocker.detail,
      );
    transientArtifact = refined.handoff.artifact;
    if (
      refined.handoff.phase2OwnerCanonicalSha256 !== upstream.seals.phase2OwnerCanonicalSha256 ||
      refined.handoff.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256 ||
      refined.handoff.sourceAuthenticityAccepted !== false ||
      refined.handoff.placementAuthority !== false ||
      refined.handoff.runtimeAuthority !== false ||
      refined.handoff.productionAuthority !== false
    )
      fail(
        'refined-binding-mismatch',
        'Saved local-frame handoff does not exact-bind the genuine Composer V2 source.',
      );
    ownedArtifact = ownSavedLocalFrameArtifact(transientArtifact);
    const local = ownedArtifact.localArtifact;
    const written = ownedArtifact.writtenArtifact;
    const diagnostic = ownedArtifact.writtenFrameDiagnosticArtifact;
    const boundaryVertexCount = written.pieceEvidence.reduce(
      (sum, piece) => sum + piece.boundaryVertexCount,
      0,
    );
    const interiorVertexCount = written.pieceEvidence.reduce(
      (sum, piece) => sum + piece.interiorVertexCount,
      0,
    );
    const seamPairCount = written.mesh.seams.reduce(
      (sum, seam) => sum + seam.vertexPairs.length / 2,
      0,
    );
    const phasePieces = ownedArtifact.phaseEvidence.pieces;
    const expectedWrittenInteriorCounts = new Map([
      ['BACK', 167],
      ['FRONT', 162],
    ] as const);
    if (
      written.mesh.pieceRanges.length !== 2 ||
      written.mesh.seams.length !== 2 ||
      written.mesh.restPositions2Mm.length / 2 !== 580 ||
      boundaryVertexCount !== 244 ||
      interiorVertexCount !== 336 ||
      written.mesh.triangles.length / 3 !== 912 ||
      seamPairCount !== 34 ||
      phasePieces.length !== 2 ||
      phasePieces.some(
        (piece) =>
          piece.localFrameInteriorVertexCount !== 168 ||
          piece.writtenFrameInteriorVertexCount !==
            expectedWrittenInteriorCounts.get(piece.pieceId as 'BACK' | 'FRONT') ||
          piece.sourceIdOverlapCount !== 0 ||
          piece.fullLatticePhaseChange !== true,
      )
    )
      fail(
        'refined-binding-mismatch',
        'Saved local-frame refinement did not establish exact 580V/912T/34-pair and 168/168 full-phase parity.',
      );
    const crypto = options.crypto ?? globalThis.crypto;
    const [
      localArtifactSha256,
      writtenArtifactSha256,
      writtenFrameDiagnosticArtifactSha256,
      phaseEvidenceSha256,
      localSourceIdsSha256,
      translationSha256,
    ] = await Promise.all([
      sha256('pattern-import-saved-local-frame-local-artifact-v2', local, crypto),
      sha256('pattern-import-saved-local-frame-written-artifact-v2', written, crypto),
      sha256('pattern-import-saved-local-frame-written-diagnostic-artifact-v2', diagnostic, crypto),
      sha256(
        'pattern-import-saved-local-frame-phase-evidence-v2',
        ownedArtifact.phaseEvidence,
        crypto,
      ),
      sha256(
        'pattern-import-saved-local-frame-local-source-ids-v2',
        phasePieces.map((piece) => ({
          pieceId: piece.pieceId,
          sourceIds: piece.localFrameSourceIds,
        })),
        crypto,
      ),
      sha256(
        'pattern-import-saved-local-frame-translations-v2',
        ownedArtifact.translations,
        crypto,
      ),
    ]);
    if (localSourceIdsSha256 !== CANONICAL_MEDIUM_FRESH_LOCAL_SOURCE_IDS_SHA256)
      fail(
        'refined-binding-mismatch',
        'Saved local-frame lattice source IDs differ from the exact canonical fresh-import IDs.',
      );
    const afterHashes = projectPatternImportDxfProductGarmentMeshComposerV2(
      request.composerV2Owner,
    );
    if (
      !afterHashes ||
      afterHashes.composerCanonicalSha256 !== upstream.seal.canonicalSha256 ||
      afterHashes.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256
    )
      fail(
        'composer-v2-owner-unavailable',
        'Composer V2 became stale while saved local-frame hashes were computed.',
      );
    const refinedOwnerCanonicalSha256 = await sha256(
      'pattern-import-saved-local-frame-refined-owner-v2',
      {
        composerV2CanonicalSha256: upstream.seal.canonicalSha256,
        phase2OwnerCanonicalSha256: refined.handoff.phase2OwnerCanonicalSha256,
        phase2ArtifactSha256: refined.handoff.phase2ArtifactSha256,
        phase2UpgradeFingerprint: refined.handoff.phase2UpgradeFingerprint,
        boundaryRecoveryFingerprint: refined.handoff.boundaryRecoveryFingerprint,
        boundaryRecoveryEvaluationFingerprint:
          refined.handoff.boundaryRecoveryEvaluationFingerprint,
        firstRefinementFingerprint: refined.handoff.firstRefinementFingerprint,
        independentRepeatFingerprint: refined.handoff.independentRepeatFingerprint,
        independentEvaluationFingerprint: refined.handoff.independentEvaluationFingerprint,
        localArtifactSha256,
        writtenArtifactSha256,
        writtenFrameDiagnosticArtifactSha256,
        phaseEvidenceSha256,
        localSourceIdsSha256,
        translationSha256,
      },
      crypto,
    );
    const afterOwnerHash = projectPatternImportDxfProductGarmentMeshComposerV2(
      request.composerV2Owner,
    );
    if (
      !afterOwnerHash ||
      afterOwnerHash.composerCanonicalSha256 !== upstream.seal.canonicalSha256 ||
      afterOwnerHash.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256
    )
      fail(
        'composer-v2-owner-unavailable',
        'Composer V2 became stale while the saved refined-owner hash was computed.',
      );
    const bindings = Object.freeze({
      composerV2CanonicalSha256: upstream.seal.canonicalSha256,
      phase2OwnerCanonicalSha256: refined.handoff.phase2OwnerCanonicalSha256,
      phase2ArtifactSha256: refined.handoff.phase2ArtifactSha256,
      refinedOwnerCanonicalSha256,
      refinedArtifactSha256: writtenArtifactSha256,
      phase2UpgradeFingerprint: refined.handoff.phase2UpgradeFingerprint,
      boundaryRecoveryFingerprint: refined.handoff.boundaryRecoveryFingerprint,
      boundaryRecoveryEvaluationFingerprint: refined.handoff.boundaryRecoveryEvaluationFingerprint,
      refinementFingerprint: written.deterministicFingerprint,
      refinementEvaluationFingerprint: refined.handoff.independentEvaluationFingerprint,
    });
    const mesh = Object.freeze({
      pieceCount: 2,
      seamCount: 2,
      vertexCount: 580,
      boundaryVertexCount: 244,
      interiorVertexCount: 336,
      triangleCount: 912,
      seamPairCount: 34,
      minimumTriangleEdgeMm: written.minimumTriangleEdgeMm,
      maximumTriangleEdgeMm: written.maximumTriangleEdgeMm,
      minimumTriangleAngleDegrees: Math.min(
        ...written.pieceEvidence.map((piece) => piece.minTriangleAngleDegrees),
      ),
      maximumEdgeRatio: Math.max(...written.pieceEvidence.map((piece) => piece.maxEdgeRatio)),
      maximumRadiusEdgeRatio: Math.max(
        ...written.pieceEvidence.map((piece) => piece.maxRadiusEdgeRatio),
      ),
    });
    const payload = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V3,
      status: 'in-memory-refined-product-mesh-authority-candidate' as const,
      origin: upstream.origin,
      row: upstream.row,
      assembly: upstream.assembly,
      bindings,
      mesh,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3,
    };
    const canonicalSha256 = await sha256(
      'pattern-import-dxf-product-garment-mesh-composer-v3',
      payload,
      crypto,
    );
    const afterSnapshotHash = projectPatternImportDxfProductGarmentMeshComposerV2(
      request.composerV2Owner,
    );
    if (
      !afterSnapshotHash ||
      afterSnapshotHash.composerCanonicalSha256 !== upstream.seal.canonicalSha256 ||
      afterSnapshotHash.phase2ArtifactSha256 !== upstream.seals.phase2ArtifactSha256
    )
      fail(
        'composer-v2-owner-unavailable',
        'Composer V2 became stale before genuine saved V3 publication.',
      );
    const snapshot = freezePlain({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies PatternImportDxfProductGarmentMeshComposerSnapshotV3);
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V3,
      snapshot,
    }) as PatternImportDxfProductGarmentMeshComposerOwnerV3;
    owners.set(owner, {
      kind: 'saved-local-frame-v2',
      composerV2Owner: request.composerV2Owner,
      artifact: ownedArtifact,
      disposed: false,
    });
    const evidence = freezePlain({
      composerV2CanonicalSha256: upstream.seal.canonicalSha256,
      composerV3CanonicalSha256: canonicalSha256,
      phase2ArtifactSha256: upstream.seals.phase2ArtifactSha256,
      localArtifactSha256,
      writtenArtifactSha256,
      writtenFrameDiagnosticArtifactSha256,
      phaseEvidenceSha256,
      localSourceIdsSha256,
      translationSha256,
      translations: ownedArtifact.translations,
      phaseEvidence: ownedArtifact.phaseEvidence,
      counts: {
        vertexCount: 580 as const,
        boundaryVertexCount: 244 as const,
        interiorVertexCount: 336 as const,
        triangleCount: 912 as const,
        seamCount: 2 as const,
        seamPairCount: 34 as const,
        localInteriorVertexCountByPiece: [168, 168] as const,
      },
      claims: {
        genuineComposerV3OwnerPublished: true as const,
        originalWrittenFrameEvaluationAccepted: true as const,
        existingV1LatticeAndCdtUsedInLocalFrame: true as const,
        outputReturnedToPersistedWrittenFrame: true as const,
        fullWrittenToLocalLatticePhaseChangeObserved: true as const,
        boundaryAndAoSourceIdentityOrderPreserved: true as const,
        geometryExtremaInferenceUsed: false as const,
        sourceAuthenticityAccepted: false as const,
        placementAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      },
    }) satisfies PatternImportDxfProductGarmentMeshComposerSavedLocalFrameEvidenceV2;
    ownedArtifact = null;
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      evidence,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V3,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V3,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    if (transientArtifact) burnSavedLocalFrameArtifact(transientArtifact);
    if (ownedArtifact) burnSavedLocalFrameArtifact(ownedArtifact);
  }
}

export function projectPatternImportDxfProductGarmentMeshComposerV3(
  owner: unknown,
): PatternImportDxfProductGarmentMeshComposerProjectionV3 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as PatternImportDxfProductGarmentMeshComposerOwnerV3;
  if (record.kind === 'saved-local-frame-v2') {
    const artifact = record.artifact.writtenArtifact;
    const source = projectPatternImportDxfProductGarmentMeshComposerV2(record.composerV2Owner);
    if (
      !capturedStructuredClone ||
      !source ||
      source.composerCanonicalSha256 !== publicOwner.snapshot.bindings.composerV2CanonicalSha256 ||
      source.phase2ArtifactSha256 !== publicOwner.snapshot.bindings.phase2ArtifactSha256 ||
      artifact.deterministicFingerprint !== publicOwner.snapshot.bindings.refinementFingerprint ||
      publicOwner.snapshot.mesh.vertexCount !== artifact.mesh.restPositions2Mm.length / 2 ||
      publicOwner.snapshot.mesh.triangleCount !== artifact.mesh.triangles.length / 3
    )
      return null;
    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V3,
      composerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
      composerV2CanonicalSha256: publicOwner.snapshot.bindings.composerV2CanonicalSha256,
      phase2ArtifactSha256: publicOwner.snapshot.bindings.phase2ArtifactSha256,
      refinedArtifactSha256: publicOwner.snapshot.bindings.refinedArtifactSha256,
      refinementFingerprint: publicOwner.snapshot.bindings.refinementFingerprint,
      refinementEvaluationFingerprint:
        publicOwner.snapshot.bindings.refinementEvaluationFingerprint,
      mesh: cloneSavedMesh(artifact.mesh),
      vertexProvenance: freezePlain(
        capturedStructuredClone!(artifact.vertexProvenance),
      ) as readonly GarmentPhase2RefinedVertexProvenanceV1[],
      triangleMaterialFrames2: new Float32Array(artifact.triangleMaterialFrames2),
      boundaryRecoveryEvidence: freezePlain(
        capturedStructuredClone!(artifact.boundaryRecoveryEvidence),
      ),
      callerOwnedMutableCopies: true as const,
      sourceAuthenticityAccepted: false as const,
      staticPreviewAuthority: false as const,
      placementAuthority: false as const,
      runtimeAuthority: false as const,
      persistenceAuthority: false as const,
      productionAuthority: false as const,
    });
  }
  const refined = projectDxfProductPhase2RefinedBuildOwnerV1(record.refinedOwner);
  if (!refined) return null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V3,
    composerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
    composerV2CanonicalSha256: publicOwner.snapshot.bindings.composerV2CanonicalSha256,
    phase2ArtifactSha256: refined.phase2ArtifactSha256,
    refinedArtifactSha256: refined.refinedArtifactSha256,
    refinementFingerprint: refined.refinementFingerprint,
    refinementEvaluationFingerprint: refined.refinementEvaluationFingerprint,
    mesh: refined.mesh,
    vertexProvenance: refined.vertexProvenance,
    triangleMaterialFrames2: refined.triangleMaterialFrames2,
    boundaryRecoveryEvidence: refined.boundaryRecoveryEvidence,
    callerOwnedMutableCopies: true as const,
    sourceAuthenticityAccepted: false as const,
    staticPreviewAuthority: false as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposePatternImportDxfProductGarmentMeshComposerV3(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  if (record.kind === 'legacy-v3') disposeDxfProductPhase2RefinedBuildOwnerV1(record.refinedOwner);
  else burnSavedLocalFrameArtifact(record.artifact);
  disposePatternImportDxfProductGarmentMeshComposerV2(record.composerV2Owner);
  record.disposed = true;
  owners.delete(owner);
  return true;
}
