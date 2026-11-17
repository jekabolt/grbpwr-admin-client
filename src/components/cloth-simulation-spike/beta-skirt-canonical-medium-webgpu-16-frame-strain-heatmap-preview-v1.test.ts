import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import topologyFixture from './triangle-strain-render-order-v1.test-fixture.json';

import {
  betaSkirtStrainUtilizationColorV1,
  buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
} from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';

function closeRgb(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(3);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 7));
}

function linear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

describe('canonical-medium per-triangle strain heatmap preview v1', () => {
  it('maps the frozen LUT in linear sRGB and visibly saturates the upper tail', () => {
    closeRgb(betaSkirtStrainUtilizationColorV1(0), [linear(0x17), linear(0x3f), linear(0x5f)]);
    closeRgb(betaSkirtStrainUtilizationColorV1(0.25), [linear(0x20), linear(0x63), linear(0x9b)]);
    closeRgb(betaSkirtStrainUtilizationColorV1(0.375), [
      (linear(0x20) + linear(0x3c)) / 2,
      (linear(0x63) + linear(0xae)) / 2,
      (linear(0x9b) + linear(0xa3)) / 2,
    ]);
    closeRgb(betaSkirtStrainUtilizationColorV1(2), [linear(0xc7), linear(0x3e), linear(0x3a)]);
    closeRgb(betaSkirtStrainUtilizationColorV1(10.96264), [
      linear(0xc7),
      linear(0x3e),
      linear(0x3a),
    ]);
    expect(() => betaSkirtStrainUtilizationColorV1(Number.NaN)).toThrow(/finite/u);
  });

  it('expands indexed triangles so each face owns one exact utilization color', () => {
    const result = buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      topology: new Uint32Array([0, 1, 2, 1, 3, 2]),
      triangleValues: new Float32Array([0, 0, 0, 0.25, 0, 0, 0, 4.25]),
      validityFlags: new Uint32Array([0, 0]),
    });
    expect(Array.from(result.positions)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    expect(result.colors).toHaveLength(18);
    expect(Array.from(result.colors.slice(0, 3))).toEqual(Array.from(result.colors.slice(3, 6)));
    expect(Array.from(result.colors.slice(9, 12))).not.toEqual(
      Array.from(result.colors.slice(0, 3)),
    );
    expect(result).toMatchObject({
      minimumUtilization: 0.25,
      maximumUtilization: 4.25,
      triangleCountAtOrAboveDisplayClamp: 1,
      triangleCountAtOrAboveFourTimesProvisionalLimit: 1,
    });
  });

  it('fails closed on invalid flags, non-finite utilization and topology drift', () => {
    const base = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      topology: new Uint32Array([0, 1, 2]),
      triangleValues: new Float32Array([0, 0, 0, 1]),
      validityFlags: new Uint32Array([0]),
    };
    expect(() =>
      buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
        ...base,
        validityFlags: new Uint32Array([1]),
      }),
    ).toThrow(/validity flag/u);
    expect(() =>
      buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
        ...base,
        triangleValues: new Float32Array([0, 0, 0, Number.POSITIVE_INFINITY]),
      }),
    ).toThrow(/invalid utilization/u);
    expect(() =>
      buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
        ...base,
        topology: new Uint32Array([0, 1, 3]),
      }),
    ).toThrow(/out of range/u);
  });
});

it('canonical16 fixed projector maps colored values before renderer creation (synthetic owner/WebGL ports only)', async () => {
  // This is orchestration/color evidence only, not a genuine physical source or GPU success.
  vi.resetModules();
  const sha = (v: ArrayBufferView) =>
    createHash('sha256')
      .update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
      .digest('hex');
  const topology = new Uint32Array(topologyFixture.normalizedTopology.values);
  const continuum = new Uint32Array(topologyFixture.continuumTriangleIndices.values);
  const values = new Float32Array(912 * 4),
    flags = new Uint32Array(912);
  for (let i = 0; i < 912; i++) values[i * 4 + 3] = 0.5;
  values[7] = 1.5;
  const positions = new Float32Array(580 * 3);
  positions[1] = 1;
  const runtimeSha = 'a'.repeat(64),
    runnerSha = 'b'.repeat(64),
    strainSha = 'c'.repeat(64);
  const runtimeOwner = Object.freeze({ syntheticRuntime: true });
  const runnerOwner = Object.freeze({ report: { seal: { canonicalSha256: runnerSha } } });
  const report = {
    status: 'diagnostic-completed',
    decision: 'PASS_BOUNDED_PER_TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC',
    bindings: {
      runtimeSourceCanonicalSha256: runtimeSha,
      contactRunnerCanonicalSha256: runnerSha,
      finalPositions3MSha256: sha(positions),
      port: { normalizedTopologySha256: sha(topology), triangleIndicesSha256: sha(continuum) },
      outputValuesFloat32LeSha256: sha(values),
      outputValidityFlagsUint32LeSha256: sha(flags),
      outputEnvelopeSha256: 'd'.repeat(64),
      kernelSourceSha256: 'e'.repeat(64),
      provisionalLimitsSha256: 'f'.repeat(64),
      colorLutSha256: '1'.repeat(64),
    },
    workload: { triangleCount: 912 },
    validity: { validTriangleCount: 912, invalidTriangleCount: 0 },
    claims: {
      physicalStressOrPaComputed: false,
      materialFailureEvaluated: false,
      fitAuthority: false,
      runtimeAuthority: false,
      productionAuthority: false,
    },
    ranges: { normalizedUtilization: { minimum: 0.5, maximum: 1.5 } },
    interpretation: { triangleCountAtOrAboveFourTimesProvisionalLimit: 0 },
    blockers: [],
  };
  const strainOwner = Object.freeze({ report });
  let live = true,
    rendererCount = 0;
  let colors: Float32Array | undefined;
  class Canvas {
    dataset: Record<string, string> = {};
    width = 640;
    height = 720;
    clientWidth = 640;
    clientHeight = 720;
  }
  vi.stubGlobal('HTMLCanvasElement', Canvas);
  vi.doMock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return {
      ...actual,
      WebGLRenderer: class {
        constructor() {
          rendererCount++;
        }
        setPixelRatio() {}
        setSize() {}
        dispose() {}
        render(scene: import('three').Scene) {
          const garment = scene.getObjectByName(
            'exact-final-contact-clear-16-frame-strain-utilization-garment',
          ) as import('three').Mesh;
          colors = garment.geometry.getAttribute('color').array as Float32Array;
        }
      },
    };
  });
  vi.doMock('./beta-skirt-canonical-medium-webgpu-16-frame-contact-clear-preview-v2', () => ({
    validateBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewOwnersV2: async () => ({
      bodyPositionsM: new Float32Array(13_380 * 3),
      bodyTriangles: new Uint32Array(26_756 * 3),
      finalGarmentPositionsM: positions.slice(),
      normalizedTriangles: topology.slice(),
      receipt: {
        bindings: {
          runtimeSourceCanonicalSha256: runtimeSha,
          finalPositions3MSha256: sha(positions),
          normalizedTopologySha256: sha(topology),
        },
        remainingBlockers: [],
      },
    }),
  }));
  vi.doMock('./beta-skirt-canonical-medium-strain-utilization-diagnostic-v1', async () => {
    const { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } = await import(
      './beta-skirt-strain-utilization-legend-v1'
    );
    return {
      BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
      projectBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1: (owner: unknown) =>
        owner === strainOwner
          ? {
              reportCanonicalSha256: strainSha,
              triangleValues: values.slice(),
              validityFlags: flags.slice(),
              normalizedTopology: topology.slice(),
              physicalStressAuthority: false,
              materialFailureAuthority: false,
              fitAuthority: false,
              runtimeAuthority: false,
              productionAuthority: false,
            }
          : null,
    };
  });
  vi.doMock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1', () => ({
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1: (owner: unknown) =>
      live && owner === runtimeOwner
        ? {
            reportCanonicalSha256: runtimeSha,
            normalizedTriangles: topology.slice(),
            normalizedV5: {
              simulation: {
                constraints: { continuumStrain: { triangleIndices: continuum.slice().buffer } },
              },
            },
          }
        : null,
  }));
  vi.doMock('./beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2', () => ({
    projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2: (owner: unknown) =>
      owner === runnerOwner ? { reportCanonicalSha256: runnerSha } : null,
  }));
  try {
    const module = await import(
      './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1'
    );
    const view = await module.createBetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapPreviewV1(
      new Canvas() as unknown as HTMLCanvasElement,
      runtimeOwner as never,
      runnerOwner as never,
      strainOwner as never,
    );
    expect(Array.from(colors!.slice(27, 30))).toEqual(
      Array.from(new Float32Array(module.betaSkirtStrainUtilizationColorV1(1.5))),
    );
    expect(Array.from(colors!.slice(9, 12))).toEqual(
      Array.from(new Float32Array(module.betaSkirtStrainUtilizationColorV1(0.5))),
    );
    expect(view.receipt.bindings.renderTriangleOrder.continuumToRenderTriangleIndicesSha256).toBe(
      topologyFixture.expectedContinuumToRenderSha256,
    );
    expect(view.receipt.bindings.strainValuesFloat32LeSha256).toBe(sha(values));
    expect(view.receipt.bindings.renderTriangleOrder.orderedTriangleValuesSha256).not.toBe(
      sha(values),
    );
    view.dispose();
    live = false;
    await expect(
      module.createBetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapPreviewV1(
        new Canvas() as unknown as HTMLCanvasElement,
        runtimeOwner as never,
        runnerOwner as never,
        strainOwner as never,
      ),
    ).rejects.toThrow(/runtime topology/);
    expect(rendererCount).toBe(1);
  } finally {
    vi.doUnmock('three');
    vi.doUnmock('./beta-skirt-canonical-medium-webgpu-16-frame-contact-clear-preview-v2');
    vi.doUnmock('./beta-skirt-canonical-medium-strain-utilization-diagnostic-v1');
    vi.doUnmock('./beta-skirt-canonical-medium-webgpu-runtime-source-v1');
    vi.doUnmock('./beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2');
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});
