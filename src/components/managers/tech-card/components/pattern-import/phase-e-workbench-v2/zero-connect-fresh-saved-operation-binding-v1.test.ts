import { describe, expect, it } from 'vitest';

import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import {
  matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1,
  resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1,
} from './zero-connect-fresh-saved-operation-binding-v1';

function attachedPending(): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 {
  return {
    status: 'in-memory-final-seam-attached-awaiting-second-save',
    savedOperationNumber: 7,
    afterSeamAttachCardLockVersion: 42,
    candidate: {
      connection: {
        sides: [{ pieceLineKey: 'piece-front' }, { pieceLineKey: 'piece-back' }],
      },
    },
  } as unknown as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
}

describe('zero-connect fresh saved operation binding', () => {
  it('accepts one positive current operation with the exact ordered selected inputs', () => {
    expect(
      resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1({
        pending: attachedPending(),
        currentCardLockVersion: 42,
        operations: [{ operationNumber: 7, inputKeys: ['piece-front', 'piece-back'] }],
      }),
    ).toMatchObject({ ok: true, operation: { operationNumber: 7 } });
  });

  it.each([
    ['reordered', ['piece-back', 'piece-front']],
    ['missing', ['piece-front']],
    ['additional', ['piece-front', 'piece-back', 'piece-lining']],
    ['different', ['piece-front', 'piece-side']],
  ])('rejects %s input keys', (_label, inputKeys) => {
    expect(
      matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1(inputKeys, [
        'piece-front',
        'piece-back',
      ]),
    ).toBe(false);
  });

  it('rejects an awaiting-seam pending and ambiguous saved operation number', () => {
    const awaiting = {
      ...attachedPending(),
      status: 'in-memory-awaiting-save-direction-and-seam-link',
    } as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
    expect(
      resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1({
        pending: awaiting,
        currentCardLockVersion: 42,
        operations: [{ operationNumber: 7, inputKeys: ['piece-front', 'piece-back'] }],
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'fresh-saved-operation-pending-invalid' },
    });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1({
        pending: attachedPending(),
        currentCardLockVersion: 42,
        operations: [
          { operationNumber: 7, inputKeys: ['piece-front', 'piece-back'] },
          { operationNumber: 7, inputKeys: ['piece-front', 'piece-back'] },
        ],
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'fresh-saved-operation-not-exact' } });
  });

  it.each([41, 43])('rejects fresh lock %i around exact seam-write lock N+1', (lockVersion) => {
    expect(
      resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1({
        pending: attachedPending(),
        currentCardLockVersion: lockVersion,
        operations: [{ operationNumber: 7, inputKeys: ['piece-front', 'piece-back'] }],
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'fresh-saved-card-lock-mismatch' } });
  });

  it.each([
    ['missing operation', []],
    ['reordered exact inputs', [{ operationNumber: 7, inputKeys: ['piece-back', 'piece-front'] }]],
  ])('rejects %s in the fresh saved card', (_label, operations) => {
    expect(
      resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1({
        pending: attachedPending(),
        currentCardLockVersion: 42,
        operations,
      }),
    ).toMatchObject({ ok: false });
  });
});
