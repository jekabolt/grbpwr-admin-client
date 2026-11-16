import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import {
  loadMakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaBundleV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerOptionsV1,
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveOpenReferenceChestShoulderResearchV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { type MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import { applyOpenReferenceUnderBustRibcageResearchV1 } from './measurement-open-reference-underbust-ribcage-research-v1';
import { solveMeasurementOpenReferenceTorsoDepthProxyV1 } from './measurement-open-reference-torso-depth-proxy-v1';

export const MEASUREMENT_OPEN_REFERENCE_BETA_TORSO_WORKER_MEASURE_V1 =
  'measurement-open-reference-beta-torso-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

export interface MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1
  extends Omit<MeasurementOpenReferenceBetaTorsoWorkerOptionsV1, 'basisKind'> {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly signal?: AbortSignal;
  readonly loadTorsoBundle?: () => Promise<MakeHumanTorsoShapeDeltaBundleV1>;
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** Shared pure torso pipeline used by both the module worker and the synchronous fallback. */
export function solveMeasurementOpenReferenceBetaTorsoV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: MeasurementOpenReferenceBetaTorsoWorkerOptionsV1['measurements'];
  readonly torsoBundle: MakeHumanTorsoShapeDeltaBundleV1;
  readonly solveDepthProxy?: typeof solveMeasurementOpenReferenceTorsoDepthProxyV1;
}): MeasurementOpenReferenceBetaTorsoWorkerResultV1 {
  const { torsoBundle } = options;
  const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis: options.basis,
    measurements: options.measurements,
    bundle: torsoBundle,
  });
  const ribcage = applyOpenReferenceUnderBustRibcageResearchV1({
    sourcePositionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    stationOriginM: modes.underBustStationOriginM,
  });
  const chestShoulder = solveOpenReferenceChestShoulderResearchV1({
    sourcePositionsM: ribcage.positionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    modes: modes.modes,
  });
  const depthRequested = [
    options.measurements.chestDepthMm,
    options.measurements.waistDepthMm,
    options.measurements.hipDepthMm,
  ].some((value) => value != null);
  if (!depthRequested) {
    return Object.freeze({
      positionsM: chestShoulder.positionsM,
      ribcageRepresentedMeasurements: ribcage.representedMeasurements,
      ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...ribcage.diagnostics]),
      chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
      chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
      chestShoulderDiagnostics: chestShoulder.diagnostics,
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
    });
  }
  const waistHipModes = createMakeHumanUniformWaistHipModesV1({
    basis: options.basis,
    heightMm: options.measurements.heightMm,
    bundle: torsoBundle,
  });
  const chestMode = modes.modes.find(
    ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
  );
  const shoulderMode = modes.modes.find(
    ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
  );
  const waistMode = waistHipModes.modes.find(
    ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
  );
  const hipMode = waistHipModes.modes.find(
    ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
  );
  if (
    !chestMode?.chestStationOriginM ||
    !shoulderMode?.shoulderVertices ||
    !waistMode ||
    !hipMode
  ) {
    throw new Error('Torso depth proxy stations are incomplete.');
  }
  const depth = (options.solveDepthProxy ?? solveMeasurementOpenReferenceTorsoDepthProxyV1)({
    sourcePositionsM: chestShoulder.positionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    stations: [
      { measurementKey: 'chestDepthMm', originM: chestMode.chestStationOriginM },
      { measurementKey: 'waistDepthMm', originM: waistMode.stationOriginM },
      { measurementKey: 'hipDepthMm', originM: hipMode.stationOriginM },
    ],
    protectedStationOriginsM: [modes.underBustStationOriginM],
    shoulderVertices: shoulderMode.shoulderVertices,
  });
  return Object.freeze({
    positionsM: depth.positionsM,
    ribcageRepresentedMeasurements: ribcage.representedMeasurements,
    ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...ribcage.diagnostics]),
    chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
    chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
    chestShoulderDiagnostics: chestShoulder.diagnostics,
    depthRepresentedMeasurements: depth.representedMeasurements,
    depthLimitedMeasurements: depth.limitedMeasurements,
    depthModeResults: depth.modeResults,
    depthDiagnostics: depth.diagnostics,
  });
}

async function solveSynchronously(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
): Promise<MeasurementOpenReferenceBetaTorsoWorkerResultV1> {
  const torsoBundle = await (options.loadTorsoBundle ?? loadMakeHumanTorsoShapeDeltaBundleV1)();
  return solveMeasurementOpenReferenceBetaTorsoV1({
    basis: options.basis,
    sourcePositionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    torsoBundle,
  });
}

function transferableRequest(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
): readonly [MeasurementOpenReferenceBetaTorsoWorkerRequestV1, Transferable[]] {
  const sourcePositionsM = options.sourcePositionsM.slice();
  const triangleIndices = options.triangleIndices.slice();
  return [
    {
      id: 1,
      type: 'solve',
      options: {
        basisKind: options.basis.kind,
        sourcePositionsM,
        triangleIndices,
        measurements: options.measurements,
      },
    },
    [sourcePositionsM.buffer, triangleIndices.buffer],
  ];
}

export function createMeasurementOpenReferenceBetaTorsoInWorkerV1(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
  createWorker: WorkerFactoryV1 = () =>
    new Worker(new URL('./measurement-open-reference-beta-torso.worker.ts', import.meta.url), {
      type: 'module',
    }),
): Promise<MeasurementOpenReferenceBetaTorsoWorkerResultV1> {
  if (options.signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined' || options.loadTorsoBundle) return solveSynchronously(options);

  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const startedAt = performance.now();
    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const abort = () => finish(() => reject(abortError()));
    worker.onmessage = (event: MessageEvent<MeasurementOpenReferenceBetaTorsoWorkerResponseV1>) => {
      const response = event.data;
      try {
        performance.measure(MEASUREMENT_OPEN_REFERENCE_BETA_TORSO_WORKER_MEASURE_V1, {
          start: startedAt,
          end: performance.now(),
          detail: Object.freeze({ workerDurationMs: response.durationMs }),
        });
      } catch {
        // Timing evidence is diagnostic only.
      }
      if (response.type === 'result') finish(() => resolve(response.value));
      else finish(() => reject(new Error(response.message)));
    };
    worker.onerror = (event) =>
      finish(() => reject(new Error((event as ErrorEvent).message || 'beta torso worker error')));
    options.signal?.addEventListener('abort', abort, { once: true });
    const [request, transfer] = transferableRequest(options);
    worker.postMessage(request, transfer);
  });
}
