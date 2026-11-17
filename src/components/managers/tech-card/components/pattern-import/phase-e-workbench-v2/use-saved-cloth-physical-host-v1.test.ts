import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { SavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import type { PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from '../phase-e-workbench/assembly-order-entry';
import {
  useSavedClothPhysicalHostV1,
  type UseSavedClothPhysicalHostInputV1,
} from './use-saved-cloth-physical-host-v1';

type Cleanup = () => void;
type Effect = {
  kind: 'effect';
  deps: readonly unknown[];
  create: () => void | Cleanup;
  cleanup?: Cleanup;
  pending: boolean;
};
type Value = { kind: 'value'; value: unknown; deps?: readonly unknown[] };
type Slot = Effect | Value;
const mocked = vi.hoisted(() => ({
  harness: null as Harness | null,
  queryClient: {} as object,
  bodies: [] as {
    onDisplayedBodyInputV1: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[],
  observed: [] as { downstream: object; dispose: ReturnType<typeof vi.fn> }[],
  onObservedCreate: null as null | (() => void),
  createBody: vi.fn(),
  createObserved: vi.fn(),
}));
vi.mock('react', () => ({
  useState: <T>(initial: T) => mocked.harness!.state(initial),
  useRef: <T>(initial: T) => mocked.harness!.memo(() => ({ current: initial }), []),
  useMemo: <T>(build: () => T, deps: readonly unknown[]) => mocked.harness!.memo(build, deps),
  useCallback: <T>(callback: T, deps: readonly unknown[]) =>
    mocked.harness!.memo(() => callback, deps),
  useEffect: (create: () => void | Cleanup, deps: readonly unknown[]) =>
    mocked.harness!.effect(create, deps),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocked.queryClient }));
vi.mock(
  'components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2',
  () => ({
    createSavedModelDisplayedTriangleBodyQuerySessionV2: mocked.createBody,
  }),
);
vi.mock('components/cloth-simulation-spike/saved-observed-physical-host-v1', () => ({
  createSavedObservedPhysicalHostV1: mocked.createObserved,
}));

// Deterministic hook/effect scheduling only. This suite deliberately uses synthetic lifecycle
// ports, not a DOM renderer, genuine body authority, physical readiness, or browser StrictMode.
class Harness {
  slots: Slot[] = [];
  cursor = 0;
  dirty = false;
  output!: ReturnType<typeof useSavedClothPhysicalHostV1>;
  constructor(public input: UseSavedClothPhysicalHostInputV1) {}
  state<T>(initial: T): [T, (value: T) => void] {
    const i = this.cursor++;
    this.slots[i] ??= { kind: 'value', value: initial };
    const slot = this.slots[i];
    if (slot.kind !== 'value') throw new Error('State slot drift.');
    return [
      slot.value as T,
      (value) => {
        if (!Object.is(slot.value, value)) {
          slot.value = value;
          this.dirty = true;
        }
      },
    ];
  }
  memo<T>(build: () => T, deps: readonly unknown[]): T {
    const i = this.cursor++;
    const old = this.slots[i];
    if (!old || old.kind !== 'value' || !same(old.deps, deps))
      this.slots[i] = { kind: 'value', value: build(), deps };
    return (this.slots[i] as Value).value as T;
  }
  effect(create: Effect['create'], deps: readonly unknown[]) {
    const i = this.cursor++;
    const old = this.slots[i];
    if (!old) this.slots[i] = { kind: 'effect', create, deps, pending: true };
    else if (old.kind !== 'effect') throw new Error('Effect slot drift.');
    else if (!same(old.deps, deps)) {
      old.create = create;
      old.deps = deps;
      old.pending = true;
    }
  }
  render(input = this.input) {
    this.input = input;
    this.cursor = 0;
    this.dirty = false;
    mocked.harness = this;
    try {
      this.output = useSavedClothPhysicalHostV1(input);
    } finally {
      mocked.harness = null;
    }
    return this.output;
  }
  flush() {
    for (let n = 0; n < 32; n++) {
      if (this.dirty) this.render();
      const effects = this.slots.filter((s): s is Effect => s.kind === 'effect' && s.pending);
      if (!effects.length && !this.dirty) return this.output;
      for (const e of effects) {
        e.pending = false;
        e.cleanup?.();
        e.cleanup = e.create() || undefined;
      }
    }
    throw new Error('Effect loop.');
  }
  replayEffects() {
    const effects = this.slots.filter((s): s is Effect => s.kind === 'effect');
    for (const e of effects) {
      e.cleanup?.();
      e.cleanup = undefined;
    }
    for (const e of effects) e.cleanup = e.create() || undefined;
    return this.flush();
  }
  unmount() {
    for (const s of this.slots)
      if (s.kind === 'effect') {
        s.cleanup?.();
        s.cleanup = undefined;
      }
  }
}
function same(a: readonly unknown[] | undefined, b: readonly unknown[]) {
  return !!a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
const row: DxfProductSavedRowIdentityV1 = {
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-a',
  revision: 7,
  cardLockVersion: 8,
  url: 'https://example.invalid/exact.dxf',
  sizeBytes: 321,
  sha256: 'a'.repeat(64),
};
function setup(savedRow: DxfProductSavedRowIdentityV1 | null = row) {
  const canonical: { downstream: object; dispose: ReturnType<typeof vi.fn> }[] = [];
  const factory = vi.fn(() => {
    const owner = { downstream: {}, dispose: vi.fn() };
    canonical.push(owner);
    return owner as unknown as PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
  });
  const harness = new Harness({
    row: savedRow,
    selectedOperationNumber: 2,
    createCanonicalOwner: factory,
  });
  harness.render();
  return { harness, canonical, factory };
}
async function settle(harness: Harness) {
  await vi.dynamicImportSettled();
  harness.flush();
}
beforeEach(() => {
  mocked.queryClient = {};
  mocked.bodies = [];
  mocked.observed = [];
  mocked.onObservedCreate = null;
  mocked.createBody.mockReset();
  mocked.createObserved.mockReset();
  mocked.createBody.mockImplementation(() => {
    const body = { onDisplayedBodyInputV1: vi.fn(), dispose: vi.fn() };
    mocked.bodies.push(body);
    return body;
  });
  mocked.createObserved.mockImplementation(() => {
    const owner = { downstream: {}, dispose: vi.fn() };
    mocked.observed.push(owner);
    mocked.onObservedCreate?.();
    return owner;
  });
});

describe('explicit saved physical host lifecycle (simulated effects, synthetic owners)', () => {
  it('reports a canonical factory failure and hides the old error immediately when the exact source changes', () => {
    const { harness, factory } = setup();
    harness.flush();
    expect(harness.output.sourceStatus).toBe('idle');
    factory.mockImplementationOnce(() => {
      throw new Error('synthetic canonical loader failure');
    });
    harness.output.setProfile('canonical-reference');
    harness.flush();
    expect(harness.output.selected).toBeNull();
    expect(harness.output.sourceStatus).toBe('blocked');
    expect(harness.output.sourceError).toBe('The selected cloth source could not be loaded.');
    harness.render({ ...harness.input, row: { ...row, revision: 9 } });
    expect(harness.output.sourceStatus).toBe('loading');
    expect(harness.output.sourceError).toBeNull();
    harness.flush();
    expect(harness.output.sourceStatus).toBe('ready');
    expect(harness.output.sourceError).toBeNull();
    harness.unmount();
  });
  it('reports asynchronous observed factory failure without a permanent loading state or stale profile error', async () => {
    const { harness } = setup();
    harness.flush();
    mocked.createObserved.mockImplementationOnce(() => {
      throw new Error('synthetic observed loader failure');
    });
    harness.output.setProfile('observed-saved-model');
    harness.flush();
    expect(harness.output.sourceStatus).toBe('loading');
    await settle(harness);
    expect(harness.output.selected).toBeNull();
    expect(harness.output.sourceStatus).toBe('blocked');
    expect(harness.output.sourceError).not.toBeNull();
    harness.output.setProfile('');
    harness.render();
    expect(harness.output.sourceStatus).toBe('idle');
    expect(harness.output.sourceError).toBeNull();
    harness.flush();
    harness.unmount();
  });

  it('observes before a saved row exists, caches the latest early input, and never chooses a profile implicitly', () => {
    const { harness, factory } = setup(null);
    const callback = harness.output.onDisplayedBodyInputV1;
    const first = {} as ModelDisplayedTriangleBodyOwnedInputV1,
      latest = {} as ModelDisplayedTriangleBodyOwnedInputV1;
    callback(first);
    callback(latest);
    harness.flush();
    expect(mocked.bodies).toHaveLength(1);
    expect(mocked.bodies[0].onDisplayedBodyInputV1).toHaveBeenLastCalledWith(latest);
    expect(harness.output.profile).toBe('');
    expect(harness.output.selected).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(mocked.createObserved).not.toHaveBeenCalled();
    harness.render({ ...harness.input, row });
    harness.flush();
    expect(harness.output.onDisplayedBodyInputV1).toBe(callback);
    expect(mocked.bodies).toHaveLength(1);
    callback(null);
    expect(mocked.bodies[0].onDisplayedBodyInputV1).toHaveBeenLastCalledWith(null);
    harness.unmount();
  });
  it('keeps a live owner across equivalent row objects and rerenders, then releases it on explicit profile clearing', () => {
    const { harness, canonical } = setup();
    harness.flush();
    harness.output.setProfile('canonical-reference');
    harness.flush();
    const owner = harness.output.selected?.owner;
    expect(owner).toBe(canonical[0]);
    harness.render({ ...harness.input, row: { ...row } });
    harness.flush();
    expect(harness.output.selected?.owner).toBe(owner);
    expect(canonical).toHaveLength(1);
    harness.output.setProfile('');
    harness.render();
    expect(harness.output.selected).toBeNull();
    harness.flush();
    expect(canonical[0].dispose).toHaveBeenCalledTimes(1);
    harness.unmount();
  });
  it.each([
    ['techCardId', 157],
    ['scopeKey', 'other'],
    ['patternLineKey', 'pattern-b'],
    ['revision', 8],
    ['cardLockVersion', 9],
    ['url', 'https://example.invalid/new.dxf'],
    ['sizeBytes', 322],
    ['sha256', 'b'.repeat(64)],
  ] as const)('replaces the one-shot owner when exact row field %s changes', (key, value) => {
    const { harness, canonical } = setup();
    harness.flush();
    harness.output.setProfile('canonical-reference');
    harness.flush();
    harness.render({ ...harness.input, row: { ...row, [key]: value } });
    expect(harness.output.selected).toBeNull();
    harness.flush();
    expect(canonical).toHaveLength(2);
    expect(canonical[0].dispose).toHaveBeenCalledTimes(1);
    expect(harness.output.selected?.owner).toBe(canonical[1]);
    harness.unmount();
  });
  it('replaces on operation changes and removes selection on row loss while keeping the body consumer', () => {
    const { harness, canonical } = setup();
    harness.flush();
    const body = harness.output.bodySession;
    harness.output.setProfile('canonical-reference');
    harness.flush();
    harness.render({ ...harness.input, selectedOperationNumber: 3 });
    expect(harness.output.selected).toBeNull();
    harness.flush();
    expect(canonical).toHaveLength(2);
    harness.render({ ...harness.input, row: null });
    expect(harness.output.selected).toBeNull();
    harness.flush();
    expect(canonical[1].dispose).toHaveBeenCalledTimes(1);
    expect(harness.output.bodySession).toBe(body);
    harness.unmount();
  });
  it('loads only the explicitly selected observed factory and passes an exact detached frozen row plus the same body session', async () => {
    const original = { ...row };
    const { harness, factory } = setup(original);
    harness.flush();
    const body = harness.output.bodySession;
    harness.output.setProfile('observed-saved-model');
    harness.flush();
    original.url = 'https://example.invalid/mutated.dxf';
    await settle(harness);
    expect(factory).not.toHaveBeenCalled();
    const input = mocked.createObserved.mock.calls[0][0];
    expect(input.row).toEqual(row);
    expect(input.row).not.toBe(original);
    expect(Object.isFrozen(input.row)).toBe(true);
    expect(Object.keys(input.row)).toHaveLength(8);
    expect(input.bodySession).toBe(body);
    // Publication rerenders against the now-mutated prop: the old row's child stays hidden,
    // and its replacement is created from the new exact row only.
    expect(harness.output.selected).toBeNull();
    expect(mocked.observed[0].dispose).toHaveBeenCalledTimes(1);
    await settle(harness);
    expect(harness.output.selected?.profile).toBe('observed-saved-model');
    expect(mocked.createObserved.mock.calls[1][0].row.url).toBe(original.url);
    harness.unmount();
    expect(mocked.observed[1].dispose).toHaveBeenCalledTimes(1);
  });
  it('cancels an unresolved observed import on source change without invoking the obsolete factory', async () => {
    const { harness, canonical } = setup();
    harness.flush();
    harness.output.setProfile('observed-saved-model');
    harness.flush();
    harness.output.setProfile('canonical-reference');
    harness.flush();
    await settle(harness);
    expect(mocked.createObserved).not.toHaveBeenCalled();
    expect(harness.output.selected?.owner).toBe(canonical[0]);
    harness.unmount();
  });
  it('disposes a late-created observed child if cleanup reenters during factory construction', async () => {
    const { harness } = setup();
    harness.flush();
    mocked.onObservedCreate = () => harness.unmount();
    harness.output.setProfile('observed-saved-model');
    harness.flush();
    await settle(harness);
    expect(mocked.observed).toHaveLength(1);
    expect(mocked.observed[0].dispose).toHaveBeenCalledTimes(1);
    expect(harness.output.selected).toBeNull();
  });
  it('recreates effect-owned consumers and source owners after a StrictMode-style cleanup/setup replay', () => {
    const { harness, canonical } = setup();
    harness.flush();
    const callback = harness.output.onDisplayedBodyInputV1;
    const input = {} as ModelDisplayedTriangleBodyOwnedInputV1;
    callback(input);
    harness.output.setProfile('canonical-reference');
    harness.flush();
    const firstOwner = canonical[0];
    harness.replayEffects();
    expect(mocked.bodies).toHaveLength(2);
    expect(mocked.bodies[0].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.bodies[1].onDisplayedBodyInputV1).toHaveBeenLastCalledWith(input);
    expect(firstOwner.dispose).toHaveBeenCalledTimes(1);
    expect(harness.output.selected?.owner).not.toBe(firstOwner);
    expect(harness.output.bodySession).toBe(
      mocked.bodies[1] as unknown as SavedModelDisplayedTriangleBodySessionV2,
    );
    expect(harness.output.onDisplayedBodyInputV1).toBe(callback);
    harness.unmount();
  });
  it('does not dispose borrowed input, ignores late callbacks after unmount, and does not allocate from a late import', async () => {
    const { harness } = setup();
    harness.flush();
    const dispose = vi.fn();
    const input = { dispose } as unknown as ModelDisplayedTriangleBodyOwnedInputV1;
    const callback = harness.output.onDisplayedBodyInputV1;
    callback(input);
    harness.output.setProfile('observed-saved-model');
    harness.flush();
    harness.unmount();
    const count = mocked.bodies[0].onDisplayedBodyInputV1.mock.calls.length;
    callback(null);
    await settle(harness);
    expect(dispose).not.toHaveBeenCalled();
    expect(mocked.createObserved).not.toHaveBeenCalled();
    expect(mocked.bodies[0].onDisplayedBodyInputV1).toHaveBeenCalledTimes(count);
  });
  it('rebinds to a replacement QueryClient and disposes prior selected ownership', () => {
    const { harness, canonical } = setup();
    harness.flush();
    harness.output.setProfile('canonical-reference');
    harness.flush();
    mocked.queryClient = {};
    harness.render();
    expect(harness.output.bodySession).toBeNull();
    expect(harness.output.selected).toBeNull();
    harness.flush();
    expect(mocked.bodies).toHaveLength(2);
    expect(mocked.bodies[0].dispose).toHaveBeenCalledTimes(1);
    expect(canonical[0].dispose).toHaveBeenCalledTimes(1);
    expect(harness.output.bodySession).toBe(mocked.bodies[1]);
    harness.unmount();
  });
});
