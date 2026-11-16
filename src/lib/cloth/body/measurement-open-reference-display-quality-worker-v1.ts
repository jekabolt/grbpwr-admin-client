import { workerLoadFailed } from 'lib/stale-reload';
import { classifyWorkerError, WORKER_READY } from 'lib/worker-load';

import {
  evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1,
  measurementOpenReferenceDisplayQualitySelfIntersectionFailureV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import type {
  MeasurementOpenReferenceDisplayQualityWorkerOptionsV1,
  MeasurementOpenReferenceDisplayQualityWorkerRequestV1,
  MeasurementOpenReferenceDisplayQualityWorkerResponseV1,
} from './measurement-open-reference-display-quality-worker-protocol-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_WORKER_MEASURE_V1 =
  'measurement-open-reference-display-quality-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

interface PendingEvaluationV1 {
  readonly options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1;
  readonly startedAt: number;
  readonly resolve: (result: MeasurementOpenReferenceDisplayQualityGateResultV1) => void;
  readonly reject: (reason: Error) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function abortedError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function transferableRequest(
  id: number,
  options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1,
): readonly [MeasurementOpenReferenceDisplayQualityWorkerRequestV1, Transferable[]] {
  const uniformPositionsM = options.uniformPositionsM.slice();
  const personalizedPositionsM = options.personalizedPositionsM.slice();
  const triangleIndices = options.triangleIndices.slice();
  return [
    {
      id,
      type: 'evaluate',
      options: {
        ...options,
        uniformPositionsM,
        personalizedPositionsM,
        triangleIndices,
      },
    },
    [uniformPositionsM.buffer, personalizedPositionsM.buffer, triangleIndices.buffer],
  ];
}

function recordTiming(startedAt: number, completedAt: number, workerDurationMs: number): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
  try {
    performance.measure(MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_WORKER_MEASURE_V1, {
      start: startedAt,
      end: completedAt,
      detail: Object.freeze({ workerDurationMs }),
    });
  } catch {
    // Timing evidence is diagnostic only; it must never change the gate result.
  }
}

export class MeasurementOpenReferenceDisplayQualityWorkerClientV1 {
  private worker: Worker | null = null;
  private nextId = 1;
  private ran = false;
  private loadRetried = false;
  private readonly pending = new Map<number, PendingEvaluationV1>();

  constructor(
    private readonly createWorker: WorkerFactoryV1 = () =>
      new Worker(
        new URL('./measurement-open-reference-display-quality.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      ),
  ) {}

  private cleanup(id: number, pending: PendingEvaluationV1): void {
    pending.signal?.removeEventListener('abort', pending.abort);
    this.pending.delete(id);
  }

  private post(worker: Worker, id: number, pending: PendingEvaluationV1): void {
    const [request, transfer] = transferableRequest(id, pending.options);
    worker.postMessage(request, transfer);
  }

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.ran = false;
    worker.onmessage = (
      event: MessageEvent<MeasurementOpenReferenceDisplayQualityWorkerResponseV1 | string>,
    ) => {
      if (event.data === WORKER_READY) {
        this.ran = true;
        this.loadRetried = false;
        return;
      }
      this.ran = true;
      this.loadRetried = false;
      const response = event.data as MeasurementOpenReferenceDisplayQualityWorkerResponseV1;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.cleanup(response.id, pending);
      recordTiming(pending.startedAt, now(), response.durationMs);
      if (response.type === 'result') pending.resolve(response.result);
      else pending.reject(new Error(response.message));
    };
    worker.onerror = (event) => {
      const failure = classifyWorkerError(event, this.ran, this.loadRetried);
      if (failure === 'retry') {
        this.loadRetried = true;
        worker.terminate();
        this.worker = null;
        const replacement = this.spawn();
        for (const [id, pending] of this.pending) this.post(replacement, id, pending);
        return;
      }
      const reason =
        failure === 'load'
          ? workerLoadFailed()
          : new Error((event as ErrorEvent).message || 'quality worker error');
      this.fail(reason);
    };
    this.worker = worker;
    return worker;
  }

  evaluate(
    options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1,
    signal?: AbortSignal,
  ): Promise<MeasurementOpenReferenceDisplayQualityGateResultV1> {
    if (signal?.aborted) return Promise.reject(abortedError());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const pending: PendingEvaluationV1 = {
        options,
        startedAt: now(),
        resolve,
        reject,
        signal,
        abort: () => {
          const active = this.pending.get(id);
          if (!active) return;
          this.cleanup(id, active);
          reject(abortedError());
        },
      };
      this.pending.set(id, pending);
      signal?.addEventListener('abort', pending.abort, { once: true });
      this.post(this.spawn(), id, pending);
    });
  }

  fail(reason: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.ran = false;
    for (const [id, pending] of this.pending) {
      this.cleanup(id, pending);
      pending.reject(reason);
    }
  }

  terminate(): void {
    this.fail(new Error('quality worker terminated'));
  }
}

let defaultClient: MeasurementOpenReferenceDisplayQualityWorkerClientV1 | null = null;

export async function evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1(
  options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1 & {
    readonly signal?: AbortSignal;
  },
  client?: MeasurementOpenReferenceDisplayQualityWorkerClientV1,
): Promise<MeasurementOpenReferenceDisplayQualityGateResultV1> {
  const { signal, ...qualityOptions } = options;
  if (typeof Worker === 'undefined') {
    return evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1(qualityOptions);
  }
  try {
    defaultClient ??= new MeasurementOpenReferenceDisplayQualityWorkerClientV1();
    return await (client ?? defaultClient).evaluate(qualityOptions, signal);
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    return measurementOpenReferenceDisplayQualitySelfIntersectionFailureV1(qualityOptions);
  }
}
