import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_RUNTIME_V1,
  type MakeHuman2ArmLengthProxyAppliedV1,
} from './makehuman2-pose-compatible-length-runtime-v1';
import { MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1 } from './makehuman2-pose-compatible-length-pack-v1';
import { createMakeHumanDisplayPoseResourceLoaderV1 } from './measurement-open-reference-display-pose-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import {
  createMeasurementOpenReferenceLinkedSymmetricPoseLaneDiagnosticV2,
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2,
  measurementOpenReferenceLinkedSymmetricPoseRotationsV2,
  type MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
} from './measurement-open-reference-linked-symmetric-pose-lanes-diagnostic-v2';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import {
  MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_V1,
  type MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
} from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2 =
  'measurement-open-reference-linked-symmetric-display-pose-runtime/v2' as const;

export const MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2 =
  '5000d02841564052d50ba34518c659f99ec08c7e6682591fd7f210567cc8b764' as const;

type LinkedPoseConfigurationIdV2 =
  | `relax-${(typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.relaxDegrees)[number]}`
  | `raise-${(typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.raiseDegrees)[number]}`;

export interface MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2;
  readonly validatedByDiagnosticContract: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2;
  readonly parameterRevision: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision;
  readonly configurationId: LinkedPoseConfigurationIdV2;
  readonly configurationKey: `linked-symmetric:${LinkedPoseConfigurationIdV2}`;
  readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly sourceRevision: string;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly maximumJointPivotResidualM: number;
  readonly source: {
    readonly matrixSha256: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2;
    readonly rigSha256: string;
    readonly anchorSha256: string;
    readonly poseResourcesLoaded: boolean;
  };
  readonly claims: {
    readonly displayOnly: true;
    readonly linkedSymmetryOnly: true;
    readonly discreteConfigurationsOnly: true;
    readonly oneLaneAtATimeOnly: true;
    readonly continuousIntervalSafetyClaimed: false;
    readonly combinedLaneSafetyClaimed: false;
    readonly actualRenderedGarmentPairEvaluated: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly initializationAdmitted: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly persistenceAuthority: false;
    readonly productionAuthority: false;
    readonly deploymentAuthority: false;
  };
}

const CLAIMS = Object.freeze({
  displayOnly: true as const,
  linkedSymmetryOnly: true as const,
  discreteConfigurationsOnly: true as const,
  oneLaneAtATimeOnly: true as const,
  continuousIntervalSafetyClaimed: false as const,
  combinedLaneSafetyClaimed: false as const,
  actualRenderedGarmentPairEvaluated: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  initializationAdmitted: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  persistenceAuthority: false as const,
  productionAuthority: false as const,
  deploymentAuthority: false as const,
});

const loadAuthenticatedPoseResourcesV2 = createMakeHumanDisplayPoseResourceLoaderV1();

const RUNTIME_OPTION_KEYS = Object.freeze([
  'basis',
  'measurements',
  'proxyRuntime',
  'input',
  'sourceRevision',
] as const);
const BASIS_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'sourceUnitScaleToM',
  'sourceMinimumY',
  'sourceMaximumY',
  'positionsSourceUnits',
  'indices',
] as const);
const PROXY_RUNTIME_KEYS = Object.freeze([
  'version',
  'role',
  'status',
  'openReference',
  'displayMesh',
  'requestedGeometricProxies',
  'representedGeometricProxies',
  'modeResults',
  'diagnostics',
  'qualityGate',
  'poseCompatibleArmLengthProxy',
  'claims',
] as const);
const ARM_PROXY_KEYS = Object.freeze([
  'ok',
  'runtime',
  'requestedCanonicalFieldMm',
  'achievedCenterlineProxyMm',
  'targetStatus',
  'metricScaleMPerSourceUnit',
  'representation',
  'diagnostics',
] as const);
const LENGTH_RUNTIME_KEYS = Object.freeze([
  'version',
  'role',
  'basisKind',
  'positionsSourceUnits',
  'joints',
  'modeCoefficients',
  'maximumRecomputedJointDeltaSourceUnits',
  'maximumVisibleOnlyStalePivotDriftSourceUnits',
  'qualityGate',
  'representation',
  'claims',
] as const);
const LENGTH_JOINT_KEYS = Object.freeze(['key', 'positionSourceUnits'] as const);
const LENGTH_REPRESENTATION_KEYS = Object.freeze([
  'sourceLengthModes',
  'armLengthMm',
  'inseamMm',
] as const);
const LENGTH_REPRESENTATION_ENTRY_KEYS = Object.freeze(['status', 'semantics'] as const);
const LENGTH_CLAIM_KEYS = Object.freeze([
  'researchOnly',
  'visibleAndHelperModesComposed',
  'allPackedLimbJointsRecomputed',
  'canonicalMeasurementSemanticMatchClaimed',
  'anatomicalTapePathEquivalent',
  'populationRepresentativenessClaimed',
  'realBodyValidationClaimed',
  'fitClaimEligible',
  'runtimeCollisionEligible',
  'collisionCandidateEligible',
  'productionRuntimeApproved',
] as const);
const MESH_KEYS = Object.freeze([
  'positions',
  'indices',
  'vertexCount',
  'triangleCount',
  'byteLength',
] as const);
const OPEN_REFERENCE_KEYS = Object.freeze([
  'version',
  'sourceRevision',
  'pose',
  'mesh',
  'provenance',
  'deformation',
  'claims',
] as const);
const PROVENANCE_KEYS = Object.freeze([
  'source',
  'basis',
  'role',
  'analyticalFrameRevision',
] as const);
const BASIS_METADATA_KEYS = Object.freeze([
  'kind',
  'assetPath',
  'derivedBasisSha256',
  'basisAssetRevision',
  'postprocessRevision',
  'sourceMinimumY',
  'sourceMaximumY',
  'formula',
] as const);
const DEFORMATION_KEYS = Object.freeze([
  'status',
  'representedRequiredMeasurements',
  'discardedPersonalizedCandidate',
  'personalizedCandidateEvaluated',
  'selectionReason',
  'qualityGateSubject',
  'qualityGate',
] as const);
const QUALITY_GATE_KEYS = Object.freeze([
  'version',
  'safe',
  'reasons',
  'metrics',
  'policy',
  'claims',
] as const);
const QUALITY_METRIC_KEYS = Object.freeze([
  'vertexCount',
  'triangleCount',
  'uniqueEdgeCount',
  'minimumEdgeStretch',
  'maximumEdgeStretch',
  'minimumTriangleAreaRatio',
  'maximumTriangleAreaRatio',
  'minimumTriangleAspectRetention',
  'minimumOutputTriangleAspectQuality',
  'flippedTriangleCount',
] as const);
const QUALITY_POLICY_KEYS = Object.freeze([
  'maximumVertexCount',
  'maximumTriangleCount',
  'minimumEdgeStretch',
  'maximumEdgeStretch',
  'minimumTriangleAreaRatio',
  'maximumTriangleAreaRatio',
  'minimumTriangleAspectRetention',
  'maximumFlippedTriangleCount',
] as const);
const QUALITY_CLAIM_KEYS = Object.freeze([
  'localGeometryQualityOnly',
  'selfIntersectionEvaluated',
  'anatomicalAccuracyClaimed',
  'fitClaimEligible',
  'runtimeCollisionEligible',
] as const);
const OPEN_REFERENCE_CLAIM_KEYS = Object.freeze([
  'visualReferenceOnly',
  'measurementClosureClaimed',
  'populationRepresentativenessClaimed',
  'fitClaimEligible',
  'runtimeCollisionEligible',
  'collisionCandidateEligible',
  'selfIntersection',
] as const);
const PROXY_CLAIM_KEYS = Object.freeze([
  'visualReferenceOnly',
  'geometricPlaneLoopOnly',
  'canonicalMeasurementSemanticMatchClaimed',
  'anatomicalTapePathEquivalent',
  'measurementProtocolEquivalent',
  'populationRepresentativenessClaimed',
  'fitClaimEligible',
  'runtimeCollisionEligible',
  'collisionCandidateEligible',
  'selfIntersection',
] as const);
const MODE_RESULT_KEYS = Object.freeze([
  'measurementKey',
  'direction',
  'coefficient',
  'targetMm',
  'baselineMm',
  'achievedMm',
  'residualMm',
  'crossTalkMm',
] as const);
const DIAGNOSTIC_KEYS = Object.freeze(['code', 'measurementKey', 'message'] as const);
const REQUIRED_MEASUREMENT_KEYS = Object.freeze([
  'schemaVersion',
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const);
const ALLOWED_MEASUREMENT_KEYS = Object.freeze([
  ...REQUIRED_MEASUREMENT_KEYS,
  'neckBaseCircumferenceMm',
  'underBustCircumferenceMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
  'hpsToWaistFrontMm',
  'cbNeckToWaistMm',
  'acrossFrontMm',
  'acrossBackMm',
  'hpsHeightMm',
  'cfNeckToWaistMm',
  'waistHeightMm',
  'waistToHighHipMm',
  'waistToHipMm',
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
  'shoulderLengthMm',
  'shoulderDropMm',
  'armscyeDepthMm',
  'armscyeCircumferenceMm',
  'bustApexToApexMm',
  'hpsToBustApexMm',
] as const);

function ownDataValues<T extends readonly string[]>(
  value: unknown,
  expectedKeys: T | null,
  label: string,
): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must use a plain prototype.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new RangeError(`${label} must not contain symbol fields.`);
  }
  if (
    expectedKeys != null &&
    (keys.length !== expectedKeys.length ||
      keys.some((key) => !expectedKeys.includes(key as T[number])))
  ) {
    throw new RangeError(`${label} contains missing or unknown fields.`);
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor == null || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label}.${key} must use a plain data descriptor.`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotExactArray<T>(
  value: unknown,
  label: string,
  snapshotElement: (element: unknown, index: number) => T,
): readonly T[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a plain array.`);
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  const lengthValue =
    lengthDescriptor != null && Object.hasOwn(lengthDescriptor, 'value')
      ? lengthDescriptor.value
      : undefined;
  if (!Number.isSafeInteger(lengthValue) || typeof lengthValue !== 'number' || lengthValue < 0) {
    throw new TypeError(`${label}.length must use a valid data descriptor.`);
  }
  const length = lengthValue;
  const ownKeys = Reflect.ownKeys(value);
  const expected = new Set<string>([
    'length',
    ...Array.from({ length }, (_, index) => String(index)),
  ]);
  if (
    ownKeys.length !== expected.size ||
    ownKeys.some((key) => typeof key !== 'string' || !expected.has(key))
  ) {
    throw new RangeError(`${label} must be dense and contain no extra fields.`);
  }
  const output: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor == null || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label}[${index}] must use a plain data descriptor.`);
    }
    output.push(snapshotElement(descriptor.value, index));
  }
  return Object.freeze(output);
}

function snapshotDataRecord<T extends readonly string[]>(
  value: unknown,
  keys: T,
  label: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...ownDataValues(value, keys, label) });
}

function snapshotDeepData(value: unknown, label: string): unknown {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return snapshotExactArray(value, label, (element, index) =>
      snapshotDeepData(element, `${label}[${index}]`),
    );
  }
  if (typeof value === 'object') {
    const fields = ownDataValues(value, null, label);
    return Object.freeze(
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          snapshotDeepData(field, `${label}.${key}`),
        ]),
      ),
    );
  }
  throw new TypeError(`${label} contains an unsupported value.`);
}

function snapshotMesh(value: unknown, label: string): MeasurementSurfaceMeshV1 {
  const fields = ownDataValues(value, MESH_KEYS, label);
  if (!(fields.positions instanceof Float32Array) || !(fields.indices instanceof Uint32Array)) {
    throw new TypeError(`${label} positions and indices must use the admitted TypedArrays.`);
  }
  const positions = fields.positions.slice();
  const indices = fields.indices.slice();
  return Object.freeze({
    positions,
    indices,
    vertexCount: fields.vertexCount as number,
    triangleCount: fields.triangleCount as number,
    byteLength: fields.byteLength as number,
  });
}

type QualityGate = NonNullable<
  MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['qualityGate']
>;

function snapshotQualityGate(value: unknown, label: string): QualityGate {
  const fields = ownDataValues(value, QUALITY_GATE_KEYS, label);
  return Object.freeze({
    version: fields.version as QualityGate['version'],
    safe: fields.safe as boolean,
    reasons: snapshotExactArray(fields.reasons, `${label}.reasons`, (reason) => reason as never),
    metrics: snapshotDataRecord(
      fields.metrics,
      QUALITY_METRIC_KEYS,
      `${label}.metrics`,
    ) as unknown as QualityGate['metrics'],
    policy: snapshotDataRecord(
      fields.policy,
      QUALITY_POLICY_KEYS,
      `${label}.policy`,
    ) as unknown as QualityGate['policy'],
    claims: snapshotDataRecord(
      fields.claims,
      QUALITY_CLAIM_KEYS,
      `${label}.claims`,
    ) as unknown as QualityGate['claims'],
  });
}

function snapshotArmLengthRepresentation(
  value: unknown,
  label: string,
): MakeHuman2ArmLengthProxyAppliedV1['representation'] {
  const fields = ownDataValues(value, LENGTH_REPRESENTATION_KEYS, label);
  return Object.freeze({
    sourceLengthModes: snapshotDataRecord(
      fields.sourceLengthModes,
      LENGTH_REPRESENTATION_ENTRY_KEYS,
      `${label}.sourceLengthModes`,
    ),
    armLengthMm: snapshotDataRecord(
      fields.armLengthMm,
      LENGTH_REPRESENTATION_ENTRY_KEYS,
      `${label}.armLengthMm`,
    ),
    inseamMm: snapshotDataRecord(
      fields.inseamMm,
      LENGTH_REPRESENTATION_ENTRY_KEYS,
      `${label}.inseamMm`,
    ),
  }) as MakeHuman2ArmLengthProxyAppliedV1['representation'];
}

function snapshotArmLengthProxy(value: unknown, label: string): MakeHuman2ArmLengthProxyAppliedV1 {
  const fields = ownDataValues(value, ARM_PROXY_KEYS, label);
  const runtimeFields = ownDataValues(fields.runtime, LENGTH_RUNTIME_KEYS, `${label}.runtime`);
  if (!(runtimeFields.positionsSourceUnits instanceof Float32Array)) {
    throw new TypeError(`${label}.runtime.positionsSourceUnits must use Float32Array.`);
  }
  const joints = snapshotExactArray(
    runtimeFields.joints,
    `${label}.runtime.joints`,
    (joint, index) => {
      const jointFields = ownDataValues(
        joint,
        LENGTH_JOINT_KEYS,
        `${label}.runtime.joints[${index}]`,
      );
      const position = snapshotExactArray(
        jointFields.positionSourceUnits,
        `${label}.runtime.joints[${index}].positionSourceUnits`,
        (component) => component as number,
      );
      if (
        typeof jointFields.key !== 'string' ||
        position.length !== 3 ||
        !position.every((component) => Number.isFinite(component))
      ) {
        throw new TypeError(`${label}.runtime.joints[${index}] is invalid.`);
      }
      return Object.freeze({
        key: jointFields.key,
        positionSourceUnits: Object.freeze([position[0], position[1], position[2]] as const),
      });
    },
  );
  const coefficientFields = ownDataValues(
    runtimeFields.modeCoefficients,
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1,
    `${label}.runtime.modeCoefficients`,
  );
  const modeCoefficients = Object.freeze(
    Object.fromEntries(
      MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.map((id) => {
        const coefficient = coefficientFields[id];
        if (typeof coefficient !== 'number' || !Number.isFinite(coefficient)) {
          throw new TypeError(`${label}.runtime.modeCoefficients.${id} must be finite.`);
        }
        return [id, coefficient];
      }),
    ),
  ) as MakeHuman2ArmLengthProxyAppliedV1['runtime']['modeCoefficients'];
  const representation = snapshotArmLengthRepresentation(
    fields.representation,
    `${label}.representation`,
  );
  const runtimeRepresentation = snapshotArmLengthRepresentation(
    runtimeFields.representation,
    `${label}.runtime.representation`,
  );
  const runtime = Object.freeze({
    version: runtimeFields.version,
    role: runtimeFields.role,
    basisKind: runtimeFields.basisKind,
    positionsSourceUnits: runtimeFields.positionsSourceUnits.slice(),
    joints,
    modeCoefficients,
    maximumRecomputedJointDeltaSourceUnits: runtimeFields.maximumRecomputedJointDeltaSourceUnits,
    maximumVisibleOnlyStalePivotDriftSourceUnits:
      runtimeFields.maximumVisibleOnlyStalePivotDriftSourceUnits,
    qualityGate: snapshotQualityGate(runtimeFields.qualityGate, `${label}.runtime.qualityGate`),
    representation: runtimeRepresentation,
    claims: snapshotDataRecord(runtimeFields.claims, LENGTH_CLAIM_KEYS, `${label}.runtime.claims`),
  }) as MakeHuman2ArmLengthProxyAppliedV1['runtime'];
  const diagnostics = snapshotExactArray(fields.diagnostics, `${label}.diagnostics`, (entry) => {
    if (typeof entry !== 'string')
      throw new TypeError(`${label}.diagnostics must contain strings.`);
    return entry;
  });
  return Object.freeze({
    ok: fields.ok,
    runtime,
    requestedCanonicalFieldMm: fields.requestedCanonicalFieldMm,
    achievedCenterlineProxyMm: fields.achievedCenterlineProxyMm,
    targetStatus: fields.targetStatus,
    metricScaleMPerSourceUnit: fields.metricScaleMPerSourceUnit,
    representation,
    diagnostics,
  }) as MakeHuman2ArmLengthProxyAppliedV1;
}

function snapshotOpenReference(value: unknown): MeasurementOpenReferenceDisplayArtifactV1 {
  const fields = ownDataValues(value, OPEN_REFERENCE_KEYS, 'proxyRuntime.openReference');
  const provenance = ownDataValues(
    fields.provenance,
    PROVENANCE_KEYS,
    'proxyRuntime.openReference.provenance',
  );
  const source = snapshotDeepData(
    provenance.source,
    'proxyRuntime.openReference.provenance.source',
  );
  if (JSON.stringify(source) !== JSON.stringify(MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1)) {
    throw new Error('proxyRuntime.openReference.provenance.source is not the admitted source.');
  }
  const deformation = ownDataValues(
    fields.deformation,
    DEFORMATION_KEYS,
    'proxyRuntime.openReference.deformation',
  );
  return Object.freeze({
    version: fields.version as MeasurementOpenReferenceDisplayArtifactV1['version'],
    sourceRevision: fields.sourceRevision as string,
    pose: fields.pose as MeasurementOpenReferenceDisplayArtifactV1['pose'],
    mesh: snapshotMesh(fields.mesh, 'proxyRuntime.openReference.mesh'),
    provenance: Object.freeze({
      source: MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
      basis: snapshotDataRecord(
        provenance.basis,
        BASIS_METADATA_KEYS,
        'proxyRuntime.openReference.provenance.basis',
      ) as unknown as MeasurementOpenReferenceDisplayArtifactV1['provenance']['basis'],
      role: provenance.role as MeasurementOpenReferenceDisplayArtifactV1['provenance']['role'],
      analyticalFrameRevision:
        provenance.analyticalFrameRevision as MeasurementOpenReferenceDisplayArtifactV1['provenance']['analyticalFrameRevision'],
    }),
    deformation: Object.freeze({
      status:
        deformation.status as MeasurementOpenReferenceDisplayArtifactV1['deformation']['status'],
      representedRequiredMeasurements: snapshotExactArray(
        deformation.representedRequiredMeasurements,
        'proxyRuntime.openReference.deformation.representedRequiredMeasurements',
        (measurement) => measurement as never,
      ),
      discardedPersonalizedCandidate: deformation.discardedPersonalizedCandidate as boolean,
      personalizedCandidateEvaluated: deformation.personalizedCandidateEvaluated as boolean,
      selectionReason:
        deformation.selectionReason as MeasurementOpenReferenceDisplayArtifactV1['deformation']['selectionReason'],
      qualityGateSubject:
        deformation.qualityGateSubject as MeasurementOpenReferenceDisplayArtifactV1['deformation']['qualityGateSubject'],
      qualityGate: snapshotQualityGate(
        deformation.qualityGate,
        'proxyRuntime.openReference.deformation.qualityGate',
      ),
    }),
    claims: snapshotDataRecord(
      fields.claims,
      OPEN_REFERENCE_CLAIM_KEYS,
      'proxyRuntime.openReference.claims',
    ) as unknown as MeasurementOpenReferenceDisplayArtifactV1['claims'],
  });
}

function snapshotBasis(input: MakeHumanOpenReferenceBasisV1): MakeHumanOpenReferenceBasisV1 {
  const values = ownDataValues(input, BASIS_KEYS, 'basis');
  if (
    !(values.positionsSourceUnits instanceof Float32Array) ||
    !(values.indices instanceof Uint16Array)
  ) {
    throw new TypeError('basis positions and indices must use the admitted TypedArrays.');
  }
  return Object.freeze({
    schemaVersion: values.schemaVersion as MakeHumanOpenReferenceBasisV1['schemaVersion'],
    kind: values.kind as MakeHumanOpenReferenceBasisV1['kind'],
    sourceUnitScaleToM: values.sourceUnitScaleToM as number,
    sourceMinimumY: values.sourceMinimumY as number,
    sourceMaximumY: values.sourceMaximumY as number,
    positionsSourceUnits: values.positionsSourceUnits.slice(),
    indices: values.indices.slice(),
  });
}

function snapshotMeasurements(input: CanonicalBodyMeasurementsMm): CanonicalBodyMeasurementsMm {
  const values = ownDataValues(input, null, 'measurements');
  const keys = Object.keys(values);
  if (
    REQUIRED_MEASUREMENT_KEYS.some((key) => !Object.hasOwn(values, key)) ||
    keys.some((key) => !ALLOWED_MEASUREMENT_KEYS.includes(key as never))
  ) {
    throw new RangeError('measurements contain missing or unknown fields.');
  }
  return Object.freeze({ ...values }) as unknown as CanonicalBodyMeasurementsMm;
}

function snapshotProxyRuntime(
  input: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  const values = ownDataValues(input, null, 'proxyRuntime');
  const keys = Object.keys(values);
  if (
    PROXY_RUNTIME_KEYS.some(
      (key) => key !== 'poseCompatibleArmLengthProxy' && !Object.hasOwn(values, key),
    ) ||
    keys.some((key) => !PROXY_RUNTIME_KEYS.includes(key as (typeof PROXY_RUNTIME_KEYS)[number]))
  ) {
    throw new RangeError('proxyRuntime contains missing or unknown fields.');
  }
  const snappedQualityGate =
    values.qualityGate == null
      ? null
      : snapshotQualityGate(values.qualityGate, 'proxyRuntime.qualityGate');
  const hasArmProxy = Object.hasOwn(values, 'poseCompatibleArmLengthProxy');
  const armProxy =
    hasArmProxy && values.poseCompatibleArmLengthProxy != null
      ? snapshotArmLengthProxy(
          values.poseCompatibleArmLengthProxy,
          'proxyRuntime.poseCompatibleArmLengthProxy',
        )
      : undefined;
  return Object.freeze({
    version: values.version as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['version'],
    role: values.role as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['role'],
    status: values.status as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['status'],
    openReference: snapshotOpenReference(values.openReference),
    displayMesh: snapshotMesh(values.displayMesh, 'proxyRuntime.displayMesh'),
    requestedGeometricProxies: snapshotExactArray(
      values.requestedGeometricProxies,
      'proxyRuntime.requestedGeometricProxies',
      (measurement) => measurement as never,
    ),
    representedGeometricProxies: snapshotExactArray(
      values.representedGeometricProxies,
      'proxyRuntime.representedGeometricProxies',
      (measurement) => measurement as never,
    ),
    modeResults: snapshotExactArray(
      values.modeResults,
      'proxyRuntime.modeResults',
      (modeResult, index) =>
        snapshotDataRecord(
          modeResult,
          MODE_RESULT_KEYS,
          `proxyRuntime.modeResults[${index}]`,
        ) as unknown as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['modeResults'][number],
    ),
    diagnostics: snapshotExactArray(
      values.diagnostics,
      'proxyRuntime.diagnostics',
      (diagnostic, index) =>
        snapshotDataRecord(
          diagnostic,
          DIAGNOSTIC_KEYS,
          `proxyRuntime.diagnostics[${index}]`,
        ) as unknown as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['diagnostics'][number],
    ),
    qualityGate: snappedQualityGate,
    ...(hasArmProxy ? { poseCompatibleArmLengthProxy: armProxy } : {}),
    claims: snapshotDataRecord(
      values.claims,
      PROXY_CLAIM_KEYS,
      'proxyRuntime.claims',
    ) as unknown as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['claims'],
  });
}

function snapshotRuntimeOptions(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly sourceRevision: string;
}) {
  const values = ownDataValues(options, RUNTIME_OPTION_KEYS, 'options');
  return Object.freeze({
    basis: snapshotBasis(values.basis as MakeHumanOpenReferenceBasisV1),
    measurements: snapshotMeasurements(values.measurements as CanonicalBodyMeasurementsMm),
    proxyRuntime: snapshotProxyRuntime(
      values.proxyRuntime as MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
    ),
    input: canonicalSelection(
      values.input as MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
    ),
    sourceRevision: validateSourceRevision(values.sourceRevision as string),
  });
}

function assertFiniteMesh(mesh: MeasurementSurfaceMeshV1, label: string): void {
  if (
    !(mesh.positions instanceof Float32Array) ||
    !(mesh.indices instanceof Uint32Array) ||
    !Number.isSafeInteger(mesh.vertexCount) ||
    !Number.isSafeInteger(mesh.triangleCount) ||
    mesh.vertexCount <= 0 ||
    mesh.triangleCount <= 0 ||
    mesh.positions.length !== mesh.vertexCount * 3 ||
    mesh.indices.length !== mesh.triangleCount * 3 ||
    mesh.byteLength !== mesh.positions.byteLength + mesh.indices.byteLength
  ) {
    throw new Error(`${label} schema/count binding is invalid.`);
  }
  for (const position of mesh.positions) {
    if (!Number.isFinite(position)) throw new Error(`${label} positions must be finite.`);
  }
  for (const index of mesh.indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= mesh.vertexCount) {
      throw new Error(`${label} indices are invalid.`);
    }
  }
}

function assertExactInputBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
}): void {
  const { basis, measurements, proxyRuntime } = options;
  if (basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1 || basis.kind === 'base') {
    throw new Error('Linked display pose requires an admitted display basis.');
  }
  const metadata = MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[basis.kind];
  const artifact = proxyRuntime.openReference;
  if (
    artifact.version !== MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1 ||
    proxyRuntime.version !== MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_V1 ||
    proxyRuntime.role !== 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' ||
    proxyRuntime.status === 'error' ||
    artifact.pose !== 'A' ||
    (artifact.deformation.status !== 'uniform-height' &&
      artifact.deformation.status !== 'fallback-uniform')
  ) {
    throw new Error('Linked display pose input schema/status binding is invalid.');
  }
  if (
    !Number.isFinite(basis.sourceUnitScaleToM) ||
    basis.sourceUnitScaleToM <= 0 ||
    !Number.isFinite(basis.sourceMinimumY) ||
    !Number.isFinite(basis.sourceMaximumY) ||
    basis.sourceMaximumY <= basis.sourceMinimumY ||
    basis.sourceMinimumY !== metadata.sourceMinimumY ||
    basis.sourceMaximumY !== metadata.sourceMaximumY ||
    !Number.isFinite(measurements.heightMm) ||
    measurements.heightMm <= 0
  ) {
    throw new Error('Linked display pose basis dimensions or requested height are invalid.');
  }
  const artifactMetadata = artifact.provenance.basis;
  if (
    artifactMetadata.kind !== metadata.kind ||
    artifactMetadata.derivedBasisSha256 !== metadata.derivedBasisSha256 ||
    artifactMetadata.basisAssetRevision !== metadata.basisAssetRevision ||
    artifactMetadata.postprocessRevision !== metadata.postprocessRevision ||
    artifactMetadata.sourceMinimumY !== metadata.sourceMinimumY ||
    artifactMetadata.sourceMaximumY !== metadata.sourceMaximumY
  ) {
    throw new Error('Linked display pose authenticated basis metadata binding is invalid.');
  }
  if (
    basis.positionsSourceUnits.length === 0 ||
    basis.positionsSourceUnits.length % 3 !== 0 ||
    basis.indices.length === 0 ||
    basis.indices.length % 3 !== 0
  ) {
    throw new Error('Linked display pose basis counts are invalid.');
  }
  const vertexCount = basis.positionsSourceUnits.length / 3;
  for (const position of basis.positionsSourceUnits) {
    if (!Number.isFinite(position))
      throw new Error('Linked display pose basis positions are invalid.');
  }
  for (const index of basis.indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
      throw new Error('Linked display pose basis indices are invalid.');
    }
  }
  assertFiniteMesh(artifact.mesh, 'Open-reference mesh');
  assertFiniteMesh(proxyRuntime.displayMesh, 'Waist/hip display mesh');
  if (
    artifact.mesh.vertexCount !== vertexCount ||
    proxyRuntime.displayMesh.vertexCount !== vertexCount ||
    artifact.mesh.indices.length !== basis.indices.length ||
    proxyRuntime.displayMesh.indices.length !== basis.indices.length
  ) {
    throw new Error('Linked display pose basis and shaped display mesh counts do not match.');
  }
  for (let index = 0; index < basis.indices.length; index += 1) {
    if (
      artifact.mesh.indices[index] !== basis.indices[index] ||
      proxyRuntime.displayMesh.indices[index] !== basis.indices[index]
    ) {
      throw new Error('Linked display pose basis and shaped display mesh indices do not match.');
    }
  }
  const sourceHeightM = (basis.sourceMaximumY - basis.sourceMinimumY) * basis.sourceUnitScaleToM;
  const scaleMPerSourceUnit =
    (measurements.heightMm / 1000 / sourceHeightM) * basis.sourceUnitScaleToM;
  if (!Number.isFinite(scaleMPerSourceUnit) || scaleMPerSourceUnit <= 0) {
    throw new Error('Linked display pose uniform-height scale binding is invalid.');
  }
  const armProxy = proxyRuntime.poseCompatibleArmLengthProxy;
  if (armProxy) {
    const coefficients = Object.values(armProxy.runtime.modeCoefficients);
    const jointKeys = new Set(armProxy.runtime.joints.map(({ key }) => key));
    if (
      armProxy.ok !== true ||
      armProxy.runtime.version !== MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_RUNTIME_V1 ||
      armProxy.runtime.role !== 'CC0_POSE_COMPATIBLE_LENGTH_RESEARCH_CANDIDATE' ||
      armProxy.runtime.basisKind !== basis.kind ||
      armProxy.runtime.positionsSourceUnits.length !== basis.positionsSourceUnits.length ||
      !armProxy.runtime.positionsSourceUnits.every(Number.isFinite) ||
      armProxy.runtime.joints.length !== 28 ||
      jointKeys.size !== armProxy.runtime.joints.length ||
      coefficients.length !== MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.length ||
      coefficients.some(
        (coefficient) => !Number.isFinite(coefficient) || coefficient < 0 || coefficient > 1,
      ) ||
      !armProxy.runtime.qualityGate.safe ||
      armProxy.requestedCanonicalFieldMm !== measurements.armLengthMm ||
      !Number.isFinite(armProxy.achievedCenterlineProxyMm) ||
      armProxy.achievedCenterlineProxyMm <= 0 ||
      (armProxy.targetStatus !== 'matched-proxy' && armProxy.targetStatus !== 'bounded-endpoint') ||
      Math.abs(armProxy.metricScaleMPerSourceUnit - scaleMPerSourceUnit) > 1e-12 ||
      armProxy.representation.armLengthMm.status !== 'limited' ||
      armProxy.representation.inseamMm.status !== 'unrepresented' ||
      armProxy.runtime.claims.canonicalMeasurementSemanticMatchClaimed !== false ||
      armProxy.runtime.claims.anatomicalTapePathEquivalent !== false ||
      armProxy.runtime.claims.fitClaimEligible !== false
    ) {
      throw new Error('Linked display pose arm-length proxy receipt binding is invalid.');
    }
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const expected = [
      basis.positionsSourceUnits[offset] * scaleMPerSourceUnit,
      (basis.positionsSourceUnits[offset + 1] - basis.sourceMinimumY) * scaleMPerSourceUnit,
      basis.positionsSourceUnits[offset + 2] * scaleMPerSourceUnit,
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(artifact.mesh.positions[offset + axis] - expected[axis]) > 1e-6) {
        throw new Error('Linked display pose open-reference height binding does not match.');
      }
    }
  }
  const recomputedQuality = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: artifact.mesh.positions,
    personalizedPositionsM: proxyRuntime.displayMesh.positions,
    triangleIndices: artifact.mesh.indices,
  });
  if (
    proxyRuntime.qualityGate == null ||
    JSON.stringify(recomputedQuality) !== JSON.stringify(proxyRuntime.qualityGate)
  ) {
    throw new Error('Linked display pose waist/hip display positions are not quality-bound.');
  }
}

function canonicalSelection(
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 {
  const rotations = measurementOpenReferenceLinkedSymmetricPoseRotationsV2(input);
  if (rotations.length === 0) return Object.freeze({ lane: 'relax' as const, degrees: 0 as const });
  const first = rotations[0];
  if (first.bone === 'shoulder01.L') {
    const degrees =
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.relaxDegrees.find(
        (candidate) => candidate === Math.abs(first.degrees),
      );
    if (degrees == null || degrees === 0) throw new Error('Validated relax rotation is invalid.');
    return Object.freeze({ lane: 'relax' as const, degrees });
  }
  if (first.bone === 'upperarm01.L') {
    const degrees =
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.raiseDegrees.find(
        (candidate) => candidate === Math.abs(first.degrees),
      );
    if (degrees == null) throw new Error('Validated raise rotation is invalid.');
    return Object.freeze({ lane: 'raise' as const, degrees });
  }
  throw new Error('Validated linked pose rotations have an unsupported shape.');
}

function configurationId(
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): LinkedPoseConfigurationIdV2 {
  return input.lane === 'relax' ? `relax-${input.degrees}` : `raise-${input.degrees}`;
}

function validateSourceRevision(sourceRevision: string): string {
  if (
    typeof sourceRevision !== 'string' ||
    sourceRevision.length === 0 ||
    sourceRevision.trim() !== sourceRevision
  ) {
    throw new RangeError('sourceRevision must be a non-empty trimmed string.');
  }
  return sourceRevision;
}

function boundSourceRevision(
  sourceRevision: string,
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): string {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  const id = configurationId(input);
  return `${sourceRevision};linkedDisplayPoseRuntime=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2};linkedPoseParameterRevision=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision};linkedPoseConfiguration=${id};linkedPoseMatrixSha256=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

export function linkedSymmetricDisplayPoseRuntimeSourceRevisionV2(
  sourceRevision: string,
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): string {
  return boundSourceRevision(validateSourceRevision(sourceRevision), canonicalSelection(input));
}

/**
 * Applies one matrix-admitted linked pose after the final waist/hip display mesh. This display
 * runtime does not itself own snapshots, initialize garments, create collision candidates, or
 * persist pose state. Consumer integration is deliberately outside this capability contract.
 */
export async function createMeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeV2(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly sourceRevision: string;
}): Promise<MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2> {
  const snapped = snapshotRuntimeOptions(options);
  const input = snapped.input;
  const id = configurationId(input);
  const sourceRevision = boundSourceRevision(snapped.sourceRevision, input);
  const { basis, measurements, proxyRuntime } = snapped;
  assertExactInputBinding({ basis, measurements, proxyRuntime });

  let displayMesh: MeasurementSurfaceMeshV1;
  let maximumJointPivotResidualM = 0;
  let poseResourcesLoaded = false;
  if (input.lane === 'relax' && input.degrees === 0) {
    displayMesh = snapshotMeasurementSurfaceMeshV1(proxyRuntime.displayMesh);
  } else {
    const resources = await loadAuthenticatedPoseResourcesV2();
    poseResourcesLoaded = true;
    const diagnostic = createMeasurementOpenReferenceLinkedSymmetricPoseLaneDiagnosticV2({
      basis,
      measurements,
      proxyRuntime,
      resources,
      input,
    });
    if (diagnostic.configurationId !== id) {
      throw new Error('Linked display pose configuration binding failed.');
    }
    maximumJointPivotResidualM = diagnostic.maximumJointPivotResidualM;
    if (
      !Number.isFinite(maximumJointPivotResidualM) ||
      maximumJointPivotResidualM < 0 ||
      maximumJointPivotResidualM > 1e-7
    ) {
      throw new Error('Linked display pose joint-pivot continuity gate failed.');
    }
    displayMesh = snapshotMeasurementSurfaceMeshV1(diagnostic.displayMesh);
  }
  if (!(input.lane === 'relax' && input.degrees === 0) && !poseResourcesLoaded) {
    throw new Error('Linked display pose authenticated resource binding failed.');
  }

  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2,
    validatedByDiagnosticContract:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
    parameterRevision:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision,
    configurationId: id,
    configurationKey: `linked-symmetric:${id}` as const,
    input,
    sourceRevision,
    displayMesh,
    maximumJointPivotResidualM,
    source: Object.freeze({
      matrixSha256: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2,
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
      poseResourcesLoaded,
    }),
    claims: CLAIMS,
  });
}
