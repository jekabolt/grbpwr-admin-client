import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  buildCurrentSavedModelObservedPlacementWorldInitialPreflightV1,
} from './saved-model-displayed-triangle-body-session-v2';
import {
  sessionFixture,
  deferredSessionValue,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Genuine body capture/adoption. Pair/world ports only probe descendant ownership, not physics.
const ports = vi.hoisted(() => ({
  pairs: new Map<object, AbortController>(),
  worlds: new Map<object, AbortController>(),
  calls: [] as Array<{ pair: object; generation: number; sha: string }>,
  pause: null as Promise<void> | null,
  mode: 'ok' as 'ok' | 'refused' | 'generation' | 'context' | 'projection',
  afterLifetime: null as (() => void) | null,
}));
vi.mock(
  'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1',
  () => {
    const link = (signal: AbortSignal) => {
      const c = new AbortController();
      const abort = () => c.abort();
      signal.addEventListener('abort', abort, { once: true });
      c.signal.addEventListener('abort', () => signal.removeEventListener('abort', abort), {
        once: true,
      });
      if (signal.aborted) c.abort();
      return c;
    };
    return {
      buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1: async (
        _source: unknown,
        request: { expectedGeneration: number },
        signal: AbortSignal,
      ) => {
        const owner = Object.freeze({ syntheticPair: true });
        ports.pairs.set(owner, link(signal));
        return {
          ok: true,
          owner,
          generation: request.expectedGeneration,
          sourceContextBound: true,
          report: { reportSha256: '1'.repeat(64) },
        };
      },
      buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1:
        async (
          _source: unknown,
          request: {
            expectedGeneration: number;
            observedPairOwner: object;
            expectedPairReportSha256: string;
          },
          signal: AbortSignal,
        ) => {
          ports.calls.push({
            pair: request.observedPairOwner,
            generation: request.expectedGeneration,
            sha: request.expectedPairReportSha256,
          });
          if (ports.mode === 'refused')
            return {
              ok: false,
              owner: null,
              generation: request.expectedGeneration,
              sourceContextBound: true,
              code: 'synthetic-world-refused',
              detail: 'Synthetic refusal',
            };
          const owner = Object.freeze({ syntheticWorld: true });
          ports.worlds.set(owner, link(signal));
          if (ports.pause) await ports.pause;
          return {
            ok: true,
            owner,
            generation: request.expectedGeneration + (ports.mode === 'generation' ? 1 : 0),
            sourceContextBound: ports.mode !== 'context',
            report: { reportSha256: '2'.repeat(64) },
          };
        },
    };
  },
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: async (
      owner: object,
    ) => (ports.pairs.get(owner)?.signal.aborted === false ? { metadataOnly: true } : null),
    getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1: (
      owner: object,
    ) => ports.pairs.get(owner)?.signal ?? null,
    disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: (
      owner: object,
    ) => {
      const c = ports.pairs.get(owner);
      if (!c || c.signal.aborted) return false;
      c.abort();
      return true;
    },
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1: async (
      owner: object,
    ) =>
      ports.mode !== 'projection' && ports.worlds.get(owner)?.signal.aborted === false
        ? { report: { reportSha256: '2'.repeat(64) } }
        : null,
    getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1: (
      owner: object,
    ) => {
      const s = ports.worlds.get(owner)?.signal ?? null;
      ports.afterLifetime?.();
      return s;
    },
    disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1: (
      owner: object,
    ) => {
      const c = ports.worlds.get(owner);
      if (!c || c.signal.aborted) return false;
      c.abort();
      return true;
    },
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
  expect([...ports.pairs.values()].every((c) => c.signal.aborted)).toBe(true);
  expect([...ports.worlds.values()].every((c) => c.signal.aborted)).toBe(true);
}
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  ports.pairs.forEach((c) => c.abort());
  ports.worlds.forEach((c) => c.abort());
  ports.pairs.clear();
  ports.worlds.clear();
  ports.calls.length = 0;
  ports.pause = null;
  ports.mode = 'ok';
  ports.afterLifetime = null;
  vi.restoreAllMocks();
});

describe('private world consumer (synthetic descendant lifecycle)', () => {
  it('rejects forged body sessions before entering either fixed port', async () => {
    const { session } = await bound();
    for (const candidate of [null, { ...session }, new Proxy(session, {}), {}])
      expect(
        await buildCurrentSavedModelObservedPlacementWorldInitialPreflightV1(candidate, {}, 3),
      ).toMatchObject({ ok: false, code: 'invalid-observed-body-session' });
    expect(ports.pairs.size).toBe(0);
    expect(ports.calls).toHaveLength(0);
  });
  it('passes its internally created pair and exact digest, then disposes that pair with the world child', async () => {
    const { session } = await bound();
    const caller = new AbortController();
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const result = await session.buildCurrentObservedPlacementWorldInitialPreflight(
      {},
      3,
      caller.signal,
    );
    expect(result).toMatchObject({ ok: true, generation: 3, sourceContextBound: true });
    expect(ports.pairs.size).toBe(1);
    expect(ports.calls).toEqual([
      { pair: [...ports.pairs.keys()][0], generation: 3, sha: '1'.repeat(64) },
    ]);
    [...ports.worlds.values()][0]!.abort();
    allDead();
    const bridges = added.mock.calls.flatMap((args, i) =>
      added.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    const released = removed.mock.calls.flatMap((args, i) =>
      removed.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(bridges).toHaveLength(1);
    expect(released).toContain(bridges[0]);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
  it.each(['caller', 'body-null', 'dispose'] as const)(
    'retains %s cancellation for both owned descendants',
    async (kind) => {
      const { session, fixture } = await bound();
      const caller = new AbortController();
      expect(
        (await session.buildCurrentObservedPlacementWorldInitialPreflight({}, 3, caller.signal)).ok,
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
    'releases children on %s failure',
    async (mode) => {
      const { session } = await bound();
      ports.mode = mode;
      expect((await session.buildCurrentObservedPlacementWorldInitialPreflight({}, 3)).ok).toBe(
        false,
      );
      allDead();
      expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );
  it('discards a late preflight after body removal', async () => {
    const { session } = await bound();
    const gate = deferredSessionValue<void>();
    ports.pause = gate.promise;
    const pending = session.buildCurrentObservedPlacementWorldInitialPreflight({}, 3);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(1));
    await session.observe(null);
    gate.resolve();
    expect((await pending).ok).toBe(false);
    allDead();
  });
  it('refuses invalid signal and generation without entering ports', async () => {
    const { session } = await bound();
    expect((await session.buildCurrentObservedPlacementWorldInitialPreflight({}, 0)).ok).toBe(
      false,
    );
    expect(
      (await session.buildCurrentObservedPlacementWorldInitialPreflight({}, 3, {} as AbortSignal))
        .ok,
    ).toBe(false);
    expect(ports.pairs.size).toBe(0);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
  it('rejects cancellation from final genuine host poll', async () => {
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
        (await session.buildCurrentObservedPlacementWorldInitialPreflight({}, 3, caller.signal)).ok,
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
