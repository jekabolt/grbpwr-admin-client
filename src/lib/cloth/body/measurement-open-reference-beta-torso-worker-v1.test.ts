import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveMeasurementOpenReferenceTorsoDepthProxyV1 } from './measurement-open-reference-torso-depth-proxy-v1';
import {
  createMeasurementOpenReferenceBetaTorsoInWorkerV1,
  solveMeasurementOpenReferenceBetaTorsoV1,
} from './measurement-open-reference-beta-torso-worker-v1';
import {
  resolveMeasurementOpenReferenceHighHipStationV1,
  solveMeasurementOpenReferenceHighHipProxyV1,
} from './measurement-open-reference-high-hip-proxy-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';

class FakeWorker {
  readonly posted: Array<{
    request: MeasurementOpenReferenceBetaTorsoWorkerRequestV1;
    transfer: Transferable[];
  }> = [];
  terminated = false;
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceBetaTorsoWorkerResponseV1>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: MeasurementOpenReferenceBetaTorsoWorkerRequestV1, transfer: Transferable[]) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  say(response: MeasurementOpenReferenceBetaTorsoWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

const basis = { kind: 'female' } as MakeHumanOpenReferenceBasisV1;
const measurements = {
  chestCircumferenceMm: 920,
  shoulderBreadthMm: 420,
} as CanonicalBodyMeasurementsMm;

afterEach(() => vi.unstubAllGlobals());

describe('measurement open-reference beta torso worker v1', () => {
  it('transfers private source copies and returns the worker-owned torso result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const sourcePositionsM = Float32Array.from([0, 1, 2, 3, 4, 5]);
    const triangleIndices = Uint32Array.from([0, 1, 2]);
    const pending = createMeasurementOpenReferenceBetaTorsoInWorkerV1(
      { basis, measurements, sourcePositionsM, triangleIndices },
      () => worker as unknown as Worker,
    );

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].transfer).toHaveLength(2);
    expect(worker.posted[0].request.options.sourcePositionsM).not.toBe(sourcePositionsM);
    expect(worker.posted[0].request.options.triangleIndices).not.toBe(triangleIndices);
    expect(sourcePositionsM.byteLength).toBeGreaterThan(0);
    expect(triangleIndices.byteLength).toBeGreaterThan(0);

    const result: MeasurementOpenReferenceBetaTorsoWorkerResultV1 = Object.freeze({
      positionsM: sourcePositionsM.slice(),
      ribcageRepresentedMeasurements: Object.freeze([]),
      ribcageDiagnostics: Object.freeze([]),
      chestShoulderRepresentedMeasurements: Object.freeze(['chestCircumferenceMm' as const]),
      chestShoulderLimitedMeasurements: Object.freeze([]),
      chestShoulderDiagnostics: Object.freeze([]),
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
      highHipStatus: 'unrequested' as const,
      highHipRepresented: false,
      highHipLimited: false,
      highHipDiagnostics: Object.freeze([]),
      neckStatus: 'unrequested' as const,
      neckRepresented: false,
      neckLimited: false,
      neckDiagnostics: Object.freeze([]),
    });
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).resolves.toBe(result);
    expect(worker.terminated).toBe(true);
  });

  it('terminates an aborted stale solve and ignores a later worker result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = createMeasurementOpenReferenceBetaTorsoInWorkerV1(
      {
        basis,
        measurements,
        sourcePositionsM: Float32Array.from([0, 1, 2]),
        triangleIndices: Uint16Array.from([0, 0, 0]),
        signal: controller.signal,
      },
      () => worker as unknown as Worker,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });

  it('keeps the module-worker pipeline byte-identical to the synchronous fallback', async () => {
    const realBasis = parseMakeHumanOpenReferenceBasisV1(
      readFileSync(
        resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.neutral.assetPath),
      ),
      'neutral',
    );
    const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
      readFileSync(
        resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
      ),
    );
    const realMeasurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      chestDepthMm: 205,
      waistDepthMm: 195,
      hipDepthMm: 225,
    });
    const sourcePositionsM = createMakeHumanUniformWaistHipModesV1({
      basis: realBasis,
      heightMm: realMeasurements.heightMm,
      bundle: torsoBundle,
    }).uniformPositionsM;
    const direct = solveMeasurementOpenReferenceBetaTorsoV1({
      basis: realBasis,
      sourcePositionsM,
      triangleIndices: realBasis.indices,
      measurements: realMeasurements,
      torsoBundle,
    });
    const fallback = await createMeasurementOpenReferenceBetaTorsoInWorkerV1({
      basis: realBasis,
      sourcePositionsM,
      triangleIndices: realBasis.indices,
      measurements: realMeasurements,
      loadTorsoBundle: async () => torsoBundle,
    });

    expect(fallback.positionsM).toEqual(direct.positionsM);
    expect(direct.chestStationOriginM).toBeDefined();
    expect(direct.underBustStationOriginM).toBeDefined();
    expect(fallback.chestStationOriginM).toEqual(direct.chestStationOriginM);
    expect(fallback.underBustStationOriginM).toEqual(direct.underBustStationOriginM);
    expect(fallback.depthRepresentedMeasurements).toEqual(direct.depthRepresentedMeasurements);
    expect(fallback.depthLimitedMeasurements).toEqual(direct.depthLimitedMeasurements);
    expect(fallback.depthModeResults).toEqual(direct.depthModeResults);
    expect(fallback.depthDiagnostics).toEqual(direct.depthDiagnostics);

    const solveDepthProxy = vi.fn(() => {
      throw new Error('no-depth path must not run the torso-depth quality gate');
    });
    const noDepth = solveMeasurementOpenReferenceBetaTorsoV1({
      basis: realBasis,
      sourcePositionsM,
      triangleIndices: realBasis.indices,
      measurements: Object.freeze({
        ...realMeasurements,
        chestDepthMm: undefined,
        waistDepthMm: undefined,
        hipDepthMm: undefined,
      }),
      torsoBundle,
      solveDepthProxy,
    });
    expect(solveDepthProxy).not.toHaveBeenCalled();
    expect(noDepth.depthRepresentedMeasurements).toEqual([]);
    expect(noDepth.depthLimitedMeasurements).toEqual([]);
    expect(noDepth.depthModeResults).toEqual([]);
    expect(noDepth.depthDiagnostics).toEqual([]);
    expect(noDepth.chestStationOriginM).toEqual(direct.chestStationOriginM);
    expect(noDepth.underBustStationOriginM).toEqual(direct.underBustStationOriginM);
  }, 30_000);

  describe('high hip', () => {
    let cached:
      | Readonly<{
          realBasis: MakeHumanOpenReferenceBasisV1;
          torsoBundle: ReturnType<typeof parseMakeHumanTorsoShapeDeltaBundleV1>;
          realMeasurements: CanonicalBodyMeasurementsMm;
          sourcePositionsM: Float32Array;
          waistStationOriginM: readonly [number, number, number];
          hipStationOriginM: readonly [number, number, number];
          depthOnly: MeasurementOpenReferenceBetaTorsoWorkerResultV1;
        }>
      | undefined;
    function realFixture() {
      if (cached) return cached;
      const realBasis = parseMakeHumanOpenReferenceBasisV1(
        readFileSync(
          resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.neutral.assetPath),
        ),
        'neutral',
      );
      const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
        readFileSync(
          resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
        ),
      );
      const realMeasurements: CanonicalBodyMeasurementsMm = Object.freeze({
        ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
        chestDepthMm: 205,
        waistDepthMm: 195,
        hipDepthMm: 225,
      });
      const waistHip = createMakeHumanUniformWaistHipModesV1({
        basis: realBasis,
        heightMm: realMeasurements.heightMm,
        bundle: torsoBundle,
      });
      const sourcePositionsM = waistHip.uniformPositionsM;
      const depthOnly = solveMeasurementOpenReferenceBetaTorsoV1({
        basis: realBasis,
        sourcePositionsM,
        triangleIndices: realBasis.indices,
        measurements: realMeasurements,
        torsoBundle,
      });
      cached = Object.freeze({
        realBasis,
        torsoBundle,
        realMeasurements,
        sourcePositionsM,
        waistStationOriginM: waistHip.modes.find(
          ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
        )!.stationOriginM,
        hipStationOriginM: waistHip.modes.find(
          ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
        )!.stationOriginM,
        depthOnly,
      });
      return cached;
    }

    it('without a high-hip input stays on the pre-high-hip path byte for byte', () => {
      const { realBasis, torsoBundle, realMeasurements, sourcePositionsM } = realFixture();
      const solveHighHipProxy = vi.fn(() => {
        throw new Error('no high-hip input must not run the high-hip proxy');
      });
      let depthPositionsM: Float32Array | undefined;
      const solveDepthProxy = vi.fn(
        (input: Parameters<typeof solveMeasurementOpenReferenceTorsoDepthProxyV1>[0]) => {
          const depth = solveMeasurementOpenReferenceTorsoDepthProxyV1(input);
          depthPositionsM = depth.positionsM;
          return depth;
        },
      );
      const withDepth = solveMeasurementOpenReferenceBetaTorsoV1({
        basis: realBasis,
        sourcePositionsM,
        triangleIndices: realBasis.indices,
        measurements: realMeasurements,
        torsoBundle,
        solveDepthProxy,
        solveHighHipProxy,
      });
      expect(solveDepthProxy).toHaveBeenCalledTimes(1);
      expect(solveHighHipProxy).not.toHaveBeenCalled();
      // The worker hands back exactly the depth proxy output: no copy, no extra pass.
      expect(withDepth.positionsM).toBe(depthPositionsM);
      expect(withDepth.highHipStatus).toBe('unrequested');
      expect(withDepth.highHipRepresented).toBe(false);
      expect(withDepth.highHipLimited).toBe(false);
      expect(withDepth.highHipDiagnostics).toEqual([]);
      expect(withDepth.highHipStationOriginM).toBeUndefined();
      expect(withDepth.positionsBeforeHighHipM).toBeUndefined();

      const noDepth = solveMeasurementOpenReferenceBetaTorsoV1({
        basis: realBasis,
        sourcePositionsM,
        triangleIndices: realBasis.indices,
        measurements: Object.freeze({
          ...realMeasurements,
          chestDepthMm: undefined,
          waistDepthMm: undefined,
          hipDepthMm: undefined,
        }),
        torsoBundle,
        solveDepthProxy: vi.fn(() => {
          throw new Error('fast path must not run depth');
        }),
        solveHighHipProxy,
      });
      expect(solveHighHipProxy).not.toHaveBeenCalled();
      expect(noDepth.highHipStatus).toBe('unrequested');
    }, 30_000);

    it('applies high hip after depth and keeps waist, hip and depth stations', () => {
      const {
        realBasis,
        torsoBundle,
        realMeasurements,
        sourcePositionsM,
        waistStationOriginM,
        hipStationOriginM,
        depthOnly,
      } = realFixture();
      const station = resolveMeasurementOpenReferenceHighHipStationV1({
        waistStationOriginM,
        hipStationOriginM,
      });
      if (!station.ok) throw new Error('neutral high-hip station must resolve (U1)');
      const section = measureMeshPlaneSectionPerimetersV1({
        positionsM: depthOnly.positionsM,
        triangleIndices: realBasis.indices,
        planeOriginM: station.station.originM,
        planeNormal: [0, 1, 0],
        selection: { kind: 'nearest-seed', seedM: station.station.originM },
        policy: { weldToleranceM: 0.00002 },
      });
      if (!section.ok || !section.selectedLoop) throw new Error('high-hip section missing');
      const baselineMm = section.selectedLoop.perimeterM * 1000;
      const calls: Parameters<typeof solveMeasurementOpenReferenceHighHipProxyV1>[0][] = [];
      const startedAt = performance.now();
      const result = solveMeasurementOpenReferenceBetaTorsoV1({
        basis: realBasis,
        sourcePositionsM,
        triangleIndices: realBasis.indices,
        measurements: realMeasurements,
        highHipCircumferenceMm: baselineMm * 1.05,
        torsoBundle,
        solveHighHipProxy: (input) => {
          calls.push(input);
          const proxyStartedAt = performance.now();
          const value = solveMeasurementOpenReferenceHighHipProxyV1(input);
          console.info(
            `[high-hip proxy] neutral +5%: ${(performance.now() - proxyStartedAt).toFixed(0)} ms`,
          );
          return value;
        },
      });
      console.info(
        `[torso worker] neutral depth+high hip: ${(performance.now() - startedAt).toFixed(0)} ms`,
      );
      // High hip runs on the depth output, with underBust and the chest depth station protected.
      expect(calls).toHaveLength(1);
      expect(calls[0].sourcePositionsM).toEqual(depthOnly.positionsM);
      expect(calls[0].protectedStationOriginsM).toEqual([
        depthOnly.underBustStationOriginM,
        depthOnly.chestStationOriginM,
      ]);
      expect(result.highHipStatus).toBe('represented');
      expect(result.highHipRepresented).toBe(true);
      expect(result.highHipLimited).toBe(false);
      expect(result.highHipDiagnostics).toEqual([]);
      expect(result.highHipStationOriginM).toBeDefined();
      expect(
        Math.abs(result.highHipModeResult!.achievedCircumferenceMm - baselineMm * 1.05),
      ).toBeLessThanOrEqual(0.5);
      expect(result.highHipModeResult!.maximumProtectedPerimeterDriftMm).toBeLessThanOrEqual(0.5);
      expect(result.highHipModeResult!.maximumProtectedDepthDriftMm).toBeLessThanOrEqual(0.5);
      expect(result.positionsM).not.toEqual(depthOnly.positionsM);
      // The runtime can drop high hip alone: the pre-high-hip snapshot is the depth output.
      expect(result.positionsBeforeHighHipM).toEqual(depthOnly.positionsM);
      expect(result.depthRepresentedMeasurements).toEqual(depthOnly.depthRepresentedMeasurements);
      expect(result.depthLimitedMeasurements).toEqual(depthOnly.depthLimitedMeasurements);
      expect(result.depthModeResults).toEqual(depthOnly.depthModeResults);
    }, 60_000);

    it('a throwing high-hip proxy keeps the depth result instead of blanking the torso', () => {
      const { realBasis, torsoBundle, realMeasurements, sourcePositionsM, depthOnly } =
        realFixture();
      const result = solveMeasurementOpenReferenceBetaTorsoV1({
        basis: realBasis,
        sourcePositionsM,
        triangleIndices: realBasis.indices,
        measurements: realMeasurements,
        highHipCircumferenceMm: 900,
        torsoBundle,
        solveHighHipProxy: () => {
          throw new Error('boom');
        },
      });
      expect(result.positionsM).toEqual(depthOnly.positionsM);
      expect(result.positionsBeforeHighHipM).toBeUndefined();
      expect(result.highHipStatus).toBe('notApplied');
      expect(result.highHipDiagnostics).toEqual([{ code: 'section-invalid', message: 'boom' }]);
      expect(result.depthRepresentedMeasurements).toEqual(depthOnly.depthRepresentedMeasurements);
    }, 30_000);
  });
});
