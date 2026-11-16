/// <reference lib="webworker" />

import { loadMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveMeasurementOpenReferenceBetaTorsoV1 } from './measurement-open-reference-beta-torso-worker-v1';
import { loadMakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';

const context = self as DedicatedWorkerGlobalScope;

context.onmessage = async (
  event: MessageEvent<MeasurementOpenReferenceBetaTorsoWorkerRequestV1>,
) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    if (request.type !== 'solve') throw new Error('Unsupported beta torso worker request.');
    const [basis, torsoBundle] = await Promise.all([
      loadMakeHumanOpenReferenceBasisV1(request.options.basisKind),
      loadMakeHumanTorsoShapeDeltaBundleV1(),
    ]);
    const value = solveMeasurementOpenReferenceBetaTorsoV1({
      basis,
      sourcePositionsM: request.options.sourcePositionsM,
      triangleIndices: request.options.triangleIndices,
      measurements: request.options.measurements,
      highHipCircumferenceMm: request.options.highHipCircumferenceMm,
      torsoBundle,
    });
    const response: MeasurementOpenReferenceBetaTorsoWorkerResponseV1 = {
      id: request.id,
      type: 'result',
      value,
      durationMs: performance.now() - startedAt,
    };
    const transfer: Transferable[] = [value.positionsM.buffer];
    // Listing one buffer twice throws DataCloneError, so the snapshot is added only when distinct.
    if (
      value.positionsBeforeHighHipM &&
      value.positionsBeforeHighHipM.buffer !== value.positionsM.buffer
    ) {
      transfer.push(value.positionsBeforeHighHipM.buffer);
    }
    context.postMessage(response, transfer);
  } catch (reason: unknown) {
    const response: MeasurementOpenReferenceBetaTorsoWorkerResponseV1 = {
      id: request.id,
      type: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
      durationMs: performance.now() - startedAt,
    };
    context.postMessage(response);
  }
};

export {};
