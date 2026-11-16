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
import { solveMeasurementOpenReferenceHighHipProxyV1 } from './measurement-open-reference-high-hip-proxy-v1';
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

type HighHipWorkerFieldsV1 = Pick<
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
  | 'highHipStatus'
  | 'highHipRepresented'
  | 'highHipLimited'
  | 'highHipStationOriginM'
  | 'highHipModeResult'
  | 'highHipDiagnostics'
>;

const UNREQUESTED_HIGH_HIP_V1: HighHipWorkerFieldsV1 = Object.freeze({
  highHipStatus: 'unrequested' as const,
  highHipRepresented: false,
  highHipLimited: false,
  highHipDiagnostics: Object.freeze([]),
});

function highHipNotApplied(message: string): HighHipWorkerFieldsV1 {
  return Object.freeze({
    highHipStatus: 'notApplied' as const,
    highHipRepresented: false,
    highHipLimited: false,
    highHipDiagnostics: Object.freeze([
      Object.freeze({ code: 'section-invalid' as const, message }),
    ]),
  });
}

/** Shared pure torso pipeline used by both the module worker and the synchronous fallback. */
export function solveMeasurementOpenReferenceBetaTorsoV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: MeasurementOpenReferenceBetaTorsoWorkerOptionsV1['measurements'];
  readonly highHipCircumferenceMm?: number;
  readonly torsoBundle: MakeHumanTorsoShapeDeltaBundleV1;
  readonly solveDepthProxy?: typeof solveMeasurementOpenReferenceTorsoDepthProxyV1;
  readonly solveHighHipProxy?: typeof solveMeasurementOpenReferenceHighHipProxyV1;
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
  const chestMode = modes.modes.find(
    ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
  );
  if (!chestMode?.chestStationOriginM) {
    throw new Error('Chest section station is missing.');
  }
  const common = {
    chestStationOriginM: chestMode.chestStationOriginM,
    underBustStationOriginM: modes.underBustStationOriginM,
    ribcageRepresentedMeasurements: ribcage.representedMeasurements,
    ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...ribcage.diagnostics]),
    chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
    chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
    chestShoulderDiagnostics: chestShoulder.diagnostics,
  };
  const depthRequested = [
    options.measurements.chestDepthMm,
    options.measurements.waistDepthMm,
    options.measurements.hipDepthMm,
  ].some((value) => value != null);
  const highHipRequested = options.highHipCircumferenceMm != null;
  if (!depthRequested && !highHipRequested) {
    return Object.freeze({
      positionsM: chestShoulder.positionsM,
      ...common,
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
      ...UNREQUESTED_HIGH_HIP_V1,
    });
  }

  let stations:
    | Readonly<{
        shoulderVertices: Readonly<{ negative: number; positive: number }>;
        waistStationOriginM: readonly [number, number, number];
        hipStationOriginM: readonly [number, number, number];
      }>
    | undefined;
  let stationError = 'Torso depth proxy stations are incomplete.';
  try {
    const waistHipModes = createMakeHumanUniformWaistHipModesV1({
      basis: options.basis,
      heightMm: options.measurements.heightMm,
      bundle: torsoBundle,
    });
    const shoulderMode = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
    );
    const waistMode = waistHipModes.modes.find(
      ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
    );
    const hipMode = waistHipModes.modes.find(
      ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
    );
    if (shoulderMode?.shoulderVertices && waistMode && hipMode) {
      stations = Object.freeze({
        shoulderVertices: shoulderMode.shoulderVertices,
        waistStationOriginM: waistMode.stationOriginM,
        hipStationOriginM: hipMode.stationOriginM,
      });
    }
  } catch (reason: unknown) {
    // The depth path keeps its pre-high-hip contract (throw); high hip alone degrades to notApplied.
    if (depthRequested) throw reason;
    stationError = reason instanceof Error ? reason.message : String(reason);
  }
  if (!stations) {
    if (depthRequested) throw new Error(stationError);
    return Object.freeze({
      positionsM: chestShoulder.positionsM,
      ...common,
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
      ...highHipNotApplied(stationError),
    });
  }

  // Order: waist/hip (input) -> ribcage/chest/shoulder -> depth -> high hip.
  const depth = depthRequested
    ? (options.solveDepthProxy ?? solveMeasurementOpenReferenceTorsoDepthProxyV1)({
        sourcePositionsM: chestShoulder.positionsM,
        triangleIndices: options.triangleIndices,
        measurements: options.measurements,
        stations: [
          { measurementKey: 'chestDepthMm', originM: chestMode.chestStationOriginM },
          { measurementKey: 'waistDepthMm', originM: stations.waistStationOriginM },
          { measurementKey: 'hipDepthMm', originM: stations.hipStationOriginM },
        ],
        protectedStationOriginsM: [modes.underBustStationOriginM],
        shoulderVertices: stations.shoulderVertices,
      })
    : undefined;
  const depthFields = {
    depthRepresentedMeasurements: depth?.representedMeasurements ?? Object.freeze([]),
    depthLimitedMeasurements: depth?.limitedMeasurements ?? Object.freeze([]),
    depthModeResults: depth?.modeResults ?? Object.freeze([]),
    depthDiagnostics: depth?.diagnostics ?? Object.freeze([]),
  };
  const afterDepthPositionsM = depth?.positionsM ?? chestShoulder.positionsM;
  if (!highHipRequested) {
    return Object.freeze({
      positionsM: afterDepthPositionsM,
      ...common,
      ...depthFields,
      ...UNREQUESTED_HIGH_HIP_V1,
    });
  }

  let positionsM = afterDepthPositionsM;
  let highHipFields: HighHipWorkerFieldsV1;
  try {
    const highHip = (options.solveHighHipProxy ?? solveMeasurementOpenReferenceHighHipProxyV1)({
      sourcePositionsM: afterDepthPositionsM,
      triangleIndices: options.triangleIndices,
      targetCircumferenceMm: options.highHipCircumferenceMm,
      waistToHighHipMm: options.measurements.waistToHighHipMm,
      waistStationOriginM: stations.waistStationOriginM,
      hipStationOriginM: stations.hipStationOriginM,
      protectedStationOriginsM: [
        modes.underBustStationOriginM,
        ...(depthRequested ? [chestMode.chestStationOriginM] : []),
      ],
      shoulderVertices: stations.shoulderVertices,
    });
    const applied = highHip.status === 'represented' || highHip.status === 'limited';
    if (applied) positionsM = highHip.positionsM;
    highHipFields = Object.freeze({
      highHipStatus: highHip.status,
      highHipRepresented: highHip.status === 'represented',
      highHipLimited: highHip.status === 'limited',
      ...(highHip.station ? { highHipStationOriginM: highHip.station.originM } : {}),
      ...(highHip.modeResult ? { highHipModeResult: highHip.modeResult } : {}),
      highHipDiagnostics: highHip.diagnostics,
    });
  } catch (reason: unknown) {
    // A failing high hip never blanks the preview or rolls back waist/hip/depth.
    highHipFields = highHipNotApplied(reason instanceof Error ? reason.message : String(reason));
  }
  return Object.freeze({
    positionsM,
    ...common,
    ...depthFields,
    ...highHipFields,
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
    ...(options.highHipCircumferenceMm == null
      ? {}
      : { highHipCircumferenceMm: options.highHipCircumferenceMm }),
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
        ...(options.highHipCircumferenceMm == null
          ? {}
          : { highHipCircumferenceMm: options.highHipCircumferenceMm }),
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
