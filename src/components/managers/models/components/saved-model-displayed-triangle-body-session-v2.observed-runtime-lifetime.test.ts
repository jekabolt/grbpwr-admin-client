import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCurrentSavedModelObservedPlacementRuntimeSourceV1,
  createSavedModelDisplayedTriangleBodySessionV2,
} from './saved-model-displayed-triangle-body-session-v2';
import {
  deferredSessionValue,
  sessionFixture,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Genuine body adoption; all three descendants are explicit synthetic lifecycle ports.
// These tests cannot establish source/physical/GPU admission.
const ports = vi.hoisted(() => {
  const live = {
    pair: new Map<object, AbortController>(),
    world: new Map<object, AbortController>(),
    runtime: new Map<object, AbortController>(),
  };
  return {
    live,
    mint(kind: keyof typeof live, signal: AbortSignal) {
      const owner = Object.freeze({ syntheticKind: kind });
      const c = new AbortController();
      const cancel = () => c.abort();
      EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
      c.signal.addEventListener(
        'abort',
        () => EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel),
        { once: true },
      );
      if (signal.aborted) c.abort();
      live[kind].set(owner, c);
      return owner;
    },
    calls: [] as Array<{
      expectedGeneration: number;
      observedPairOwner: object;
      expectedPairReportSha256: string;
      worldInitialOwner: object;
      expectedWorldReportSha256: string;
    }>,
    mode: 'ok' as 'ok' | 'refused' | 'generation' | 'context' | 'projection',
    pause: null as Promise<void> | null,
    afterLifetime: null as (() => void) | null,
  };
});
vi.mock(
  'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1',
  () => ({
    buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1: async (
      _source: unknown,
      request: { expectedGeneration: number },
      signal: AbortSignal,
    ) => ({
      ok: true,
      owner: ports.mint('pair', signal),
      generation: request.expectedGeneration,
      sourceContextBound: true,
      report: { reportSha256: '1'.repeat(64) },
    }),
    buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1: async (
      _source: unknown,
      request: { expectedGeneration: number },
      signal: AbortSignal,
    ) => ({
      ok: true,
      owner: ports.mint('world', signal),
      generation: request.expectedGeneration,
      sourceContextBound: true,
      report: { reportSha256: '2'.repeat(64) },
    }),
    buildPatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceV1: async (
      _source: unknown,
      request: (typeof ports.calls)[number],
      signal: AbortSignal,
    ) => {
      ports.calls.push(request);
      if (ports.mode === 'refused')
        return {
          ok: false,
          owner: null,
          generation: request.expectedGeneration,
          sourceContextBound: true,
          code: 'synthetic-runtime-refusal',
          detail: 'Physical source gates refused.',
        };
      const owner = ports.mint('runtime', signal);
      if (ports.pause) await ports.pause;
      return {
        ok: true,
        owner,
        generation: request.expectedGeneration + (ports.mode === 'generation' ? 1 : 0),
        sourceContextBound: ports.mode !== 'context',
        report: { reportSha256: '3'.repeat(64) },
      };
    },
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: async (
      owner: object,
    ) => (ports.live.pair.get(owner)?.signal.aborted === false ? { metadataOnly: true } : null),
    getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1: (
      owner: object,
    ) => ports.live.pair.get(owner)?.signal ?? null,
    disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: (owner: object) =>
      ports.live.pair.get(owner)?.abort(),
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1: async (
      owner: object,
    ) =>
      ports.live.world.get(owner)?.signal.aborted === false
        ? { report: { reportSha256: '2'.repeat(64) } }
        : null,
    getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1: (
      owner: object,
    ) => ports.live.world.get(owner)?.signal ?? null,
    disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1: (
      owner: object,
    ) => ports.live.world.get(owner)?.abort(),
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-runtime-source-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1: async (owner: object) =>
      ports.mode !== 'projection' && ports.live.runtime.get(owner)?.signal.aborted === false
        ? { report: { reportSha256: '3'.repeat(64) } }
        : null,
    getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1: (owner: object) => {
      const lifetime = ports.live.runtime.get(owner)?.signal ?? null;
      ports.afterLifetime?.();
      return lifetime;
    },
    disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1: (owner: object) =>
      ports.live.runtime.get(owner)?.abort(),
  }),
);

const cleanups: Array<() => void> = [];
async function bound() {
  const fixture = await sessionFixture();
  const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(fixture.state.model),
  );
  await session.observe(fixture.input);
  cleanups.push(() => {
    session.dispose();
    fixture.input.dispose();
  });
  return { session, fixture };
}
function allDead() {
  for (const registry of Object.values(ports.live))
    expect([...registry.values()].every((c) => c.signal.aborted)).toBe(true);
}
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  for (const registry of Object.values(ports.live)) {
    registry.forEach((c) => c.abort());
    registry.clear();
  }
  ports.calls.length = 0;
  ports.mode = 'ok';
  ports.pause = null;
  ports.afterLifetime = null;
  vi.restoreAllMocks();
});

describe('private observed runtime consumer (synthetic descendant lifecycle)', () => {
  it('authenticates its body session and refuses malformed expectations before creating children', async () => {
    const { session } = await bound();
    for (const value of [null, {}, { ...session }, new Proxy(session, {})])
      expect(
        await buildCurrentSavedModelObservedPlacementRuntimeSourceV1(value, {}, 3),
      ).toMatchObject({ ok: false, code: 'invalid-observed-body-session' });
    expect((await session.buildCurrentObservedPlacementRuntimeSource({}, 0)).ok).toBe(false);
    expect(
      (await session.buildCurrentObservedPlacementRuntimeSource({}, 3, {} as AbortSignal)).ok,
    ).toBe(false);
    expect(ports.live.pair.size).toBe(0);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
  it('passes only its created pair/world and exact digests; runtime disposal releases both children and caller bridge', async () => {
    const { session } = await bound();
    const caller = new AbortController();
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    expect(
      await session.buildCurrentObservedPlacementRuntimeSource({}, 3, caller.signal),
    ).toMatchObject({ ok: true, generation: 3, sourceContextBound: true });
    expect(ports.calls).toEqual([
      {
        expectedGeneration: 3,
        observedPairOwner: [...ports.live.pair.keys()][0],
        expectedPairReportSha256: '1'.repeat(64),
        worldInitialOwner: [...ports.live.world.keys()][0],
        expectedWorldReportSha256: '2'.repeat(64),
      },
    ]);
    [...ports.live.runtime.values()][0]!.abort();
    allDead();
    const attached = added.mock.calls.flatMap((args, i) =>
      added.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    const detached = removed.mock.calls.flatMap((args, i) =>
      removed.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(attached).toHaveLength(1);
    expect(detached).toContain(attached[0]);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
  it.each(['caller', 'body-null', 'dispose'] as const)(
    'retains %s revocation through all owned descendants',
    async (kind) => {
      const { session, fixture } = await bound();
      const caller = new AbortController();
      expect(
        (await session.buildCurrentObservedPlacementRuntimeSource({}, 3, caller.signal)).ok,
      ).toBe(true);
      if (kind === 'caller') caller.abort();
      if (kind === 'body-null') await session.observe(null);
      if (kind === 'dispose') session.dispose();
      allDead();
      expect(fixture.input.isCurrent()).toBe(true);
      if (kind === 'caller') expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );
  it.each(['refused', 'generation', 'context', 'projection'] as const)(
    'preserves the borrowed body and cleans children after %s',
    async (mode) => {
      const { session } = await bound();
      ports.mode = mode;
      expect((await session.buildCurrentObservedPlacementRuntimeSource({}, 3)).ok).toBe(false);
      allDead();
      expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );
  it('disposes a late runtime after the body is removed', async () => {
    const { session } = await bound();
    const gate = deferredSessionValue<void>();
    ports.pause = gate.promise;
    const pending = session.buildCurrentObservedPlacementRuntimeSource({}, 3);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(1));
    await session.observe(null);
    gate.resolve();
    expect((await pending).ok).toBe(false);
    allDead();
  });
  it('refuses synchronous caller cancellation in the terminal genuine source poll', async () => {
    const { session, fixture } = await bound();
    const caller = new AbortController();
    const observation = fixture.state.observation;
    let armed = false;
    ports.afterLifetime = () => {
      armed = true;
    };
    Object.defineProperty(fixture.state, 'observation', {
      configurable: true,
      enumerable: true,
      get() {
        if (armed) {
          armed = false;
          caller.abort();
        }
        return observation;
      },
    });
    try {
      expect(
        (await session.buildCurrentObservedPlacementRuntimeSource({}, 3, caller.signal)).ok,
      ).toBe(false);
      allDead();
    } finally {
      Object.defineProperty(fixture.state, 'observation', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: observation,
      });
    }
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
});
