import { solveMeasurementOpenReferenceKneeProxyV1 } from './measurement-open-reference-knee-proxy-v1';
import type {
  MeasurementOpenReferenceKneeProxyWorkerRequestV1,
  MeasurementOpenReferenceKneeProxyWorkerResponseV1,
} from './measurement-open-reference-knee-proxy-worker-protocol-v1';

const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceKneeProxyWorkerRequestV1>) => void)
    | null;
  postMessage: (
    response: MeasurementOpenReferenceKneeProxyWorkerResponseV1,
    transfer?: Transferable[],
  ) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    if (request.type !== 'solve') throw new Error('Unsupported knee proxy worker request.');
    const value = solveMeasurementOpenReferenceKneeProxyV1(request.options);
    scope.postMessage(
      {
        id: request.id,
        type: 'result',
        value,
        durationMs: performance.now() - startedAt,
      },
      [value.positionsM.buffer],
    );
  } catch (reason: unknown) {
    scope.postMessage({
      id: request.id,
      type: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
      durationMs: performance.now() - startedAt,
    });
  }
};
