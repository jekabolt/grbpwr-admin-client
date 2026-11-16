import {
  solveMeasurementOpenReferenceKneeProxyV1,
  type MeasurementOpenReferenceKneeProxyResultV1,
} from './measurement-open-reference-knee-proxy-v1';
import type {
  MeasurementOpenReferenceKneeProxyWorkerOptionsV1,
  MeasurementOpenReferenceKneeProxyWorkerRequestV1,
  MeasurementOpenReferenceKneeProxyWorkerResponseV1,
} from './measurement-open-reference-knee-proxy-worker-protocol-v1';

export const MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_WORKER_MEASURE_V1 =
  'measurement-open-reference-knee-proxy-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Runs the pure knee proxy off the main thread: a single solve costs several hundred ms on the
 * real bases, which would otherwise freeze typing. Without `Worker` (node tests) it runs inline.
 */
export function solveMeasurementOpenReferenceKneeProxyInWorkerV1(
  options: MeasurementOpenReferenceKneeProxyWorkerOptionsV1,
  signal?: AbortSignal,
  createWorker: WorkerFactoryV1 = () =>
    new Worker(new URL('./measurement-open-reference-knee-proxy.worker.ts', import.meta.url), {
      type: 'module',
    }),
): Promise<MeasurementOpenReferenceKneeProxyResultV1> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') {
    try {
      return Promise.resolve(solveMeasurementOpenReferenceKneeProxyV1(options));
    } catch (reason: unknown) {
      return Promise.reject(reason);
    }
  }

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
    worker.onmessage = (event: MessageEvent<MeasurementOpenReferenceKneeProxyWorkerResponseV1>) => {
      if (settled) return;
      const response = event.data;
      try {
        performance.measure(MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_WORKER_MEASURE_V1, {
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
      finish(() => reject(new Error((event as ErrorEvent).message || 'knee proxy worker error')));
    signal?.addEventListener('abort', abort, { once: true });
    // The caller keeps its display positions; the worker owns a transferred copy.
    const positionsM = options.positionsM.slice();
    const request: MeasurementOpenReferenceKneeProxyWorkerRequestV1 = {
      id: 1,
      type: 'solve',
      options: { ...options, positionsM },
    };
    worker.postMessage(request, [positionsM.buffer]);
  });
}
