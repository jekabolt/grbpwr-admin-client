import { describe, expect, it, vi } from 'vitest';
import {
  buildModelDisplayedTriangleBodyInputV1,
  projectCurrentModelDisplayedTriangleBodyInputV1,
  subscribeModelDisplayedTriangleBodyInputInvalidationV1,
  type ModelDisplayedTriangleBodyInputResultV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from 'lib/cloth/body/measurement-body-synthetic-corpus';
import {
  createCadMannequinDisplayedBodyInputSessionV1,
  type CadMannequinDisplayedBodySourceV1,
} from './cad-mannequin-displayed-body-input-session-v1';

// Synthetic accepted-host data exercises lifecycle and the real detached-input builder;
// this is not a renderer, body-admission or cloth-physics acceptance test.
function snapshot(observationId = 'display:1'): ModelOpenReferenceDisplayedBodySnapshotV1 {
  const poseDocument = createModelMannequinPoseDocumentV2(
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements: CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
    sourceRevision: 'display-source:1',
  });
  return structuredClone({
    schemaVersion: 'model-open-reference-displayed-body-snapshot/v1',
    observationId,
    modelId: 'tech-card-base-model:7',
    modelContentRevision: 'saved-model:7:revision:4',
    basisKind: 'female',
    inputFingerprint: 'input:1',
    bodyBuildFingerprint: 'build:1',
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

function source(
  value: ModelOpenReferenceDisplayedBodySnapshotV1,
): CadMannequinDisplayedBodySourceV1 {
  return {
    modelId: value.modelId,
    modelContentRevision: value.modelContentRevision,
    poseDocumentCanonicalKey: value.poseDocumentCanonicalKey,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function lifecycleDouble() {
  let alive = true;
  const dispose = vi.fn(() => {
    const previous = alive;
    alive = false;
    return previous;
  });
  const input: ModelDisplayedTriangleBodyOwnedInputV1 = {
    project: () => null,
    isCurrent: () => alive,
    dispose,
  };
  return { input, dispose, result: { ok: true, input } as const };
}

describe('selected displayed body input lifecycle', () => {
  it('publishes a real detached input and synchronously revokes it on loss of accepted display', async () => {
    const displayed = snapshot();
    const events: Array<ModelDisplayedTriangleBodyOwnedInputV1 | null> = [];
    const session = createCadMannequinDisplayedBodyInputSessionV1({
      source: source(displayed),
      readCurrentSource: () => source(displayed),
      onInput: (input) => events.push(input),
    });
    await session.observe(displayed);
    const input = events.at(-1)!;
    expect(input?.isCurrent()).toBe(true);
    const projection = input.project()!;
    expect(projection.bodyPositionsM).toEqual(displayed.displayMesh.positions);
    expect(projection.bodyPositionsM).not.toBe(displayed.displayMesh.positions);
    expect(projection.identity.basisKind).toBe('female');
    expect(projection.claims).toMatchObject({
      canonicalAuthority: false,
      runtimeAuthority: false,
      collisionAuthority: false,
      viewportAuthorityAuthenticated: false,
    });
    const revoked = session.observe(null);
    expect(input.isCurrent()).toBe(false);
    expect(input.project()).toBeNull();
    expect(events.at(-1)).toBeNull();
    await revoked;
    await session.observe(null);
    expect(events).toEqual([null, input, null]);
    session.dispose();
  });

  it.each(['modelId', 'modelContentRevision', 'poseDocumentCanonicalKey'] as const)(
    'refuses an observation from another current %s before copying',
    async (key) => {
      const displayed = snapshot();
      const buildInput = vi.fn(buildModelDisplayedTriangleBodyInputV1);
      const onInput = vi.fn();
      const session = createCadMannequinDisplayedBodyInputSessionV1(
        {
          source: source(displayed),
          readCurrentSource: () => source(displayed),
          onInput,
        },
        { buildInput },
      );
      await session.observe({ ...displayed, [key]: 'different' });
      expect(buildInput).not.toHaveBeenCalled();
      expect(onInput).toHaveBeenCalledExactlyOnceWith(null);
      session.dispose();
    },
  );

  it('revokes currentness as soon as the selected source changes, before the next display callback', async () => {
    const displayed = snapshot();
    let current: CadMannequinDisplayedBodySourceV1 | null = source(displayed);
    let input: ModelDisplayedTriangleBodyOwnedInputV1 | null = null;
    const session = createCadMannequinDisplayedBodyInputSessionV1({
      source: current,
      readCurrentSource: () => current,
      onInput: (next) => {
        input = next;
      },
    });
    await session.observe(displayed);
    const accepted = input as ModelDisplayedTriangleBodyOwnedInputV1 | null;
    expect(accepted?.isCurrent()).toBe(true);
    current = { ...current, modelContentRevision: 'new-revision' };
    expect(accepted?.isCurrent()).toBe(false);
    expect(accepted?.project()).toBeNull();
    await session.observe(displayed);
    expect(input).toBeNull();
    session.dispose();
  });

  it('does not recopy an unchanged observation but revokes an in-place byte mutation', async () => {
    const displayed = snapshot();
    const buildInput = vi.fn(buildModelDisplayedTriangleBodyInputV1);
    const onInput = vi.fn();
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput,
      },
      { buildInput },
    );
    const first = session.observe(displayed);
    await session.observe(displayed);
    await first;
    await session.observe(displayed);
    expect(buildInput).toHaveBeenCalledTimes(1);
    const input = onInput.mock.calls.at(-1)![0] as ModelDisplayedTriangleBodyOwnedInputV1;
    displayed.displayMesh.positions[0] = 0.5;
    await session.observe(displayed);
    expect(input.project()).toBeNull();
    expect(onInput.mock.calls.at(-1)).toEqual([null]);
    expect(buildInput).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('cleans the previous input before waiting for a replacement capture', async () => {
    const displayed = snapshot();
    const pending = deferred<ModelDisplayedTriangleBodyInputResultV1>();
    const buildInput = vi.fn(buildModelDisplayedTriangleBodyInputV1);
    const onInput = vi.fn();
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput,
      },
      { buildInput },
    );
    await session.observe(displayed);
    const first = onInput.mock.calls.at(-1)![0] as ModelDisplayedTriangleBodyOwnedInputV1;
    buildInput.mockImplementationOnce(() => pending.promise);
    const next = session.observe(snapshot('display:2'));
    expect(first.project()).toBeNull();
    expect(onInput.mock.calls.at(-1)).toEqual([null]);
    const replacement = lifecycleDouble();
    pending.resolve(replacement.result);
    await next;
    expect(onInput.mock.calls.at(-1)).toEqual([replacement.input]);
    session.dispose();
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a late capture after unmount and never publishes it', async () => {
    const displayed = snapshot();
    const pending = deferred<ModelDisplayedTriangleBodyInputResultV1>();
    const late = lifecycleDouble();
    const onInput = vi.fn();
    let signal: AbortSignal | undefined;
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput,
      },
      {
        buildInput: (_, capturedSignal) => {
          signal = capturedSignal;
          return pending.promise;
        },
      },
    );
    const work = session.observe(displayed);
    expect(session.dispose()).toBe(true);
    expect(signal?.aborted).toBe(true);
    pending.resolve(late.result);
    await work;
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledExactlyOnceWith(null);
    expect(session.dispose()).toBe(false);
    await session.observe(displayed);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('does not let a late old capture overwrite or revoke the current input', async () => {
    const displayed = snapshot();
    const old = deferred<ModelDisplayedTriangleBodyInputResultV1>();
    const oldInput = lifecycleDouble();
    const nextInput = lifecycleDouble();
    const buildInput = vi
      .fn<typeof buildModelDisplayedTriangleBodyInputV1>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(nextInput.result);
    const onInput = vi.fn();
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput,
      },
      { buildInput },
    );
    const first = session.observe(displayed);
    await session.observe(snapshot('display:2'));
    old.resolve(oldInput.result);
    await first;
    expect(oldInput.dispose).toHaveBeenCalledTimes(1);
    expect(nextInput.input.isCurrent()).toBe(true);
    expect(onInput.mock.calls).toEqual([[null], [nextInput.input]]);
    session.dispose();
  });

  it('refuses completion after the host model changes without a new observation', async () => {
    const displayed = snapshot();
    let current: CadMannequinDisplayedBodySourceV1 | null = source(displayed);
    const pending = deferred<ModelDisplayedTriangleBodyInputResultV1>();
    const late = lifecycleDouble();
    const onInput = vi.fn();
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: current,
        readCurrentSource: () => current,
        onInput,
      },
      { buildInput: () => pending.promise },
    );
    const work = session.observe(displayed);
    current = null;
    pending.resolve(late.result);
    await work;
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledExactlyOnceWith(null);
    session.dispose();
  });

  it('fails closed for invalid accepted geometry and unexpected builder rejection', async () => {
    const displayed = snapshot();
    const onInput = vi.fn();
    const buildInput = vi.fn(buildModelDisplayedTriangleBodyInputV1);
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput,
      },
      { buildInput },
    );
    displayed.displayMesh.positions[0] = Number.NaN;
    await session.observe(displayed);
    buildInput.mockRejectedValueOnce(new Error('capture failed'));
    await expect(session.observe(snapshot('display:2'))).resolves.toBeUndefined();
    expect(onInput).toHaveBeenCalledExactlyOnceWith(null);
    session.dispose();
  });

  it('honours consumer reentry before starting capture', async () => {
    const displayed = snapshot();
    const buildInput = vi.fn(buildModelDisplayedTriangleBodyInputV1);
    const session = createCadMannequinDisplayedBodyInputSessionV1(
      {
        source: source(displayed),
        readCurrentSource: () => source(displayed),
        onInput: () => {
          session.dispose();
        },
      },
      { buildInput },
    );
    await session.observe(displayed);
    expect(buildInput).not.toHaveBeenCalled();
  });
  it('publishes the genuine private-registry input and revokes it immediately on observation loss', async () => {
    const displayed = snapshot();
    let published: ModelDisplayedTriangleBodyOwnedInputV1 | null = null;
    const session = createCadMannequinDisplayedBodyInputSessionV1({
      source: source(displayed),
      readCurrentSource: () => source(displayed),
      onInput: (input) => {
        published = input;
      },
    });
    await session.observe(displayed);
    const input = published!;
    expect(projectCurrentModelDisplayedTriangleBodyInputV1(input)?.bodyPositionsM).toEqual(
      displayed.displayMesh.positions,
    );
    expect(projectCurrentModelDisplayedTriangleBodyInputV1({ ...input })).toBeNull();
    const revoked = vi.fn();
    const unsubscribe = subscribeModelDisplayedTriangleBodyInputInvalidationV1(input, revoked);
    await session.observe(null);
    expect(published).toBeNull();
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(projectCurrentModelDisplayedTriangleBodyInputV1(input)).toBeNull();
    unsubscribe?.();
    session.dispose();
  });
});
