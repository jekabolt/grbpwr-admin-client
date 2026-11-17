import { afterEach, vi } from 'vitest';
import type { common_Model } from 'api/proto-http/admin';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { modelCardMannequinInputV1 } from 'components/managers/models/components/model-card-mannequin-input-v1';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { buildModelDisplayedTriangleBodyInputV1 } from './model-displayed-triangle-body-input-v1';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
async function fixture(
  options: {
    observation?: string;
    live?: boolean;
    yaw?: number;
    x?: number;
    updatedAt?: string;
    frameOffset?: number;
    independentDocumentWithLinkedDisplay?: boolean;
    frameMetadata?: number | readonly string[];
  } = {},
) {
  const model: common_Model = {
    id: 731,
    updatedAt: options.updatedAt ?? '2026-11-17T00:00:00.123456Z',
    createdAt: undefined,
    thumbnail: undefined,
    media: [],
    model: {
      name: 'Stable observed model',
      comment: '',
      gender: 'GENDER_ENUM_FEMALE',
      mediaIds: [],
      defaultSizeIds: [],
      thumbnailId: undefined,
      bodyMeasurementSchemaVersion: 1,
      measurements: [
        { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600, metadata: undefined },
        { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800, metadata: undefined },
      ],
    },
  };
  const preview = modelCardMannequinInputV1(model);
  const resolved = resolveModelOpenReferencePreviewInputV1(preview);
  if (!resolved.ok) throw new Error('Fixture measurements failed.');
  const baseFrame = createMeasurementBodyFrameV2({
    measurements: resolved.measurements,
    sourceRevision: 'accepted-v9-source:stable',
  });
  const frame = {
    ...baseFrame,
    ...(options.frameMetadata === undefined ? {} : { fixtureMetadata: options.frameMetadata }),
    landmarks: baseFrame.landmarks.map((landmark, index) => ({
      ...landmark,
      positionM:
        index === 0
          ? ([
              landmark.positionM[0] + (options.frameOffset ?? 0),
              landmark.positionM[1],
              landmark.positionM[2],
            ] as const)
          : landmark.positionM,
    })),
  };
  const document = createModelMannequinPoseDocumentV2({
    ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    headYawDeg: options.yaw ?? 0,
    ...(options.independentDocumentWithLinkedDisplay
      ? { armMode: 'independent' as const, legMode: 'independent' as const }
      : {}),
  });
  const displayedPose = options.independentDocumentWithLinkedDisplay
    ? { ...document.pose, armMode: 'linked' as const, legMode: 'linked' as const }
    : document.pose;
  // CPU host observation is explicitly simulated. Genuine production capture/adoption owners
  // run below; no browser acceptance, body solver or runtime authority is claimed by this fixture.
  const host: ModelOpenReferenceDisplayedBodySnapshotV1 = {
    schemaVersion: 'model-open-reference-displayed-body-snapshot/v1',
    observationId: options.observation ?? 'observation:first',
    modelId: `tech-card-base-model:${model.id}`,
    modelContentRevision: modelFormRevisionKeyV1(model),
    basisKind: resolved.basis.basisKind as 'female',
    inputFingerprint: JSON.stringify([
      preview.gender ?? null,
      Object.entries(preview.measurements).sort(([a], [b]) => a.localeCompare(b)),
    ]),
    bodyBuildFingerprint: JSON.stringify({
      source: 'body-build-v9',
      physicalOptions: { scale: 1 },
    }),
    runtimeSourceRevision: frame.sourceRevision,
    frameRevision: frame.revision,
    displayPositionSource: options.live ? 'live-pose' : 'built-runtime',
    frame,
    displayMesh: {
      positions: new Float32Array([options.x ?? -0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 3,
      triangleCount: 1,
      byteLength: 48,
    },
    poseDocument: document,
    poseDocumentCanonicalKey: encodeModelMannequinPoseDocumentV2(document),
    displayedPose,
    draftPose: document.pose,
    appliedPose: displayedPose,
    canonicalAuthority: false,
    collisionAuthority: false,
    runtimeAuthority: false,
    productionAuthority: false,
  };
  const state = {
    model: model as common_Model | null,
    host: host as ModelOpenReferenceDisplayedBodySnapshotV1 | null,
  };
  const input = await buildModelDisplayedTriangleBodyInputV1({
    readCurrentSnapshot: () => state.host,
    expected: host,
  });
  if (!input.ok) throw new Error(input.detail);
  const owner = createSavedModelDisplayedTriangleBodyOwnerV2();
  cleanups.push(() => {
    disposeSavedModelDisplayedTriangleBodyOwnerV2(owner);
    input.input.dispose();
  });
  const reader = vi.fn(async () => structuredClone(state.model));
  const request = {
    displayedInput: input.input,
    expectedDisplayedIdentity: input.input.project()!.identity,
    expectedPersistedModel: { id: model.id!, updatedAt: model.updatedAt! },
    readCurrentModel: reader,
  };
  const adopted = await adoptSavedModelDisplayedTriangleBodyV2(owner, request);
  if (adopted.status !== 'committed') throw new Error(adopted.status);
  return {
    owner,
    binding: adopted.snapshot.binding,
    reader,
    request,
    state,
    input: input.input,
    snapshot: adopted.snapshot,
  };
}

export { fixture as createObservedBodyIssuerTestFixture };
