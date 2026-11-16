import { describe, expect, it } from 'vitest';

import { createModelMannequinPoseDocumentV2 } from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { resolveModelCardMannequinPoseResourceV1 } from './model-card-mannequin-pose-v1';

const stored = Object.freeze({
  document: createModelMannequinPoseDocumentV2({
    ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    headYawDeg: 10,
  }),
  revision: '7',
  canonicalSha256: 'a'.repeat(64),
});

describe('model card mannequin pose v1', () => {
  it('builds a read-only V9 binding for a stored pose', () => {
    const resource = resolveModelCardMannequinPoseResourceV1({
      enabled: true,
      pending: false,
      error: null,
      result: { kind: 'found', stored },
    });

    expect(resource.status).toBe('found');
    if (resource.status !== 'found') throw new Error('Expected found pose resource.');
    expect(resource.revision).toBe('7');
    expect(resource.binding.document.pose.headYawDeg).toBe(10);
    expect(resource.binding.dirty).toBe(false);
    expect(resource.binding.canUndo).toBe(false);
    expect(resource.binding.onReset().headYawDeg).toBe(10);
  });

  it('keeps disabled, loading, absent and error states explicit', () => {
    expect(
      resolveModelCardMannequinPoseResourceV1({
        enabled: false,
        pending: false,
        error: null,
        result: undefined,
      }).status,
    ).toBe('disabled');
    expect(
      resolveModelCardMannequinPoseResourceV1({
        enabled: true,
        pending: true,
        error: null,
        result: undefined,
      }).status,
    ).toBe('loading');
    expect(
      resolveModelCardMannequinPoseResourceV1({
        enabled: true,
        pending: false,
        error: null,
        result: { kind: 'absent' },
      }).status,
    ).toBe('absent');
    expect(
      resolveModelCardMannequinPoseResourceV1({
        enabled: true,
        pending: false,
        error: new Error('offline'),
        result: undefined,
      }).status,
    ).toBe('error');
  });
});
