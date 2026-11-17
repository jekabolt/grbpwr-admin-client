import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from 'lib/cloth/body/measurement-body-synthetic-corpus';
import {
  buildModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyIdentityV1,
} from './model-displayed-triangle-body-input-v1';

function fixture(): ModelOpenReferenceDisplayedBodySnapshotV1 {
  const poseDocument = createModelMannequinPoseDocumentV2(
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements: CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
    sourceRevision: 'display-source:test',
  });
  return structuredClone({
    schemaVersion: 'model-open-reference-displayed-body-snapshot/v1',
    observationId: 'host-observation:1',
    modelId: 'model:7',
    modelContentRevision: 'model:7:revision:4',
    basisKind: 'neutral',
    inputFingerprint: 'measurements:current',
    bodyBuildFingerprint: 'display-build:1',
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
    poseDocument,
    poseDocumentCanonicalKey: encodeModelMannequinPoseDocumentV2(poseDocument),
    displayedPose: poseDocument.pose,
    appliedPose: poseDocument.pose,
    draftPose: poseDocument.pose,
    canonicalAuthority: false,
    collisionAuthority: false,
    runtimeAuthority: false,
    productionAuthority: false,
  });
}
function expected(
  snapshot: ModelOpenReferenceDisplayedBodySnapshotV1,
): ModelDisplayedTriangleBodyIdentityV1 {
  const {
    observationId,
    modelId,
    modelContentRevision,
    basisKind,
    inputFingerprint,
    bodyBuildFingerprint,
    runtimeSourceRevision,
    frameRevision,
    poseDocumentCanonicalKey,
    displayPositionSource,
  } = snapshot;
  return {
    observationId,
    modelId,
    modelContentRevision,
    basisKind,
    inputFingerprint,
    bodyBuildFingerprint,
    runtimeSourceRevision,
    frameRevision,
    poseDocumentCanonicalKey,
    displayPositionSource,
  };
}
afterEach(() => vi.restoreAllMocks());

describe('body-only input from current host display observation', () => {
  it('owns detached finite geometry/frame with independently verified hashes and honest unqualified claims', async () => {
    const snapshot = fixture();
    const reader = vi.fn(() => snapshot);
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: reader,
      expected: expected(snapshot),
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(reader).toHaveBeenCalledTimes(2);
    const projection = result.input.project()!;
    expect(projection.identity).toEqual(expected(snapshot));
    expect(projection.frame).toEqual(snapshot.frame);
    expect(projection.frame).not.toBe(snapshot.frame);
    expect(projection.bodyPositionsM).toEqual(snapshot.displayMesh.positions);
    expect(projection.bodyPositionsM).not.toBe(snapshot.displayMesh.positions);
    expect(projection.hashes.bodyPositionsFloat32LeSha256).toBe(
      createHash('sha256')
        .update(new Uint8Array(snapshot.displayMesh.positions.buffer))
        .digest('hex'),
    );
    expect(projection.hashes.bodyTrianglesUint32LeSha256).toBe(
      createHash('sha256')
        .update(new Uint8Array(snapshot.displayMesh.indices.buffer))
        .digest('hex'),
    );
    expect(projection.claims).toEqual({
      hostObservationConsumed: true,
      geometryCopied: true,
      currentIdentityAndContentRechecked: true,
      viewportAuthorityAuthenticated: false,
      bodyTopologyEvaluated: false,
      bodySelfIntersectionEvaluated: false,
      garmentPairEvaluated: false,
      canonicalAuthority: false,
      collisionAuthority: false,
      runtimeAuthority: false,
      productionAuthority: false,
    });
    snapshot.displayMesh.positions[0] = 5;
    snapshot.displayMesh.indices[0] = 2;
    projection.bodyPositionsM[0] = 9;
    projection.bodyTriangles[0] = 1;
    expect(result.input.project()!.bodyPositionsM[0]).toBe(0);
    expect(result.input.project()!.bodyTriangles[0]).toBe(0);
    expect(result.input.dispose()).toBe(true);
    expect(result.input.project()).toBeNull();
    expect(result.input.dispose()).toBe(false);
    expect(projection.bodyPositionsM[0]).toBe(9);
  });

  it('accepts a non-neutral host pose without claiming canonical qualification', async () => {
    const initial = fixture();
    const document = createModelMannequinPoseDocumentV2({
      ...initial.displayedPose,
      headYawDeg: 5,
    });
    const snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 = {
      ...initial,
      displayPositionSource: 'live-pose',
      poseDocument: document,
      poseDocumentCanonicalKey: encodeModelMannequinPoseDocumentV2(document),
      displayedPose: document.pose,
      draftPose: document.pose,
    };
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: () => snapshot,
      expected: expected(snapshot),
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.input.project()!.displayedPose.headYawDeg).toBe(5);
    expect(result.input.project()!.claims.canonicalAuthority).toBe(false);
    result.input.dispose();
  });

  it.each([
    'observationId',
    'modelId',
    'modelContentRevision',
    'inputFingerprint',
    'bodyBuildFingerprint',
    'runtimeSourceRevision',
    'poseDocumentCanonicalKey',
  ] as const)('rejects stale expected %s before digest', async (key) => {
    const snapshot = fixture();
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: () => snapshot,
      expected: { ...expected(snapshot), [key]: 'stale' },
    });
    expect(result).toMatchObject({ ok: false, code: 'identity-mismatch', input: null });
  });

  it.each(['positions', 'indices', 'identity', 'frame', 'pose', 'revoked'] as const)(
    'rejects %s mutation during asynchronous digest even when observation ID is retained',
    async (kind) => {
      let snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 | null = fixture();
      const identity = expected(snapshot);
      let reads = 0;
      const result = await buildModelDisplayedTriangleBodyInputV1({
        expected: identity,
        readCurrentSnapshot: () => {
          if (++reads === 1)
            queueMicrotask(() => {
              if (!snapshot) return;
              if (kind === 'positions') snapshot.displayMesh.positions[0] = 0.125;
              if (kind === 'indices') snapshot.displayMesh.indices[0] = 2;
              if (kind === 'identity') snapshot = { ...snapshot, modelContentRevision: 'changed' };
              if (kind === 'frame')
                snapshot = { ...snapshot, frame: { ...snapshot.frame, smoothUnionRadiusM: 0.005 } };
              if (kind === 'pose')
                snapshot = {
                  ...snapshot,
                  displayedPose: { ...snapshot.displayedPose, headYawDeg: 5 },
                };
              if (kind === 'revoked') snapshot = null;
            });
          return snapshot;
        },
      });
      expect(result).toMatchObject({ ok: false, code: 'snapshot-became-stale', input: null });
    },
  );

  it.each([
    'source',
    'revision',
    'units',
    'coordinates',
    'nonfinite',
    'index',
    'count',
    'bytes',
    'pose-key',
    'authority',
  ] as const)('fails closed on invalid %s', async (kind) => {
    const original = fixture();
    let snapshot = original;
    if (kind === 'source')
      snapshot = { ...original, frame: { ...original.frame, sourceRevision: 'other' } };
    if (kind === 'revision')
      snapshot = { ...original, frameRevision: 'wrong' as typeof original.frameRevision };
    if (kind === 'units')
      snapshot = { ...original, frame: { ...original.frame, units: 'mm' as 'm' } };
    if (kind === 'coordinates')
      snapshot = {
        ...original,
        frame: {
          ...original.frame,
          coordinateSystem: { ...original.frame.coordinateSystem, up: '+Z' as '+Y' },
        },
      };
    if (kind === 'nonfinite') snapshot.displayMesh.positions[0] = Number.NaN;
    if (kind === 'index') snapshot.displayMesh.indices[0] = 3;
    if (kind === 'count')
      snapshot = { ...original, displayMesh: { ...original.displayMesh, vertexCount: 4 } };
    if (kind === 'bytes')
      snapshot = { ...original, displayMesh: { ...original.displayMesh, byteLength: 49 } };
    if (kind === 'pose-key') snapshot = { ...original, poseDocumentCanonicalKey: 'stale' };
    if (kind === 'authority') snapshot = { ...original, canonicalAuthority: true as false };
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: () => snapshot,
      expected: expected(snapshot),
    });
    expect(result.ok).toBe(false);
    expect(result.input).toBeNull();
  });

  it('handles unavailable host, cancellation before/after hashing and unavailable digest without publishing input', async () => {
    const snapshot = fixture();
    const controller = new AbortController();
    controller.abort();
    const reader = vi.fn(() => snapshot);
    expect(
      await buildModelDisplayedTriangleBodyInputV1(
        { readCurrentSnapshot: reader, expected: expected(snapshot) },
        controller.signal,
      ),
    ).toMatchObject({ ok: false, code: 'cancelled' });
    expect(reader).not.toHaveBeenCalled();
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => null,
        expected: expected(snapshot),
      }),
    ).toMatchObject({ ok: false, code: 'snapshot-unavailable' });
    const later = new AbortController();
    expect(
      await buildModelDisplayedTriangleBodyInputV1(
        {
          readCurrentSnapshot: () => {
            queueMicrotask(() => later.abort());
            return snapshot;
          },
          expected: expected(snapshot),
        },
        later.signal,
      ),
    ).toMatchObject({ ok: false, code: 'cancelled' });
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('unavailable'));
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => snapshot,
        expected: expected(snapshot),
      }),
    ).toMatchObject({ ok: false, code: 'sha256-unavailable' });
  });

  it('refuses metadata accessors without invoking them', async () => {
    const snapshot = fixture();
    const identity = expected(snapshot);
    let calls = 0;
    Object.defineProperty(snapshot, 'frame', {
      enumerable: true,
      get() {
        calls += 1;
        throw new Error('getter');
      },
    });
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: () => snapshot,
      expected: identity,
    });
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it('binds explicit basis identity without inferring it from fingerprints', async () => {
    const snapshot = fixture();
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => snapshot,
        expected: { ...expected(snapshot), basisKind: 'female' },
      }),
    ).toMatchObject({ ok: false, code: 'identity-mismatch' });
  });

  it('bounds copy allocation and rejects shared writable geometry', async () => {
    const snapshot = fixture();
    const oversized = {
      ...snapshot,
      displayMesh: { ...snapshot.displayMesh, vertexCount: 20_001 },
    };
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => oversized,
        expected: expected(oversized),
      }),
    ).toMatchObject({ ok: false, code: 'input-budget-exceeded' });
    const metadata = {
      ...snapshot,
      frame: { ...snapshot.frame, assumptions: new Array<string>(20_001) },
    };
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => metadata,
        expected: expected(metadata),
      }),
    ).toMatchObject({ ok: false, code: 'input-budget-exceeded' });
    const shared = {
      ...snapshot,
      displayMesh: {
        ...snapshot.displayMesh,
        positions: new Float32Array(new SharedArrayBuffer(36)),
      },
    };
    expect(
      await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => shared,
        expected: expected(shared),
      }),
    ).toMatchObject({ ok: false, code: 'geometry-invalid' });
  });

  it('honors intrinsic cancellation even when a real signal shadows its aborted property', async () => {
    const snapshot = fixture();
    const controller = new AbortController();
    controller.abort();
    Object.defineProperty(controller.signal, 'aborted', { value: false });
    expect(
      await buildModelDisplayedTriangleBodyInputV1(
        {
          readCurrentSnapshot: () => snapshot,
          expected: expected(snapshot),
        },
        controller.signal,
      ),
    ).toMatchObject({ ok: false, code: 'cancelled' });
  });

  it.each(['positions', 'indices', 'identity', 'frame', 'pose', 'null'] as const)(
    'permanently revokes on %s change after successful build',
    async (kind) => {
      const original = fixture();
      let current: ModelOpenReferenceDisplayedBodySnapshotV1 | null = structuredClone(original);
      const reader = vi.fn(() => current);
      const result = await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: reader,
        expected: expected(original),
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      const historical = result.input.project()!;
      expect(result.input.isCurrent()).toBe(true);
      if (kind === 'positions') current.displayMesh.positions[0] = 0.125;
      if (kind === 'indices') current.displayMesh.indices[0] = 2;
      if (kind === 'identity') current = { ...current, observationId: 'later-observation' };
      if (kind === 'frame')
        current = { ...current, frame: { ...current.frame, smoothUnionRadiusM: 0.005 } };
      if (kind === 'pose')
        current = { ...current, displayedPose: { ...current.displayedPose, headYawDeg: 5 } };
      if (kind === 'null') current = null;
      // Projection remains a historical snapshot until the caller explicitly checks currentness.
      expect(result.input.project()!.bodyPositionsM).toEqual(original.displayMesh.positions);
      expect(result.input.isCurrent()).toBe(false);
      expect(result.input.project()).toBeNull();
      current = structuredClone(original);
      const callsAfterRevocation = reader.mock.calls.length;
      expect(result.input.isCurrent()).toBe(false);
      expect(reader).toHaveBeenCalledTimes(callsAfterRevocation);
      expect(result.input.dispose()).toBe(false);
      expect(historical.bodyPositionsM).toEqual(original.displayMesh.positions);
    },
  );

  it('revokes on abort after successful build', async () => {
    const snapshot = fixture();
    const controller = new AbortController();
    const result = await buildModelDisplayedTriangleBodyInputV1(
      {
        readCurrentSnapshot: () => snapshot,
        expected: expected(snapshot),
      },
      controller.signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.isCurrent()).toBe(true);
    controller.abort();
    expect(result.input.isCurrent()).toBe(false);
    expect(result.input.project()).toBeNull();
    expect(result.input.isCurrent()).toBe(false);
  });

  it('keeps currentness independent of detached projection mutations', async () => {
    const snapshot = fixture();
    const result = await buildModelDisplayedTriangleBodyInputV1({
      readCurrentSnapshot: () => snapshot,
      expected: expected(snapshot),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const projection = result.input.project()!;
    projection.bodyPositionsM[0] = 30;
    projection.bodyTriangles[0] = 2;
    expect(result.input.isCurrent()).toBe(true);
    expect(result.input.project()!.bodyPositionsM[0]).toBe(0);
    expect(result.input.project()!.bodyTriangles[0]).toBe(0);
    expect(snapshot.displayMesh.positions[0]).toBe(0);
    result.input.dispose();
    expect(result.input.isCurrent()).toBe(false);
  });
});
