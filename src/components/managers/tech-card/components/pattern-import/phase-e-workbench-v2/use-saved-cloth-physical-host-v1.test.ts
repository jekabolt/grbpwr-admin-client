import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

const mocks = vi.hoisted(() => ({
  receipt: Object.freeze({ receipt: 'verified-v7' }),
  handoff: Object.freeze({ sourceOwner: {}, sourceRequest: {} }),
  read: vi.fn(),
  disposeReceipt: vi.fn(),
  prepare: vi.fn(),
  createHost: vi.fn(),
  restore: vi.fn(),
  disposeHost: vi.fn(),
}));

vi.mock('./saved-full-assembly-physical-snapshot-production-v1', () => {
  class PhysicalError extends Error {
    constructor(
      readonly code: string,
      detail: string,
    ) {
      super(detail);
    }
  }
  return {
    SavedFullAssemblyPhysicalSnapshotErrorV1: PhysicalError,
    readSavedFullAssemblyPhysicalSnapshotV1: mocks.read,
    disposeSavedFullAssemblyPhysicalSnapshotV1: mocks.disposeReceipt,
  };
});
vi.mock('./saved-full-assembly-generic-native-handoff-v1', () => ({
  prepareSavedFullAssemblyGenericNativeHandoffV1: mocks.prepare,
}));
vi.mock('components/cloth-simulation-spike/saved-generic-durable-physical-host-v1', () => ({
  createSavedGenericDurablePhysicalHostV1: mocks.createHost,
}));

import { SavedFullAssemblyPhysicalSnapshotErrorV1 } from './saved-full-assembly-physical-snapshot-production-v1';
import {
  classifySavedClothPhysicalRestoreErrorV1,
  restoreSavedClothPhysicalHostV1,
} from './use-saved-cloth-physical-host-v1';

const row: DxfProductSavedRowIdentityV1 = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 4,
  cardLockVersion: 8,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 1234,
  sha256: 'a'.repeat(64),
});
const cardProjection = Object.freeze({
  card: Object.freeze({ techCardId: 156 }),
  cardLockVersion: 8,
});
const bodySession = Object.freeze({ body: 'genuine-current-body-session' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(mocks.receipt);
  mocks.prepare.mockResolvedValue(mocks.handoff);
  mocks.restore.mockResolvedValue({ ok: true, binding: {} });
  mocks.disposeHost.mockResolvedValue(true);
  mocks.createHost.mockReturnValue({
    restore: mocks.restore,
    dispose: mocks.disposeHost,
  });
});

describe('saved durable cloth host production restore', () => {
  it('routes verified V7 exact N2/generic native handoff through one durable facade', async () => {
    const controller = new AbortController();
    const host = await restoreSavedClothPhysicalHostV1(
      {
        row,
        selectedOperationNumber: 10,
        cardProjection: cardProjection as never,
        bodySession: bodySession as never,
      },
      controller.signal,
    );

    expect(mocks.read).toHaveBeenCalledWith({ row, seedOperationNumber: 10 }, controller.signal);
    expect(mocks.prepare).toHaveBeenCalledWith(mocks.receipt, cardProjection, controller.signal);
    expect(mocks.createHost).toHaveBeenCalledWith({ row, bodySession });
    expect(mocks.restore).toHaveBeenCalledWith(
      { verifiedReceipt: mocks.receipt, ...mocks.handoff },
      controller.signal,
    );
    expect(host).toBe(mocks.createHost.mock.results[0].value);
    expect(mocks.disposeReceipt).toHaveBeenCalledWith(mocks.receipt);
    expect(mocks.disposeHost).not.toHaveBeenCalled();
  });

  it('disposes the verified receipt and partially restored host on failure', async () => {
    mocks.restore.mockResolvedValueOnce({ ok: false, detail: 'body changed' });

    await expect(
      restoreSavedClothPhysicalHostV1(
        {
          row,
          selectedOperationNumber: 10,
          cardProjection: cardProjection as never,
          bodySession: bodySession as never,
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('body changed');
    expect(mocks.disposeHost).toHaveBeenCalledTimes(1);
    expect(mocks.disposeReceipt).toHaveBeenCalledWith(mocks.receipt);
  });

  it.each(['current-v7-required', 'physical-initialization-missing'])(
    'maps %s to explicit Place pieces on mannequin state',
    (code) => {
      const error = new SavedFullAssemblyPhysicalSnapshotErrorV1(code, 'V6 has no physical init');
      expect(classifySavedClothPhysicalRestoreErrorV1(error)).toBe('placement-required');
    },
  );

  it('keeps forged, transport and native failures in the retryable blocked state', () => {
    expect(classifySavedClothPhysicalRestoreErrorV1(new Error('forged'))).toBe('blocked');
  });

  it('never starts a second facade when the fixed physical read fails', async () => {
    mocks.read.mockRejectedValueOnce(
      new SavedFullAssemblyPhysicalSnapshotErrorV1('current-v7-required', 'V6 only'),
    );
    await expect(
      restoreSavedClothPhysicalHostV1(
        {
          row,
          selectedOperationNumber: 10,
          cardProjection: cardProjection as never,
          bodySession: bodySession as never,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'current-v7-required' });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createHost).not.toHaveBeenCalled();
    expect(mocks.disposeReceipt).not.toHaveBeenCalled();
  });
});
