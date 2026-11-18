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
  actorSnapshot: vi.fn(),
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
vi.mock(
  'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('components/cloth-simulation-spike/saved-generic-durable-physical-host-v1')
    >()),
    createSavedGenericDurablePhysicalHostV1: mocks.createHost,
  }),
);
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
  SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1:
    'saved-full-assembly-physical-document-persistence/1',
  persistCurrentSavedGenericObservedPhysicalHostV1: mocks.persistFirst,
}));

import { SavedV7PlacementPersistenceErrorV1 } from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';
import { SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1 } from './saved-full-assembly-physical-document-production-v1';
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
  mocks.actorSnapshot.mockReturnValue({
    status: 'compiled',
    sourceGeneration: 7,
    initializationSha256: null,
    targetSha256: null,
  });
  mocks.createObservedHost.mockReturnValue({
    getSnapshot: mocks.actorSnapshot,
    consume: mocks.consume,
    dispose: mocks.disposeObservedHost,
  });
  mocks.projectAuthoring.mockResolvedValue({
    ok: true,
    sourceGeneration: 7,
    observedTarget: { canonicalSha256: 'b'.repeat(64) },
    sourceGeometry: Object.freeze({ pieces: Object.freeze([]) }),
  });
  mocks.prepareFirst.mockResolvedValue(Object.freeze({ bootstrap: 'current-v6' }));
  mocks.buildFirst.mockReturnValue(Object.freeze({ request: 'compile' }));
  mocks.bindFirst.mockImplementation(async () => {
    mocks.compileSignalWasAbortedAtBind = mocks.compileSignal?.aborted ?? null;
    if (mocks.compileSignalWasAbortedAtBind)
      return { ok: false, detail: 'compiled source lifetime was revoked' };
    const initializationSha256 = 'a'.repeat(64);
    mocks.actorSnapshot.mockReturnValue({
      status: 'initialization-bound',
      sourceGeneration: 7,
      initializationSha256,
      targetSha256: 'b'.repeat(64),
    });
    return { ok: true, sourceGeneration: 7, initializationSha256 };
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

it('edits only a current idle or failed V7 and reloads after one explicit save', async () => {
  const root = createRoot(reactContainer() as never);
  let latest: ReturnType<typeof useSavedClothPhysicalHostV1>;
  const binding = Object.freeze({
    sourceGeneration: 1,
    graphCanonicalSha256: 'a'.repeat(64),
    compileInputSha256: 'b'.repeat(64),
    physicalInitializationCanonicalSha256: 'c'.repeat(64),
    outerSha256: 'd'.repeat(64),
    freshSnapshotSha256: 'e'.repeat(64),
  });
  const draft = {
    binding,
    pieces: [{ pieceId: 'FRONT', pieceLineKey: 'front', translationM: [1, 2, 3] as const }],
  };
  let snapshot = {
    status: 'ready',
    binding: binding as typeof binding | null,
    numeric: { cleanupPending: false },
  };
  let notify = () => {};
  const displayed = {
    restore: mocks.restore,
    dispose: vi.fn().mockResolvedValue(true),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      notify = listener;
      return () => {};
    },
  };
  const editActor = {
    ...displayed,
    dispose: vi.fn().mockResolvedValue(true),
    getSnapshot: () => ({ status: 'ready', binding, numeric: { cleanupPending: false } }),
    preparePlacementEdit: vi.fn().mockResolvedValue(draft),
    savePlacementEdit: vi.fn().mockResolvedValue({ ok: true }),
  };
  const cold = {
    ...displayed,
    getSnapshot: () => coldSnapshot,
  };
  const cancelledActor = { ...editActor, dispose: vi.fn().mockResolvedValue(true) };
  const coldSnapshot = {
    status: 'ready',
    binding: { ...binding, outerSha256: 'f'.repeat(64) },
    numeric: { cleanupPending: false },
  };
  mocks.createHost
    .mockReturnValueOnce(displayed)
    .mockReturnValueOnce(cancelledActor)
    .mockReturnValueOnce(editActor)
    .mockReturnValueOnce(cold);
  function Harness() {
    latest = useSavedClothPhysicalHostV1({
      row,
      selectedOperationNumber: 10,
      cardProjection: cardProjection as never,
    });
    return null;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(latest!.canEditSavedPlacement).toBe(true);
    await act(async () => latest!.startSavedPlacementEdit(() => false));
    expect(mocks.createHost).toHaveBeenCalledTimes(1);
    await act(async () => {
      snapshot = { ...snapshot, status: 'running16' };
      notify();
    });
    expect(latest!.canEditSavedPlacement).toBe(false);
    await act(async () => latest!.startSavedPlacementEdit(() => true));
    expect(mocks.createHost).toHaveBeenCalledTimes(1);
    await act(async () => {
      snapshot = {
        ...snapshot,
        status: 'blocked',
        binding: null,
        numeric: { cleanupPending: true },
      };
      notify();
    });
    expect(latest!.canEditSavedPlacement).toBe(false);
    await act(async () => latest!.startSavedPlacementEdit(() => true));
    expect(mocks.createHost).toHaveBeenCalledTimes(1);
    await act(async () => {
      snapshot = { ...snapshot, numeric: { cleanupPending: false } };
      notify();
    });
    expect(latest!.canEditSavedPlacement).toBe(true);
    let idle = true;
    await act(async () => latest!.startSavedPlacementEdit(() => idle));
    expect(latest!.placementEditor).toMatchObject({ status: 'editing', draft });
    await act(async () => latest!.cancelSavedPlacementEdit());
    expect(cancelledActor.dispose).toHaveBeenCalledOnce();
    expect(editActor.savePlacementEdit).not.toHaveBeenCalled();
    expect(latest!.placementEditor.status).toBe('idle');
    await act(async () => latest!.startSavedPlacementEdit(() => idle));
    const change = { kind: 'quarter-turn-world-y' } as const;
    idle = false;
    await act(async () => latest!.saveSavedPlacementEdit(draft, change));
    expect(editActor.savePlacementEdit).not.toHaveBeenCalled();
    idle = true;
    await act(async () => latest!.saveSavedPlacementEdit(draft, change));
    expect(editActor.savePlacementEdit).toHaveBeenCalledExactlyOnceWith(
      draft,
      change,
      expect.any(AbortSignal),
    );
    expect(editActor.dispose).toHaveBeenCalledOnce();
    expect(mocks.createHost).toHaveBeenCalledTimes(4);
    expect(latest!.host).toBe(cold);
    expect(latest!.placementEditor.status).toBe('idle');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(['prior', 'prior-rotation', 'intended', 'different', 'body', 'operation'] as const)(
  'retains the uncertain placement save and reconciles current %s authority',
  async (outcome) => {
    const root = createRoot(reactContainer() as never);
    let latest: ReturnType<typeof useSavedClothPhysicalHostV1>;
    const binding = Object.freeze({
      sourceGeneration: 1,
      graphCanonicalSha256: 'a'.repeat(64),
      compileInputSha256: 'b'.repeat(64),
      physicalInitializationCanonicalSha256: 'c'.repeat(64),
      outerSha256: 'd'.repeat(64),
      freshSnapshotSha256: 'e'.repeat(64),
    });
    const intendedSha = 'f'.repeat(64);
    const draft = {
      binding,
      pieces: [{ pieceId: 'FRONT', pieceLineKey: 'front', translationM: [1, 2, 3] as const }],
    };
    const renewed = { ...draft };
    const priorCurrent = outcome === 'prior' || outcome === 'prior-rotation';
    const retained =
      outcome === 'prior-rotation'
        ? ({ kind: 'quarter-turn-world-y' } as const)
        : ({
            kind: 'translate',
            pieces: [{ ...draft.pieces[0]!, translationM: [1.25, 2, 3] as const }],
          } as const);
    const actor = (outerSha256 = binding.outerSha256) => {
      const snapshot = {
        status: 'ready',
        binding: { ...binding, outerSha256 },
        numeric: { cleanupPending: false },
      };
      return {
        restore: mocks.restore,
        dispose: vi.fn().mockResolvedValue(true),
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
        preparePlacementEdit: vi.fn().mockResolvedValue(renewed),
        savePlacementEdit: vi.fn().mockResolvedValue({ ok: true }),
      };
    };
    let releaseRestore: (() => void) | undefined;
    let bodySnapshot: { status: string; generation: number } = { ...mocks.bodySnapshot };
    let notifyBody: (() => void) | undefined;
    mocks.createBodySession.mockReturnValue({
      subscribe: (listener: () => void) => {
        notifyBody = listener;
        return () => undefined;
      },
      getSnapshot: () => bodySnapshot,
      onDisplayedBodyInputV1: () => undefined,
      dispose: () => undefined,
    });
    const displayed = actor();
    const initial = actor();
    initial.preparePlacementEdit.mockResolvedValue(draft);
    initial.savePlacementEdit.mockRejectedValue(
      new SavedV7PlacementPersistenceErrorV1({
        ok: false,
        schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1,
        writeOutcome: 'unknown',
        intendedOuterSha256: intendedSha,
        receipt: null,
        blockers: [{ code: 'transport', detail: 'Readback unavailable.' }],
      }),
    );
    const confirmed = actor(
      priorCurrent ? binding.outerSha256 : outcome === 'intended' ? intendedSha : '9'.repeat(64),
    );
    confirmed.restore = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRestore = () => resolve({ ok: true });
        }),
    );
    const cold = actor(intendedSha);
    mocks.createHost
      .mockReturnValueOnce(displayed)
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(confirmed)
      .mockReturnValueOnce(cold);
    function Harness({ operation = 10 }: { operation?: number }) {
      latest = useSavedClothPhysicalHostV1({
        row,
        selectedOperationNumber: operation,
        cardProjection: cardProjection as never,
      });
      return null;
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      await act(async () => latest!.startSavedPlacementEdit(() => true));
      let first: Promise<void>;
      await act(async () => {
        first = latest!.saveSavedPlacementEdit(draft, retained);
        // The second click arrives before the mounted form can paint its disabled state.
        await latest!.saveSavedPlacementEdit(draft, retained);
      });
      expect(latest!.placementEditor.status).toBe('saving');
      expect(initial.savePlacementEdit).toHaveBeenCalledExactlyOnceWith(
        draft,
        retained,
        expect.any(AbortSignal),
      );
      expect(initial.dispose).toHaveBeenCalledOnce();
      if (outcome === 'operation')
        await act(async () => root.render(createElement(Harness, { operation: 20 })));
      if (outcome === 'body') {
        await act(async () => {
          bodySnapshot = { ...bodySnapshot, generation: 2 };
          notifyBody?.();
        });
      }
      await act(async () => {
        releaseRestore?.();
        await first!;
      });
      expect(confirmed.savePlacementEdit).not.toHaveBeenCalled();
      if (priorCurrent) {
        expect(latest!.placementEditor).toMatchObject({ status: 'save-retry', draft: renewed });
        await act(async () => {
          const retry = latest!.saveSavedPlacementEdit(renewed, {
            kind: 'translate',
            pieces: draft.pieces,
          });
          await latest!.saveSavedPlacementEdit(renewed, {
            kind: 'translate',
            pieces: draft.pieces,
          });
          await retry;
        });
        expect(confirmed.savePlacementEdit).toHaveBeenCalledExactlyOnceWith(
          renewed,
          retained,
          expect.any(AbortSignal),
        );
        expect(latest!.host).toBe(cold);
      } else if (outcome === 'different') {
        expect(latest!.placementEditor).toMatchObject({
          status: 'blocked',
          draft,
          error: 'The saved placement has changed. Reload the current cloth.',
        });
        await act(async () => latest!.saveSavedPlacementEdit(draft, retained));
        expect(confirmed.savePlacementEdit).not.toHaveBeenCalled();
        await act(async () => latest!.retry());
        expect(latest!.host).toBe(cold);
      } else {
        expect(latest!.placementEditor.status).toBe('idle');
        expect(latest!.host).toBe(cold);
      }
      expect(confirmed.dispose).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
    }
  },
);

describe('first physical authoring source lifetime', () => {
  let root: ReturnType<typeof createRoot>;
  let latest: ReturnType<typeof useSavedClothPhysicalHostV1>;
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function Harness({ currentRow = row }: { currentRow?: typeof row }) {
    latest = useSavedClothPhysicalHostV1({
      row: currentRow,
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
      root.render(createElement(Harness, {}));
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

  const placements = [
    {
      pieceId: 'front',
      pieceLineKey: 'body-front',
      pivot: {
        contourId: 'outline',
        vertexId: 'v2',
        positionMm: [80, 50],
        positionM: [0.08, 0.05, 0],
      },
      rotationRowMajor: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      translationM: [-0.11, 1.22, 0.33],
    },
  ] as const;
  const unknown = {
    ok: false,
    writeOutcome: 'unknown',
    blockers: [{ detail: 'Response lost; verify storage.' }],
  };
  async function openPlacement() {
    await act(async () => latest.startFirstAuthoring());
    await act(async () => latest.compileFirstAuthoring({} as never));
    expect(latest.firstAuthoring.status).toBe('placement-required');
  }

  it('keeps one bound placement after uncertain persistence and retries only on a new manual click', async () => {
    await openPlacement();
    const oldSave = latest.saveFirstAuthoring;
    const geometry = latest.firstAuthoring.sourceGeometry;
    let rejectFirst!: (value: typeof unknown) => void;
    mocks.persistFirst.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          rejectFirst = resolve;
        }),
    );
    let first!: Promise<void>;
    await act(async () => {
      first = oldSave(placements);
      void oldSave(placements);
      await tick();
    });
    expect(latest.firstAuthoring.status).toBe('saving');
    expect(mocks.persistFirst).toHaveBeenCalledOnce();
    await act(async () => {
      rejectFirst(unknown);
      await first;
    });
    expect(latest.firstAuthoring).toMatchObject({
      status: 'save-retry',
      error: unknown.blockers[0]!.detail,
    });
    expect(latest.firstAuthoring.sourceGeometry).toBe(geometry);
    expect(mocks.disposeObservedHost).not.toHaveBeenCalled();
    await act(async () => {
      await latest.startFirstAuthoring();
      await oldSave(placements);
    });
    expect(mocks.persistFirst).toHaveBeenCalledOnce();
    const retrySave = latest.retryFirstPlacementSave;
    await act(async () => {
      await Promise.all([retrySave(), retrySave()]);
    });
    expect(mocks.bindFirst).toHaveBeenCalledOnce();
    expect(mocks.bindFirst.mock.calls[0]![1].placements).toEqual(placements);
    expect(mocks.persistFirst.mock.calls.map(([host, generation]) => [host, generation])).toEqual(
      Array(2).fill([mocks.createObservedHost.mock.results[0]!.value, 7]),
    );
    expect(latest.firstAuthoring.status).toBe('idle');
  });

  it.each(['row', 'close'] as const)(
    'revokes a retained retry on %s replacement',
    async (reason) => {
      await openPlacement();
      mocks.persistFirst.mockResolvedValueOnce(unknown);
      await act(async () => latest.saveFirstAuthoring(placements));
      const staleRetry = latest.retryFirstPlacementSave;
      expect(latest.firstAuthoring.status).toBe('save-retry');
      await act(async () => {
        if (reason === 'row')
          root.render(
            createElement(Harness, { currentRow: { ...row, revision: row.revision + 1 } }),
          );
        else {
          latest.retry();
          await staleRetry();
        }
      });
      await act(async () => staleRetry());
      expect(mocks.persistFirst).toHaveBeenCalledOnce();
      expect(mocks.disposeObservedHost).toHaveBeenCalledOnce();
      expect(latest.firstAuthoring.status).toBe('idle');
    },
  );

  it('drops a pending save completion after the operator closes the source', async () => {
    await openPlacement();
    let finish!: (value: typeof unknown) => void;
    mocks.persistFirst.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let write!: Promise<void>;
    await act(async () => {
      write = latest.saveFirstAuthoring(placements);
      await tick();
    });
    await act(async () => {
      latest.retry();
      finish(unknown);
      await write;
    });
    expect(latest.firstAuthoring.status).toBe('idle');
    expect(mocks.compileSignal?.aborted).toBe(true);
    expect(mocks.persistFirst).toHaveBeenCalledOnce();
    expect(mocks.projectAuthoring).toHaveBeenCalledOnce();
  });

  it('preserves editable placement input after an unbound validation failure on a current source', async () => {
    await openPlacement();
    const geometry = latest.firstAuthoring.sourceGeometry;
    mocks.bindFirst.mockResolvedValueOnce({ ok: false, detail: 'Choose a current source pivot.' });
    await act(async () => latest.saveFirstAuthoring(placements));
    expect(latest.firstAuthoring).toMatchObject({
      status: 'placement-required',
      error: 'Choose a current source pivot.',
    });
    expect(latest.firstAuthoring.sourceGeometry).toBe(geometry);
    expect(mocks.persistFirst).not.toHaveBeenCalled();
    await act(async () => latest.saveFirstAuthoring(placements));
    expect(mocks.persistFirst).toHaveBeenCalledOnce();
  });
  it.each(['actor', 'generation'] as const)(
    'refuses to retry a replaced %s before persistence',
    async (kind) => {
      await openPlacement();
      mocks.persistFirst.mockResolvedValueOnce(unknown);
      await act(async () => latest.saveFirstAuthoring(placements));
      expect(latest.firstAuthoring.status).toBe('save-retry');
      const previous = mocks.actorSnapshot();
      mocks.actorSnapshot.mockReturnValue({
        ...previous,
        ...(kind === 'actor' ? { initializationSha256: 'c'.repeat(64) } : { sourceGeneration: 8 }),
      });
      await act(async () => latest.retryFirstPlacementSave());
      expect(latest.firstAuthoring.status).toBe('blocked');
      expect(mocks.persistFirst).toHaveBeenCalledOnce();
      expect(mocks.disposeObservedHost).toHaveBeenCalledOnce();
    },
  );

  it('retires placement if the genuine source re-read reports drift after an uncertain write', async () => {
    await openPlacement();
    mocks.projectAuthoring.mockResolvedValueOnce({
      ok: false,
      detail: 'Fresh AO/row/outer provenance changed.',
    });
    mocks.persistFirst.mockResolvedValueOnce(unknown);
    await act(async () => latest.saveFirstAuthoring(placements));
    expect(latest.firstAuthoring).toMatchObject({
      status: 'blocked',
      sourceGeometry: null,
      error: 'Fresh AO/row/outer provenance changed.',
    });
    await act(async () => latest.retryFirstPlacementSave());
    expect(mocks.persistFirst).toHaveBeenCalledOnce();
    expect(mocks.disposeObservedHost).toHaveBeenCalledOnce();
  });
});
