import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  modelMannequinPoseReadErrorV1,
  modelMannequinPoseReadRetryV1,
} from './use-model-mannequin-pose-transport-v1';

describe('model mannequin pose React Query transport v1', () => {
  it('retries only one transient read and never retries auth, absence-like or conflict statuses', () => {
    expect(modelMannequinPoseReadRetryV1(0, new Error('network'))).toBe(true);
    expect(modelMannequinPoseReadRetryV1(1, new Error('network'))).toBe(false);
    expect(modelMannequinPoseReadRetryV1(0, { status: 503 })).toBe(true);
    expect(modelMannequinPoseReadRetryV1(0, { status: 403 })).toBe(false);
    expect(modelMannequinPoseReadRetryV1(0, { status: 404 })).toBe(false);
    expect(modelMannequinPoseReadRetryV1(0, { status: 409 })).toBe(false);
  });

  it('hydrates neutral only from the flag-off path or successful query data, never query error', () => {
    const source = readFileSync(
      new URL('./use-model-mannequin-pose-transport-v1.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("const remote = enabled ? query.data : ({ kind: 'absent' } as const)");
    expect(source).toContain('if (!remote || hydrationStartedRef.current === owner) return');
    expect(source).not.toMatch(/query\.error[\s\S]{0,160}loadRemote/u);
  });

  it('does not dereference a missing hydration failure in create mode', () => {
    expect(
      modelMannequinPoseReadErrorV1({
        hydrationFailure: null,
        owner: undefined,
        enabled: false,
        queryError: null,
      }),
    ).toBeNull();
  });
});
