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
import {
  createMeasurementOpenReferenceBetaTorsoInWorkerV1,
  solveMeasurementOpenReferenceBetaTorsoV1,
} from './measurement-open-reference-beta-torso-worker-v1';
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
    expect(fallback.depthRepresentedMeasurements).toEqual(direct.depthRepresentedMeasurements);
    expect(fallback.depthLimitedMeasurements).toEqual(direct.depthLimitedMeasurements);
    expect(fallback.depthModeResults).toEqual(direct.depthModeResults);
    expect(fallback.depthDiagnostics).toEqual(direct.depthDiagnostics);
  }, 30_000);
});
