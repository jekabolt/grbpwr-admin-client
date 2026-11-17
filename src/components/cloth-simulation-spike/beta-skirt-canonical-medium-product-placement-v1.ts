import { createMakeHumanUniformWaistHipModesV1 } from '../../lib/cloth/body/makehuman-uniform-waist-hip-modes-v1';
import { loadMakeHumanOpenReferenceBasisV1 } from '../../lib/cloth/body/measurement-open-reference-display-v1';
import { loadMakeHumanTorsoShapeDeltaBundleV1 } from '../../lib/cloth/body/makehuman-torso-shape-delta-bundle-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
  mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1,
  type DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingResultV1,
} from '../../lib/cloth/domain/dxf-product-two-panel-skirt-annular-authored-frame-mapping-v1';
import {
  GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
  evaluateGarmentBodySectionCompatibilityPreflightV1,
  type GarmentBodySectionCompatibilityResultV1,
} from '../../lib/cloth/domain/garment-body-section-compatibility-preflight-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
  type PatternImportDxfProductGarmentMeshComposerProjectionV3,
} from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v3';
import type { ClothBoundarySample, ClothMeshIR } from '../../lib/cloth/mesh/cloth-mesh-ir';

import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import {
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';
import { betaSkirtRenderedBodyCollisionInputV1 } from './beta-skirt-rendered-body-collision-worker-client-v1';
import {
  isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2,
  projectBetaSkirtCanonicalMediumDisplayedBodyV2,
  type BetaSkirtCanonicalMediumPlacementBodyInputV2,
} from './beta-skirt-canonical-medium-displayed-body-admission-v2';

export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_REQUEST_V1 =
  'beta-skirt-canonical-medium-product-placement-request/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_V1 =
  'beta-skirt-canonical-medium-product-placement/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_OWNER_V1 =
  'beta-skirt-canonical-medium-product-placement-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_PROJECTION_V1 =
  'beta-skirt-canonical-medium-product-placement-projection/1' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const reflectApply = Reflect.apply;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const CANONICAL_MEDIUM_BODY_POSITIONS_SHA256 =
  '979a57c3aa8fdb84fb4f5dccd938d378dfda47534f981483538f5d12ca8e8490';
const CANONICAL_MEDIUM_BODY_TOPOLOGY_SHA256 =
  'a3361738abec7d283ba6f69d523d1b3e02b573523f3412a1fed176dae7e24451';
const PARAMETER_RESIDUAL_MM = 0.01;
const PARAMETER_RESIDUAL_RAD = 0.000001;

export type BetaSkirtCanonicalMediumProductAuthoredFrameV1 = Readonly<{
  waistSlantRadiusMm: 700;
  hemSlantRadiusMm: 900;
  sectorSpanRadPerPiece: 0.64;
  waistSourceCurveCountPerPiece: 40;
  hemSourceCurveCountPerPiece: 50;
  radialSourceCurveCountPerPiece: 2;
  seamAnchorAngleRad: 0;
  pieces: readonly [
    Readonly<{
      pieceId: 'FRONT';
      planarApexMm: readonly [number, number];
      planarMirrorSign: 1;
      bodyAngularSign: -1;
    }>,
    Readonly<{
      pieceId: 'BACK';
      planarApexMm: readonly [number, number];
      planarMirrorSign: -1;
      bodyAngularSign: 1;
    }>,
  ];
}>;

export type BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1 = Readonly<{
  v2VertexCount: number;
  v2TriangleCount: number;
  v3VertexCount: number;
  v3BoundaryVertexCount: number;
  v3InteriorVertexCount: number;
  v3TriangleCount: number;
  seamCount: number;
  seamPairCount: number;
}>;

const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_REFINED_MESH_EXPECTATION_V1 = Object.freeze({
  v2VertexCount: 244,
  v2TriangleCount: 240,
  v3VertexCount: 580,
  v3BoundaryVertexCount: 244,
  v3InteriorVertexCount: 336,
  v3TriangleCount: 912,
  seamCount: 2,
  seamPairCount: 34,
}) satisfies BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1;

export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1 = Object.freeze({
  waistSlantRadiusMm: 700,
  hemSlantRadiusMm: 900,
  sectorSpanRadPerPiece: 0.64,
  waistSourceCurveCountPerPiece: 40,
  hemSourceCurveCountPerPiece: 50,
  radialSourceCurveCountPerPiece: 2,
  seamAnchorAngleRad: 0,
  pieces: Object.freeze([
    Object.freeze({
      pieceId: 'FRONT',
      planarApexMm: Object.freeze([0, 0] as const),
      planarMirrorSign: 1 as const,
      bodyAngularSign: -1 as const,
    }),
    Object.freeze({
      pieceId: 'BACK',
      planarApexMm: Object.freeze([0, 0] as const),
      planarMirrorSign: -1 as const,
      bodyAngularSign: 1 as const,
    }),
  ] as const),
}) satisfies BetaSkirtCanonicalMediumProductAuthoredFrameV1;

const CLAIMS = Object.freeze({
  genuineComposerV2Projected: true as const,
  genuineComposerV3Projected: true as const,
  exactV2ToV3BoundaryProvenanceRemapVerified: true as const,
  boundaryRolesDerivedFromProvenanceAndRestGeometry: true as const,
  authenticatedCanonicalMediumDisplayBodyBound: true as const,
  authenticatedMeasurementWaistStationBound: true as const,
  authoredAnnularMappingBuiltAtUniformScaleOne: true as const,
  continuousConeMapIsometric: true as const,
  discreteChordLengthsExact: false as const,
  authenticatedAssemblyOrderSeamsColocated: true as const,
  pinsDerivedThroughExactV2ToV3BoundaryRemap: true as const,
  sectionCompatibilityDiagnosticEvaluated: true as const,
  exactRenderedBodyCollisionDiagnosticEvaluated: true as const,
  detachedCollisionInputProjectionAvailable: true as const,
  rawFloat32LeCollisionBindingCompatible: true as const,
  nativeSha256KnownAnswerTestsPassed: true as const,
  callerCryptoInjectionAccepted: false as const,
  normalizedTopologyRestrictedToCollisionDiagnostic: true as const,
  solverMaterialFrameCompatibility: false as const,
  bodyFrameAuthority: false as const,
  placementAuthority: false as const,
  collisionAuthority: false as const,
  initializationAdmitted: false as const,
  fitAuthority: false as const,
  runtimeAuthority: false as const,
  persistenceAuthority: false as const,
  productionAuthority: false as const,
});

const BLOCKERS = Object.freeze([
  'source-authenticity-not-established',
  'front-back-orientation-and-gravity-frame-not-qualified',
  'normalized-topology-material-frame-transform-not-qualified',
  'seam-aware-self-intersection-gate-not-qualified',
  'retention-and-support-gate-not-qualified',
  'cloth-solver-settle-not-evaluated',
  'fit-not-qualified',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'production-qualification-not-run',
] as const);

type ReadyMannequin = Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;

export type BetaSkirtCanonicalMediumProductPlacementRequestV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_REQUEST_V1;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
}> &
  (
    | Readonly<{ mannequin: ReadyMannequin; canonicalDisplayedBodyOwner?: never }>
    | BetaSkirtCanonicalMediumPlacementBodyInputV2
  );

export type BetaSkirtCanonicalMediumBoundaryClassificationV1 = Readonly<{
  pieceId: string;
  waistSourceCurveIds: readonly string[];
  hemSourceCurveIds: readonly string[];
  radialSourceCurveIds: readonly string[];
  waistV2VertexIndices: Uint32Array;
}>;

export type BetaSkirtCanonicalMediumProductPlacementSnapshotV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_V1;
  status: 'actual-body-authored-frame-diagnostic';
  bindings: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    refinementFingerprint: string;
    refinementEvaluationFingerprint: string;
    modelId: string;
    modelContentRevision: string;
    inputFingerprint: string;
    canonicalContentFingerprint: string;
    basisKind: string;
    posePresetId: string;
    bodySourceRevision: string;
    bodyPositionsSha256: string;
    bodyTopologySha256: string;
    garmentRestPositionsSha256: string;
    garmentMappedContentSha256: string;
    garmentMappedPositionsSha256: string;
    garmentOriginalTopologySha256: string;
    garmentTopologySha256: string;
    garmentMaterialFramesSha256: string;
    garmentWindingNormalizationSha256: string;
    garmentSeamsSha256: string;
    garmentPinsSha256: string;
    authoredFrameSha256: string;
    sectionCompatibilitySha256: string;
    collisionInputSha256: string;
  }>;
  counts: Readonly<{
    bodyVertexCount: number;
    bodyTriangleCount: number;
    v2VertexCount: number;
    v2TriangleCount: number;
    v3VertexCount: number;
    v3BoundaryVertexCount: number;
    v3InteriorVertexCount: number;
    v3TriangleCount: number;
    seamCount: number;
    seamPairCount: number;
    remappedBoundaryVertexCount: number;
    pinnedWaistVertexCount: number;
  }>;
  authoredFrame: Readonly<{
    waistCenterM: readonly [number, number, number];
    verticalAxis: 'positive-y';
    radialPlane: 'xz';
    seamAnchorAxis: 'positive-x';
    garmentUniformScale: 1;
    garmentTranslationM: readonly [0, 0, 0];
    coneSlope: number;
    axialSlope: number;
    authoredWaistCircumferenceM: number;
    authoredHemCircumferenceM: number;
    authoredAxialLengthM: number;
    maximumDiscreteChordRelativeError: number;
    maximumSeamPostColocationResidualM: 0;
  }>;
  boundaryClassification: readonly Readonly<{
    pieceId: string;
    waistSourceCurveCount: number;
    hemSourceCurveCount: number;
    radialSourceCurveCount: number;
    waistV2VertexCount: number;
  }>[];
  sectionCompatibility: Readonly<{
    ok: boolean;
    status: string;
    sampledSectionCount: number;
    minimumRadialMarginM: number | null;
    initialClearanceFailureCount: number | null;
    sizeCompatibilityFailureCount: number | null;
  }>;
  collision: Readonly<{
    status: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['status'];
    blockers: readonly string[];
    bodyGarmentTriangleIntersectionCount: number | null;
    garmentSelfIntersectionCount: number | null;
    minimumSignedClearanceM: number | null;
    penetratingVertexCount: number | null;
    unsafeVertexCount: number | null;
    contentFingerprintSha256: string;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-diagnostic-consistency-only';
  }>;
  claims: typeof CLAIMS;
  blockers: typeof BLOCKERS;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumProductPlacementOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_OWNER_V1;
  snapshot: BetaSkirtCanonicalMediumProductPlacementSnapshotV1;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumProductPlacementProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_PROJECTION_V1;
  snapshot: BetaSkirtCanonicalMediumProductPlacementSnapshotV1;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  positionsInvMass: Float32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  sectionCompatibility: GarmentBodySectionCompatibilityResultV1;
  collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
  callerOwnedMutableCopies: true;
  bodyFrameAuthority: false;
  placementAuthority: false;
  collisionAuthority: false;
  initializationAuthority: false;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

/** @internal Narrow semantic carrier for the exact seam/pin replay; not placement authority. */
export type BetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1 =
  Readonly<{
    placementCanonicalSha256: string;
    authoredFrameSha256: string;
    pieces: readonly Readonly<{
      pieceId: string;
      waistV2VertexIndices: Uint32Array;
    }>[];
    callerOwnedMutableCopies: true;
  }>;

export type BetaSkirtCanonicalMediumProductPlacementBlockerCodeV1 =
  | 'invalid-input'
  | 'composer-v2-owner-unavailable'
  | 'composer-v3-owner-unavailable'
  | 'composer-binding-mismatch'
  | 'fixture-geometry-mismatch'
  | 'boundary-provenance-mismatch'
  | 'mannequin-binding-mismatch'
  | 'waist-station-unavailable'
  | 'section-compatibility-blocked'
  | 'collision-diagnostic-failed'
  | 'sha256-unavailable';

export type BetaSkirtCanonicalMediumProductPlacementResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumProductPlacementOwnerV1;
      snapshot: BetaSkirtCanonicalMediumProductPlacementSnapshotV1;
      claims: typeof CLAIMS;
      blockers: typeof BLOCKERS;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: Readonly<Record<keyof typeof CLAIMS, false>>;
      blockers: readonly [
        Readonly<{
          code: BetaSkirtCanonicalMediumProductPlacementBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

type OwnerRecord = {
  canonicalDisplayedBodyOwner: unknown | null;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  positionsInvMass: Float32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  authoredWaistV2ByPiece: {
    pieceId: string;
    waistV2VertexIndices: Uint32Array;
  }[];
  sectionCompatibility: GarmentBodySectionCompatibilityResultV1;
  collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
  disposed: boolean;
};

const owners = new WeakMap<object, OwnerRecord>();

class PlacementFailure extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumProductPlacementBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: BetaSkirtCanonicalMediumProductPlacementBlockerCodeV1, detail: string): never {
  throw new PlacementFailure(code, detail);
}

const FALSE_CLAIMS = Object.freeze(
  Object.fromEntries(Object.keys(CLAIMS).map((key) => [key, false])),
) as Readonly<Record<keyof typeof CLAIMS, false>>;

function blocked(error: unknown): BetaSkirtCanonicalMediumProductPlacementResultV1 {
  const failure =
    error instanceof PlacementFailure
      ? error
      : new PlacementFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Product placement diagnostic failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: FALSE_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [
      Readonly<{
        code: BetaSkirtCanonicalMediumProductPlacementBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function exactRequest(input: unknown): {
  composerV2Owner: unknown;
  composerV3Owner: unknown;
  mannequin: unknown;
  canonicalDisplayedBodyOwner: unknown | null;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ArrayBuffer.isView(input)) {
    fail('invalid-input', 'Placement request must be one exact plain record.');
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    fail('invalid-input', 'Placement request could not be inspected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-input', 'Placement request must use a plain object prototype.');
  }
  const observed = Object.prototype.hasOwnProperty.call(descriptors, 'canonicalDisplayedBodyOwner');
  const expected = observed
    ? ['canonicalDisplayedBodyOwner', 'composerV2Owner', 'composerV3Owner', 'schemaVersion']
    : ['composerV2Owner', 'composerV3Owner', 'mannequin', 'schemaVersion'];
  const keys = Reflect.ownKeys(descriptors);
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    keys.length !== actual.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('invalid-input', 'Placement request has missing, symbol, hidden, or unexpected fields.');
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail('invalid-input', `Placement request ${key} must be one enumerable own data property.`);
    }
  }
  if (
    descriptors.schemaVersion!.value !== BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_REQUEST_V1
  ) {
    fail('invalid-input', 'Placement request schemaVersion is unsupported.');
  }
  if (observed && !descriptors.canonicalDisplayedBodyOwner!.value)
    fail('invalid-input', 'Canonical displayed body owner must be present.');
  return {
    composerV2Owner: descriptors.composerV2Owner!.value,
    composerV3Owner: descriptors.composerV3Owner!.value,
    mannequin: observed ? null : descriptors.mannequin!.value,
    canonicalDisplayedBodyOwner: observed ? descriptors.canonicalDisplayedBodyOwner!.value : null,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical value contains a non-finite number.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) {
    throw new TypeError('Canonical value contains unsupported data.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new TypeError('Canonical value contains a symbol property.');
  }
  return `{${(keys as string[])
    .filter((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) {
        throw new TypeError('Canonical value contains an accessor property.');
      }
      return descriptor.value !== undefined;
    })
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key]!.value)}`)
    .join(',')}}`;
}

type DigestAuthority = Readonly<{
  subtle: SubtleCrypto;
  digest: SubtleCrypto['digest'];
}>;

function digestAuthority(): DigestAuthority {
  const subtle = globalThis.crypto?.subtle;
  if (
    !subtle ||
    !subtleDigest ||
    typeof SubtleCrypto === 'undefined' ||
    objectGetPrototypeOf(subtle) !== SubtleCrypto.prototype
  ) {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 authority is unavailable.');
  }
  return Object.freeze({ subtle, digest: subtleDigest as SubtleCrypto['digest'] });
}

async function digestBytes(bytes: Uint8Array, authority: DigestAuthority): Promise<string> {
  let result: ArrayBuffer;
  try {
    result = (await reflectApply(authority.digest, authority.subtle, [
      'SHA-256',
      bytes,
    ])) as ArrayBuffer;
  } catch {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 failed.');
  }
  if (!(result instanceof ArrayBuffer) || result.byteLength !== 32) {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 returned an invalid digest.');
  }
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validateDigestAuthority(authority: DigestAuthority): Promise<void> {
  if ((await digestBytes(new Uint8Array(0), authority)) !== EMPTY_SHA256) {
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  }
  if ((await digestBytes(encoder.encode('abc'), authority)) !== ABC_SHA256) {
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
  }
}

function trustedCollisionCrypto(authority: DigestAuthority): Crypto {
  const subtle = Object.freeze({
    digest(
      ...[algorithm, data]: Parameters<SubtleCrypto['digest']>
    ): ReturnType<SubtleCrypto['digest']> {
      return reflectApply(authority.digest, authority.subtle, [algorithm, data]);
    },
  });
  return Object.freeze({ subtle }) as unknown as Crypto;
}

async function sha256Bytes(
  domain: string,
  chunks: readonly Uint8Array[],
  authority: DigestAuthority,
): Promise<string> {
  const domainBytes = encoder.encode(`${domain}\0`);
  const total = chunks.reduce((sum, chunk) => sum + 8 + chunk.byteLength, domainBytes.byteLength);
  if (!Number.isSafeInteger(total) || total > 16 * 1024 * 1024) {
    fail('invalid-input', `${domain} hash payload exceeds the bounded byte budget.`);
  }
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  bytes.set(domainBytes, 0);
  let offset = domainBytes.byteLength;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.byteLength, true);
    view.setUint32(offset + 4, 0, true);
    offset += 8;
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return digestBytes(bytes, authority);
}

function ownedBytes(value: Float32Array | Uint32Array, label: string): Uint8Array {
  if (!(value.buffer instanceof ArrayBuffer)) {
    fail('invalid-input', `${label} cannot use SharedArrayBuffer storage.`);
  }
  const output = new Uint8Array(value.byteLength);
  output.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  return output;
}

function float32LeBytes(value: Float32Array, label: string): Uint8Array {
  if (!dataViewSetFloat32) fail('sha256-unavailable', 'Float32LE writer is unavailable.');
  if (!(value.buffer instanceof ArrayBuffer)) {
    fail('invalid-input', `${label} cannot use SharedArrayBuffer storage.`);
  }
  const bytes = new Uint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) {
    reflectApply(dataViewSetFloat32, view, [index * 4, value[index], true]);
  }
  return bytes;
}

async function sha256Arrays(
  domain: string,
  values: readonly (Float32Array | Uint32Array)[],
  authority: DigestAuthority,
): Promise<string> {
  const header = encoder.encode(
    canonical(
      values.map((value) => ({
        kind: value instanceof Float32Array ? 'f32' : 'u32',
        length: value.length,
      })),
    ),
  );
  return sha256Bytes(
    domain,
    [header, ...values.map((value, index) => ownedBytes(value, `${domain}[${index}]`))],
    authority,
  );
}

async function sha256Plain(
  domain: string,
  value: unknown,
  authority: DigestAuthority,
): Promise<string> {
  return sha256Bytes(domain, [encoder.encode(canonical(value))], authority);
}

function radiusMm(
  mesh: Pick<ClothMeshIR, 'restPositions2Mm'>,
  vertexIndex: number,
  apex: readonly [number, number],
): number {
  return Math.hypot(
    mesh.restPositions2Mm[vertexIndex * 2]! - apex[0],
    mesh.restPositions2Mm[vertexIndex * 2 + 1]! - apex[1],
  );
}

function angleRad(
  mesh: Pick<ClothMeshIR, 'restPositions2Mm'>,
  vertexIndex: number,
  apex: readonly [number, number],
): number {
  return Math.atan2(
    mesh.restPositions2Mm[vertexIndex * 2 + 1]! - apex[1],
    mesh.restPositions2Mm[vertexIndex * 2]! - apex[0],
  );
}

function classifyBoundary(
  mesh: Pick<ClothMeshIR, 'restPositions2Mm' | 'boundarySamples'>,
  authored: BetaSkirtCanonicalMediumProductAuthoredFrameV1,
): readonly BetaSkirtCanonicalMediumBoundaryClassificationV1[] {
  return Object.freeze(
    authored.pieces.map((piece) => {
      const samples = mesh.boundarySamples.filter((sample) => sample.pieceId === piece.pieceId);
      if (samples.length === 0) {
        fail('boundary-provenance-mismatch', `${piece.pieceId} has no boundary provenance.`);
      }
      const byCurve = new Map<string, ClothBoundarySample[]>();
      for (const sample of samples) {
        const group = byCurve.get(sample.sourceCurveId) ?? [];
        group.push(sample);
        byCurve.set(sample.sourceCurveId, group);
      }
      const waist: string[] = [];
      const hem: string[] = [];
      const radial: string[] = [];
      for (const [sourceCurveId, curveSamples] of byCurve) {
        const radii = curveSamples.map((sample) =>
          radiusMm(mesh, sample.vertexIndex, piece.planarApexMm),
        );
        const waistResidual = Math.max(
          ...radii.map((radius) => Math.abs(radius - authored.waistSlantRadiusMm)),
        );
        const hemResidual = Math.max(
          ...radii.map((radius) => Math.abs(radius - authored.hemSlantRadiusMm)),
        );
        if (waistResidual <= PARAMETER_RESIDUAL_MM) {
          waist.push(sourceCurveId);
          continue;
        }
        if (hemResidual <= PARAMETER_RESIDUAL_MM) {
          hem.push(sourceCurveId);
          continue;
        }
        const angles = curveSamples.map((sample) =>
          angleRad(mesh, sample.vertexIndex, piece.planarApexMm),
        );
        if (Math.max(...angles) - Math.min(...angles) > PARAMETER_RESIDUAL_RAD * 4) {
          fail(
            'boundary-provenance-mismatch',
            `${piece.pieceId}/${sourceCurveId} is neither a constant-radius nor radial boundary curve.`,
          );
        }
        radial.push(sourceCurveId);
      }
      waist.sort();
      hem.sort();
      radial.sort();
      if (
        waist.length !== authored.waistSourceCurveCountPerPiece ||
        hem.length !== authored.hemSourceCurveCountPerPiece ||
        radial.length !== authored.radialSourceCurveCountPerPiece
      ) {
        fail(
          'fixture-geometry-mismatch',
          `${piece.pieceId} derived curve roles ${waist.length}/${hem.length}/${radial.length}, expected 40/50/2.`,
        );
      }
      const waistVertices = new Set<number>();
      for (const sample of samples) {
        const radius = radiusMm(mesh, sample.vertexIndex, piece.planarApexMm);
        if (Math.abs(radius - authored.waistSlantRadiusMm) <= PARAMETER_RESIDUAL_MM) {
          waistVertices.add(sample.vertexIndex);
        }
      }
      return Object.freeze({
        pieceId: piece.pieceId,
        waistSourceCurveIds: Object.freeze(waist),
        hemSourceCurveIds: Object.freeze(hem),
        radialSourceCurveIds: Object.freeze(radial),
        waistV2VertexIndices: Uint32Array.from([...waistVertices].sort((a, b) => a - b)),
      });
    }),
  );
}

function boundarySampleKey(mesh: ClothMeshIR, sample: ClothBoundarySample): string {
  return [
    sample.pieceId,
    sample.contourId,
    sample.sourceCurveId,
    sample.sourceCurveT,
    sample.normalizedArc,
    mesh.restPositions2Mm[sample.vertexIndex * 2],
    mesh.restPositions2Mm[sample.vertexIndex * 2 + 1],
  ].join('\u0000');
}

function exactBoundaryRemap(
  v2: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  v3: PatternImportDxfProductGarmentMeshComposerProjectionV3,
): ReadonlyMap<number, number> {
  const v3ByKey = new Map<string, number>();
  for (const sample of v3.mesh.boundarySamples) {
    const key = boundarySampleKey(v3.mesh, sample);
    const previous = v3ByKey.get(key);
    if (previous !== undefined && previous !== sample.vertexIndex) {
      fail('boundary-provenance-mismatch', 'V3 boundary provenance key is not vertex-unique.');
    }
    v3ByKey.set(key, sample.vertexIndex);
  }
  const remap = new Map<number, number>();
  for (const sample of v2.mesh.boundarySamples) {
    const target = v3ByKey.get(boundarySampleKey(v2.mesh, sample));
    if (target === undefined) {
      fail(
        'boundary-provenance-mismatch',
        `V2 boundary vertex ${sample.vertexIndex} has no exact V3 provenance/rest match.`,
      );
    }
    const previous = remap.get(sample.vertexIndex);
    if (previous !== undefined && previous !== target) {
      fail('boundary-provenance-mismatch', 'One V2 boundary vertex maps to multiple V3 vertices.');
    }
    remap.set(sample.vertexIndex, target);
  }
  const v2BoundaryVertices = new Set(v2.mesh.boundarySamples.map(({ vertexIndex }) => vertexIndex));
  const v3BoundaryVertices = new Set(v3.mesh.boundarySamples.map(({ vertexIndex }) => vertexIndex));
  if (
    remap.size !== v2BoundaryVertices.size ||
    v3BoundaryVertices.size !== v2BoundaryVertices.size ||
    new Set(remap.values()).size !== remap.size
  ) {
    fail('boundary-provenance-mismatch', 'V2 to V3 boundary remap is not one-to-one and complete.');
  }
  const provenanceBoundaryVertices = new Set(
    v3.vertexProvenance
      .filter(({ source }) => source.kind === 'boundary-recovery')
      .map(({ globalVertexIndex }) => globalVertexIndex),
  );
  if (
    provenanceBoundaryVertices.size !== v3BoundaryVertices.size ||
    [...v3BoundaryVertices].some((vertex) => !provenanceBoundaryVertices.has(vertex))
  ) {
    fail('boundary-provenance-mismatch', 'V3 boundary samples and recovery provenance disagree.');
  }
  return remap;
}

function remappedPins(
  classifications: readonly BetaSkirtCanonicalMediumBoundaryClassificationV1[],
  remap: ReadonlyMap<number, number>,
): Uint32Array {
  const pins = new Set<number>();
  for (const classification of classifications) {
    for (const v2Vertex of classification.waistV2VertexIndices) {
      const v3Vertex = remap.get(v2Vertex);
      if (v3Vertex === undefined) {
        fail('boundary-provenance-mismatch', `Waist vertex ${v2Vertex} was not remapped to V3.`);
      }
      pins.add(v3Vertex);
    }
  }
  return Uint32Array.from([...pins].sort((a, b) => a - b));
}

function sameU32(left: Uint32Array, right: Uint32Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function maximumDiscreteChordRelativeError(
  restPositions2Mm: Float32Array,
  mappedPositions3M: Float32Array,
  triangles: Uint32Array,
): number {
  const edges = new Set<string>();
  let maximum = 0;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const values = [triangles[offset]!, triangles[offset + 1]!, triangles[offset + 2]!];
    for (const [left, right] of [
      [values[0]!, values[1]!],
      [values[1]!, values[2]!],
      [values[2]!, values[0]!],
    ] as const) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (edges.has(key)) continue;
      edges.add(key);
      const rest =
        Math.hypot(
          restPositions2Mm[left * 2]! - restPositions2Mm[right * 2]!,
          restPositions2Mm[left * 2 + 1]! - restPositions2Mm[right * 2 + 1]!,
        ) / 1_000;
      const mapped = Math.hypot(
        mappedPositions3M[left * 3]! - mappedPositions3M[right * 3]!,
        mappedPositions3M[left * 3 + 1]! - mappedPositions3M[right * 3 + 1]!,
        mappedPositions3M[left * 3 + 2]! - mappedPositions3M[right * 3 + 2]!,
      );
      if (!(rest > 0)) fail('fixture-geometry-mismatch', 'Rest topology contains a zero edge.');
      maximum = Math.max(maximum, Math.abs(mapped / rest - 1));
    }
  }
  return maximum;
}

function authenticateMannequin(value: unknown): ReadyMannequin {
  if (!value || typeof value !== 'object') {
    fail('mannequin-binding-mismatch', 'A ready mannequin result is required.');
  }
  const mannequin = value as BetaSkirtG3b2PreviewMannequinResultV1;
  if (mannequin.status !== 'ready') {
    fail('mannequin-binding-mismatch', 'The mannequin result is not ready.');
  }
  const binding = mannequin.composition.displayBinding;
  const request = BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1;
  if (
    binding.modelId !== request.modelId ||
    binding.modelContentRevision !== request.modelContentRevision ||
    binding.inputFingerprint !== request.inputFingerprint ||
    binding.basisKind !== request.basisKind ||
    binding.posePresetId !== request.posePresetId ||
    mannequin.claims.renderedBodyIsClearanceAuthority !== false ||
    mannequin.claims.renderedBodyMeshCollisionMeasured !== false ||
    mannequin.claims.initializationAdmitted !== false ||
    mannequin.claims.fitClaimEligible !== false ||
    mannequin.claims.runtimeAuthorityClaimed !== false ||
    mannequin.claims.productionAuthorityClaimed !== false ||
    mannequin.composition.claims.renderedBodyIsClearanceAuthority !== false ||
    mannequin.composition.claims.initializationAdmitted !== false ||
    mannequin.composition.claims.fitAuthority !== false ||
    mannequin.composition.claims.collisionRuntimeAuthority !== false ||
    mannequin.composition.claims.productionAuthority !== false
  ) {
    fail(
      'mannequin-binding-mismatch',
      'Canonical mannequin binding or authority boundary drifted.',
    );
  }
  return mannequin;
}

function validateComposerPair(
  v2: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  v3: PatternImportDxfProductGarmentMeshComposerProjectionV3,
  expected: BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1,
): void {
  const v2VertexCount = v2.mesh.restPositions2Mm.length / 2;
  const v2TriangleCount = v2.mesh.triangles.length / 3;
  const v3VertexCount = v3.mesh.restPositions2Mm.length / 2;
  const v3TriangleCount = v3.mesh.triangles.length / 3;
  const v3BoundaryCount = v3.vertexProvenance.filter(
    ({ source }) => source.kind === 'boundary-recovery',
  ).length;
  const v3InteriorCount = v3.vertexProvenance.filter(
    ({ source }) => source.kind === 'interior',
  ).length;
  const seamPairCount = v3.mesh.seams.reduce((sum, seam) => sum + seam.vertexPairs.length / 2, 0);
  if (
    v3.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
    v3.phase2ArtifactSha256 !== v2.phase2ArtifactSha256
  ) {
    fail('composer-binding-mismatch', 'C6 V3 does not exact-bind the presented C6 V2 projection.');
  }
  if (
    v2VertexCount !== expected.v2VertexCount ||
    v2TriangleCount !== expected.v2TriangleCount ||
    v3VertexCount !== expected.v3VertexCount ||
    v3BoundaryCount !== expected.v3BoundaryVertexCount ||
    v3InteriorCount !== expected.v3InteriorVertexCount ||
    v3TriangleCount !== expected.v3TriangleCount ||
    v3.mesh.seams.length !== expected.seamCount ||
    seamPairCount !== expected.seamPairCount
  ) {
    fail(
      'fixture-geometry-mismatch',
      `Authored fixture counts drifted: V2 ${v2VertexCount}V/${v2TriangleCount}T; V3 ${v3VertexCount}V/${v3TriangleCount}T/${v3BoundaryCount}B/${v3InteriorCount}I/${seamPairCount}S.`,
    );
  }
  if (
    v2.placementAuthority !== false ||
    v3.placementAuthority !== false ||
    v3.sourceAuthenticityAccepted !== false ||
    v3.runtimeAuthority !== false ||
    v3.productionAuthority !== false
  ) {
    fail('composer-binding-mismatch', 'Upstream C6 authority boundaries drifted.');
  }
}

async function authenticatedWaistCenterM(): Promise<readonly [number, number, number]> {
  try {
    const [basis, bundle] = await Promise.all([
      loadMakeHumanOpenReferenceBasisV1(BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1.basisKind),
      loadMakeHumanTorsoShapeDeltaBundleV1(),
    ]);
    const modes = createMakeHumanUniformWaistHipModesV1({
      basis,
      heightMm: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1.measurements.heightMm,
      bundle,
    });
    const waist = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
    );
    if (!waist) fail('waist-station-unavailable', 'Authenticated waist mode is absent.');
    const center = waist.stationOriginM;
    if (center.length !== 3 || center.some((value) => !Number.isFinite(value))) {
      fail('waist-station-unavailable', 'Authenticated waist station is invalid.');
    }
    return Object.freeze([center[0], center[1], center[2]] as const);
  } catch (error) {
    if (error instanceof PlacementFailure) throw error;
    fail(
      'waist-station-unavailable',
      error instanceof Error ? error.message : 'Authenticated waist station could not be loaded.',
    );
  }
}

/**
 * @internal Diagnostic engine shared by the separately sealed saved-writer-frame adapter.
 * Calling this function alone never creates saved-source claims or placement authority.
 */
export async function buildBetaSkirtCanonicalMediumProductPlacementWithAuthoredFrameInternalV1(
  input: unknown,
  authored: BetaSkirtCanonicalMediumProductAuthoredFrameV1,
  refinedMeshExpectation: BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1 = BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_REFINED_MESH_EXPECTATION_V1,
): Promise<BetaSkirtCanonicalMediumProductPlacementResultV1> {
  try {
    const request = exactRequest(input);
    const authority = digestAuthority();
    await validateDigestAuthority(authority);
    const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    if (!v2) fail('composer-v2-owner-unavailable', 'A live genuine C6 V2 owner is required.');
    const v3 = projectPatternImportDxfProductGarmentMeshComposerV3(request.composerV3Owner);
    if (!v3) fail('composer-v3-owner-unavailable', 'A live genuine C6 V3 owner is required.');
    validateComposerPair(v2, v3, refinedMeshExpectation);
    const observedBody =
      request.canonicalDisplayedBodyOwner === null
        ? null
        : projectBetaSkirtCanonicalMediumDisplayedBodyV2(request.canonicalDisplayedBodyOwner);
    if (request.canonicalDisplayedBodyOwner !== null && !observedBody)
      fail(
        'mannequin-binding-mismatch',
        'A live genuine canonical displayed-body admission owner is required.',
      );
    const baseCollisionInput = observedBody
      ? {
          binding: observedBody.collisionBinding,
          bodyPositionsM: observedBody.bodyPositionsM,
          bodyTriangles: observedBody.bodyTriangles,
        }
      : betaSkirtRenderedBodyCollisionInputV1(authenticateMannequin(request.mannequin).composition);
    const assertDisplayedBodyCurrent = () => {
      if (
        request.canonicalDisplayedBodyOwner !== null &&
        !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(request.canonicalDisplayedBodyOwner)
      )
        fail(
          'mannequin-binding-mismatch',
          'Observed canonical body changed during placement qualification.',
        );
    };
    assertDisplayedBodyCurrent();
    if (
      baseCollisionInput.bodyPositionsM.length / 3 !== 13_380 ||
      baseCollisionInput.bodyTriangles.length / 3 !== 26_756
    ) {
      fail(
        'mannequin-binding-mismatch',
        'Canonical medium rendered-body topology is not the authenticated 13,380V/26,756T body.',
      );
    }
    const waistCenterM = await authenticatedWaistCenterM();
    assertDisplayedBodyCurrent();
    const boundaryClassification = classifyBoundary(v2.mesh, authored);
    const boundaryRemap = exactBoundaryRemap(v2, v3);
    const provenancePins = remappedPins(boundaryClassification, boundaryRemap);
    let mapping: DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingResultV1;
    try {
      mapping = mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1({
        schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
        mesh: v3.mesh,
        pieces: authored.pieces,
        waistSlantRadiusMm: authored.waistSlantRadiusMm,
        hemSlantRadiusMm: authored.hemSlantRadiusMm,
        sectorSpanRadPerPiece: authored.sectorSpanRadPerPiece,
        waistCenterM,
        seamAnchorAngleRad: authored.seamAnchorAngleRad,
        parameterResidualMm: PARAMETER_RESIDUAL_MM,
        parameterResidualRad: PARAMETER_RESIDUAL_RAD,
      });
    } catch (error) {
      fail(
        'fixture-geometry-mismatch',
        error instanceof Error ? error.message : 'Authored annular mapping failed.',
      );
    }
    if (!sameU32(provenancePins, mapping.pinnedWaistVertexIndices)) {
      fail(
        'boundary-provenance-mismatch',
        'Exact V2-to-V3 provenance pins differ from V3 authored-radius pins.',
      );
    }
    const maximumEdgeError = maximumDiscreteChordRelativeError(
      v3.mesh.restPositions2Mm,
      mapping.positions3M,
      mapping.triangles,
    );
    if (maximumEdgeError > 0.002) {
      fail(
        'fixture-geometry-mismatch',
        `Authored-frame discrete chord error ${maximumEdgeError} exceeds the 0.2% diagnostic bound.`,
      );
    }

    const [
      bodyPositionsSha256,
      bodyTopologySha256,
      garmentRestPositionsSha256,
      garmentMappedContentSha256,
      garmentOriginalTopologySha256,
      garmentTopologySha256,
      garmentMaterialFramesSha256,
      garmentSeamsSha256,
      garmentPinsSha256,
    ] = await Promise.all([
      sha256Arrays(
        'canonical-medium-body-positions-v1',
        [baseCollisionInput.bodyPositionsM],
        authority,
      ),
      sha256Arrays(
        'canonical-medium-body-topology-v1',
        [baseCollisionInput.bodyTriangles],
        authority,
      ),
      sha256Arrays('canonical-medium-garment-rest-v1', [v3.mesh.restPositions2Mm], authority),
      sha256Arrays('canonical-medium-garment-mapped-v1', [mapping.positions3M], authority),
      sha256Arrays('canonical-medium-garment-original-topology-v1', [v3.mesh.triangles], authority),
      sha256Arrays(
        'canonical-medium-garment-normalized-topology-v1',
        [mapping.triangles],
        authority,
      ),
      sha256Arrays(
        'canonical-medium-garment-material-frames-v1',
        [v3.triangleMaterialFrames2],
        authority,
      ),
      sha256Arrays('canonical-medium-garment-ao-seams-v1', [mapping.seamPairs], authority),
      sha256Arrays('canonical-medium-garment-pins-v1', [provenancePins], authority),
    ]);
    assertDisplayedBodyCurrent();
    if (
      bodyPositionsSha256 !== CANONICAL_MEDIUM_BODY_POSITIONS_SHA256 ||
      bodyTopologySha256 !== CANONICAL_MEDIUM_BODY_TOPOLOGY_SHA256
    ) {
      fail(
        'mannequin-binding-mismatch',
        'Canonical-medium rendered-body content does not match the exact pinned geometry.',
      );
    }
    const garmentMappedPositionsSha256 = await digestBytes(
      float32LeBytes(mapping.positions3M, 'mapping.positions3M'),
      authority,
    );
    const garmentWindingNormalizationSha256 = await sha256Plain(
      'canonical-medium-garment-winding-normalization-v1',
      {
        originalTopologySha256: garmentOriginalTopologySha256,
        normalizedTopologySha256: garmentTopologySha256,
        materialFramesSha256: garmentMaterialFramesSha256,
        pieceWinding: mapping.report.pieceWinding,
      },
      authority,
    );
    const authoredFrameSha256 = await sha256Plain(
      'canonical-medium-authored-frame-v1',
      {
        bodyBinding: {
          ...baseCollisionInput.binding,
          garmentPositionsSha256: garmentMappedPositionsSha256,
        },
        waistCenterM,
        verticalAxis: 'positive-y',
        radialPlane: 'xz',
        seamAnchorAxis: 'positive-x',
        authored,
        mapping: mapping.report,
        windingNormalizationSha256: garmentWindingNormalizationSha256,
      },
      authority,
    );

    const sectionCompatibility = evaluateGarmentBodySectionCompatibilityPreflightV1({
      schemaVersion: GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
      bodyPositionsM: baseCollisionInput.bodyPositionsM,
      bodyTriangles: baseCollisionInput.bodyTriangles,
      garmentPositionsM: mapping.positions3M,
      garmentTriangles: mapping.triangles,
      verticalAxisOriginM: waistCenterM,
      garmentWaistYM: waistCenterM[1],
      garmentHemYM: waistCenterM[1] - mapping.report.authoredAxialLengthM,
      policy: {
        sectionCount: 33,
        requiredRadialClearanceM: 0.01,
        maximumCircumferentialStretchDelta: 0.01,
      },
    });
    if (sectionCompatibility.ok === false) {
      fail(
        'section-compatibility-blocked',
        `${sectionCompatibility.code}: ${sectionCompatibility.detail}`,
      );
    }
    if (sectionCompatibility.status !== 'compatible-with-authored-clearance') {
      fail(
        'section-compatibility-blocked',
        `Section compatibility is ${sectionCompatibility.status}; authored clearance is required.`,
      );
    }
    const sectionCompatibilitySha256 = await sha256Plain(
      'canonical-medium-section-compatibility-v1',
      sectionCompatibility,
      authority,
    );
    const collisionInput = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1({
      binding: {
        ...baseCollisionInput.binding,
        garmentPositionsSha256: garmentMappedPositionsSha256,
      },
      bodyPositionsM: baseCollisionInput.bodyPositionsM,
      bodyTriangles: baseCollisionInput.bodyTriangles,
      garmentPositionsM: mapping.positions3M,
      garmentTriangles: mapping.triangles,
      garmentUniformScale: 1,
      garmentTranslationM: [0, 0, 0],
    });
    let collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
    try {
      collision = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(collisionInput, {
        crypto: trustedCollisionCrypto(authority),
      });
      assertDisplayedBodyCurrent();
    } catch (error) {
      fail(
        'collision-diagnostic-failed',
        error instanceof Error ? error.message : 'Exact rendered-body collision diagnostic failed.',
      );
    }
    const collisionInputSha256 = collision.contentFingerprintSha256;
    if (!SHA256.test(collisionInputSha256)) {
      fail('collision-diagnostic-failed', 'Collision diagnostic returned an invalid input hash.');
    }

    const v3BoundaryVertexCount = v3.vertexProvenance.filter(
      ({ source }) => source.kind === 'boundary-recovery',
    ).length;
    const v3InteriorVertexCount = v3.vertexProvenance.filter(
      ({ source }) => source.kind === 'interior',
    ).length;
    const bindings = Object.freeze({
      composerV2CanonicalSha256: v2.composerCanonicalSha256,
      composerV3CanonicalSha256: v3.composerCanonicalSha256,
      phase2ArtifactSha256: v3.phase2ArtifactSha256,
      refinedArtifactSha256: v3.refinedArtifactSha256,
      refinementFingerprint: v3.refinementFingerprint,
      refinementEvaluationFingerprint: v3.refinementEvaluationFingerprint,
      modelId: collisionInput.binding.modelId,
      modelContentRevision: collisionInput.binding.modelContentRevision,
      inputFingerprint: collisionInput.binding.inputFingerprint,
      canonicalContentFingerprint: collisionInput.binding.canonicalContentFingerprint,
      basisKind: collisionInput.binding.basisKind,
      posePresetId: collisionInput.binding.posePresetId,
      bodySourceRevision: collisionInput.binding.bodySourceRevision,
      bodyPositionsSha256,
      bodyTopologySha256,
      garmentRestPositionsSha256,
      garmentMappedContentSha256,
      garmentMappedPositionsSha256,
      garmentOriginalTopologySha256,
      garmentTopologySha256,
      garmentMaterialFramesSha256,
      garmentWindingNormalizationSha256,
      garmentSeamsSha256,
      garmentPinsSha256,
      authoredFrameSha256,
      sectionCompatibilitySha256,
      collisionInputSha256,
    });
    const counts = Object.freeze({
      bodyVertexCount: collisionInput.bodyPositionsM.length / 3,
      bodyTriangleCount: collisionInput.bodyTriangles.length / 3,
      v2VertexCount: v2.mesh.restPositions2Mm.length / 2,
      v2TriangleCount: v2.mesh.triangles.length / 3,
      v3VertexCount: v3.mesh.restPositions2Mm.length / 2,
      v3BoundaryVertexCount,
      v3InteriorVertexCount,
      v3TriangleCount: mapping.triangles.length / 3,
      seamCount: v3.mesh.seams.length,
      seamPairCount: mapping.seamPairs.length / 2,
      remappedBoundaryVertexCount: boundaryRemap.size,
      pinnedWaistVertexCount: provenancePins.length,
    });
    const authoredFrame = Object.freeze({
      waistCenterM,
      verticalAxis: 'positive-y' as const,
      radialPlane: 'xz' as const,
      seamAnchorAxis: 'positive-x' as const,
      garmentUniformScale: 1 as const,
      garmentTranslationM: Object.freeze([0, 0, 0] as const),
      coneSlope: mapping.report.coneSlope,
      axialSlope: mapping.report.axialSlope,
      authoredWaistCircumferenceM: mapping.report.authoredWaistCircumferenceM,
      authoredHemCircumferenceM: mapping.report.authoredHemCircumferenceM,
      authoredAxialLengthM: mapping.report.authoredAxialLengthM,
      maximumDiscreteChordRelativeError: maximumEdgeError,
      maximumSeamPostColocationResidualM: mapping.report.maximumSeamPostColocationResidualM,
    });
    const boundarySummary = Object.freeze(
      boundaryClassification.map((classification) =>
        Object.freeze({
          pieceId: classification.pieceId,
          waistSourceCurveCount: classification.waistSourceCurveIds.length,
          hemSourceCurveCount: classification.hemSourceCurveIds.length,
          radialSourceCurveCount: classification.radialSourceCurveIds.length,
          waistV2VertexCount: classification.waistV2VertexIndices.length,
        }),
      ),
    );
    const sectionSummary = Object.freeze({
      ok: sectionCompatibility.ok,
      status: sectionCompatibility.status,
      sampledSectionCount: sectionCompatibility.sections.length,
      minimumRadialMarginM: sectionCompatibility.summary.minimumRadialMarginM,
      initialClearanceFailureCount: sectionCompatibility.summary.initialClearanceFailureCount,
      sizeCompatibilityFailureCount: sectionCompatibility.summary.sizeCompatibilityFailureCount,
    });
    const collisionSummary = Object.freeze({
      status: collision.status,
      blockers: Object.freeze([...collision.blockers]),
      bodyGarmentTriangleIntersectionCount:
        collision.intersections.bodyGarmentTriangleIntersectionCount,
      garmentSelfIntersectionCount: collision.intersections.garmentSelfIntersectionCount,
      minimumSignedClearanceM: collision.clearance.minimumSignedClearanceM,
      penetratingVertexCount: collision.clearance.penetratingVertexCount,
      unsafeVertexCount: collision.clearance.unsafeVertexCount,
      contentFingerprintSha256: collision.contentFingerprintSha256,
    });
    const payload = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_V1,
      status: 'actual-body-authored-frame-diagnostic' as const,
      bindings,
      counts,
      authoredFrame,
      boundaryClassification: boundarySummary,
      sectionCompatibility: sectionSummary,
      collision: collisionSummary,
      claims: CLAIMS,
      blockers: BLOCKERS,
    });
    const sealSha256 = await sha256Plain(
      'beta-skirt-canonical-medium-product-placement-v1',
      payload,
      authority,
    );
    assertDisplayedBodyCurrent();
    const snapshot = Object.freeze({
      ...payload,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: sealSha256,
        authority: 'unsigned-diagnostic-consistency-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumProductPlacementSnapshotV1;
    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_OWNER_V1,
      snapshot,
    }) as BetaSkirtCanonicalMediumProductPlacementOwnerV1;
    owners.set(owner, {
      canonicalDisplayedBodyOwner: request.canonicalDisplayedBodyOwner,
      collisionInput,
      positionsInvMass: new Float32Array(mapping.positionsInvMass),
      seamPairs: new Uint32Array(mapping.seamPairs),
      pinnedWaistVertexIndices: new Uint32Array(provenancePins),
      authoredWaistV2ByPiece: boundaryClassification.map((classification) => ({
        pieceId: classification.pieceId,
        waistV2VertexIndices: new Uint32Array(classification.waistV2VertexIndices),
      })),
      sectionCompatibility,
      collision,
      disposed: false,
    });
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: CLAIMS,
      blockers: BLOCKERS,
    });
  } catch (error) {
    return blocked(error);
  }
}

/**
 * Frozen legacy entry point. The additive saved-writer-frame path below calls the same private
 * engine with a separately validated authored frame; this V1 path always retains the historical
 * canonical [0, 0] apex for both pieces.
 */
export async function buildBetaSkirtCanonicalMediumProductPlacementV1(
  input: unknown,
): Promise<BetaSkirtCanonicalMediumProductPlacementResultV1> {
  return buildBetaSkirtCanonicalMediumProductPlacementWithAuthoredFrameInternalV1(
    input,
    BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
  );
}

export function projectBetaSkirtCanonicalMediumProductPlacementV1(
  owner: unknown,
): BetaSkirtCanonicalMediumProductPlacementProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  if (
    record.canonicalDisplayedBodyOwner !== null &&
    !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(record.canonicalDisplayedBodyOwner)
  ) {
    disposeBetaSkirtCanonicalMediumProductPlacementV1(owner);
    return null;
  }
  const publicOwner = owner as BetaSkirtCanonicalMediumProductPlacementOwnerV1;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_PROJECTION_V1,
    snapshot: publicOwner.snapshot,
    collisionInput: snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(record.collisionInput),
    positionsInvMass: new Float32Array(record.positionsInvMass),
    seamPairs: new Uint32Array(record.seamPairs),
    pinnedWaistVertexIndices: new Uint32Array(record.pinnedWaistVertexIndices),
    sectionCompatibility: record.sectionCompatibility,
    collision: record.collision,
    callerOwnedMutableCopies: true as const,
    bodyFrameAuthority: false as const,
    placementAuthority: false as const,
    collisionAuthority: false as const,
    initializationAuthority: false as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

/** @internal Replays only the authenticated authored waist classification retained by this owner. */
export function projectBetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1(
  owner: unknown,
): BetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumProductPlacementOwnerV1;
  return Object.freeze({
    placementCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
    authoredFrameSha256: publicOwner.snapshot.bindings.authoredFrameSha256,
    pieces: Object.freeze(
      record.authoredWaistV2ByPiece.map((piece) =>
        Object.freeze({
          pieceId: piece.pieceId,
          waistV2VertexIndices: new Uint32Array(piece.waistV2VertexIndices),
        }),
      ),
    ),
    callerOwnedMutableCopies: true as const,
  });
}

export function disposeBetaSkirtCanonicalMediumProductPlacementV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  record.collisionInput.bodyPositionsM.fill(0);
  record.collisionInput.bodyTriangles.fill(0);
  record.collisionInput.garmentPositionsM.fill(0);
  record.collisionInput.garmentTriangles.fill(0);
  record.positionsInvMass.fill(0);
  record.seamPairs.fill(0);
  record.pinnedWaistVertexIndices.fill(0);
  for (const piece of record.authoredWaistV2ByPiece) piece.waistV2VertexIndices.fill(0);
  record.authoredWaistV2ByPiece.length = 0;
  record.disposed = true;
  owners.delete(owner);
  return true;
}
