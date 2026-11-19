import { beforeEach, describe, expect, it, vi } from 'vitest';

const mount = vi.hoisted(() => ({ resolve: vi.fn(), readPatch: vi.fn() }));

vi.mock('./exact-n-seam-production-mount-v2', () => ({
  resolvePatternImportDxfProductExactNSeamProductionMountV2: mount.resolve,
}));
vi.mock('./golden-card-reconstruction-v1', () => ({
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1: vi.fn(),
}));
vi.mock('./composite-sidecar-restore-authority-v4', () => ({
  readPatternImportDxfProductExactNSeamRestorePatchV2: mount.readPatch,
}));

import {
  clearPatternImportDxfProductExactNSeamProductionSessionV2,
  publishPatternImportDxfProductExactNSeamDurableReloadSessionV2,
  publishPatternImportDxfProductExactNSeamProductionSessionV2,
  readPatternImportDxfProductExactNSeamProductionSessionV2,
  subscribePatternImportDxfProductExactNSeamProductionSessionV2,
} from './exact-n-seam-production-session-v2';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import { retireExactNSeamSessionsForDocumentWrite } from './exact-n-seam-production-session-store-v2';

function durableSession(cardLockVersion = 10): PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 {
  return {
    selectionOwner: Object.freeze({ exactSelection: true }),
    current: Object.freeze({
      row: Object.freeze({ techCardId: 11, cardLockVersion }),
      selectedOperation: Object.freeze({
        sourceOperationNumber: 7,
        seamIds: Object.freeze(['seam-side']),
      }),
    }),
  } as unknown as PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
}

describe('exact-N production session durable reload ingress', () => {
  beforeEach(() => {
    clearPatternImportDxfProductExactNSeamProductionSessionV2(11);
    vi.clearAllMocks();
    mount.resolve.mockReturnValue({ ok: true, model: { choices: { seams: [] } } });
    mount.readPatch.mockImplementation((_owner, session = durableSession()) => ({
      bindings: session.current,
      seams: [],
    }));
  });

  it('publishes a genuine resolved durable session without inventing a golden feed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePatternImportDxfProductExactNSeamProductionSessionV2(11, listener);
    const session = durableSession();

    mount.readPatch.mockReturnValueOnce({ bindings: session.current, seams: [] });
    expect(
      publishPatternImportDxfProductExactNSeamDurableReloadSessionV2(session, {} as never),
    ).toBe(true);
    expect(readPatternImportDxfProductExactNSeamProductionSessionV2(11)).toEqual(session);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('still refuses an unresolved or forged atomic selection owner', () => {
    mount.resolve.mockReturnValueOnce({ ok: false, blocker: { code: 'invalid' } });

    expect(
      publishPatternImportDxfProductExactNSeamDurableReloadSessionV2(durableSession(), {} as never),
    ).toBe(false);
    expect(readPatternImportDxfProductExactNSeamProductionSessionV2(11)).toBeNull();
  });

  it('does not let the ordinary production ingress bypass its golden feed', () => {
    expect(publishPatternImportDxfProductExactNSeamProductionSessionV2(durableSession())).toBe(
      false,
    );
    expect(readPatternImportDxfProductExactNSeamProductionSessionV2(11)).toBeNull();
  });

  it('keeps a genuinely newer selection and declines late publication from the replaced lock', () => {
    const old = durableSession();
    const later = durableSession(11);
    const publish = (session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2) => {
      mount.readPatch.mockReturnValueOnce({ bindings: session.current, seams: [] });
      return publishPatternImportDxfProductExactNSeamDurableReloadSessionV2(session, {} as never);
    };
    expect(publish(old)).toBe(true);
    expect(publish(later)).toBe(true);
    const listener = vi.fn();
    const unsubscribe = subscribePatternImportDxfProductExactNSeamProductionSessionV2(11, listener);
    try {
      retireExactNSeamSessionsForDocumentWrite(11, 10);
      expect(publish(old)).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      expect(readPatternImportDxfProductExactNSeamProductionSessionV2(11)).toEqual(later);
    } finally {
      unsubscribe();
    }
  });
});
