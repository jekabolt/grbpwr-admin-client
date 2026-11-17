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
