import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import { GARMENT_BOUNDARY_MESH_POLICY_V1 } from '../mesh/garment-phase2-boundary-recovery-v1';
import type {
  GarmentPhase2InteriorRefinementArtifactV1,
  GarmentPhase2RefinedVertexProvenanceV1,
} from '../mesh/garment-phase2-interior-refinement-v1';
import {
  consumeDxfProductPhase2FreshBuildRefinementV1,
  disposeDxfProductPhase2FreshBuildOwnerV1,
  type DxfProductPhase2FreshBuildOwnerV1,
} from './dxf-product-phase2-fresh-build-owner-v1';

export const DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1 =
  'dxf-product-phase2-refined-build-request/1' as const;
export const DXF_PRODUCT_PHASE2_REFINED_BUILD_OWNER_V1 =
  'dxf-product-phase2-refined-build-owner/1' as const;
export const DXF_PRODUCT_PHASE2_REFINED_BUILD_SNAPSHOT_V1 =
  'dxf-product-phase2-refined-build-snapshot/1' as const;
export const DXF_PRODUCT_PHASE2_REFINED_BUILD_PROJECTION_V1 =
  'dxf-product-phase2-refined-build-projection/1' as const;

export const DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1 = Object.freeze({
  maximumVertices: 20_000,
  maximumTriangles: 40_000,
  maximumSeamPairs: 20_000,
  maximumCanonicalBytes: 32 * 1024 * 1024,
} as const);

export const DXF_PRODUCT_PHASE2_REFINED_BUILD_MATERIAL_POLICY_V1 = Object.freeze({
  version: GARMENT_BOUNDARY_MESH_POLICY_V1,
  policyId: 'dxf-product-visual-cloth-edge-range',
  revision: 'dxf-product-visual-cloth-edge-range-v1',
  minEdgeMm: 10,
  maxEdgeMm: 50,
} as const);

export type DxfProductPhase2RefinedBuildRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1;
  phase2Owner: DxfProductPhase2FreshBuildOwnerV1;
}>;

export const DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1 = Object.freeze({
  genuinePhase2OwnerConsumedOnce: true,
  independentRefinementBuiltTwice: true,
  independentRefinementEvaluatorAccepted: true,
  recoveredBoundaryPreserved: true,
  distributedEqualSeamPairsPreserved: true,
  interiorRefinementIntegrated: true,
  allTriangleEdgesInMaterialRange: true,
  f32TopologyAndQualityAccepted: true,
  triangleMaterialFramesBound: true,
  sourceAuthenticityAccepted: false,
  placementReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1,
  genuinePhase2OwnerConsumedOnce: false as const,
  independentRefinementBuiltTwice: false as const,
  independentRefinementEvaluatorAccepted: false as const,
  recoveredBoundaryPreserved: false as const,
  distributedEqualSeamPairsPreserved: false as const,
  interiorRefinementIntegrated: false as const,
  allTriangleEdgesInMaterialRange: false as const,
  f32TopologyAndQualityAccepted: false as const,
  triangleMaterialFramesBound: false as const,
});

export const DXF_PRODUCT_PHASE2_REFINED_BUILD_BLOCKERS_V1 = Object.freeze([
  'source-authenticity-not-established',
  'body-placement-not-proven',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'production-qualification-not-run',
] as const);

export type DxfProductPhase2RefinedBuildSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_SNAPSHOT_V1;
  phase2OwnerCanonicalSha256: string;
  phase2ArtifactSha256: string;
  phase2UpgradeFingerprint: string;
  boundaryRecoveryFingerprint: string;
  boundaryRecoveryEvaluationFingerprint: string;
  refinementFingerprint: string;
  refinementEvaluationFingerprint: string;
  refinedArtifactSha256: string;
  sourceAssemblyFingerprint: string;
  materialPolicy: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_MATERIAL_POLICY_V1;
  counts: Readonly<{
    pieceCount: number;
    seamCount: number;
    vertexCount: number;
    boundaryVertexCount: number;
    interiorVertexCount: number;
    triangleCount: number;
    seamPairCount: number;
  }>;
  quality: Readonly<{
    minimumTriangleEdgeMm: number;
    maximumTriangleEdgeMm: number;
    minimumTriangleAngleDegrees: number;
    maximumEdgeRatio: number;
    maximumRadiusEdgeRatio: number;
  }>;
  independentRefinementBuildCount: 3;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1;
  blockers: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_BLOCKERS_V1;
}>;

declare const refinedBuildOwnerBrand: unique symbol;
export type DxfProductPhase2RefinedBuildOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_OWNER_V1;
  snapshot: DxfProductPhase2RefinedBuildSnapshotV1;
  readonly [refinedBuildOwnerBrand]: never;
}>;

export type DxfProductPhase2RefinedBuildProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_PROJECTION_V1;
  ownerCanonicalSha256: string;
  refinedArtifactSha256: string;
  phase2ArtifactSha256: string;
  refinementFingerprint: string;
  refinementEvaluationFingerprint: string;
  mesh: ClothMeshIR;
  vertexProvenance: readonly GarmentPhase2RefinedVertexProvenanceV1[];
  triangleMaterialFrames2: Float32Array;
  boundaryRecoveryEvidence: GarmentPhase2InteriorRefinementArtifactV1['boundaryRecoveryEvidence'];
  callerOwnedMutableCopies: true;
  sourceAuthenticityAccepted: false;
  placementAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductPhase2RefinedBuildBlockerCodeV1 =
  | 'invalid-input'
  | 'phase2-owner-unavailable'
  | 'phase2-refinement-capability-consumed'
  | 'phase2-boundary-material-range-unsatisfiable'
  | 'refinement-failed'
  | 'independent-refinement-mismatch'
  | 'refined-artifact-invalid'
  | 'resource-budget-exceeded'
  | 'sha256-unavailable';

export type DxfProductPhase2RefinedBuildResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductPhase2RefinedBuildOwnerV1;
      snapshot: DxfProductPhase2RefinedBuildSnapshotV1;
      claims: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1;
      blockers: typeof DXF_PRODUCT_PHASE2_REFINED_BUILD_BLOCKERS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{ code: DxfProductPhase2RefinedBuildBlockerCodeV1; detail: string }>,
      ];
    }>;

type PrivateRecord = {
  artifact: GarmentPhase2InteriorRefinementArtifactV1;
  phase2Owner: DxfProductPhase2FreshBuildOwnerV1;
  disposed: boolean;
};

const records = new WeakMap<object, PrivateRecord>();
const encoder = new TextEncoder();
const capturedStructuredClone = globalThis.structuredClone;

class RefinedBuildFailure extends Error {
  constructor(
    readonly code: DxfProductPhase2RefinedBuildBlockerCodeV1,
    detail: string,
  ) {
    super(detail);
  }
}

function fail(code: DxfProductPhase2RefinedBuildBlockerCodeV1, detail: string): never {
  throw new RefinedBuildFailure(code, detail.slice(0, 2_048));
}

function blocked(error: unknown): DxfProductPhase2RefinedBuildResultV1 {
  const failure =
    error instanceof RefinedBuildFailure
      ? error
      : new RefinedBuildFailure(
          'refinement-failed',
          error instanceof Error ? error.message : 'Refined product build failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: BLOCKED_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [Readonly<{ code: DxfProductPhase2RefinedBuildBlockerCodeV1; detail: string }>],
  });
}

function exactInput(input: unknown): DxfProductPhase2RefinedBuildRequestV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'C5.3 request must be one exact object.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  const expected = ['phase2Owner', 'schemaVersion'];
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    actual.length !== keys.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'C5.3 request has an unsupported property shape.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('invalid-input', `C5.3 request ${key} must be enumerable own data.`);
  }
  if (descriptors.schemaVersion!.value !== DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1)
    fail('invalid-input', 'C5.3 request version is unsupported.');
  return {
    schemaVersion: DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1,
    phase2Owner: descriptors.phase2Owner!.value as DxfProductPhase2FreshBuildOwnerV1,
  };
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      fail('refined-artifact-invalid', 'Canonical number is not finite.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object')
    fail('refined-artifact-invalid', 'Canonical artifact data is invalid.');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function artifactMetadata(value: unknown, binary: (Float32Array | Uint32Array)[]): unknown {
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    const index = binary.length;
    binary.push(value);
    return { binary: value.constructor.name, index, length: value.length };
  }
  if (Array.isArray(value)) return value.map((entry) => artifactMetadata(entry, binary));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, artifactMetadata((value as Record<string, unknown>)[key], binary)]),
    );
  return value;
}

function artifactBytes(artifact: GarmentPhase2InteriorRefinementArtifactV1): Uint8Array {
  const binary: (Float32Array | Uint32Array)[] = [];
  const metadata = encoder.encode(canonical(artifactMetadata(artifact, binary)));
  const total =
    4 + metadata.byteLength + binary.reduce((sum, segment) => sum + 5 + segment.length * 4, 0);
  if (
    !Number.isSafeInteger(total) ||
    total > DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1.maximumCanonicalBytes
  )
    fail('resource-budget-exceeded', 'Refined artifact exceeds the canonical byte bound.');
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  view.setUint32(offset, metadata.byteLength, true);
  offset += 4;
  output.set(metadata, offset);
  offset += metadata.byteLength;
  for (const segment of binary) {
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
  return output;
}

async function sha256(
  domain: string,
  bytes: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const prefix = encoder.encode(`${domain}\0`);
  if (
    prefix.byteLength + bytes.byteLength >
    DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1.maximumCanonicalBytes
  )
    fail('resource-budget-exceeded', 'Refined SHA-256 payload exceeds the byte bound.');
  const joined = new Uint8Array(prefix.byteLength + bytes.byteLength);
  joined.set(prefix);
  joined.set(bytes, prefix.byteLength);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined.buffer));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof RefinedBuildFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function cloneArtifact(
  artifact: GarmentPhase2InteriorRefinementArtifactV1,
): GarmentPhase2InteriorRefinementArtifactV1 {
  if (typeof capturedStructuredClone !== 'function')
    fail('refined-artifact-invalid', 'Native structuredClone is required for C5.3 ownership.');
  return capturedStructuredClone(artifact);
}

function freezePlain<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => freezePlain(child, seen));
  return Object.freeze(value);
}

function cloneMesh(mesh: ClothMeshIR): ClothMeshIR {
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

function validateArtifact(artifact: GarmentPhase2InteriorRefinementArtifactV1): void {
  const vertexCount = artifact.mesh.restPositions2Mm.length / 2;
  const triangleCount = artifact.mesh.triangles.length / 3;
  const seamPairCount = artifact.mesh.seams.reduce(
    (sum, seam) => sum + seam.vertexPairs.length / 2,
    0,
  );
  if (
    artifact.claims.interiorRefinementIntegrated !== true ||
    artifact.claims.recoveredBoundaryPreserved !== true ||
    artifact.claims.distributedEqualSeamPairsPreserved !== true ||
    artifact.claims.allTriangleEdgesInMaterialRange !== true ||
    artifact.claims.f32TopologyAndQualityAccepted !== true ||
    artifact.claims.sourceAuthenticityAccepted !== false ||
    artifact.claims.bodyPlacementReady !== false ||
    artifact.claims.runtimeIntegrated !== false ||
    artifact.claims.productionReady !== false ||
    artifact.materialPolicy.minEdgeMm !== 10 ||
    artifact.materialPolicy.maxEdgeMm !== 50 ||
    artifact.minimumTriangleEdgeMm < 10 ||
    artifact.maximumTriangleEdgeMm > 50 ||
    artifact.vertexProvenance.length !== vertexCount ||
    artifact.triangleMaterialFrames2.length !== triangleCount * 4
  )
    fail('refined-artifact-invalid', 'G0B artifact lacks the required honest refined claims.');
  if (
    vertexCount <= 0 ||
    triangleCount <= 0 ||
    vertexCount > DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1.maximumVertices ||
    triangleCount > DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1.maximumTriangles ||
    seamPairCount > DXF_PRODUCT_PHASE2_REFINED_BUILD_LIMITS_V1.maximumSeamPairs
  )
    fail('resource-budget-exceeded', 'G0B artifact exceeds the C5.3 mesh budget.');
}

function burn(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    value.fill(0);
    return;
  }
  Object.values(value as Record<string, unknown>).forEach((child) => burn(child, seen));
}

export async function buildDxfProductPhase2RefinedBuildOwnerV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductPhase2RefinedBuildResultV1> {
  try {
    const request = exactInput(input);
    const handoff = consumeDxfProductPhase2FreshBuildRefinementV1(
      request.phase2Owner,
      DXF_PRODUCT_PHASE2_REFINED_BUILD_MATERIAL_POLICY_V1,
    );
    if (!handoff.ok) {
      const code: DxfProductPhase2RefinedBuildBlockerCodeV1 =
        handoff.blocker.code === 'owner-unavailable'
          ? 'phase2-owner-unavailable'
          : handoff.blocker.code === 'refinement-capability-consumed'
            ? 'phase2-refinement-capability-consumed'
            : handoff.blocker.code === 'material-range-unsatisfiable'
              ? 'phase2-boundary-material-range-unsatisfiable'
              : handoff.blocker.code === 'independent-refinement-mismatch'
                ? 'independent-refinement-mismatch'
                : 'refinement-failed';
      fail(code, handoff.blocker.detail);
    }
    validateArtifact(handoff.handoff.artifact);
    const artifact = cloneArtifact(handoff.handoff.artifact);
    validateArtifact(artifact);
    const ownedArtifactBytes = artifactBytes(artifact);
    const crypto = options.crypto ?? globalThis.crypto;
    const refinedArtifactSha256 = await sha256(
      'dxf-product-phase2-refined-build-artifact-v1',
      ownedArtifactBytes,
      crypto,
    );
    const boundaryVertexCount = artifact.pieceEvidence.reduce(
      (sum, piece) => sum + piece.boundaryVertexCount,
      0,
    );
    const interiorVertexCount = artifact.pieceEvidence.reduce(
      (sum, piece) => sum + piece.interiorVertexCount,
      0,
    );
    const counts = Object.freeze({
      pieceCount: artifact.mesh.pieceRanges.length,
      seamCount: artifact.mesh.seams.length,
      vertexCount: artifact.mesh.restPositions2Mm.length / 2,
      boundaryVertexCount,
      interiorVertexCount,
      triangleCount: artifact.mesh.triangles.length / 3,
      seamPairCount: artifact.mesh.seams.reduce(
        (sum, seam) => sum + seam.vertexPairs.length / 2,
        0,
      ),
    });
    const quality = Object.freeze({
      minimumTriangleEdgeMm: artifact.minimumTriangleEdgeMm,
      maximumTriangleEdgeMm: artifact.maximumTriangleEdgeMm,
      minimumTriangleAngleDegrees: Math.min(
        ...artifact.pieceEvidence.map((piece) => piece.minTriangleAngleDegrees),
      ),
      maximumEdgeRatio: Math.max(...artifact.pieceEvidence.map((piece) => piece.maxEdgeRatio)),
      maximumRadiusEdgeRatio: Math.max(
        ...artifact.pieceEvidence.map((piece) => piece.maxRadiusEdgeRatio),
      ),
    });
    const payload = {
      schemaVersion: DXF_PRODUCT_PHASE2_REFINED_BUILD_SNAPSHOT_V1,
      phase2OwnerCanonicalSha256: handoff.handoff.phase2OwnerCanonicalSha256,
      phase2ArtifactSha256: handoff.handoff.phase2ArtifactSha256,
      phase2UpgradeFingerprint: handoff.handoff.phase2UpgradeFingerprint,
      boundaryRecoveryFingerprint: handoff.handoff.boundaryRecoveryFingerprint,
      boundaryRecoveryEvaluationFingerprint: handoff.handoff.boundaryRecoveryEvaluationFingerprint,
      refinementFingerprint: handoff.handoff.refinementFingerprint,
      refinementEvaluationFingerprint: handoff.handoff.refinementEvaluationFingerprint,
      refinedArtifactSha256,
      sourceAssemblyFingerprint: artifact.sourceAssemblyFingerprint,
      materialPolicy: DXF_PRODUCT_PHASE2_REFINED_BUILD_MATERIAL_POLICY_V1,
      counts,
      quality,
      independentRefinementBuildCount: 3 as const,
      claims: DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1,
      blockers: DXF_PRODUCT_PHASE2_REFINED_BUILD_BLOCKERS_V1,
    };
    const canonicalSha256 = await sha256(
      'dxf-product-phase2-refined-build-owner-v1',
      encoder.encode(canonical(payload)),
      crypto,
    );
    const snapshot = freezePlain({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies DxfProductPhase2RefinedBuildSnapshotV1);
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_PHASE2_REFINED_BUILD_OWNER_V1,
      snapshot,
    }) as DxfProductPhase2RefinedBuildOwnerV1;
    records.set(owner, { artifact, phase2Owner: request.phase2Owner, disposed: false });
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: DXF_PRODUCT_PHASE2_REFINED_BUILD_CLAIMS_V1,
      blockers: DXF_PRODUCT_PHASE2_REFINED_BUILD_BLOCKERS_V1,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function projectDxfProductPhase2RefinedBuildOwnerV1(
  owner: unknown,
): DxfProductPhase2RefinedBuildProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = records.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as DxfProductPhase2RefinedBuildOwnerV1;
  const artifact = record.artifact;
  return Object.freeze({
    schemaVersion: DXF_PRODUCT_PHASE2_REFINED_BUILD_PROJECTION_V1,
    ownerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
    refinedArtifactSha256: publicOwner.snapshot.refinedArtifactSha256,
    phase2ArtifactSha256: publicOwner.snapshot.phase2ArtifactSha256,
    refinementFingerprint: publicOwner.snapshot.refinementFingerprint,
    refinementEvaluationFingerprint: publicOwner.snapshot.refinementEvaluationFingerprint,
    mesh: cloneMesh(artifact.mesh),
    vertexProvenance: freezePlain(
      capturedStructuredClone(artifact.vertexProvenance),
    ) as readonly GarmentPhase2RefinedVertexProvenanceV1[],
    triangleMaterialFrames2: new Float32Array(artifact.triangleMaterialFrames2),
    boundaryRecoveryEvidence: freezePlain(
      capturedStructuredClone(artifact.boundaryRecoveryEvidence),
    ),
    callerOwnedMutableCopies: true as const,
    sourceAuthenticityAccepted: false as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeDxfProductPhase2RefinedBuildOwnerV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = records.get(owner);
  if (!record || record.disposed) return false;
  burn(record.artifact);
  disposeDxfProductPhase2FreshBuildOwnerV1(record.phase2Owner);
  record.disposed = true;
  records.delete(owner);
  return true;
}
