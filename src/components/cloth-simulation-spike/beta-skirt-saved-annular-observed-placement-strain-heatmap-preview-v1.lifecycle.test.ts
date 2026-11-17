import type { MockInstance } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// Synthetic lifecycle ports only: fixed owner projectors and WebGLRenderer are mocked.
// Three CPU geometry + the existing pure heatmap builder are real. No browser, GPU,
// solver, genuine source admission or physically CLEAR frame is asserted by this suite.
const ports = vi.hoisted(() => ({
  source: Object.freeze({ syntheticLifecycleSource: true }),
  frame: Object.freeze({ syntheticLifecycleFrame: true }),
  sourceController: new AbortController(),
  frameController: new AbortController(),
  disposeSource: vi.fn(),
  disposeFrame: vi.fn(),
  throwRendererDispose: false,
  throwRendererClear: false,
  renderers: [] as { clearCalls: number; disposeCalls: number; renderCalls: number }[],
  onRender: null as (() => void) | null,
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-runtime-source-v1', () => ({
  getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1: (owner: unknown) =>
    owner === ports.source && !ports.sourceController.signal.aborted
      ? ports.sourceController.signal
      : null,
  projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1: async () => ({
    report: { reportSha256: 'a'.repeat(64) },
    normalizedV5: { seal: { aggregateSha256: 'b'.repeat(64) } },
    normalizedTriangles: new Uint32Array([0, 1, 2]),
    collisionInput: {
      bodyPositionsM: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      bodyTriangles: new Uint32Array([0, 1, 2]),
    },
  }),
  disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1: ports.disposeSource,
}));
vi.mock('./beta-skirt-saved-annular-observed-placement-32-frame-contact-v1', () => ({
  getBetaSkirtSavedAnnularObservedPlacement32FrameContactLifetimeV1: (owner: unknown) =>
    owner === ports.frame && !ports.frameController.signal.aborted
      ? ports.frameController.signal
      : null,
  projectBetaSkirtSavedAnnularObservedPlacement32FrameContactV1: async () => ({
    report: {
      status: 'diagnostic-completed',
      reportSha256: 'c'.repeat(64),
      bindings: {
        runtimeSourceReportSha256: 'a'.repeat(64),
        normalizedV5AggregateSha256: 'b'.repeat(64),
      },
    },
    normalizedTriangles: new Uint32Array([0, 1, 2]),
    finalPositions3M: new Float32Array([0, 0, 0.02, 1, 0, 0.02, 0, 1, 0.02]),
    strainValues: new Float32Array([0, 0, 0, 0.5]),
    strainFlags: new Uint32Array([0]),
    strainUnits: 'dimensionless',
  }),
  disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1: ports.disposeFrame,
}));
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  class SyntheticRenderer {
    clearCalls = 0;
    disposeCalls = 0;
    renderCalls = 0;
    constructor() {
      ports.renderers.push(this);
    }
    setPixelRatio() {}
    setSize() {}
    render() {
      this.renderCalls += 1;
      ports.onRender?.();
    }
    clear() {
      this.clearCalls += 1;
      if (ports.throwRendererClear) throw new Error('Synthetic clear failure.');
    }
    dispose() {
      this.disposeCalls += 1;
      if (ports.throwRendererDispose) throw new Error('Synthetic renderer disposal failure.');
    }
  }
  return { ...actual, WebGLRenderer: SyntheticRenderer };
});

class SyntheticCanvas extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly clientWidth = 640;
  readonly clientHeight = 720;
  width = 640;
  height = 720;
  readonly getContext = vi.fn(() => {
    throw new Error('A lifecycle test must never request GPU context.');
  });
}
let create: typeof import('./beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1').createSavedObservedStrainHeatmapPreviewV1;
let add: MockInstance<EventTarget['addEventListener']>;
let remove: MockInstance<EventTarget['removeEventListener']>;
let geometryDispose: MockInstance<THREE.BufferGeometry['dispose']>;
let materialDispose: MockInstance<THREE.Material['dispose']>;
const active: { dispose(): void }[] = [];
beforeAll(async () => {
  // Instrument before the preview captures native methods, without changing their behavior.
  add = vi.spyOn(EventTarget.prototype, 'addEventListener');
  remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
  geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
  ({ createSavedObservedStrainHeatmapPreviewV1: create } =
    await import('./beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1'));
});
beforeEach(() => {
  ports.sourceController = new AbortController();
  ports.frameController = new AbortController();
  ports.renderers = [];
  ports.throwRendererDispose = false;
  ports.throwRendererClear = false;
  ports.onRender = null;
  vi.stubGlobal('HTMLCanvasElement', SyntheticCanvas);
  vi.clearAllMocks();
});
afterEach(() => {
  active.splice(0).forEach((view) => view.dispose());
  vi.unstubAllGlobals();
});
afterAll(() => {
  add.mockRestore();
  remove.mockRestore();
  geometryDispose.mockRestore();
  materialDispose.mockRestore();
});

async function open(signal?: AbortSignal) {
  const canvas = new SyntheticCanvas();
  const view = await create(
    canvas as unknown as HTMLCanvasElement,
    ports.source,
    ports.frame,
    signal,
  );
  active.push(view);
  expect(canvas.getContext).not.toHaveBeenCalled();
  return { canvas, view, renderer: ports.renderers[0]! };
}
function expectListenersRemoved() {
  for (const [index, args] of add.mock.calls.entries()) {
    const target = add.mock.contexts[index];
    expect(
      remove.mock.calls.some(
        (removed, i) =>
          remove.mock.contexts[i] === target && removed[0] === args[0] && removed[1] === args[1],
      ),
    ).toBe(true);
  }
}
function expectBorrowedParentsAlive() {
  expect(ports.sourceController.signal.aborted).toBe(false);
  expect(ports.frameController.signal.aborted).toBe(false);
  expect(ports.disposeSource).not.toHaveBeenCalled();
  expect(ports.disposeFrame).not.toHaveBeenCalled();
}

describe('synthetic observed heatmap renderer lifecycle, no GPU/physics acceptance', () => {
  it('revokes its lifetime and removes the visible marker on independent context loss', async () => {
    const { canvas, view, renderer } = await open();
    expect(view.lifetime.aborted).toBe(false);
    expect(canvas.dataset.observedStrainFrameSha256).toBe('c'.repeat(64));
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(view.lifetime.aborted).toBe(true);
    expect(canvas.dataset.observedStrainFrameSha256).toBeUndefined();
    expect(renderer.clearCalls).toBe(1);
    expect(renderer.disposeCalls).toBe(1);
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(2);
    expectListenersRemoved();
    expectBorrowedParentsAlive();
  });

  it('disposes repeatedly without retaining a context-loss or parent-abort listener', async () => {
    const { canvas, view, renderer } = await open();
    view.dispose();
    view.dispose();
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(false);
    expect(view.lifetime.aborted).toBe(true);
    expect(renderer.disposeCalls).toBe(1);
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(2);
    expectListenersRemoved();
    expectBorrowedParentsAlive();
  });

  it('continues resource and listener cleanup when renderer clear and dispose throw', async () => {
    const caller = new AbortController();
    const { canvas, view, renderer } = await open(caller.signal);
    ports.throwRendererDispose = true;
    ports.throwRendererClear = true;
    expect(() => view.dispose()).not.toThrow();
    expect(view.lifetime.aborted).toBe(true);
    expect(renderer.clearCalls).toBe(1);
    expect(renderer.disposeCalls).toBe(1);
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(2);
    expect(canvas.dataset.observedStrainFrameSha256).toBeUndefined();
    expect(caller.signal.aborted).toBe(false);
    expectListenersRemoved();
    expectBorrowedParentsAlive();
  });

  it('ends only its child lifetime when the caller aborts after publication', async () => {
    const caller = new AbortController();
    const { view, renderer } = await open(caller.signal);
    caller.abort();
    expect(view.lifetime.aborted).toBe(true);
    expect(renderer.disposeCalls).toBe(1);
    expectListenersRemoved();
    expectBorrowedParentsAlive();
  });

  it.each(['source', 'frame'] as const)(
    'releases its own resources when the borrowed %s lifetime ends',
    async (parent) => {
      const { view, renderer } = await open();
      const controller = parent === 'source' ? ports.sourceController : ports.frameController;
      controller.abort();
      expect(view.lifetime.aborted).toBe(true);
      expect(renderer.disposeCalls).toBe(1);
      expect(ports.disposeSource).not.toHaveBeenCalled();
      expect(ports.disposeFrame).not.toHaveBeenCalled();
      expect(
        (parent === 'source' ? ports.frameController : ports.sourceController).signal.aborted,
      ).toBe(false);
      expectListenersRemoved();
    },
  );

  it('cleans a render that is cancelled synchronously before returning the view', async () => {
    const caller = new AbortController();
    ports.onRender = () => caller.abort();
    const canvas = new SyntheticCanvas();
    await expect(
      create(canvas as unknown as HTMLCanvasElement, ports.source, ports.frame, caller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.renderers[0]!.disposeCalls).toBe(1);
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(2);
    expect(canvas.dataset.observedStrainFrameSha256).toBeUndefined();
    expectListenersRemoved();
    expectBorrowedParentsAlive();
    expect(canvas.getContext).not.toHaveBeenCalled();
  });
});
