import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import {
  loadMakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaBundleV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerOptionsV1,
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveOpenReferenceChestShoulderResearchV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { type MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import { applyOpenReferenceUnderBustRibcageResearchV1 } from './measurement-open-reference-underbust-ribcage-research-v1';

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

async function solveSynchronously(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
): Promise<MeasurementOpenReferenceBetaTorsoWorkerResultV1> {
  const torsoBundle = await (options.loadTorsoBundle ?? loadMakeHumanTorsoShapeDeltaBundleV1)();
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
  return Object.freeze({
    positionsM: chestShoulder.positionsM,
    ribcageRepresentedMeasurements: ribcage.representedMeasurements,
    ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...ribcage.diagnostics]),
    chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
    chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
    chestShoulderDiagnostics: chestShoulder.diagnostics,
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
