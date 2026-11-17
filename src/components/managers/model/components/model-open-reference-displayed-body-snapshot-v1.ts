import type { MeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import type { MeasurementSurfaceDisplayedGeometryAcceptanceV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import {
  encodeModelMannequinPoseDocumentV2,
  type ModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';
import {
  modelOpenReferenceDirectPoseGeometryEqualV9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import type { ModelOpenReferenceLivePoseFrameV10 } from './model-open-reference-preview';

// Existing V11 display ownership only; these snapshots grant no cloth admission.
type ModelOpenReferenceBodyDisplayOwnershipV11 =
  | 'empty'
  | 'current'
  | 'preparing'
  | 'retained-pending'
  | 'retained-invalid'
  | 'retained-error';

export interface ModelOpenReferenceDisplayedBodySnapshotV1 {
  readonly schemaVersion: 'model-open-reference-displayed-body-snapshot/v1';
  /** Local observation identity changes with exact geometry or binding data; not a durable seal. */
  readonly observationId: string;
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly basisKind: 'neutral' | 'female' | 'male';
  readonly inputFingerprint: string;
  readonly bodyBuildFingerprint: string;
  readonly runtimeSourceRevision: string;
  readonly frameRevision: MeasurementBodyFrameV2['revision'];
  readonly displayPositionSource: 'live-pose' | 'built-runtime';
  readonly frame: MeasurementBodyFrameV2;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly poseDocument: ModelMannequinPoseDocumentV2;
  readonly poseDocumentCanonicalKey: string;
  readonly displayedPose: ModelOpenReferenceDirectPoseV9;
  readonly appliedPose: ModelOpenReferenceDirectPoseV9;
  readonly draftPose: ModelOpenReferenceDirectPoseV9;
  readonly collisionAuthority: false;
  readonly runtimeAuthority: false;
  readonly productionAuthority: false;
  readonly canonicalAuthority: false;
}

export type ModelOpenReferenceDisplayedBodyObserverV1 = (
  snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 | null,
) => void;

interface DisplayedBodyBuildV1 {
  readonly bodyBuildFingerprint: string;
  readonly frame: MeasurementBodyFrameV2;
  readonly runtime: Readonly<{
    sourceRevision: string;
    displayMesh: MeasurementSurfaceMeshV1;
  }>;
}

export interface ModelOpenReferenceDisplayedBodyObservationInputV1 {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly basisKind: 'neutral' | 'female' | 'male' | 'base' | null;
  readonly inputFingerprint: string;
  readonly bodyBuildFingerprint: string;
  readonly editorVersion: string;
  readonly bodyDisplayOwnership: ModelOpenReferenceBodyDisplayOwnershipV11;
  readonly stageStatus: string;
  readonly updateStatus: 'idle' | 'building' | 'error';
  readonly resolutionOk: boolean;
  readonly poseBlocked: boolean;
  readonly currentBuilt: DisplayedBodyBuildV1 | null;
  readonly displayedBuilt: DisplayedBodyBuildV1 | null;
  readonly stageAcceptance: MeasurementSurfaceDisplayedGeometryAcceptanceV1 | null;
  readonly matchingLivePoseFrame: ModelOpenReferenceLivePoseFrameV10 | null;
  readonly acceptedLivePose: Readonly<{
    frame: ModelOpenReferenceLivePoseFrameV10;
    pose: ModelOpenReferenceDirectPoseV9;
  }> | null;
  readonly appliedPose: ModelOpenReferenceDirectPoseV9 | null;
  readonly draftPose: ModelOpenReferenceDirectPoseV9 | null;
  readonly directPoseBinding: Readonly<{
    document: ModelMannequinPoseDocumentV2;
    canonicalKey: string;
  }> | null;
}

let nextObservationId = 0;

function candidate(input: ModelOpenReferenceDisplayedBodyObservationInputV1) {
  const built = input.currentBuilt;
  const binding = input.directPoseBinding;
  if (
    input.editorVersion !== 'full-body-v9' ||
    (input.basisKind !== 'neutral' && input.basisKind !== 'female' && input.basisKind !== 'male') ||
    input.bodyDisplayOwnership !== 'current' ||
    input.stageStatus !== 'ready' ||
    input.updateStatus !== 'idle' ||
    !input.resolutionOk ||
    input.poseBlocked ||
    !built ||
    input.displayedBuilt !== built ||
    built.bodyBuildFingerprint !== input.bodyBuildFingerprint ||
    built.frame.sourceRevision !== built.runtime.sourceRevision ||
    !binding ||
    !input.appliedPose ||
    !input.draftPose ||
    encodeModelMannequinPoseDocumentV2(binding.document) !== binding.canonicalKey
  )
    return null;

  const live = input.matchingLivePoseFrame;
  if (
    live &&
    (live.bodyBuildFingerprint !== built.bodyBuildFingerprint ||
      live.bodySourceRevision !== built.runtime.sourceRevision ||
      input.acceptedLivePose?.frame !== live)
  )
    return null;
  const displayedPose = live ? input.acceptedLivePose!.pose : input.appliedPose;
  if (
    !modelOpenReferenceDirectPoseGeometryEqualV9(displayedPose, input.draftPose) ||
    !modelOpenReferenceDirectPoseGeometryEqualV9(displayedPose, binding.document.pose)
  )
    return null;

  const mesh = built.runtime.displayMesh;
  const sourcePositions = live?.positions ?? mesh.positions;
  const accepted = input.stageAcceptance;
  if (
    !accepted ||
    accepted.frame !== built.frame ||
    accepted.mesh !== mesh ||
    accepted.sourcePositions !== sourcePositions ||
    !sameValues(accepted.positions, sourcePositions) ||
    !sameValues(accepted.indices, mesh.indices)
  )
    return null;
  const positions = accepted.positions;
  if (
    !(positions instanceof Float32Array) ||
    !(mesh.indices instanceof Uint32Array) ||
    positions.length === 0 ||
    positions.length !== mesh.positions.length ||
    positions.length !== mesh.vertexCount * 3 ||
    mesh.indices.length === 0 ||
    mesh.indices.length !== mesh.triangleCount * 3 ||
    !positions.every(Number.isFinite) ||
    !mesh.indices.every((index) => index < mesh.vertexCount)
  )
    return null;

  const metadata = {
    modelId: input.modelId,
    modelContentRevision: input.modelContentRevision,
    basisKind: input.basisKind,
    inputFingerprint: input.inputFingerprint,
    bodyBuildFingerprint: built.bodyBuildFingerprint,
    runtimeSourceRevision: built.runtime.sourceRevision,
    frameRevision: built.frame.revision,
    displayPositionSource: live ? ('live-pose' as const) : ('built-runtime' as const),
    frame: built.frame,
    poseDocument: binding.document,
    poseDocumentCanonicalKey: binding.canonicalKey,
    displayedPose,
    appliedPose: input.appliedPose,
    draftPose: input.draftPose,
  };
  return { metadata, metadataKey: JSON.stringify(metadata), positions, indices: accepted.indices };
}

function sameValues(left: Float32Array | Uint32Array, right: Float32Array | Uint32Array) {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

/** Observes the existing renderer inputs. It neither builds a body nor issues cloth authority. */
export function createModelOpenReferenceDisplayedBodySnapshotObserverV1() {
  let disposed = false;
  let listener: ModelOpenReferenceDisplayedBodyObserverV1 | undefined;
  let emitted = false;
  let current: Readonly<{
    metadataKey: string;
    positions: Float32Array;
    indices: Uint32Array;
  }> | null = null;

  const revoke = () => {
    const notify = current !== null || !emitted;
    current = null;
    if (listener && notify) {
      emitted = true;
      listener(null);
    }
  };

  return Object.freeze({
    observe(
      input: ModelOpenReferenceDisplayedBodyObservationInputV1,
      onSnapshot?: ModelOpenReferenceDisplayedBodyObserverV1,
    ) {
      if (disposed) return;
      if (!onSnapshot) {
        revoke();
        listener = undefined;
        emitted = false;
        return;
      }
      // Inline callback identity churn must not republish a snapshot and cause a render loop.
      listener = onSnapshot;
      let next: ReturnType<typeof candidate>;
      try {
        next = candidate(input);
      } catch {
        next = null;
      }
      if (!next) {
        revoke();
        return;
      }
      if (
        current?.metadataKey === next.metadataKey &&
        sameValues(current.positions, next.positions) &&
        sameValues(current.indices, next.indices)
      )
        return;
      // Keep private comparison bytes separate from the mutable typed arrays given to consumers.
      current = {
        metadataKey: next.metadataKey,
        positions: next.positions.slice(),
        indices: next.indices.slice(),
      };
      const snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 = Object.freeze({
        schemaVersion: 'model-open-reference-displayed-body-snapshot/v1',
        observationId: `displayed-body-observation:${++nextObservationId}`,
        ...structuredClone(next.metadata),
        displayMesh: Object.freeze({
          positions: current.positions.slice(),
          indices: current.indices.slice(),
          vertexCount: current.positions.length / 3,
          triangleCount: current.indices.length / 3,
          byteLength: current.positions.byteLength + current.indices.byteLength,
        }),
        collisionAuthority: false,
        runtimeAuthority: false,
        productionAuthority: false,
        canonicalAuthority: false,
      });
      emitted = true;
      listener(snapshot);
    },
    /** Immediate Stage loss/rebuild revocation before React publishes the next render. */
    invalidate() {
      if (!disposed) revoke();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revoke();
      listener = undefined;
    },
  });
}
