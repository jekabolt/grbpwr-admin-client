import topologyFixture from './triangle-strain-render-order-v1.test-fixture.json';
// Synthetic fixed owner/WebGL ports; actual captured topology is used only to test color permutation.
// No solver, GPU or physical acceptance is established here.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

const sha = (character: string): string => character.repeat(64);

function float32Sha(values: Float32Array): string {
  const bytes = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1)
    bytes.writeFloatLE(values[index]!, index * 4);
  return createHash('sha256').update(bytes).digest('hex');
}

function uint32Sha(values: Uint32Array): string {
  const bytes = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1)
    bytes.writeUInt32LE(values[index]!, index * 4);
  return createHash('sha256').update(bytes).digest('hex');
}

function envelopeSha(values: Float32Array, flags: Uint32Array): string {
  const valueBytes = Buffer.alloc(values.length * 4);
  const flagBytes = Buffer.alloc(flags.length * 4);
  for (let index = 0; index < values.length; index += 1)
    valueBytes.writeFloatLE(values[index]!, index * 4);
  for (let index = 0; index < flags.length; index += 1)
    flagBytes.writeUInt32LE(flags[index]!, index * 4);
  return createHash('sha256')
    .update(Buffer.concat([valueBytes, flagBytes]))
    .digest('hex');
}

type RenderTracker = {
  garmentPositions: Float32Array | null;
  garmentColors: Float32Array | null;
  rendererDisposed: boolean;
};

class FakeCanvas {
  clientWidth = 960;
  clientHeight = 1_080;
  width = 960;
  height = 1_080;
  dataset: Record<string, string> = {};
}

function installThreeMock(tracker: RenderTracker): void {
  vi.doMock('three', () => {
    class Vector3 {
      x = 0;
      y = 0;
      z = 0;
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      }
      clone() {
        return new Vector3().set(this.x, this.y, this.z);
      }
      lerp(other: Vector3, alpha: number) {
        this.x += (other.x - this.x) * alpha;
        this.y += (other.y - this.y) * alpha;
        this.z += (other.z - this.z) * alpha;
        return this;
      }
    }
    class BufferAttribute {
      constructor(
        readonly array: Float32Array | Uint32Array,
        readonly itemSize: number,
      ) {}
    }
    class BufferGeometry {
      attributes: Record<string, BufferAttribute> = {};
      index: BufferAttribute | null = null;
      disposed = false;
      setAttribute(name: string, attribute: BufferAttribute) {
        this.attributes[name] = attribute;
        return this;
      }
      setIndex(attribute: BufferAttribute) {
        this.index = attribute;
        return this;
      }
      computeVertexNormals() {}
      computeBoundingBox() {}
      computeBoundingSphere() {}
      dispose() {
        this.disposed = true;
      }
    }
    class EdgesGeometry extends BufferGeometry {
      constructor() {
        super();
      }
    }
    class Material {
      disposed = false;
      constructor() {}
      dispose() {
        this.disposed = true;
      }
    }
    class Mesh {
      name = '';
      userData: Record<string, unknown> = {};
      constructor(
        readonly geometry: BufferGeometry,
        readonly material: Material,
      ) {}
    }
    class Scene {
      background: unknown;
      children: unknown[] = [];
      add(...objects: unknown[]) {
        this.children.push(...objects);
      }
    }
    class DirectionalLight {
      position = new Vector3();
      constructor(
        readonly color: unknown,
        readonly intensity: number,
      ) {}
    }
    class Box3 {
      setFromObject() {
        return this;
      }
      getCenter(target: Vector3) {
        return target.set(0, 1, 0);
      }
      getSize(target: Vector3) {
        return target.set(1, 2, 1);
      }
    }
    class PerspectiveCamera {
      position = new Vector3();
      constructor(
        readonly fov: number,
        readonly aspect: number,
        readonly near: number,
        readonly far: number,
      ) {}
      lookAt() {}
    }
    class WebGLRenderer {
      outputColorSpace: unknown;
      toneMapping: unknown;
      toneMappingExposure = 0;
      constructor(readonly options: unknown) {}
      setPixelRatio() {}
      setSize() {}
      render(scene: Scene) {
        const garment = scene.children.find(
          (value) =>
            value instanceof Mesh &&
            value.name === 'exact-saved-32-frame-dimensionless-strain-utilization-garment',
        ) as Mesh | undefined;
        tracker.garmentPositions = garment?.geometry.attributes.position?.array as Float32Array;
        tracker.garmentColors = garment?.geometry.attributes.color?.array as Float32Array;
      }
      dispose() {
        tracker.rendererDisposed = true;
      }
    }
    return {
      ACESFilmicToneMapping: 'aces',
      Box3,
      BufferAttribute,
      BufferGeometry,
      Color: class Color {
        constructor(readonly value: unknown) {}
      },
      DirectionalLight,
      DoubleSide: 'double',
      EdgesGeometry,
      FrontSide: 'front',
      HemisphereLight: class HemisphereLight {
        constructor(
          readonly sky: unknown,
          readonly ground: unknown,
          readonly intensity: number,
        ) {}
      },
      LineBasicMaterial: Material,
      LineSegments: class LineSegments {
        constructor(
          readonly geometry: BufferGeometry,
          readonly material: Material,
        ) {}
      },
      MathUtils: { degToRad: (value: number) => (value * Math.PI) / 180 },
      Mesh,
      MeshPhysicalMaterial: Material,
      MeshStandardMaterial: Material,
      PerspectiveCamera,
      Scene,
      SRGBColorSpace: 'srgb',
      Vector3,
      WebGLRenderer,
    };
  });
}

describe('saved 32F face-owned strain heatmap structural adapter', () => {
  afterEach(() => {
    vi.doUnmock('three');
    vi.doUnmock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1');
    vi.doUnmock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4');
    vi.doUnmock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-v1');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('renders copied face-owned geometry, stays structural-only, and survives upstream disposal', async () => {
    vi.resetModules();
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
    const tracker: RenderTracker = {
      garmentPositions: null,
      garmentColors: null,
      rendererDisposed: false,
    };
    installThreeMock(tracker);

    const bodyPositions = new Float32Array(13_380 * 3);
    const bodyTriangles = new Uint32Array(26_756 * 3);
    const finalPositions = new Float32Array(580 * 3);
    finalPositions[1] = 1;
    const topology = new Uint32Array(topologyFixture.normalizedTopology.values);
    const continuumTriangles = new Uint32Array(topologyFixture.continuumTriangleIndices.values);
    const triangleValues = new Float32Array(912 * 4);
    for (let triangle = 0; triangle < 912; triangle += 1) triangleValues[triangle * 4 + 3] = 0.5;
    triangleValues[7] = 1.5;
    const flags = new Uint32Array(912);
    const bodyPositionsSha = float32Sha(bodyPositions);
    const bodyTrianglesSha = uint32Sha(bodyTriangles);
    const finalPositionsSha = float32Sha(finalPositions);
    const topologySha = uint32Sha(topology);
    const valuesSha = float32Sha(triangleValues);
    const flagsSha = uint32Sha(flags);
    const outputSha = envelopeSha(triangleValues, flags);
    const runtimeSha = sha('1');
    const runnerSha = sha('2');
    const strainSha = sha('3');
    const v5Sha = sha('4');
    let runtimeLive = true;
    let runnerLive = true;
    let strainLive = true;

    const runtimeReport = Object.freeze({
      status: 'diagnostic-source-ready',
      decision: 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE',
      bindings: Object.freeze({
        normalizedV5AggregateSha256: v5Sha,
        normalizedTopologySha256: topologySha,
      }),
      counts: Object.freeze({
        bodyVertexCount: 13_380,
        bodyTriangleCount: 26_756,
        garmentVertexCount: 580,
        garmentTriangleCount: 912,
      }),
      claims: Object.freeze({
        exactActualBodyCollisionInputRetained: true,
        runtimeAuthority: false,
        fitAuthority: false,
        productionAuthority: false,
      }),
      seal: Object.freeze({ canonicalSha256: runtimeSha }),
    });
    const runtimeOwner = Object.freeze({ report: runtimeReport });
    const runnerReport = Object.freeze({
      decision:
        'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS',
      bindings: Object.freeze({
        savedRuntimeSourceCanonicalSha256: sha('5'),
        runtimeSourceCanonicalSha256: runtimeSha,
        normalizedV5AggregateSha256: v5Sha,
        normalizedTopologySha256: topologySha,
        bodyPositions3MSha256: bodyPositionsSha,
        bodyTrianglesSha256: bodyTrianglesSha,
        finalPositions3MSha256: finalPositionsSha,
      }),
      workload: Object.freeze({
        particleCount: 580,
        triangleCount: 912,
        bodyVertexCount: 13_380,
        bodyTriangleCount: 26_756,
      }),
      collision: Object.freeze({
        exactActualBodyGateClear: true,
        bodyGarmentTriangleIntersectionCount: 0,
        penetratingVertexCount: 0,
        unsafeVertexCount: 0,
        ambiguousSignVertexCount: 0,
      }),
      claims: Object.freeze({
        savedLineageAuthenticatedByOuterWrapper: false,
        fitAuthority: false,
        runtimeAuthority: false,
        productionAuthority: false,
      }),
      seal: Object.freeze({ canonicalSha256: runnerSha }),
    });
    const runnerOwner = Object.freeze({ report: runnerReport });
    const crossRunnerOwner = Object.freeze({
      report: Object.freeze({
        ...runnerReport,
        bindings: Object.freeze({
          ...runnerReport.bindings,
          runtimeSourceCanonicalSha256: sha('a'),
        }),
        seal: Object.freeze({ canonicalSha256: sha('b') }),
      }),
    });
    const topologyDriftRunnerOwner = Object.freeze({ report: runnerReport });
    const strainReport = Object.freeze({
      status: 'saved-dxf-32-frame-strain-diagnostic-blocked',
      decision: 'MEASURED_SAVED_32_FRAME_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS',
      bindings: Object.freeze({
        savedRuntimeSourceCanonicalSha256: sha('5'),
        runtimeSourceCanonicalSha256: runtimeSha,
        runner32FrameCanonicalSha256: runnerSha,
        normalizedV5AggregateSha256: v5Sha,
        finalPositions3MSha256: finalPositionsSha,
        normalizedTopologySha256: topologySha,
        port: Object.freeze({
          normalizedTopologySha256: topologySha,
          triangleIndicesSha256: uint32Sha(continuumTriangles),
        }),
        outputValuesFloat32LeSha256: valuesSha,
        outputValidityFlagsUint32LeSha256: flagsSha,
        outputEnvelopeSha256: outputSha,
        frozenV1KernelSourceSha256: sha('6'),
        frozenV1ProvisionalLimitsSha256: sha('7'),
        frozenV1ColorLutSha256: sha('8'),
      }),
      workload: Object.freeze({ vertexCount: 580, triangleCount: 912 }),
      validity: Object.freeze({ validTriangleCount: 912, invalidTriangleCount: 0 }),
      ranges: Object.freeze({
        normalizedUtilization: Object.freeze({ minimum: 0.5, maximum: 1.5 }),
      }),
      interpretation: Object.freeze({ triangleCountAtOrAboveFourTimesProvisionalLimit: 0 }),
      stableEvidence: Object.freeze({ canonicalSha256: sha('9') }),
      claims: Object.freeze({
        genuineSavedRuntimeWrapperAuthenticated: false,
        exactRetainedSaved32FrameProjectionBound: true,
        frozenV1KernelPortLimitsAndColorLutReused: true,
        physicalStressOrPaComputed: false,
        materialFailureEvaluated: false,
        fitAuthority: false,
        runtimeAuthority: false,
        productionAuthority: false,
      }),
      seal: Object.freeze({ canonicalSha256: strainSha }),
    });
    const strainOwner = Object.freeze({ report: strainReport });
    const hashDriftStrainOwner = Object.freeze({
      report: Object.freeze({
        ...strainReport,
        bindings: Object.freeze({
          ...strainReport.bindings,
          outputValuesFloat32LeSha256: sha('c'),
        }),
      }),
    });

    vi.doMock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1', () => ({
      projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1: (owner: unknown) =>
        runtimeLive && owner === runtimeOwner
          ? Object.freeze({
              reportCanonicalSha256: runtimeSha,
              normalizedV5: {
                seal: { aggregateSha256: v5Sha },
                simulation: {
                  constraints: {
                    continuumStrain: { triangleIndices: continuumTriangles.slice().buffer },
                  },
                },
              },
              normalizedTriangles: new Uint32Array(topology),
              collisionInput: Object.freeze({
                bodyPositionsM: new Float32Array(bodyPositions),
                bodyTriangles: new Uint32Array(bodyTriangles),
              }),
            })
          : null,
    }));
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4: (owner: unknown) => {
        if (!runnerLive) return null;
        if (
          owner !== runnerOwner &&
          owner !== crossRunnerOwner &&
          owner !== topologyDriftRunnerOwner
        )
          return null;
        const outputTopology = new Uint32Array(topology);
        if (owner === topologyDriftRunnerOwner) outputTopology[0] = 1;
        return Object.freeze({
          reportCanonicalSha256: owner === crossRunnerOwner ? sha('b') : runnerSha,
          finalPositions3M: new Float32Array(finalPositions),
          normalizedTriangles: outputTopology,
        });
      },
    }));
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-v1', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1: (owner: unknown) =>
        strainLive && (owner === strainOwner || owner === hashDriftStrainOwner)
          ? Object.freeze({
              reportCanonicalSha256: strainSha,
              triangleValues: new Float32Array(triangleValues),
              validityFlags: new Uint32Array(flags),
              normalizedTopology: new Uint32Array(topology),
              physicalStressAuthority: false,
              materialFailureAuthority: false,
              fitAuthority: false,
              runtimeAuthority: false,
              productionAuthority: false,
            })
          : null,
    }));

    const module = await import(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-heatmap-adapter-v1'
    );
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const result =
      await module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        runnerOwner as never,
        strainOwner as never,
      );
    expect(result).toMatchObject({
      ok: true,
      report: {
        counts: { renderedFaceVertexCount: 2_736 },
        visualization: { units: 'dimensionless', minimumUtilization: 0.5 },
        claims: {
          genuineSavedRuntimeWrapperAuthenticated: false,
          copiedThreeResourcesSurviveUpstreamOwnerDisposal: true,
          physicalStressOrPaRendered: false,
          materialFailureRendered: false,
          fitAuthority: false,
        },
      },
    });
    if (!result.ok) throw new Error(result.detail);
    expect(tracker.garmentPositions).toHaveLength(912 * 9);
    expect(tracker.garmentColors).toHaveLength(912 * 9);
    const { betaSkirtStrainUtilizationColorV1 } = await import(
      './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1'
    );
    // Colored continuum ordinal1 is exact render triangle3, not render triangle1.
    expect(Array.from(tracker.garmentColors!.slice(3 * 9, 3 * 9 + 3))).toEqual(
      Array.from(new Float32Array(betaSkirtStrainUtilizationColorV1(1.5))),
    );
    expect(Array.from(tracker.garmentColors!.slice(1 * 9, 1 * 9 + 3))).toEqual(
      Array.from(new Float32Array(betaSkirtStrainUtilizationColorV1(0.5))),
    );
    expect(result.report.bindings.renderTriangleOrder).toMatchObject({
      continuumTriangleIndicesSha256: topologyFixture.continuumTriangleIndices.sha256,
      continuumToRenderTriangleIndicesSha256: topologyFixture.expectedContinuumToRenderSha256,
      rawTriangleValuesSha256: valuesSha,
    });
    expect(result.report.bindings.renderTriangleOrder.orderedTriangleValuesSha256).not.toBe(
      valuesSha,
    );

    expect(tracker.garmentPositions?.[1]).toBe(1);
    const retainedPosition = tracker.garmentPositions?.[1];

    runtimeLive = false;
    runnerLive = false;
    strainLive = false;
    bodyPositions.fill(77);
    finalPositions.fill(88);
    topology.fill(1);
    triangleValues.fill(99);
    flags.fill(1);
    expect(tracker.garmentPositions?.[1]).toBe(retainedPosition);
    expect(result.session.report.seal.canonicalSha256).toBe(result.report.seal.canonicalSha256);
    expect(result.session.dispose()).toBe(true);
    expect(result.session.dispose()).toBe(false);
    expect(tracker.rendererDisposed).toBe(true);

    runtimeLive = true;
    runnerLive = true;
    strainLive = true;
    bodyPositions.fill(0);
    finalPositions.fill(0);
    finalPositions[1] = 1;
    topology.set(topologyFixture.normalizedTopology.values);
    triangleValues.fill(0);
    for (let triangle = 0; triangle < 912; triangle += 1) triangleValues[triangle * 4 + 3] = 0.5;
    triangleValues[7] = 1.5;
    flags.fill(0);

    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        Object.freeze({}) as never,
        runnerOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        crossRunnerOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        topologyDriftRunnerOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        runnerOwner as never,
        hashDriftStrainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });

    strainLive = false;
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        runnerOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'strain-owner-unavailable' });
  });

  it('does not invoke a forged owner report accessor', async () => {
    vi.resetModules();
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
    const tracker: RenderTracker = {
      garmentPositions: null,
      garmentColors: null,
      rendererDisposed: false,
    };
    installThreeMock(tracker);
    vi.doMock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1', () => ({
      projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1: () => null,
    }));
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4: () => null,
    }));
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-v1', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1: () => null,
    }));
    let getterCalls = 0;
    const forged = {};
    Object.defineProperty(forged, 'report', {
      get() {
        getterCalls += 1;
        throw new Error('must not run');
      },
    });
    const module = await import(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-heatmap-adapter-v1'
    );
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
        new FakeCanvas() as unknown as HTMLCanvasElement,
        forged as never,
        forged as never,
        forged as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    expect(getterCalls).toBe(0);
  });
});
