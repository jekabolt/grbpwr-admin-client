import { describe, expect, it, vi } from 'vitest';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from 'lib/cloth/body/measurement-body-synthetic-corpus';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from './model-open-reference-direct-pose-v9';
import {
  createModelOpenReferenceDisplayedBodySnapshotObserverV1,
  type ModelOpenReferenceDisplayedBodyObservationInputV1,
  type ModelOpenReferenceDisplayedBodySnapshotV1,
} from './model-open-reference-displayed-body-snapshot-v1';

function fixture(): ModelOpenReferenceDisplayedBodyObservationInputV1 {
  const document = createModelMannequinPoseDocumentV2(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
  const built = {
    bodyBuildFingerprint: 'test-body-build',
    frame: createMeasurementBodyFrameV2({
      measurements: CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      sourceRevision: 'test-runtime-source',
    }),
    runtime: {
      sourceRevision: 'test-runtime-source',
      displayMesh: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        vertexCount: 3,
        triangleCount: 1,
        byteLength: 48,
      },
    },
  };
  return {
    modelId: 'test-model',
    modelContentRevision: 'test-model-revision',
    basisKind: 'neutral',
    inputFingerprint: 'test-input',
    bodyBuildFingerprint: built.bodyBuildFingerprint,
    editorVersion: 'full-body-v9',
    bodyDisplayOwnership: 'current',
    stageStatus: 'ready',
    updateStatus: 'idle',
    resolutionOk: true,
    poseBlocked: false,
    currentBuilt: built,
    displayedBuilt: built,
    stageAcceptance: {
      frame: built.frame,
      mesh: built.runtime.displayMesh,
      sourcePositions: built.runtime.displayMesh.positions,
      positions: built.runtime.displayMesh.positions.slice(),
      indices: built.runtime.displayMesh.indices.slice(),
    },
    matchingLivePoseFrame: null,
    acceptedLivePose: null,
    appliedPose: document.pose,
    draftPose: document.pose,
    directPoseBinding: { document, canonicalKey: encodeModelMannequinPoseDocumentV2(document) },
  };
}

function capture() {
  const values: (ModelOpenReferenceDisplayedBodySnapshotV1 | null)[] = [];
  const callback = vi.fn((value: ModelOpenReferenceDisplayedBodySnapshotV1 | null) => {
    values.push(value);
  });
  return { callback, values };
}

describe('displayed body CPU observation without cloth authority', () => {
  it.each(['neutral', 'female', 'male'] as const)(
    'preserves the explicitly resolved %s basis without parsing fingerprints',
    (basisKind) => {
      const { callback, values } = capture();
      createModelOpenReferenceDisplayedBodySnapshotObserverV1().observe(
        { ...fixture(), basisKind },
        callback,
      );
      expect(values[0]!.basisKind).toBe(basisKind);
    },
  );

  it('detaches exact current geometry, frame and pose data in both directions', () => {
    const input = fixture();
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const { callback, values } = capture();
    observer.observe(input, callback);
    const snapshot = values[0]!;

    expect(snapshot).toMatchObject({
      modelId: input.modelId,
      modelContentRevision: input.modelContentRevision,
      basisKind: 'neutral',
      inputFingerprint: input.inputFingerprint,
      bodyBuildFingerprint: input.bodyBuildFingerprint,
      runtimeSourceRevision: input.currentBuilt!.runtime.sourceRevision,
      frameRevision: input.currentBuilt!.frame.revision,
      displayPositionSource: 'built-runtime',
      collisionAuthority: false,
      runtimeAuthority: false,
      productionAuthority: false,
      canonicalAuthority: false,
    });
    expect(snapshot.frame).toEqual(input.currentBuilt!.frame);
    expect(snapshot.frame).not.toBe(input.currentBuilt!.frame);
    expect(snapshot.frame.landmarks[0]).not.toBe(input.currentBuilt!.frame.landmarks[0]);
    expect(snapshot.poseDocument).toEqual(input.directPoseBinding!.document);
    expect(snapshot.poseDocument.pose.leftArm).not.toBe(
      input.directPoseBinding!.document.pose.leftArm,
    );
    expect(snapshot.appliedPose).not.toBe(input.appliedPose);
    expect(snapshot.draftPose).not.toBe(input.draftPose);
    Object.assign(snapshot.frame.measurements, { heightMm: 999 });
    Object.assign(snapshot.poseDocument.pose.leftArm, { elbowBendDegrees: 10 });
    expect(input.currentBuilt!.frame.measurements.heightMm).toBe(1720);
    expect(input.directPoseBinding!.document.pose.leftArm.elbowBendDegrees).toBe(0);
    expect(snapshot.displayMesh.positions).toEqual(
      input.currentBuilt!.runtime.displayMesh.positions,
    );
    expect(snapshot.displayMesh.indices).toEqual(input.currentBuilt!.runtime.displayMesh.indices);
    snapshot.displayMesh.positions[0] = 50;
    snapshot.displayMesh.indices[0] = 2;
    expect(input.currentBuilt!.runtime.displayMesh.positions[0]).toBe(0);
    expect(input.currentBuilt!.runtime.displayMesh.indices[0]).toBe(0);
    observer.observe(input, callback);
    expect(callback).toHaveBeenCalledOnce();
    input.currentBuilt!.runtime.displayMesh.positions[1] = 0.5;
    expect(snapshot.displayMesh.positions[1]).toBe(0);
  });

  it('uses current live positions and their accepted pose even when the build pose is older', () => {
    const initial = fixture();
    const document = createModelMannequinPoseDocumentV2({ ...initial.draftPose!, headYawDeg: 5 });
    const live = {
      bodyBuildFingerprint: initial.bodyBuildFingerprint,
      bodySourceRevision: initial.currentBuilt!.runtime.sourceRevision,
      positions: new Float32Array([0.1, 0, 0, 1.1, 0, 0, 0.1, 1, 0]),
      groups: null,
      jointOverlaySignature: null,
    };
    const input = {
      ...initial,
      matchingLivePoseFrame: live,
      acceptedLivePose: { frame: live, pose: document.pose },
      stageAcceptance: {
        ...initial.stageAcceptance!,
        sourcePositions: live.positions,
        positions: live.positions.slice(),
      },
      draftPose: document.pose,
      directPoseBinding: { document, canonicalKey: encodeModelMannequinPoseDocumentV2(document) },
    };
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const { callback, values } = capture();
    observer.observe(input, callback);
    const snapshot = values[0]!;
    expect(snapshot.displayPositionSource).toBe('live-pose');
    expect(snapshot.displayMesh.positions).toEqual(live.positions);
    expect(snapshot.displayMesh.positions).not.toBe(live.positions);
    expect(snapshot.displayedPose.headYawDeg).toBe(5);
    expect(snapshot.appliedPose.headYawDeg).toBe(0);

    // A live solve can retain the same source revision and typed-array identity.
    live.positions[0] += 0.125;
    observer.observe(input, callback);
    expect(values[1]).toBeNull();
    input.stageAcceptance.positions.set(live.positions);
    observer.observe(input, callback);
    expect(values[2]!.observationId).not.toBe(snapshot.observationId);
    expect(values[2]!.displayMesh.positions[0]).toBe(live.positions[0]);
    expect(snapshot.displayMesh.positions[0]).not.toBe(live.positions[0]);
  });

  it.each([
    ['empty', { bodyDisplayOwnership: 'empty' }],
    ['preparing', { bodyDisplayOwnership: 'preparing' }],
    ['retained pending', { bodyDisplayOwnership: 'retained-pending' }],
    ['retained invalid', { bodyDisplayOwnership: 'retained-invalid' }],
    ['retained error', { bodyDisplayOwnership: 'retained-error' }],
    ['stage initializing', { stageStatus: 'initializing' }],
    ['stage error', { stageStatus: 'error' }],
    ['update pending', { updateStatus: 'building' }],
    ['update error', { updateStatus: 'error' }],
    ['invalid measurement input', { resolutionOk: false }],
    ['blocked pose', { poseBlocked: true }],
    ['missing current owner', { currentBuilt: null }],
    ['unsupported base basis', { basisKind: 'base' }],
    ['unresolved basis', { basisKind: null }],
    ['stage rejection or teardown', { stageAcceptance: null }],
  ] satisfies readonly (readonly [
    string,
    Partial<ModelOpenReferenceDisplayedBodyObservationInputV1>,
  ])[])(
    'revokes promptly for %s and recovers only after current readiness returns',
    (_label, change) => {
      const input = fixture();
      const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
      const { callback, values } = capture();
      observer.observe(input, callback);
      observer.observe({ ...input, ...change }, callback);
      expect(values[1]).toBeNull();
      observer.observe({ ...input, ...change }, callback);
      expect(values).toHaveLength(2);
      observer.observe(input, callback);
      expect(values[2]!.observationId).not.toBe(values[0]!.observationId);
    },
  );

  it('refuses a distinct retained build, stale source or a live frame without its accepted pose', () => {
    const input = fixture();
    const live = {
      bodyBuildFingerprint: input.bodyBuildFingerprint,
      bodySourceRevision: input.currentBuilt!.runtime.sourceRevision,
      positions: input.currentBuilt!.runtime.displayMesh.positions,
      groups: null,
      jointOverlaySignature: null,
    };
    const changes: Partial<ModelOpenReferenceDisplayedBodyObservationInputV1>[] = [
      { displayedBuilt: { ...input.currentBuilt! } },
      { bodyBuildFingerprint: 'different-request' },
      { matchingLivePoseFrame: live },
      {
        matchingLivePoseFrame: live,
        acceptedLivePose: { frame: { ...live }, pose: input.draftPose! },
      },
      {
        matchingLivePoseFrame: { ...live, bodySourceRevision: 'stale-source' },
        acceptedLivePose: { frame: live, pose: input.draftPose! },
      },
    ];
    for (const change of changes) {
      const { callback, values } = capture();
      createModelOpenReferenceDisplayedBodySnapshotObserverV1().observe(
        { ...input, ...change },
        callback,
      );
      expect(values).toEqual([null]);
    }
  });

  it('refuses requested pose or document identity that differs from the displayed pose', () => {
    const input = fixture();
    const changedDocument = createModelMannequinPoseDocumentV2({
      ...input.draftPose!,
      headYawDeg: 5,
    });
    const changes: Partial<ModelOpenReferenceDisplayedBodyObservationInputV1>[] = [
      { draftPose: changedDocument.pose },
      {
        directPoseBinding: {
          document: changedDocument,
          canonicalKey: encodeModelMannequinPoseDocumentV2(changedDocument),
        },
      },
      { directPoseBinding: { ...input.directPoseBinding!, canonicalKey: 'stale-document-key' } },
      { directPoseBinding: null },
    ];
    for (const change of changes) {
      const { callback, values } = capture();
      createModelOpenReferenceDisplayedBodySnapshotObserverV1().observe(
        { ...input, ...change },
        callback,
      );
      expect(values).toEqual([null]);
    }
  });

  it('requires stage acceptance of this exact frame, mesh, position source and topology', () => {
    const input = fixture();
    const accepted = input.stageAcceptance!;
    const changes = [
      { frame: { ...accepted.frame } },
      { mesh: { ...accepted.mesh } },
      { sourcePositions: accepted.sourcePositions.slice() },
      { positions: new Float32Array(accepted.positions.length) },
      { indices: new Uint32Array([0, 2, 1]) },
    ];
    for (const change of changes) {
      const { callback, values } = capture();
      createModelOpenReferenceDisplayedBodySnapshotObserverV1().observe(
        { ...input, stageAcceptance: { ...accepted, ...change } },
        callback,
      );
      expect(values).toEqual([null]);
    }
  });

  it('revokes invalid displayed geometry instead of forwarding it', () => {
    const input = fixture();
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const { callback, values } = capture();
    observer.observe(input, callback);
    input.currentBuilt!.runtime.displayMesh.positions[0] = Number.NaN;
    observer.observe(input, callback);
    expect(values.at(-1)).toBeNull();
    input.currentBuilt!.runtime.displayMesh.positions[0] = 0;
    input.currentBuilt!.runtime.displayMesh.indices[0] = 3;
    observer.observe(input, callback);
    expect(values).toHaveLength(2);
  });

  it('does no geometry work without an observer and avoids callback-identity render loops', () => {
    const input = fixture();
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const unavailable = Object.defineProperty({ ...input }, 'currentBuilt', {
      get() {
        throw new Error('Geometry must not be inspected without a listener.');
      },
    });
    observer.observe(unavailable);
    const first = capture();
    const second = capture();
    observer.observe(input, first.callback);
    observer.observe(input, second.callback);
    expect(first.callback).toHaveBeenCalledOnce();
    expect(second.callback).not.toHaveBeenCalled();
    observer.dispose();
    expect(second.callback).toHaveBeenCalledExactlyOnceWith(null);
    observer.observe(input, second.callback);
    observer.dispose();
    expect(second.callback).toHaveBeenCalledOnce();
  });

  it('revokes on unsubscribe and emits a new detached observation when resubscribed', () => {
    const input = fixture();
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const { callback, values } = capture();
    observer.observe(input, callback);
    observer.observe(input);
    expect(values[1]).toBeNull();
    observer.observe(input, callback);
    expect(values[2]!.observationId).not.toBe(values[0]!.observationId);
  });
  it('revokes synchronously on Stage loss before the next render, then accepts only a new observation', () => {
    const { callback, values } = capture();
    const observer = createModelOpenReferenceDisplayedBodySnapshotObserverV1();
    const input = fixture();
    observer.observe(input, callback);
    const first = values.at(-1)!;
    observer.invalidate();
    expect(values.at(-1)).toBeNull();
    observer.invalidate();
    expect(values).toHaveLength(2);
    observer.observe({ ...input, stageAcceptance: null }, callback);
    expect(values).toHaveLength(2);
    observer.observe(input, callback);
    expect(values.at(-1)?.observationId).not.toBe(first.observationId);
    observer.dispose();
    observer.invalidate();
    expect(values).toHaveLength(4);
  });
});
