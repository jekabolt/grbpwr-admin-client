import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
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
  queryClient: Object.freeze({ query: 'client' }),
  bodySnapshot: Object.freeze({ status: 'observed-body-bound', generation: 1 }),
  createBodySession: vi.fn(),
  createObservedHost: vi.fn(),
  consume: vi.fn(),
  disposeObservedHost: vi.fn(),
  projectAuthoring: vi.fn(),
  prepareFirst: vi.fn(),
  buildFirst: vi.fn(),
  bindFirst: vi.fn(),
  persistFirst: vi.fn(),
  compileSignal: null as AbortSignal | null,
  compileSignalWasAbortedAtBind: null as boolean | null,
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks.queryClient }));

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
vi.mock(
  'components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2',
  () => ({
    createSavedModelDisplayedTriangleBodyQuerySessionV2: mocks.createBodySession,
  }),
);
vi.mock('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1', () => ({
  createSavedGenericObservedPhysicalHostV1: mocks.createObservedHost,
  projectSavedGenericObservedPhysicalHostAuthoringContextV1: mocks.projectAuthoring,
}));
vi.mock('./saved-full-assembly-generic-first-bootstrap-v1', () => ({
  prepareSavedFullAssemblyGenericFirstBootstrapV1: mocks.prepareFirst,
  buildSavedFullAssemblyGenericFirstCompileRequestV1: mocks.buildFirst,
}));
vi.mock('./saved-full-assembly-generic-first-authoring-v1', () => ({
  bindSavedFullAssemblyGenericFirstAuthoringV1: mocks.bindFirst,
}));
vi.mock('./saved-full-assembly-physical-document-production-v1', () => ({
  persistCurrentSavedGenericObservedPhysicalHostV1: mocks.persistFirst,
}));

import { SavedFullAssemblyPhysicalSnapshotErrorV1 } from './saved-full-assembly-physical-snapshot-production-v1';
import {
  classifySavedClothPhysicalRestoreErrorV1,
  restoreSavedClothPhysicalHostV1,
  useSavedClothPhysicalHostV1,
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
  mocks.compileSignal = null;
  mocks.compileSignalWasAbortedAtBind = null;
  mocks.read.mockResolvedValue(mocks.receipt);
  mocks.prepare.mockResolvedValue(mocks.handoff);
  mocks.restore.mockResolvedValue({ ok: true, binding: {} });
  mocks.disposeHost.mockResolvedValue(true);
  mocks.createHost.mockReturnValue({
    restore: mocks.restore,
    dispose: mocks.disposeHost,
  });
  mocks.createBodySession.mockReturnValue({
    subscribe: () => () => undefined,
    getSnapshot: () => mocks.bodySnapshot,
    onDisplayedBodyInputV1: () => undefined,
    dispose: () => undefined,
  });
  mocks.consume.mockImplementation(async (_request: unknown, signal: AbortSignal) => {
    mocks.compileSignal = signal;
    return { ok: true, result: { generation: 7 } };
  });
  mocks.disposeObservedHost.mockResolvedValue(true);
  mocks.createObservedHost.mockReturnValue({
    consume: mocks.consume,
    dispose: mocks.disposeObservedHost,
  });
  mocks.projectAuthoring.mockResolvedValue({
    ok: true,
    sourceGeometry: Object.freeze({ pieces: Object.freeze([]) }),
  });
  mocks.prepareFirst.mockResolvedValue(Object.freeze({ bootstrap: 'current-v6' }));
  mocks.buildFirst.mockReturnValue(Object.freeze({ request: 'compile' }));
  mocks.bindFirst.mockImplementation(async () => {
    mocks.compileSignalWasAbortedAtBind = mocks.compileSignal?.aborted ?? null;
    return mocks.compileSignalWasAbortedAtBind
      ? { ok: false, detail: 'compiled source lifetime was revoked' }
      : { ok: true };
  });
  mocks.persistFirst.mockResolvedValue({ ok: true });
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

const g = globalThis as Record<string, unknown>;
const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window ??= Object.assign(globalThis, listeners);
});

function reactContainer() {
  const view = { document: { activeElement: null }, HTMLIFrameElement: class {} };
  const doc = { nodeType: 9, defaultView: view, ...listeners };
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc,
    ...listeners,
  };
}

describe('first physical authoring source lifetime', () => {
  let root: ReturnType<typeof createRoot>;
  let latest: ReturnType<typeof useSavedClothPhysicalHostV1>;
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function Harness() {
    latest = useSavedClothPhysicalHostV1({
      row,
      selectedOperationNumber: 10,
      cardProjection: cardProjection as never,
    });
    return null;
  }

  beforeEach(async () => {
    mocks.read.mockRejectedValue(
      new SavedFullAssemblyPhysicalSnapshotErrorV1('current-v7-required', 'V6 only'),
    );
    root = createRoot(reactContainer() as never);
    await act(async () => {
      root.render(createElement(Harness));
      await tick();
    });
    await act(tick);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('keeps the compiled genuine source alive through bind and persistence', async () => {
    expect(latest!.sourceStatus).toBe('placement-required');

    await act(async () => latest!.startFirstAuthoring());
    expect(mocks.prepareFirst).toHaveBeenCalledWith(
      row,
      cardProjection,
      expect.any(AbortSignal),
      'native-drawn-sewing',
      10,
    );
    expect(latest!.firstAuthoring.status).toBe('compile-required');

    await act(async () => latest!.compileFirstAuthoring({} as never));
    expect(latest!.firstAuthoring.status).toBe('placement-required');
    expect(mocks.compileSignal?.aborted).toBe(false);

    await act(async () => latest!.saveFirstAuthoring([]));

    expect(mocks.compileSignalWasAbortedAtBind).toBe(false);
    expect(mocks.bindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.persistFirst).toHaveBeenCalledTimes(1);
    expect(latest!.firstAuthoring.status).toBe('idle');
  });
});
