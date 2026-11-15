import {
  BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1,
  isBetaSkirtAnalyticalBodyProviderV1,
  type BetaSkirtAnalyticalBodyProviderV1,
} from '../body/beta-skirt-analytical-body-provider-v1';
import {
  buildBoundPackedBodyCapsulesV1,
  type BoundPackedBodyCapsulesV1,
} from '../body/bound-packed-body-capsules';
import type { BodyArtifact } from '../body/contracts';
import {
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_REQUEST_V1 =
  'dxf-product-two-panel-skirt-placement-body-admission-request/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_V1 =
  'dxf-product-two-panel-skirt-placement-body-admission/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_OWNER_V1 =
  'dxf-product-two-panel-skirt-placement-body-admission-owner/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const clone = globalThis.structuredClone?.bind(globalThis);

export type DxfProductTwoPanelSkirtPlacementBodyAdmissionRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_REQUEST_V1;
  expected: Readonly<{
    composerCanonicalSha256: string;
    semanticsCanonicalSha256: string;
  }>;
  composerOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  semanticsOwner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
  bodyProvider: BetaSkirtAnalyticalBodyProviderV1;
}>;

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1 = Object.freeze({
  status: 'body-bound-placement-admission-candidate',
  bodyProviderBound: true,
  bodyFreshReconstructedTwice: true,
  bodyReconstructionDeterministic: true,
  collisionLodPackedTwice: true,
  packedBodyBytesDeterministic: true,
  bodyProvenanceCleared: true,
  mappingFamilyBound: true,
  mappingParametersBound: false,
  placementAdmitted: false,
  placementTransformGenerated: false,
  penetrationEvaluated: false,
  supportAndEnclosureEvaluated: false,
  selfIntersectionEvaluated: false,
  staticPreviewReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  fitGrade: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1,
  bodyProviderBound: false as const,
  bodyFreshReconstructedTwice: false as const,
  bodyReconstructionDeterministic: false as const,
  collisionLodPackedTwice: false as const,
  packedBodyBytesDeterministic: false as const,
  bodyProvenanceCleared: false as const,
  mappingFamilyBound: false as const,
});

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_BLOCKERS_V1 = Object.freeze([
  'real-product-fixture-not-cleared',
  'authored-annular-sector-parameters-not-presented',
  'placement-transform-not-generated',
  'seam-colocation-and-distortion-not-evaluated',
  'penetration-not-evaluated',
  'support-and-enclosure-not-evaluated',
  'self-intersection-not-evaluated',
  'static-preview-not-composed',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'fit-not-qualified',
  'production-qualification-not-run',
] as const);

export type DxfProductTwoPanelSkirtPlacementBodyAdmissionSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_V1;
  status: 'body-bound-placement-admission-candidate';
  origin: 'fresh-import' | 'verified-saved-row';
  bindings: Readonly<{
    composerCanonicalSha256: string;
    semanticsCanonicalSha256: string;
    phase2ArtifactSha256: string;
    semanticsBodyIdentitySha256: string;
    placementPolicySha256: string;
    bodyProviderId: string;
    bodyProviderRevision: string;
    bodyId: string;
    bodyRevision: string;
    poseKind: 'A';
    poseRevision: string;
    coordinateSystemSha256: string;
    landmarkSetSha256: string;
    collisionLodId: string;
    bodyIdentitySha256: string;
    colliderContentSha256: string;
    packedBytesSha256: string;
    boundBodyAggregateSha256: string;
  }>;
  counts: Readonly<{
    pieceCount: 2;
    seamCount: 2;
    landmarkCount: number;
    colliderCount: number;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1;
  blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_BLOCKERS_V1;
}>;

declare const bodyAdmissionOwnerBrand: unique symbol;
export type DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_OWNER_V1;
  snapshot: DxfProductTwoPanelSkirtPlacementBodyAdmissionSnapshotV1;
  readonly [bodyAdmissionOwnerBrand]: never;
}>;

export type DxfProductTwoPanelSkirtPlacementBodyAdmissionBlockerCodeV1 =
  | 'invalid-input'
  | 'composer-owner-unavailable'
  | 'semantics-owner-unavailable'
  | 'authority-binding-mismatch'
  | 'forged-body-provider'
  | 'body-reconstruction-failed'
  | 'body-reconstruction-mismatch'
  | 'body-identity-mismatch'
  | 'body-provenance-not-cleared'
  | 'body-packing-failed'
  | 'body-packing-repeat-mismatch'
  | 'sha256-unavailable';

export type DxfProductTwoPanelSkirtPlacementBodyAdmissionResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1;
      snapshot: DxfProductTwoPanelSkirtPlacementBodyAdmissionSnapshotV1;
      claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1;
      blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_BLOCKERS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{
          code: DxfProductTwoPanelSkirtPlacementBodyAdmissionBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

class AdmissionFailure extends Error {
  constructor(
    readonly code: DxfProductTwoPanelSkirtPlacementBodyAdmissionBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: DxfProductTwoPanelSkirtPlacementBodyAdmissionBlockerCodeV1,
  detail: string,
): never {
  throw new AdmissionFailure(code, detail);
}

function blocked(error: unknown): DxfProductTwoPanelSkirtPlacementBodyAdmissionResultV1 {
  const failure =
    error instanceof AdmissionFailure
      ? error
      : new AdmissionFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Body-bound placement admission failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: BLOCKED_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [
      Readonly<{
        code: DxfProductTwoPanelSkirtPlacementBodyAdmissionBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', `${path} must be an exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-input', `${path} must use a plain object prototype.`);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  )
    fail('invalid-input', `${path} has missing, hidden, symbol, or unexpected fields.`);
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
    output[key] = descriptor.value;
  }
  return output;
}

type DetachedRequest = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_REQUEST_V1;
  expected: DxfProductTwoPanelSkirtPlacementBodyAdmissionRequestV1['expected'];
}>;

function detach(input: unknown): Readonly<{
  request: DetachedRequest;
  composerOwner: unknown;
  semanticsOwner: unknown;
  bodyProvider: unknown;
}> {
  const record = exactRecord(
    input,
    ['schemaVersion', 'expected', 'composerOwner', 'semanticsOwner', 'bodyProvider'],
    'request',
  );
  const expected = exactRecord(
    record.expected,
    ['composerCanonicalSha256', 'semanticsCanonicalSha256'],
    'request.expected',
  );
  if (!clone) fail('invalid-input', 'Native structuredClone is required.');
  let request: DetachedRequest;
  try {
    request = clone({
      schemaVersion: record.schemaVersion,
      expected: {
        composerCanonicalSha256: expected.composerCanonicalSha256,
        semanticsCanonicalSha256: expected.semanticsCanonicalSha256,
      },
    }) as DetachedRequest;
  } catch {
    fail('invalid-input', 'Body admission request could not be detached.');
  }
  if (
    request.schemaVersion !== DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_REQUEST_V1 ||
    !SHA256.test(request.expected.composerCanonicalSha256) ||
    !SHA256.test(request.expected.semanticsCanonicalSha256)
  )
    fail('invalid-input', 'Body admission schema or expected seals are invalid.');
  return {
    request,
    composerOwner: record.composerOwner,
    semanticsOwner: record.semanticsOwner,
    bodyProvider: record.bodyProvider,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite canonical number.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return canonical(left) === canonical(right);
  } catch {
    return false;
  }
}

function collectOwnedObjects(value: unknown, owned: Set<object>): void {
  if (!value || typeof value !== 'object' || owned.has(value)) return;
  owned.add(value);
  if (ArrayBuffer.isView(value)) {
    owned.add(value.buffer);
    return;
  }
  if (value instanceof ArrayBuffer) return;
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      collectOwnedObjects(descriptor.value, owned);
    }
  }
}

function hasIndependentBodyOwnership(first: BodyArtifact, second: BodyArtifact): boolean {
  const firstOwned = new Set<object>();
  collectOwnedObjects(first, firstOwned);
  const secondOwned = new Set<object>();
  collectOwnedObjects(second, secondOwned);
  return [...secondOwned].every((value) => !firstOwned.has(value));
}

function sameBytes(
  left: ArrayBuffer | ArrayBufferView,
  right: ArrayBuffer | ArrayBufferView,
): boolean {
  const bytes = (value: ArrayBuffer | ArrayBufferView) =>
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const first = bytes(left);
  const second = bytes(right);
  return (
    first.byteLength === second.byteLength && first.every((value, index) => value === second[index])
  );
}

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const encoded = encoder.encode(`${domain}\0${canonical(value)}`);
  if (encoded.byteLength > MAX_CANONICAL_BYTES)
    fail('invalid-input', 'Body admission canonical seal exceeds its bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function sameProjection(
  left: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  right: PatternImportDxfProductGarmentMeshComposerProjectionV2,
): boolean {
  if (
    left.composerCanonicalSha256 !== right.composerCanonicalSha256 ||
    left.phase2ArtifactSha256 !== right.phase2ArtifactSha256 ||
    !sameBytes(left.mesh.restPositions2Mm, right.mesh.restPositions2Mm) ||
    !sameBytes(left.mesh.triangles, right.mesh.triangles) ||
    !sameBytes(left.triangleMaterialFrames2, right.triangleMaterialFrames2) ||
    !sameCanonical(left.mesh.pieceRanges, right.mesh.pieceRanges) ||
    !sameCanonical(left.mesh.boundarySamples, right.mesh.boundarySamples) ||
    !sameCanonical(left.mesh.quality, right.mesh.quality) ||
    left.mesh.seams.length !== right.mesh.seams.length
  )
    return false;
  return left.mesh.seams.every((seam, index) => {
    const other = right.mesh.seams[index];
    return (
      !!other &&
      seam.seamId === other.seamId &&
      seam.mapping === other.mapping &&
      seam.lengthRatio === other.lengthRatio &&
      sameBytes(seam.vertexPairs, other.vertexPairs)
    );
  });
}

function validateBodyIdentity(
  body: BodyArtifact,
  semantics: NonNullable<ReturnType<typeof projectDxfProductTwoPanelSkirtPlacementSemanticsV1>>,
): void {
  const expected = semantics.body;
  const landmarkIds = new Set(body.landmarks.landmarks.map(({ id }) => id));
  if (
    body.id !== expected.bodyId ||
    body.revision !== expected.bodyRevision ||
    body.pose.kind !== expected.poseKind ||
    body.pose.revision !== expected.poseRevision ||
    body.landmarks.revision !== expected.landmarks.revision ||
    !landmarkIds.has(expected.landmarks.waistCenterId) ||
    !landmarkIds.has(expected.landmarks.hipLeftId) ||
    !landmarkIds.has(expected.landmarks.hipRightId) ||
    new Set([
      expected.landmarks.waistCenterId,
      expected.landmarks.hipLeftId,
      expected.landmarks.hipRightId,
    ]).size !== 3 ||
    !body.collisionLods.some(({ id }) => id === expected.collisionLodId)
  )
    fail('body-identity-mismatch', 'Fresh body identity, pose, landmarks or LOD differ from D0.');
  if (
    body.provenance.status !== 'cleared' ||
    body.provenance.sources.length === 0 ||
    body.provenance.sources.some(
      ({ commercialUse, redistribution }) =>
        commercialUse !== 'cleared' || redistribution !== 'cleared',
    )
  )
    fail('body-provenance-not-cleared', 'Fresh body provenance is not fully cleared.');
}

function samePacked(left: BoundPackedBodyCapsulesV1, right: BoundPackedBodyCapsulesV1): boolean {
  return (
    sameCanonical(left.binding, right.binding) &&
    sameCanonical(left.packed.stableIds, right.packed.stableIds) &&
    sameBytes(left.packed.buffer, right.packed.buffer) &&
    sameCanonical(left.digests, right.digests)
  );
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

type OwnerRecord = { disposed: boolean };
const owners = new WeakMap<object, OwnerRecord>();

function liveAuthorities(
  composerOwner: unknown,
  semanticsOwner: unknown,
  expectedComposerSha256: string,
  expectedSemanticsSha256: string,
): Readonly<{
  composer: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  semantics: NonNullable<ReturnType<typeof projectDxfProductTwoPanelSkirtPlacementSemanticsV1>>;
}> {
  const composer = projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner);
  if (!composer) fail('composer-owner-unavailable', 'A live genuine C6 owner is required.');
  const semantics = projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner);
  if (!semantics) fail('semantics-owner-unavailable', 'A live genuine D0 owner is required.');
  const publicComposer = composerOwner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
  const publicSemantics = semanticsOwner as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
  if (
    composer.composerCanonicalSha256 !== expectedComposerSha256 ||
    publicComposer.snapshot.seal.canonicalSha256 !== expectedComposerSha256 ||
    publicSemantics.snapshot.seal.canonicalSha256 !== expectedSemanticsSha256 ||
    semantics.composerCanonicalSha256 !== expectedComposerSha256 ||
    publicSemantics.snapshot.bindings.composerCanonicalSha256 !== expectedComposerSha256 ||
    publicSemantics.snapshot.bindings.phase2ArtifactSha256 !== composer.phase2ArtifactSha256 ||
    publicComposer.snapshot.origin !== semantics.origin ||
    semantics.policy.mapping.kind !== 'authored-annular-sector-conical' ||
    semantics.bodyProviderAuthority !== false ||
    semantics.placementTransformAuthority !== false ||
    publicSemantics.snapshot.claims.bodyProviderBound !== false ||
    publicSemantics.snapshot.claims.placementTransformGenerated !== false
  )
    fail('authority-binding-mismatch', 'C6 and D0 authorities or their honest claims differ.');
  return { composer, semantics };
}

export async function buildDxfProductTwoPanelSkirtPlacementBodyAdmissionV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductTwoPanelSkirtPlacementBodyAdmissionResultV1> {
  try {
    const { request, composerOwner, semanticsOwner, bodyProvider } = detach(input);
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'A genuine registered beta-skirt body provider is required.');
    const initial = liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    const secondProjection = projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner);
    if (!secondProjection || !sameProjection(initial.composer, secondProjection))
      fail('authority-binding-mismatch', 'Two fresh C6 mesh projections differ.');
    if (
      bodyProvider.id !== initial.semantics.body.providerId ||
      bodyProvider.revision !== initial.semantics.body.providerRevision
    )
      fail('body-identity-mismatch', 'Genuine provider identity differs from D0 body intent.');

    let firstBody: BodyArtifact;
    let secondBody: BodyArtifact;
    try {
      firstBody = await bodyProvider.reconstruct({
        requestedPose: initial.semantics.body.poseKind,
        sourceRevision: BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1,
      });
    } catch (error) {
      fail(
        'body-reconstruction-failed',
        error instanceof Error ? error.message : 'First body reconstruction failed.',
      );
    }
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during reconstruction.');
    try {
      secondBody = await bodyProvider.reconstruct({
        requestedPose: initial.semantics.body.poseKind,
        sourceRevision: BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1,
      });
    } catch (error) {
      fail(
        'body-reconstruction-failed',
        error instanceof Error ? error.message : 'Second body reconstruction failed.',
      );
    }
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during reconstruction.');
    if (!hasIndependentBodyOwnership(firstBody, secondBody))
      fail(
        'body-reconstruction-mismatch',
        'Two body reconstructions reused owned body, landmark, LOD, collider, or buffer state.',
      );
    if (!sameCanonical(firstBody, secondBody))
      fail('body-reconstruction-mismatch', 'Two fresh body reconstructions differ.');
    validateBodyIdentity(firstBody, initial.semantics);
    validateBodyIdentity(secondBody, initial.semantics);

    const crypto = options.crypto ?? globalThis.crypto;
    let firstPacked: BoundPackedBodyCapsulesV1;
    let secondPacked: BoundPackedBodyCapsulesV1;
    try {
      firstPacked = await buildBoundPackedBodyCapsulesV1(
        firstBody,
        initial.semantics.body.collisionLodId,
        { crypto },
      );
    } catch (error) {
      fail(
        'body-packing-failed',
        error instanceof Error ? error.message : 'First body capsule packing failed.',
      );
    }
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during packing.');
    try {
      secondPacked = await buildBoundPackedBodyCapsulesV1(
        secondBody,
        initial.semantics.body.collisionLodId,
        { crypto },
      );
    } catch (error) {
      fail(
        'body-packing-failed',
        error instanceof Error ? error.message : 'Second body capsule packing failed.',
      );
    }
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during packing.');
    if (!samePacked(firstPacked, secondPacked))
      fail('body-packing-repeat-mismatch', 'Two fresh bound body capsule builds differ.');
    if (
      firstPacked.binding.bodyId !== initial.semantics.body.bodyId ||
      firstPacked.binding.bodyRevision !== initial.semantics.body.bodyRevision ||
      firstPacked.binding.poseKind !== initial.semantics.body.poseKind ||
      firstPacked.binding.poseRevision !== initial.semantics.body.poseRevision ||
      firstPacked.binding.collisionLodId !== initial.semantics.body.collisionLodId ||
      firstPacked.binding.provenanceStatus !== 'cleared'
    )
      fail('body-identity-mismatch', 'Bound body capsule identity differs from D0 body intent.');

    const [coordinateSystemSha256, landmarkSetSha256] = await Promise.all([
      sha256(
        'dxf-product-two-panel-skirt-placement-body-admission-coordinate-system-v1',
        firstBody.pose.coordinateSystem,
        crypto,
      ),
      sha256(
        'dxf-product-two-panel-skirt-placement-body-admission-landmarks-v1',
        firstBody.landmarks,
        crypto,
      ),
    ]);
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during sealing.');
    const payload = {
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_V1,
      status: 'body-bound-placement-admission-candidate' as const,
      origin: initial.semantics.origin,
      bindings: {
        composerCanonicalSha256: request.expected.composerCanonicalSha256,
        semanticsCanonicalSha256: request.expected.semanticsCanonicalSha256,
        phase2ArtifactSha256: initial.composer.phase2ArtifactSha256,
        semanticsBodyIdentitySha256: (
          semanticsOwner as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1
        ).snapshot.bindings.bodyIdentitySha256,
        placementPolicySha256: (semanticsOwner as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1)
          .snapshot.bindings.placementPolicySha256,
        bodyProviderId: bodyProvider.id,
        bodyProviderRevision: bodyProvider.revision,
        bodyId: firstPacked.binding.bodyId,
        bodyRevision: firstPacked.binding.bodyRevision,
        poseKind: firstPacked.binding.poseKind as 'A',
        poseRevision: firstPacked.binding.poseRevision,
        coordinateSystemSha256,
        landmarkSetSha256,
        collisionLodId: firstPacked.binding.collisionLodId,
        bodyIdentitySha256: firstPacked.digests.bodyIdentitySha256,
        colliderContentSha256: firstPacked.digests.colliderContentSha256,
        packedBytesSha256: firstPacked.digests.packedBytesSha256,
        boundBodyAggregateSha256: firstPacked.digests.aggregateSha256,
      },
      counts: {
        pieceCount: 2 as const,
        seamCount: 2 as const,
        landmarkCount: firstBody.landmarks.landmarks.length,
        colliderCount: firstPacked.binding.colliderCount,
      },
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_BLOCKERS_V1,
    };
    const canonicalSha256 = await sha256(
      'dxf-product-two-panel-skirt-placement-body-admission-v1',
      payload,
      crypto,
    );
    liveAuthorities(
      composerOwner,
      semanticsOwner,
      request.expected.composerCanonicalSha256,
      request.expected.semanticsCanonicalSha256,
    );
    if (!isBetaSkirtAnalyticalBodyProviderV1(bodyProvider))
      fail('forged-body-provider', 'Body provider became unavailable during final sealing.');
    const snapshot = deepFreeze({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies DxfProductTwoPanelSkirtPlacementBodyAdmissionSnapshotV1);
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_OWNER_V1,
      snapshot,
    }) as unknown as DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1;
    owners.set(owner, { disposed: false });
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_BODY_ADMISSION_BLOCKERS_V1,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function isDxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1(
  owner: unknown,
): owner is DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1 {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  return !!record && !record.disposed;
}

export function disposeDxfProductTwoPanelSkirtPlacementBodyAdmissionV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  record.disposed = true;
  owners.delete(owner);
  return true;
}
