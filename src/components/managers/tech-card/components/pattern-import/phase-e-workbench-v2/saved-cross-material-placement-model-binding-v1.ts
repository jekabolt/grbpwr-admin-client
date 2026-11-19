import { abortableAdminService } from 'api/api';
import type { common_Model } from 'api/proto-http/admin';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
  type ModelDisplayedTriangleBodyInputProjectionV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import { getModelMannequinPoseV1 } from 'components/managers/model/components/model-mannequin-pose-transport-v1';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from 'lib/cloth/body/model-mannequin-pose-document-v2';
import { computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1 } from './saved-assembly-topology-hash-v1';

const bodyInputDomain = 'tech-card-physical-model-inputs/1';
const neutralPose = createModelMannequinPoseDocumentV2(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
const neutralPoseKey = encodeModelMannequinPoseDocumentV2(neutralPose);
const genderValues = new Set(['GENDER_ENUM_UNISEX', 'GENDER_ENUM_MALE', 'GENDER_ENUM_FEMALE']);
const measuredSources = new Set([
  'BODY_MEASUREMENT_SOURCE_MANUAL_TAPE',
  'BODY_MEASUREMENT_SOURCE_THREE_D_SCAN',
  'BODY_MEASUREMENT_SOURCE_IMPORTED',
  'BODY_MEASUREMENT_SOURCE_DERIVED',
]);

export async function fingerprintSavedPlacementModelInputsV1(
  model: common_Model,
  signal?: AbortSignal,
) {
  const { id: modelId, model: saved } = model;
  if (
    !Number.isSafeInteger(modelId) ||
    !modelId ||
    modelId < 1 ||
    !saved?.gender ||
    !genderValues.has(saved.gender) ||
    !Array.isArray(saved.measurements) ||
    saved.measurements.length === 0
  )
    throw new Error('The current saved model has no complete physical input identity.');
  const measurements = saved.measurements.map(({ name, valueMm, metadata }) => {
    if (
      !name ||
      name === 'BODY_MEASUREMENT_NAME_UNKNOWN' ||
      !/^BODY_MEASUREMENT_NAME_[A-Z][A-Z_]*$/.test(name) ||
      !Number.isSafeInteger(valueMm) ||
      !valueMm ||
      valueMm < 1 ||
      valueMm > 5_000
    )
      throw new Error('The saved model has an invalid measurement.');
    if (!metadata) return { name, valueMm, metadata: null };
    const { protocolId, schemaVersion, source } = metadata;
    if (schemaVersion !== 1 || !protocolId || !source || !measuredSources.has(source))
      throw new Error('The saved model has invalid measurement provenance.');
    return { name, valueMm, metadata: { protocolId, schemaVersion, source } };
  });
  measurements.sort(({ name: a }, { name: b }) => (a < b ? -1 : a > b ? 1 : 0));
  if (new Set(measurements.map(({ name }) => name)).size !== measurements.length)
    throw new Error('The saved model has duplicate physical measurements.');

  return computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
    bodyInputDomain,
    { gender: saved.gender, measurements, modelId },
    undefined,
    signal,
    32_768,
  );
}

/** Matches the actual displayed neutral document to fresh model and model-pose reads. */
export async function readCurrentSavedNeutralPlacementModelV1(
  body: ModelDisplayedTriangleBodyOwnedInputV1,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const displayed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  const modelId = Number(
    displayed?.identity.modelId.match(/^tech-card-base-model:([1-9][0-9]*)$/)?.[1],
  );
  if (!displayed || !Number.isSafeInteger(modelId) || !hasExactNeutralPose(displayed))
    throw new Error('A currently displayed, exact neutral saved mannequin is required.');

  const client = abortableAdminService(signal);
  const [{ model }, state] = await Promise.all([
    client.GetModel({ id: modelId }),
    getModelMannequinPoseV1(client, modelId),
  ]);
  signal.throwIfAborted();
  if (
    model?.id !== modelId ||
    !model.updatedAt ||
    !/Z$/.test(model.updatedAt) ||
    !Number.isFinite(Date.parse(model.updatedAt)) ||
    modelFormRevisionKeyV1(model) !== displayed.identity.modelContentRevision ||
    state.kind !== 'absent'
  )
    throw new Error(
      'The saved model or its stored pose differs from the displayed neutral mannequin.',
    );

  const [modelPhysicalInputsSha256, poseFingerprint] = await Promise.all([
    fingerprintSavedPlacementModelInputsV1(model, signal),
    fingerprintModelMannequinPoseDocumentV2(neutralPose),
  ]);
  signal.throwIfAborted();
  if (!body.isCurrent())
    throw new Error('The displayed mannequin changed during placement verification.');
  return Object.freeze({
    modelId,
    modelUpdatedAt: model.updatedAt,
    modelPhysicalInputsSha256,
    pose: Object.freeze({
      kind: 'neutral-default-direct-v9' as const,
      canonicalSha256: poseFingerprint.slice('sha256:'.length),
    }),
    observed: Object.freeze({
      bodyPositionsFloat32LeSha256: displayed.hashes.bodyPositionsFloat32LeSha256,
      bodyTrianglesUint32LeSha256: displayed.hashes.bodyTrianglesUint32LeSha256,
    }),
  });
}

type DisplayedPlacementBody = Pick<
  ModelDisplayedTriangleBodyInputProjectionV1,
  'poseDocument' | 'displayedPose' | 'hashes'
> &
  Readonly<{
    identity: Pick<
      ModelDisplayedTriangleBodyInputProjectionV1['identity'],
      'modelId' | 'poseDocumentCanonicalKey'
    >;
  }>;

function hasExactNeutralPose(displayed: Omit<DisplayedPlacementBody, 'hashes'>) {
  return (
    displayed.identity.poseDocumentCanonicalKey === neutralPoseKey &&
    encodeModelMannequinPoseDocumentV2(displayed.poseDocument) === neutralPoseKey &&
    encodeModelMannequinPoseDocumentV2(
      createModelMannequinPoseDocumentV2(displayed.displayedPose),
    ) === neutralPoseKey
  );
}

/** A previously saved neutral placement is valid only for its exact observed body and pose. */
export function matchesSavedNeutralPlacementBodyV1(
  displayed: DisplayedPlacementBody | null,
  saved: Awaited<ReturnType<typeof readCurrentSavedNeutralPlacementModelV1>>,
) {
  return (
    displayed?.identity.modelId === `tech-card-base-model:${saved.modelId}` &&
    displayed.hashes.bodyPositionsFloat32LeSha256 === saved.observed.bodyPositionsFloat32LeSha256 &&
    displayed.hashes.bodyTrianglesUint32LeSha256 === saved.observed.bodyTrianglesUint32LeSha256 &&
    hasExactNeutralPose(displayed)
  );
}
