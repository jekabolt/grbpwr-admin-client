import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceSelfIntersectionReportV1,
} from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import { decodeParticleMassGpuV1 } from 'lib/cloth/compiler/material-package';
import {
  validateSealedSimulationPackageV5V1,
  type SealedSimulationPackageV5V1,
} from 'lib/cloth/compiler/simulation-package-v5-integrity';
import {
  getPatternImportDxfProductSavedAnnularGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularGarmentV1,
  type PatternImportDxfProductSavedAnnularGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularGarmentProjectionV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import { sha256Hex } from 'lib/features/sha256';
import {
  evaluateBetaSkirtCanonicalMediumConfinedContactPairV2,
  type BetaSkirtCanonicalMediumContactPairWitnessV2,
} from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import {
  evaluateBetaSkirtCoherentEnvelopeQualityV1,
  type BetaSkirtCoherentEnvelopeQualityReportV1,
} from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1,
  projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
  type BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1,
  type BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1,
  type BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1,
} from './beta-skirt-saved-annular-displayed-body-product-placement-v1';

import {
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import { savedModelObservedPlacementTargetCodecInternalsV1 } from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
import {
  buildObservedBoundedRadialInitializationV1,
  assertObservedBoundedRadialInitializationPolicyV1,
  isObservedBoundedRadialInitializationPolicyV1,
  type ObservedBoundedRadialInitializationReportV1,
} from 'lib/cloth/domain/observed-bounded-radial-initialization-v1';

export const BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1 =
  'beta-skirt-saved-annular-displayed-body-world-initial-preflight/1' as const;

export const BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1 =
  'beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight/1' as const;

const VERTICES = 580;
const TRIANGLES = 912;
const SEAMS = 34;
const PINS = 82;
const MAX_RAW_INTERSECTIONS = 2_048;
// Same bounded oracle policy as the existing temporal confined self/orientation gate.
const SELF_POLICY = Object.freeze({
  ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  maxVertices: VERTICES,
  maxTriangles: TRIANGLES,
  maxInputBytes: 128 * 1024,
  maxGridCells: 100_000,
  maxCellReferences: 500_000,
  maxCellPairVisits: 2_000_000,
  maxCandidatePairs: 500_000,
});
const CLAIMS = Object.freeze({
  genuineGarmentAndObservedPairBound: true,
  immutableLocalV5RetainedSeparately: true,
  worldXyzFromExactPairOnly: true,
  physicalInverseMassFromNormalizedV5: true,
  legacyPinMaskUsedAsPhysicalMass: false,
  sourceAuthority: false,
  initializationAuthority: false,
  runtimeAuthority: false,
  collisionAuthority: false,
  observedBodyTargetConfirmed: false,
  hostCompileGenerationAuthenticatedByGarment: false,
  viewportAuthorityAuthenticated: false,
  solverExecuted: false,
  physicalStressOrPaComputed: false,
} as const);
type FailureEvidence = Readonly<{ code: string; detail: string }>;
export type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightRequestV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
  savedAnnularGarmentOwner: PatternImportDxfProductSavedAnnularGarmentOwnerV1;
  observedPairOwner: BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1;
  expected: Readonly<{ garmentReportSha256: string; pairReportSha256: string }>;
}>;
type SelfEvidence = Readonly<{
  oracle: MeasurementSurfaceSelfIntersectionReportV1 | null;
  witnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
  excludedConfinedAuthenticatedAoSeamCount: number;
  residualBlockingCount: number;
  exactRawExcludedResidualAccounting: boolean;
  maximumRawIntersectionCount: typeof MAX_RAW_INTERSECTIONS;
  witnessFailure: FailureEvidence | null;
  passed: boolean;
}>;
export type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
  status: 'diagnostic-preflight-blocked';
  worldInitialChecksPassed: boolean;
  bindings: Readonly<{
    garmentReportSha256: string;
    pairReportSha256: string;
    normalizedV5AggregateSha256: string;
    localPositionsFloat32LeSha256: string;
    localPhysicalPositionsInvMassKgFloat32LeSha256: string;
    continuumRestFramesBytesSha256: string;
    worldPositionsFloat32LeSha256: string;
    worldPhysicalPositionsInvMassKgFloat32LeSha256: string;
    normalizedTopologyUint32LeSha256: string;
    assemblyOrderSeamsUint32LeSha256: string;
    waistPinsUint32LeSha256: string;
  }>;
  /** Historical diagnostics and host metadata, never a durable observed-target confirmation. */
  upstreamPair: BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1;
  counts: Readonly<{
    vertices: 580;
    triangles: 912;
    assemblyOrderSeamPairs: 34;
    zeroInverseMassPins: 82;
    positiveInverseMassParticles: 498;
  }>;
  physicalState: Readonly<{
    units: 'm-kg-s';
    inverseMassSource: 'normalized-v5-particle-mass-records';
    positiveZeroPinWords: true;
    minimumPositiveInverseMassKgInv: number;
    maximumPositiveInverseMassKgInv: number;
    maximumWorldSeamGapM: number;
    localPackageSealValidated: true;
    localRestAndMaterialUnchanged: true;
  }>;
  rigidPlacement: Readonly<{
    localWaistOriginM: readonly [0, 0, 0];
    translationM: readonly [number, number, number];
    uniformScale: 1;
    float32TranslationReplayedByteExactly: true;
  }>;
  selfIntersection: SelfEvidence;
  envelope: BetaSkirtCoherentEnvelopeQualityReportV1 | null;
  envelopeFailure: FailureEvidence | null;
  orientation: Readonly<{
    comparison: 'qualified-local-f32-facet-vs-world-initial-f32-facet';
    normalReversalCount: number | null;
    candidateDegenerateTriangleCount: number | null;
    passed: boolean;
  }>;
  blockers: readonly string[];
  claims: typeof CLAIMS;
  reportSha256: string;
}>;
declare const preflightBrand: unique symbol;
export type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightOwnerV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
  readonly [preflightBrand]: true;
}>;
export type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightProjectionV1 = Readonly<{
  report: BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1;
  /** This remains the original garment-local package, including its original seal. */
  normalizedV5: SealedSimulationPackageV5V1;
  localPositions3M: Float32Array;
  initialWorldPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  assemblyOrderSeamPairs: Uint32Array;
  waistPinVertexIndices: Uint32Array;
  callerOwnedMutableCopies: true;
  claims: typeof CLAIMS;
}>;
export type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightOwnerV1;
      report: BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1;
    }>
  | Readonly<{ ok: false; owner: null; code: string; detail: string }>;

const OBSERVED_CLAIMS = Object.freeze({
  ...CLAIMS,
  observedBodyTargetConfirmed: true,
  persistedObservedTargetMatched: true,
} as const);
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightRequestV1 =
  Readonly<{
    schemaVersion: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
    savedAnnularObservedPlacementGarmentOwner: PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
    observedPairOwner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
    expected: Readonly<{ garmentReportSha256: string; pairReportSha256: string }>;
  }>;
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightReportV1 =
  Readonly<
    Omit<
      BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1,
      'version' | 'upstreamPair' | 'claims' | 'rigidPlacement'
    > & {
      version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
      sourceKind: 'saved-annular-observed-placement-garment-v1';
      upstreamPair: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementReportV1;
      rigidPlacement:
        | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1['rigidPlacement']
        | null;
      boundedRadialPlacement?: Readonly<{
        localWaistOriginM: readonly [0, 0, 0];
        translationM: readonly [number, number, number];
        float32RecipeReplayedByteExactly: true;
        recipe: ObservedBoundedRadialInitializationReportV1;
      }>;
      claims: typeof OBSERVED_CLAIMS;
    }
  >;
declare const observedPreflightBrand: unique symbol;
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightOwnerV1 =
  Readonly<{
    version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1;
    readonly [observedPreflightBrand]: true;
  }>;
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightProjectionV1 =
  Readonly<
    Omit<
      BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightProjectionV1,
      'report' | 'claims'
    > & {
      report: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightReportV1;
      claims: typeof OBSERVED_CLAIMS;
    }
  >;
export type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightOwnerV1;
      report: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightReportV1;
    }>
  | Readonly<{ ok: false; owner: null; code: string; detail: string }>;

type Kind = 'legacy' | 'observed';
type Request =
  | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightRequestV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightRequestV1;
type Owner =
  | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightOwnerV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightOwnerV1;
type Report =
  | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightReportV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightReportV1;
type Projection =
  | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightProjectionV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightProjectionV1;
type Result =
  | BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightResultV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1;
type Sources = {
  garment:
    | PatternImportDxfProductSavedAnnularGarmentProjectionV1
    | PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
  pair:
    | BetaSkirtSavedAnnularDisplayedBodyProductPlacementProjectionV1
    | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1;
};
/** Fixed private dispatch: these adapters are never accepted from or exported to callers. */
function sourceApi(kind: Kind): {
  version: Request['schemaVersion'];
  garmentKey: 'savedAnnularGarmentOwner' | 'savedAnnularObservedPlacementGarmentOwner';
  garmentKind: Sources['pair']['report']['source']['kind'];
  garmentLifetime: (owner: unknown) => AbortSignal | null;
  pairLifetime: (owner: unknown) => AbortSignal | null;
  projectGarment: (owner: unknown) => Promise<Sources['garment'] | null>;
  projectPair: (owner: unknown) => Promise<Sources['pair'] | null>;
} {
  return kind === 'legacy'
    ? {
        version: BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
        garmentKey: 'savedAnnularGarmentOwner',
        garmentKind: 'saved-annular-garment-v1',
        garmentLifetime: getPatternImportDxfProductSavedAnnularGarmentLifetimeV1,
        pairLifetime: getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1,
        projectGarment: projectPatternImportDxfProductSavedAnnularGarmentV1,
        projectPair: projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
      }
    : {
        version:
          BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
        garmentKey: 'savedAnnularObservedPlacementGarmentOwner',
        garmentKind: 'saved-annular-observed-placement-garment-v1',
        garmentLifetime: getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1,
        pairLifetime:
          getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
        projectGarment: projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
        projectPair: projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
      };
}
function garmentOwner(request: Request): unknown {
  return 'savedAnnularGarmentOwner' in request
    ? request.savedAnnularGarmentOwner
    : request.savedAnnularObservedPlacementGarmentOwner;
}
type Retained = {
  sources: Sources;
  worldPhysical: Float32Array;
  bindings: Report['bindings'];
  physical: Report['physicalState'];
  boundedInitialization: ObservedBoundedRadialInitializationReportV1 | null;
};
type Work = {
  kind: Kind;
  request: Request;
  controller: AbortController;
  garmentLifetime: AbortSignal;
  pairLifetime: AbortSignal;
  unlink: () => void;
  owner: Owner;
  retained: Retained | null;
  report: Report | null;
  disposed: boolean;
};
const owners = new WeakMap<object, Work>();
const clone = globalThis.structuredClone.bind(globalThis);
const addEvent = EventTarget.prototype.addEventListener;
const removeEvent = EventTarget.prototype.removeEventListener;
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const SHA = /^[a-f0-9]{64}$/;
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
function aborted(signal: AbortSignal): boolean {
  try {
    return signalAborted.call(signal) as boolean;
  } catch {
    return fail('invalid-input', 'A genuine AbortSignal is required.');
  }
}
function evidence(error: unknown): FailureEvidence {
  return Object.freeze({
    code: error instanceof Failure ? error.code : 'evaluation-failed',
    detail: error instanceof Error ? error.message.slice(0, 2_048) : 'Preflight failed closed.',
  });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object') fail('invalid-input', 'A plain record is required.');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('invalid-input', 'Foreign prototype.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', 'Unexpected request fields.');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !('value' in d))
      fail('invalid-input', 'Accessors are not accepted.');
    result[key] = d.value;
  }
  return result;
}
function parse(value: unknown, kind: Kind): Request {
  const api = sourceApi(kind);
  const input = exactRecord(value, [
    'schemaVersion',
    api.garmentKey,
    'observedPairOwner',
    'expected',
  ]);
  const expected = exactRecord(input.expected, ['garmentReportSha256', 'pairReportSha256']);
  if (
    input.schemaVersion !== api.version ||
    Object.values(expected).some((hash) => typeof hash !== 'string' || !SHA.test(hash))
  )
    fail('invalid-input', 'Preflight version or expected report digest is invalid.');
  return Object.freeze({ ...input, expected: Object.freeze(expected) }) as Request;
}
function current(work: Work): void {
  if (work.disposed || aborted(work.controller.signal))
    fail('cancelled', 'Preflight lifetime ended.');
  if (
    aborted(work.garmentLifetime) ||
    aborted(work.pairLifetime) ||
    sourceApi(work.kind).garmentLifetime(garmentOwner(work.request)) !== work.garmentLifetime ||
    sourceApi(work.kind).pairLifetime(work.request.observedPairOwner) !== work.pairLifetime
  )
    fail('source-owner-unavailable', 'A borrowed garment or observed-pair lifetime changed.');
  // Parent projectors poll the host observation reader. It can synchronously cancel this child
  // while both borrowed sources remain live, so own lifetime must be checked after that callout.
  if (work.disposed || aborted(work.controller.signal))
    fail('cancelled', 'Preflight lifetime ended during source currentness observation.');
  if (aborted(work.garmentLifetime) || aborted(work.pairLifetime))
    fail('source-owner-unavailable', 'A borrowed source ended during currentness observation.');
}
/** Caller cancellation ends only this wait; it never reaches a borrowed owner's projector. */
function waitForBorrowed<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      removeEvent.call(signal, 'abort', aborted);
      reject(new Failure('cancelled', 'Preflight read was cancelled.'));
    };
    addEvent.call(signal, 'abort', aborted, { once: true });
    // Attach both handlers even when already aborted: late borrowed failures remain observed.
    read.then(
      (value) => {
        removeEvent.call(signal, 'abort', aborted);
        resolve(value);
      },
      (error: unknown) => {
        removeEvent.call(signal, 'abort', aborted);
        reject(error);
      },
    );
    if (signalAborted.call(signal)) aborted();
  });
}
async function fresh(work: Work): Promise<Sources> {
  current(work);
  const garment = await waitForBorrowed(
    sourceApi(work.kind).projectGarment(garmentOwner(work.request)),
    work.controller.signal,
  );
  current(work);
  const pair = await waitForBorrowed(
    sourceApi(work.kind).projectPair(work.request.observedPairOwner),
    work.controller.signal,
  );
  current(work);
  if (!garment || !pair)
    fail('source-owner-unavailable', 'Fresh genuine garment and pair projections are required.');
  return { garment, pair };
}
function equalBytes(
  left: ArrayBufferView | ArrayBuffer,
  right: ArrayBufferView | ArrayBuffer,
): boolean {
  const bytes = (value: ArrayBufferView | ArrayBuffer) =>
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const a = bytes(left),
    b = bytes(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function leBytes(value: Float32Array | Uint32Array): Uint8Array {
  const bytes = new Uint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < value.length; i++) {
    if (value instanceof Float32Array) view.setFloat32(i * 4, value[i], true);
    else view.setUint32(i * 4, value[i], true);
  }
  return bytes;
}
async function hash(work: Work, bytes: Uint8Array): Promise<string> {
  const digest = await sha256Hex(bytes);
  current(work);
  if (!SHA.test(digest)) fail('sha256-unavailable', 'SHA-256 is unavailable.');
  return digest;
}
function arrayShape(
  value: unknown,
  kind: typeof Float32Array | typeof Uint32Array,
  length: number,
): void {
  if (
    !value ||
    Object.getPrototypeOf(value) !== kind.prototype ||
    !(value instanceof kind) ||
    value.length !== length
  )
    fail('binding-mismatch', 'A source binary carrier has the wrong type or length.');
  for (const n of value)
    if (!Number.isFinite(n)) fail('binding-mismatch', 'Nonfinite source coordinates.');
}
async function capture(work: Work, sources: Sources): Promise<Retained> {
  const { garment, pair } = sources;
  const { mapping, normalizedMaterial: material, report: garmentReport } = garment;
  const pairReport = pair.report;
  const normalizedReport = garmentReport.normalizedMaterial;
  if (
    !material ||
    !normalizedReport ||
    garmentReport.decision !== 'garment-local-material-qualified' ||
    garmentReport.canonicalSha256 !== work.request.expected.garmentReportSha256 ||
    pairReport.reportSha256 !== work.request.expected.pairReportSha256 ||
    pairReport.source.kind !== sourceApi(work.kind).garmentKind ||
    pairReport.source.garmentReportSha256 !== garmentReport.canonicalSha256 ||
    pairReport.source.selfOrientationReportSha256 !== mapping.reportCanonicalSha256 ||
    mapping.reportCanonicalSha256 !== garmentReport.selfOrientation.seal.canonicalSha256 ||
    !mapping.sourceSelfOrientationNoOpQualified ||
    !garmentReport.selfOrientation.orientation.qualified ||
    material.reportCanonicalSha256 !== normalizedReport.seal.canonicalSha256 ||
    pairReport.source.normalizedV5ReportSha256 !== material.reportCanonicalSha256 ||
    pairReport.source.normalizedV5AggregateSha256 !== material.normalizedV5.seal.aggregateSha256 ||
    normalizedReport.bindings.normalizedV5AggregateSha256 !==
      material.normalizedV5.seal.aggregateSha256 ||
    !normalizedReport.claims.normalizedTopologySolverMaterialCompatibilityEstablished ||
    garmentReport.mappingFrame !== 'garment-local-waist-origin' ||
    garmentReport.mappingSpec.waistCenterM.some((value) => value !== 0) ||
    pairReport.source.mappedOriginM.some((value) => value !== 0) ||
    pairReport.claims.observedBodyTargetConfirmed !== (work.kind === 'observed')
  )
    fail(
      'binding-mismatch',
      'Genuine garment, normalized material and observed-pair receipts disagree.',
    );
  if (work.kind === 'observed') {
    const observedGarment =
      garment as PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
    const observedPair =
      pair as BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementProjectionV1;
    const persisted = observedGarment.report.persistedPlacement.authoring.observedTarget;
    const source = observedPair.report.source;
    const canonical = savedModelObservedPlacementTargetCodecInternalsV1.canonical;
    if (
      source.persistedTargetDisposition !== 'fresh-observed-target-matched' ||
      observedPair.report.claims.persistedObservedTargetMatched !== true ||
      source.observedTarget.canonicalSha256 !== persisted.canonicalSha256 ||
      canonical(source.observedTarget.target) !== canonical(persisted.target) ||
      source.composerV2CanonicalSha256 !== garmentReport.bindings.composerV2CanonicalSha256 ||
      source.savedLocalFrameCanonicalSha256 !==
        garmentReport.bindings.savedLocalFrameCanonicalSha256 ||
      source.composerV3CanonicalSha256 !== garmentReport.bindings.composerV3CanonicalSha256 ||
      source.placementSidecarSha256 !== garmentReport.bindings.placementSidecarSha256 ||
      source.semanticsCanonicalSha256 !== garmentReport.bindings.semanticsCanonicalSha256
    )
      fail(
        'binding-mismatch',
        'Fresh V3 garment target, exact source context and observed pair disagree.',
      );
  }
  const world = pair.collisionInput.garmentPositionsM;
  const triangles = mapping.normalizedTriangles;
  const seams = mapping.seamPairs;
  const pins = mapping.pinnedWaistVertexIndices;
  arrayShape(mapping.positions3M, Float32Array, VERTICES * 3);
  arrayShape(world, Float32Array, VERTICES * 3);
  arrayShape(triangles, Uint32Array, TRIANGLES * 3);
  arrayShape(seams, Uint32Array, SEAMS * 2);
  arrayShape(pins, Uint32Array, PINS);
  arrayShape(material.initialPhysicalPositionsInvMassKg, Float32Array, VERTICES * 4);
  if (
    !equalBytes(triangles, pair.collisionInput.garmentTriangles) ||
    !equalBytes(triangles, material.normalizedTriangles) ||
    !equalBytes(triangles, material.normalizedV5.simulation.mesh.triangles) ||
    !equalBytes(seams, pair.assemblyOrderSeamPairs) ||
    !equalBytes(seams, material.seamPairs) ||
    !equalBytes(pins, pair.waistPinVertexIndices) ||
    !equalBytes(pins, material.pinnedWaistVertexIndices) ||
    !equalBytes(
      material.initialPhysicalPositionsInvMassKg,
      material.normalizedV5.simulation.mesh.restPositionsInvMass,
    )
  )
    fail(
      'binding-mismatch',
      'Exact topology, AO seams, pins or local physical rest carrier differs.',
    );
  const pinSet = new Set(pins);
  if (
    pinSet.size !== PINS ||
    [...pins].some((pin, i) => pin >= VERTICES || (i > 0 && pin <= pins[i - 1]))
  )
    fail('physical-state-mismatch', 'Explicit pins must be distinct ordered in-range indices.');
  const seamSet = new Set<number>();
  let maximumWorldSeamGapM = 0;
  for (let i = 0; i < seams.length; i += 2) {
    const a = seams[i],
      b = seams[i + 1];
    if (a >= VERTICES || b >= VERTICES || a === b || seamSet.has(a) || seamSet.has(b))
      fail('binding-mismatch', 'AO seams must be 34 direct unique one-to-one pairs.');
    seamSet.add(a);
    seamSet.add(b);
    maximumWorldSeamGapM = Math.max(
      maximumWorldSeamGapM,
      Math.hypot(
        world[a * 3] - world[b * 3],
        world[a * 3 + 1] - world[b * 3 + 1],
        world[a * 3 + 2] - world[b * 3 + 2],
      ),
    );
  }
  const worldPhysical = new Float32Array(VERTICES * 4);
  let minW = Infinity,
    maxW = -Infinity,
    zero = 0,
    positive = 0;
  const translation = pairReport.candidate.translationM;
  if (translation.length !== 3 || !translation.every(Number.isFinite))
    fail('binding-mismatch', 'Invalid rigid translation.');
  const boundedPolicy =
    work.kind === 'observed' &&
    isObservedBoundedRadialInitializationPolicyV1(
      garmentReport.persistedPlacement.authoring.semantics.policy,
    );
  if (boundedPolicy)
    assertObservedBoundedRadialInitializationPolicyV1(
      garmentReport.persistedPlacement.authoring.semantics.policy,
    );
  const boundedInitialization = boundedPolicy
    ? buildObservedBoundedRadialInitializationV1({
        localPositions3M: mapping.positions3M,
        garmentTriangles: triangles,
        bodyPositions3M: pair.collisionInput.bodyPositionsM,
        bodyTriangles: pair.collisionInput.bodyTriangles,
        translationM: translation,
        garmentWaistYM: translation[1],
        garmentHemYM:
          translation[1] -
          (Math.sqrt(1 - (garmentReport.mappingSpec.sectorSpanRadPerPiece / Math.PI) ** 2) *
            (garmentReport.mappingSpec.hemSlantRadiusMm -
              garmentReport.mappingSpec.waistSlantRadiusMm)) /
            1000,
        triangleRestFrames: material.normalizedV5.simulation.material.triangleRestFrames,
        acceptance: garmentReport.persistedPlacement.authoring.annular.parameters.acceptance,
      })
    : null;
  if (boundedInitialization) {
    if (
      pairReport.candidate.uniformScale !== null ||
      !('boundedRadialInitialization' in pairReport.candidate) ||
      JSON.stringify(pairReport.candidate.boundedRadialInitialization) !==
        JSON.stringify(boundedInitialization.report) ||
      JSON.stringify(pairReport.sectionCompatibility) !==
        JSON.stringify(boundedInitialization.report.candidateSection) ||
      pairReport.claims.rigidTranslationOnly !== false ||
      pairReport.claims.garmentScaleChanged !== (boundedInitialization.report.radialScale !== 1) ||
      !equalBytes(world, boundedInitialization.positions3M)
    )
      fail(
        'world-radial-replay-mismatch',
        'Confirmed bounded initialization did not replay exactly.',
      );
  } else if (
    pairReport.candidate.uniformScale !== 1 ||
    'boundedRadialInitialization' in pairReport.candidate ||
    !pairReport.claims.rigidTranslationOnly ||
    pairReport.claims.garmentScaleChanged
  )
    fail(
      'world-translation-mismatch',
      'The saved policy permits only the original rigid translation.',
    );
  for (let v = 0; v < VERTICES; v++) {
    for (let axis = 0; axis < 3; axis++) {
      const local = mapping.positions3M[v * 3 + axis];
      if (
        !Object.is(local, material.initialPhysicalPositionsInvMassKg[v * 4 + axis]) ||
        !Object.is(
          world[v * 3 + axis],
          boundedInitialization
            ? boundedInitialization.positions3M[v * 3 + axis]
            : Math.fround(local + translation[axis]),
        )
      )
        fail(
          'world-translation-mismatch',
          'World XYZ is not the exact retained Float32 rigid translation.',
        );
      worldPhysical[v * 4 + axis] = world[v * 3 + axis];
    }
    const mass = decodeParticleMassGpuV1(
      material.normalizedV5.simulation.material.particleMassRecords,
      v,
    );
    const w = material.initialPhysicalPositionsInvMassKg[v * 4 + 3];
    if (
      ![mass.massKg, mass.inverseMassKgInv].every((value) => Number.isFinite(value) && value > 0) ||
      !Object.is(w, pinSet.has(v) ? 0 : mass.inverseMassKgInv)
    )
      fail(
        'physical-state-mismatch',
        'W differs from exact positive-zero pins or V5 particle inverse mass.',
      );
    worldPhysical[v * 4 + 3] = w;
    if (pinSet.has(v)) zero++;
    else {
      positive++;
      minW = Math.min(minW, w);
      maxW = Math.max(maxW, w);
    }
  }
  if (zero !== PINS || positive !== 498)
    fail('physical-state-mismatch', 'Physical support counts differ.');
  const validated = await validateSealedSimulationPackageV5V1(material.normalizedV5);
  current(work);
  if (!validated.ok) fail('v5-package-invalid', validated.errors.join('; '));
  const localHash = await hash(work, leBytes(mapping.positions3M));
  const localPhysicalHash = await hash(work, leBytes(material.initialPhysicalPositionsInvMassKg));
  const restFramesHash = await hash(
    work,
    new Uint8Array(material.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames),
  );
  const worldHash = await hash(work, leBytes(world));
  const worldPhysicalHash = await hash(work, leBytes(worldPhysical));
  const topologyHash = await hash(work, leBytes(triangles));
  const seamsHash = await hash(work, leBytes(seams));
  const pinsHash = await hash(work, leBytes(pins));
  if (
    localHash !== normalizedReport.bindings.mappedPositions3MSha256 ||
    localHash !== pairReport.sourceGarment.mappedPositionsSha256 ||
    localPhysicalHash !== normalizedReport.bindings.initialPhysicalPositionsInvMassKgSha256 ||
    restFramesHash !== pairReport.sourceGarment.restState.continuumRestFramesBytesSha256 ||
    worldHash !== pairReport.candidate.garmentPositionsFloat32LeSha256 ||
    topologyHash !== pairReport.candidate.garmentTrianglesUint32LeSha256 ||
    topologyHash !== normalizedReport.bindings.normalizedTopologySha256 ||
    seamsHash !== pairReport.candidate.assemblyOrderSeamsUint32LeSha256 ||
    seamsHash !== normalizedReport.bindings.seamPairsSha256 ||
    pinsHash !== pairReport.candidate.waistPinsUint32LeSha256 ||
    pinsHash !== normalizedReport.bindings.pinnedWaistVertexIndicesSha256
  )
    fail('binding-mismatch', 'Raw binary digests do not match genuine source receipts.');
  return {
    sources,
    worldPhysical,
    boundedInitialization: boundedInitialization?.report ?? null,
    bindings: {
      garmentReportSha256: garmentReport.canonicalSha256,
      pairReportSha256: pairReport.reportSha256,
      normalizedV5AggregateSha256: material.normalizedV5.seal.aggregateSha256,
      localPositionsFloat32LeSha256: localHash,
      localPhysicalPositionsInvMassKgFloat32LeSha256: localPhysicalHash,
      continuumRestFramesBytesSha256: restFramesHash,
      worldPositionsFloat32LeSha256: worldHash,
      worldPhysicalPositionsInvMassKgFloat32LeSha256: worldPhysicalHash,
      normalizedTopologyUint32LeSha256: topologyHash,
      assemblyOrderSeamsUint32LeSha256: seamsHash,
      waistPinsUint32LeSha256: pinsHash,
    },
    physical: {
      units: 'm-kg-s',
      inverseMassSource: 'normalized-v5-particle-mass-records',
      positiveZeroPinWords: true,
      minimumPositiveInverseMassKgInv: minW,
      maximumPositiveInverseMassKgInv: maxW,
      maximumWorldSeamGapM,
      localPackageSealValidated: true,
      localRestAndMaterialUnchanged: true,
    },
  };
}
async function selfEvidence(work: Work, retained: Retained): Promise<SelfEvidence> {
  const { mapping } = retained.sources.garment;
  const positions = retained.sources.pair.collisionInput.garmentPositionsM;
  let oracle: MeasurementSurfaceSelfIntersectionReportV1 | null = null;
  const witnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
  let witnessFailure: FailureEvidence | null = null;
  try {
    oracle = validateMeasurementSurfaceSelfIntersectionV1(
      positions,
      mapping.normalizedTriangles,
      SELF_POLICY,
    );
    current(work);
    if (oracle.intersectionCount > MAX_RAW_INTERSECTIONS)
      fail('self-budget-exceeded', 'Raw intersection witness budget exceeded.');
    for (const pair of oracle.intersections) {
      witnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions,
          triangles: mapping.normalizedTriangles,
          seamPairs: mapping.seamPairs,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: VERTICES,
          requireCanonicalSeamCount: true,
        }),
      );
      current(work);
    }
  } catch (error) {
    current(work); // Cancellation/source drift is fatal, never converted to a geometry diagnostic.
    witnessFailure = evidence(error);
  }
  const excluded = witnesses.filter(
    (value) => value.disposition === 'excluded-confined-authenticated-ao-seam-touching',
  ).length;
  const residual = (oracle?.intersectionCount ?? 0) - excluded;
  const exact =
    !!oracle &&
    !witnessFailure &&
    witnesses.length === oracle.intersectionCount &&
    excluded + residual === oracle.intersectionCount;
  return {
    oracle,
    witnesses,
    excludedConfinedAuthenticatedAoSeamCount: excluded,
    residualBlockingCount: residual,
    exactRawExcludedResidualAccounting: exact,
    maximumRawIntersectionCount: MAX_RAW_INTERSECTIONS,
    witnessFailure,
    passed: exact && residual === 0,
  };
}
function dispose(work: Work): boolean {
  if (work.disposed) return false;
  work.disposed = true;
  owners.delete(work.owner);
  work.unlink();
  work.controller.abort();
  work.retained = null;
  work.report = null;
  return true;
}
async function recheck(work: Work, retained: Retained): Promise<void> {
  const renewed = await capture(work, await fresh(work));
  current(work);
  if (
    JSON.stringify(renewed.bindings) !== JSON.stringify(retained.bindings) ||
    JSON.stringify(renewed.boundedInitialization) !== JSON.stringify(retained.boundedInitialization)
  )
    fail('source-binding-mismatch', 'Fresh source bytes changed during preflight.');
}

async function buildPreflight(value: unknown, kind: Kind, signal?: AbortSignal): Promise<Result> {
  let work: Work | null = null;
  let published = false;
  try {
    const request = parse(value, kind);
    const api = sourceApi(kind);
    // Validate the native brand before attaching any borrowed-parent listener. Never invoke a
    // caller-defined `aborted` getter and never leave a partial registration on invalid input.
    if (signal !== undefined && aborted(signal))
      fail('cancelled', 'Caller cancelled before preflight.');
    const garmentLifetime = api.garmentLifetime(garmentOwner(request));
    const pairLifetime = api.pairLifetime(request.observedPairOwner);
    if (!garmentLifetime || !pairLifetime)
      fail('source-owner-unavailable', 'Genuine live garment and pair owners are required.');
    const owner = Object.freeze({
      version: api.version,
    }) as Owner;
    work = {
      kind,
      request,
      owner,
      garmentLifetime,
      pairLifetime,
      controller: new AbortController(),
      unlink: () => {},
      retained: null,
      report: null,
      disposed: false,
    };
    const active = work;
    const links = [garmentLifetime, pairLifetime, ...(signal ? [signal] : [])];
    const revoke = () => dispose(active);
    const attached: AbortSignal[] = [];
    work.unlink = () => {
      for (const source of attached) removeEvent.call(source, 'abort', revoke);
      attached.length = 0;
    };
    for (const source of links) {
      addEvent.call(source, 'abort', revoke, { once: true });
      attached.push(source);
    }
    if (signal !== undefined && aborted(signal)) dispose(work);
    current(work);
    const sources = await fresh(work);
    current(work);
    const retained = await capture(work, sources);
    current(work);
    const selfIntersection = await selfEvidence(work, retained);
    current(work);
    let envelope: BetaSkirtCoherentEnvelopeQualityReportV1 | null = null;
    let envelopeFailure: FailureEvidence | null = null;
    try {
      // Identity transform: the helper applies its transform to BOTH operands. Translation is
      // already independently replayed byte-for-byte above; rest/reference data is never rebuilt.
      envelope = evaluateBetaSkirtCoherentEnvelopeQualityV1({
        sourcePositionsM: sources.garment.mapping.positions3M,
        sourceTriangles: sources.garment.mapping.normalizedTriangles,
        candidatePositionsM: sources.pair.collisionInput.garmentPositionsM,
        candidateTriangles: sources.pair.collisionInput.garmentTriangles,
        transform: { uniformScale: 1, translationM: [0, 0, 0] },
        radialAxisXZ: [
          sources.pair.report.worldFrame.waist.bodySectionCenterM[0],
          sources.pair.report.worldFrame.waist.bodySectionCenterM[2],
        ],
      });
    } catch (error) {
      envelopeFailure = evidence(error);
    }
    const orientationPassed =
      !!envelope?.triangle &&
      envelope.triangle.normalReversalCount === 0 &&
      envelope.triangle.candidateDegenerateTriangleCount === 0 &&
      envelope.triangle.minimumAreaRatio > 0;
    const envelopePassed =
      !!envelope &&
      !envelopeFailure &&
      envelope.status === 'measured-structural-evidence' &&
      envelope.blockers.length === 0 &&
      envelope.topology.triangleIndexOrderPreserved &&
      envelope.topology.vertexCountPreserved &&
      envelope.topology.triangleCountPreserved &&
      envelope.edge?.candidateZeroLengthEdgeCount === 0;
    const blockers = [
      ...new Set([
        ...sources.pair.report.blockers,
        ...(!selfIntersection.passed ? ['world-self-contact-not-clear'] : []),
        ...(!orientationPassed ? ['world-initial-orientation-blocked'] : []),
        ...(!envelopePassed ? ['world-initial-envelope-blocked'] : []),
        ...(retained.physical.maximumWorldSeamGapM !== 0
          ? ['world-initial-seams-not-colocated']
          : []),
        ...(kind === 'legacy' ? ['unconfirmed-observed-body-target'] : []),
        'solver-source-admission-not-issued',
      ]),
    ];
    const payload = {
      version: api.version,
      ...(kind === 'observed'
        ? { sourceKind: 'saved-annular-observed-placement-garment-v1' as const }
        : {}),
      status: 'diagnostic-preflight-blocked' as const,
      worldInitialChecksPassed:
        (!retained.boundedInitialization || retained.boundedInitialization.passed) &&
        selfIntersection.passed &&
        orientationPassed &&
        envelopePassed &&
        retained.physical.maximumWorldSeamGapM === 0,
      bindings: retained.bindings,
      upstreamPair: sources.pair.report,
      counts: {
        vertices: 580 as const,
        triangles: 912 as const,
        assemblyOrderSeamPairs: 34 as const,
        zeroInverseMassPins: 82 as const,
        positiveInverseMassParticles: 498 as const,
      },
      physicalState: retained.physical,
      ...(retained.boundedInitialization
        ? {
            rigidPlacement: null,
            boundedRadialPlacement: {
              localWaistOriginM: [0, 0, 0] as const,
              translationM: sources.pair.report.candidate.translationM,
              float32RecipeReplayedByteExactly: true as const,
              recipe: retained.boundedInitialization,
            },
          }
        : {
            rigidPlacement: {
              localWaistOriginM: [0, 0, 0] as const,
              translationM: sources.pair.report.candidate.translationM,
              uniformScale: 1 as const,
              float32TranslationReplayedByteExactly: true as const,
            },
          }),
      selfIntersection,
      envelope,
      envelopeFailure,
      orientation: {
        comparison: 'qualified-local-f32-facet-vs-world-initial-f32-facet' as const,
        normalReversalCount: envelope?.triangle?.normalReversalCount ?? null,
        candidateDegenerateTriangleCount:
          envelope?.triangle?.candidateDegenerateTriangleCount ?? null,
        passed: orientationPassed,
      },
      blockers,
      claims: kind === 'legacy' ? CLAIMS : OBSERVED_CLAIMS,
    };
    const reportSha256 = await hash(
      work,
      new TextEncoder().encode(JSON.stringify([payload.version, payload])),
    );
    await recheck(work, retained);
    current(work);
    const report = freeze(clone({ ...payload, reportSha256 })) as Report;
    work.retained = retained;
    work.report = report;
    owners.set(owner, work);
    published = true;
    return Object.freeze({ ok: true, owner, report }) as Result;
  } catch (error) {
    return Object.freeze({ ok: false, owner: null, ...evidence(error) });
  } finally {
    if (!published && work) dispose(work);
  }
}

async function projectPreflight(
  owner: unknown,
  kind: Kind,
  signal?: AbortSignal,
): Promise<Projection | null> {
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!work?.retained || !work.report || work.kind !== kind) return null;
  // A malformed per-read signal is not authority to revoke an otherwise live child.
  try {
    if (signal !== undefined) aborted(signal);
  } catch {
    return null;
  }
  const cancel = () => dispose(work);
  if (signal) addEvent.call(signal, 'abort', cancel, { once: true });
  try {
    if (signal !== undefined && aborted(signal)) dispose(work);
    current(work);
    const retained = work.retained!;
    await recheck(work, retained);
    current(work);
    return Object.freeze({
      report: freeze(clone(work.report!)),
      normalizedV5: clone(retained.sources.garment.normalizedMaterial!.normalizedV5),
      localPositions3M: retained.sources.garment.mapping.positions3M.slice(),
      initialWorldPositionsInvMassKg: retained.worldPhysical.slice(),
      normalizedTriangles: retained.sources.garment.mapping.normalizedTriangles.slice(),
      assemblyOrderSeamPairs: retained.sources.garment.mapping.seamPairs.slice(),
      waistPinVertexIndices: retained.sources.garment.mapping.pinnedWaistVertexIndices.slice(),
      callerOwnedMutableCopies: true,
      claims: work.report!.claims,
    }) as Projection;
  } catch {
    dispose(work);
    return null;
  } finally {
    if (signal) removeEvent.call(signal, 'abort', cancel);
  }
}
function getLifetime(owner: unknown, kind: Kind): AbortSignal | null {
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!work || work.kind !== kind) return null;
  try {
    current(work);
    return work.controller.signal;
  } catch {
    dispose(work);
    return null;
  }
}
function disposePreflight(owner: unknown, kind: Kind): boolean {
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  return work && work.kind === kind ? dispose(work) : false;
}

export function buildBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightResultV1> {
  return buildPreflight(
    value,
    'legacy',
    signal,
  ) as Promise<BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightResultV1>;
}
export function projectBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightProjectionV1 | null> {
  return projectPreflight(
    owner,
    'legacy',
    signal,
  ) as Promise<BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightProjectionV1 | null>;
}
export function getBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  return getLifetime(owner, 'legacy');
}
export function disposeBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
  owner: unknown,
): boolean {
  return disposePreflight(owner, 'legacy');
}

export function buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1> {
  return buildPreflight(
    value,
    'observed',
    signal,
  ) as Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1>;
}
export function projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightProjectionV1 | null> {
  return projectPreflight(
    owner,
    'observed',
    signal,
  ) as Promise<BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightProjectionV1 | null>;
}
export function getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  return getLifetime(owner, 'observed');
}
export function disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
  owner: unknown,
): boolean {
  return disposePreflight(owner, 'observed');
}
