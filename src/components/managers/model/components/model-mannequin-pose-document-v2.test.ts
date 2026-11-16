import { describe, expect, it } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import { createModelMannequinPoseDocumentV1 } from './model-mannequin-pose-document-v1';
import {
  MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
  MODEL_MANNEQUIN_POSE_SPACE_V2,
  createModelMannequinPoseDocumentV2,
  decodeModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
  migrateModelMannequinPoseDocumentV2,
  parseModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';

const POSE: ModelOpenReferenceDirectPoseV9 = {
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
  headPitchDeg: 12,
  headYawDeg: -18,
  headSideDeg: 7,
  shoulderProtractionDeg: 8,
  shoulderElevationDeg: 4,
  shoulderLevelDeg: -2,
  legMode: 'independent',
  leftLeg: { hipForwardDeg: 20, hipSideDeg: -8, kneeBendDeg: 45, ankleBendDeg: -10 },
  rightLeg: { hipForwardDeg: -15, hipSideDeg: 10, kneeBendDeg: 70, ankleBendDeg: 15 },
};

describe('model mannequin pose document v2', () => {
  it('round-trips all direct V9 pose channels in canonical order', () => {
    const document = createModelMannequinPoseDocumentV2(POSE);
    const payload = encodeModelMannequinPoseDocumentV2(document);

    expect(parseModelMannequinPoseDocumentV2(payload)).toEqual(document);
    expect(JSON.parse(payload)).toEqual({
      schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
      poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V2,
      pose: POSE,
    });
    expect(Object.isFrozen(document.pose.leftLeg)).toBe(true);
  });

  it('migrates a V1 document with neutral head and linked neutral legs', () => {
    const previous = createModelMannequinPoseDocumentV1({
      bodyFlexionDegrees: POSE.bodyFlexionDegrees,
      bodySideBendDegrees: POSE.bodySideBendDegrees,
      bodyTwistDegrees: POSE.bodyTwistDegrees,
      armMode: POSE.armMode,
      leftArm: POSE.leftArm,
      rightArm: POSE.rightArm,
    });
    const result = migrateModelMannequinPoseDocumentV2(previous);

    expect(result.migratedFrom).toBe('document-v1');
    expect(result.document.pose).toMatchObject({
      bodyFlexionDegrees: 8,
      leftArm: POSE.leftArm,
      rightArm: POSE.rightArm,
      headPitchDeg: 0,
      headYawDeg: 0,
      headSideDeg: 0,
      shoulderProtractionDeg: 0,
      shoulderElevationDeg: 0,
      shoulderLevelDeg: 0,
      legMode: 'linked',
      leftLeg: { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 },
      rightLeg: { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 },
    });
  });

  it('decodes pre-posture V2 documents with neutral shoulder defaults', () => {
    const { shoulderProtractionDeg, shoulderElevationDeg, shoulderLevelDeg, ...legacyPose } = POSE;
    expect(shoulderProtractionDeg).toBe(8);
    expect(shoulderElevationDeg).toBe(4);
    expect(shoulderLevelDeg).toBe(-2);
    const decoded = decodeModelMannequinPoseDocumentV2({
      schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
      poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V2,
      pose: legacyPose,
    });
    expect(decoded.pose).toMatchObject({
      shoulderProtractionDeg: 0,
      shoulderElevationDeg: 0,
      shoulderLevelDeg: 0,
    });
  });

  it('migrates exact raw V4 and raw V9 shapes but rejects ambiguous extras', () => {
    const rawV4 = {
      bodyFlexionDegrees: 0,
      bodySideBendDegrees: 0,
      bodyTwistDegrees: 0,
      armMode: 'linked' as const,
      leftArm: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.leftArm,
      rightArm: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.rightArm,
    };
    expect(migrateModelMannequinPoseDocumentV2(rawV4).migratedFrom).toBe('legacy-full-body-v4');
    expect(migrateModelMannequinPoseDocumentV2(POSE).migratedFrom).toBe('legacy-direct-pose-v9');
    expect(() => migrateModelMannequinPoseDocumentV2({ ...POSE, extra: true })).toThrow(
      /must contain exactly/,
    );
  });

  it('rejects unknown documents and mismatched linked limbs', () => {
    const document = createModelMannequinPoseDocumentV2(POSE);
    expect(() => decodeModelMannequinPoseDocumentV2({ ...document, schema: 'v3' })).toThrow(
      /Unsupported mannequin pose schema/,
    );
    expect(() => decodeModelMannequinPoseDocumentV2({ ...document, poseSpace: 'other' })).toThrow(
      /Unsupported mannequin pose space/,
    );
    expect(() => createModelMannequinPoseDocumentV2({ ...POSE, armMode: 'linked' })).toThrow(
      /identical left and right arms/,
    );
    expect(() => createModelMannequinPoseDocumentV2({ ...POSE, legMode: 'linked' })).toThrow(
      /identical left and right legs/,
    );
  });

  it('validates head and leg product envelopes and integer steps', () => {
    expect(() => createModelMannequinPoseDocumentV2({ ...POSE, headYawDeg: 46 })).toThrow(
      /headYawDeg must remain within/,
    );
    expect(() => createModelMannequinPoseDocumentV2({ ...POSE, headSideDeg: 1.5 })).toThrow(
      /headSideDeg must use 1-degree steps/,
    );
    expect(() =>
      createModelMannequinPoseDocumentV2({
        ...POSE,
        leftLeg: { ...POSE.leftLeg, kneeBendDeg: 121 },
      }),
    ).toThrow(/kneeBendDeg must remain within/);
    expect(() => createModelMannequinPoseDocumentV2({ ...POSE, shoulderElevationDeg: 7 })).toThrow(
      /shoulderElevationDeg must remain within/,
    );
  });

  it('fingerprints canonical content independent of input field order', async () => {
    const document = createModelMannequinPoseDocumentV2(POSE);
    const reordered = decodeModelMannequinPoseDocumentV2({
      pose: {
        rightLeg: { ...POSE.rightLeg },
        leftLeg: { ...POSE.leftLeg },
        legMode: POSE.legMode,
        headSideDeg: POSE.headSideDeg,
        headYawDeg: POSE.headYawDeg,
        headPitchDeg: POSE.headPitchDeg,
        shoulderLevelDeg: POSE.shoulderLevelDeg,
        shoulderElevationDeg: POSE.shoulderElevationDeg,
        shoulderProtractionDeg: POSE.shoulderProtractionDeg,
        rightArm: { ...POSE.rightArm },
        leftArm: { ...POSE.leftArm },
        armMode: POSE.armMode,
        bodyTwistDegrees: POSE.bodyTwistDegrees,
        bodySideBendDegrees: POSE.bodySideBendDegrees,
        bodyFlexionDegrees: POSE.bodyFlexionDegrees,
      },
      poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V2,
      schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
    });

    expect(await fingerprintModelMannequinPoseDocumentV2(reordered)).toBe(
      await fingerprintModelMannequinPoseDocumentV2(document),
    );
  });

  it('fails closed on malformed JSON', () => {
    expect(() => parseModelMannequinPoseDocumentV2('{')).toThrow(
      /Mannequin pose payload must be valid JSON/,
    );
  });
});
