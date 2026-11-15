import type {
  GetModelMannequinPoseResponse,
  PutModelMannequinPoseRequest,
  PutModelMannequinPoseResponse,
  common_ModelMannequinArmMode,
  common_ModelMannequinLegMode,
  common_ModelMannequinPoseV2,
  common_StoredModelMannequinPose,
} from 'api/proto-http/admin';

import type {
  ModelMannequinPoseLoadResultV1,
  PutModelMannequinPoseRequestV1,
  PutModelMannequinPoseResultV1,
  StoredModelMannequinPoseV1,
} from './model-mannequin-pose-draft-owner-v1';
import {
  MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
  MODEL_MANNEQUIN_POSE_SPACE_V2,
  decodeModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
  type ModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';

export const MODEL_MANNEQUIN_POSE_RPC_FLAG_V1 = 'VITE_MODEL_MANNEQUIN_POSE_RPC_V1' as const;

export function modelMannequinPoseRpcEnabledV1(
  value: string | undefined = import.meta.env.VITE_MODEL_MANNEQUIN_POSE_RPC_V1,
): boolean {
  return value === '1';
}

const DIRECT_POSE_SPACE =
  'MODEL_MANNEQUIN_POSE_SPACE_MAKEHUMAN_OPEN_REFERENCE_DIRECT_POSE_V9' as const;
const ARM_MODE_LINKED = 'MODEL_MANNEQUIN_ARM_MODE_LINKED' as const;
const ARM_MODE_INDEPENDENT = 'MODEL_MANNEQUIN_ARM_MODE_INDEPENDENT' as const;
const LEG_MODE_LINKED = 'MODEL_MANNEQUIN_LEG_MODE_LINKED' as const;
const LEG_MODE_INDEPENDENT = 'MODEL_MANNEQUIN_LEG_MODE_INDEPENDENT' as const;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UINT64_DECIMAL = /^(0|[1-9][0-9]*)$/;
const UINT64_MAX = 18_446_744_073_709_551_615n;

export interface ModelMannequinPoseAdminServiceV1 {
  GetModelMannequinPose(request: {
    modelId: number | undefined;
  }): Promise<GetModelMannequinPoseResponse>;
  PutModelMannequinPose(
    request: PutModelMannequinPoseRequest,
  ): Promise<PutModelMannequinPoseResponse>;
}

function positiveModelId(value: number | undefined, label = 'modelId'): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function revisionString(value: string | undefined, label = 'revision'): string {
  if (!value || !UINT64_DECIMAL.test(value) || BigInt(value) <= 0n || BigInt(value) > UINT64_MAX) {
    throw new RangeError(`${label} must be a positive canonical decimal uint64 string.`);
  }
  return value;
}

function sha256Hex(value: string | undefined): string {
  if (!value || !SHA256_HEX.test(value)) {
    throw new RangeError('canonicalSha256 must be 64 lowercase hexadecimal characters.');
  }
  return value;
}

function armModeFromWire(value: common_ModelMannequinArmMode | undefined) {
  if (value === ARM_MODE_LINKED) return 'linked' as const;
  if (value === ARM_MODE_INDEPENDENT) return 'independent' as const;
  throw new RangeError('Stored mannequin arm mode must be LINKED or INDEPENDENT.');
}

function legModeFromWire(value: common_ModelMannequinLegMode | undefined) {
  if (value === LEG_MODE_LINKED) return 'linked' as const;
  if (value === LEG_MODE_INDEPENDENT) return 'independent' as const;
  throw new RangeError('Stored mannequin leg mode must be LINKED or INDEPENDENT.');
}

function armModeToWire(value: 'linked' | 'independent'): common_ModelMannequinArmMode {
  return value === 'linked' ? ARM_MODE_LINKED : ARM_MODE_INDEPENDENT;
}

function legModeToWire(value: 'linked' | 'independent'): common_ModelMannequinLegMode {
  return value === 'linked' ? LEG_MODE_LINKED : LEG_MODE_INDEPENDENT;
}

export function modelMannequinPoseDocumentFromWireV1(
  value: common_ModelMannequinPoseV2,
): ModelMannequinPoseDocumentV2 {
  if (value.schemaVersion !== 2) {
    throw new RangeError('Stored mannequin pose schemaVersion must be exactly 2.');
  }
  if (value.poseSpace !== DIRECT_POSE_SPACE) {
    throw new RangeError('Stored mannequin pose must use the direct-pose-v9 pose space.');
  }
  return decodeModelMannequinPoseDocumentV2({
    schema: MODEL_MANNEQUIN_POSE_DOCUMENT_SCHEMA_V2,
    poseSpace: MODEL_MANNEQUIN_POSE_SPACE_V2,
    pose: {
      bodyFlexionDegrees: value.bodyFlexionDegrees,
      bodySideBendDegrees: value.bodySideBendDegrees,
      bodyTwistDegrees: value.bodyTwistDegrees,
      armMode: armModeFromWire(value.armMode),
      leftArm: {
        shoulderRaiseDegrees: value.leftArm?.shoulderRaiseDegrees,
        shoulderForwardDegrees: value.leftArm?.shoulderForwardDegrees,
        elbowBendDegrees: value.leftArm?.elbowBendDegrees,
        wristBendDegrees: value.leftArm?.wristBendDegrees,
      },
      rightArm: {
        shoulderRaiseDegrees: value.rightArm?.shoulderRaiseDegrees,
        shoulderForwardDegrees: value.rightArm?.shoulderForwardDegrees,
        elbowBendDegrees: value.rightArm?.elbowBendDegrees,
        wristBendDegrees: value.rightArm?.wristBendDegrees,
      },
      headPitchDeg: value.headPitchDegrees,
      headYawDeg: value.headYawDegrees,
      headSideDeg: value.headSideDegrees,
      shoulderProtractionDeg: value.shoulderProtractionDegrees,
      shoulderElevationDeg: value.shoulderElevationDegrees,
      shoulderLevelDeg: value.shoulderLevelDegrees,
      legMode: legModeFromWire(value.legMode),
      leftLeg: {
        hipForwardDeg: value.leftLeg?.hipForwardDegrees,
        hipSideDeg: value.leftLeg?.hipSideDegrees,
        kneeBendDeg: value.leftLeg?.kneeBendDegrees,
        ankleBendDeg: value.leftLeg?.ankleBendDegrees,
      },
      rightLeg: {
        hipForwardDeg: value.rightLeg?.hipForwardDegrees,
        hipSideDeg: value.rightLeg?.hipSideDegrees,
        kneeBendDeg: value.rightLeg?.kneeBendDegrees,
        ankleBendDeg: value.rightLeg?.ankleBendDegrees,
      },
    },
  });
}

export function modelMannequinPoseDocumentToWireV1(
  document: ModelMannequinPoseDocumentV2,
  canonicalSha256: string,
): common_ModelMannequinPoseV2 {
  const canonical = decodeModelMannequinPoseDocumentV2(document);
  const { pose } = canonical;
  return Object.freeze({
    schemaVersion: 2,
    poseSpace: DIRECT_POSE_SPACE,
    bodyFlexionDegrees: pose.bodyFlexionDegrees,
    bodySideBendDegrees: pose.bodySideBendDegrees,
    bodyTwistDegrees: pose.bodyTwistDegrees,
    armMode: armModeToWire(pose.armMode),
    leftArm: Object.freeze({
      shoulderRaiseDegrees: pose.leftArm.shoulderRaiseDegrees,
      shoulderForwardDegrees: pose.leftArm.shoulderForwardDegrees,
      elbowBendDegrees: pose.leftArm.elbowBendDegrees,
      wristBendDegrees: pose.leftArm.wristBendDegrees,
    }),
    rightArm: Object.freeze({
      shoulderRaiseDegrees: pose.rightArm.shoulderRaiseDegrees,
      shoulderForwardDegrees: pose.rightArm.shoulderForwardDegrees,
      elbowBendDegrees: pose.rightArm.elbowBendDegrees,
      wristBendDegrees: pose.rightArm.wristBendDegrees,
    }),
    headPitchDegrees: pose.headPitchDeg,
    headYawDegrees: pose.headYawDeg,
    headSideDegrees: pose.headSideDeg,
    legMode: legModeToWire(pose.legMode),
    leftLeg: Object.freeze({
      hipForwardDegrees: pose.leftLeg.hipForwardDeg,
      hipSideDegrees: pose.leftLeg.hipSideDeg,
      kneeBendDegrees: pose.leftLeg.kneeBendDeg,
      ankleBendDegrees: pose.leftLeg.ankleBendDeg,
    }),
    rightLeg: Object.freeze({
      hipForwardDegrees: pose.rightLeg.hipForwardDeg,
      hipSideDegrees: pose.rightLeg.hipSideDeg,
      kneeBendDegrees: pose.rightLeg.kneeBendDeg,
      ankleBendDegrees: pose.rightLeg.ankleBendDeg,
    }),
    canonicalSha256: sha256Hex(canonicalSha256),
    shoulderProtractionDegrees: pose.shoulderProtractionDeg,
    shoulderElevationDegrees: pose.shoulderElevationDeg,
    shoulderLevelDegrees: pose.shoulderLevelDeg,
  });
}

export async function storedModelMannequinPoseFromWireV1(
  value: common_StoredModelMannequinPose,
  requestedModelId: number,
): Promise<StoredModelMannequinPoseV1> {
  const modelId = positiveModelId(value.modelId, 'storedPose.modelId');
  if (modelId !== positiveModelId(requestedModelId)) {
    throw new RangeError('Stored mannequin pose belongs to a different model.');
  }
  if (!value.pose) throw new RangeError('Stored mannequin pose is missing its pose document.');
  const document = modelMannequinPoseDocumentFromWireV1(value.pose);
  const canonicalSha256 = sha256Hex(value.pose.canonicalSha256);
  const expected = (await fingerprintModelMannequinPoseDocumentV2(document)).slice(
    'sha256:'.length,
  );
  if (canonicalSha256 !== expected) {
    throw new RangeError(
      'Stored mannequin pose fingerprint does not match its canonical document.',
    );
  }
  return Object.freeze({
    document,
    revision: revisionString(value.revision),
    canonicalSha256,
  });
}

export async function getModelMannequinPoseV1(
  service: ModelMannequinPoseAdminServiceV1,
  modelId: number,
): Promise<ModelMannequinPoseLoadResultV1> {
  const requestedModelId = positiveModelId(modelId);
  const response = await service.GetModelMannequinPose({ modelId: requestedModelId });
  if (!response.storedPose) return Object.freeze({ kind: 'absent' });
  return Object.freeze({
    kind: 'found',
    stored: await storedModelMannequinPoseFromWireV1(response.storedPose, requestedModelId),
  });
}

export async function putModelMannequinPoseRequestToWireV1(
  request: PutModelMannequinPoseRequestV1,
): Promise<PutModelMannequinPoseRequest> {
  const canonicalPayload = encodeModelMannequinPoseDocumentV2(request.pose);
  if (request.canonicalPayload !== canonicalPayload) {
    throw new RangeError('Pose save payload is not the canonical V2 document.');
  }
  const canonicalSha256 = (await fingerprintModelMannequinPoseDocumentV2(request.pose)).slice(
    'sha256:'.length,
  );
  if (request.canonicalSha256 !== canonicalSha256) {
    throw new RangeError('Pose save fingerprint does not match its canonical V2 document.');
  }
  return Object.freeze({
    modelId: positiveModelId(request.modelId),
    pose: modelMannequinPoseDocumentToWireV1(request.pose, canonicalSha256),
    ...(request.expectedRevision === undefined
      ? {}
      : { expectedRevision: revisionString(request.expectedRevision, 'expectedRevision') }),
  });
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

export async function putModelMannequinPoseV1(
  service: ModelMannequinPoseAdminServiceV1,
  request: PutModelMannequinPoseRequestV1,
): Promise<Exclude<PutModelMannequinPoseResultV1, Readonly<{ kind: 'rejected' }>>> {
  try {
    const response = await service.PutModelMannequinPose(
      await putModelMannequinPoseRequestToWireV1(request),
    );
    if (!response.storedPose) {
      throw new RangeError('Pose save response is missing storedPose.');
    }
    return Object.freeze({
      kind: 'saved',
      stored: await storedModelMannequinPoseFromWireV1(response.storedPose, request.modelId),
    });
  } catch (error) {
    // gRPC ABORTED is HTTP 409 at this gateway. The rejected write carries no replacement body, so
    // the exact current resource is read before the owner enters its explicit conflict phase.
    if (statusOf(error) !== 409) throw error;
    const current = await getModelMannequinPoseV1(service, request.modelId);
    if (current.kind !== 'found') {
      throw new Error('Pose write conflicted, but the current stored pose is absent.', {
        cause: error,
      });
    }
    return Object.freeze({ kind: 'conflict', current: current.stored });
  }
}
