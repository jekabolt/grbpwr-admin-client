import { describe, expect, it } from 'vitest';

import {
  blockPatternImportDxfPhaseEDurableReloadRetryV1,
  createPatternImportDxfPhaseEDurableReloadRetryV1,
  retryPatternImportDxfPhaseEDurableReloadRetryV1,
  startPatternImportDxfPhaseEDurableReloadRetryV1,
} from './durable-reload-retry-v1';

describe('durable reload retry state', () => {
  it('retries a transient restore refusal without changing the captured binding key', () => {
    const restoring = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1('card:11:row:8:op:7'),
    )!;
    const blocked = blockPatternImportDxfPhaseEDurableReloadRetryV1(
      restoring,
      {
        key: restoring.key,
        generation: restoring.generation,
        attempt: restoring.attempt,
        signal: new AbortController().signal,
      },
      { code: 'durable-restore-failed', detail: 'Fresh GET failed.', retryable: true },
    )!;

    const retry = retryPatternImportDxfPhaseEDurableReloadRetryV1(blocked);

    expect(retry).toMatchObject({
      key: restoring.key,
      attempt: 2,
      status: 'ready',
      blocker: null,
    });
  });

  it('ignores an aborted StrictMode setup result and admits the replay generation', () => {
    const restoring = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1('same-binding'),
    )!;
    const first = new AbortController();
    first.abort();

    expect(
      blockPatternImportDxfPhaseEDurableReloadRetryV1(
        restoring,
        {
          key: restoring.key,
          generation: restoring.generation,
          attempt: restoring.attempt,
          signal: first.signal,
        },
        { code: 'stale', detail: 'Must not publish.', retryable: true },
      ),
    ).toBe(restoring);

    const replay = blockPatternImportDxfPhaseEDurableReloadRetryV1(
      restoring,
      {
        key: restoring.key,
        generation: restoring.generation,
        attempt: restoring.attempt,
        signal: new AbortController().signal,
      },
      { code: 'current', detail: 'Current replay result.', retryable: true },
    );
    expect(replay).toMatchObject({ status: 'blocked', blocker: { code: 'current' } });
  });

  it('prevents an old async result from overwriting a changed binding or retry attempt', () => {
    const old = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1('old-binding'),
    )!;
    const current = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1('new-binding'),
    )!;
    const signal = new AbortController().signal;

    expect(
      blockPatternImportDxfPhaseEDurableReloadRetryV1(
        current,
        { key: old.key, generation: old.generation, attempt: old.attempt, signal },
        { code: 'old', detail: 'Old dependency result.', retryable: true },
      ),
    ).toBe(current);
    expect(
      blockPatternImportDxfPhaseEDurableReloadRetryV1(
        { ...current, attempt: 2 },
        { key: current.key, generation: current.generation, attempt: 1, signal },
        { code: 'old-attempt', detail: 'Old retry result.', retryable: true },
      ),
    ).toMatchObject({ attempt: 2, status: 'restoring' });
    const remounted = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1(old.key, 2),
    )!;
    expect(
      blockPatternImportDxfPhaseEDurableReloadRetryV1(
        remounted,
        {
          key: old.key,
          generation: old.generation,
          attempt: old.attempt,
          signal,
        },
        { code: 'old-generation', detail: 'Old remount result.', retryable: true },
      ),
    ).toBe(remounted);
  });

  it('keeps a missing durable carrier actionable but does not offer a pointless retry', () => {
    const restoring = startPatternImportDxfPhaseEDurableReloadRetryV1(
      createPatternImportDxfPhaseEDurableReloadRetryV1('legacy-n1'),
    )!;
    const blocked = blockPatternImportDxfPhaseEDurableReloadRetryV1(
      restoring,
      {
        key: restoring.key,
        generation: restoring.generation,
        attempt: restoring.attempt,
        signal: new AbortController().signal,
      },
      {
        code: 'durable-restore-sidecar-missing',
        detail: 'Continue on the table to author exact edges.',
        retryable: false,
      },
    )!;

    expect(retryPatternImportDxfPhaseEDurableReloadRetryV1(blocked)).toBe(blocked);
  });
});
