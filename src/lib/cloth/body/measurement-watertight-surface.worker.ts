import { createMeasurementWatertightSurfaceV1 } from './measurement-watertight-surface-v1';
import type {
  MeasurementWatertightSurfaceWorkerRequestV1,
  MeasurementWatertightSurfaceWorkerResponseV1,
} from './measurement-watertight-surface-worker-v1';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeasurementWatertightSurfaceWorkerRequestV1>) => void) | null;
  postMessage: (
    response: MeasurementWatertightSurfaceWorkerResponseV1,
    transfer?: Transferable[],
  ) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const artifact = createMeasurementWatertightSurfaceV1(request.options);
    scope.postMessage(
      {
        id: request.id,
        type: 'result',
        artifact,
        durationMs: performance.now() - startedAt,
      },
      [
        artifact.lods.display.mesh.positions.buffer,
        artifact.lods.display.mesh.indices.buffer,
        artifact.lods.collisionCandidate.mesh.positions.buffer,
        artifact.lods.collisionCandidate.mesh.indices.buffer,
      ],
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
