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
      dispose() {}
    }
    class EdgesGeometry extends BufferGeometry {
      constructor(_source: BufferGeometry, _threshold: number) {
        super();
        void _source;
        void _threshold;
      }
    }
    class Material {
      constructor(_options: unknown) {
        void _options;
      }
      dispose() {}
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
      setFromObject(_object: unknown) {
        void _object;
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
      lookAt(_target: Vector3) {
        void _target;
      }
    }
    class WebGLRenderer {
      outputColorSpace: unknown;
      toneMapping: unknown;
      toneMappingExposure = 0;
      constructor(readonly options: unknown) {}
      setPixelRatio(_value: number) {
        void _value;
      }
      setSize(_width: number, _height: number, _updateStyle: boolean) {
        void _width;
        void _height;
        void _updateStyle;
      }
      render(scene: Scene, _camera: PerspectiveCamera) {
        void _camera;
        const garment = scene.children.find(
          (value) =>
            value instanceof Mesh &&
            value.name ===
              'exact-saved-32-frame-static-response-dimensionless-strain-utilization-garment',
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

describe('saved32 static-response corrected strain heatmap structural adapter', () => {
  afterEach(() => {
    vi.doUnmock('three');
    vi.doUnmock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1');
    vi.doUnmock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1');
    vi.doUnmock(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-v1',
    );
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('renders exact D424 geometry with fresh D428 face values and fails closed on owner drift', async () => {
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
    const candidateCurrent = new Float32Array(580 * 4);
    candidateCurrent[1] = 1;
    const candidateCurrent3 = new Float32Array(580 * 3);
    candidateCurrent3[1] = 1;
    const candidatePrevious = new Float32Array(580 * 4);
    const topology = new Uint32Array(topologyFixture.normalizedTopology.values);
    const continuumTriangles = new Uint32Array(topologyFixture.continuumTriangleIndices.values);
    const triangleValues = new Float32Array(912 * 4);
    for (let triangle = 0; triangle < 912; triangle += 1) triangleValues[triangle * 4 + 3] = 0.5;
    triangleValues[7] = 1.5;
    const flags = new Uint32Array(912);

    const candidateCurrentSha = float32Sha(candidateCurrent);
    const candidateCurrent3Sha = float32Sha(candidateCurrent3);
    const candidatePreviousSha = float32Sha(candidatePrevious);
    const topologySha = uint32Sha(topology);
    const valuesSha = float32Sha(triangleValues);
    const flagsSha = uint32Sha(flags);
    const outputSha = envelopeSha(triangleValues, flags);
    const runtimeSha = sha('1');
    const responseSha = sha('2');
    const strainSha = sha('3');
    const v5Sha = sha('4');
    const responseStableSha = sha('5');
    let runtimeLive = true;
    let responseLive = true;
    let strainLive = true;

    const runtimeReport = Object.freeze({
      status: 'diagnostic-source-ready',
      decision: 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE',
      bindings: Object.freeze({
        normalizedV5AggregateSha256: v5Sha,
        normalizedTopologySha256: topologySha,
        actualBodyCollisionInputSha256: sha('6'),
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

    const responseReport = Object.freeze({
      status: 'saved-32-frame-static-response-postgates-clear-continuation-unproven',
      decision: 'PASS_BOUNDED_STATIC_D419_RESPONSE_WITHOUT_CONTINUATION_AUTHORITY',
      bindings: Object.freeze({
        runtimeSourceCanonicalSha256: runtimeSha,
        normalizedTopologySha256: topologySha,
        sourceCurrentPositionsInvMassKgSha256: sha('7'),
        candidateCurrentPositionsInvMassKgSha256: candidateCurrentSha,
        candidateCurrentPositions3MSha256: candidateCurrent3Sha,
        candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha,
      }),
      response: Object.freeze({
        response: Object.freeze({ correctedVertexCount: 1, maximumCorrectionM: 0.001 }),
      }),
      postgates: Object.freeze({
        body: Object.freeze({
          exactCandidateReplayed: true,
          clear: true,
          bodyGarmentTriangleIntersectionCount: 0,
          penetratingVertexCount: 0,
          unsafeVertexCount: 0,
          ambiguousSignVertexCount: 0,
        }),
        self: Object.freeze({ residualBlockingCount: 0 }),
        orientation: Object.freeze({
          sourceDegenerateTriangleCount: 0,
          candidateDegenerateTriangleCount: 0,
          normalReversalCount: 0,
        }),
        sweptBody: Object.freeze({ status: 'clear' }),
        retainedState: Object.freeze({
          exactFrameContinuationExecuted: false,
          rehydratedNextFrameParityProven: false,
        }),
      }),
      stableEvidence: Object.freeze({ canonicalSha256: responseStableSha }),
      claims: Object.freeze({
        genuineSavedRuntimeWrapperAuthenticated: false,
        staticResponseOnly: true,
        candidateUploadedToGpu: false,
        exactFrameContinuationExecuted: false,
        rehydratedNextFrameParityProven: false,
        fitAuthority: false,
        runtimeAuthority: false,
        productionAuthority: false,
      }),
      seal: Object.freeze({ canonicalSha256: responseSha }),
    });
    const responseOwner = Object.freeze({ report: responseReport });
    const crossResponseOwner = Object.freeze({
      report: Object.freeze({
        ...responseReport,
        bindings: Object.freeze({
          ...responseReport.bindings,
          runtimeSourceCanonicalSha256: sha('8'),
        }),
        seal: Object.freeze({ canonicalSha256: sha('9') }),
      }),
    });
    const topologyDriftResponseOwner = Object.freeze({ report: responseReport });
    const midAwaitDisposedResponseOwner = Object.freeze({ report: responseReport });
    let midAwaitResponseProjectionCount = 0;

    const strainReport = Object.freeze({
      status: 'saved-32-frame-static-response-strain-diagnostic-blocked',
      decision:
        'MEASURED_D424_CORRECTED_CANDIDATE_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS',
      bindings: Object.freeze({
        runtimeSourceCanonicalSha256: runtimeSha,
        normalizedV5AggregateSha256: v5Sha,
        staticResponseStableEvidenceSha256: responseStableSha,
        staticResponseReportCanonicalSha256: responseSha,
        candidateCurrentPositionsInvMassKgSha256: candidateCurrentSha,
        candidateCurrentPositions3MSha256: candidateCurrent3Sha,
        candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha,
        normalizedTopologySha256: topologySha,
        port: Object.freeze({
          finalPositionsInvMassKgSha256: candidateCurrentSha,
          normalizedTopologySha256: topologySha,
          triangleIndicesSha256: uint32Sha(continuumTriangles),
        }),
        outputValuesFloat32LeSha256: valuesSha,
        outputValidityFlagsUint32LeSha256: flagsSha,
        outputEnvelopeSha256: outputSha,
        frozenV1KernelSourceSha256: sha('a'),
        frozenV1ProvisionalLimitsSha256: sha('b'),
        frozenV1ColorLutSha256: sha('c'),
      }),
      workload: Object.freeze({ vertexCount: 580, triangleCount: 912 }),
      validity: Object.freeze({ validTriangleCount: 912, invalidTriangleCount: 0 }),
      ranges: Object.freeze({
        normalizedUtilization: Object.freeze({ minimum: 0.5, maximum: 1.5 }),
      }),
      interpretation: Object.freeze({ triangleCountAtOrAboveFourTimesProvisionalLimit: 0 }),
      stableEvidence: Object.freeze({ canonicalSha256: sha('d') }),
      claims: Object.freeze({
        genuineSavedRuntimeWrapperAuthenticated: false,
        exactD424StaticResponseCandidateBound: true,
        preResponseD420OutputReused: false,
        preResponseStrainOwnerAcceptedAsInput: false,
        gpuPerTriangleDiagnosticExecutedFresh: true,
        physicalStressOrPaComputed: false,
        materialFailureEvaluated: false,
        candidateUploadedToGpuForFrameContinuation: false,
        exactFrameContinuationExecuted: false,
        rehydratedNextFrameParityProven: false,
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
          outputValuesFloat32LeSha256: sha('e'),
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
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1: (owner: unknown) => {
        if (!responseLive) return null;
        if (
          owner !== responseOwner &&
          owner !== crossResponseOwner &&
          owner !== topologyDriftResponseOwner &&
          owner !== midAwaitDisposedResponseOwner
        )
          return null;
        if (owner === midAwaitDisposedResponseOwner && (midAwaitResponseProjectionCount += 1) > 2)
          return null;
        const outputTopology = new Uint32Array(topology);
        if (owner === topologyDriftResponseOwner) outputTopology[0] = 1;
        return Object.freeze({
          reportCanonicalSha256: owner === crossResponseOwner ? sha('9') : responseSha,
          candidateCurrentPositionsInvMassKg: new Float32Array(candidateCurrent),
          candidateCurrentPositions3M: new Float32Array(candidateCurrent3),
          candidatePreviousPositionsInvMassKg: new Float32Array(candidatePrevious),
          normalizedTriangles: outputTopology,
          staticResponseOnly: true,
          candidateUploadedToGpu: false,
          exactFrameContinuationAuthority: false,
          runtimeAuthority: false,
          productionAuthority: false,
        });
      },
    }));
    vi.doMock(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-v1',
      () => ({
        projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1: (
          owner: unknown,
        ) =>
          strainLive && (owner === strainOwner || owner === hashDriftStrainOwner)
            ? Object.freeze({
                reportCanonicalSha256: strainSha,
                triangleValues: new Float32Array(triangleValues),
                validityFlags: new Uint32Array(flags),
                normalizedTopology: new Uint32Array(topology),
                exactD424CandidateBound: true,
                preResponseD420OutputReused: false,
                strainDiagnosticAuthority: true,
                physicalStressAuthority: false,
                materialFailureAuthority: false,
                fitAuthority: false,
                runtimeAuthority: false,
                productionAuthority: false,
              })
            : null,
      }),
    );

    const module = await import(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-heatmap-adapter-v1'
    );
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const result =
      await module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        responseOwner as never,
        strainOwner as never,
      );
    expect(result).toMatchObject({
      ok: true,
      report: {
        counts: { renderedFaceVertexCount: 2_736, correctedVertexCount: 1 },
        visualization: { units: 'dimensionless', minimumUtilization: 0.5 },
        claims: {
          genuineSavedRuntimeWrapperAuthenticated: false,
          exactD424StaticResponseCandidateRendered: true,
          exactD428FreshCorrectedTriangleStrainValuesRendered: true,
          preResponseD420OutputReused: false,
          copiedThreeResourcesSurviveUpstreamOwnerDisposal: true,
          physicalStressOrPaRendered: false,
          materialFailureRendered: false,
          fitAuthority: false,
        },
      },
    });
    if ('detail' in result) throw new Error(result.detail);
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
    responseLive = false;
    strainLive = false;
    bodyPositions.fill(77);
    candidateCurrent.fill(88);
    candidateCurrent3.fill(88);
    topology.fill(1);
    triangleValues.fill(99);
    flags.fill(1);
    expect(tracker.garmentPositions?.[1]).toBe(retainedPosition);
    expect(result.session.report.seal.canonicalSha256).toBe(result.report.seal.canonicalSha256);
    expect(result.session.dispose()).toBe(true);
    expect(result.session.dispose()).toBe(false);
    expect(tracker.rendererDisposed).toBe(true);

    runtimeLive = true;
    responseLive = true;
    strainLive = true;
    bodyPositions.fill(0);
    candidateCurrent.fill(0);
    candidateCurrent[1] = 1;
    candidateCurrent3.fill(0);
    candidateCurrent3[1] = 1;
    topology.set(topologyFixture.normalizedTopology.values);
    triangleValues.fill(0);
    for (let triangle = 0; triangle < 912; triangle += 1) triangleValues[triangle * 4 + 3] = 0.5;
    triangleValues[7] = 1.5;
    flags.fill(0);

    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        Object.freeze({}) as never,
        responseOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        crossResponseOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        topologyDriftResponseOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        responseOwner as never,
        hashDriftStrainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        midAwaitDisposedResponseOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'binding-mismatch' });
    expect(midAwaitResponseProjectionCount).toBe(3);
    strainLive = false;
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        canvas,
        runtimeOwner as never,
        responseOwner as never,
        strainOwner as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'corrected-strain-owner-unavailable' });
  });

  it('does not invoke accessors on forged owners', async () => {
    vi.resetModules();
    vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
    installThreeMock({
      garmentPositions: null,
      garmentColors: null,
      rendererDisposed: false,
    });
    vi.doMock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1', () => ({
      projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1: () => null,
    }));
    vi.doMock('./beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1', () => ({
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1: () => null,
    }));
    vi.doMock(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-v1',
      () => ({
        projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1: () => null,
      }),
    );
    let getterCalls = 0;
    const forged = {};
    Object.defineProperty(forged, 'report', {
      get() {
        getterCalls += 1;
        throw new Error('must not run');
      },
    });
    const module = await import(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-heatmap-adapter-v1'
    );
    await expect(
      module.createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
        new FakeCanvas() as unknown as HTMLCanvasElement,
        forged as never,
        forged as never,
        forged as never,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    expect(getterCalls).toBe(0);
  });
});
