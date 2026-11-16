import type { BodyPoseKind } from './contracts';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  createMeasurementWatertightSurfaceV1,
  type MeasurementWatertightSurfaceArtifactV1,
} from './measurement-watertight-surface-v1';

export const MEASUREMENT_WATERTIGHT_SURFACE_WORKER_MEASURE_V1 =
  'measurement-watertight-surface-worker/v1' as const;

interface MeasurementWatertightSurfaceWorkerOptionsV1 {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose: BodyPoseKind;
}

type MeasurementWatertightSurfaceWorkerRequestV1 = Readonly<{
  id: number;
  type: 'build';
  options: MeasurementWatertightSurfaceWorkerOptionsV1;
}>;

type MeasurementWatertightSurfaceWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      artifact: MeasurementWatertightSurfaceArtifactV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;

type WorkerFactoryV1 = () => Worker;

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function createMeasurementWatertightSurfaceInWorkerV1(
  options: MeasurementWatertightSurfaceWorkerOptionsV1 & { readonly signal?: AbortSignal },
  createWorker: WorkerFactoryV1 = () =>
    new Worker(new URL('./measurement-watertight-surface.worker.ts', import.meta.url), {
      type: 'module',
    }),
): Promise<MeasurementWatertightSurfaceArtifactV1> {
  const { signal, ...surfaceOptions } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') {
    return Promise.resolve(createMeasurementWatertightSurfaceV1(surfaceOptions));
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
    worker.onmessage = (event: MessageEvent<MeasurementWatertightSurfaceWorkerResponseV1>) => {
      if (settled) return;
      const response = event.data;
      try {
        performance.measure(MEASUREMENT_WATERTIGHT_SURFACE_WORKER_MEASURE_V1, {
          start: startedAt,
          end: performance.now(),
          detail: Object.freeze({ workerDurationMs: response.durationMs }),
        });
      } catch {
        // Timing evidence is diagnostic only.
      }
      if (response.type === 'result') finish(() => resolve(response.artifact));
      else finish(() => reject(new Error(response.message)));
    };
    worker.onerror = (event) =>
      finish(() => reject(new Error((event as ErrorEvent).message || 'surface worker error')));
    signal?.addEventListener('abort', abort, { once: true });
    const request: MeasurementWatertightSurfaceWorkerRequestV1 = {
      id: 1,
      type: 'build',
      options: surfaceOptions,
    };
    worker.postMessage(request);
  });
}

export type {
  MeasurementWatertightSurfaceWorkerRequestV1,
  MeasurementWatertightSurfaceWorkerResponseV1,
};
