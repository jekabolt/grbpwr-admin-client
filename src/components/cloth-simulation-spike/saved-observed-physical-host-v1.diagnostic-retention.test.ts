import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import { createSavedObservedPhysicalHostV1 } from './saved-observed-physical-host-v1';

// Controller UNIT tests only. The compiler, persistence context, private runtime dispatcher and
// frame runners are explicitly mocked. Structural handles below are accepted ONLY by these mock
// ports: this suite supplies no genuine source/body admission, physics result, browser or GPU proof.
type Kind = 'source' | 'frame16' | 'frame32';
const ports = vi.hoisted(() => ({
  sourceFactory: vi.fn(),
  contextFactory: vi.fn(),
  buildRuntime: vi.fn(),
  run16: vi.fn(),
  run32: vi.fn(),
  project16: vi.fn(),
  disposeSource: vi.fn(),
  dispose16: vi.fn(),
  dispose32: vi.fn(),
  renderer: vi.fn(),
}));
vi.mock('./pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1', () => ({
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1: ports.sourceFactory,
}));
vi.mock(
  'components/managers/models/components/saved-model-displayed-triangle-body-session-v2',
  () => ({
    buildCurrentSavedModelObservedPlacementRuntimeSourceV1: ports.buildRuntime,
    issueCurrentSavedModelObservedPlacementV3: vi.fn(),
  }),
);
vi.mock(
  'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1',
  () => ({
    createPatternImportDxfProductSavedPlacementProductionContextV1: ports.contextFactory,
  }),
);
vi.mock(
  'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1',
  () => ({
    createPatternImportDxfProductCompositePlacementProductionReaderV1: vi.fn(),
  }),
);
vi.mock(
  'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1',
  () => ({
    createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3: vi.fn(),
  }),
);
vi.mock('./observed-placement-sidecar-issuer-v3', () => ({
  disposeObservedPlacementSidecarIssuedV3: vi.fn(),
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-runtime-source-v1', () => ({
  disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1: ports.disposeSource,
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-16-frame-contact-v1', () => ({
  runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1: ports.run16,
  projectBetaSkirtSavedAnnularObservedPlacement16FrameContactV1: ports.project16,
  disposeBetaSkirtSavedAnnularObservedPlacement16FrameContactV1: ports.dispose16,
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-32-frame-contact-v1', () => ({
  runBetaSkirtSavedAnnularObservedPlacement32FrameContactV1: ports.run32,
  disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1: ports.dispose32,
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1', () => ({
  createSavedObservedStrainHeatmapPreviewV1: ports.renderer,
}));
beforeEach(() => vi.resetAllMocks());
const hosts: ReturnType<typeof createSavedObservedPhysicalHostV1>[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

async function fixture(failAt: 16 | 32, reportLocation: 'result' | 'owner' = 'owner') {
  const reports = {
    source: Object.freeze({
      syntheticUnitReport: 'source',
      reportSha256: 'a'.repeat(64),
      claims: Object.freeze({ mocked: true, framesExecuted: false }),
    }),
    frame16: Object.freeze({
      syntheticUnitReport: 'frame16',
      reportSha256: 'b'.repeat(64),
      blockers: Object.freeze(failAt === 16 ? ['MOCKED-frame16-physical-failure'] : []),
    }),
    frame32: Object.freeze({
      syntheticUnitReport: 'frame32',
      reportSha256: 'c'.repeat(64),
      blockers: Object.freeze(['MOCKED-frame32-physical-failure']),
    }),
  };
  const disposed: Record<Kind, boolean> = { source: false, frame16: false, frame32: false };
  const events: string[] = [];
  const owner = (kind: Kind) =>
    Object.freeze({
      syntheticUnitOwner: kind,
      get report() {
        if (disposed[kind]) throw new Error('Report read after mocked owner disposal: ' + kind);
        return reports[kind];
      },
    });
  const owners = { source: owner('source'), frame16: owner('frame16'), frame32: owner('frame32') };
  for (const [kind, dispose] of [
    ['source', ports.disposeSource],
    ['frame16', ports.dispose16],
    ['frame32', ports.dispose32],
  ] as const) {
    dispose.mockImplementation((value: unknown) => {
      expect(value).toBe(owners[kind]);
      disposed[kind] = true;
      events.push('dispose:' + kind);
    });
  }
  let sourceDisposed = false;
  const compiled = Object.freeze({
    ok: true,
    generation: 7,
    composerSnapshot: { seal: { canonicalSha256: 'd'.repeat(64) } },
  });
  const source = {
    snapshot: () => ({
      generation: 7,
      disposed: sourceDisposed,
      composerCanonicalSha256: 'd'.repeat(64),
    }),
    consume: vi.fn(async () => ({ ok: true, compile: compiled })),
    advanceSavedGarment: vi.fn(async () => ({ ok: true })),
    dispose: vi.fn(() => {
      sourceDisposed = true;
    }),
  };
  const context = { dispose: vi.fn() };
  ports.sourceFactory.mockReturnValue(source);
  ports.contextFactory.mockReturnValue(context);
  ports.buildRuntime.mockResolvedValue({ ok: true, owner: owners.source, report: reports.source });
  const failure = (kind: 'frame16' | 'frame32') => ({
    ok: false,
    owner: owners[kind],
    detail: 'MOCKED terminal physical failure',
    ...(reportLocation === 'result' ? { report: reports[kind] } : {}),
  });
  ports.run16.mockResolvedValue(
    failAt === 16
      ? failure('frame16')
      : { ok: true, owner: owners.frame16, report: reports.frame16 },
  );
  ports.run32.mockResolvedValue(failure('frame32'));
  ports.project16.mockImplementation((value: unknown) => {
    expect(value).toBe(owners.frame16);
    expect(disposed.frame16).toBe(false);
    return { syntheticUnitProjection: true };
  });
  let bodyState = { status: 'observed-body-bound', generation: 1 };
  const listeners = new Set<() => void>();
  const body = {
    getSnapshot: () => bodyState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onDisplayedBodyInputV1: vi.fn(),
    dispose: vi.fn(),
  };
  const changeBody = () => {
    bodyState = { status: 'observed-body-bound', generation: bodyState.generation + 1 };
    for (const listener of listeners) listener();
  };
  const host = createSavedObservedPhysicalHostV1({
    row: {
      techCardId: 120,
      scopeKey: 'main',
      patternLineKey: 'fixture',
      revision: 1,
      cardLockVersion: 1,
      url: 'https://fixture.invalid/never-fetched.dxf',
      sizeBytes: 1,
      sha256: 'e'.repeat(64),
    },
    bodySession: body as unknown as SavedModelDisplayedTriangleBodySessionV2,
  });
  hosts.push(host);
  await host.downstream.consume(
    { syntheticUnitIngress: true } as never,
    new AbortController().signal,
  );
  const getContext = vi.fn(() => {
    throw new Error('UNIT tests must never request a GPU context.');
  });
  const canvas = { getContext } as unknown as HTMLCanvasElement;
  const fail = async () => {
    const first = await host.run16(canvas);
    if (failAt === 16) return first;
    expect(first.ok).toBe(true); // Mock runner progression only, never a physically CLEAR assertion.
    return host.run32(canvas, canvas);
  };
  return {
    host,
    reports,
    owners,
    disposed,
    events,
    source,
    context,
    body,
    changeBody,
    canvas,
    getContext,
    fail,
  };
}
function expectReportsCleared(host: ReturnType<typeof createSavedObservedPhysicalHostV1>) {
  expect(host.getSnapshot()).toMatchObject({
    runtimeReport: null,
    frame16Report: null,
    frame32Report: null,
    heatmapReceipt: null,
  });
}

describe('MOCKED observed host terminal diagnostic retention; no GPU/physics acceptance', () => {
  it.each(['result', 'owner'] as const)(
    'retains failed16 %s report and source after owned resources are disposed, with no32 admission',
    async (location) => {
      const f = await fixture(16, location);
      const publications: { reports: unknown; disposed: typeof f.disposed }[] = [];
      f.host.subscribe(() => {
        if (f.host.getSnapshot().status === 'blocked')
          publications.push({
            reports: structuredClone(f.host.getSnapshot()),
            disposed: { ...f.disposed },
          });
      });
      const result = await f.fail();
      expect(result.ok).toBe(false);
      expect(f.host.getSnapshot()).toMatchObject({
        status: 'blocked',
        runtimeReport: f.reports.source,
        frame16Report: f.reports.frame16,
        frame32Report: null,
        heatmapReceipt: null,
      });
      expect(f.disposed).toEqual({ source: true, frame16: true, frame32: false });
      expect(publications[0]?.disposed).toEqual(f.disposed);
      expect(publications[0]?.reports).toMatchObject({
        runtimeReport: f.reports.source,
        frame16Report: f.reports.frame16,
      });
      expect(ports.project16).not.toHaveBeenCalled();
      await expect(f.host.run32(f.canvas, f.canvas)).rejects.toThrow('16-frame checkpoint first');
      expect(ports.run32).not.toHaveBeenCalled();
      expect(ports.renderer).not.toHaveBeenCalled();
      expect(f.body.dispose).not.toHaveBeenCalled();
      expect(f.getContext).not.toHaveBeenCalled();
    },
  );

  it.each(['result', 'owner'] as const)(
    'retains failed32 %s report plus source/16 after disposing every owned runtime child',
    async (location) => {
      const f = await fixture(32, location);
      const result = await f.fail();
      expect(result.ok).toBe(false);
      expect(f.host.getSnapshot()).toMatchObject({
        status: 'blocked',
        runtimeReport: f.reports.source,
        frame16Report: f.reports.frame16,
        frame32Report: f.reports.frame32,
        heatmapReceipt: null,
      });
      expect(f.disposed).toEqual({ source: true, frame16: true, frame32: true });
      expect(f.events).toEqual(['dispose:frame32', 'dispose:frame16', 'dispose:source']);
      expect(ports.renderer).not.toHaveBeenCalled();
      expect(f.body.dispose).not.toHaveBeenCalled();
      expect(f.getContext).not.toHaveBeenCalled();
    },
  );

  it.each(['body-change', 'stop', 'dispose'] as const)(
    'clears stale retained diagnostics on %s without disposing the borrowed body',
    async (action) => {
      const f = await fixture(32);
      await f.fail();
      expect(f.host.getSnapshot().frame32Report).toEqual(f.reports.frame32);
      if (action === 'body-change') f.changeBody();
      else if (action === 'stop') f.host.stop();
      else f.host.dispose();
      expectReportsCleared(f.host);
      expect(f.host.getSnapshot().status).toBe(
        action === 'dispose' ? 'disposed' : 'local-frame-ready',
      );
      for (const dispose of [ports.disposeSource, ports.dispose16, ports.dispose32])
        expect(dispose).toHaveBeenCalledTimes(1);
      expect(f.body.dispose).not.toHaveBeenCalled();
    },
  );

  it('disposes a late failed runner owner but never publishes its diagnostics after body replacement', async () => {
    const f = await fixture(16);
    let settle!: (value: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    ports.run16.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    const pending = f.host.run16(f.canvas);
    await started;
    f.changeBody();
    settle({
      ok: false,
      owner: f.owners.frame16,
      report: f.reports.frame16,
      detail: 'MOCKED late failure',
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expectReportsCleared(f.host);
    expect(f.disposed).toEqual({ source: true, frame16: true, frame32: false });
    expect(f.body.dispose).not.toHaveBeenCalled();
    expect(ports.renderer).not.toHaveBeenCalled();
    expect(f.getContext).not.toHaveBeenCalled();
  });
});
