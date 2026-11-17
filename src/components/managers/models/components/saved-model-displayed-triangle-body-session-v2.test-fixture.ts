import type { common_Model, common_BodyMeasurementName } from 'api/proto-http/admin';
import { buildModelDisplayedTriangleBodyInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { modelCardMannequinInputV1 } from './model-card-mannequin-input-v1';

export function sessionModelRow(id = 731): common_Model {
  return {
    id,
    createdAt: undefined,
    updatedAt: '2026-11-17T00:00:00.123456Z',
    thumbnail: undefined,
    media: [],
    model: {
      name: `Model ${id}`,
      comment: '',
      gender: 'GENDER_ENUM_FEMALE',
      thumbnailId: undefined,
      mediaIds: [],
      defaultSizeIds: [],
      bodyMeasurementSchemaVersion: 1,
      measurements: (
        [
          ['BODY_MEASUREMENT_NAME_HEIGHT', 1720],
          ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', 420],
          ['BODY_MEASUREMENT_NAME_CHEST', 920],
          ['BODY_MEASUREMENT_NAME_WAIST', 740],
          ['BODY_MEASUREMENT_NAME_HIP', 980],
          ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', 600],
          ['BODY_MEASUREMENT_NAME_INSEAM', 800],
        ] satisfies [common_BodyMeasurementName, number][]
      ).map(([name, valueMm]) => ({ name, valueMm, metadata: undefined })),
    },
  };
}
export async function sessionFixture(
  id = 731,
  headYaw = 0,
  displayedId = `tech-card-base-model:${id}`,
) {
  const model = sessionModelRow(id);
  const input = modelCardMannequinInputV1(model);
  const resolved = resolveModelOpenReferencePreviewInputV1(input);
  if (!resolved.ok) throw new Error('Invalid test model.');
  const frame = createMeasurementBodyFrameV2({
    measurements: resolved.measurements,
    sourceRevision: 'observed-session-v9:1',
  });
  const document = createModelMannequinPoseDocumentV2({
    ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    headYawDeg: headYaw,
  });
  const observed: ModelOpenReferenceDisplayedBodySnapshotV1 = {
    schemaVersion: 'model-open-reference-displayed-body-snapshot/v1',
    observationId: `session-observation:${id}:${headYaw}`,
    modelId: displayedId,
    modelContentRevision: modelFormRevisionKeyV1(model),
    basisKind: 'female',
    inputFingerprint: JSON.stringify([
      input.gender,
      Object.entries(input.measurements).sort(([a], [b]) => a.localeCompare(b)),
    ]),
    bodyBuildFingerprint: 'v9-build:1',
    runtimeSourceRevision: frame.sourceRevision,
    frameRevision: frame.revision,
    displayPositionSource: 'built-runtime',
    frame,
    displayMesh: {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 3,
      triangleCount: 1,
      byteLength: 48,
    },
    poseDocument: document,
    poseDocumentCanonicalKey: encodeModelMannequinPoseDocumentV2(document),
    displayedPose: document.pose,
    appliedPose: document.pose,
    draftPose: document.pose,
    canonicalAuthority: false,
    collisionAuthority: false,
    runtimeAuthority: false,
    productionAuthority: false,
  };
  const state = {
    model: model as common_Model | null,
    observation: observed as ModelOpenReferenceDisplayedBodySnapshotV1 | null,
  };
  const abort = new AbortController();
  const built = await buildModelDisplayedTriangleBodyInputV1(
    { readCurrentSnapshot: () => state.observation, expected: observed },
    abort.signal,
  );
  if (!built.ok) throw new Error(built.detail);
  return { input: built.input, state, abort };
}

export function deferredSessionValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
