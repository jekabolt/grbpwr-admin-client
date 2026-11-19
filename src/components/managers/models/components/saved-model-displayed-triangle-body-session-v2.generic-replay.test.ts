import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { XpbdDeviceLease } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  projectCurrentSavedModelGenericObservedTargetV1,
  runCurrentSavedModelGenericObserved16V1,
  runCurrentSavedModelGenericObserved32V1,
  type CurrentSavedModelGenericObservedReplayRequestV1,
} from './saved-model-displayed-triangle-body-session-v2';
import {
  sessionFixture,
  deferredSessionValue,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Genuine producer/adopter/model reads + explicit synthetic numeric receipt lifecycle only.
// No GPU, physics, source proof, durable graph or product admission is established here.
const ports = vi.hoisted(() => ({
  live: new Map<object, AbortController>(),
  calls: [] as Array<{
    request: Record<string, unknown>;
    signal: AbortSignal;
    frame: number;
    prior: unknown;
  }>,
  after: null as (() => void) | null,
  pause: null as Promise<void> | null,
}));
vi.mock('components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1', () => {
  const run = async (
    request: Record<string, unknown>,
    frame: number,
    prior: unknown,
    signal: AbortSignal,
  ) => {
    const c = new AbortController(),
      owner = Object.freeze({ syntheticNumericLifecycle: true, frame });
    const cancel = () => c.abort();
    signal.addEventListener('abort', cancel, { once: true });
    c.signal.addEventListener('abort', () => signal.removeEventListener('abort', cancel), {
      once: true,
    });
    if (signal.aborted) c.abort();
    ports.live.set(owner, c);
    ports.calls.push({ request, signal, frame, prior });
    ports.after?.();
    if (ports.pause) await ports.pause;
    return {
      ok: true,
      owner,
      report: {
        status: 'diagnostic-completed',
        reportSha256: 'a'.repeat(64),
        claims: { runtimeAuthority: false },
      },
      blockers: [],
    };
  };
  return {
    runDxfGarmentObservedWebgpu16ReplayV1: (
      r: Record<string, unknown>,
      _lease: unknown,
      s: AbortSignal,
    ) => run(r, 16, null, s),
    runDxfGarmentObservedWebgpu32ReplayV1: (
      r: Record<string, unknown>,
      prior: unknown,
      _lease: unknown,
      s: AbortSignal,
    ) => run(r, 32, prior, s),
    getDxfGarmentObservedWebgpuReplayLifetimeV1: (o: object) =>
      ports.live.get(o)?.signal.aborted === false ? ports.live.get(o)!.signal : null,
    disposeDxfGarmentObservedWebgpuReplayV1: (o: object) => {
      ports.live.get(o)?.abort();
      return true;
    },
  };
});
const cleanup: Array<() => void> = [];
const lease = {} as XpbdDeviceLease;
beforeEach(() => {
  ports.calls.length = 0;
  ports.live.clear();
  ports.after = null;
  ports.pause = null;
});
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f());
});
async function fixture() {
  const f = await sessionFixture();
  let held: Promise<typeof f.state.model> | null = null;
  const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    held ? await held : structuredClone(f.state.model),
  );
  await session.observe(f.input);
  cleanup.push(() => {
    session.dispose();
    f.input.dispose();
  });
  const target = await projectCurrentSavedModelGenericObservedTargetV1(session);
  if (!target.ok) throw new Error(target.detail);
  const request = {
    schemaVersion: 'dxf-garment-observed-webgpu-replay/1',
    profile: 'garment-material-contact-replay/1',
    // The fake numeric port never interprets this intentionally minimal content fixture.
    placementRequest: { syntheticLifecycleBytes: new Float32Array([1, 2, 3]) },
    hostCompileGeneration: 7,
    parameters: {},
    coreBudgets: {},
    executionBudgets: {},
    expected: { placementReportSha256: '1'.repeat(64), prefixPlanSha256: '2'.repeat(64) },
    timeoutMs: 1000,
    expectedObservedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
  } as unknown as CurrentSavedModelGenericObservedReplayRequestV1;
  return {
    f,
    session,
    request,
    setHeld: (p: typeof held) => {
      held = p;
    },
  };
}
describe('fixed generic numeric body dispatch with genuine private body context', () => {
  it('inserts private genuine body and binding only through fixed16/32 methods; captures metadata', async () => {
    const f = await fixture();
    const result = await runCurrentSavedModelGenericObserved16V1(f.session, f.request, lease);
    expect(result.ok).toBe(true);
    expect(ports.calls).toHaveLength(1);
    expect(ports.calls[0].request.bodyOwner).toBeTruthy();
    expect(ports.calls[0].request.bodyBinding).toEqual(f.session.getSnapshot().binding);
    expect(ports.calls[0].request).not.toHaveProperty('expectedObservedTarget');
    expect(ports.calls[0].request.placementRequest).not.toBe(f.request.placementRequest);
    const second = await runCurrentSavedModelGenericObserved32V1(
      f.session,
      f.request,
      result.owner,
      lease,
    );
    expect(second.ok).toBe(true);
    expect(ports.calls[1].prior).toBe(result.owner);
    expect(f.session.getSnapshot().runtimeAuthority).toBe(false);
  });
  it('rejects forged sessions without invoking getters or nominal methods', async () => {
    const get = vi.fn(() => {
      throw new Error('must not run');
    });
    const fake = Object.defineProperty({}, 'runCurrentGenericObserved', { get });
    const result = await runCurrentSavedModelGenericObserved16V1(fake, {} as never, lease);
    expect(result.ok).toBe(false);
    expect((await projectCurrentSavedModelGenericObservedTargetV1(fake)).ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
  });
  it('rejects stale target and decorated binary data before numeric entry', async () => {
    const f = await fixture();
    const bad = {
      ...structuredClone(f.request),
      expectedObservedTarget: {
        ...f.request.expectedObservedTarget,
        canonicalSha256: '0'.repeat(64),
      },
    };
    expect((await runCurrentSavedModelGenericObserved16V1(f.session, bad, lease)).ok).toBe(false);
    const bytes = (
      f.request.placementRequest as unknown as { syntheticLifecycleBytes: Float32Array }
    ).syntheticLifecycleBytes;
    const getter = vi.fn(() => 4);
    Object.defineProperty(bytes, 'byteLength', { get: getter });
    expect((await runCurrentSavedModelGenericObserved16V1(f.session, f.request, lease)).ok).toBe(
      false,
    );
    expect(getter).not.toHaveBeenCalled();
    expect(ports.calls).toHaveLength(0);
  });
  it('captures before held model read and ignores caller mutation while awaiting', async () => {
    const f = await fixture(),
      held = deferredSessionValue<typeof f.f.state.model>();
    f.setHeld(held.promise);
    const run = runCurrentSavedModelGenericObserved16V1(f.session, f.request, lease);
    (
      f.request.placementRequest as unknown as { syntheticLifecycleBytes: Float32Array }
    ).syntheticLifecycleBytes[0] = 99;
    held.resolve(structuredClone(f.f.state.model));
    f.setHeld(null);
    expect((await run).ok).toBe(true);
    expect(
      (ports.calls[0].request.placementRequest as { syntheticLifecycleBytes: Float32Array })
        .syntheticLifecycleBytes[0],
    ).toBe(1);
  });
  it('caller abort during held fresh read does not revoke the borrowed body', async () => {
    const f = await fixture(),
      held = deferredSessionValue<typeof f.f.state.model>(),
      controller = new AbortController();
    f.setHeld(held.promise);
    const run = runCurrentSavedModelGenericObserved16V1(
      f.session,
      f.request,
      lease,
      controller.signal,
    );
    controller.abort();
    expect((await run).ok).toBe(false);
    held.resolve(structuredClone(f.f.state.model));
    f.setHeld(null);
    expect((await f.session.projectCurrentBody()).status).toBe('projected');
    expect(ports.calls).toHaveLength(0);
  });
  it('retains caller/body cancellation after successful return and unlinks on child disposal', async () => {
    const f = await fixture(),
      controller = new AbortController();
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    try {
      const result = await runCurrentSavedModelGenericObserved16V1(
        f.session,
        f.request,
        lease,
        controller.signal,
      );
      expect(result.ok).toBe(true);
      controller.abort();
      expect(ports.live.get(result.owner!)?.signal.aborted).toBe(true);
      expect((await f.session.projectCurrentBody()).status).toBe('projected');
      expect(remove).toHaveBeenCalled();
      const next = await runCurrentSavedModelGenericObserved16V1(f.session, f.request, lease);
      expect(next.ok).toBe(true);
      await f.session.observe(null);
      expect(ports.live.get(next.owner!)?.signal.aborted).toBe(true);
    } finally {
      remove.mockRestore();
    }
  });
  it('refuses publication after exact persisted-body drift and disposes the late child', async () => {
    const f = await fixture();
    ports.after = () => {
      f.f.state.model = { ...f.f.state.model!, updatedAt: '2026-11-18T00:00:00Z' };
    };
    const result = await runCurrentSavedModelGenericObserved16V1(f.session, f.request, lease);
    expect(result.ok).toBe(false);
    expect(result.owner).toBeNull();
    expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
  });
  it('pre-aborted calls preserve the current body and do not enter numeric code', async () => {
    const f = await fixture(),
      controller = new AbortController();
    controller.abort();
    expect(
      (
        await runCurrentSavedModelGenericObserved16V1(
          f.session,
          f.request,
          lease,
          controller.signal,
        )
      ).ok,
    ).toBe(false);
    expect((await f.session.projectCurrentBody()).status).toBe('projected');
    expect(ports.calls).toHaveLength(0);
  });
});
