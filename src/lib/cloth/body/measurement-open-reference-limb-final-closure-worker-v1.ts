import {
  compileOpenReferenceLimbFinalClosureContextV1,
  solveOpenReferenceLimbFinalClosureV1,
} from './measurement-open-reference-limb-final-closure-v1';
import type {
  MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResultV1,
} from './measurement-open-reference-limb-final-closure-worker-protocol-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_WORKER_MEASURE_V1 =
  'measurement-open-reference-limb-final-closure-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function synchronousSolve(
  options: MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
): MeasurementOpenReferenceLimbFinalClosureWorkerResultV1 {
  const compiledContext = compileOpenReferenceLimbFinalClosureContextV1({
    waistHipPositionsM: options.waistHipPositionsM,
    triangleIndices: options.triangleIndices,
    limbModes: options.limbModes,
    torsoModes: options.torsoModes,
    measurementKeys: options.measurementKeys,
    coefficientEnvelope: options.coefficientEnvelope,
  });
  return Object.freeze({
    result: solveOpenReferenceLimbFinalClosureV1({
      uniformPositionsM: options.uniformPositionsM,
      waistHipPositionsM: options.waistHipPositionsM,
      triangleIndices: options.triangleIndices,
      measurements: options.measurements,
      limbModes: options.limbModes,
      torsoModes: options.torsoModes,
      compiledContext,
      binarySearchIterations: options.binarySearchIterations,
    }),
    contentRevision: compiledContext.contentRevision,
  });
}

export function solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1(
  options: MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
  signal?: AbortSignal,
  createWorker: WorkerFactoryV1 = () =>
    new Worker(
      new URL('./measurement-open-reference-limb-final-closure.worker.ts', import.meta.url),
      { type: 'module' },
    ),
): Promise<MeasurementOpenReferenceLimbFinalClosureWorkerResultV1> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') return Promise.resolve(synchronousSolve(options));

  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const startedAt = performance.now();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const abort = () => finish(() => reject(abortError()));
    worker.onmessage = (
      event: MessageEvent<MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1>,
    ) => {
      if (settled) return;
      const response = event.data;
      try {
        performance.measure(MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_WORKER_MEASURE_V1, {
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
      finish(() => reject(new Error((event as ErrorEvent).message || 'limb closure worker error')));
    signal?.addEventListener('abort', abort, { once: true });
    const request: MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1 = {
      id: 1,
      type: 'solve',
      options,
    };
    worker.postMessage(request);
  });
}
