import {
  DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1,
  buildDxfProductPhase1BuildInputsV1,
  type DxfProductPhase1BuildInputsCandidateV1,
  type DxfProductPhase1BuildInputsRequestV1,
} from './dxf-product-phase1-build-inputs-v1';
import {
  DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
  type DxfProductPhaseDNativeStraightEdgeV3,
  type DxfProductPhaseDNativeStraightEdgesOwnerV3,
  type DxfProductPhaseDNativeStraightEdgesProjectionV3,
} from './dxf-product-phase-d-native-straight-edge-binding-v1';
import {
  consumeDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1,
  type DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1,
  type DxfProductZeroAllowanceCutSurfaceEquivalenceV1,
} from './dxf-product-zero-allowance-cut-surface-equivalence-v1';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import type {
  GarmentPhase1ClothMeshCompileRequestV1,
  GarmentPhase1PieceResultV1,
} from '../mesh/garment-phase1-cloth-mesh-compiler-v1';
import {
  GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1,
  upgradeGarmentPhase2SampledClothMeshV1,
  type GarmentPhase2SampledClothMeshArtifactV1,
  type GarmentPhase2SampledClothMeshUpgradeRequestV1,
  type GarmentPhase2SourceIdentityBindingV1,
} from '../mesh/garment-phase2-sampled-cloth-mesh-upgrader-v1';
import {
  GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1,
  GarmentPhase2BoundaryRecoveryErrorV1,
  createGarmentPhase2BoundaryRecoveryRequestV1,
  recoverGarmentPhase2BoundariesV1,
  type GarmentBoundaryMeshPolicyV1,
} from '../mesh/garment-phase2-boundary-recovery-v1';
import {
  GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1,
  createGarmentPhase2InteriorRefinementRequestV1,
  evaluateGarmentPhase2InteriorRefinementArtifactV1,
  refineGarmentPhase2InteriorV1,
  type GarmentPhase2InteriorRefinementArtifactV1,
} from '../mesh/garment-phase2-interior-refinement-v1';
import { createCdt2dConstrainedTriangulatorV1 } from '../mesh/triangulation/cdt2d-adapter-v1';
import {
  PHASE2_BOUNDARY_SAMPLING_V1,
  PHASE2_BOUNDARY_SAMPLING_LIMITS_V1,
  createPhase2BoundarySamplerV1,
  type Phase2BoundarySamplingRequestV1,
  type Phase2NativeBoundaryEdgeV1,
} from '../mesh/triangulation/phase2-boundary-sampling-v1';
import type {
  BoundaryRing,
  ConstrainedTriangulationInput,
  ConstrainedTriangulator,
} from '../mesh/triangulation/types';

export const DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1 =
  'dxf-product-phase2-fresh-build-request/1' as const;
export const DXF_PRODUCT_PHASE2_FRESH_BUILD_OWNER_V1 =
  'dxf-product-phase2-fresh-build-owner/1' as const;
export const DXF_PRODUCT_PHASE2_FRESH_BUILD_SNAPSHOT_V1 =
  'dxf-product-phase2-fresh-build-snapshot/1' as const;
export const DXF_PRODUCT_PHASE2_FRESH_BUILD_PROJECTION_V1 =
  'dxf-product-phase2-fresh-build-projection/1' as const;
export const DXF_PRODUCT_PHASE2_REFINEMENT_HANDOFF_V1 =
  'dxf-product-phase2-refinement-handoff/1' as const;

/** Product-beta budgets stay intentionally far below the reusable Phase-2 sampler ceilings. */
export const DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1 = Object.freeze({
  maximumBoundaryEdges: 256,
  maximumSamplesPerEdge: 128,
  maximumSampledBoundaryVertices: 2_048,
} as const);

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_DEPTH = 40;
const MAX_NODES = 750_000;
const MAX_ARRAY = 150_000;
const MAX_STRING = 1_024;
const SHA256 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export type DxfProductPhase2FreshBuildDocumentIdentityV1 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  patternVersion: number;
  cardLockVersion: number;
  importGeneration: number;
  sourceFileId: string;
  /** SHA-256 of the exact source DXF bytes consumed by the native-edge extraction owner. */
  sourceFileSha256: string;
  /** SHA-256 of the canonical manifest source-files aggregate retained by the assembly handoff. */
  handoffSourceAggregateSha256: string;
  selectedGeometrySha256: string;
  documentId: string;
  revision: string;
  sizeToken: string;
  pieceIds: readonly [string, string];
  dxfSha256: string;
}>;

export type DxfProductPhase2FreshBuildRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1;
  phase1Request: DxfProductPhase1BuildInputsRequestV1;
  phaseDNativeStraightEdgeOwner: DxfProductPhaseDNativeStraightEdgesOwnerV3;
  zeroAllowanceCutSurfaceEquivalenceOwner: DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1 | null;
  targetEdgeMm: number;
  documentIdentity: DxfProductPhase2FreshBuildDocumentIdentityV1;
}>;

export const DXF_PRODUCT_PHASE2_FRESH_BUILD_CLAIMS_V1 = Object.freeze({
  sourceNativeAuthorityBound: true,
  sourceFileSha256BoundToNativeOwner: true,
  handoffSourceAggregateSha256Bound: true,
  everyBoundaryEdgeNativeLineBound: true,
  phase1FreshRebuiltTwice: true,
  phase2FreshRebuiltTwice: true,
  freshBoundarySamplingBuiltTwice: true,
  independentSamplingArtifactsUsed: true,
  pinnedCdt2dInvocationCount: 8,
  independentBuildByteAndFingerprintEqual: true,
  closingContourEdgeSupportedWithoutEpsilon: true,
  reverseSeamTraversalSupported: true,
  reverseContourNativeSamplingIntegrated: false,
  callerSuppliedPhase1InputsAccepted: false,
  callerSuppliedSeamProofsAccepted: false,
  callerSuppliedSamplingArtifactAccepted: false,
  cutSurfaceCompilerProjectionRequiresOneShotExactEquivalence: true,
  originalCutSurfaceHandoffRetained: true,
  dualSourceIdentityBoundWithoutRelabel: true,
  originalDocumentAndSourceIdentitiesRetained: true,
  documentRowChronologyAuthenticated: false,
  sourceAuthenticityAccepted: false,
  sourceRevisionRepresentedInSamplingContract: false,
  placementReady: false,
  previewReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  sourceNativeAuthorityBound: false as const,
  sourceFileSha256BoundToNativeOwner: false as const,
  handoffSourceAggregateSha256Bound: false as const,
  everyBoundaryEdgeNativeLineBound: false as const,
  phase1FreshRebuiltTwice: false as const,
  phase2FreshRebuiltTwice: false as const,
  freshBoundarySamplingBuiltTwice: false as const,
  independentSamplingArtifactsUsed: false as const,
  pinnedCdt2dInvocationCount: 0 as const,
  independentBuildByteAndFingerprintEqual: false as const,
  closingContourEdgeSupportedWithoutEpsilon: false as const,
  reverseSeamTraversalSupported: false as const,
  reverseContourNativeSamplingIntegrated: false as const,
  callerSuppliedPhase1InputsAccepted: false as const,
  callerSuppliedSeamProofsAccepted: false as const,
  callerSuppliedSamplingArtifactAccepted: false as const,
  cutSurfaceCompilerProjectionRequiresOneShotExactEquivalence: false as const,
  originalCutSurfaceHandoffRetained: false as const,
  dualSourceIdentityBoundWithoutRelabel: false as const,
  originalDocumentAndSourceIdentitiesRetained: false as const,
  documentRowChronologyAuthenticated: false as const,
  sourceAuthenticityAccepted: false as const,
  sourceRevisionRepresentedInSamplingContract: false as const,
  placementReady: false as const,
  previewReady: false as const,
  runtimeReady: false as const,
  persistenceIntegrated: false as const,
  settleAccepted: false as const,
  productionReady: false as const,
});

export const DXF_PRODUCT_PHASE2_FRESH_BUILD_BLOCKERS_V1 = Object.freeze([
  'reverse-contour-native-sampling-not-integrated',
  'document-row-chronology-not-authenticated',
  'source-path-artifact-authenticity-not-accepted',
  'source-revision-not-represented-in-sampling-contract',
  'interior-refinement-not-integrated',
  'placement-not-proven',
  'preview-not-integrated',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'production-qualification-not-run',
] as const);

export type DxfProductPhase2FreshBuildSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_SNAPSHOT_V1;
  documentIdentitySha256: string;
  targetEdgeMm: number;
  phase1BuildInputsSha256: string;
  sourceHandoffSha256: string;
  aggregateCanonicalSha256: string;
  sourceNativeAuthoritySha256: string;
  nativeStraightEdgesSha256: string;
  artifactSha256: string;
  sourceIdentityBindingSha256: string;
  phase2SourceBinding: GarmentPhase2SampledClothMeshArtifactV1['sourceBinding'];
  zeroAllowanceCutSurfaceEquivalenceSha256: string | null;
  deterministicFingerprint: string;
  pieceCount: 2;
  seamCount: 2;
  nativeBoundaryEdgeCount: number;
  vertexCount: number;
  triangleCount: number;
  distributedSeamPairCount: number;
  buildCount: 2;
  phase1BaselineTriangulationCount: 4;
  phase2BoundarySamplingCount: 4;
  cdt2dInvocationCount: 8;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_CLAIMS_V1;
  blockers: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_BLOCKERS_V1;
}>;

declare const freshBuildBrand: unique symbol;
export type DxfProductPhase2FreshBuildOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_OWNER_V1;
  snapshot: DxfProductPhase2FreshBuildSnapshotV1;
  readonly [freshBuildBrand]: never;
}>;

export type DxfProductPhase2FreshBuildProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_PROJECTION_V1;
  ownerCanonicalSha256: string;
  artifactSha256: string;
  mesh: ClothMeshIR;
  triangleMaterialFrames2: Float32Array;
  callerOwnedMutableCopies: true;
  sourceAuthenticityAccepted: false;
  placementAuthority: false;
  previewAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductPhase2RefinementHandoffV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_REFINEMENT_HANDOFF_V1;
  phase2OwnerCanonicalSha256: string;
  phase2ArtifactSha256: string;
  phase2UpgradeFingerprint: string;
  boundaryRecoveryFingerprint: string;
  boundaryRecoveryEvaluationFingerprint: string;
  refinementFingerprint: string;
  independentRepeatFingerprint: string;
  refinementEvaluationFingerprint: string;
  independentRefinementBuildCount: 3;
  artifact: GarmentPhase2InteriorRefinementArtifactV1;
  sourceAuthenticityAccepted: false;
  placementAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductPhase2RefinementHandoffResultV1 =
  | Readonly<{ ok: true; handoff: DxfProductPhase2RefinementHandoffV1 }>
  | Readonly<{
      ok: false;
      handoff: null;
      blocker: Readonly<{
        code:
          | 'owner-unavailable'
          | 'refinement-capability-consumed'
          | 'material-range-unsatisfiable'
          | 'refinement-failed'
          | 'independent-refinement-mismatch';
        detail: string;
      }>;
    }>;

export type DxfProductPhase2FreshBuildBlockerCodeV1 =
  | 'invalid-input'
  | 'cancelled'
  | 'phase1-build-inputs-blocked'
  | 'cut-surface-equivalence-blocked'
  | 'forged-or-stale-native-edge-owner'
  | 'native-edge-binding-mismatch'
  | 'native-edge-coverage-mismatch'
  | 'native-edge-direction-unsupported'
  | 'phase2-refinement-bound-exceeded'
  | 'phase2-build-failed'
  | 'independent-build-mismatch'
  | 'sha256-unavailable';

export type DxfProductPhase2FreshBuildBlockerV1 = Readonly<{
  code: DxfProductPhase2FreshBuildBlockerCodeV1;
  detail: string;
}>;

export type DxfProductPhase2FreshBuildResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductPhase2FreshBuildOwnerV1;
      snapshot: DxfProductPhase2FreshBuildSnapshotV1;
      blockers: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_BLOCKERS_V1;
      claims: typeof DXF_PRODUCT_PHASE2_FRESH_BUILD_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      blockers: readonly [DxfProductPhase2FreshBuildBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type DxfProductPhase2FreshBuildOptionsV1 = Readonly<{
  crypto?: Pick<Crypto, 'subtle'>;
  signal?: Readonly<Pick<AbortSignal, 'aborted'>>;
}>;

export const DXF_PRODUCT_PHASE2_FRESH_BUILD_CONTRACT_V1 = Object.freeze({
  phase1InputOwner: 'buildDxfProductPhase1BuildInputsV1 only',
  nativeEdgeOwner: 'one genuine DxfProductPhaseDNativeStraightEdgesOwnerV3 consumed once',
  cutSurfaceCompilerProjection:
    'one genuine exact-zero-allowance equivalence owner consumed once; original handoff retained',
  independentBuilds: 2,
  cdt2dCallsPerBuild: 4,
  cdt2dCallsTotal: 8,
  executionOrder: 'sequential',
  productLocalLimits: DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1,
  callerConfigurableLimits: false,
  forwardNativeContourBetaOnly: true,
  reverseSeamTraversalSupported: true,
  cancellationCheckpoints: Object.freeze([
    'before-native-owner-consume',
    'before-build-a',
    'between-build-a-and-build-b',
    'before-owner-publish',
  ] as const),
  callerSuppliedSamplingArtifactAccepted: false,
  documentRowChronologyAuthenticated: false,
  sourceRevisionRepresentedInSamplingContract: false,
  productionReady: false,
} as const);

type PrivateMesh = Readonly<{ mesh: ClothMeshIR; triangleMaterialFrames2: Float32Array }>;
type PrivatePhase2Build = Readonly<{
  upgradeRequest: GarmentPhase2SampledClothMeshUpgradeRequestV1;
  artifact: GarmentPhase2SampledClothMeshArtifactV1;
}>;
type OwnerRecord = {
  privateMesh: PrivateMesh;
  refinementCapability: PrivatePhase2Build | null;
  refinementConsumed: boolean;
  disposed: boolean;
};
const ownerRecords = new WeakMap<object, OwnerRecord>();

class FreshBuildFailure extends Error {
  constructor(
    readonly code: DxfProductPhase2FreshBuildBlockerCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: DxfProductPhase2FreshBuildBlockerCodeV1, detail: string): never {
  throw new FreshBuildFailure(code, detail.slice(0, 2_048));
}

function errorDetail(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const details = (error as Error & { details?: unknown }).details;
  return `${error.message}${
    Array.isArray(details) && details.every((entry) => typeof entry === 'string')
      ? `: ${details.join('; ')}`
      : ''
  }`;
}

function blocked(error: unknown): DxfProductPhase2FreshBuildResultV1 {
  const failure =
    error instanceof FreshBuildFailure
      ? error
      : new FreshBuildFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Fresh Phase-2 build failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message.slice(0, 2_048) }),
    ]) as readonly [DxfProductPhase2FreshBuildBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

function snapshotData(
  value: unknown,
  path: string,
  depth: number,
  budget: { nodes: number },
  active: Set<object>,
): unknown {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH)
    fail('invalid-input', 'Snapshot resource bound exceeded.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) fail('invalid-input', `${path} is too long.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} must be finite.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') fail('invalid-input', `${path} must contain plain data only.`);
  if (active.has(value)) fail('invalid-input', `${path} contains a cycle.`);
  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype || value.length > MAX_ARRAY)
        fail('invalid-input', `${path} is not a bounded plain array.`);
      const keys = Reflect.ownKeys(descriptors);
      if (
        keys.some(
          (key) =>
            key !== 'length' &&
            (typeof key !== 'string' ||
              !/^(0|[1-9][0-9]*)$/.test(key) ||
              Number(key) >= value.length),
        )
      )
        fail('invalid-input', `${path} has unexpected array properties.`);
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor))
          fail('invalid-input', `${path}[${index}] must be an own data property.`);
        output.push(snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, budget, active));
      }
      return output;
    }
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-input', `${path} must be a plain record.`);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-input', `${path} cannot contain symbol keys.`);
    const output: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
      output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, budget, active);
    }
    return output;
  } catch (error) {
    if (error instanceof FreshBuildFailure) throw error;
    fail('invalid-input', `${path} could not be snapshotted without caller code.`);
  } finally {
    active.delete(value);
  }
}

function exactRoot(input: unknown): {
  request: Omit<
    DxfProductPhase2FreshBuildRequestV1,
    'phaseDNativeStraightEdgeOwner' | 'zeroAllowanceCutSurfaceEquivalenceOwner'
  >;
  owner: unknown;
  surfaceOwner: unknown;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'Fresh-build request must be an exact plain record.');
  let descriptors: PropertyDescriptorMap;
  try {
    if (Object.getPrototypeOf(input) !== Object.prototype)
      fail('invalid-input', 'Fresh-build request must be a plain record.');
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    if (error instanceof FreshBuildFailure) throw error;
    fail('invalid-input', 'Fresh-build request could not be inspected safely.');
  }
  const expected = [
    'schemaVersion',
    'phase1Request',
    'phaseDNativeStraightEdgeOwner',
    'zeroAllowanceCutSurfaceEquivalenceOwner',
    'targetEdgeMm',
    'documentIdentity',
  ].sort();
  const ownKeys = Reflect.ownKeys(descriptors);
  const actual = ownKeys.filter((key): key is string => typeof key === 'string').sort();
  if (
    ownKeys.some((key) => typeof key !== 'string') ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'Fresh-build request has an invalid shape.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('invalid-input', `request.${key} must be one enumerable data property.`);
  }
  const request = snapshotData(
    {
      schemaVersion: descriptors.schemaVersion.value,
      phase1Request: descriptors.phase1Request.value,
      targetEdgeMm: descriptors.targetEdgeMm.value,
      documentIdentity: descriptors.documentIdentity.value,
    },
    'request',
    0,
    { nodes: 0 },
    new Set(),
  ) as Omit<
    DxfProductPhase2FreshBuildRequestV1,
    'phaseDNativeStraightEdgeOwner' | 'zeroAllowanceCutSurfaceEquivalenceOwner'
  >;
  if (request.schemaVersion !== DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1)
    fail('invalid-input', 'Fresh-build request schema is invalid.');
  return {
    request,
    owner: descriptors.phaseDNativeStraightEdgeOwner.value,
    surfaceOwner: descriptors.zeroAllowanceCutSurfaceEquivalenceOwner.value,
  };
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', 'Canonical number is not finite.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') fail('invalid-input', 'Canonical data is invalid.');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function sha256Bytes(
  domain: string,
  bytes: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const prefix = encoder.encode(`${domain}\0`);
  if (prefix.byteLength + bytes.byteLength > MAX_BYTES)
    fail('invalid-input', 'Canonical fresh-build payload exceeds the byte bound.');
  const joined = new Uint8Array(prefix.byteLength + bytes.byteLength);
  joined.set(prefix);
  joined.set(bytes, prefix.byteLength);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined.buffer));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof FreshBuildFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function artifactMetadata(value: unknown, segments: (Float32Array | Uint32Array)[]): unknown {
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    const index = segments.length;
    segments.push(value);
    return { binary: value.constructor.name, index, length: value.length };
  }
  if (Array.isArray(value)) return value.map((entry) => artifactMetadata(entry, segments));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, artifactMetadata(record[key], segments)]),
    );
  }
  return value;
}

function structuredArtifactBytes(value: unknown, label: string): Uint8Array {
  const segments: (Float32Array | Uint32Array)[] = [];
  const metadata = encoder.encode(canonical(artifactMetadata(value, segments)));
  const total =
    4 + metadata.byteLength + segments.reduce((sum, segment) => sum + 5 + segment.length * 4, 0);
  if (!Number.isSafeInteger(total) || total > MAX_BYTES)
    fail('invalid-input', `${label} exceeds the byte-seal bound.`);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  view.setUint32(offset, metadata.byteLength, true);
  offset += 4;
  bytes.set(metadata, offset);
  offset += metadata.byteLength;
  for (const segment of segments) {
    view.setUint8(offset, segment instanceof Float32Array ? 1 : 2);
    offset += 1;
    view.setUint32(offset, segment.length, true);
    offset += 4;
    for (const value of segment) {
      if (segment instanceof Float32Array) view.setFloat32(offset, value, true);
      else view.setUint32(offset, value, true);
      offset += 4;
    }
  }
  return bytes;
}

function artifactBytes(artifact: GarmentPhase2SampledClothMeshArtifactV1): Uint8Array {
  return structuredArtifactBytes(artifact, 'Phase-2 artifact');
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const first = [...left].sort();
  const second = [...right].sort();
  return first.every((value, index) => value === second[index]);
}

function assertIdentity(
  request: Omit<
    DxfProductPhase2FreshBuildRequestV1,
    'phaseDNativeStraightEdgeOwner' | 'zeroAllowanceCutSurfaceEquivalenceOwner'
  >,
): void {
  const { documentIdentity: identity, phase1Request } = request;
  if (
    !Number.isSafeInteger(identity.techCardId) ||
    identity.techCardId <= 0 ||
    !Number.isSafeInteger(identity.patternVersion) ||
    identity.patternVersion < 0 ||
    !Number.isSafeInteger(identity.cardLockVersion) ||
    identity.cardLockVersion < 0 ||
    !Number.isSafeInteger(identity.importGeneration) ||
    identity.importGeneration < 0 ||
    !identity.scopeKey ||
    !identity.patternLineKey ||
    !identity.sourceFileId ||
    !identity.documentId ||
    !identity.revision ||
    !identity.sizeToken ||
    !SHA256.test(identity.sourceFileSha256) ||
    !SHA256.test(identity.handoffSourceAggregateSha256) ||
    !SHA256.test(identity.selectedGeometrySha256) ||
    !SHA256.test(identity.dxfSha256) ||
    !Number.isFinite(request.targetEdgeMm) ||
    request.targetEdgeMm <= 0 ||
    phase1Request.schemaVersion !== DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1 ||
    phase1Request.aggregate.sourceBinding.sourceFileId !== identity.sourceFileId ||
    phase1Request.aggregate.sourceBinding.baseFinalCoordinateSha256 !==
      identity.selectedGeometrySha256 ||
    phase1Request.aggregate.sourceBinding.documentId !== identity.documentId ||
    phase1Request.aggregate.sourceBinding.revision !== identity.revision ||
    phase1Request.aggregate.scope.scopeId !== identity.scopeKey ||
    phase1Request.handoff.source.sourceSha256 !== identity.handoffSourceAggregateSha256 ||
    phase1Request.handoff.source.exportSha256 !== identity.dxfSha256 ||
    phase1Request.handoff.source.documentId !== identity.documentId ||
    phase1Request.handoff.source.revision !== identity.revision ||
    !sameStringSet(
      identity.pieceIds,
      phase1Request.handoff.pieces.map(({ id }) => id),
    )
  )
    fail(
      'native-edge-binding-mismatch',
      'Document row, catalog/source identity, aggregate and full handoff do not exact-match.',
    );
}

function samePoint(left: readonly number[], right: readonly number[]): boolean {
  return left.length === 2 && right.length === 2 && left[0] === right[0] && left[1] === right[1];
}

function exactEdge(
  edge: DxfProductPhaseDNativeStraightEdgeV3,
  pieceId: string,
  ring: BoundaryRing,
  edgeIndex: number,
  identity: DxfProductPhase2FreshBuildDocumentIdentityV1,
): Phase2NativeBoundaryEdgeV1 {
  const start = ring.vertices[edgeIndex];
  const end = ring.vertices[(edgeIndex + 1) % ring.vertices.length];
  const descriptor = edge.descriptor;
  if (edge.contourDirection !== 'forward')
    fail(
      'native-edge-direction-unsupported',
      `${pieceId}/${ring.id}/edge-${String(edgeIndex)} has reverse native contour ownership.`,
    );
  if (
    start.source.sourceCurveId !== edge.startVertex.sourceCurveId ||
    start.source.sourceCurveParameterSpace !== edge.startVertex.parameterSpace ||
    start.source.sourceCurveT !== edge.startVertex.sourceCurveT ||
    start.source.normalizedArc !== edge.startVertex.normalizedArc ||
    end.source.sourceCurveId !== edge.endVertex.sourceCurveId ||
    end.source.sourceCurveParameterSpace !== edge.endVertex.parameterSpace ||
    end.source.sourceCurveT !== edge.endVertex.sourceCurveT ||
    end.source.normalizedArc !== edge.endVertex.normalizedArc
  )
    fail(
      'native-edge-binding-mismatch',
      `${pieceId}/${ring.id}/edge-${String(edgeIndex)} boundary provenance differs from the consumed V3 occurrence.`,
    );
  if (
    edge.pieceId !== pieceId ||
    edge.sizeToken !== identity.sizeToken ||
    edge.contourId !== ring.id ||
    edge.edgeIndex !== edgeIndex ||
    edge.startVertex.vertexId !== start.id ||
    edge.endVertex.vertexId !== end.id ||
    descriptor.sourceFileId !== identity.sourceFileId ||
    descriptor.startVertexId !== start.id ||
    descriptor.endVertexId !== end.id ||
    !samePoint(descriptor.startMm, start.positionMm) ||
    !samePoint(descriptor.endMm, end.positionMm) ||
    descriptor.path.sourcePathId !== edge.sourcePathId ||
    descriptor.sourceCurveId !== start.source.sourceCurveId ||
    descriptor.native.sourceCurveId !== descriptor.sourceCurveId ||
    descriptor.native.curveKind !== 'line' ||
    descriptor.native.parameterSpace !== 'unit' ||
    descriptor.native.sourceCurveTRange[0] !== 0 ||
    descriptor.native.sourceCurveTRange[1] !== 1 ||
    descriptor.native.chordErrorBoundMm !== 0 ||
    descriptor.native.periodic !== false ||
    descriptor.native.transform.kind !== 'identity' ||
    start.source.sourceCurveParameterSpace !== 'unit' ||
    start.source.sourceCurveT !== 0
  )
    fail(
      'native-edge-coverage-mismatch',
      `${pieceId}/${ring.id}/edge-${String(edgeIndex)} lacks exact native line evidence.`,
    );
  return Object.freeze({
    edgeId: `${pieceId}/${ring.id}/edge-${String(edgeIndex)}`,
    pieceId,
    ringId: ring.id,
    edgeIndex,
    startBoundaryVertexId: start.id,
    endBoundaryVertexId: end.id,
    native: Object.freeze({
      sourceFileId: identity.sourceFileId,
      sourceCurveId: descriptor.sourceCurveId,
      curveKind: 'line' as const,
      parameterSpace: 'unit' as const,
      sourceCurveTRange: [0, 1] as const,
      chordErrorBoundMm: 0,
      periodic: false,
      transform: Object.freeze({ kind: 'identity' as const }),
    }),
  });
}

function samplingRequest(
  candidate: DxfProductPhase1BuildInputsCandidateV1,
  projection: DxfProductPhaseDNativeStraightEdgesProjectionV3,
  identity: DxfProductPhase2FreshBuildDocumentIdentityV1,
  targetEdgeMm: number,
): Phase2BoundarySamplingRequestV1 {
  if (targetEdgeMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTargetEdgeMm)
    fail('phase2-refinement-bound-exceeded', 'targetEdgeMm exceeds the pinned sampler bound.');
  const boundaryEdgeCount = candidate.triangulationInputs.reduce(
    (pieceTotal, input) =>
      pieceTotal +
      [input.shell, ...input.holes].reduce(
        (ringTotal, ring) => ringTotal + ring.vertices.length,
        0,
      ),
    0,
  );
  if (
    !Number.isSafeInteger(boundaryEdgeCount) ||
    boundaryEdgeCount > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumEdges ||
    boundaryEdgeCount > DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1.maximumBoundaryEdges
  )
    fail(
      'phase2-refinement-bound-exceeded',
      'The product boundary exceeds the pinned edge-occurrence bound.',
    );
  const used = new Set<DxfProductPhaseDNativeStraightEdgeV3>();
  const edgeIdByOccurrence = new Map<string, string>();
  const segmentCountByEdgeId = new Map<string, number>();
  let sampledBoundaryVertexCount = 0;
  const pieces = candidate.triangulationInputs.map((input) => {
    const edges = [input.shell, ...input.holes].flatMap((ring) =>
      ring.vertices.map((_, edgeIndex) => {
        const matches = projection.edges.filter(
          (edge) =>
            edge.pieceId === input.pieceId &&
            edge.contourId === ring.id &&
            edge.edgeIndex === edgeIndex,
        );
        if (matches.length !== 1 || used.has(matches[0]))
          fail(
            'native-edge-coverage-mismatch',
            'Every exact boundary occurrence requires one unique V3 edge.',
          );
        used.add(matches[0]);
        const witness = exactEdge(matches[0], input.pieceId, ring, edgeIndex, identity);
        const start = ring.vertices[edgeIndex].positionMm;
        const end = ring.vertices[(edgeIndex + 1) % ring.vertices.length].positionMm;
        const segmentCount = Math.ceil(
          Math.hypot(end[0] - start[0], end[1] - start[1]) / targetEdgeMm,
        );
        if (
          segmentCount < 1 ||
          segmentCount > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSamplesPerEdge ||
          segmentCount > DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1.maximumSamplesPerEdge
        )
          fail(
            'phase2-refinement-bound-exceeded',
            `${witness.edgeId} exceeds the pinned per-edge refinement bound.`,
          );
        sampledBoundaryVertexCount += segmentCount;
        if (
          sampledBoundaryVertexCount >
            PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSampledBoundaryVertices ||
          sampledBoundaryVertexCount >
            DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1.maximumSampledBoundaryVertices
        )
          fail(
            'phase2-refinement-bound-exceeded',
            'The product boundary exceeds the pinned total sampled-vertex bound.',
          );
        edgeIdByOccurrence.set(
          `${input.pieceId}\0${ring.id}\0${witness.startBoundaryVertexId}\0${witness.endBoundaryVertexId}`,
          witness.edgeId,
        );
        segmentCountByEdgeId.set(witness.edgeId, segmentCount);
        return witness;
      }),
    );
    return Object.freeze({ input, edges: Object.freeze(edges) });
  });
  if (used.size !== projection.edges.length)
    fail(
      'native-edge-coverage-mismatch',
      'V3 projection contains missing, duplicate, or extra selected boundary edges.',
    );
  const equalSeams = candidate.seamProofs.map((proof) => {
    const sides = proof.sides.map((side) => {
      const input = candidate.triangulationInputs.find(({ pieceId }) => pieceId === side.pieceId);
      const ring = input
        ? [input.shell, ...input.holes].find(({ id }) => id === side.contourId)
        : undefined;
      if (!ring)
        fail(
          'native-edge-coverage-mismatch',
          `${proof.seamId} references a missing boundary ring.`,
        );
      const directedStart = ring.vertices.findIndex(({ id }) => id === side.startBoundaryVertexId);
      const directedEnd = ring.vertices.findIndex(({ id }) => id === side.endBoundaryVertexId);
      const forwardStart = side.direction === 'forward' ? directedStart : directedEnd;
      const forwardEnd = side.direction === 'forward' ? directedEnd : directedStart;
      const edgeId = edgeIdByOccurrence.get(
        `${side.pieceId}\0${side.contourId}\0${ring.vertices[forwardStart]?.id}\0${ring.vertices[forwardEnd]?.id}`,
      );
      if (!edgeId)
        fail('native-edge-coverage-mismatch', `${proof.seamId} does not own one native edge.`);
      return Object.freeze({ pieceId: side.pieceId, edgeId, direction: side.direction });
    }) as [
      Readonly<{ pieceId: string; edgeId: string; direction: 'forward' | 'reverse' }>,
      Readonly<{ pieceId: string; edgeId: string; direction: 'forward' | 'reverse' }>,
    ];
    const firstCount = segmentCountByEdgeId.get(sides[0].edgeId);
    const secondCount = segmentCountByEdgeId.get(sides[1].edgeId);
    if (firstCount === undefined || secondCount === undefined)
      fail('native-edge-coverage-mismatch', `${proof.seamId} has no sampled edge occurrence.`);
    const sharedCount = Math.max(firstCount, secondCount);
    sampledBoundaryVertexCount += sharedCount - firstCount + (sharedCount - secondCount);
    segmentCountByEdgeId.set(sides[0].edgeId, sharedCount);
    segmentCountByEdgeId.set(sides[1].edgeId, sharedCount);
    return {
      seamId: proof.seamId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      exactToleranceMm: proof.exactToleranceMm,
      sides,
    };
  });
  if (
    sampledBoundaryVertexCount >
      PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSampledBoundaryVertices ||
    sampledBoundaryVertexCount >
      DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1.maximumSampledBoundaryVertices
  )
    fail(
      'phase2-refinement-bound-exceeded',
      'The product boundary exceeds the pinned total sampled-vertex bound after seam synchronization.',
    );
  return Object.freeze({
    version: PHASE2_BOUNDARY_SAMPLING_V1,
    sourceFileId: identity.sourceFileId,
    targetEdgeMm,
    pieces: Object.freeze(pieces),
    equalSeams: Object.freeze(equalSeams),
  });
}

type Counter = { count: number };

function countedTriangulator(counter: Counter): ConstrainedTriangulator {
  const delegate = createCdt2dConstrainedTriangulatorV1();
  return Object.freeze({
    id: delegate.id,
    version: delegate.version,
    triangulate(input: ConstrainedTriangulationInput) {
      counter.count += 1;
      return delegate.triangulate(input);
    },
  });
}

function buildOnce(
  candidate: DxfProductPhase1BuildInputsCandidateV1,
  request: Phase2BoundarySamplingRequestV1,
  sourceIdentityBinding: GarmentPhase2SourceIdentityBindingV1,
  counter: Counter,
): PrivatePhase2Build {
  const pieces = candidate.triangulationInputs.map(
    (input): GarmentPhase1PieceResultV1 => ({
      pieceId: input.pieceId,
      result: countedTriangulator(counter).triangulate(input),
    }),
  );
  const baselineRequest: GarmentPhase1ClothMeshCompileRequestV1 = {
    assembly: candidate.assembly,
    pieces,
    seamProofs: candidate.seamProofs,
  };
  const samplingArtifact = createPhase2BoundarySamplerV1(countedTriangulator(counter)).sample(
    request,
  );
  const upgradeRequest = {
    baselineRequest,
    samplingRequest: request,
    samplingArtifact,
    sourceIdentityBinding,
  } satisfies GarmentPhase2SampledClothMeshUpgradeRequestV1;
  return Object.freeze({
    upgradeRequest,
    artifact: upgradeGarmentPhase2SampledClothMeshV1(upgradeRequest),
  });
}

function compilerCandidateForPhysicalSurface(
  candidate: DxfProductPhase1BuildInputsCandidateV1,
  request: Omit<
    DxfProductPhase2FreshBuildRequestV1,
    'phaseDNativeStraightEdgeOwner' | 'zeroAllowanceCutSurfaceEquivalenceOwner'
  >,
  surfaceOwner: unknown,
): Readonly<{
  candidate: DxfProductPhase1BuildInputsCandidateV1;
  equivalence: DxfProductZeroAllowanceCutSurfaceEquivalenceV1 | null;
}> {
  if (
    candidate.assembly.source.documentId !== request.documentIdentity.documentId ||
    candidate.assembly.source.revision !== request.documentIdentity.revision
  )
    fail(
      'native-edge-binding-mismatch',
      'The private compiler candidate does not retain the authenticated Assembly Order identity.',
    );
  const physicalSurface = candidate.assembly.physicalSurface;
  if (
    physicalSurface.mode === 'sewing-surface' &&
    physicalSurface.seamAllowancePhysical === false
  ) {
    if (surfaceOwner !== null)
      fail(
        'cut-surface-equivalence-blocked',
        'A sewing-surface build must not carry a cut-surface equivalence capability.',
      );
    return Object.freeze({ candidate, equivalence: null });
  }
  if (physicalSurface.mode !== 'cut-surface' || physicalSurface.seamAllowancePhysical !== true)
    fail(
      'cut-surface-equivalence-blocked',
      'Only sewing-surface or explicitly physical cut-surface inputs are supported.',
    );
  const consumed = consumeDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(
    surfaceOwner as DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1,
    {
      handoffCanonicalSha256: request.phase1Request.handoff.seal.canonicalSha256,
      sourceFileId: request.documentIdentity.sourceFileId,
      sizeToken: request.documentIdentity.sizeToken,
      pieceIds: request.documentIdentity.pieceIds,
    },
  );
  if (!consumed.ok)
    fail(
      'cut-surface-equivalence-blocked',
      `A genuine one-shot zero-allowance cut-surface equivalence is required: ${consumed.blockers[0].code}.`,
    );
  const assembly = Object.freeze({
    ...candidate.assembly,
    physicalSurface: Object.freeze({
      mode: 'sewing-surface' as const,
      seamAllowancePhysical: false as const,
    }),
  });
  return Object.freeze({
    candidate: Object.freeze({ ...candidate, assembly }),
    equivalence: consumed.evidence,
  });
}

function checkAbort(signal: Readonly<Pick<AbortSignal, 'aborted'>> | undefined): void {
  try {
    if (signal?.aborted) fail('cancelled', 'Fresh Phase-2 build was cancelled.');
  } catch (error) {
    if (error instanceof FreshBuildFailure) throw error;
    fail('invalid-input', 'Cancellation state could not be inspected safely.');
  }
}

function validateNativeProjection(
  projection: DxfProductPhaseDNativeStraightEdgesProjectionV3,
  request: Omit<
    DxfProductPhase2FreshBuildRequestV1,
    'phaseDNativeStraightEdgeOwner' | 'zeroAllowanceCutSurfaceEquivalenceOwner'
  >,
): void {
  const { documentIdentity: identity, phase1Request } = request;
  const { binding, claims } = projection;
  if (
    projection.schemaVersion !== DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3 ||
    binding.sourceFileId !== identity.sourceFileId ||
    binding.sourceSha256 !== identity.sourceFileSha256 ||
    binding.selectedGeometrySha256 !== identity.selectedGeometrySha256 ||
    binding.selectedGeometryAndSourcePathSha256 !==
      phase1Request.aggregate.sourceBinding.sourcePathCoordinateSha256 ||
    !SHA256.test(binding.selectedGeometryAndSourcePathSha256) ||
    !SHA256.test(binding.sourceNativeAuthoritySha256) ||
    !SHA256.test(binding.nativeStraightEdgesSha256) ||
    claims.extractionOwnerConsumed !== true ||
    claims.exactSourcePathCurveVertexAndParameterJoin !== true ||
    claims.authoritySha256ContentBound !== true ||
    claims.sourceSha256ContentBound !== true ||
    claims.selectedGeometrySha256ContentBound !== true ||
    claims.endpointInferenceUsed !== false ||
    claims.parameterSpaceInferenceUsed !== false ||
    claims.callerSuppliedProjectionAccepted !== false
  )
    fail(
      'native-edge-binding-mismatch',
      'V3 native-edge content binding does not exact-match the detached product identity.',
    );

  const aggregateSeamIds = phase1Request.aggregate.seams.map(({ id }) => id);
  const childSeamIds = new Set<string>();
  const usedEdges = new Set<DxfProductPhaseDNativeStraightEdgeV3>();
  let sideOccurrenceCount = 0;
  for (const mapping of phase1Request.childMappings) {
    if (
      childSeamIds.has(mapping.seam.id) ||
      aggregateSeamIds.filter((seamId) => seamId === mapping.seam.id).length !== 1
    )
      fail(
        'native-edge-binding-mismatch',
        'Detached child mappings do not cover both aggregate seam ids exactly once.',
      );
    childSeamIds.add(mapping.seam.id);
    const sideIndices = new Set<number>();
    for (const side of mapping.seam.sides) {
      if (sideIndices.has(side.sideIndex))
        fail(
          'native-edge-binding-mismatch',
          `${mapping.seam.id} repeats a detached seam-side occurrence.`,
        );
      sideIndices.add(side.sideIndex);
      const [firstAnchor, secondAnchor] = side.authoredAnchors;
      const matches = projection.edges.filter((edge) => {
        if (edge.pieceId !== side.pieceId || edge.contourId !== side.contourId) return false;
        const start = edge.startVertex.vertexId;
        const end = edge.endVertex.vertexId;
        return (
          (start === firstAnchor && end === secondAnchor) ||
          (start === secondAnchor && end === firstAnchor)
        );
      });
      if (
        matches.length !== 1 ||
        usedEdges.has(matches[0]) ||
        matches[0].sourcePathId !== side.sourcePathId
      )
        fail(
          'native-edge-binding-mismatch',
          `${mapping.seam.id}/side-${String(side.sideIndex)} does not exact-bind one V3 sourcePathId occurrence.`,
        );
      usedEdges.add(matches[0]);
      sideOccurrenceCount += 1;
    }
    if (sideIndices.size !== 2 || !sideIndices.has(0) || !sideIndices.has(1))
      fail(
        'native-edge-binding-mismatch',
        `${mapping.seam.id} must cover side indices 0 and 1 exactly once.`,
      );
  }
  if (
    childSeamIds.size !== 2 ||
    aggregateSeamIds.length !== 2 ||
    new Set(aggregateSeamIds).size !== 2 ||
    sideOccurrenceCount !== 4 ||
    usedEdges.size !== 4
  )
    fail(
      'native-edge-binding-mismatch',
      'Detached child mappings must cover exactly two seams and four unique V3 edge occurrences.',
    );
}

function ownMesh(artifact: GarmentPhase2SampledClothMeshArtifactV1): PrivateMesh {
  const mesh = artifact.mesh;
  return Object.freeze({
    mesh: Object.freeze({
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
    }),
    triangleMaterialFrames2: new Float32Array(artifact.triangleMaterialFrames2),
  });
}

function projectMesh(
  privateMesh: PrivateMesh,
): Pick<DxfProductPhase2FreshBuildProjectionV1, 'mesh' | 'triangleMaterialFrames2'> {
  const mesh = privateMesh.mesh;
  return {
    mesh: Object.freeze({
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
    }),
    triangleMaterialFrames2: new Float32Array(privateMesh.triangleMaterialFrames2),
  };
}

function burn(privateMesh: PrivateMesh): void {
  privateMesh.mesh.restPositions2Mm.fill(0);
  privateMesh.mesh.triangles.fill(0);
  privateMesh.mesh.seams.forEach(({ vertexPairs }) => vertexPairs.fill(0));
  privateMesh.triangleMaterialFrames2.fill(0);
}

function burnPrivateBinary(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    value.fill(0);
    return;
  }
  for (const child of Object.values(value as Record<string, unknown>))
    burnPrivateBinary(child, seen);
}

function refinementHandoffBlocked(
  code: Extract<DxfProductPhase2RefinementHandoffResultV1, { ok: false }>['blocker']['code'],
  detail: string,
): DxfProductPhase2RefinementHandoffResultV1 {
  return Object.freeze({
    ok: false as const,
    handoff: null,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
  });
}

/**
 * One-shot bridge from the genuine C5.2 owner into G0A/G0B. The raw Phase-2 request/artifact never
 * crosses the module boundary; only the independently replayed refined artifact is handed off.
 */
export function consumeDxfProductPhase2FreshBuildRefinementV1(
  owner: unknown,
  materialPolicy: GarmentBoundaryMeshPolicyV1,
): DxfProductPhase2RefinementHandoffResultV1 {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return refinementHandoffBlocked('owner-unavailable', 'A genuine C5.2 owner is required.');
  const record = ownerRecords.get(owner);
  if (!record || record.disposed)
    return refinementHandoffBlocked('owner-unavailable', 'The C5.2 owner is unavailable.');
  if (record.refinementConsumed || !record.refinementCapability)
    return refinementHandoffBlocked(
      'refinement-capability-consumed',
      'The C5.2 refinement capability is one-shot and has already been consumed.',
    );

  const capability = record.refinementCapability;
  record.refinementConsumed = true;
  record.refinementCapability = null;
  try {
    const boundaryRecoveryRequest = createGarmentPhase2BoundaryRecoveryRequestV1({
      version: GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1,
      phase2UpgradeRequest: capability.upgradeRequest,
      phase2Artifact: capability.artifact,
      materialPolicy,
    });
    const boundaryRecoveryArtifact = recoverGarmentPhase2BoundariesV1(boundaryRecoveryRequest);
    const refinementRequest = createGarmentPhase2InteriorRefinementRequestV1({
      version: GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1,
      boundaryRecoveryRequest,
      boundaryRecoveryArtifact,
    });
    const first = refineGarmentPhase2InteriorV1(refinementRequest);
    const second = refineGarmentPhase2InteriorV1(refinementRequest);
    if (
      first.deterministicFingerprint !== second.deterministicFingerprint ||
      !sameBytes(
        structuredArtifactBytes(first, 'First refined Phase-2 artifact'),
        structuredArtifactBytes(second, 'Second refined Phase-2 artifact'),
      )
    )
      return refinementHandoffBlocked(
        'independent-refinement-mismatch',
        'Two independent refined Phase-2 builds differ in bytes or fingerprint.',
      );
    const evaluation = evaluateGarmentPhase2InteriorRefinementArtifactV1(refinementRequest, first);
    const publicOwner = owner as DxfProductPhase2FreshBuildOwnerV1;
    return Object.freeze({
      ok: true as const,
      handoff: Object.freeze({
        schemaVersion: DXF_PRODUCT_PHASE2_REFINEMENT_HANDOFF_V1,
        phase2OwnerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
        phase2ArtifactSha256: publicOwner.snapshot.artifactSha256,
        phase2UpgradeFingerprint: capability.artifact.deterministicFingerprint,
        boundaryRecoveryFingerprint: boundaryRecoveryArtifact.deterministicFingerprint,
        boundaryRecoveryEvaluationFingerprint:
          evaluation.canonicalArtifact.boundaryRecoveryEvaluationFingerprint,
        refinementFingerprint: first.deterministicFingerprint,
        independentRepeatFingerprint: second.deterministicFingerprint,
        refinementEvaluationFingerprint: evaluation.deterministicFingerprint,
        independentRefinementBuildCount: 3 as const,
        artifact: evaluation.canonicalArtifact,
        sourceAuthenticityAccepted: false as const,
        placementAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      }),
    });
  } catch (error) {
    if (
      error instanceof GarmentPhase2BoundaryRecoveryErrorV1 &&
      error.code === 'material-range-unsatisfiable'
    )
      return refinementHandoffBlocked('material-range-unsatisfiable', error.message);
    return refinementHandoffBlocked(
      'refinement-failed',
      error instanceof Error ? error.message : 'C5.2 refinement failed closed.',
    );
  } finally {
    burnPrivateBinary(capability);
  }
}

let buildActive = false;

/**
 * Builds two genuinely independent Phase-1 + Phase-2 artifacts using only the pinned CDT adapter.
 * The V3 owner is consumed once; no caller-authored triangulation input, proof or sampling artifact
 * crosses this boundary.
 */
export async function buildDxfProductPhase2FreshBuildOwnerV1(
  input: unknown,
  options: DxfProductPhase2FreshBuildOptionsV1 = {},
): Promise<DxfProductPhase2FreshBuildResultV1> {
  if (buildActive)
    return blocked(new FreshBuildFailure('invalid-input', 'Reentrant build rejected.'));
  buildActive = true;
  try {
    const { request, owner, surfaceOwner } = exactRoot(input);
    assertIdentity(request);
    const signal = options.signal;
    const crypto = options.crypto ?? globalThis.crypto;
    checkAbort(signal);

    const phase1 = await buildDxfProductPhase1BuildInputsV1(request.phase1Request, { crypto });
    if (!phase1.ok)
      fail(
        'phase1-build-inputs-blocked',
        `Fresh Phase-1 input construction failed: ${phase1.blockers[0].code}: ${phase1.blockers[0].detail}`,
      );
    const compilerProjection = compilerCandidateForPhysicalSurface(
      phase1.candidate,
      request,
      surfaceOwner,
    );

    checkAbort(signal);
    const consumed = consumeDxfProductPhaseDNativeStraightEdgesV3(owner, {
      sourceFileId: request.documentIdentity.sourceFileId,
      sourceSha256: request.documentIdentity.sourceFileSha256,
      selectedGeometrySha256: request.documentIdentity.selectedGeometrySha256,
    });
    if (!consumed.ok)
      fail(
        'forged-or-stale-native-edge-owner',
        `Genuine fresh V3 native-edge owner required: ${consumed.blockers[0].code}.`,
      );
    validateNativeProjection(consumed.projection, request);
    const phase2Request = samplingRequest(
      phase1.candidate,
      consumed.projection,
      request.documentIdentity,
      request.targetEdgeMm,
    );
    const sourceIdentityBinding = Object.freeze({
      schemaVersion: GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1,
      assemblyDocumentId: request.documentIdentity.documentId,
      nativeSamplingSourceFileId: request.documentIdentity.sourceFileId,
    } satisfies GarmentPhase2SourceIdentityBindingV1);

    checkAbort(signal);
    const counter: Counter = { count: 0 };
    let first: PrivatePhase2Build;
    let second: PrivatePhase2Build;
    try {
      first = buildOnce(
        compilerProjection.candidate,
        phase2Request,
        sourceIdentityBinding,
        counter,
      );
      checkAbort(signal);
      second = buildOnce(
        compilerProjection.candidate,
        phase2Request,
        sourceIdentityBinding,
        counter,
      );
    } catch (error) {
      if (error instanceof FreshBuildFailure) throw error;
      fail('phase2-build-failed', errorDetail(error, 'Pinned Phase-2 build failed closed.'));
    }
    if (counter.count !== 8)
      fail(
        'phase2-build-failed',
        `Pinned CDT invocation count was ${String(counter.count)}; exactly 8 required.`,
      );

    const firstBytes = artifactBytes(first.artifact);
    const secondBytes = artifactBytes(second.artifact);
    if (
      first.artifact.deterministicFingerprint !== second.artifact.deterministicFingerprint ||
      !sameBytes(firstBytes, secondBytes)
    )
      fail(
        'independent-build-mismatch',
        'The two fresh Phase-1/Phase-2 builds are not byte and fingerprint identical.',
      );
    const [artifactSha, documentIdentitySha256, sourceIdentityBindingSha256] = await Promise.all([
      sha256Bytes('dxf-product-phase2-fresh-build-artifact-v1', firstBytes, crypto),
      sha256Bytes(
        'dxf-product-phase2-fresh-build-document-identity-v1',
        encoder.encode(canonical(request.documentIdentity)),
        crypto,
      ),
      sha256Bytes(
        'dxf-product-phase2-source-identity-binding-v1',
        encoder.encode(canonical(sourceIdentityBinding)),
        crypto,
      ),
    ]);

    checkAbort(signal);
    const privateMesh = ownMesh(first.artifact);
    let published = false;
    try {
      const counts = {
        vertexCount: first.artifact.mesh.restPositions2Mm.length / 2,
        triangleCount: first.artifact.mesh.triangles.length / 3,
        distributedSeamPairCount: first.artifact.mesh.seams.reduce(
          (sum, seam) => sum + seam.vertexPairs.length / 2,
          0,
        ),
      };
      const snapshotPayload = Object.freeze({
        schemaVersion: DXF_PRODUCT_PHASE2_FRESH_BUILD_SNAPSHOT_V1,
        documentIdentitySha256,
        targetEdgeMm: request.targetEdgeMm,
        phase1BuildInputsSha256: phase1.seal.canonicalSha256,
        sourceHandoffSha256: phase1.seal.sourceHandoffSha256,
        aggregateCanonicalSha256: phase1.seal.aggregateCanonicalSha256,
        sourceNativeAuthoritySha256: consumed.projection.binding.sourceNativeAuthoritySha256,
        nativeStraightEdgesSha256: consumed.projection.binding.nativeStraightEdgesSha256,
        artifactSha256: artifactSha,
        sourceIdentityBindingSha256,
        phase2SourceBinding: first.artifact.sourceBinding,
        zeroAllowanceCutSurfaceEquivalenceSha256:
          compilerProjection.equivalence?.canonicalSha256 ?? null,
        deterministicFingerprint: first.artifact.deterministicFingerprint,
        pieceCount: 2 as const,
        seamCount: 2 as const,
        nativeBoundaryEdgeCount: consumed.projection.edges.length,
        ...counts,
        buildCount: 2 as const,
        phase1BaselineTriangulationCount: 4 as const,
        phase2BoundarySamplingCount: 4 as const,
        cdt2dInvocationCount: 8 as const,
        claims: DXF_PRODUCT_PHASE2_FRESH_BUILD_CLAIMS_V1,
        blockers: DXF_PRODUCT_PHASE2_FRESH_BUILD_BLOCKERS_V1,
      });
      const canonicalSha256 = await sha256Bytes(
        'dxf-product-phase2-fresh-build-owner-v1',
        encoder.encode(canonical(snapshotPayload)),
        crypto,
      );
      checkAbort(signal);
      const snapshot = Object.freeze({
        ...snapshotPayload,
        seal: Object.freeze({
          algorithm: 'SHA-256' as const,
          canonicalSha256,
          authority: 'unsigned-card-session-consistency-only' as const,
        }),
      } satisfies DxfProductPhase2FreshBuildSnapshotV1);
      const freshOwner = Object.freeze({
        schemaVersion: DXF_PRODUCT_PHASE2_FRESH_BUILD_OWNER_V1,
        snapshot,
      }) as DxfProductPhase2FreshBuildOwnerV1;
      ownerRecords.set(freshOwner, {
        privateMesh,
        refinementCapability: first,
        refinementConsumed: false,
        disposed: false,
      });
      published = true;
      return Object.freeze({
        ok: true as const,
        owner: freshOwner,
        snapshot,
        blockers: DXF_PRODUCT_PHASE2_FRESH_BUILD_BLOCKERS_V1,
        claims: DXF_PRODUCT_PHASE2_FRESH_BUILD_CLAIMS_V1,
      });
    } finally {
      if (!published) burn(privateMesh);
    }
  } catch (error) {
    return blocked(error);
  } finally {
    buildActive = false;
  }
}

export function projectDxfProductPhase2FreshBuildOwnerV1(
  owner: unknown,
): DxfProductPhase2FreshBuildProjectionV1 | null {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null) return null;
  const record = ownerRecords.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as DxfProductPhase2FreshBuildOwnerV1;
  const projected = projectMesh(record.privateMesh);
  return Object.freeze({
    schemaVersion: DXF_PRODUCT_PHASE2_FRESH_BUILD_PROJECTION_V1,
    ownerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
    artifactSha256: publicOwner.snapshot.artifactSha256,
    ...projected,
    callerOwnedMutableCopies: true as const,
    sourceAuthenticityAccepted: false as const,
    placementAuthority: false as const,
    previewAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeDxfProductPhase2FreshBuildOwnerV1(owner: unknown): boolean {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null) return false;
  const record = ownerRecords.get(owner);
  if (!record || record.disposed) return false;
  burn(record.privateMesh);
  if (record.refinementCapability) burnPrivateBinary(record.refinementCapability);
  record.refinementCapability = null;
  record.refinementConsumed = true;
  record.disposed = true;
  return true;
}
