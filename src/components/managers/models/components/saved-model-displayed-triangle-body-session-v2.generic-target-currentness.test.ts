import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  isCurrentSavedModelGenericObservedTargetV1,
  projectCurrentSavedModelGenericObservedTargetV1,
} from './saved-model-displayed-triangle-body-session-v2';
import { sessionFixture } from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Real producer, body adopter, target projector and session registry; an explicitly synthetic
// three-vertex host observation and in-memory saved-model reader. No viewport, physics or RPC claim.
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
});
async function fixture() {
  const source = await sessionFixture();
  const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(source.state.model),
  );
  cleanup.push(() => {
    session.dispose();
    source.input.dispose();
  });
  await session.observe(source.input);
  expect(session.getSnapshot().status).toBe('observed-body-bound');
  const result = await projectCurrentSavedModelGenericObservedTargetV1(session);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.detail);
  return { source, session, result };
}

describe('fixed generic target local currentness with genuine session results', () => {
  it('keeps multiple genuine same-turn results current without changing their DTO', async () => {
    const { session, result } = await fixture();
    const second = await projectCurrentSavedModelGenericObservedTargetV1(session);
    expect(second).toEqual(result);
    expect(second).not.toBe(result);
    expect(Object.keys(result).sort()).toEqual(['canonicalSha256', 'claims', 'ok', 'target']);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(true);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, second)).toBe(true);
    // The legacy V3 target method retains metadata-only behavior; it is not this fixed result.
    const legacy = await session.projectCurrentPlacementTarget();
    expect(legacy).toEqual(result);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, legacy)).toBe(false);
  });

  it('rejects copied/proxy/forged results and sessions without caller field access', async () => {
    const { session, result } = await fixture();
    const hostile = vi.fn(() => {
      throw new Error('caller getter must not run');
    });
    const fake = Object.defineProperty({}, 'canonicalSha256', { get: hostile });
    const fakeSession = Object.defineProperty({}, 'projectCurrentPlacementTarget', {
      get: hostile,
    });
    for (const candidate of [
      fake,
      { ...result },
      structuredClone(result),
      new Proxy(result, { get: hostile }),
      null,
      true,
    ])
      expect(isCurrentSavedModelGenericObservedTargetV1(session, candidate)).toBe(false);
    for (const candidate of [
      fakeSession,
      { ...session },
      new Proxy(session, { get: hostile }),
      null,
    ])
      expect(isCurrentSavedModelGenericObservedTargetV1(candidate, result)).toBe(false);
    const other = await fixture();
    expect(isCurrentSavedModelGenericObservedTargetV1(other.session, result)).toBe(false);
    expect(hostile).not.toHaveBeenCalled();
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(true);
  });

  it('invalidates old identity on a same-content body replacement and never revives it', async () => {
    const { source, session, result } = await fixture();
    const generation = session.getSnapshot().generation;
    const replacement = await sessionFixture();
    cleanup.push(() => replacement.input.dispose());
    await session.observe(replacement.input);
    const next = await projectCurrentSavedModelGenericObservedTargetV1(session);
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.detail);
    expect(next.canonicalSha256).toBe(result.canonicalSha256);
    expect(session.getSnapshot().generation).toBeGreaterThan(generation);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(false);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, next)).toBe(true);
    expect(source.input.isCurrent()).toBe(true);
    await session.observe(source.input);
    const restored = await projectCurrentSavedModelGenericObservedTargetV1(session);
    expect(restored.ok).toBe(true);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, restored)).toBe(true);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(false);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, next)).toBe(false);
  });

  it.each(['null', 'dispose', 'source-abort'] as const)('fails closed after %s', async (action) => {
    const { source, session, result } = await fixture();
    if (action === 'null') await session.observe(null);
    if (action === 'dispose') session.dispose();
    if (action === 'source-abort') source.abort.abort();
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(false);
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(false);
    if (action !== 'source-abort') expect(source.input.isCurrent()).toBe(true);
  });

  it('native caller abort/malformed signal refuses the check without revoking the body or result', async () => {
    const { source, session, result } = await fixture();
    const controller = new AbortController();
    controller.abort();
    const ownAborted = vi.fn(() => {
      throw new Error('own signal getter must not run');
    });
    Object.defineProperty(controller.signal, 'aborted', { get: ownAborted });
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result, controller.signal)).toBe(
      false,
    );
    const fake = Object.defineProperty({}, 'aborted', { get: ownAborted }) as AbortSignal;
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result, fake)).toBe(false);
    expect(ownAborted).not.toHaveBeenCalled();
    expect(source.input.isCurrent()).toBe(true);
    expect(session.getSnapshot().status).toBe('observed-body-bound');
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(true);
  });

  it.each(['null', 'abort-caller', 'dispose'] as const)(
    'rechecks after a genuine host poll reenters with %s',
    async (action) => {
      const { source, session, result } = await fixture();
      const observed = source.state.observation;
      const controller = new AbortController();
      let armed = true;
      Object.defineProperty(source.state, 'observation', {
        configurable: true,
        get() {
          if (armed) {
            armed = false;
            if (action === 'null') void session.observe(null);
            if (action === 'dispose') session.dispose();
            if (action === 'abort-caller') controller.abort();
          }
          return observed;
        },
      });
      expect(isCurrentSavedModelGenericObservedTargetV1(session, result, controller.signal)).toBe(
        false,
      );
      expect(armed).toBe(false);
      expect(source.input.isCurrent()).toBe(true);
      expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(
        action === 'abort-caller',
      );
    },
  );

  it('prevents recursively polling the same projection from a host reader', async () => {
    const { source, session, result } = await fixture();
    const observed = source.state.observation;
    let nested: boolean | undefined;
    let armed = true;
    Object.defineProperty(source.state, 'observation', {
      configurable: true,
      get() {
        if (armed) {
          armed = false;
          nested = isCurrentSavedModelGenericObservedTargetV1(session, result);
        }
        return observed;
      },
    });
    expect(isCurrentSavedModelGenericObservedTargetV1(session, result)).toBe(true);
    expect(nested).toBe(false);
  });
});
