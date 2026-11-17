import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSavedModelDisplayedTriangleBodySessionV2 } from './saved-model-displayed-triangle-body-session-v2';
import { sessionFixture } from './saved-model-displayed-triangle-body-session-v2.test-fixture';

// Synthetic child lifecycle only. Genuine body input/adoption remains real; no collision/physics
// result from this module is acceptance evidence.
const children = vi.hoisted(() => new Map<object, AbortController>());
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-canonical-medium-saved-writer-frame-placement-v2',
  () => ({
    buildBetaSkirtCanonicalMediumSavedWriterFrameDisplayedBodyHandoffV2: async (
      _savedOwner: unknown,
      _input: unknown,
      signal: AbortSignal,
    ) => {
      void _savedOwner;
      void _input;
      const owner = Object.freeze({ version: 'synthetic-pair-lifetime-only' });
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      controller.signal.addEventListener(
        'abort',
        () => signal.removeEventListener('abort', abort),
        { once: true },
      );
      if (signal.aborted) controller.abort();
      children.set(owner, controller);
      return { ok: true, owner, report: { runtimeAuthority: false } };
    },
  }),
);
vi.mock(
  'components/cloth-simulation-spike/beta-skirt-personalized-displayed-body-product-placement-v2',
  () => ({
    BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2: 'synthetic-pair-lifetime-only',
    getBetaSkirtPersonalizedDisplayedBodyProductPlacementLifetimeV2: (owner: object) =>
      children.get(owner)?.signal ?? null,
    disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2: (owner: object) => {
      const controller = children.get(owner);
      if (!controller || controller.signal.aborted) return false;
      controller.abort();
      return true;
    },
  }),
);

afterEach(() => {
  for (const child of children.values()) child.abort();
  children.clear();
  vi.restoreAllMocks();
});

describe('consumer retained caller cancellation (synthetic pair lifecycle only)', () => {
  it('preserves caller abort after the child was returned', async () => {
    const f = await sessionFixture();
    const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
      structuredClone(f.state.model),
    );
    await session.observe(f.input);
    const caller = new AbortController();
    const result = await session.buildCurrentSavedPlacementPair({}, caller.signal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = children.get(result.owner)!;
    expect(child.signal.aborted).toBe(false);
    caller.abort();
    expect(child.signal.aborted).toBe(true);
    expect(f.input.isCurrent()).toBe(true);
    session.dispose();
  });

  it('removes the caller bridge when the returned child is disposed', async () => {
    const f = await sessionFixture();
    const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
      structuredClone(f.state.model),
    );
    await session.observe(f.input);
    const caller = new AbortController();
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const result = await session.buildCurrentSavedPlacementPair({}, caller.signal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bridges = added.mock.calls.flatMap((args, index) =>
      added.mock.contexts[index] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(bridges).toHaveLength(1);
    children.get(result.owner)!.abort();
    const released = removed.mock.calls.flatMap((args, index) =>
      removed.mock.contexts[index] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
    );
    expect(released).toEqual(bridges);
    caller.abort();
    session.dispose();
  });
});
