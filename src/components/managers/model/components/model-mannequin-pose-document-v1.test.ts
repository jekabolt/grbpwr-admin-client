import { describe, expect, it } from 'vitest';

import type { ModelOpenReferenceFullBodyPoseV4 } from './model-open-reference-full-body-pose-control-v4';
import {
  MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1,
  MODEL_MANNEQUIN_POSE_SPACE_V1,
  createModelMannequinPoseDocumentV1,
  decodeModelMannequinPoseDocumentV1,
  encodeModelMannequinPoseDocumentV1,
  fingerprintModelMannequinPoseDocumentV1,
  migrateModelMannequinPoseDocumentV1,
  parseModelMannequinPoseDocumentV1,
} from './model-mannequin-pose-document-v1';

const POSE: ModelOpenReferenceFullBodyPoseV4 = {
  bodyFlexionDegrees: 8,
  bodySideBendDegrees: -4,
  bodyTwistDegrees: 5,
  armMode: 'independent',
  leftArm: {
    shoulderRaiseDegrees: 20,
    shoulderForwardDegrees: -10,
    elbowBendDegrees: 35,
    wristBendDegrees: -5,
  },
  rightArm: {
    shoulderRaiseDegrees: 30,
    shoulderForwardDegrees: 15,
    elbowBendDegrees: 60,
    wristBendDegrees: 10,
  },
};

describe('model mannequin pose document v1', () => {
  it('round-trips a strict canonical V1 document', () => {
    const document = createModelMannequinPoseDocumentV1(POSE);
    const payload = encodeModelMannequinPoseDocumentV1(document);

    expect(parseModelMannequinPoseDocumentV1(payload)).toEqual(document);
    expect(JSON.parse(payload)).toEqual({
      schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1,
      poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V1,
      pose: POSE,
    });
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.pose.leftArm)).toBe(true);
  });

  it('migrates only the exact legacy full-body V4 shape', () => {
    const result = migrateModelMannequinPoseDocumentV1(POSE);
    expect(result.migratedFrom).toBe('legacy-full-body-v4');
    expect(result.document.pose).toEqual(POSE);

    expect(() => migrateModelMannequinPoseDocumentV1({ ...POSE, unknown: true })).toThrow(
      /must contain exactly/,
    );
  });

  it('rejects unknown schema, pose space, fields and invalid linked arms', () => {
    const document = createModelMannequinPoseDocumentV1(POSE);
    expect(() => decodeModelMannequinPoseDocumentV1({ ...document, schema: 'v2' })).toThrow(
      /Unsupported mannequin pose schema/,
    );
    expect(() => decodeModelMannequinPoseDocumentV1({ ...document, poseSpace: 'other' })).toThrow(
      /Unsupported mannequin pose space/,
    );
    expect(() => decodeModelMannequinPoseDocumentV1({ ...document, extra: true })).toThrow(
      /must contain exactly/,
    );
    expect(() => createModelMannequinPoseDocumentV1({ ...POSE, armMode: 'linked' })).toThrow(
      /identical left and right arms/,
    );
  });

  it('rejects non-finite, off-step and out-of-envelope channels', () => {
    expect(() =>
      createModelMannequinPoseDocumentV1({ ...POSE, bodyFlexionDegrees: Number.NaN }),
    ).toThrow(/must be finite/);
    expect(() => createModelMannequinPoseDocumentV1({ ...POSE, bodyFlexionDegrees: 1.5 })).toThrow(
      /must use 1-degree steps/,
    );
    expect(() => createModelMannequinPoseDocumentV1({ ...POSE, bodyFlexionDegrees: 100 })).toThrow(
      /must remain within/,
    );
  });

  it('produces the same SHA-256 fingerprint after canonical decoding', async () => {
    const document = createModelMannequinPoseDocumentV1(POSE);
    const reordered = decodeModelMannequinPoseDocumentV1({
      pose: {
        rightArm: { ...POSE.rightArm },
        leftArm: { ...POSE.leftArm },
        armMode: POSE.armMode,
        bodyTwistDegrees: POSE.bodyTwistDegrees,
        bodySideBendDegrees: POSE.bodySideBendDegrees,
        bodyFlexionDegrees: POSE.bodyFlexionDegrees,
      },
      poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V1,
      schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V1,
    });

    const first = await fingerprintModelMannequinPoseDocumentV1(document);
    const second = await fingerprintModelMannequinPoseDocumentV1(reordered);
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fails closed on malformed JSON', () => {
    expect(() => parseModelMannequinPoseDocumentV1('{')).toThrow(
      /Mannequin pose payload must be valid JSON/,
    );
  });
});
