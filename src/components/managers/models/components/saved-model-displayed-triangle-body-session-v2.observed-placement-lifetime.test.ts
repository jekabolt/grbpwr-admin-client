import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1,
  createSavedModelDisplayedTriangleBodySessionV2,
} from './saved-model-displayed-triangle-body-session-v2';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from './saved-model-displayed-triangle-body-owner-v2';
import type {
  SavedModelDisplayedTriangleBodyBindingV2,
  SavedModelDisplayedTriangleBodyOwnerV2,
} from './saved-model-displayed-triangle-body-owner-v2';
import {
  deferredSessionValue,
  sessionFixture,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Genuine observed input/adoption; synthetic pair ports test ownership, never cloth physics.
const ports = vi.hoisted(() => ({
  children: new Map<object, AbortController>(),
  calls: [] as Array<{
    source: unknown;
    body: unknown;
    binding: unknown;
    generation: number;
    signal: AbortSignal;
  }>,
  pause: null as Promise<void> | null,
  generationOffset: 0,
  sourceContextBound: true,
  staleProjection: false,
  afterLifetimeRead: null as (() => void) | null,
}));
vi.mock(
  'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1',
  () => ({
    buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1: async (
      source: unknown,
      input: {
        expectedGeneration: number;
        displayedBodyOwner: unknown;
        displayedBodyBinding: unknown;
      },
      signal: AbortSignal,
    ) => {
      ports.calls.push({
        source,
        body: input.displayedBodyOwner,
        binding: input.displayedBodyBinding,
        generation: input.expectedGeneration,
        signal,
      });
      const owner = Object.freeze({ kind: 'synthetic-saved-garment-pair-lifetime-only' });
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      controller.signal.addEventListener(
        'abort',
        () => signal.removeEventListener('abort', abort),
        { once: true },
      );
      if (signal.aborted) controller.abort();
      ports.children.set(owner, controller);
      if (ports.pause) await ports.pause;
      return {
        ok: true,
        owner,
        generation: input.expectedGeneration + ports.generationOffset,
        sourceContextBound: ports.sourceContextBound,
        report: { runtimeAuthority: false },
      };
    },
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1',
  () => ({
    projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: async (
      owner: object,
    ) =>
      !ports.staleProjection && ports.children.get(owner)?.signal.aborted === false
        ? { metadataOnly: true }
        : null,
    getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1: (
      owner: object,
    ) => {
      const lifetime = ports.children.get(owner)?.signal ?? null;
      ports.afterLifetimeRead?.();
      return lifetime;
    },
    disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1: (
      owner: object,
    ) => {
      const child = ports.children.get(owner);
      if (!child || child.signal.aborted) return false;
      child.abort();
      return true;
    },
  }),
);

const sessions: Array<ReturnType<typeof createSavedModelDisplayedTriangleBodySessionV2>> = [];
async function boundSession() {
  const fixture = await sessionFixture();
  const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(fixture.state.model),
  );
  sessions.push(session);
  await session.observe(fixture.input);
  return { fixture, session };
}
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  for (const child of ports.children.values()) child.abort();
  ports.children.clear();
  ports.calls.length = 0;
  ports.pause = null;
  ports.generationOffset = 0;
  ports.sourceContextBound = true;
  ports.staleProjection = false;
  ports.afterLifetimeRead = null;
  vi.restoreAllMocks();
});

describe('private observed-body to persisted observed-placement garment handoff (synthetic pair lifecycle only)', () => {
  it('rejects structural body sessions before invoking any method or garment handoff', async () => {
    const { session } = await boundSession();
    const getter = vi.fn();
    const fake = Object.defineProperty({}, 'buildCurrentObservedPlacementGarmentPair', {
      get: getter,
    });
    for (const candidate of [fake, { ...session }, new Proxy(session, {}), null]) {
      expect(
        await buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1(
          candidate,
          {},
          3,
        ),
      ).toMatchObject({
        ok: false,
        generation: 0,
        sourceContextBound: false,
        code: 'invalid-observed-body-session',
      });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
  });

  it('passes the genuine private body and the requested compile CAS to the fixed dispatcher', async () => {
    const { session } = await boundSession();
    const source = Object.freeze({ syntheticSourceSessionForPort: true });
    const result = await buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1(
      session,
      source,
      3,
    );
    expect(result).toMatchObject({ ok: true, generation: 3, sourceContextBound: true });
    expect(ports.calls).toHaveLength(1);
    const call = ports.calls[0]!;
    expect(call.source).toBe(source);
    expect(call.generation).toBe(3);
    expect(
      getSavedModelDisplayedTriangleBodyLifetimeV2(
        call.body as SavedModelDisplayedTriangleBodyOwnerV2,
        call.binding as SavedModelDisplayedTriangleBodyBindingV2,
      )?.aborted,
    ).toBe(false);
    expect(session.getSnapshot().generation).toBe(1);
    expect(session.getSnapshot().runtimeAuthority).toBe(false);
  });

  it.each(['caller', 'body-null', 'dispose'] as const)(
    'retains %s cancellation after the child is returned',
    async (kind) => {
      const { session, fixture } = await boundSession();
      const caller = new AbortController();
      const result = await session.buildCurrentObservedPlacementGarmentPair({}, 3, caller.signal);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const child = ports.children.get(result.owner)!;
      expect(child.signal.aborted).toBe(false);
      if (kind === 'caller') caller.abort();
      if (kind === 'body-null') await session.observe(null);
      if (kind === 'dispose') session.dispose();
      expect(child.signal.aborted).toBe(true);
      expect(fixture.input.isCurrent()).toBe(true);
      if (kind === 'caller') {
        expect(session.getSnapshot().status).toBe('observed-body-bound');
        expect((await session.projectCurrentBody()).status).toBe('projected');
      }
    },
  );

  it('revokes a pending handoff on body replacement and discards its late child', async () => {
    const { session, fixture } = await boundSession();
    const gate = deferredSessionValue<void>();
    ports.pause = gate.promise;
    const pending = session.buildCurrentObservedPlacementGarmentPair({}, 3);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(1));
    await session.observe(null);
    expect(ports.calls[0]!.signal.aborted).toBe(true);
    gate.resolve(undefined);
    expect((await pending).ok).toBe(false);
    expect([...ports.children.values()].every((child) => child.signal.aborted)).toBe(true);
    expect(fixture.input.isCurrent()).toBe(true);
  });

  it('removes the exact caller bridge when the returned child is disposed', async () => {
    const { session } = await boundSession();
    const caller = new AbortController();
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const result = await session.buildCurrentObservedPlacementGarmentPair({}, 3, caller.signal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bridges = added.mock.calls.flatMap((args, index) =>
      added.mock.contexts[index] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(bridges).toHaveLength(1);
    ports.children.get(result.owner)!.abort();
    const released = removed.mock.calls.flatMap((args, index) =>
      removed.mock.contexts[index] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(released).toEqual(bridges);
    caller.abort();
    expect(session.getSnapshot().status).toBe('observed-body-bound');
  });

  it.each(['generation', 'source-context', 'fresh-pair'] as const)(
    'disposes a child failing %s publication checks and preserves the shared body',
    async (kind) => {
      const { session, fixture } = await boundSession();
      if (kind === 'generation') ports.generationOffset = 1;
      if (kind === 'source-context') ports.sourceContextBound = false;
      if (kind === 'fresh-pair') ports.staleProjection = true;
      expect(await session.buildCurrentObservedPlacementGarmentPair({}, 3)).toMatchObject({
        ok: false,
        code: 'saved-garment-observed-pair-handoff-failed',
      });
      expect(ports.children.size).toBe(1);
      expect([...ports.children.values()][0]!.signal.aborted).toBe(true);
      expect(session.getSnapshot().status).toBe('observed-body-bound');
      expect(fixture.input.isCurrent()).toBe(true);
      expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );

  it('refuses a child cancelled by the final genuine host currentness callback', async () => {
    const { session, fixture } = await boundSession();
    const caller = new AbortController();
    const observation = fixture.state.observation;
    let armed = false;
    let cancellations = 0;
    ports.afterLifetimeRead = () => {
      armed = true;
    };
    Object.defineProperty(fixture.state, 'observation', {
      configurable: true,
      enumerable: true,
      get() {
        if (armed) {
          armed = false;
          cancellations++;
          caller.abort();
        }
        return observation;
      },
    });
    try {
      expect(
        await session.buildCurrentObservedPlacementGarmentPair({}, 3, caller.signal),
      ).toMatchObject({ ok: false, code: 'saved-garment-observed-pair-handoff-failed' });
      expect(cancellations).toBe(1);
      expect(ports.children.size).toBe(1);
      expect([...ports.children.values()][0]!.signal.aborted).toBe(true);
      expect(session.getSnapshot().status).toBe('observed-body-bound');
    } finally {
      Object.defineProperty(fixture.state, 'observation', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: observation,
      });
    }
    expect(fixture.input.isCurrent()).toBe(true);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });

  it('rejects invalid CAS without changing body state or entering the garment port', async () => {
    const { session } = await boundSession();
    const before = session.getSnapshot();
    expect(await session.buildCurrentObservedPlacementGarmentPair({}, 0)).toMatchObject({
      ok: false,
      code: 'invalid-generation',
    });
    expect(session.getSnapshot()).toBe(before);
    expect(ports.calls).toHaveLength(0);
  });
});
