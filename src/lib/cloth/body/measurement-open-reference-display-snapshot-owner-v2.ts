import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import {
  MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
  type MeasurementOpenReferenceBetaShapeKeyV1,
  type MeasurementOpenReferenceBetaShapeRuntimeResultV1,
} from './measurement-open-reference-beta-shape-runtime-v1';
import {
  measurementOpenReferenceDisplaySnapshotSourceRevisionV1,
  type MeasurementOpenReferenceDisplaySnapshotBuildResultV1,
  type MeasurementOpenReferenceDisplaySnapshotRequestV1,
  type MeasurementOpenReferenceDisplaySnapshotV1,
} from './measurement-open-reference-display-snapshot-owner-v1';
import type { MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2 } from './measurement-open-reference-linked-symmetric-display-pose-runtime-v2';
import {
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2,
  measurementOpenReferenceLinkedSymmetricPoseRotationsV2,
  type MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
} from './measurement-open-reference-linked-symmetric-pose-lanes-diagnostic-v2';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  basisHashBoundSourceRevision,
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  loadMakeHumanOpenReferenceBasisV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisKindV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V2 =
  'measurement-open-reference-display-snapshot-owner/v2' as const;

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_SOURCE_V2 =
  'model-form-open-reference-linked-pose-preview-v2' as const;

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2 =
  '5000d02841564052d50ba34518c659f99ec08c7e6682591fd7f210567cc8b764' as const;

const LINKED_DISPLAY_POSE_RUNTIME_VERSION_V2 =
  'measurement-open-reference-linked-symmetric-display-pose-runtime/v2' as const;

type DisplayBasisKind = Exclude<MakeHumanOpenReferenceBasisKindV1, 'base'>;
type LimbKey =
  | 'bicepCircumferenceMm'
  | 'wristCircumferenceMm'
  | 'calfCircumferenceMm'
  | 'ankleCircumferenceMm';

const LIMB_KEYS = Object.freeze([
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const satisfies readonly LimbKey[]);

const REQUEST_KEYS = Object.freeze([
  'modelId',
  'modelContentRevision',
  'inputFingerprint',
  'basisKind',
  'measurements',
  'poseSelection',
] as const);
const SOURCE_REVISION_OPTION_KEYS = Object.freeze([
  'inputFingerprint',
  'basisKind',
  'poseSelection',
  'limbSubsetRequested',
] as const);
const MEASUREMENT_KEYS = Object.freeze([
  'schemaVersion',
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
  'underBustCircumferenceMm',
  'neckBaseCircumferenceMm',
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
const RUNTIME_RESULT_KEYS = Object.freeze([
  'version',
  'validatedByDiagnosticContract',
  'parameterRevision',
  'configurationId',
  'configurationKey',
  'input',
  'sourceRevision',
  'displayMesh',
  'maximumJointPivotResidualM',
  'source',
  'claims',
] as const);
const RUNTIME_SOURCE_KEYS = Object.freeze([
  'matrixSha256',
  'rigSha256',
  'anchorSha256',
  'poseResourcesLoaded',
] as const);
const MESH_KEYS = Object.freeze([
  'positions',
  'indices',
  'vertexCount',
  'triangleCount',
  'byteLength',
] as const);

const EXPECTED_RUNTIME_CLAIMS = Object.freeze({
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
const RUNTIME_CLAIM_KEYS = Object.freeze(Object.keys(EXPECTED_RUNTIME_CLAIMS));

const CLAIMS = Object.freeze({
  displayOnly: true as const,
  linkedSymmetryOnly: true as const,
  discreteConfigurationsOnly: true as const,
  oneLaneAtATimeOnly: true as const,
  continuousIntervalSafetyClaimed: false as const,
  combinedLaneSafetyClaimed: false as const,
  actualRenderedGarmentPairEvaluated: false as const,
  initializationAdmitted: false as const,
  garmentFitClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  persistenceAuthority: false as const,
  productionAuthority: false as const,
  deploymentAuthority: false as const,
});

type PoseConfigurationIdV2 =
  | 'relax-0'
  | 'relax-1'
  | 'relax-2'
  | 'relax-3'
  | 'relax-4'
  | 'raise-5'
  | 'raise-10'
  | 'raise-15'
  | 'raise-20'
  | 'raise-25';
type PoseConfigurationKeyV2 = `linked-symmetric:${PoseConfigurationIdV2}`;

export interface MeasurementOpenReferenceDisplaySnapshotRequestV2 {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly poseSelection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
}

export interface MeasurementOpenReferenceDisplaySnapshotBindingV2 {
  readonly generation: number;
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly canonicalContentFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly poseConfigurationKey: PoseConfigurationKeyV2;
  readonly matrixSha256: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2;
  readonly sourceRevision: string;
  readonly delegatedV1SourceRevision: string | null;
}

export interface MeasurementOpenReferenceDisplaySnapshotV2 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V2;
  readonly role: 'PER_MODEL_LINKED_POSE_DISPLAY_RESEARCH_SNAPSHOT';
  readonly binding: MeasurementOpenReferenceDisplaySnapshotBindingV2;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly shape: {
    readonly status: MeasurementOpenReferenceBetaShapeRuntimeResultV1['status'] | 'legacy';
    readonly runtimeRevision: typeof MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1 | null;
    readonly sourceRevisionSuffix: string | null;
    readonly representedVisualControls: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  };
  readonly waistHip: {
    readonly status: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['status'];
    readonly representedGeometricProxies: readonly (
      | 'waistCircumferenceMm'
      | 'hipCircumferenceMm'
    )[];
  };
  readonly limbs: {
    readonly status:
      | MeasurementOpenReferenceDisplaySnapshotV1['limbs']['status']
      | 'omitted-linked-pose';
    readonly requestedGeometricProxies: readonly LimbKey[];
    readonly representedGeometricProxies: readonly LimbKey[];
  };
  readonly pose: {
    readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
    readonly configurationKey: PoseConfigurationKeyV2;
    readonly status: 'a-rest' | 'posed';
    readonly maximumJointPivotResidualM: number;
    readonly poseResourcesLoaded: boolean;
    readonly runtimeSourceRevision: string | null;
  };
  readonly claims: typeof CLAIMS;
}

export type MeasurementOpenReferenceDisplaySnapshotBuildResultV2 =
  | Readonly<{ status: 'committed'; snapshot: MeasurementOpenReferenceDisplaySnapshotV2 }>
  | Readonly<{
      status: 'stale';
      binding: MeasurementOpenReferenceDisplaySnapshotBindingV2;
      reason: 'superseded';
    }>
  | Readonly<{
      status: 'blocked';
      code: 'build-failed' | 'invalid-request';
      message: string;
    }>;

type ARestOwnerV1 = Readonly<{
  build: (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV1,
  ) => Promise<MeasurementOpenReferenceDisplaySnapshotBuildResultV1>;
  invalidate: () => void;
}>;

export interface MeasurementOpenReferenceDisplaySnapshotDependenciesV2 {
  readonly aRestOwner: ARestOwnerV1;
  readonly loadBasis: (kind: DisplayBasisKind) => Promise<MakeHumanOpenReferenceBasisV1>;
  readonly createUniformHeightDisplay: typeof createMeasurementOpenReferenceUniformHeightDisplayV1;
  readonly createWaistHipRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  }) => Promise<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1>;
  readonly createBetaShapeRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  }) => Promise<MeasurementOpenReferenceBetaShapeRuntimeResultV1>;
  readonly createLinkedPoseRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
    readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
    readonly sourceRevision: string;
  }) => Promise<MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2>;
}

function snapshotDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data record.`);
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must use a plain prototype.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new RangeError(`${label} must not contain symbol fields.`);
  }
  const stringKeys = ownKeys as string[];
  if (
    stringKeys.some((key) => !allowedKeys.includes(key)) ||
    requiredKeys.some((key) => !stringKeys.includes(key))
  ) {
    throw new RangeError(`${label} contains missing or unknown fields.`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of stringKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor == null ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get != null ||
      descriptor.set != null
    ) {
      throw new TypeError(`${label}.${key} must be an enumerable own data field.`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotMeasurements(value: unknown): CanonicalBodyMeasurementsMm {
  return snapshotDataRecord(
    value,
    MEASUREMENT_KEYS,
    REQUIRED_MEASUREMENT_KEYS,
    'request.measurements',
  ) as unknown as CanonicalBodyMeasurementsMm;
}

function snapshotRequest(value: unknown): MeasurementOpenReferenceDisplaySnapshotRequestV2 {
  const snapshot = snapshotDataRecord(value, REQUEST_KEYS, REQUEST_KEYS, 'request');
  return Object.freeze({
    modelId: snapshot.modelId,
    modelContentRevision: snapshot.modelContentRevision,
    inputFingerprint: snapshot.inputFingerprint,
    basisKind: snapshot.basisKind,
    measurements: snapshotMeasurements(snapshot.measurements),
    poseSelection: snapshot.poseSelection,
  }) as MeasurementOpenReferenceDisplaySnapshotRequestV2;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonicalContentFingerprint(measurements: CanonicalBodyMeasurementsMm): string {
  return JSON.stringify(
    Object.entries(measurements).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

function requestedLimbKeys(measurements: CanonicalBodyMeasurementsMm): readonly LimbKey[] {
  return Object.freeze(LIMB_KEYS.filter((key) => measurements[key] != null));
}

function canonicalPoseSelection(
  value: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 {
  const rotations = measurementOpenReferenceLinkedSymmetricPoseRotationsV2(value);
  if (rotations.length === 0) return Object.freeze({ lane: 'relax' as const, degrees: 0 as const });
  const first = rotations[0];
  if (first.bone === 'shoulder01.L') {
    const degrees = Math.abs(first.degrees);
    if (![1, 2, 3, 4].includes(degrees)) throw new Error('Validated relax pose is invalid.');
    return Object.freeze({ lane: 'relax' as const, degrees: degrees as 1 | 2 | 3 | 4 });
  }
  if (first.bone === 'upperarm01.L') {
    const degrees = Math.abs(first.degrees);
    if (![5, 10, 15, 20, 25].includes(degrees)) throw new Error('Validated raise pose is invalid.');
    return Object.freeze({ lane: 'raise' as const, degrees: degrees as 5 | 10 | 15 | 20 | 25 });
  }
  throw new Error('Validated linked pose has an unsupported rotation shape.');
}

function configurationId(
  selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): PoseConfigurationIdV2 {
  return `${selection.lane}-${selection.degrees}` as PoseConfigurationIdV2;
}

function configurationKey(
  selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): PoseConfigurationKeyV2 {
  return `linked-symmetric:${configurationId(selection)}`;
}

export function measurementOpenReferenceDisplaySnapshotSourceRevisionV2(options: {
  readonly inputFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly poseSelection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly limbSubsetRequested: boolean;
}): string {
  const snapshot = snapshotDataRecord(
    options,
    SOURCE_REVISION_OPTION_KEYS,
    SOURCE_REVISION_OPTION_KEYS,
    'source revision options',
  );
  const inputFingerprint = exactString(snapshot.inputFingerprint, 'inputFingerprint');
  if (!['neutral', 'male', 'female'].includes(snapshot.basisKind as string)) {
    throw new RangeError('basisKind must be neutral, male or female.');
  }
  if (typeof snapshot.limbSubsetRequested !== 'boolean') {
    throw new TypeError('limbSubsetRequested must be boolean.');
  }
  const basisKind = snapshot.basisKind as DisplayBasisKind;
  const selection = canonicalPoseSelection(
    snapshot.poseSelection as MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
  );
  const poseKey = configurationKey(selection);
  const basisBound = basisHashBoundSourceRevision(
    `${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_SOURCE_V2};inputHash=${fnv1a32(inputFingerprint)}`,
    basisKind,
  );
  return `${basisBound};shapeRuntimeRevision=${MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1};poseConfigurationKey=${poseKey};linkedPoseMatrixSha256=${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2};limbSubsetRequested=${selection.lane === 'relax' && selection.degrees === 0 && snapshot.limbSubsetRequested}`;
}

function linkedPoseRuntimeSourceRevision(
  sourceRevision: string,
  selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): string {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${sourceRevision};linkedDisplayPoseRuntime=${LINKED_DISPLAY_POSE_RUNTIME_VERSION_V2};linkedPoseParameterRevision=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision};linkedPoseConfiguration=${configurationId(selection)};linkedPoseMatrixSha256=${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

function snapshotBasis(
  value: MakeHumanOpenReferenceBasisV1,
  expectedKind: DisplayBasisKind,
): MakeHumanOpenReferenceBasisV1 {
  if (value.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1 || value.kind !== expectedKind) {
    throw new Error('Loaded display basis does not match the requested basis binding.');
  }
  return Object.freeze({
    ...value,
    positionsSourceUnits: value.positionsSourceUnits.slice(),
    indices: value.indices.slice(),
  });
}

function snapshotRuntimeDisplayMesh(value: unknown): MeasurementSurfaceMeshV1 {
  const snapshot = snapshotDataRecord(value, MESH_KEYS, MESH_KEYS, 'linked runtime displayMesh');
  const positions = snapshot.positions;
  const indices = snapshot.indices;
  const vertexCount = snapshot.vertexCount;
  const triangleCount = snapshot.triangleCount;
  const byteLength = snapshot.byteLength;
  if (
    !(positions instanceof Float32Array) ||
    !(indices instanceof Uint32Array) ||
    !Number.isSafeInteger(vertexCount) ||
    !Number.isSafeInteger(triangleCount) ||
    !Number.isSafeInteger(byteLength) ||
    (vertexCount as number) <= 0 ||
    (triangleCount as number) <= 0 ||
    positions.length !== (vertexCount as number) * 3 ||
    indices.length !== (triangleCount as number) * 3 ||
    byteLength !== positions.byteLength + indices.byteLength
  ) {
    throw new Error('Linked runtime displayMesh schema/count binding is invalid.');
  }
  for (const position of positions) {
    if (!Number.isFinite(position)) {
      throw new Error('Linked runtime displayMesh positions must be finite.');
    }
  }
  for (const index of indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= (vertexCount as number)) {
      throw new Error('Linked runtime displayMesh indices are invalid.');
    }
  }
  return Object.freeze({
    positions: positions.slice(),
    indices: indices.slice(),
    vertexCount: vertexCount as number,
    triangleCount: triangleCount as number,
    byteLength: byteLength as number,
  });
}

function snapshotLinkedPoseRuntimeResult(
  value: unknown,
  expectedSelection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
  expectedConfigurationKey: PoseConfigurationKeyV2,
  expectedSourceRevision: string,
): MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2 {
  const snapshot = snapshotDataRecord(
    value,
    RUNTIME_RESULT_KEYS,
    RUNTIME_RESULT_KEYS,
    'linked runtime result',
  );
  const source = snapshotDataRecord(
    snapshot.source,
    RUNTIME_SOURCE_KEYS,
    RUNTIME_SOURCE_KEYS,
    'linked runtime result.source',
  );
  const claims = snapshotDataRecord(
    snapshot.claims,
    RUNTIME_CLAIM_KEYS,
    RUNTIME_CLAIM_KEYS,
    'linked runtime result.claims',
  );
  const input = canonicalPoseSelection(
    snapshot.input as MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
  );
  const configurationIdValue = configurationId(expectedSelection);
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  if (
    snapshot.version !== LINKED_DISPLAY_POSE_RUNTIME_VERSION_V2 ||
    snapshot.validatedByDiagnosticContract !==
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2 ||
    snapshot.parameterRevision !==
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision ||
    snapshot.configurationId !== configurationIdValue ||
    snapshot.configurationKey !== expectedConfigurationKey ||
    configurationKey(input) !== expectedConfigurationKey ||
    snapshot.sourceRevision !== expectedSourceRevision ||
    source.matrixSha256 !== MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2 ||
    source.rigSha256 !== metadata.rigSha256 ||
    source.anchorSha256 !== metadata.anchorSha256 ||
    source.poseResourcesLoaded !== true
  ) {
    throw new Error('Linked pose runtime result does not match the V2 snapshot binding.');
  }
  for (const [key, expected] of Object.entries(EXPECTED_RUNTIME_CLAIMS)) {
    if (claims[key] !== expected) {
      throw new Error(
        'Linked pose runtime authority claims do not match the V2 snapshot boundary.',
      );
    }
  }
  const residual = snapshot.maximumJointPivotResidualM;
  if (
    typeof residual !== 'number' ||
    !Number.isFinite(residual) ||
    residual < 0 ||
    residual > 1e-7
  ) {
    throw new Error('Linked pose runtime joint-pivot residual is invalid.');
  }
  return Object.freeze({
    version: LINKED_DISPLAY_POSE_RUNTIME_VERSION_V2,
    validatedByDiagnosticContract:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
    parameterRevision:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision,
    configurationId: configurationIdValue,
    configurationKey: expectedConfigurationKey,
    input,
    sourceRevision: expectedSourceRevision,
    displayMesh: snapshotRuntimeDisplayMesh(snapshot.displayMesh),
    maximumJointPivotResidualM: residual,
    source: Object.freeze({
      matrixSha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2,
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
      poseResourcesLoaded: true,
    }),
    claims: EXPECTED_RUNTIME_CLAIMS,
  });
}

function cloneBinding(
  value: MeasurementOpenReferenceDisplaySnapshotBindingV2,
): MeasurementOpenReferenceDisplaySnapshotBindingV2 {
  return Object.freeze({ ...value });
}

function cloneSnapshot(
  value: MeasurementOpenReferenceDisplaySnapshotV2,
): MeasurementOpenReferenceDisplaySnapshotV2 {
  return Object.freeze({
    ...value,
    binding: cloneBinding(value.binding),
    displayMesh: snapshotMeasurementSurfaceMeshV1(value.displayMesh),
    shape: Object.freeze({
      ...value.shape,
      representedVisualControls: Object.freeze([...value.shape.representedVisualControls]),
    }),
    waistHip: Object.freeze({
      ...value.waistHip,
      representedGeometricProxies: Object.freeze([...value.waistHip.representedGeometricProxies]),
    }),
    limbs: Object.freeze({
      ...value.limbs,
      requestedGeometricProxies: Object.freeze([...value.limbs.requestedGeometricProxies]),
      representedGeometricProxies: Object.freeze([...value.limbs.representedGeometricProxies]),
    }),
    pose: Object.freeze({ ...value.pose, input: Object.freeze({ ...value.pose.input }) }),
    claims: CLAIMS,
  });
}

function bindingKey(value: MeasurementOpenReferenceDisplaySnapshotBindingV2): string {
  return JSON.stringify([
    value.generation,
    value.modelId,
    value.modelContentRevision,
    value.inputFingerprint,
    value.canonicalContentFingerprint,
    value.basisKind,
    value.poseConfigurationKey,
    value.matrixSha256,
    value.sourceRevision,
    value.delegatedV1SourceRevision,
  ]);
}

const DEFAULT_LINKED_DEPENDENCIES = Object.freeze({
  loadBasis: loadMakeHumanOpenReferenceBasisV1,
  createUniformHeightDisplay: createMeasurementOpenReferenceUniformHeightDisplayV1,
  createWaistHipRuntime: async (options) => {
    const runtime = await import('./measurement-open-reference-uniform-waist-hip-runtime-v1');
    return runtime.createMeasurementOpenReferenceUniformWaistHipRuntimeV1(options);
  },
  createBetaShapeRuntime: async (options) => {
    const runtime = await import('./measurement-open-reference-beta-shape-runtime-v1');
    return runtime.createMeasurementOpenReferenceBetaShapeRuntimeV1(options);
  },
  createLinkedPoseRuntime: async (options) => {
    const runtime = await import(
      './measurement-open-reference-linked-symmetric-display-pose-runtime-v2'
    );
    return runtime.createMeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeV2(options);
  },
} satisfies Omit<MeasurementOpenReferenceDisplaySnapshotDependenciesV2, 'aRestOwner'>);

export function createMeasurementOpenReferenceDisplaySnapshotOwnerV2(
  dependencies: Partial<MeasurementOpenReferenceDisplaySnapshotDependenciesV2> = {},
): {
  readonly build: (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV2,
  ) => Promise<MeasurementOpenReferenceDisplaySnapshotBuildResultV2>;
  readonly invalidate: () => void;
  readonly current: () => MeasurementOpenReferenceDisplaySnapshotV2 | null;
  readonly isCurrent: (binding: MeasurementOpenReferenceDisplaySnapshotBindingV2) => boolean;
} {
  // Supplying an A-rest owner preserves the legacy delegated contract used by older consumers and
  // deterministic owner tests. The product card omits it and therefore uses the same beta-shape
  // runtime as the detail preview without paying for both the legacy and beta builds.
  const aRestOwner = dependencies.aRestOwner ?? null;
  const deps = Object.freeze({ ...DEFAULT_LINKED_DEPENDENCIES, ...dependencies });
  let generation = 0;
  let current: MeasurementOpenReferenceDisplaySnapshotV2 | null = null;

  const invalidate = () => {
    generation += 1;
    current = null;
    aRestOwner?.invalidate();
  };

  const build = async (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV2,
  ): Promise<MeasurementOpenReferenceDisplaySnapshotBuildResultV2> => {
    invalidate();
    const reservedGeneration = generation;
    let binding: MeasurementOpenReferenceDisplaySnapshotBindingV2;
    let measurements: CanonicalBodyMeasurementsMm;
    let selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
    let requestedLimbs: readonly LimbKey[];
    let frame: ReturnType<typeof createMeasurementBodyFrameV2>;
    try {
      const ownedRequest = snapshotRequest(request);
      const modelId = exactString(ownedRequest.modelId, 'modelId');
      const modelContentRevision = exactString(
        ownedRequest.modelContentRevision,
        'modelContentRevision',
      );
      const inputFingerprint = exactString(ownedRequest.inputFingerprint, 'inputFingerprint');
      if (!['neutral', 'male', 'female'].includes(ownedRequest.basisKind)) {
        throw new RangeError('basisKind must be neutral, male or female.');
      }
      if (ownedRequest.measurements.schemaVersion !== CANONICAL_BODY_MEASUREMENTS_VERSION) {
        throw new RangeError('Unsupported canonical measurement schema.');
      }
      selection = canonicalPoseSelection(ownedRequest.poseSelection);
      const temporaryFrame = createMeasurementBodyFrameV2({
        measurements: ownedRequest.measurements,
        sourceRevision: 'linked-pose-v2-request-validation',
        pose: 'A',
      });
      measurements = temporaryFrame.measurements;
      requestedLimbs = requestedLimbKeys(measurements);
      const isARest = selection.lane === 'relax' && selection.degrees === 0;
      const sourceRevision = measurementOpenReferenceDisplaySnapshotSourceRevisionV2({
        inputFingerprint,
        basisKind: ownedRequest.basisKind,
        poseSelection: selection,
        limbSubsetRequested: isARest && requestedLimbs.length > 0,
      });
      frame = createMeasurementBodyFrameV2({ measurements, sourceRevision, pose: 'A' });
      const delegatedV1SourceRevision =
        isARest && aRestOwner
          ? measurementOpenReferenceDisplaySnapshotSourceRevisionV1({
              inputFingerprint,
              basisKind: ownedRequest.basisKind,
              posePresetId: 'a-rest',
              limbSubsetRequested: requestedLimbs.length > 0,
            })
          : null;
      binding = Object.freeze({
        generation: reservedGeneration,
        modelId,
        modelContentRevision,
        inputFingerprint,
        canonicalContentFingerprint: canonicalContentFingerprint(measurements),
        basisKind: ownedRequest.basisKind,
        poseConfigurationKey: configurationKey(selection),
        matrixSha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2,
        sourceRevision,
        delegatedV1SourceRevision,
      });
    } catch (reason: unknown) {
      return Object.freeze({
        status: 'blocked' as const,
        code: 'invalid-request' as const,
        message: reason instanceof Error ? reason.message : 'Display snapshot request is invalid.',
      });
    }

    const stale = (): MeasurementOpenReferenceDisplaySnapshotBuildResultV2 | null =>
      generation === reservedGeneration
        ? null
        : Object.freeze({
            status: 'stale' as const,
            binding: cloneBinding(binding),
            reason: 'superseded' as const,
          });

    try {
      let displayMesh: MeasurementSurfaceMeshV1;
      let shape: MeasurementOpenReferenceDisplaySnapshotV2['shape'];
      let waistHip: MeasurementOpenReferenceDisplaySnapshotV2['waistHip'];
      let limbs: MeasurementOpenReferenceDisplaySnapshotV2['limbs'];
      let pose: MeasurementOpenReferenceDisplaySnapshotV2['pose'];
      const isARest = selection.lane === 'relax' && selection.degrees === 0;

      if (isARest && aRestOwner) {
        const delegated = await aRestOwner.build({
          modelId: binding.modelId,
          modelContentRevision: binding.modelContentRevision,
          inputFingerprint: binding.inputFingerprint,
          basisKind: binding.basisKind,
          measurements,
          posePresetId: 'a-rest',
        });
        const staleResult = stale();
        if (staleResult) return staleResult;
        if (delegated.status === 'stale') {
          return Object.freeze({
            status: 'stale' as const,
            binding: cloneBinding(binding),
            reason: 'superseded' as const,
          });
        }
        if (delegated.status === 'blocked') {
          return Object.freeze({
            status: 'blocked' as const,
            code: delegated.code,
            message: delegated.message,
          });
        }
        if (delegated.snapshot.binding.sourceRevision !== binding.delegatedV1SourceRevision) {
          throw new Error('Delegated A-rest source revision does not match the V2 binding.');
        }
        if (
          delegated.snapshot.binding.modelId !== binding.modelId ||
          delegated.snapshot.binding.modelContentRevision !== binding.modelContentRevision ||
          delegated.snapshot.binding.inputFingerprint !== binding.inputFingerprint ||
          delegated.snapshot.binding.canonicalContentFingerprint !==
            binding.canonicalContentFingerprint ||
          delegated.snapshot.binding.basisKind !== binding.basisKind ||
          delegated.snapshot.binding.posePresetId !== 'a-rest'
        ) {
          throw new Error('Delegated A-rest snapshot does not match the V2 request binding.');
        }
        displayMesh = snapshotMeasurementSurfaceMeshV1(delegated.snapshot.displayMesh);
        shape = Object.freeze({
          status: 'legacy' as const,
          runtimeRevision: null,
          sourceRevisionSuffix: null,
          representedVisualControls: Object.freeze([
            'heightMm' as const,
            ...delegated.snapshot.waistHip.representedGeometricProxies,
            ...delegated.snapshot.limbs.representedGeometricProxies,
          ]),
        });
        waistHip = Object.freeze({
          status: delegated.snapshot.waistHip.status,
          representedGeometricProxies: Object.freeze([
            ...delegated.snapshot.waistHip.representedGeometricProxies,
          ]),
        });
        limbs = Object.freeze({
          status: delegated.snapshot.limbs.status,
          requestedGeometricProxies: Object.freeze([
            ...delegated.snapshot.limbs.requestedGeometricProxies,
          ]),
          representedGeometricProxies: Object.freeze([
            ...delegated.snapshot.limbs.representedGeometricProxies,
          ]),
        });
        pose = Object.freeze({
          input: selection,
          configurationKey: binding.poseConfigurationKey,
          status: 'a-rest' as const,
          maximumJointPivotResidualM: 0,
          poseResourcesLoaded: false,
          runtimeSourceRevision: null,
        });
      } else {
        const basis = snapshotBasis(await deps.loadBasis(binding.basisKind), binding.basisKind);
        let staleResult = stale();
        if (staleResult) return staleResult;
        const openReference = deps.createUniformHeightDisplay({ basis, frame });
        const waistHipRuntime = await deps.createWaistHipRuntime({
          basis,
          measurements,
          openReference,
        });
        staleResult = stale();
        if (staleResult) return staleResult;
        let betaShapeRuntime: MeasurementOpenReferenceBetaShapeRuntimeResultV1 | null = null;
        try {
          betaShapeRuntime = await deps.createBetaShapeRuntime({
            basis,
            measurements,
            waistHipRuntime,
          });
        } catch {
          betaShapeRuntime = null;
        }
        staleResult = stale();
        if (staleResult) return staleResult;
        const shapedProxyRuntime = betaShapeRuntime?.fkProxyRuntime ?? waistHipRuntime;
        shape = Object.freeze({
          status: betaShapeRuntime?.status ?? ('unrepresented' as const),
          runtimeRevision: betaShapeRuntime?.version ?? null,
          sourceRevisionSuffix: betaShapeRuntime?.sourceRevisionSuffix ?? null,
          representedVisualControls: Object.freeze(
            betaShapeRuntime
              ? [...betaShapeRuntime.representedVisualControls]
              : ['heightMm' as const, ...waistHipRuntime.representedGeometricProxies],
          ),
        });
        waistHip = Object.freeze({
          status: waistHipRuntime.status,
          representedGeometricProxies: Object.freeze([
            ...waistHipRuntime.representedGeometricProxies,
          ]),
        });
        if (isARest) {
          displayMesh = snapshotMeasurementSurfaceMeshV1(shapedProxyRuntime.displayMesh);
          const representedLimbs = requestedLimbs.filter((key) =>
            shape.representedVisualControls.includes(key),
          );
          limbs = Object.freeze({
            status:
              betaShapeRuntime?.limbStatus ??
              (requestedLimbs.length === 0
                ? ('not-requested' as const)
                : ('runtime-fallback' as const)),
            requestedGeometricProxies: Object.freeze([...requestedLimbs]),
            representedGeometricProxies: Object.freeze([...representedLimbs]),
          });
          pose = Object.freeze({
            input: selection,
            configurationKey: binding.poseConfigurationKey,
            status: 'a-rest' as const,
            maximumJointPivotResidualM: 0,
            poseResourcesLoaded: false,
            runtimeSourceRevision: null,
          });
        } else {
          const runtimeResult = await deps.createLinkedPoseRuntime({
            basis,
            measurements,
            proxyRuntime: shapedProxyRuntime,
            input: selection,
            sourceRevision: `${binding.sourceRevision};${shape.sourceRevisionSuffix ?? 'beta-shape-runtime=fallback'}`,
          });
          staleResult = stale();
          if (staleResult) return staleResult;
          const posed = snapshotLinkedPoseRuntimeResult(
            runtimeResult,
            selection,
            binding.poseConfigurationKey,
            linkedPoseRuntimeSourceRevision(
              `${binding.sourceRevision};${shape.sourceRevisionSuffix ?? 'beta-shape-runtime=fallback'}`,
              selection,
            ),
          );
          displayMesh = snapshotMeasurementSurfaceMeshV1(posed.displayMesh);
          limbs = Object.freeze({
            status: 'omitted-linked-pose' as const,
            requestedGeometricProxies: Object.freeze([...requestedLimbs]),
            representedGeometricProxies: Object.freeze([]),
          });
          pose = Object.freeze({
            input: selection,
            configurationKey: binding.poseConfigurationKey,
            status: 'posed' as const,
            maximumJointPivotResidualM: posed.maximumJointPivotResidualM,
            poseResourcesLoaded: posed.source.poseResourcesLoaded,
            runtimeSourceRevision: posed.sourceRevision,
          });
        }
      }

      const staleResult = stale();
      if (staleResult) return staleResult;
      const owned: MeasurementOpenReferenceDisplaySnapshotV2 = Object.freeze({
        version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V2,
        role: 'PER_MODEL_LINKED_POSE_DISPLAY_RESEARCH_SNAPSHOT' as const,
        binding: cloneBinding(binding),
        displayMesh: snapshotMeasurementSurfaceMeshV1(displayMesh),
        shape,
        waistHip,
        limbs,
        pose,
        claims: CLAIMS,
      });
      current = owned;
      return Object.freeze({ status: 'committed' as const, snapshot: cloneSnapshot(owned) });
    } catch (reason: unknown) {
      if (generation !== reservedGeneration) {
        return Object.freeze({
          status: 'stale' as const,
          binding: cloneBinding(binding),
          reason: 'superseded' as const,
        });
      }
      return Object.freeze({
        status: 'blocked' as const,
        code: 'build-failed' as const,
        message: reason instanceof Error ? reason.message : 'Display snapshot build failed.',
      });
    }
  };

  return Object.freeze({
    build,
    invalidate,
    current: () => (current ? cloneSnapshot(current) : null),
    isCurrent: (binding: MeasurementOpenReferenceDisplaySnapshotBindingV2) =>
      current !== null && bindingKey(current.binding) === bindingKey(binding),
  });
}
