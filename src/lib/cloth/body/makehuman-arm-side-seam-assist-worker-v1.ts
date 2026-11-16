import type { MakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import {
  createMakeHumanArmSideSeamAssistV1,
  type MakeHumanArmSideSeamAssistResultV1,
} from './makehuman-arm-side-seam-assist-v1';
import type {
  MakeHumanArmSideSeamAssistWorkerOptionsV1,
  MakeHumanArmSideSeamAssistWorkerRequestV1,
  MakeHumanArmSideSeamAssistWorkerResponseV1,
  MakeHumanArmSideSeamAssistWorkerResultV1,
} from './makehuman-arm-side-seam-assist-worker-protocol-v1';

export const MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_WORKER_MEASURE_V1 =
  'makehuman-arm-side-seam-assist-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

export interface MakeHumanArmSideSeamAssistsInWorkerOptionsV1
  extends MakeHumanArmSideSeamAssistWorkerOptionsV1 {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly signal?: AbortSignal;
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function solveSideSeamAssists(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanArmSideSeamAssistWorkerOptionsV1['basisKind'];
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly wristBendDeg?: number;
  readonly minimumOuterHipClearanceRatio?: number;
  readonly maximumVerticalErrorRatio?: number;
}): MakeHumanArmSideSeamAssistWorkerResultV1 {
  const shared = {
    bundle: options.bundle,
    basisKind: options.basisKind,
    heads: options.heads,
    tails: options.tails,
    rollDirections: options.rollDirections,
    wristBendDeg: options.wristBendDeg,
    minimumOuterHipClearanceRatio: options.minimumOuterHipClearanceRatio,
    maximumVerticalErrorRatio: options.maximumVerticalErrorRatio,
  };
  return Object.freeze({
    left: createMakeHumanArmSideSeamAssistV1({ ...shared, side: 'left' }),
    right: createMakeHumanArmSideSeamAssistV1({ ...shared, side: 'right' }),
  });
}

function transferableRequest(
  options: MakeHumanArmSideSeamAssistWorkerOptionsV1,
): readonly [MakeHumanArmSideSeamAssistWorkerRequestV1, Transferable[]] {
  const heads = options.heads.slice();
  const tails = options.tails.slice();
  const rollDirections = options.rollDirections.slice();
  return [
    {
      id: 1,
      type: 'solve',
      options: {
        ...options,
        heads,
        tails,
        rollDirections,
      },
    },
    [heads.buffer, tails.buffer, rollDirections.buffer],
  ];
}

export function createMakeHumanArmSideSeamAssistsInWorkerV1(
  options: MakeHumanArmSideSeamAssistsInWorkerOptionsV1,
  createWorker: WorkerFactoryV1 = () =>
    new Worker(new URL('./makehuman-arm-side-seam-assist.worker.ts', import.meta.url), {
      type: 'module',
    }),
): Promise<MakeHumanArmSideSeamAssistWorkerResultV1> {
  const { bundle, signal, ...workerOptions } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') {
    return Promise.resolve(solveSideSeamAssists({ bundle, ...workerOptions }));
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
    worker.onmessage = (event: MessageEvent<MakeHumanArmSideSeamAssistWorkerResponseV1>) => {
      const response = event.data;
      try {
        performance.measure(MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_WORKER_MEASURE_V1, {
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
      finish(() => reject(new Error((event as ErrorEvent).message || 'side-seam worker error')));
    signal?.addEventListener('abort', abort, { once: true });
    const [request, transfer] = transferableRequest(workerOptions);
    worker.postMessage(request, transfer);
  });
}

export type { MakeHumanArmSideSeamAssistResultV1 };
