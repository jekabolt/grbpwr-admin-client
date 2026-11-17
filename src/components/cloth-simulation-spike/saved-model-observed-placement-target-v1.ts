import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodySnapshotV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import {
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { modelOpenReferenceDirectPoseGeometryEqualV9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { sha256Hex } from 'lib/features/sha256';

import {
  SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1,
  savedModelObservedPlacementTargetCodecInternalsV1,
  type SavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetResultV1,
} from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
// Preserve the original component API; pure implementation helpers are not a compatibility export.
export {
  SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1,
  validateSavedModelObservedPlacementTargetV1,
  encodeSavedModelObservedPlacementTargetV1,
  decodeSavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetResultV1,
} from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
const {
  Failure,
  failure,
  checkSignal,
  plain,
  canonical,
  hash,
  validate,
  result,
  aborted,
}: typeof savedModelObservedPlacementTargetCodecInternalsV1 =
  savedModelObservedPlacementTargetCodecInternalsV1;
// An explicit never-returning binding preserves TypeScript's control-flow narrowing after extraction.
const fail: typeof savedModelObservedPlacementTargetCodecInternalsV1.fail =
  savedModelObservedPlacementTargetCodecInternalsV1.fail;

/** Does not abort or dispose a borrowed body. A late fresh-read result is observed and ignored. */
function localWait<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
      callback();
    };
    const cancel = () =>
      finish(() => reject(new Failure('cancelled', 'Target projection cancelled.')));
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal)
      EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
    try {
      checkSignal(signal);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
function raw(values: Float32Array | Uint32Array) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) =>
    values instanceof Float32Array
      ? view.setFloat32(index * 4, value, true)
      : view.setUint32(index * 4, value, true),
  );
  return bytes;
}
async function fromSnapshot(
  snapshot: SavedModelDisplayedTriangleBodySnapshotV2,
): Promise<SavedModelObservedPlacementTargetV1> {
  const binding = snapshot.binding;
  const identity = binding.displayedIdentity;
  if (
    identity.modelContentRevision !== binding.modelFormRevision ||
    identity.frameRevision !== snapshot.frame.revision ||
    snapshot.frame.sourceRevision !== identity.runtimeSourceRevision ||
    canonical(snapshot.frame.measurements) !== canonical(snapshot.canonicalMeasurements) ||
    encodeModelMannequinPoseDocumentV2(snapshot.poseDocument) !==
      identity.poseDocumentCanonicalKey ||
    !modelOpenReferenceDirectPoseGeometryEqualV9(snapshot.displayedPose, snapshot.poseDocument.pose)
  )
    fail('body-changed', 'Observed model, frame measurements or exact pose document differ.');
  const [positions, triangles, pose, frame] = await Promise.all([
    sha256Hex(raw(snapshot.bodyPositionsM)),
    sha256Hex(raw(snapshot.bodyTriangles)),
    fingerprintModelMannequinPoseDocumentV2(snapshot.poseDocument),
    hash(['saved-model-observed-placement-frame/v1', snapshot.frame]),
  ]);
  if (
    positions !== binding.rawBodyPositionsFloat32LeSha256 ||
    triangles !== binding.rawBodyTrianglesUint32LeSha256 ||
    snapshot.counts.vertexCount * 3 !== snapshot.bodyPositionsM.length ||
    snapshot.counts.triangleCount * 3 !== snapshot.bodyTriangles.length
  )
    fail('body-changed', 'Observed geometry differs from its retained exact binding.');
  return validate({
    kind: SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1,
    persistedModel: binding.persistedModel,
    displayedModel: {
      modelId: identity.modelId,
      modelContentRevision: identity.modelContentRevision,
      basisKind: identity.basisKind,
      inputFingerprint: identity.inputFingerprint,
      bodyBuildFingerprint: identity.bodyBuildFingerprint,
      runtimeSourceRevision: identity.runtimeSourceRevision,
    },
    canonicalMeasurementsSha256: binding.canonicalMeasurementsSha256,
    pose: { document: snapshot.poseDocument, canonicalSha256: pose.slice(7) },
    geometry: {
      positionsFloat32LeSha256: positions,
      trianglesUint32LeSha256: triangles,
      ...snapshot.counts,
    },
    frame: {
      version: snapshot.frame.version,
      id: snapshot.frame.id,
      revision: snapshot.frame.revision,
      sourceRevision: snapshot.frame.sourceRevision,
      units: snapshot.frame.units,
      coordinateSystem: snapshot.frame.coordinateSystem,
      canonicalSha256: frame,
    },
  });
}

/** Fresh genuine projection for a future producer; the returned DTO itself grants no authority. */
export async function projectSavedModelObservedPlacementTargetV1(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
  expectedBinding: SavedModelDisplayedTriangleBodyBindingV2,
  signal?: AbortSignal,
): Promise<SavedModelObservedPlacementTargetResultV1> {
  try {
    checkSignal(signal);
    const binding = plain(expectedBinding) as SavedModelDisplayedTriangleBodyBindingV2;
    const lifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(owner, binding);
    if (!lifetime) fail('body-unavailable', 'A genuine current observed-body owner is required.');
    const current = () => {
      checkSignal(signal);
      if (
        aborted.call(lifetime) ||
        getSavedModelDisplayedTriangleBodyLifetimeV2(owner, binding) !== lifetime
      )
        fail('body-changed', 'Observed body was replaced or revoked.');
    };
    const fresh = async () => {
      // Forwarding this operation's signal would let the upstream projector revoke shared body.
      const projected = await localWait(
        projectSavedModelDisplayedTriangleBodyV2(owner, binding),
        signal,
      );
      current();
      if (projected.status !== 'projected')
        fail('body-unavailable', 'Fresh observed body projection failed.');
      return projected.snapshot;
    };
    const first = await fresh();
    current();
    const target = await localWait(fromSnapshot(first), signal);
    current();
    const checked = await localWait(result(target), signal);
    current();
    const last = await fresh();
    current();
    // Exact ephemeral binding is used for currentness only, never included in durable metadata.
    if (
      canonical(last.binding) !== canonical(first.binding) ||
      canonical(last.frame) !== canonical(first.frame) ||
      canonical(last.poseDocument) !== canonical(first.poseDocument)
    )
      fail('body-changed', 'Observed body changed before target publication.');
    current();
    return checked;
  } catch (error) {
    return failure(error);
  }
}
