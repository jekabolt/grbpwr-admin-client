import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

// Synthetic display/lifecycle ports only. No GPU kernels, genuine body or product admission is
// claimed here. The separate encoder suite exercises the real private projection registry.
const ports = vi.hoisted(() => ({
  owner: Object.freeze({ syntheticDisplayFixture: true }),
  controller: new AbortController(),
  onRender: null as (() => void) | null,
  currentCamera: null as THREE.Camera | null,
  onLifetimeRead: null as (() => void) | null,
  renderers: [] as { renders: number; clears: number; disposals: number }[],
  throwDispose: false,
  clothZ: 0,
  onePanel: false,
  outline: null as number[] | null,
  outlineColor: null as string | null,
  garmentColors: null as number[] | null,
  projectionReads: 0,
  frustumViolations: 0,
}));
const positions = (z = 0) => new Float32Array([0, 0, z, 1, 0, z, 0, 1, z, 1, 1, z]);
const splitInput = () => ({
  finalPositions3M: new Float32Array([
    ...positions(ports.clothZ).slice(0, 9),
    1,
    0,
    ports.clothZ,
    1,
    1,
    ports.clothZ,
    0,
    1,
    ports.clothZ,
  ]),
  garmentTriangles: new Uint32Array([0, 1, 2, 3, 4, 5]),
  pieceRanges: [
    {
      pieceId: 'first-panel',
      vertexOffset: 0,
      vertexCount: 3,
      triangleOffset: 0,
      triangleCount: 1,
    },
    {
      pieceId: 'second-panel',
      vertexOffset: 3,
      vertexCount: 3,
      triangleOffset: 1,
      triangleCount: 1,
    },
  ],
  strain: {
    // GPU order [render1, render0], deliberately not the render ordinal order.
    values: new Float32Array([0, 0, 0, 2.5, 0, 0, 0, 0.25]),
    flags: new Uint32Array([0, 0]),
    renderTriangleIndices: new Uint32Array([1, 0]),
  },
});
const input = () => {
  const split = splitInput();
  return ports.onePanel
    ? {
        ...split,
        finalPositions3M: positions(ports.clothZ),
        garmentTriangles: new Uint32Array([0, 1, 2, 1, 3, 2]),
        pieceRanges: [{ ...split.pieceRanges[0]!, vertexCount: 4, triangleCount: 2 }],
      }
    : split;
};
vi.mock('./dxf-garment-observed-webgpu-replay-v1', () => ({
  getDxfGarmentObservedWebgpuReplayLifetimeV1: (owner: unknown) => {
    ports.onLifetimeRead?.();
    return owner === ports.owner && !ports.controller.signal.aborted
      ? ports.controller.signal
      : null;
  },
  projectDxfGarmentObservedWebgpuRenderV1: async () => {
    ports.projectionReads++;
    return {
      ...input(),
      seamEdges: [
        {
          runtimeSeamId: 'runtime-seam',
          sideIndex: 0,
          pieceId: 'first-panel',
          triangleIndex: 0,
          vertexIndices: [0, 1],
        },
        {
          runtimeSeamId: 'runtime-seam',
          sideIndex: 1,
          pieceId: 'second-panel',
          triangleIndex: 1,
          vertexIndices: [4, 5],
        },
      ],
      unsewnEdges: [
        {
          pieceId: 'first-panel',
          contourId: 'front-sewing',
          boundaryVertexIds: ['native-a', 'native-d'],
          vertexIndices: [0, 2],
        },
      ],
      frameCount: 32,
      report: {
        status: 'diagnostic-completed',
        reportSha256: 'a'.repeat(64),
        sourceBindingSha256: 'b'.repeat(64),
        finalStateSha256: 'c'.repeat(64),
        finalValidation: { ok: true },
        checkpoint16Matched: true,
        bodyBinding: {
          persistedModel: Object.freeze({
            id: 5,
            updatedAt: '2026-11-01T12:00:00Z',
            revision: 'r1',
          }),
          observedBodyContentSha256: 'e'.repeat(64),
        },
      },
      bodyPositionsM: positions(),
      bodyTriangles: new Uint32Array([0, 1, 2, 1, 3, 2]),
      strain: {
        ...input().strain,
        passed: true,
        units: 'dimensionless',
        stressPaComputed: false,
        renderMappingSha256: 'd'.repeat(64),
      },
    };
  },
}));
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  class SyntheticRenderer {
    renders = 0;
    clears = 0;
    disposals = 0;
    constructor() {
      ports.renderers.push(this);
    }
    setPixelRatio() {}
    setSize() {}
    render(scene: THREE.Scene, camera: THREE.Camera) {
      this.renders++;
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      ports.currentCamera = camera;
      ports.outline = null;
      ports.outlineColor = null;
      scene.traverse((node) => {
        if (!(node instanceof actual.Mesh)) return;
        if (node.name === 'generic-observed-selected-piece-outline') {
          const segmentStart = node.geometry.getAttribute('instanceStart');
          if (!(segmentStart instanceof actual.InterleavedBufferAttribute))
            throw new Error('Outline did not retain exact start/end segment coordinates.');
          ports.outline = Array.from(segmentStart.data.array);
          ports.outlineColor = (node.material as LineMaterial).color.getHexString();
          return;
        }
        if (node.name.endsWith('-strain-utilization'))
          ports.garmentColors = Array.from(node.geometry.getAttribute('color').array);
        const attribute = node.geometry.getAttribute('position');
        for (let index = 0; index < attribute.count; index++) {
          const v = new actual.Vector3()
            .fromBufferAttribute(attribute, index)
            .applyMatrix4(node.matrixWorld)
            .project(camera);
          if ([v.x, v.y, v.z].some((value) => !Number.isFinite(value) || Math.abs(value) > 1))
            ports.frustumViolations++;
        }
      });
      ports.onRender?.();
    }
    clear() {
      this.clears++;
    }
    dispose() {
      this.disposals++;
      if (ports.throwDispose) throw new Error('Synthetic renderer disposal failure.');
    }
  }
  return { ...actual, WebGLRenderer: SyntheticRenderer };
});
import {
  buildDxfGarmentObservedStrainHeatmapGeometryV1 as build,
  createDxfGarmentObservedStrainHeatmapPreviewV1 as create,
  projectDxfGarmentObservedStrainHeatmapV1 as project,
} from './dxf-garment-observed-strain-heatmap-preview-v1';
import { betaSkirtStrainUtilizationColorV1 } from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';

class SyntheticCanvas extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly clientWidth = 640;
  readonly clientHeight = 720;
  width = 640;
  height = 720;
  getBoundingClientRect() {
    return { left: 25, top: 50, width: 1280, height: 720 };
  }
  readonly getContext = vi.fn(() => {
    throw new Error('No actual GPU in a lifecycle test.');
  });
}
const active: { dispose(): void }[] = [];
beforeEach(() => {
  ports.controller = new AbortController();
  ports.onRender = null;
  ports.currentCamera = null;
  ports.onLifetimeRead = null;
  ports.renderers = [];
  ports.throwDispose = false;
  ports.clothZ = 0;
  ports.onePanel = false;
  ports.outline = null;
  ports.outlineColor = null;
  ports.garmentColors = null;
  ports.projectionReads = 0;
  ports.frustumViolations = 0;
  vi.stubGlobal('HTMLCanvasElement', SyntheticCanvas);
});
afterEach(() => {
  active.splice(0).forEach((view) => view.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function open(signal?: AbortSignal) {
  const canvas = new SyntheticCanvas();
  const view = await create(canvas as unknown as HTMLCanvasElement, ports.owner, signal);
  active.push(view);
  return { canvas, view };
}

describe('generic continuum-to-render strain mapping (pure content only)', () => {
  it('maps colored GPU order to exact render faces while retaining unclamped statistics', () => {
    const source = input();
    const before = source.strain.values.slice();
    const result = build(source);
    expect(result.positions).toHaveLength(18);
    expect(Array.from(result.colors.slice(0, 3))).toEqual(
      Array.from(new Float32Array(betaSkirtStrainUtilizationColorV1(0.25))),
    );
    expect(Array.from(result.colors.slice(9, 12))).toEqual(
      Array.from(new Float32Array(betaSkirtStrainUtilizationColorV1(2.5))),
    );
    expect(result.minimumUtilization).toBe(0.25);
    expect(result.maximumUtilization).toBe(2.5);
    expect(result.triangleCountAtOrAboveDisplayClamp).toBe(1);
    expect(source.strain.values).toEqual(before);
    result.positions.fill(99);
    expect(source.finalPositions3M[0]).toBe(0);
  });
  it.each([[0, 0], [1, 1], [2, 0], [0]])('refuses invalid mapping %j', (...mapping) => {
    const source = input();
    source.strain.renderTriangleIndices = new Uint32Array(mapping);
    expect(() => build(source)).toThrow();
  });
  it('refuses invalid strain flags, NaNs and out-of-range topology', () => {
    const flagged = input();
    flagged.strain.flags[0] = 1;
    expect(() => build(flagged)).toThrow(/validity/);
    const nonfinite = input();
    nonfinite.strain.values[0] = NaN;
    expect(() => build(nonfinite)).toThrow(/finite/);
    const topology = input();
    topology.garmentTriangles[0] = 99;
    expect(() => build(topology)).toThrow(/range/);
  });
});

describe('synthetic renderer lifecycle (not visual or physical acceptance)', () => {
  function clientPoint(canvas: SyntheticCanvas, x: number, y: number, z: number) {
    if (!ports.currentCamera) throw new Error('No camera rendered.');
    const projected = new THREE.Vector3(x, y, z).project(ports.currentCamera);
    const { left, top, width, height } = canvas.getBoundingClientRect();
    const contentLeft = left + (width - canvas.width) / 2;
    return [
      contentLeft + ((projected.x + 1) * canvas.width) / 2,
      top + ((1 - projected.y) * height) / 2,
    ] as const;
  }

  it('outlines the selected deformed boundary with the same camera and untouched strain colors', async () => {
    ports.clothZ = 0.25;
    ports.onePanel = true;
    const { view } = await open();
    const color = ports.garmentColors;
    const camera = ports.currentCamera;
    const material = vi.spyOn(LineMaterial.prototype, 'dispose');
    const geometry = vi.spyOn(LineSegmentsGeometry.prototype, 'dispose');
    expect(view.setSelectedPiece('first-panel')).toBe(true);
    // Four outside edges of two exact deformed triangles. The shared diagonal is absent.
    expect(ports.outline).toEqual([
      0, 0, 0.25, 1, 0, 0.25, 0, 0, 0.25, 0, 1, 0.25, 1, 0, 0.25, 1, 1, 0.25, 0, 1, 0.25, 1, 1,
      0.25,
    ]);
    expect(ports.garmentColors).toEqual(color);
    expect(ports.currentCamera).toBe(camera);
    expect(view.setSelectedPiece('first-panel')).toBe(true);
    expect(ports.renderers[0]?.renders).toBe(2);
    expect(view.setSelectedPiece('another-panel')).toBe(false);
    expect(ports.outline).toBeNull();
    expect(ports.garmentColors).toEqual(color);
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(ports.projectionReads).toBe(1);
  });

  it('outlines only the indexed unsewn edge of the current deformed piece', async () => {
    ports.clothZ = 0.25;
    const { view } = await open();
    const color = ports.garmentColors;
    const camera = ports.currentCamera;
    const edge = {
      contourId: 'front-sewing',
      boundaryVertexIds: ['native-a', 'native-d'],
    } as const;
    expect(view.setSelectedPiece('first-panel', undefined, edge)).toBe(true);
    expect(ports.outline).toEqual([0, 0, 0.25, 0, 1, 0.25]);
    expect(
      view.setSelectedPiece('first-panel', undefined, {
        ...edge,
        boundaryVertexIds: ['native-d', 'native-a'],
      }),
    ).toBe(false);
    expect(ports.outline).toHaveLength(18);
    expect(view.setSelectedPiece('second-panel', undefined, edge)).toBe(false);
    expect(view.setSelectedPiece(null)).toBe(true);
    expect(ports.outline).toBeNull();
    expect(ports.currentCamera).toBe(camera);
    expect(ports.garmentColors).toEqual(color);
    expect(ports.projectionReads).toBe(1);
    ports.controller.abort();
    expect(view.setSelectedPiece('first-panel', undefined, edge)).toBe(false);
  });

  it('draws only the selected exact side and keeps the heatmap and camera unchanged', async () => {
    ports.clothZ = 0.25;
    const { view } = await open();
    const color = ports.garmentColors;
    const camera = ports.currentCamera;
    const a = { runtimeSeamId: 'runtime-seam', sideIndex: 0 } as const;
    const b = { runtimeSeamId: 'runtime-seam', sideIndex: 1 } as const;
    expect(view.setSelectedPiece('first-panel', a)).toBe(true);
    expect(ports.outline).toEqual([0, 0, 0.25, 1, 0, 0.25]);
    expect(ports.outlineColor).toBe('2563eb');
    expect(view.setSelectedPiece('second-panel', b)).toBe(true);
    expect(ports.outline).toEqual([1, 1, 0.25, 0, 1, 0.25]);
    expect(ports.outlineColor).toBe('f97316');
    expect(view.setSelectedPiece('second-panel', b)).toBe(true);
    expect(ports.renderers[0]?.renders).toBe(3);

    expect(view.setSelectedPiece('second-panel', a)).toBe(false);
    expect(ports.outlineColor).toBe('311eee');
    expect(view.setSelectedPiece(null)).toBe(true);
    expect(ports.outline).toBeNull();
    expect(ports.garmentColors).toEqual(color);
    expect(ports.currentCamera).toBe(camera);
    expect(ports.projectionReads).toBe(1);
    ports.controller.abort();
    expect(view.setSelectedPiece('first-panel', a)).toBe(false);
    expect(ports.renderers[0]?.renders).toBe(5);
  });

  it('clears outline geometry/material and rejects future selection when its frame revokes', async () => {
    const { view } = await open();
    const material = vi.spyOn(LineMaterial.prototype, 'dispose');
    const geometry = vi.spyOn(LineSegmentsGeometry.prototype, 'dispose');
    ports.onRender = () => ports.controller.abort();
    expect(view.setSelectedPiece('first-panel')).toBe(false);
    expect(view.lifetime.aborted).toBe(true);
    expect(view.setSelectedPiece('second-panel')).toBe(false);
    expect(ports.renderers[0]?.renders).toBe(2);
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(ports.projectionReads).toBe(1);
  });

  it('picks visible garments by exact render triangle instead of strain schedule order', async () => {
    ports.clothZ = 0.15;
    const { canvas, view } = await open();
    expect(view.pick(...clientPoint(canvas, 0.2, 0.2, ports.clothZ))).toEqual({
      kind: 'garment',
      frameReportSha256: view.receipt.frameReportSha256,
      triangleIndex: 0,
      pieceId: 'first-panel',
    });
    expect(view.pick(...clientPoint(canvas, 0.8, 0.8, ports.clothZ))).toMatchObject({
      kind: 'garment',
      triangleIndex: 1,
      pieceId: 'second-panel',
    });
    expect(view.pick(canvas.getBoundingClientRect().left + 1, 400)).toBeNull();
    expect(view.pick(...clientPoint(canvas, -0.2, 0.2, ports.clothZ))).toBeNull();
    expect(ports.renderers[0]?.renders).toBe(1);
  });

  it('selects only the inspected seam side on the frontmost exact deformed face', async () => {
    ports.clothZ = 0.2;
    const { canvas, view } = await open();
    const a = clientPoint(canvas, 0.45, 0.003, ports.clothZ);
    const b = clientPoint(canvas, 0.45, 0.997, ports.clothZ);
    for (const [index, point] of [a, b].entries()) {
      const hit = view.pick(...point, 'runtime-seam');
      expect(hit).toMatchObject({
        kind: 'garment',
        triangleIndex: index,
        seamSide: { runtimeSeamId: 'runtime-seam', sideIndex: index },
      });
      expect(view.pick(...point, 'different-seam')).not.toHaveProperty('seamSide');
    }
    expect(view.pick(...clientPoint(canvas, 0.2, 0.2, ports.clothZ), 'runtime-seam')).toMatchObject(
      { kind: 'garment', triangleIndex: 0 },
    );
    expect(
      view.pick(...clientPoint(canvas, 0.2, 0.2, ports.clothZ), 'runtime-seam'),
    ).not.toHaveProperty('seamSide');
    expect(ports.renderers[0]?.renders).toBe(1);
  });

  it('picks frontmost body identity and refuses a hit once the rendered frame expires', async () => {
    ports.clothZ = -0.15;
    const { canvas, view } = await open();
    const bodyPoint = clientPoint(canvas, 0.2, 0.2, 0);
    expect(view.pick(...bodyPoint, 'runtime-seam')).toEqual({
      kind: 'body',
      frameReportSha256: view.receipt.frameReportSha256,
      triangleIndex: 0,
      persistedModel: { id: 5, updatedAt: '2026-11-01T12:00:00Z', revision: 'r1' },
      observedBodyContentSha256: 'e'.repeat(64),
    });
    ports.controller.abort();
    expect(view.pick(...bodyPoint)).toBeNull();
  });
  it('renders once, binds the frame receipt and releases only its display on caller abort', async () => {
    const caller = new AbortController();
    const { canvas, view } = await open(caller.signal);
    expect(view.receipt).toMatchObject({
      frames: 32,
      units: 'dimensionless',
      stressPaComputed: false,
      productAuthority: false,
      maximumUtilization: 2.5,
    });
    expect(canvas.dataset.genericObservedStrainFrameSha256).toBe('a'.repeat(64));
    expect(ports.renderers[0]?.renders).toBe(1);
    caller.abort();
    view.dispose();
    expect(view.lifetime.aborted).toBe(true);
    expect(ports.renderers[0]?.disposals).toBe(1);
    expect(canvas.dataset.genericObservedStrainFrameSha256).toBeUndefined();
    expect(ports.controller.signal.aborted).toBe(false);
  });
  it('clears the display immediately on frame revocation and refuses lookalikes', async () => {
    const { view } = await open();
    ports.controller.abort();
    expect(view.lifetime.aborted).toBe(true);
    expect(ports.renderers[0]?.clears).toBe(1);
    await expect(project({ ...ports.owner })).rejects.toThrow(/genuine/);
  });
  it('handles context loss and disposal failures while releasing both geometries and materials', async () => {
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const { canvas, view } = await open();
    ports.throwDispose = true;
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.lifetime.aborted).toBe(true);
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(2);
    expect(ports.controller.signal.aborted).toBe(false);
  });
  it('cleans up a frame revoked inside render without publishing a successful receipt', async () => {
    ports.onRender = () => ports.controller.abort();
    await expect(open()).rejects.toThrow(/current/);
    expect(ports.renderers[0]?.disposals).toBe(1);
  });
  it('pre-aborted callers never allocate a renderer', async () => {
    const caller = new AbortController();
    caller.abort();
    await expect(open(caller.signal)).rejects.toThrow(/current/);
    expect(ports.renderers).toHaveLength(0);
    expect(ports.controller.signal.aborted).toBe(false);
  });
  it.each([10, -10, 50])(
    'fits the complete depth of a garment explicitly placed at z=%s m',
    async (depth) => {
      ports.clothZ = depth;
      const projection = await project(ports.owner);
      expect(projection.finalPositions3M[2]).toBe(depth);
      expect(projection.bodyPositionsM[2]).toBe(0);
      await open();
      expect(ports.frustumViolations).toBe(0);
    },
  );
  it('refuses publication when genuine lifetime polling synchronously aborts only the display caller', async () => {
    const caller = new AbortController();
    ports.onRender = () => {
      ports.onLifetimeRead = () => caller.abort();
    };
    await expect(open(caller.signal)).rejects.toThrow(/current/);
    expect(ports.renderers[0]?.disposals).toBe(1);
    expect(ports.controller.signal.aborted).toBe(false);
  });
  it('never allocates a renderer after a reentrant abort at the pre-allocation lifetime poll', async () => {
    const caller = new AbortController();
    const normal = THREE.BufferGeometry.prototype.computeVertexNormals;
    vi.spyOn(THREE.BufferGeometry.prototype, 'computeVertexNormals').mockImplementation(function (
      this: THREE.BufferGeometry,
    ) {
      normal.call(this);
      ports.onLifetimeRead = () => caller.abort();
    });
    await expect(open(caller.signal)).rejects.toThrow(/current/);
    expect(ports.renderers).toHaveLength(0);
    expect(ports.controller.signal.aborted).toBe(false);
  });
});
