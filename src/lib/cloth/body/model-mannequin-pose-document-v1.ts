import {
  MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
  type ModelOpenReferenceFullBodyArmPoseV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-contract-v4';

export const MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1 = 'grbpwr.model-mannequin-pose/v1' as const;
export const MODEL_MANNEQUIN_POSE_SPACE_V1 = 'makehuman-open-reference/full-body-v4' as const;

export interface ModelMannequinPoseDocumentV1 {
  readonly schema: typeof MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1;
  readonly poseSpace: typeof MODEL_MANNEQUIN_POSE_SPACE_V1;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}

export interface ModelMannequinPoseMigrationV1 {
  readonly document: ModelMannequinPoseDocumentV1;
  readonly migratedFrom: 'legacy-full-body-v4' | null;
}

const DOCUMENT_KEYS = Object.freeze(['schema', 'pose', 'poseSpace'] as const);
const POSE_KEYS = Object.freeze([
  'armMode',
  'bodyFlexionDegrees',
  'bodySideBendDegrees',
  'bodyTwistDegrees',
  'leftArm',
  'rightArm',
] as const);
const ARM_KEYS = Object.freeze([
  'elbowBendDegrees',
  'shoulderForwardDegrees',
  'shoulderRaiseDegrees',
  'wristBendDegrees',
] as const);

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

function channelValue(
  value: unknown,
  field: keyof typeof MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
): number {
  const limit = MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field];
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

function armPose(value: unknown, label: string): ModelOpenReferenceFullBodyArmPoseV4 {
  const candidate = objectRecord(value, label);
  assertExactKeys(candidate, ARM_KEYS, label);
  return Object.freeze({
    shoulderRaiseDegrees: channelValue(candidate.shoulderRaiseDegrees, 'shoulderRaiseDegrees'),
    shoulderForwardDegrees: channelValue(
      candidate.shoulderForwardDegrees,
      'shoulderForwardDegrees',
    ),
    elbowBendDegrees: channelValue(candidate.elbowBendDegrees, 'elbowBendDegrees'),
    wristBendDegrees: channelValue(candidate.wristBendDegrees, 'wristBendDegrees'),
  });
}

function equalArms(
  left: ModelOpenReferenceFullBodyArmPoseV4,
  right: ModelOpenReferenceFullBodyArmPoseV4,
) {
  return ARM_KEYS.every((field) => left[field] === right[field]);
}

function poseV4(value: unknown): ModelOpenReferenceFullBodyPoseV4 {
  const candidate = objectRecord(value, 'pose');
  assertExactKeys(candidate, POSE_KEYS, 'pose');
  if (candidate.armMode !== 'linked' && candidate.armMode !== 'independent') {
    throw new RangeError('pose.armMode must be linked or independent.');
  }
  const leftArm = armPose(candidate.leftArm, 'pose.leftArm');
  const rightArm = armPose(candidate.rightArm, 'pose.rightArm');
  if (candidate.armMode === 'linked' && !equalArms(leftArm, rightArm)) {
    throw new RangeError('A linked pose must contain identical left and right arms.');
  }
  return Object.freeze({
    bodyFlexionDegrees: channelValue(candidate.bodyFlexionDegrees, 'bodyFlexionDegrees'),
    bodySideBendDegrees: channelValue(candidate.bodySideBendDegrees, 'bodySideBendDegrees'),
    bodyTwistDegrees: channelValue(candidate.bodyTwistDegrees, 'bodyTwistDegrees'),
    armMode: candidate.armMode,
    leftArm,
    rightArm,
  });
}

export function createModelMannequinPoseDocumentV1(
  pose: ModelOpenReferenceFullBodyPoseV4,
): ModelMannequinPoseDocumentV1 {
  return Object.freeze({
    schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1,
    poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V1,
    pose: poseV4(pose),
  });
}

export function decodeModelMannequinPoseDocumentV1(value: unknown): ModelMannequinPoseDocumentV1 {
  const candidate = objectRecord(value, 'mannequin pose document');
  assertExactKeys(candidate, DOCUMENT_KEYS, 'mannequin pose document');
  if (candidate.schema !== MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1) {
    throw new RangeError(`Unsupported mannequin pose schema: ${String(candidate.schema)}.`);
  }
  if (candidate.poseSpace !== MODEL_MANNEQUIN_POSE_SPACE_V1) {
    throw new RangeError(`Unsupported mannequin pose space: ${String(candidate.poseSpace)}.`);
  }
  return createModelMannequinPoseDocumentV1(poseV4(candidate.pose));
}

/**
 * The only admitted legacy shape is the exact in-memory V4 pose. Unknown documents fail closed so
 * future schema versions cannot be silently interpreted with the wrong rig or joint convention.
 */
export function migrateModelMannequinPoseDocumentV1(value: unknown): ModelMannequinPoseMigrationV1 {
  const candidate = objectRecord(value, 'mannequin pose payload');
  if ('schema' in candidate || 'poseSpace' in candidate || 'pose' in candidate) {
    return Object.freeze({
      document: decodeModelMannequinPoseDocumentV1(candidate),
      migratedFrom: null,
    });
  }
  return Object.freeze({
    document: createModelMannequinPoseDocumentV1(poseV4(candidate)),
    migratedFrom: 'legacy-full-body-v4',
  });
}

export function parseModelMannequinPoseDocumentV1(payload: string): ModelMannequinPoseDocumentV1 {
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload) as unknown;
  } catch {
    throw new SyntaxError('Mannequin pose payload must be valid JSON.');
  }
  return decodeModelMannequinPoseDocumentV1(decoded);
}

/** Canonical field order is part of V1 and gives the backend one deterministic payload. */
export function encodeModelMannequinPoseDocumentV1(value: ModelMannequinPoseDocumentV1): string {
  return JSON.stringify(decodeModelMannequinPoseDocumentV1(value));
}

export async function fingerprintModelMannequinPoseDocumentV1(
  value: ModelMannequinPoseDocumentV1,
): Promise<`sha256:${string}`> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is required to fingerprint a mannequin pose.');
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(encodeModelMannequinPoseDocumentV1(value)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}
