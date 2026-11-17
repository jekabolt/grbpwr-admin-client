import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticBindingV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1 =
  'beta-skirt-rendered-body-collision-worker/1' as const;

export interface BetaSkirtRenderedBodyCollisionWorkerRequestV1 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1;
  readonly type: 'evaluate';
  readonly jobId: string;
  readonly input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
}

export interface BetaSkirtRenderedBodyCollisionWorkerSuccessV1 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1;
  readonly type: 'success';
  readonly jobId: string;
  readonly report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
}

export interface BetaSkirtRenderedBodyCollisionWorkerFailureV1 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1;
  readonly type: 'failure';
  readonly jobId: string;
  readonly code:
    | BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV1
    | 'invalid-request'
    | 'unexpected-failure';
  readonly message: string;
}

export type BetaSkirtRenderedBodyCollisionWorkerResponseV1 =
  | BetaSkirtRenderedBodyCollisionWorkerSuccessV1
  | BetaSkirtRenderedBodyCollisionWorkerFailureV1;

const SHA256 = /^[0-9a-f]{64}$/u;
const REQUEST_KEYS = Object.freeze(['version', 'type', 'jobId', 'input'] as const);
const RESPONSE_SUCCESS_KEYS = Object.freeze(['version', 'type', 'jobId', 'report'] as const);
const RESPONSE_FAILURE_KEYS = Object.freeze([
  'version',
  'type',
  'jobId',
  'code',
  'message',
] as const);
const REPORT_KEYS = Object.freeze([
  'version',
  'status',
  'binding',
  'contentFingerprintSha256',
  'coordinateFrame',
  'topology',
  'intersections',
  'clearance',
  'limits',
  'usage',
  'blockers',
  'claims',
] as const);
const BINDING_KEYS = Object.freeze([
  'compositionGeneration',
  'snapshotGeneration',
  'modelId',
  'modelContentRevision',
  'inputFingerprint',
  'canonicalContentFingerprint',
  'basisKind',
  'posePresetId',
  'bodySourceRevision',
  'garmentPositionsSha256',
] as const);
const TOPOLOGY_KEYS = Object.freeze([
  'bodyClosedTwoManifold',
  'bodySingleComponent',
  'bodyConsistentEdgeWinding',
  'bodyDegenerateTriangleCount',
  'bodyDuplicateTriangleCount',
  'bodyBoundaryOrNonManifoldEdgeCount',
  'bodyInconsistentWindingEdgeCount',
  'bodyNonManifoldVertexCount',
  'bodyConnectedComponentCount',
  'bodySignedVolumeM3',
] as const);
const INTERSECTION_KEYS = Object.freeze([
  'bodySelfIntersectionCount',
  'garmentSelfIntersectionCount',
  'bodyGarmentTriangleIntersectionCount',
] as const);
const CLEARANCE_KEYS = Object.freeze([
  'minimumUnsignedClearanceM',
  'belowUnsignedMarginVertexCount',
  'minimumSignedClearanceM',
  'penetratingVertexCount',
  'unsafeVertexCount',
  'ambiguousSignVertexCount',
  'unsafeClearanceMarginM',
] as const);
const LIMIT_KEYS = Object.freeze(
  Object.keys(BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1),
);
const USAGE_KEYS = Object.freeze([
  'inputByteLength',
  'bodyVertexCount',
  'bodyTriangleCount',
  'garmentVertexCount',
  'garmentTriangleCount',
  'bvhNodeCount',
  'distanceBvhNodeVisitCount',
  'distanceTriangleTestCount',
  'rayBvhNodeVisitCount',
  'rayTriangleTestCount',
  'broadPhaseGridCellCount',
  'broadPhaseCellReferenceCount',
  'broadPhaseCellPairVisitCount',
  'broadPhaseCandidatePairCount',
  'broadPhaseTestedPairCount',
  'wallTimeMs',
] as const);
const CLAIM_KEYS = Object.freeze([
  'exactRenderedPairMeasured',
  'analyticalCapsulesUsed',
  'signedClassificationDefensible',
  'initializationAdmitted',
  'fitClaimed',
  'runtimeAuthorityClaimed',
  'productionAuthorityClaimed',
] as const);
const BLOCKERS = new Set([
  'input-invalid',
  'budget-exhausted',
  'sha256-unavailable',
  'body-topology-not-closed',
  'body-topology-winding-inconsistent',
  'body-topology-nonmanifold-vertex',
  'body-topology-not-single-component',
  'body-degenerate-triangle',
  'body-duplicate-triangle',
  'body-self-intersection',
  'body-garment-triangle-intersection',
  'ambiguous-sign',
]);

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be a record.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain record.`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.some((expected) => expected === key))
  )
    throw new TypeError(`${label} has an unsupported shape.`);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      throw new TypeError(`${label}.${key} must be an enumerable data property.`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function ownDataProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    !descriptor ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  )
    return undefined;
  return descriptor.value;
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024)
    throw new TypeError(`${label} must be a bounded string.`);
  return value;
}

function sameBinding(
  actual: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['binding'],
  expected: BetaSkirtRenderedBodyCollisionDiagnosticInputV1['binding'],
): boolean {
  return (
    actual.compositionGeneration === expected.compositionGeneration &&
    actual.snapshotGeneration === expected.snapshotGeneration &&
    actual.modelId === expected.modelId &&
    actual.modelContentRevision === expected.modelContentRevision &&
    actual.inputFingerprint === expected.inputFingerprint &&
    actual.canonicalContentFingerprint === expected.canonicalContentFingerprint &&
    actual.basisKind === expected.basisKind &&
    actual.posePresetId === expected.posePresetId &&
    actual.bodySourceRevision === expected.bodySourceRevision &&
    actual.garmentPositionsSha256 === expected.garmentPositionsSha256
  );
}

export function snapshotBetaSkirtRenderedBodyCollisionWorkerRequestV1(
  value: unknown,
): BetaSkirtRenderedBodyCollisionWorkerRequestV1 {
  const data = exactRecord(value, REQUEST_KEYS, 'collision worker request');
  if (
    data.version !== BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1 ||
    data.type !== 'evaluate'
  )
    throw new TypeError('Collision worker request version or type is invalid.');
  const input = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(
    data.input as BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  );
  return Object.freeze({
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
    type: 'evaluate' as const,
    jobId: boundedString(data.jobId, 'collision worker jobId'),
    input,
  });
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  return value as number;
}

function nonnegativeIntegerOrNull(value: unknown, label: string): number | null {
  return value === null ? null : nonnegativeInteger(value, label);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${label} must be finite.`);
  return value;
}

function finiteOrNull(value: unknown, label: string): number | null {
  return value === null ? null : finite(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
  return value;
}

function snapshotBlockers(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError('Collision report blockers must be an exact array.');
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.some((key, index) => key !== (index < value.length ? String(index) : 'length'))
  )
    throw new TypeError('Collision report blockers have an unsupported shape.');
  const blockers: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      typeof descriptor.value !== 'string' ||
      !BLOCKERS.has(descriptor.value)
    )
      throw new TypeError('Collision report blockers contain invalid evidence.');
    blockers.push(descriptor.value);
  }
  if (new Set(blockers).size !== blockers.length)
    throw new TypeError('Collision report blockers must be unique.');
  return Object.freeze(blockers);
}

function hasBlocker(blockers: readonly string[], blocker: string): boolean {
  return blockers.some((value) => value === blocker);
}

export function snapshotBetaSkirtRenderedBodyCollisionWorkerResponseV1(
  value: unknown,
  request: BetaSkirtRenderedBodyCollisionWorkerRequestV1,
): BetaSkirtRenderedBodyCollisionWorkerResponseV1 {
  const responseType = ownDataProperty(value, 'type');
  const data = exactRecord(
    value,
    responseType === 'success' ? RESPONSE_SUCCESS_KEYS : RESPONSE_FAILURE_KEYS,
    'collision worker response',
  );
  if (
    data.version !== BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1 ||
    data.jobId !== request.jobId
  )
    throw new TypeError('Collision worker response is stale or version-mismatched.');
  if (data.type === 'failure') {
    const code = boundedString(data.code, 'collision worker failure code');
    if (
      ![
        'input-invalid',
        'budget-exhausted',
        'sha256-unavailable',
        'invalid-request',
        'unexpected-failure',
      ].includes(code)
    )
      throw new TypeError('Collision worker failure code is invalid.');
    return Object.freeze({
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
      type: 'failure' as const,
      jobId: request.jobId,
      code: code as BetaSkirtRenderedBodyCollisionWorkerFailureV1['code'],
      message: boundedString(data.message, 'collision worker failure message'),
    });
  }
  if (data.type !== 'success') throw new TypeError('Collision worker response type is invalid.');
  const report = exactRecord(data.report, REPORT_KEYS, 'collision diagnostic report');
  const binding = exactRecord(report.binding, BINDING_KEYS, 'collision diagnostic binding');
  const topology = exactRecord(report.topology, TOPOLOGY_KEYS, 'collision diagnostic topology');
  const intersections = exactRecord(
    report.intersections,
    INTERSECTION_KEYS,
    'collision diagnostic intersections',
  );
  const clearance = exactRecord(report.clearance, CLEARANCE_KEYS, 'collision diagnostic clearance');
  const limits = exactRecord(report.limits, LIMIT_KEYS, 'collision diagnostic limits');
  const usage = exactRecord(report.usage, USAGE_KEYS, 'collision diagnostic usage');
  const claims = exactRecord(report.claims, CLAIM_KEYS, 'collision diagnostic claims');
  const blockers = snapshotBlockers(report.blockers);
  if (
    report.version !== BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1 ||
    (report.status !== 'signed-clearance-measured' &&
      report.status !== 'signed-clearance-blocked') ||
    report.coordinateFrame !== 'rendered-world-meters' ||
    typeof report.contentFingerprintSha256 !== 'string' ||
    !SHA256.test(report.contentFingerprintSha256) ||
    !sameBinding(
      binding as unknown as BetaSkirtRenderedBodyCollisionDiagnosticBindingV1,
      request.input.binding,
    )
  )
    throw new TypeError('Collision worker report failed its exact-pair boundary.');

  for (const key of LIMIT_KEYS) {
    const expected =
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1[
        key as keyof typeof BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1
      ];
    if (limits[key] !== expected)
      throw new TypeError(`Collision worker report limit ${key} drifted.`);
  }

  const bodyVertexCount = nonnegativeInteger(usage.bodyVertexCount, 'bodyVertexCount');
  const bodyTriangleCount = nonnegativeInteger(usage.bodyTriangleCount, 'bodyTriangleCount');
  const garmentVertexCount = nonnegativeInteger(usage.garmentVertexCount, 'garmentVertexCount');
  const garmentTriangleCount = nonnegativeInteger(
    usage.garmentTriangleCount,
    'garmentTriangleCount',
  );
  const inputByteLength = nonnegativeInteger(usage.inputByteLength, 'inputByteLength');
  const bvhNodeCount = nonnegativeInteger(usage.bvhNodeCount, 'bvhNodeCount');
  const distanceBvhNodeVisitCount = nonnegativeInteger(
    usage.distanceBvhNodeVisitCount,
    'distanceBvhNodeVisitCount',
  );
  const distanceTriangleTestCount = nonnegativeInteger(
    usage.distanceTriangleTestCount,
    'distanceTriangleTestCount',
  );
  const rayBvhNodeVisitCount = nonnegativeInteger(
    usage.rayBvhNodeVisitCount,
    'rayBvhNodeVisitCount',
  );
  const rayTriangleTestCount = nonnegativeInteger(
    usage.rayTriangleTestCount,
    'rayTriangleTestCount',
  );
  const broadPhaseGridCellCount = nonnegativeIntegerOrNull(
    usage.broadPhaseGridCellCount,
    'broadPhaseGridCellCount',
  );
  const broadPhaseCellReferenceCount = nonnegativeIntegerOrNull(
    usage.broadPhaseCellReferenceCount,
    'broadPhaseCellReferenceCount',
  );
  const broadPhaseCellPairVisitCount = nonnegativeIntegerOrNull(
    usage.broadPhaseCellPairVisitCount,
    'broadPhaseCellPairVisitCount',
  );
  const broadPhaseCandidatePairCount = nonnegativeIntegerOrNull(
    usage.broadPhaseCandidatePairCount,
    'broadPhaseCandidatePairCount',
  );
  const broadPhaseTestedPairCount = nonnegativeIntegerOrNull(
    usage.broadPhaseTestedPairCount,
    'broadPhaseTestedPairCount',
  );
  const wallTimeMs = finite(usage.wallTimeMs, 'wallTimeMs');
  const expectedInputBytes =
    request.input.bodyPositionsM.byteLength +
    request.input.bodyTriangles.byteLength +
    request.input.garmentPositionsM.byteLength +
    request.input.garmentTriangles.byteLength;
  if (
    bodyVertexCount !== request.input.bodyPositionsM.length / 3 ||
    bodyTriangleCount !== request.input.bodyTriangles.length / 3 ||
    garmentVertexCount !== request.input.garmentPositionsM.length / 3 ||
    garmentTriangleCount !== request.input.garmentTriangles.length / 3 ||
    inputByteLength !== expectedInputBytes ||
    bvhNodeCount < 1 ||
    distanceTriangleTestCount >
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1.maxDistanceTriangleTests ||
    rayTriangleTestCount >
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1.maxRayTriangleTests ||
    wallTimeMs < 0
  )
    throw new TypeError('Collision worker report usage failed its bounded boundary.');
  const broadPhaseCounts = [
    broadPhaseGridCellCount,
    broadPhaseCellReferenceCount,
    broadPhaseCellPairVisitCount,
    broadPhaseCandidatePairCount,
    broadPhaseTestedPairCount,
  ];
  if (
    broadPhaseCounts.some((count) => count === null) &&
    broadPhaseCounts.some((count) => count !== null)
  )
    throw new TypeError('Collision worker broad-phase evidence is partial.');
  if (
    broadPhaseCandidatePairCount !== null &&
    broadPhaseTestedPairCount !== null &&
    broadPhaseTestedPairCount > broadPhaseCandidatePairCount
  )
    throw new TypeError('Collision worker broad-phase pair accounting drifted.');

  const bodyClosedTwoManifold = boolean(topology.bodyClosedTwoManifold, 'bodyClosedTwoManifold');
  const bodySingleComponent = boolean(topology.bodySingleComponent, 'bodySingleComponent');
  const bodyConsistentEdgeWinding = boolean(
    topology.bodyConsistentEdgeWinding,
    'bodyConsistentEdgeWinding',
  );
  const bodyDegenerateTriangleCount = nonnegativeInteger(
    topology.bodyDegenerateTriangleCount,
    'bodyDegenerateTriangleCount',
  );
  const bodyDuplicateTriangleCount = nonnegativeInteger(
    topology.bodyDuplicateTriangleCount,
    'bodyDuplicateTriangleCount',
  );
  const bodyBoundaryOrNonManifoldEdgeCount = nonnegativeInteger(
    topology.bodyBoundaryOrNonManifoldEdgeCount,
    'bodyBoundaryOrNonManifoldEdgeCount',
  );
  const bodyInconsistentWindingEdgeCount = nonnegativeInteger(
    topology.bodyInconsistentWindingEdgeCount,
    'bodyInconsistentWindingEdgeCount',
  );
  const bodyNonManifoldVertexCount = nonnegativeInteger(
    topology.bodyNonManifoldVertexCount,
    'bodyNonManifoldVertexCount',
  );
  const bodyConnectedComponentCount = nonnegativeInteger(
    topology.bodyConnectedComponentCount,
    'bodyConnectedComponentCount',
  );
  const bodySignedVolumeM3 = finite(topology.bodySignedVolumeM3, 'bodySignedVolumeM3');
  if (
    bodyClosedTwoManifold !== (bodyBoundaryOrNonManifoldEdgeCount === 0) ||
    bodySingleComponent !== (bodyConnectedComponentCount === 1) ||
    bodyConsistentEdgeWinding !== (bodyInconsistentWindingEdgeCount === 0) ||
    bodyConnectedComponentCount < 1 ||
    bodyDegenerateTriangleCount > bodyTriangleCount ||
    bodyDuplicateTriangleCount > bodyTriangleCount ||
    bodyNonManifoldVertexCount > bodyVertexCount
  )
    throw new TypeError('Collision worker topology evidence is inconsistent.');

  const bodySelfIntersectionCount = nonnegativeIntegerOrNull(
    intersections.bodySelfIntersectionCount,
    'bodySelfIntersectionCount',
  );
  const garmentSelfIntersectionCount = nonnegativeIntegerOrNull(
    intersections.garmentSelfIntersectionCount,
    'garmentSelfIntersectionCount',
  );
  const bodyGarmentTriangleIntersectionCount = nonnegativeIntegerOrNull(
    intersections.bodyGarmentTriangleIntersectionCount,
    'bodyGarmentTriangleIntersectionCount',
  );
  if (
    (bodySelfIntersectionCount ?? 0) > 0 !== hasBlocker(blockers, 'body-self-intersection') ||
    (bodyGarmentTriangleIntersectionCount ?? 0) > 0 !==
      hasBlocker(blockers, 'body-garment-triangle-intersection')
  )
    throw new TypeError('Collision worker intersection blockers drifted.');

  const minimumUnsignedClearanceM = finite(
    clearance.minimumUnsignedClearanceM,
    'minimumUnsignedClearanceM',
  );
  const belowUnsignedMarginVertexCount = nonnegativeInteger(
    clearance.belowUnsignedMarginVertexCount,
    'belowUnsignedMarginVertexCount',
  );
  const minimumSignedClearanceM = finiteOrNull(
    clearance.minimumSignedClearanceM,
    'minimumSignedClearanceM',
  );
  const penetratingVertexCount = nonnegativeIntegerOrNull(
    clearance.penetratingVertexCount,
    'penetratingVertexCount',
  );
  const unsafeVertexCount = nonnegativeIntegerOrNull(
    clearance.unsafeVertexCount,
    'unsafeVertexCount',
  );
  const ambiguousSignVertexCount = nonnegativeIntegerOrNull(
    clearance.ambiguousSignVertexCount,
    'ambiguousSignVertexCount',
  );
  const unsafeClearanceMarginM = finite(clearance.unsafeClearanceMarginM, 'unsafeClearanceMarginM');
  if (
    minimumUnsignedClearanceM < 0 ||
    belowUnsignedMarginVertexCount > garmentVertexCount ||
    unsafeClearanceMarginM !==
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1.unsafeClearanceMarginM
  )
    throw new TypeError('Collision worker clearance evidence is invalid.');

  const signedClassificationDefensible = boolean(
    claims.signedClassificationDefensible,
    'signedClassificationDefensible',
  );
  if (
    claims.exactRenderedPairMeasured !== true ||
    claims.analyticalCapsulesUsed !== false ||
    claims.initializationAdmitted !== false ||
    claims.fitClaimed !== false ||
    claims.runtimeAuthorityClaimed !== false ||
    claims.productionAuthorityClaimed !== false
  )
    throw new TypeError('Collision worker report published unsupported authority.');
  if (
    report.status === 'signed-clearance-blocked' &&
    (minimumSignedClearanceM !== null ||
      penetratingVertexCount !== null ||
      unsafeVertexCount !== null ||
      signedClassificationDefensible !== false ||
      (ambiguousSignVertexCount !== null && ambiguousSignVertexCount === 0))
  )
    throw new TypeError('Blocked collision report published signed authority.');
  if (
    report.status === 'signed-clearance-measured' &&
    (minimumSignedClearanceM === null ||
      penetratingVertexCount === null ||
      unsafeVertexCount === null ||
      ambiguousSignVertexCount !== 0 ||
      signedClassificationDefensible !== true ||
      penetratingVertexCount > garmentVertexCount ||
      unsafeVertexCount > garmentVertexCount ||
      unsafeVertexCount < penetratingVertexCount ||
      bodyClosedTwoManifold !== true ||
      bodySingleComponent !== true ||
      bodyConsistentEdgeWinding !== true ||
      bodyDegenerateTriangleCount !== 0 ||
      bodyDuplicateTriangleCount !== 0 ||
      bodyNonManifoldVertexCount !== 0 ||
      bodySelfIntersectionCount !== 0)
  )
    throw new TypeError('Measured collision report lacks defensible signed evidence.');

  const reportSnapshot: BetaSkirtRenderedBodyCollisionDiagnosticReportV1 = Object.freeze({
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
    status: report.status as BetaSkirtRenderedBodyCollisionDiagnosticReportV1['status'],
    binding: request.input.binding,
    contentFingerprintSha256: report.contentFingerprintSha256,
    coordinateFrame: 'rendered-world-meters' as const,
    topology: Object.freeze({
      bodyClosedTwoManifold,
      bodySingleComponent,
      bodyConsistentEdgeWinding,
      bodyDegenerateTriangleCount,
      bodyDuplicateTriangleCount,
      bodyBoundaryOrNonManifoldEdgeCount,
      bodyInconsistentWindingEdgeCount,
      bodyNonManifoldVertexCount,
      bodyConnectedComponentCount,
      bodySignedVolumeM3,
    }),
    intersections: Object.freeze({
      bodySelfIntersectionCount,
      garmentSelfIntersectionCount,
      bodyGarmentTriangleIntersectionCount,
    }),
    clearance: Object.freeze({
      minimumUnsignedClearanceM,
      belowUnsignedMarginVertexCount,
      minimumSignedClearanceM,
      penetratingVertexCount,
      unsafeVertexCount,
      ambiguousSignVertexCount,
      unsafeClearanceMarginM,
    }),
    limits: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
    usage: Object.freeze({
      inputByteLength,
      bodyVertexCount,
      bodyTriangleCount,
      garmentVertexCount,
      garmentTriangleCount,
      bvhNodeCount,
      distanceBvhNodeVisitCount,
      distanceTriangleTestCount,
      rayBvhNodeVisitCount,
      rayTriangleTestCount,
      broadPhaseGridCellCount,
      broadPhaseCellReferenceCount,
      broadPhaseCellPairVisitCount,
      broadPhaseCandidatePairCount,
      broadPhaseTestedPairCount,
      wallTimeMs,
    }),
    blockers:
      blockers as readonly BetaSkirtRenderedBodyCollisionDiagnosticReportV1['blockers'][number][],
    claims: Object.freeze({
      exactRenderedPairMeasured: true as const,
      analyticalCapsulesUsed: false as const,
      signedClassificationDefensible,
      initializationAdmitted: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
  return Object.freeze({
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
    type: 'success' as const,
    jobId: request.jobId,
    report: reportSnapshot,
  });
}
