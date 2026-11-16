import type {
  GetModelMannequinPoseResponse,
  PutModelMannequinPoseRequest,
  PutModelMannequinPoseResponse,
  common_StoredModelMannequinPose,
} from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';
import type { PutModelMannequinPoseRequestV1 } from './model-mannequin-pose-draft-owner-v1';
import {
  getModelMannequinPoseV1,
  modelMannequinPoseDocumentFromWireV1,
  modelMannequinPoseDocumentToWireV1,
  modelMannequinPoseRpcEnabledV1,
  putModelMannequinPoseV1,
  type ModelMannequinPoseAdminServiceV1,
} from './model-mannequin-pose-transport-v1';

const MODEL_ID = 41;
const MAX_UINT64 = '18446744073709551615';
const POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 8,
  headYawDeg: 6,
  shoulderElevationDeg: 4,
});

async function storedWire(
  pose: ModelOpenReferenceDirectPoseV9 = POSE,
  revision = MAX_UINT64,
): Promise<common_StoredModelMannequinPose> {
  const document = createModelMannequinPoseDocumentV2(pose);
  const sha = (await fingerprintModelMannequinPoseDocumentV2(document)).slice('sha256:'.length);
  return {
    modelId: MODEL_ID,
    pose: modelMannequinPoseDocumentToWireV1(document, sha),
    revision,
    updatedAt: undefined,
    updatedBy: 'operator@example.test',
  };
}

function service(options: {
  readonly get: () => Promise<GetModelMannequinPoseResponse>;
  readonly put?: (request: PutModelMannequinPoseRequest) => Promise<PutModelMannequinPoseResponse>;
}): ModelMannequinPoseAdminServiceV1 {
  return {
    GetModelMannequinPose: vi.fn(options.get),
    PutModelMannequinPose: vi.fn(options.put ?? (async () => ({ storedPose: await storedWire() }))),
  };
}

async function domainRequest(expectedRevision?: string): Promise<PutModelMannequinPoseRequestV1> {
  const pose = createModelMannequinPoseDocumentV2(POSE);
  const canonicalPayload = encodeModelMannequinPoseDocumentV2(pose);
  const canonicalSha256 = (await fingerprintModelMannequinPoseDocumentV2(pose)).slice(
    'sha256:'.length,
  );
  return {
    operationId: 1,
    modelId: MODEL_ID,
    pose,
    canonicalPayload,
    canonicalSha256,
    ...(expectedRevision ? { expectedRevision } : {}),
  };
}

describe('model mannequin pose transport v1', () => {
  it('keeps the rollout flag narrowly opt-in and off by default', () => {
    expect(modelMannequinPoseRpcEnabledV1(undefined)).toBe(false);
    expect(modelMannequinPoseRpcEnabledV1('0')).toBe(false);
    expect(modelMannequinPoseRpcEnabledV1('true')).toBe(false);
    expect(modelMannequinPoseRpcEnabledV1('1')).toBe(true);
  });

  it('round-trips the exact typed V2 document and verifies its canonical SHA-256', async () => {
    const stored = await storedWire();
    const loaded = await getModelMannequinPoseV1(
      service({ get: async () => ({ storedPose: stored }) }),
      MODEL_ID,
    );

    expect(loaded).toMatchObject({
      kind: 'found',
      stored: { revision: MAX_UINT64, document: { pose: POSE } },
    });
    if (loaded.kind !== 'found' || !stored.pose) throw new Error('Expected a stored pose.');
    expect(modelMannequinPoseDocumentFromWireV1(stored.pose)).toEqual(loaded.stored.document);
  });

  it('treats only a successful empty Get response as absence', async () => {
    await expect(
      getModelMannequinPoseV1(service({ get: async () => ({ storedPose: undefined }) }), MODEL_ID),
    ).resolves.toEqual({ kind: 'absent' });

    const readFailure = Object.assign(new Error('backend unavailable'), { status: 503 });
    await expect(
      getModelMannequinPoseV1(
        service({
          get: async () => {
            throw readFailure;
          },
        }),
        MODEL_ID,
      ),
    ).rejects.toBe(readFailure);
  });

  it('rejects a stored pose whose hash does not match the canonical document', async () => {
    const stored = await storedWire();
    const corrupted = {
      ...stored,
      pose: { ...stored.pose!, canonicalSha256: '0'.repeat(64) },
    };
    await expect(
      getModelMannequinPoseV1(service({ get: async () => ({ storedPose: corrupted }) }), MODEL_ID),
    ).rejects.toThrow(/fingerprint does not match/u);
  });

  it('sends an exact >2^53 revision string and omits it only for observed absence', async () => {
    const writes: PutModelMannequinPoseRequest[] = [];
    const api = service({
      get: async () => ({ storedPose: await storedWire() }),
      put: async (request) => {
        writes.push(request);
        return { storedPose: await storedWire() };
      },
    });
    await putModelMannequinPoseV1(api, await domainRequest(MAX_UINT64));
    await putModelMannequinPoseV1(api, await domainRequest());

    expect(writes[0]?.expectedRevision).toBe(MAX_UINT64);
    expect(typeof writes[0]?.expectedRevision).toBe('string');
    expect(writes[1]).not.toHaveProperty('expectedRevision');
    expect(writes[0]?.pose?.canonicalSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('turns a stale 409/ABORTED write into a refetched conflict without losing the draft', async () => {
    const current = await storedWire(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      '9007199254740993',
    );
    const conflict = Object.assign(new Error('revision mismatch'), { status: 409 });
    const api = service({
      get: async () => ({ storedPose: current }),
      put: async () => {
        throw conflict;
      },
    });

    await expect(
      putModelMannequinPoseV1(api, await domainRequest('9007199254740992')),
    ).resolves.toMatchObject({
      kind: 'conflict',
      current: { revision: '9007199254740993' },
    });
    expect(api.GetModelMannequinPose).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a 409 refetch cannot produce a current stored resource', async () => {
    const api = service({
      get: async () => ({ storedPose: undefined }),
      put: async () => {
        throw Object.assign(new Error('revision mismatch'), { status: 409 });
      },
    });

    await expect(putModelMannequinPoseV1(api, await domainRequest())).rejects.toThrow(
      /current stored pose is absent/u,
    );
  });
});
