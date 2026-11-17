import {
  getPatternImportDxfProductSavedAnnularGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularGarmentV1,
  type PatternImportDxfProductSavedAnnularGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularGarmentProjectionV1,
  type PatternImportDxfProductSavedAnnularGarmentReportV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import {
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  savedModelObservedPlacementTargetCodecInternalsV1,
  type SavedModelObservedPlacementTargetV1,
} from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodySnapshotV2,
} from '../managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  modelOpenReferenceDirectPoseGeometryEqualV9,
} from '../managers/model/components/model-open-reference-direct-pose-v9';
import { createMakeHumanUniformWaistHipModesV1 } from 'lib/cloth/body/makehuman-uniform-waist-hip-modes-v1';
import { loadMakeHumanOpenReferenceBasisV1 } from 'lib/cloth/body/measurement-open-reference-display-v1';
import { loadMakeHumanTorsoShapeDeltaBundleV1 } from 'lib/cloth/body/makehuman-torso-shape-delta-bundle-v1';
import { measureMeshPlaneSectionPerimetersV1 } from 'lib/cloth/body/mesh-plane-section-perimeter-v1';
import {
  GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
  evaluateGarmentBodySectionCompatibilityPreflightV1,
  type GarmentBodySectionCompatibilityResultV1,
} from 'lib/cloth/domain/garment-body-section-compatibility-preflight-v1';
import { sha256Hex } from 'lib/features/sha256';
import {
  projectBetaSkirtCanonicalMediumProductPlacementV1,
  type BetaSkirtCanonicalMediumProductPlacementOwnerV1,
  type BetaSkirtCanonicalMediumProductPlacementProjectionV1,
} from './beta-skirt-canonical-medium-product-placement-v1';
import { snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1 } from './beta-skirt-rendered-body-collision-diagnostic-v1';
import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV2,
} from './beta-skirt-rendered-body-collision-diagnostic-v2';
import {
  computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42,
  refreshBetaSkirtRenderedBodySignedVertexContactsV42,
  type BetaSkirtRenderedBodySignedVertexContactRefreshResultV42,
} from './beta-skirt-rendered-body-signed-vertex-contact-refresh-v42';

export const BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2 =
  'beta-skirt-personalized-displayed-body-product-placement/v2' as const;
const CLAIMS = Object.freeze({
  acceptedHostObservedBodyBytesUsed: true,
  exactQualifiedGarmentAndAssemblyOrderBound: true,
  rigidTranslationOnly: true,
  garmentRestStateMutated: false,
  garmentScaleChanged: false,
  displayedBodyRebuilt: false,
  viewportAuthorityAuthenticated: false,
  persistedReaderAuthorityAuthenticated: false,
  collisionAuthority: false,
  initializationAuthority: false,
  garmentFitClaimed: false,
  runtimeAuthority: false,
  productionAuthority: false,
} as const);
const GARMENT_POSITIONS_SHA = '33772a6d189b1ffd598ac45ed2f76d89ccd08a40145d8516371656e9d1950e3a';
const GARMENT_TOPOLOGY_SHA = '740687d630d43550c78bf33724a854b38479894ccaa52c633beb4dba6eee2c0f';
const SHA = /^[0-9a-f]{64}$/u;
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
type Vec3 = readonly [number, number, number];

export type BetaSkirtPersonalizedDisplayedBodyWorldFrameV2 = Readonly<{
  coordinateSystem: Readonly<{
    handedness: 'right';
    origin: 'ground-projection-between-ankles';
    lateralAxis: readonly [1, 0, 0];
    verticalAxis: readonly [0, 1, 0];
    anteriorAxis: readonly [0, 0, 1];
  }>;
  waist: Readonly<{
    nominalStationOriginM: readonly [number, number, number];
    bodySectionCenterM: readonly [number, number, number];
    bodySectionPerimeterM: number;
    bodySectionPointCount: number;
  }>;
  hip: Readonly<{
    nominalStationOriginM: readonly [number, number, number];
    bodySectionCenterM: readonly [number, number, number];
    bodySectionPerimeterM: number;
    bodySectionPointCount: number;
  }>;
}>;
type DiagnosticFailure = Readonly<{ code: string; detail: string }>;

export interface BetaSkirtPersonalizedDisplayedBodyProductPlacementRequestV2 {
  readonly schemaVersion: typeof BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2;
  readonly canonicalPlacementOwner: BetaSkirtCanonicalMediumProductPlacementOwnerV1;
  readonly displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  readonly displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  readonly compositionGeneration: number;
}
export interface BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2 {
  readonly version: typeof BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2;
  readonly status: 'diagnostic-placement-clear' | 'diagnostic-placement-blocked';
  readonly compositionGeneration: number;
  readonly bodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  readonly poseDocument: SavedModelDisplayedTriangleBodySnapshotV2['poseDocument'];
  readonly displayedPose: SavedModelDisplayedTriangleBodySnapshotV2['displayedPose'];
  readonly canonicalPlacementSha256: string;
  readonly sourceGarment: Readonly<{
    mappedPositionsSha256: string;
    normalizedTopologySha256: string;
    restPositionsSha256: string;
    materialFramesSha256: string;
    assemblyOrderSeamsSha256: string;
    waistPinsSha256: string;
  }>;
  readonly candidate: Readonly<{
    garmentPositionsFloat32LeSha256: string;
    garmentTrianglesUint32LeSha256: string;
    assemblyOrderSeamsUint32LeSha256: string;
    waistPinsUint32LeSha256: string;
    translationM: Vec3;
    uniformScale: 1;
    maximumFloat32TranslationResidualM: number;
  }>;
  readonly worldFrame: BetaSkirtPersonalizedDisplayedBodyWorldFrameV2;
  /** Full reports survive physical failures; no terminal blocker is converted into admission. */
  readonly sectionCompatibility: GarmentBodySectionCompatibilityResultV1;
  readonly collisionReport: BetaSkirtRenderedBodyCollisionDiagnosticReportV2 | null;
  readonly collisionReportSha256: string | null;
  readonly collisionFailure: DiagnosticFailure | null;
  readonly signedRefresh: BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 | null;
  readonly signedRefreshFailure: DiagnosticFailure | null;
  readonly blockers: readonly string[];
  readonly claims: typeof CLAIMS;
  readonly reportSha256: string;
}
declare const brand: unique symbol;
export type BetaSkirtPersonalizedDisplayedBodyProductPlacementOwnerV2 = Readonly<{
  version: typeof BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2;
  readonly [brand]: true;
}>;
export interface BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2 {
  readonly report: BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2;
  readonly collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV2;
  readonly assemblyOrderSeamPairs: Uint32Array;
  readonly waistPinVertexIndices: Uint32Array;
  readonly callerOwnedMutableCopies: true;
  readonly claims: typeof CLAIMS;
}
export type BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtPersonalizedDisplayedBodyProductPlacementOwnerV2;
      report: BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2;
    }>
  | Readonly<{ ok: false; owner: null; code: string; detail: string }>;
export const BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1 =
  'beta-skirt-saved-annular-displayed-body-product-placement/v1' as const;
const ANNULAR_CLAIMS = Object.freeze({
  ...CLAIMS,
  historicalPlacementTargetConsumed: false,
  observedBodyTargetConfirmed: false,
  hostCompileGenerationAuthenticatedByGarment: false,
} as const);
export interface BetaSkirtSavedAnnularDisplayedBodyProductPlacementRequestV1 {
  readonly schemaVersion: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly savedAnnularGarmentOwner: PatternImportDxfProductSavedAnnularGarmentOwnerV1;
  readonly displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  readonly displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  /** Supplied by the private host compile context; this value is not present in the garment seal. */
  readonly hostCompileGeneration: number;
}
type AnnularSourceBinding = Readonly<{
  kind: 'saved-annular-garment-v1';
  garmentReportSha256: string;
  composerV2CanonicalSha256: string;
  savedLocalFrameCanonicalSha256: string;
  composerV3CanonicalSha256: string;
  placementSidecarSha256: string;
  semanticsCanonicalSha256: string;
  selfOrientationReportSha256: string;
  normalizedV5ReportSha256: string;
  normalizedV5AggregateSha256: string;
  mappedOriginM: readonly [0, 0, 0];
  persistedTargetDisposition: 'historical-unconsumed';
  garmentReport: PatternImportDxfProductSavedAnnularGarmentReportV1;
}>;
type AnnularSourceGarment = Readonly<{
  mappedPositionsSha256: string;
  normalizedTopologySha256: string;
  materialFramesSha256: string;
  assemblyOrderSeamsSha256: string;
  waistPinsSha256: string;
  restState: Readonly<{
    kind: 'sealed-normalized-v5-continuum-rest-frames';
    normalizedV5AggregateSha256: string;
    continuumRestFramesBytesSha256: string;
  }>;
}>;
export interface BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1
  extends Omit<
    BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2,
    | 'version'
    | 'status'
    | 'compositionGeneration'
    | 'canonicalPlacementSha256'
    | 'sourceGarment'
    | 'claims'
  > {
  readonly version: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly status: 'diagnostic-placement-blocked';
  readonly hostCompileBinding: Readonly<{
    generation: number;
    provenance: 'host-compile-session-supplied';
    authenticatedByGarmentOwner: false;
  }>;
  readonly source: AnnularSourceBinding;
  readonly sourceGarment: AnnularSourceGarment;
  readonly claims: typeof ANNULAR_CLAIMS;
}
declare const annularBrand: unique symbol;
export type BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly [annularBrand]: true;
}>;
export interface BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1
  extends Omit<
    BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2,
    'report' | 'claims'
  > {
  readonly report: BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1;
  readonly claims: typeof ANNULAR_CLAIMS;
}
export type BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1;
      report: BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1;
    }>
  | Readonly<{ ok: false; owner: null; code: string; detail: string }>;
export const BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1 =
  'beta-skirt-saved-annular-observed-placement-displayed-body-product-placement/v1' as const;
const OBSERVED_ANNULAR_CLAIMS = Object.freeze({
  ...CLAIMS,
  persistedObservedTargetMatched: true,
  observedBodyTargetConfirmed: true,
  hostCompileGenerationAuthenticatedByGarment: false,
} as const);
export interface BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementRequestV1 {
  readonly schemaVersion: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly savedAnnularObservedPlacementGarmentOwner: PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
  readonly displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  readonly displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  /** Host compile context metadata; the garment seal does not authenticate this generation. */
  readonly hostCompileGeneration: number;
}
type ObservedAnnularSourceBinding = Omit<
  AnnularSourceBinding,
  'kind' | 'persistedTargetDisposition' | 'garmentReport'
> &
  Readonly<{
    kind: 'saved-annular-observed-placement-garment-v1';
    persistedTargetDisposition: 'fresh-observed-target-matched';
    observedTarget: Readonly<{
      canonicalSha256: string;
      target: SavedModelObservedPlacementTargetV1;
    }>;
    garmentReport: PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
  }>;
export interface BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1
  extends Omit<
    BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1,
    'version' | 'status' | 'source' | 'claims'
  > {
  readonly version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly status: 'diagnostic-placement-clear' | 'diagnostic-placement-blocked';
  readonly source: ObservedAnnularSourceBinding;
  readonly claims: typeof OBSERVED_ANNULAR_CLAIMS;
}
declare const observedAnnularBrand: unique symbol;
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1;
  readonly [observedAnnularBrand]: true;
}>;
export interface BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1
  extends Omit<
    BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2,
    'report' | 'claims'
  > {
  readonly report: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1;
  readonly claims: typeof OBSERVED_ANNULAR_CLAIMS;
}
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
      report: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1;
    }>
  | Readonly<{ ok: false; owner: null; code: string; detail: string }>;
type SourceKind = 'canonical' | 'saved-annular' | 'saved-annular-observed';
type SavedAnnularRequest =
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementRequestV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementRequestV1;
type SavedAnnularProjection =
  | PatternImportDxfProductSavedAnnularGarmentProjectionV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
type PairRequest =
  | BetaSkirtPersonalizedDisplayedBodyProductPlacementRequestV2
  | SavedAnnularRequest;
type PairReport =
  | BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1;
type PairOwner =
  | BetaSkirtPersonalizedDisplayedBodyProductPlacementOwnerV2
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
type PairResult =
  | BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1;
type PairProjection =
  | BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1;
/** Private capability adapter: callers can never supply an implementation of this interface. */
interface GarmentSource {
  kind: SourceKind;
  positions: Float32Array;
  triangles: Uint32Array;
  seams: Uint32Array;
  pins: Uint32Array;
  authoredFrame: Readonly<{ waistCenterM: Vec3; authoredAxialLengthM: number }>;
  garmentBinding:
    | BetaSkirtPersonalizedDisplayedBodyProductPlacementReportV2['sourceGarment']
    | AnnularSourceGarment;
  canonicalPlacementSha256: string | null;
  annularBinding: AnnularSourceBinding | ObservedAnnularSourceBinding | null;
  observedTarget?: ObservedAnnularSourceBinding['observedTarget'];
  lifetime: AbortSignal | null;
  assertCurrent: () => void;
  fresh: (signal?: AbortSignal) => Promise<void>;
  disposeCopies: () => void;
}
interface RecordV2 {
  owner: PairOwner;
  request: PairRequest;
  source: GarmentSource;
  bodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  report: PairReport;
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV2;
  lifetime: AbortController;
  bodyLifetime: AbortSignal;
  cleanup: () => void;
  disposed: boolean;
}
const owners = new WeakMap<object, RecordV2>();
class Failure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new Failure(code, detail);
}
function diagnosticFailure(error: unknown): DiagnosticFailure {
  return Object.freeze({
    code:
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'evaluation-failed',
    detail:
      error instanceof Error ? error.message.slice(0, 2_048) : 'Diagnostic evaluation failed.',
  });
}
function failure(
  error: unknown,
): Exclude<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2, { ok: true }> {
  return Object.freeze({
    ok: false,
    owner: null,
    code: error instanceof Failure ? error.code : 'invalid-input',
    detail: error instanceof Error ? error.message.slice(0, 2_048) : 'Placement failed closed.',
  });
}
function signalCheck(signal?: AbortSignal): void {
  if (signal === undefined) return;
  let cancelled: boolean;
  try {
    cancelled = aborted.call(signal);
  } catch {
    fail('invalid-input', 'A genuine AbortSignal is required.');
  }
  if (cancelled) fail('cancelled', 'Observed-body placement was cancelled.');
}
function captureRequest(value: unknown, kind: SourceKind): PairRequest {
  const keys = [
    'schemaVersion',
    kind === 'canonical'
      ? 'canonicalPlacementOwner'
      : kind === 'saved-annular'
        ? 'savedAnnularGarmentOwner'
        : 'savedAnnularObservedPlacementGarmentOwner',
    'displayedBodyOwner',
    'displayedBodyBinding',
    kind === 'canonical' ? 'compositionGeneration' : 'hostCompileGeneration',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', 'Placement request must be an exact plain record.');
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field?.enumerable || !('value' in field))
      fail('invalid-input', 'Request fields must be plain data.');
    copy[key] = field.value;
  }
  const generation = kind === 'canonical' ? copy.compositionGeneration : copy.hostCompileGeneration;
  if (
    copy.schemaVersion !==
      (kind === 'canonical'
        ? BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2
        : kind === 'saved-annular'
          ? BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1
          : BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1) ||
    !Number.isSafeInteger(generation) ||
    (generation as number) <= 0
  )
    fail('invalid-input', 'Version and actual positive composition generation are required.');
  return Object.freeze(copy) as unknown as PairRequest;
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function sameArray(left: Float32Array | Uint32Array, right: Float32Array | Uint32Array): boolean {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}
function canonicalCurrent(
  owner: BetaSkirtCanonicalMediumProductPlacementOwnerV1,
  expected?: BetaSkirtCanonicalMediumProductPlacementProjectionV1,
) {
  const current = projectBetaSkirtCanonicalMediumProductPlacementV1(owner);
  if (!current)
    fail(
      'canonical-placement-unavailable',
      'A current genuine qualified garment owner is required.',
    );
  const { snapshot, collisionInput, seamPairs, pinnedWaistVertexIndices } = current;
  if (
    collisionInput.garmentPositionsM.length !== 580 * 3 ||
    collisionInput.garmentTriangles.length !== 912 * 3 ||
    seamPairs.length !== 34 * 2 ||
    pinnedWaistVertexIndices.length !== 82 ||
    snapshot.bindings.garmentMappedPositionsSha256 !== GARMENT_POSITIONS_SHA ||
    snapshot.bindings.garmentTopologySha256 !== GARMENT_TOPOLOGY_SHA ||
    collisionInput.garmentUniformScale !== 1 ||
    collisionInput.garmentTranslationM.some((value) => value !== 0)
  )
    fail(
      'canonical-source-mismatch',
      'Qualified garment/AO content differs from the fixed two-panel path.',
    );
  if (
    expected &&
    (snapshot.seal.canonicalSha256 !== expected.snapshot.seal.canonicalSha256 ||
      collisionInput.binding.compositionGeneration !==
        expected.collisionInput.binding.compositionGeneration ||
      JSON.stringify(snapshot.bindings) !== JSON.stringify(expected.snapshot.bindings) ||
      !sameArray(collisionInput.garmentPositionsM, expected.collisionInput.garmentPositionsM) ||
      !sameArray(collisionInput.garmentTriangles, expected.collisionInput.garmentTriangles) ||
      !sameArray(seamPairs, expected.seamPairs) ||
      !sameArray(pinnedWaistVertexIndices, expected.pinnedWaistVertexIndices))
  )
    fail('stale-owner', 'Qualified garment/AO owner changed during placement.');
  return current;
}

function canonicalSource(
  request: BetaSkirtPersonalizedDisplayedBodyProductPlacementRequestV2,
): GarmentSource {
  const canonical = canonicalCurrent(request.canonicalPlacementOwner);
  if (request.compositionGeneration !== canonical.collisionInput.binding.compositionGeneration)
    fail(
      'composition-generation-mismatch',
      'Composition generation must equal the genuine retained garment source generation.',
    );
  const bindings = canonical.snapshot.bindings;
  const assertCurrent = () => {
    canonicalCurrent(request.canonicalPlacementOwner, canonical);
  };
  return {
    kind: 'canonical',
    positions: canonical.collisionInput.garmentPositionsM,
    triangles: canonical.collisionInput.garmentTriangles,
    seams: canonical.seamPairs,
    pins: canonical.pinnedWaistVertexIndices,
    authoredFrame: canonical.snapshot.authoredFrame,
    garmentBinding: {
      mappedPositionsSha256: bindings.garmentMappedPositionsSha256,
      normalizedTopologySha256: bindings.garmentTopologySha256,
      restPositionsSha256: bindings.garmentRestPositionsSha256,
      materialFramesSha256: bindings.garmentMaterialFramesSha256,
      assemblyOrderSeamsSha256: bindings.garmentSeamsSha256,
      waistPinsSha256: bindings.garmentPinsSha256,
    },
    canonicalPlacementSha256: canonical.snapshot.seal.canonicalSha256,
    annularBinding: null,
    lifetime: null,
    assertCurrent,
    fresh: async () => assertCurrent(),
    disposeCopies: () => {
      canonical.seamPairs.fill(0);
      canonical.pinnedWaistVertexIndices.fill(0);
      canonical.positionsInvMass.fill(0);
      canonical.collisionInput.bodyPositionsM.fill(0);
      canonical.collisionInput.bodyTriangles.fill(0);
      canonical.collisionInput.garmentPositionsM.fill(0);
      canonical.collisionInput.garmentTriangles.fill(0);
    },
  };
}
function equalBuffer(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  return a.byteLength === b.byteLength && left.every((value, index) => value === right[index]);
}
function requireAnnularProjection(
  projection: SavedAnnularProjection,
  expected?: SavedAnnularProjection,
): void {
  const { report, mapping, normalizedMaterial: material } = projection;
  const self = report.selfOrientation;
  const normalized = report.normalizedMaterial;
  if (
    report.decision !== 'garment-local-material-qualified' ||
    report.mappingFrame !== 'garment-local-waist-origin' ||
    report.mappingSpec.waistCenterM.some((value) => value !== 0) ||
    report.claims.genuineSavedLocalFrameBound !== true ||
    report.claims.exactD0BoundaryRolesValidated !== true ||
    report.claims.waistPinsFromExplicitRolesOnly !== true ||
    report.claims.kernelPinsUsedForEqualityCheckOnly !== true ||
    report.claims.bodyIndependentMapping !== true ||
    report.claims.bodyTargetConsumed !== false ||
    !material ||
    !normalized ||
    !mapping.sourceSelfOrientationNoOpQualified ||
    normalized.claims.normalizedTopologySolverMaterialCompatibilityEstablished !== true ||
    mapping.positions3M.length !== 580 * 3 ||
    mapping.normalizedTriangles.length !== 912 * 3 ||
    mapping.seamPairs.length !== 34 * 2 ||
    mapping.pinnedWaistVertexIndices.length !== 82 ||
    new Set(mapping.pinnedWaistVertexIndices).size !== 82 ||
    self.counts.seamPairCount !== 34 ||
    self.counts.pinnedWaistVertexCount !== 82 ||
    mapping.reportCanonicalSha256 !== self.seal.canonicalSha256 ||
    material.reportCanonicalSha256 !== normalized.seal.canonicalSha256 ||
    material.normalizedV5.seal.aggregateSha256 !==
      normalized.bindings.normalizedV5AggregateSha256 ||
    normalized.bindings.selfOrientationReportSha256 !== self.seal.canonicalSha256 ||
    self.bindings.composerV2CanonicalSha256 !== report.bindings.composerV2CanonicalSha256 ||
    self.bindings.composerV3CanonicalSha256 !== report.bindings.composerV3CanonicalSha256 ||
    normalized.bindings.composerV3CanonicalSha256 !== report.bindings.composerV3CanonicalSha256 ||
    !sameArray(mapping.normalizedTriangles, material.normalizedTriangles) ||
    !sameArray(mapping.seamPairs, material.seamPairs) ||
    !sameArray(mapping.pinnedWaistVertexIndices, material.pinnedWaistVertexIndices) ||
    material.initialPhysicalPositionsInvMassKg.length !== 580 * 4 ||
    mapping.positions3M.some(
      (value, index) =>
        !Object.is(
          value,
          material.initialPhysicalPositionsInvMassKg[Math.floor(index / 3) * 4 + (index % 3)],
        ),
    )
  )
    fail(
      'saved-garment-source-mismatch',
      'A genuine qualified local garment with exact 580/912 geometry, 34 AO seams and 82 semantic pins is required.',
    );
  if (
    expected &&
    (report.canonicalSha256 !== expected.report.canonicalSha256 ||
      !sameArray(mapping.positions3M, expected.mapping.positions3M) ||
      !sameArray(mapping.normalizedTriangles, expected.mapping.normalizedTriangles) ||
      !sameArray(mapping.seamPairs, expected.mapping.seamPairs) ||
      !sameArray(mapping.pinnedWaistVertexIndices, expected.mapping.pinnedWaistVertexIndices) ||
      !equalBuffer(
        material.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
        expected.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain
          .triangleRestFrames,
      ))
  )
    fail('stale-owner', 'Saved local garment, AO or immutable continuum rest state changed.');
}
async function savedAnnularSource(
  request: SavedAnnularRequest,
  kind: 'saved-annular' | 'saved-annular-observed',
  signal?: AbortSignal,
): Promise<GarmentSource> {
  // Fixed private dispatch only. No caller-shaped source adapter can enter either registry.
  const owner =
    'savedAnnularGarmentOwner' in request
      ? request.savedAnnularGarmentOwner
      : request.savedAnnularObservedPlacementGarmentOwner;
  const getLifetime =
    kind === 'saved-annular'
      ? getPatternImportDxfProductSavedAnnularGarmentLifetimeV1
      : getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1;
  const projectGarment: (owner: unknown) => Promise<SavedAnnularProjection | null> =
    kind === 'saved-annular'
      ? projectPatternImportDxfProductSavedAnnularGarmentV1
      : projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1;
  const lifetime = getLifetime(owner);
  const bodyLifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(
    request.displayedBodyOwner,
    request.displayedBodyBinding,
  );
  if (!lifetime)
    fail('saved-garment-unavailable', 'A current genuine saved annular garment owner is required.');
  if (!bodyLifetime)
    fail('displayed-body-unavailable', 'A current genuine observed body binding is required.');
  const assertCurrent = () => {
    signalCheck(signal);
    signalCheck(lifetime);
    if (getLifetime(owner) !== lifetime)
      fail('stale-owner', 'The saved garment source lifetime was revoked.');
  };
  const initialCurrent = () => {
    assertCurrent();
    if (
      getSavedModelDisplayedTriangleBodyLifetimeV2(
        request.displayedBodyOwner,
        request.displayedBodyBinding,
      ) !== bodyLifetime
    )
      fail('stale-owner', 'Observed body changed while reading the saved garment.');
  };
  initialCurrent();
  const projection = await waitForBorrowedRead(() => projectGarment(owner), signal);
  initialCurrent();
  if (!projection)
    fail(
      'saved-garment-unavailable',
      kind === 'saved-annular'
        ? 'Fresh persisted Placement V2 and saved garment projection failed.'
        : 'Fresh persisted Placement V3 and observed garment projection failed.',
    );
  requireAnnularProjection(projection);
  const material = projection.normalizedMaterial!;
  const report = projection.report;
  const normalized = report.normalizedMaterial!;
  const observedTarget =
    kind === 'saved-annular-observed'
      ? freeze(
          clone(
            (report as PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1)
              .persistedPlacement.authoring.observedTarget,
          ),
        )
      : undefined;
  if (
    kind === 'saved-annular-observed' &&
    (!observedTarget || !SHA.test(observedTarget.canonicalSha256))
  )
    fail('observed-target-unavailable', 'A genuine fresh V3 garment target is required.');
  const restFramesHash = await hash(
    new Uint8Array(material.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames),
  );
  initialCurrent();
  const spec = report.mappingSpec;
  const axialSlope = Math.sqrt(1 - (spec.sectorSpanRadPerPiece / Math.PI) ** 2);
  const axialLength = (axialSlope * (spec.hemSlantRadiusMm - spec.waistSlantRadiusMm)) / 1_000;
  if (!Number.isFinite(axialLength) || axialLength <= 0)
    fail('saved-garment-source-mismatch', 'Authored annular axial length is invalid.');
  return {
    kind,
    ...(observedTarget ? { observedTarget } : {}),
    positions: projection.mapping.positions3M,
    triangles: projection.mapping.normalizedTriangles,
    seams: projection.mapping.seamPairs,
    pins: projection.mapping.pinnedWaistVertexIndices,
    authoredFrame: {
      waistCenterM: [0, 0, 0],
      authoredAxialLengthM: axialLength,
    },
    garmentBinding: {
      mappedPositionsSha256: report.selfOrientation.bindings.initialPositions3MSha256,
      normalizedTopologySha256: report.selfOrientation.bindings.normalizedTopologySha256,
      materialFramesSha256: normalized.bindings.sourceTriangleMaterialFramesSha256,
      assemblyOrderSeamsSha256: normalized.bindings.seamPairsSha256,
      waistPinsSha256: normalized.bindings.pinnedWaistVertexIndicesSha256,
      restState: {
        kind: 'sealed-normalized-v5-continuum-rest-frames',
        normalizedV5AggregateSha256: normalized.bindings.normalizedV5AggregateSha256,
        continuumRestFramesBytesSha256: restFramesHash,
      },
    },
    canonicalPlacementSha256: null,
    annularBinding: {
      kind:
        kind === 'saved-annular'
          ? 'saved-annular-garment-v1'
          : 'saved-annular-observed-placement-garment-v1',
      garmentReportSha256: report.canonicalSha256,
      composerV2CanonicalSha256: report.bindings.composerV2CanonicalSha256,
      savedLocalFrameCanonicalSha256: report.bindings.savedLocalFrameCanonicalSha256,
      composerV3CanonicalSha256: report.bindings.composerV3CanonicalSha256,
      placementSidecarSha256: report.bindings.placementSidecarSha256,
      semanticsCanonicalSha256: report.bindings.semanticsCanonicalSha256,
      selfOrientationReportSha256: report.selfOrientation.seal.canonicalSha256,
      normalizedV5ReportSha256: normalized.seal.canonicalSha256,
      normalizedV5AggregateSha256: normalized.bindings.normalizedV5AggregateSha256,
      mappedOriginM: [0, 0, 0],
      persistedTargetDisposition:
        kind === 'saved-annular' ? 'historical-unconsumed' : 'fresh-observed-target-matched',
      ...(observedTarget ? { observedTarget } : {}),
      garmentReport: report,
    } as AnnularSourceBinding | ObservedAnnularSourceBinding,
    lifetime,
    assertCurrent,
    fresh: async (readSignal) => {
      signalCheck(readSignal);
      assertCurrent();
      const next = await waitForBorrowedRead(() => projectGarment(owner), readSignal);
      assertCurrent();
      signalCheck(readSignal);
      if (!next)
        fail('saved-garment-unavailable', 'Fresh saved placement or garment source was revoked.');
      requireAnnularProjection(next, projection);
    },
    disposeCopies: () => {
      projection.mapping.positions3M.fill(0);
      projection.mapping.positionsInvMass.fill(0);
      projection.mapping.normalizedTriangles.fill(0);
      projection.mapping.seamPairs.fill(0);
      projection.mapping.pinnedWaistVertexIndices.fill(0);
      material.initialPhysicalPositionsInvMassKg.fill(0);
      material.mappedPositionsPinMask.fill(0);
      material.normalizedTriangles.fill(0);
      material.seamPairs.fill(0);
      material.pinnedWaistVertexIndices.fill(0);
    },
  };
}

function qualifiedPose(body: SavedModelDisplayedTriangleBodySnapshotV2): void {
  if (
    body.binding.displayedIdentity.basisKind !== 'female' ||
    !modelOpenReferenceDirectPoseGeometryEqualV9(
      body.displayedPose,
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    ) ||
    !modelOpenReferenceDirectPoseGeometryEqualV9(body.poseDocument.pose, body.displayedPose)
  )
    fail(
      'pose-not-qualified',
      'This pair path requires the actual accepted female V9 neutral pose.',
    );
}
/** Cancellation belongs to this pair/read, never to a borrowed source owner. The underlying
 * fresh read remains observed and runs only under its own source lifetime. */
async function waitForBorrowedRead<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signalCheck(signal);
  if (!signal) return read();
  let cancel: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => reject(new Failure('cancelled', 'Observed-body placement read was cancelled.'));
    EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, {
      once: true,
    });
  });
  try {
    const value = await Promise.race([read(), cancelled]);
    signalCheck(signal);
    return value;
  } finally {
    EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
  }
}

async function currentBody(
  request: PairRequest,
  binding: SavedModelDisplayedTriangleBodyBindingV2,
  source: GarmentSource,
  signal?: AbortSignal,
) {
  signalCheck(signal);
  source.assertCurrent();
  if (source.kind !== 'canonical') {
    if (!getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding))
      fail('stale-owner', 'Observed body lifetime was revoked before garment read.');
    await source.fresh(signal);
    source.assertCurrent();
    signalCheck(signal);
    if (!getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding))
      fail('stale-owner', 'Observed body lifetime was revoked during garment read.');
  }
  const result = await waitForBorrowedRead(
    () => projectSavedModelDisplayedTriangleBodyV2(request.displayedBodyOwner, binding),
    signal,
  );
  signalCheck(signal);
  source.assertCurrent();
  if (
    source.kind !== 'canonical' &&
    !getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding)
  )
    fail('stale-owner', 'Observed body lifetime was revoked after the fresh model read.');
  if (result.status !== 'projected')
    fail(
      'displayed-body-unavailable',
      result.status === 'blocked'
        ? result.code + ': ' + result.detail
        : 'Body projection did not complete.',
    );
  qualifiedPose(result.snapshot);
  if (source.kind === 'saved-annular-observed') {
    const target = await waitForBorrowedRead(
      () => projectSavedModelObservedPlacementTargetV1(request.displayedBodyOwner, binding),
      signal,
    );
    source.assertCurrent();
    signalCheck(signal);
    if (!getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding))
      fail('stale-owner', 'Observed body was revoked while matching the persisted target.');
    signalCheck(signal);
    const expected = source.observedTarget;
    if (
      !target.ok ||
      !expected ||
      target.canonicalSha256 !== expected.canonicalSha256 ||
      savedModelObservedPlacementTargetCodecInternalsV1.canonical(target.target) !==
        savedModelObservedPlacementTargetCodecInternalsV1.canonical(expected.target)
    )
      fail(
        'observed-target-mismatch',
        'The freshly persisted V3 target does not exactly match the current genuine observed body.',
      );
  }
  return result.snapshot;
}
/** Run in the caller continuation after awaiting a helper, including immediately before publish.
 * The helper's own final check cannot cover microtasks between its resolution and this caller. */
function assertSourcesCurrent(
  request: PairRequest,
  binding: SavedModelDisplayedTriangleBodyBindingV2,
  source: GarmentSource,
  lifetime: AbortSignal,
  bodyLifetime: AbortSignal,
  signal?: AbortSignal,
): void {
  signalCheck(signal);
  signalCheck(lifetime);
  if (
    getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding) !==
    bodyLifetime
  )
    fail('stale-owner', 'The observed body generation or current accepted source was revoked.');
  source.assertCurrent();
  signalCheck(signal);
  signalCheck(lifetime);
}
async function hash(bytes: Uint8Array): Promise<string> {
  const result = await sha256Hex(bytes);
  if (!SHA.test(result)) fail('sha256-unavailable', 'Native SHA-256 is unavailable.');
  return result;
}
function bytes(values: Float32Array | Uint32Array): Uint8Array {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  for (let i = 0; i < values.length; i++) {
    if (values instanceof Float32Array) view.setFloat32(i * 4, values[i], true);
    else view.setUint32(i * 4, values[i], true);
  }
  return result;
}
function worldFrame(
  body: SavedModelDisplayedTriangleBodySnapshotV2,
  waist: Vec3,
  hip: Vec3,
): BetaSkirtPersonalizedDisplayedBodyWorldFrameV2 {
  const measure = (nominal: Vec3) => {
    const seed: Vec3 = [0, nominal[1], nominal[2]];
    // Existing body section loop selection only; it supplies no DXF seam/role authority.
    const result = measureMeshPlaneSectionPerimetersV1({
      positionsM: body.bodyPositionsM,
      triangleIndices: body.bodyTriangles,
      planeOriginM: seed,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: seed },
    });
    if (!result.ok || !result.selectedLoop)
      fail(
        'body-frame-unavailable',
        'Accepted body has no selected torso section at the existing nominal station.',
      );
    return {
      nominalStationOriginM: nominal,
      bodySectionCenterM: [
        result.selectedLoop.centroidM[0],
        nominal[1],
        result.selectedLoop.centroidM[2],
      ] as Vec3,
      bodySectionPerimeterM: result.selectedLoop.perimeterM,
      bodySectionPointCount: result.selectedLoop.pointsM.length,
    };
  };
  const result = {
    coordinateSystem: {
      handedness: 'right',
      origin: 'ground-projection-between-ankles',
      lateralAxis: [1, 0, 0],
      verticalAxis: [0, 1, 0],
      anteriorAxis: [0, 0, 1],
    },
    waist: measure(waist),
    hip: measure(hip),
  } as const;
  if (
    result.waist.bodySectionCenterM[1] <= result.hip.bodySectionCenterM[1] ||
    result.waist.bodySectionPerimeterM <= 0 ||
    result.hip.bodySectionPerimeterM <= 0
  )
    fail('body-frame-unavailable', 'Waist/hip section order or perimeter is invalid.');
  return freeze(result);
}
function destroy(record: RecordV2): boolean {
  if (record.disposed) return false;
  record.disposed = true;
  owners.delete(record.owner);
  record.lifetime.abort();
  record.cleanup();
  record.input.bodyPositionsM.fill(0);
  record.input.bodyTriangles.fill(0);
  record.input.garmentPositionsM.fill(0);
  record.input.garmentTriangles.fill(0);
  record.source.disposeCopies();
  return true;
}

/** Uses exact accepted body bytes and existing diagnostics. It never issues solver admission. */
async function buildPair(
  value: unknown,
  kind: SourceKind,
  signal?: AbortSignal,
): Promise<PairResult> {
  let cleanup: () => void = () => undefined;
  let published = false;
  let input: BetaSkirtRenderedBodyCollisionDiagnosticInputV2 | null = null;
  let source: GarmentSource | null = null;
  try {
    signalCheck(signal);
    const request = captureRequest(value, kind);
    source =
      kind === 'canonical'
        ? canonicalSource(request as BetaSkirtPersonalizedDisplayedBodyProductPlacementRequestV2)
        : await savedAnnularSource(request as SavedAnnularRequest, kind, signal);
    source.assertCurrent();
    const garment = source;
    const generation =
      'compositionGeneration' in request
        ? request.compositionGeneration
        : request.hostCompileGeneration;
    let body = await currentBody(request, request.displayedBodyBinding, garment, signal);
    const binding = body.binding;
    const bodyLifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(
      request.displayedBodyOwner,
      binding,
    );
    if (!bodyLifetime) fail('stale-owner', 'Observed body lifetime was revoked.');
    const lifetime = new AbortController();
    let record: RecordV2 | null = null;
    const cancel = () => {
      lifetime.abort();
      if (record) destroy(record);
    };
    const sources = [
      bodyLifetime,
      ...(garment.lifetime ? [garment.lifetime] : []),
      ...(signal ? [signal] : []),
    ];
    for (const source of sources)
      EventTarget.prototype.addEventListener.call(source, 'abort', cancel, {
        once: true,
      });
    cleanup = () => {
      for (const source of sources)
        EventTarget.prototype.removeEventListener.call(source, 'abort', cancel);
    };
    const currentSync = () =>
      assertSourcesCurrent(request, binding, garment, lifetime.signal, bodyLifetime, signal);
    const fresh = async () => {
      signalCheck(signal);
      signalCheck(lifetime.signal);
      body = await currentBody(request, binding, garment, lifetime.signal);
      signalCheck(signal);
      signalCheck(lifetime.signal);
      if (
        getSavedModelDisplayedTriangleBodyLifetimeV2(request.displayedBodyOwner, binding) !==
        bodyLifetime
      )
        fail('stale-owner', 'Observed body owner generation changed.');
    };
    await fresh();
    currentSync();
    const [basis, bundle] = await Promise.all([
      loadMakeHumanOpenReferenceBasisV1('female'),
      loadMakeHumanTorsoShapeDeltaBundleV1(),
    ]);
    await fresh();
    currentSync();
    // These existing modes supply nominal station metadata only. Their reference mesh is never
    // used as the displayed/collision body; both section and collision operate on adopted bytes.
    const modes = createMakeHumanUniformWaistHipModesV1({
      basis,
      bundle,
      heightMm: body.canonicalMeasurements.heightMm,
    });
    const waist = modes.modes.find((mode) => mode.measurementKey === 'waistCircumferenceMm');
    const hip = modes.modes.find((mode) => mode.measurementKey === 'hipCircumferenceMm');
    if (!waist || !hip || modes.basisKind !== 'female')
      fail('body-frame-unavailable', 'Female nominal waist/hip stations are unavailable.');
    const frame = worldFrame(body, waist.stationOriginM, hip.stationOriginM);
    const sourceWaist = garment.authoredFrame.waistCenterM;
    const target = frame.waist.bodySectionCenterM;
    const translation: Vec3 = [
      target[0] - sourceWaist[0],
      target[1] - sourceWaist[1],
      target[2] - sourceWaist[2],
    ];
    const positions = new Float32Array(garment.positions.length);
    let residual = 0;
    for (let i = 0; i < positions.length; i++) {
      const source = garment.positions[i];
      positions[i] = Math.fround(source + translation[i % 3]);
      residual = Math.max(residual, Math.abs(positions[i] - source - translation[i % 3]));
    }
    const [positionsHash, trianglesHash, seamsHash, pinsHash] = await Promise.all([
      hash(bytes(positions)),
      hash(bytes(garment.triangles)),
      hash(bytes(garment.seams)),
      hash(bytes(garment.pins)),
    ]);
    await fresh();
    currentSync();
    input = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1({
      binding: {
        compositionGeneration: generation,
        snapshotGeneration: binding.generation,
        modelId: binding.displayedIdentity.modelId,
        modelContentRevision: binding.displayedIdentity.modelContentRevision,
        inputFingerprint: binding.displayedIdentity.inputFingerprint,
        canonicalContentFingerprint: binding.canonicalContentFingerprint,
        basisKind: binding.displayedIdentity.basisKind,
        posePresetId: 'accepted-direct-pose/v9;sha256=' + binding.poseDocumentSha256,
        bodySourceRevision:
          'saved-model-host-observed-body/v2;sha256=' + binding.observedBodyContentSha256,
        garmentPositionsSha256: positionsHash,
      },
      bodyPositionsM: body.bodyPositionsM,
      bodyTriangles: body.bodyTriangles,
      garmentPositionsM: positions,
      garmentTriangles: garment.triangles,
      garmentUniformScale: 1,
      garmentTranslationM: [0, 0, 0],
    });
    const section = evaluateGarmentBodySectionCompatibilityPreflightV1({
      schemaVersion: GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
      bodyPositionsM: input.bodyPositionsM,
      bodyTriangles: input.bodyTriangles,
      garmentPositionsM: input.garmentPositionsM,
      garmentTriangles: input.garmentTriangles,
      verticalAxisOriginM: target,
      garmentWaistYM: target[1],
      garmentHemYM: target[1] - garment.authoredFrame.authoredAxialLengthM,
      policy: {
        sectionCount: 33,
        requiredRadialClearanceM: 0.01,
        maximumCircumferentialStretchDelta: 0.01,
      },
    });
    let collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV2 | null = null;
    let collisionSha: string | null = null;
    let collisionFailure: DiagnosticFailure | null = null;
    let signed: BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 | null = null;
    let signedFailure: DiagnosticFailure | null = null;
    try {
      collision = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(input);
    } catch (error) {
      collisionFailure = diagnosticFailure(error);
    }
    await fresh();
    currentSync();
    if (collision) {
      try {
        collisionSha =
          await computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42(collision);
      } catch (error) {
        collisionFailure = diagnosticFailure(error);
      }
      await fresh();
      currentSync();
      if (collisionSha) {
        try {
          signed = await refreshBetaSkirtRenderedBodySignedVertexContactsV42({
            extractionRound: 0,
            collisionInput: input,
            terminalCollisionReport: collision,
            terminalReceiptBinding: {
              collisionInputSha256: collision.contentFingerprintSha256,
              terminalCollisionReportSha256: collisionSha,
              collisionPolicyContentSha256:
                BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2.policyContentSha256,
            },
          });
        } catch (error) {
          signedFailure = diagnosticFailure(error);
        }
        await fresh();
        currentSync();
      }
    }
    const blockers: string[] = [];
    if (!section.ok || section.status !== 'compatible-with-authored-clearance')
      blockers.push('section-authored-clearance-not-met');
    if (
      !collision ||
      collisionFailure ||
      collision.intersections.bodySelfIntersectionCount !== 0 ||
      collision.intersections.bodyGarmentTriangleIntersectionCount !== 0 ||
      collision.clearance.penetratingVertexCount !== 0 ||
      collision.clearance.unsafeVertexCount !== 0 ||
      collision.clearance.ambiguousSignVertexCount !== 0
    )
      blockers.push('body-contact-clearance-not-met');
    if (!collision || collision.intersections.garmentSelfIntersectionCount !== 0)
      blockers.push('garment-self-contact-requires-seam-aware-admission');
    if (!signed) blockers.push('signed-refresh-v42-not-issued');
    else if (signed.contacts.length !== 0) blockers.push('signed-body-contact-set-not-empty');
    if (kind === 'saved-annular') blockers.push('unconfirmed-observed-body-target');
    blockers.push('solver-source-admission-not-issued');
    const payload = {
      version:
        kind === 'canonical'
          ? BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2
          : kind === 'saved-annular'
            ? BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1
            : BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
      status:
        blockers.length === 1
          ? ('diagnostic-placement-clear' as const)
          : ('diagnostic-placement-blocked' as const),
      ...(kind === 'canonical'
        ? { compositionGeneration: generation }
        : {
            hostCompileBinding: {
              generation,
              provenance: 'host-compile-session-supplied' as const,
              authenticatedByGarmentOwner: false as const,
            },
          }),
      bodyBinding: binding,
      poseDocument: body.poseDocument,
      displayedPose: body.displayedPose,
      ...(kind === 'canonical'
        ? { canonicalPlacementSha256: garment.canonicalPlacementSha256 }
        : { source: garment.annularBinding }),
      sourceGarment: garment.garmentBinding,
      candidate: {
        garmentPositionsFloat32LeSha256: positionsHash,
        garmentTrianglesUint32LeSha256: trianglesHash,
        assemblyOrderSeamsUint32LeSha256: seamsHash,
        waistPinsUint32LeSha256: pinsHash,
        translationM: translation,
        uniformScale: 1 as const,
        maximumFloat32TranslationResidualM: residual,
      },
      worldFrame: frame,
      sectionCompatibility: section,
      collisionReport: collision,
      collisionReportSha256: collisionSha,
      collisionFailure,
      signedRefresh: signed,
      signedRefreshFailure: signedFailure,
      blockers,
      claims:
        kind === 'canonical'
          ? CLAIMS
          : kind === 'saved-annular'
            ? ANNULAR_CLAIMS
            : OBSERVED_ANNULAR_CLAIMS,
    };
    const reportSha256 = await hash(
      new TextEncoder().encode(JSON.stringify([payload.version, payload])),
    );
    await fresh();
    currentSync();
    const report = freeze(clone({ ...payload, reportSha256 })) as PairReport;
    const owner = Object.freeze({
      version: payload.version,
    }) as PairOwner;
    record = {
      owner,
      request: { ...request, displayedBodyBinding: binding },
      source: garment,
      bodyBinding: binding,
      report,
      input,
      lifetime,
      bodyLifetime,
      cleanup,
      disposed: false,
    };
    owners.set(owner, record);
    published = true;
    return Object.freeze({
      ok: true,
      owner,
      report: freeze(clone(report)),
    }) as PairResult;
  } catch (error) {
    return failure(error);
  } finally {
    if (!published) {
      cleanup();
      source?.disposeCopies();
      input?.bodyPositionsM.fill(0);
      input?.bodyTriangles.fill(0);
      input?.garmentPositionsM.fill(0);
      input?.garmentTriangles.fill(0);
    }
  }
}

/** A historical report is insufficient: recheck fresh saved row and both private source owners. */
async function projectPair(
  owner: unknown,
  kind: SourceKind,
  signal?: AbortSignal,
): Promise<PairProjection | null> {
  const record = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!record || record.disposed || record.source.kind !== kind) return null;
  try {
    signalCheck(signal);
    signalCheck(record.lifetime.signal);
    await currentBody(record.request, record.bodyBinding, record.source, signal);
    assertSourcesCurrent(
      record.request,
      record.bodyBinding,
      record.source,
      record.lifetime.signal,
      record.bodyLifetime,
      signal,
    );
    signalCheck(signal);
    signalCheck(record.lifetime.signal);
    if (record.disposed) return null;
    return Object.freeze({
      report: freeze(clone(record.report)),
      collisionInput: snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(record.input),
      assemblyOrderSeamPairs: record.source.seams.slice(),
      waistPinVertexIndices: record.source.pins.slice(),
      callerOwnedMutableCopies: true,
      claims: record.report.claims,
    }) as PairProjection;
  } catch {
    destroy(record);
    return null;
  }
}
function getPairLifetime(owner: unknown, kind: SourceKind): AbortSignal | null {
  const record = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!record || record.disposed || record.source.kind !== kind) return null;
  try {
    record.source.assertCurrent();
    if (
      !getSavedModelDisplayedTriangleBodyLifetimeV2(
        record.request.displayedBodyOwner,
        record.bodyBinding,
      )
    ) {
      destroy(record);
      return null;
    }
    if (
      kind === 'saved-annular-observed' &&
      (record.disposed || aborted.call(record.lifetime.signal))
    )
      return null;
    return record.lifetime.signal;
  } catch {
    destroy(record);
    return null;
  }
}
function disposePair(owner: unknown, kind: SourceKind): boolean {
  const record = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  return record?.source.kind === kind ? destroy(record) : false;
}

// Fixed public entry points. Private source adapters are never accepted from callers.
export function buildBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2> {
  return buildPair(
    value,
    'canonical',
    signal,
  ) as Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2>;
}
export function projectBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2 | null> {
  return projectPair(
    owner,
    'canonical',
    signal,
  ) as Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementProjectionV2 | null>;
}
export function getBetaSkirtPersonalizedDisplayedBodyProductPlacementLifetimeV2(
  owner: unknown,
): AbortSignal | null {
  return getPairLifetime(owner, 'canonical');
}
export function disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
  owner: unknown,
): boolean {
  return disposePair(owner, 'canonical');
}
export function buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1> {
  return buildPair(
    value,
    'saved-annular',
    signal,
  ) as Promise<BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1>;
}
export function projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1 | null> {
  return projectPair(
    owner,
    'saved-annular',
    signal,
  ) as Promise<BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1 | null>;
}
export function getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  return getPairLifetime(owner, 'saved-annular');
}
export function disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(
  owner: unknown,
): boolean {
  return disposePair(owner, 'saved-annular');
}

export function buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1> {
  return buildPair(
    value,
    'saved-annular-observed',
    signal,
  ) as Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1>;
}
export function projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1 | null> {
  return projectPair(
    owner,
    'saved-annular-observed',
    signal,
  ) as Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1 | null>;
}
export function getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  return getPairLifetime(owner, 'saved-annular-observed');
}
export function disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
  owner: unknown,
): boolean {
  return disposePair(owner, 'saved-annular-observed');
}
