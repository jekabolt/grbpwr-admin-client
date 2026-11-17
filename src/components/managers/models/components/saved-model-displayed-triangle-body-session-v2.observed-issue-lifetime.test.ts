import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  issueCurrentSavedModelObservedPlacementV3,
  type CurrentSavedModelObservedPlacementIssueRequestV3,
} from './saved-model-displayed-triangle-body-session-v2';
import {
  sessionFixture,
  deferredSessionValue,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
} from './saved-model-displayed-triangle-body-owner-v2';

// Body input/adoption/target projection are genuine. Issuer ports below are synthetic lifecycle
// probes, not storage/body/compiler authority and never a substitute for the genuine chain test.
const ports = vi.hoisted(() => ({
  children: new Map<object, { controller: AbortController; targetSha: string }>(),
  calls: [] as Array<{ source: unknown; request: Record<string, unknown>; signal: AbortSignal }>,
  pause: null as Promise<void> | null,
  generationOffset: 0,
  sourceContextBound: true,
  projectWrongTarget: false,
  onLifetime: null as (() => void) | null,
}));
vi.mock(
  'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1',
  () => ({
    issuePatternImportDxfProductSavedAnnularObservedPlacementV3: async (
      source: unknown,
      request: Record<string, unknown>,
      signal: AbortSignal,
    ) => {
      ports.calls.push({ source, request, signal });
      const owner = Object.freeze({ syntheticIssuedLifetimeOnly: true });
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal.addEventListener('abort', cancel, { once: true });
      controller.signal.addEventListener(
        'abort',
        () => signal.removeEventListener('abort', cancel),
        { once: true },
      );
      if (signal.aborted) controller.abort();
      ports.children.set(owner, { controller, targetSha: request.confirmedTargetSha256 as string });
      if (ports.pause) await ports.pause;
      return {
        ok: true,
        owner,
        generation: (request.expectedGeneration as number) + ports.generationOffset,
        sourceContextBound: ports.sourceContextBound,
      };
    },
  }),
);
vi.mock('components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3', () => ({
  projectObservedPlacementSidecarIssuedV3: async (owner: object) => {
    const state = ports.children.get(owner);
    return state && !state.controller.signal.aborted
      ? {
          document: {
            placementAuthoring: {
              observedTarget: {
                canonicalSha256: ports.projectWrongTarget ? 'f'.repeat(64) : state.targetSha,
              },
            },
          },
        }
      : null;
  },
  getObservedPlacementSidecarIssuedLifetimeV3: (owner: object) => {
    const signal = ports.children.get(owner)?.controller.signal ?? null;
    ports.onLifetime?.();
    return signal;
  },
  disposeObservedPlacementSidecarIssuedV3: (owner: object) => {
    const state = ports.children.get(owner);
    if (!state || state.controller.signal.aborted) return false;
    state.controller.abort();
    return true;
  },
}));
const cleanups: Array<() => void> = [];
async function bound() {
  const fixture = await sessionFixture(731, 7);
  const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(fixture.state.model),
  );
  cleanups.push(() => {
    session.dispose();
    fixture.input.dispose();
  });
  await session.observe(fixture.input);
  const target = await session.projectCurrentPlacementTarget();
  if (!target.ok) throw new Error(target.detail);
  // The fixed synthetic source port intentionally accepts this minimal intent; real D0 validation
  // belongs to the separate genuine first-save integration test.
  const request = {
    expectedGeneration: 3,
    confirmed: true,
    garment: { fixture: 'explicit' },
    policy: { fixture: 'policy' },
    annularParameters: { fixture: 'annular' },
    confirmedTargetSha256: target.canonicalSha256,
    readCurrentEvidence: async () => ({ fixture: true }),
  } as unknown as CurrentSavedModelObservedPlacementIssueRequestV3;
  return { fixture, session, target, request };
}
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  ports.children.forEach((v) => v.controller.abort());
  ports.children.clear();
  ports.calls.length = 0;
  ports.pause = null;
  ports.generationOffset = 0;
  ports.sourceContextBound = true;
  ports.projectWrongTarget = false;
  ports.onLifetime = null;
  vi.restoreAllMocks();
});

describe('fixed observed first-issue consumer (synthetic issuer lifecycle only)', () => {
  it('projects the genuine non-A pose target without exposing its body owner', async () => {
    const { session, target } = await bound();
    expect(target.target.pose.document.pose.headYawDeg).toBe(7);
    expect(target.claims.runtimeAdmission).toBe(false);
    expect(Object.keys(session)).not.toContain('bodyOwner');
    const cancelled = new AbortController();
    cancelled.abort();
    expect((await session.projectCurrentPlacementTarget(cancelled.signal)).ok).toBe(false);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });
  it('rejects copied and structural sessions before touching request getters', async () => {
    const { session } = await bound();
    const getter = vi.fn();
    const fakeRequest = Object.defineProperty({}, 'expectedGeneration', { get: getter });
    for (const candidate of [
      null,
      { ...session },
      new Proxy(session, {}),
      { issueCurrentObservedPlacementV3: vi.fn() },
    ])
      expect(
        await issueCurrentSavedModelObservedPlacementV3(
          candidate,
          {},
          fakeRequest as CurrentSavedModelObservedPlacementIssueRequestV3,
        ),
      ).toMatchObject({
        ok: false,
        sourceContextBound: false,
        code: 'invalid-observed-body-session',
      });
    expect(getter).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
  });
  it('captures confirmed intent before any async read and passes genuine private body to fixed source', async () => {
    const { session, request } = await bound();
    const original = request.confirmedTargetSha256;
    const pending = issueCurrentSavedModelObservedPlacementV3(session, {}, request);
    Object.assign(request, { confirmedTargetSha256: 'f'.repeat(64) });
    Object.assign(request.garment, { fixture: 'mutated' });
    const issued = await pending;
    expect(issued).toMatchObject({ ok: true, generation: 3, sourceContextBound: true });
    expect(ports.calls).toHaveLength(1);
    const call = ports.calls[0]!;
    expect(call.request.confirmedTargetSha256).toBe(original);
    expect(call.request.garment).toEqual({ fixture: 'explicit' });
    expect(
      getSavedModelDisplayedTriangleBodyLifetimeV2(
        call.request.displayedBodyOwner as SavedModelDisplayedTriangleBodyOwnerV2,
        call.request.displayedBodyBinding as SavedModelDisplayedTriangleBodyBindingV2,
      )?.aborted,
    ).toBe(false);
  });
  it('refuses changed target or accessor intent before entering source issuance', async () => {
    const { session, request } = await bound();
    expect(
      await session.issueCurrentObservedPlacementV3(
        {},
        { ...request, confirmedTargetSha256: 'f'.repeat(64) },
      ),
    ).toMatchObject({ ok: false, code: 'observed-target-changed' });
    const getter = vi.fn();
    const garment = Object.defineProperty({}, 'fixture', { enumerable: true, get: getter });
    expect(
      (await session.issueCurrentObservedPlacementV3({}, { ...request, garment } as typeof request))
        .ok,
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
  });
  it('refuses a non-string target digest without executing its coercion callback', async () => {
    const { session, request } = await bound();
    const coerce = vi.fn(() => {
      session.dispose();
      return request.confirmedTargetSha256;
    });
    const target = Object.defineProperty({}, Symbol.toPrimitive, { value: coerce });
    expect(
      (
        await session.issueCurrentObservedPlacementV3({}, {
          ...request,
          confirmedTargetSha256: target,
        } as unknown as typeof request)
      ).ok,
    ).toBe(false);
    expect(coerce).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });

  it('returns a blocked result for invalid signal without throwing during cleanup', async () => {
    const { session, request } = await bound();
    for (const signal of [
      {},
      null,
      { aborted: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    ]) {
      expect(
        await session.issueCurrentObservedPlacementV3(
          {},
          request,
          signal as unknown as AbortSignal,
        ),
      ).toMatchObject({ ok: false, code: 'observed-placement-issue-handoff-failed' });
    }
    expect(ports.calls).toHaveLength(0);
    expect((await session.projectCurrentBody()).status).toBe('projected');
  });

  it.each(['caller', 'body-null', 'dispose'] as const)(
    'retains %s revocation after issue returns',
    async (kind) => {
      const { session, fixture, request } = await bound();
      const caller = new AbortController();
      const issued = await session.issueCurrentObservedPlacementV3({}, request, caller.signal);
      if (!issued.ok) throw new Error(JSON.stringify(issued));
      const child = ports.children.get(issued.owner)!;
      if (kind === 'caller') caller.abort();
      if (kind === 'body-null') await session.observe(null);
      if (kind === 'dispose') session.dispose();
      expect(child.controller.signal.aborted).toBe(true);
      expect(fixture.input.isCurrent()).toBe(true);
      if (kind === 'caller') expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );
  it('discards late issued child on body replacement', async () => {
    const { session, request } = await bound();
    const pause = deferredSessionValue<void>();
    ports.pause = pause.promise;
    const pending = session.issueCurrentObservedPlacementV3({}, request);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(1));
    await session.observe(null);
    pause.resolve();
    expect((await pending).ok).toBe(false);
    expect([...ports.children.values()][0]!.controller.signal.aborted).toBe(true);
  });
  it.each(['generation', 'source', 'target'] as const)(
    'disposes child rejected by final %s binding',
    async (kind) => {
      const { session, request } = await bound();
      if (kind === 'generation') ports.generationOffset = 1;
      if (kind === 'source') ports.sourceContextBound = false;
      if (kind === 'target') ports.projectWrongTarget = true;
      expect((await session.issueCurrentObservedPlacementV3({}, request)).ok).toBe(false);
      expect([...ports.children.values()][0]!.controller.signal.aborted).toBe(true);
      expect((await session.projectCurrentBody()).status).toBe('projected');
    },
  );
  it('rechecks caller after final genuine source poll and releases the exact listener bridge', async () => {
    const { session, fixture, request } = await bound();
    const caller = new AbortController();
    const observation = fixture.state.observation;
    let armed = false;
    ports.onLifetime = () => {
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
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    try {
      expect((await session.issueCurrentObservedPlacementV3({}, request, caller.signal)).ok).toBe(
        false,
      );
      expect([...ports.children.values()][0]!.controller.signal.aborted).toBe(true);
      const bridges = added.mock.calls.flatMap((args, i) =>
        added.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
      );
      const releases = removed.mock.calls.flatMap((args, i) =>
        removed.mock.contexts[i] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
      );
      expect(bridges).toHaveLength(1);
      expect(releases).toContain(bridges[0]);
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
