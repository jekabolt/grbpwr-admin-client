import { describe, expect, it } from 'vitest';

import {
  beginPatternImportDxfPhaseEDurableRestoreAttemptV1,
  completePatternImportDxfPhaseEDurableRestoreAttemptV1,
  releasePatternImportDxfPhaseEDurableRestoreAttemptV1,
  type PatternImportDxfPhaseEDurableRestoreAttemptSlotV1,
} from './durable-restore-attempt-v1';

const slot = (): PatternImportDxfPhaseEDurableRestoreAttemptSlotV1 => ({ current: null });

describe('durable reload effect attempt ownership', () => {
  it('allows the same key after StrictMode setup cleanup replay', () => {
    const owner = slot();
    const first = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'card:11:op:7')!;

    releasePatternImportDxfPhaseEDurableRestoreAttemptV1(owner, first);
    const replay = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'card:11:op:7');

    expect(replay).not.toBeNull();
    expect(replay).not.toBe(first);
    expect(first.controller.signal.aborted).toBe(true);
  });

  it('prevents an old async cleanup from erasing a newer dependency-generation ticket', () => {
    const owner = slot();
    const first = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'old')!;
    const next = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'new')!;

    releasePatternImportDxfPhaseEDurableRestoreAttemptV1(owner, first);

    expect(owner.current).toBe(next);
    expect(next.controller.signal.aborted).toBe(false);
  });

  it('retains completed success for the same key but admits a changed binding', () => {
    const owner = slot();
    const completed = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'current')!;

    expect(completePatternImportDxfPhaseEDurableRestoreAttemptV1(owner, completed)).toBe(true);
    releasePatternImportDxfPhaseEDurableRestoreAttemptV1(owner, completed);

    expect(beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'current')).toBeNull();
    expect(beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'changed')).not.toBeNull();
  });

  it('clears an unmounted in-flight ticket so a remount can retry', () => {
    const owner = slot();
    const inFlight = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'current')!;

    releasePatternImportDxfPhaseEDurableRestoreAttemptV1(owner, inFlight);

    expect(owner.current).toBeNull();
    expect(beginPatternImportDxfPhaseEDurableRestoreAttemptV1(owner, 'current')).not.toBeNull();
  });
});
