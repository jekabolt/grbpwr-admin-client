import {
  MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4,
  MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4,
} from 'lib/cloth/body/makehuman-full-body-pose-v4';
import {
  MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1,
  type MakeHumanLegBodyPartIkControlsV1,
} from 'lib/cloth/body/makehuman-leg-body-part-ik-v1';

import type { ModelOpenReferenceDirectPoseV9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import {
  MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
  type ModelOpenReferenceFullBodyArmPoseV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-contract-v4';
import {
  MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1,
  decodeModelMannequinPoseDocumentV1,
  migrateModelMannequinPoseDocumentV1,
} from './model-mannequin-pose-document-v1';

export const MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2 = 'grbpwr.model-mannequin-pose/v2' as const;
export const MODEL_MANNEQUIN_POSE_SPACE_V2 = 'makehuman-open-reference/direct-pose-v9' as const;

export interface ModelMannequinPoseDocumentV2 {
  readonly schema: typeof MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2;
  readonly poseSpace: typeof MODEL_MANNEQUIN_POSE_SPACE_V2;
  readonly pose: ModelOpenReferenceDirectPoseV9;
}

export interface ModelMannequinPoseMigrationV2 {
  readonly document: ModelMannequinPoseDocumentV2;
  readonly migratedFrom: 'document-v1' | 'legacy-full-body-v4' | 'legacy-direct-pose-v9' | null;
}

const DOCUMENT_KEYS = Object.freeze(['schema', 'pose', 'poseSpace'] as const);
const V4_POSE_KEYS = Object.freeze([
  'armMode',
  'bodyFlexionDegrees',
  'bodySideBendDegrees',
  'bodyTwistDegrees',
  'leftArm',
  'rightArm',
] as const);
const LEGACY_V9_POSE_KEYS = Object.freeze([
  ...V4_POSE_KEYS,
  'headPitchDeg',
  'headSideDeg',
  'headYawDeg',
  'leftLeg',
  'legMode',
  'rightLeg',
] as const);
const V9_POSE_KEYS = Object.freeze([
  ...LEGACY_V9_POSE_KEYS,
  'shoulderElevationDeg',
  'shoulderLevelDeg',
  'shoulderProtractionDeg',
] as const);
const ARM_KEYS = Object.freeze([
  'elbowBendDegrees',
  'shoulderForwardDegrees',
  'shoulderRaiseDegrees',
  'wristBendDegrees',
] as const);
const LEG_KEYS = Object.freeze([
  'ankleBendDeg',
  'hipForwardDeg',
  'hipSideDeg',
  'kneeBendDeg',
] as const);
const ZERO_LEG: MakeHumanLegBodyPartIkControlsV1 = Object.freeze({
  hipForwardDeg: 0,
  hipSideDeg: 0,
  kneeBendDeg: 0,
  ankleBendDeg: 0,
});

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new RangeError(`${label} must contain exactly: ${sortedExpected.join(', ')}.`);
  }
}

function steppedChannel(
  value: unknown,
  field: string,
  limit: Readonly<{ min: number; max: number; step: number }>,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${field} must be finite.`);
  }
  if (value < limit.min || value > limit.max) {
    throw new RangeError(`${field} must remain within ${limit.min}..${limit.max} degrees.`);
  }
  const stepIndex = (value - limit.min) / limit.step;
  if (Math.abs(stepIndex - Math.round(stepIndex)) > 1e-9) {
    throw new RangeError(`${field} must use ${limit.step}-degree steps.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function upperBodyChannel(
  value: unknown,
  field: keyof typeof MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
) {
  return steppedChannel(value, field, MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field]);
}

function headChannel(value: unknown, field: keyof typeof MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4) {
  const envelope = MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4[field];
  return steppedChannel(value, field, {
    min: envelope.minimumDeg,
    max: envelope.maximumDeg,
    step: envelope.stepDeg,
  });
}

function shoulderPostureChannel(
  value: unknown,
  field: keyof typeof MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4,
) {
  const envelope = MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4[field];
  return steppedChannel(value, field, {
    min: envelope.minimumDeg,
    max: envelope.maximumDeg,
    step: envelope.stepDeg,
  });
}

function legChannel(value: unknown, field: keyof typeof MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1) {
  const envelope = MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1[field];
  return steppedChannel(value, field, {
    min: envelope.minimumDeg,
    max: envelope.maximumDeg,
    step: envelope.stepDeg,
  });
}

function armPose(value: unknown, label: string): ModelOpenReferenceFullBodyArmPoseV4 {
  const candidate = objectRecord(value, label);
  assertExactKeys(candidate, ARM_KEYS, label);
  return Object.freeze({
    shoulderRaiseDegrees: upperBodyChannel(candidate.shoulderRaiseDegrees, 'shoulderRaiseDegrees'),
    shoulderForwardDegrees: upperBodyChannel(
      candidate.shoulderForwardDegrees,
      'shoulderForwardDegrees',
    ),
    elbowBendDegrees: upperBodyChannel(candidate.elbowBendDegrees, 'elbowBendDegrees'),
    wristBendDegrees: upperBodyChannel(candidate.wristBendDegrees, 'wristBendDegrees'),
  });
}

function legPose(value: unknown, label: string): MakeHumanLegBodyPartIkControlsV1 {
  const candidate = objectRecord(value, label);
  assertExactKeys(candidate, LEG_KEYS, label);
  return Object.freeze({
    hipForwardDeg: legChannel(candidate.hipForwardDeg, 'hipForwardDeg'),
    hipSideDeg: legChannel(candidate.hipSideDeg, 'hipSideDeg'),
    kneeBendDeg: legChannel(candidate.kneeBendDeg, 'kneeBendDeg'),
    ankleBendDeg: legChannel(candidate.ankleBendDeg, 'ankleBendDeg'),
  });
}

function equalArms(
  left: ModelOpenReferenceFullBodyArmPoseV4,
  right: ModelOpenReferenceFullBodyArmPoseV4,
) {
  return ARM_KEYS.every((field) => left[field] === right[field]);
}

function equalLegs(
  left: MakeHumanLegBodyPartIkControlsV1,
  right: MakeHumanLegBodyPartIkControlsV1,
) {
  return LEG_KEYS.every((field) => left[field] === right[field]);
}

function poseV9(value: unknown): ModelOpenReferenceDirectPoseV9 {
  const candidate = objectRecord(value, 'pose');
  const keys = Object.keys(candidate).sort();
  const isLegacyPose =
    keys.length === LEGACY_V9_POSE_KEYS.length &&
    keys.every((key, index) => key === [...LEGACY_V9_POSE_KEYS].sort()[index]);
  const isCurrentPose =
    keys.length === V9_POSE_KEYS.length &&
    keys.every((key, index) => key === [...V9_POSE_KEYS].sort()[index]);
  if (!isLegacyPose && !isCurrentPose) assertExactKeys(candidate, V9_POSE_KEYS, 'pose');
  if (candidate.armMode !== 'linked' && candidate.armMode !== 'independent') {
    throw new RangeError('pose.armMode must be linked or independent.');
  }
  if (candidate.legMode !== 'linked' && candidate.legMode !== 'independent') {
    throw new RangeError('pose.legMode must be linked or independent.');
  }
  const leftArm = armPose(candidate.leftArm, 'pose.leftArm');
  const rightArm = armPose(candidate.rightArm, 'pose.rightArm');
  const leftLeg = legPose(candidate.leftLeg, 'pose.leftLeg');
  const rightLeg = legPose(candidate.rightLeg, 'pose.rightLeg');
  if (candidate.armMode === 'linked' && !equalArms(leftArm, rightArm)) {
    throw new RangeError('A linked pose must contain identical left and right arms.');
  }
  if (candidate.legMode === 'linked' && !equalLegs(leftLeg, rightLeg)) {
    throw new RangeError('A linked pose must contain identical left and right legs.');
  }
  return Object.freeze({
    bodyFlexionDegrees: upperBodyChannel(candidate.bodyFlexionDegrees, 'bodyFlexionDegrees'),
    bodySideBendDegrees: upperBodyChannel(candidate.bodySideBendDegrees, 'bodySideBendDegrees'),
    bodyTwistDegrees: upperBodyChannel(candidate.bodyTwistDegrees, 'bodyTwistDegrees'),
    armMode: candidate.armMode,
    leftArm,
    rightArm,
    headPitchDeg: headChannel(candidate.headPitchDeg, 'headPitchDeg'),
    headYawDeg: headChannel(candidate.headYawDeg, 'headYawDeg'),
    headSideDeg: headChannel(candidate.headSideDeg, 'headSideDeg'),
    shoulderProtractionDeg: isLegacyPose
      ? 0
      : shoulderPostureChannel(candidate.shoulderProtractionDeg, 'shoulderProtractionDeg'),
    shoulderElevationDeg: isLegacyPose
      ? 0
      : shoulderPostureChannel(candidate.shoulderElevationDeg, 'shoulderElevationDeg'),
    shoulderLevelDeg: isLegacyPose
      ? 0
      : shoulderPostureChannel(candidate.shoulderLevelDeg, 'shoulderLevelDeg'),
    legMode: candidate.legMode,
    leftLeg,
    rightLeg,
  });
}

function upgradeV4Pose(pose: ModelOpenReferenceFullBodyPoseV4): ModelOpenReferenceDirectPoseV9 {
  return poseV9({
    ...pose,
    headPitchDeg: 0,
    headYawDeg: 0,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legMode: 'linked',
    leftLeg: ZERO_LEG,
    rightLeg: ZERO_LEG,
  });
}

export function createModelMannequinPoseDocumentV2(
  pose: ModelOpenReferenceDirectPoseV9,
): ModelMannequinPoseDocumentV2 {
  return Object.freeze({
    schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
    poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V2,
    pose: poseV9(pose),
  });
}

export function decodeModelMannequinPoseDocumentV2(value: unknown): ModelMannequinPoseDocumentV2 {
  const candidate = objectRecord(value, 'mannequin pose document');
  assertExactKeys(candidate, DOCUMENT_KEYS, 'mannequin pose document');
  if (candidate.schema !== MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2) {
    throw new RangeError(`Unsupported mannequin pose schema: ${String(candidate.schema)}.`);
  }
  if (candidate.poseSpace !== MODEL_MANNEQUIN_POSE_SPACE_V2) {
    throw new RangeError(`Unsupported mannequin pose space: ${String(candidate.poseSpace)}.`);
  }
  return createModelMannequinPoseDocumentV2(poseV9(candidate.pose));
}

export function migrateModelMannequinPoseDocumentV2(value: unknown): ModelMannequinPoseMigrationV2 {
  const candidate = objectRecord(value, 'mannequin pose payload');
  if ('schema' in candidate || 'poseSpace' in candidate || 'pose' in candidate) {
    if (candidate.schema === MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2) {
      return Object.freeze({
        document: decodeModelMannequinPoseDocumentV2(candidate),
        migratedFrom: null,
      });
    }
    if (candidate.schema === MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1) {
      const previous = decodeModelMannequinPoseDocumentV1(candidate);
      return Object.freeze({
        document: createModelMannequinPoseDocumentV2(upgradeV4Pose(previous.pose)),
        migratedFrom: 'document-v1',
      });
    }
    throw new RangeError(`Unsupported mannequin pose schema: ${String(candidate.schema)}.`);
  }

  const keys = Object.keys(candidate).sort();
  const isDirectV9 =
    (keys.length === V9_POSE_KEYS.length &&
      keys.every((key, index) => key === [...V9_POSE_KEYS].sort()[index])) ||
    (keys.length === LEGACY_V9_POSE_KEYS.length &&
      keys.every((key, index) => key === [...LEGACY_V9_POSE_KEYS].sort()[index]));
  if (isDirectV9) {
    return Object.freeze({
      document: createModelMannequinPoseDocumentV2(poseV9(candidate)),
      migratedFrom: 'legacy-direct-pose-v9',
    });
  }
  const previous = migrateModelMannequinPoseDocumentV1(candidate);
  return Object.freeze({
    document: createModelMannequinPoseDocumentV2(upgradeV4Pose(previous.document.pose)),
    migratedFrom: 'legacy-full-body-v4',
  });
}

export function parseModelMannequinPoseDocumentV2(payload: string): ModelMannequinPoseDocumentV2 {
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload) as unknown;
  } catch {
    throw new SyntaxError('Mannequin pose payload must be valid JSON.');
  }
  return decodeModelMannequinPoseDocumentV2(decoded);
}

export function encodeModelMannequinPoseDocumentV2(value: ModelMannequinPoseDocumentV2): string {
  return JSON.stringify(decodeModelMannequinPoseDocumentV2(value));
}

export async function fingerprintModelMannequinPoseDocumentV2(
  value: ModelMannequinPoseDocumentV2,
): Promise<`sha256:${string}`> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is required to fingerprint a mannequin pose.');
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(encodeModelMannequinPoseDocumentV2(value)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}
