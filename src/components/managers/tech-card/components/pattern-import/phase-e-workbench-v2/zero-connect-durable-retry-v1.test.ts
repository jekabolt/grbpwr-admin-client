import { describe, expect, it, vi } from 'vitest';

import {
  capturePatternImportDxfPhaseEZeroConnectDurableRetryV1,
  executePatternImportDxfPhaseEZeroConnectDurableRetryV1,
  isPatternImportDxfPhaseEZeroConnectDurableRetryableV1,
  retryPatternImportDxfPhaseEZeroConnectDurableRetryV1,
  startPatternImportDxfPhaseEZeroConnectDurableRetryV1,
} from './zero-connect-durable-retry-v1';

const digest = (character: string) => character.repeat(64);
const row = {
  techCardId: 11,
  scopeKey: 'fabric:main',
  patternLineKey: 'pattern:main',
  revision: 8,
  cardLockVersion: 301,
  url: 'https://media.example.invalid/pants.dxf',
  sizeBytes: 42,
  sha256: digest('a'),
};
const pending = {
  status: 'in-memory-final-seam-attached-awaiting-second-save',
  savedOperationNumber: 7,
} as never;

describe('zero-connect durable retry after the consumed second save', () => {
  it.each([
    ['fresh GET', 'durable-persist-failed', 'Fresh GET failed.'],
    ['CAS', 'durable-transaction-blocked', 'CAS conflict.'],
    ['fresh readback', 'durable-transaction-blocked', 'Fresh readback failed.'],
  ])(
    'retries only the captured durable request after a transient %s failure',
    async (_phase, code, detail) => {
      const initial = capturePatternImportDxfPhaseEZeroConnectDurableRetryV1(pending, row);
      const first = startPatternImportDxfPhaseEZeroConnectDurableRetryV1(initial)!;
      const persist = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          session: null,
          compositeOperationBindingId: null,
          blocker: { code, detail },
        })
        .mockResolvedValueOnce({
          ok: true,
          session: { durable: true },
          compositeOperationBindingId: `zero-connect-binding-v1:${digest('b')}`,
          blocker: null,
        });
      const ordinaryAssemblyOrderSave = vi.fn();
      const seamWrite = vi.fn();

      const failed = await executePatternImportDxfPhaseEZeroConnectDurableRetryV1(
        first,
        persist,
        new AbortController().signal,
      );
      expect(failed.ok).toBe(false);
      if (failed.ok) throw new Error('Expected transient failure.');
      const retry = startPatternImportDxfPhaseEZeroConnectDurableRetryV1(
        retryPatternImportDxfPhaseEZeroConnectDurableRetryV1(failed.next),
      )!;
      const succeeded = await executePatternImportDxfPhaseEZeroConnectDurableRetryV1(
        retry,
        persist,
        new AbortController().signal,
      );

      expect(succeeded.ok).toBe(true);
      expect(persist).toHaveBeenCalledTimes(2);
      expect(persist.mock.calls[0][0]).toEqual(persist.mock.calls[1][0]);
      expect(persist.mock.calls[1][0]).toMatchObject({ pending, row });
      expect(ordinaryAssemblyOrderSave).not.toHaveBeenCalled();
      expect(seamWrite).not.toHaveBeenCalled();
    },
  );

  it.each([
    'durable-existing-operation-conflict',
    'durable-existing-carrier-unsupported',
    'durable-existing-v3-exact-conflict',
  ])('keeps %s actionable but non-retryable', (code) => {
    const state = {
      ...capturePatternImportDxfPhaseEZeroConnectDurableRetryV1(pending, row),
      status: 'blocked' as const,
      blocker: { code, detail: 'Existing exact carrier will not be overwritten.' },
    };

    expect(isPatternImportDxfPhaseEZeroConnectDurableRetryableV1(state)).toBe(false);
    expect(retryPatternImportDxfPhaseEZeroConnectDurableRetryV1(state)).toBe(state);
    expect(state.blocker.detail).toContain('not be overwritten');
  });
});
