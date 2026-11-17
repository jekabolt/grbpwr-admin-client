import { afterEach, describe, expect, it, vi } from 'vitest';
import type { common_Model } from 'api/proto-http/admin';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { modelCardMannequinInputV1 } from 'components/managers/models/components/model-card-mannequin-input-v1';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { sha256Hex } from 'lib/features/sha256';
import { buildModelDisplayedTriangleBodyInputV1 } from './model-displayed-triangle-body-input-v1';
import {
  decodeSavedModelObservedPlacementTargetV1,
  encodeSavedModelObservedPlacementTargetV1,
  projectSavedModelObservedPlacementTargetV1,
  validateSavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetResultV1,
} from './saved-model-observed-placement-target-v1';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function ready(result: SavedModelObservedPlacementTargetResultV1) {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result;
}
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

describe('stable observed-body placement target metadata', () => {
  it('projects genuine fresh identity, exact direct pose and raw geometry without adopting frame A as pose', async () => {
    const f = await fixture({ yaw: 5 });
    const readCount = f.reader.mock.calls.length;
    const result = ready(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding));
    expect(f.reader.mock.calls.length - readCount).toBe(4);
    expect(result.target.pose.document).toEqual(f.snapshot.poseDocument);
    expect(result.target.pose.canonicalSha256).toBe(
      (await fingerprintModelMannequinPoseDocumentV2(f.snapshot.poseDocument)).slice(7),
    );
    expect(f.snapshot.frame.pose.kind).toBe('A');
    expect(result.target.pose.document.pose.headYawDeg).toBe(5);
    expect(result.target).not.toHaveProperty('poseKind');
    expect(result.target.geometry.positionsFloat32LeSha256).toBe(
      f.binding.rawBodyPositionsFloat32LeSha256,
    );
    expect(result.target.displayedModel.bodyBuildFingerprint).toContain('physicalOptions');
    expect(result.claims).toMatchObject({
      metadataOnly: true,
      storageIntegrated: false,
      decodedMetadataAuthenticatesBody: false,
      bodyAdmission: false,
      runtimeAdmission: false,
    });
    for (const field of [
      'observationId',
      'generation',
      'observedBodyContentSha256',
      'displayPositionSource',
    ])
      expect(JSON.stringify(result.target)).not.toContain(`"${field}"`);
    expect(f.input.isCurrent()).toBe(true);
  });

  it('keeps the same target across observation IDs, adoption generations and built/live source routes', async () => {
    const first = await fixture();
    const second = await fixture({ observation: 'observation:remount', live: true });
    const replacement = await adoptSavedModelDisplayedTriangleBodyV2(second.owner, second.request);
    if (replacement.status !== 'committed') throw new Error('Replacement failed.');
    expect(replacement.snapshot.binding.generation).not.toBe(first.binding.generation);
    expect(replacement.snapshot.binding.observedBodyContentSha256).not.toBe(
      first.binding.observedBodyContentSha256,
    );
    const a = ready(await projectSavedModelObservedPlacementTargetV1(first.owner, first.binding));
    const b = ready(
      await projectSavedModelObservedPlacementTargetV1(second.owner, replacement.snapshot.binding),
    );
    expect(b.target).toEqual(a.target);
    expect(b.canonicalSha256).toBe(a.canonicalSha256);
  });

  it('accepts unchanged displayed geometry across editor modes while preserving the exact current document', async () => {
    const linked = await fixture();
    const independent = await fixture({ independentDocumentWithLinkedDisplay: true });
    expect(independent.snapshot.displayedPose.armMode).toBe('linked');
    expect(independent.snapshot.displayedPose.legMode).toBe('linked');
    const a = ready(await projectSavedModelObservedPlacementTargetV1(linked.owner, linked.binding));
    const b = ready(
      await projectSavedModelObservedPlacementTargetV1(independent.owner, independent.binding),
    );
    expect(b.target.geometry).toEqual(a.target.geometry);
    expect(b.target.pose.document).toEqual(independent.snapshot.poseDocument);
    expect(b.target.pose.document.pose.armMode).toBe('independent');
    expect(b.target.pose.document.pose.legMode).toBe('independent');
    expect(b.target.pose.canonicalSha256).toBe(
      (await fingerprintModelMannequinPoseDocumentV2(independent.snapshot.poseDocument)).slice(7),
    );
    expect(b.target.pose.canonicalSha256).not.toBe(a.target.pose.canonicalSha256);
    expect(b.canonicalSha256).not.toBe(a.canonicalSha256);
  });

  it('normalizes metadata negative zero without colliding with a legitimate array in the full frame', async () => {
    const negative = await fixture({ frameMetadata: -0 });
    const zero = await fixture({ frameMetadata: 0 });
    const array = await fixture({ frameMetadata: ['negative-zero'] });
    const projected = await Promise.all(
      [negative, zero, array].map(async (f) =>
        ready(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding)),
      ),
    );
    expect(projected[0]!.target.frame.canonicalSha256).toBe(
      projected[1]!.target.frame.canonicalSha256,
    );
    expect(projected[0]!.canonicalSha256).toBe(projected[1]!.canonicalSha256);
    expect(projected[0]!.target.frame.canonicalSha256).not.toBe(
      projected[2]!.target.frame.canonicalSha256,
    );
    expect(projected[0]!.canonicalSha256).not.toBe(projected[2]!.canonicalSha256);
  });

  it('keeps raw Float32 signed zero bit-exact despite metadata zero normalization', async () => {
    const negative = await fixture({ x: -0 });
    const zero = await fixture({ x: 0 });
    const a = ready(
      await projectSavedModelObservedPlacementTargetV1(negative.owner, negative.binding),
    );
    const b = ready(await projectSavedModelObservedPlacementTargetV1(zero.owner, zero.binding));
    expect(a.target.frame).toEqual(b.target.frame);
    expect(a.target.geometry.positionsFloat32LeSha256).not.toBe(
      b.target.geometry.positionsFloat32LeSha256,
    );
    expect(a.canonicalSha256).not.toBe(b.canonicalSha256);
  });

  it.each([{ yaw: 5 }, { x: 0.25 }, { updatedAt: '2026-11-17T01:00:00Z' }, { frameOffset: 0.01 }])(
    'changes seal for real pose/body/model/frame content %j',
    async (change) => {
      const first = await fixture();
      const second = await fixture(change);
      const a = ready(await projectSavedModelObservedPlacementTargetV1(first.owner, first.binding));
      const b = ready(
        await projectSavedModelObservedPlacementTargetV1(second.owner, second.binding),
      );
      expect(b.canonicalSha256).not.toBe(a.canonicalSha256);
      if ('frameOffset' in change) {
        expect(b.target.frame.canonicalSha256).not.toBe(a.target.frame.canonicalSha256);
        expect(b.target.geometry).toEqual(a.target.geometry);
      }
    },
  );

  it('roundtrips canonical metadata only and rejects forged or structural owners', async () => {
    const f = await fixture();
    const result = ready(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding));
    const encoded = await encodeSavedModelObservedPlacementTargetV1(
      result.target,
      result.canonicalSha256,
    );
    if (!encoded.ok) throw new Error(encoded.detail);
    const decoded = ready(await decodeSavedModelObservedPlacementTargetV1(encoded.bytes));
    expect(decoded).toEqual(result);
    expect(decoded.target).not.toBe(result.target);
    for (const owner of [{ ...f.owner }, new Proxy(f.owner, {}), { project: () => f.snapshot }]) {
      expect(
        await projectSavedModelObservedPlacementTargetV1(
          owner as SavedModelDisplayedTriangleBodyOwnerV2,
          f.binding,
        ),
      ).toMatchObject({ ok: false, code: 'body-unavailable' });
    }
    expect(getSavedModelDisplayedTriangleBodyLifetimeV2(f.owner, f.binding)?.aborted).toBe(false);
  });

  it('returns promptly on pending-read abort without revoking or disposing the borrowed body', async () => {
    const f = await fixture();
    const pending = deferred<common_Model | null>();
    const entered = deferred<void>();
    f.reader.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const signal = new AbortController();
    const work = projectSavedModelObservedPlacementTargetV1(f.owner, f.binding, signal.signal);
    await entered.promise;
    signal.abort();
    expect(await work).toMatchObject({ ok: false, code: 'cancelled' });
    expect(getSavedModelDisplayedTriangleBodyLifetimeV2(f.owner, f.binding)?.aborted).toBe(false);
    pending.resolve(structuredClone(f.state.model));
    expect(
      ready(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding)).target,
    ).toBeTruthy();
    expect(f.input.isCurrent()).toBe(true);
  });

  it('rejects fresh persisted-row drift and the final fresh-read caller microtask gap', async () => {
    const drift = await fixture();
    drift.state.model!.updatedAt = 'changed';
    expect(
      await projectSavedModelObservedPlacementTargetV1(drift.owner, drift.binding),
    ).toMatchObject({ ok: false });
    const f = await fixture();
    let reads = 0;
    let revoked = false;
    f.reader.mockImplementation(async () => {
      if (++reads === 4)
        queueMicrotask(() =>
          queueMicrotask(() => {
            f.state.host = null;
            revoked = true;
          }),
        );
      return structuredClone(f.state.model);
    });
    expect(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding)).toMatchObject({
      ok: false,
      code: 'body-changed',
    });
    expect(reads).toBe(4);
    expect(revoked).toBe(true);
  });

  it('validates exact shapes, nested pose codec, counts, identity and digests without getter execution', async () => {
    const f = await fixture();
    const projected = ready(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding));
    type Mutable<T> = T extends readonly (infer Item)[]
      ? Mutable<Item>[]
      : T extends object
        ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
        : T;
    const modifications: ((value: Mutable<SavedModelObservedPlacementTargetV1>) => void)[] = [
      (value) => {
        Object.defineProperty(value, 'observationId', { value: 'forbidden', enumerable: true });
      },
      (value) => {
        value.persistedModel.revision = 'wrong';
      },
      (value) => {
        value.displayedModel.modelId = 'tech-card-base-model:732';
      },
      (value) => {
        value.frame.sourceRevision = 'wrong';
      },
      (value) => {
        Object.defineProperty(value.frame.coordinateSystem, 'up', {
          value: '+Z',
          enumerable: true,
        });
      },
      (value) => {
        value.geometry.byteLength += 4;
      },
      (value) => {
        value.geometry.positionsFloat32LeSha256 = '0'.repeat(64);
      },
      (value) => {
        value.frame.canonicalSha256 = '0'.repeat(64);
      },
      (value) => {
        value.pose.canonicalSha256 = '0'.repeat(64);
      },
      (value) => {
        value.pose.document.pose.headYawDeg = 0.5;
      },
      (value) => {
        Reflect.deleteProperty(value.pose.document.pose, 'shoulderLevelDeg');
      },
      (value) => {
        value.displayedModel.bodyBuildFingerprint = 'x'.repeat(16_385);
      },
    ];
    for (const change of modifications) {
      const changed = structuredClone(
        projected.target,
      ) as Mutable<SavedModelObservedPlacementTargetV1>;
      change(changed);
      expect(
        await validateSavedModelObservedPlacementTargetV1(changed, projected.canonicalSha256),
      ).toMatchObject({ ok: false });
    }
    const getter = vi.fn(() => projected.target.kind);
    const hostile = Object.defineProperty({ ...projected.target }, 'kind', {
      get: getter,
      enumerable: true,
    });
    expect(
      await validateSavedModelObservedPlacementTargetV1(hostile, projected.canonicalSha256),
    ).toMatchObject({ ok: false });
    expect(getter).not.toHaveBeenCalled();
    expect(
      await decodeSavedModelObservedPlacementTargetV1(new TextEncoder().encode(' {"target":{}}')),
    ).toMatchObject({ ok: false });
    expect(await decodeSavedModelObservedPlacementTargetV1(new Uint8Array([255]))).toMatchObject({
      ok: false,
    });
  });

  it('checks terminal currentness after digest work before any metadata can escape', async () => {
    const f = await fixture();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let triggered = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      if (!triggered) {
        triggered = true;
        f.state.host = null;
      }
      return out;
    });
    expect(await projectSavedModelObservedPlacementTargetV1(f.owner, f.binding)).toMatchObject({
      ok: false,
      code: 'body-changed',
    });
    expect(triggered).toBe(true);
    expect(await sha256Hex(new Uint8Array())).toMatch(/^[a-f0-9]{64}$/);
  });
});
