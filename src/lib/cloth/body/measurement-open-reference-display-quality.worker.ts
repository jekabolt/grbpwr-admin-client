import { announceWorkerReady } from 'lib/worker-load';

import { evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1 } from './measurement-open-reference-display-quality-gate-v1';
import type {
  MeasurementOpenReferenceDisplayQualityWorkerRequestV1,
  MeasurementOpenReferenceDisplayQualityWorkerResponseV1,
} from './measurement-open-reference-display-quality-worker-protocol-v1';

const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceDisplayQualityWorkerRequestV1>) => void)
    | null;
  postMessage: (response: MeasurementOpenReferenceDisplayQualityWorkerResponseV1) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const result = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1(
      request.options,
    );
    scope.postMessage({
      id: request.id,
      type: 'result',
      result,
      durationMs: performance.now() - startedAt,
    });
  } catch (reason: unknown) {
    scope.postMessage({
      id: request.id,
      type: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
      durationMs: performance.now() - startedAt,
    });
  }
};

announceWorkerReady();
