import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const operationsFieldSource = readFileSync(
  new URL('../../operations-field.tsx', import.meta.url),
  'utf8',
);

function between(start: string, end: string): string {
  const startAt = operationsFieldSource.indexOf(start);
  const endAt = operationsFieldSource.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) throw new Error(`Missing OperationsField source slice: ${start}`);
  return operationsFieldSource.slice(startAt, endAt);
}

describe('existing empty operation OperationsField owner', () => {
  it('captures the existing row without appending another Assembly Order operation', () => {
    const routing = between(
      'const selectedExistingOperation =',
      'if (targetsExistingEmptyOperation) {',
    );
    const branch = between(
      'if (targetsExistingEmptyOperation) {',
      'const identity = buildPatternImportDxfPhaseECadTableZeroConnectIdentityPlanV1(',
    );

    expect(routing).toContain('candidateInputKeys');
    expect(routing).toContain('selectedExistingOperation.inputKeys');
    expect(branch).toContain('capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1');
    expect(branch).toContain('inserted: 0');
    expect(branch).not.toContain('append(');
    expect(branch).not.toContain('newOperationRow(');
  });

  it('uses the atomic existing seam+operation link writer and never the append path', () => {
    const owner = between(
      'const zeroConnectExistingOperationOwner:',
      '// Phase two is deliberately a separate, user-triggered boundary.',
    );

    expect(owner).toContain('stepSeams.writes.acceptSeamStrict(');
    expect(owner).toContain('expectedLockVersion: pending.capturedCardLockVersion');
    expect(owner).toContain('const late = revalidate();');
    expect(owner).toContain(
      'readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1<StrictSeamAcceptResult>',
    );
    expect(owner.indexOf('const retainedWrite =')).toBeLessThan(
      owner.indexOf('const current = revalidate();'),
    );
    expect(owner).toContain('verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1');
    expect(owner).toContain("accepted.outcome === 'not-attempted'");
    expect(owner).toContain('expectedSeam: prepared.receipt.storedSeam');
    expect(owner).not.toContain('append(');
    expect(owner).not.toContain('upsertWithReceipt(');
  });

  it('allows cancellation before the atomic writer and only clears known not-attempted failures', () => {
    const action = between(
      'function ZeroConnectExistingOperationAction(',
      'function ZeroConnectPostSaveAction(',
    );
    const owner = between(
      'const zeroConnectExistingOperationOwner:',
      '// Phase two is deliberately a separate, user-triggered boundary.',
    );

    expect(action).toContain('owner.cancel(pending)');
    expect(action).toContain('Check saved link');
    expect(owner).toContain('cancel: clearZeroConnectExistingOperationPending');
    expect(owner).toContain('refuseBeforeWrite');
    expect(owner).toContain("accepted.outcome === 'not-attempted'");
  });
});

describe('existing linked one-physical-seam OperationsField owner', () => {
  it('captures the selected saved operation without appending, removing, or reordering it', () => {
    const routing = between(
      'const targetsExistingLinkedN1Operation =',
      'if (targetsExistingEmptyOperation) {',
    );

    expect(routing).toContain('capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1');
    expect(routing).toContain('currentRows: [');
    expect(routing).toContain('...rowsOf(useSeamsStore.getState())');
    expect(routing).toContain('...posesOf(useSeamsStore.getState())');
    expect(routing).toContain('inserted: 0');
    expect(routing).not.toContain('append(');
    expect(routing).not.toContain('remove(');
  });

  it('reuses acceptSeamStrict with CAS and exact readback, never a second seam writer', () => {
    const owner = between(
      'const zeroConnectExistingLinkedN1Owner:',
      '// Phase two is deliberately a separate, user-triggered boundary.',
    );

    expect(owner).toContain('stepSeams.writes.acceptSeamStrict(');
    expect(owner).toContain('expectedLockVersion: pending.target.capturedCardLockVersion');
    expect(owner).toContain('const late = revalidate();');
    expect(owner).toContain('verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1');
    expect(owner).toContain("accepted.outcome === 'not-attempted'");
    expect(owner).not.toContain('append(');
    expect(owner).not.toContain('upsertWithReceipt(');
  });

  it('offers explicit diagnostic material and retries metadata without re-arming the seam write', () => {
    const action = between(
      'function ZeroConnectExistingLinkedN1Action(',
      'function ZeroConnectExistingOperationAction(',
    );
    const clear = between('const clearZeroConnectExistingLinkedN1Pending =', 'useEffect(() => {');

    const owner = between(
      'const zeroConnectExistingLinkedN1Owner:',
      '// Phase two is deliberately a separate, user-triggered boundary.',
    );
    expect(action).toContain("aria-label='Connection preview material'");
    expect(action).toContain('Retry pattern metadata');
    expect(action).toContain('owner.cancel(pending)');
    expect(action).toContain("{result ? 'Close' : 'Cancel'}");
    expect(clear).toContain('canReleasePatternImportDxfPhaseEZeroConnectExistingLinkedN1V1');
    expect(owner).toContain('await atomicWrite.catch(');
    expect(
      owner.indexOf('verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1'),
    ).toBeLessThan(owner.indexOf('finalizePatternImportDxfPhaseEExistingLinkedN1V1({'));
    expect(owner).toContain('persist: durable.persist');
  });
});
