/// <reference lib="webworker" />

import { loadMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import {
  loadFemaleBustBundleForTorsoV1,
  solveMeasurementOpenReferenceBetaTorsoV1,
} from './measurement-open-reference-beta-torso-worker-v1';
import { loadMakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';

const context = self as DedicatedWorkerGlobalScope;

context.onmessage = async (
  event: MessageEvent<MeasurementOpenReferenceBetaTorsoWorkerRequestV1>,
) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    if (request.type !== 'solve') throw new Error('Unsupported beta torso worker request.');
    const [basis, torsoBundle, femaleBust] = await Promise.all([
      loadMakeHumanOpenReferenceBasisV1(request.options.basisKind),
      loadMakeHumanTorsoShapeDeltaBundleV1(),
      request.options.basisKind === 'female' ? loadFemaleBustBundleForTorsoV1() : undefined,
    ]);
    const value = solveMeasurementOpenReferenceBetaTorsoV1({
      ...femaleBust,
      basis,
      sourcePositionsM: request.options.sourcePositionsM,
      triangleIndices: request.options.triangleIndices,
      measurements: request.options.measurements,
      highHipCircumferenceMm: request.options.highHipCircumferenceMm,
      neckCircumferenceMm: request.options.neckCircumferenceMm,
      neckRigHeads: request.options.neckRigHeads,
      neckPose: request.options.neckPose,
      underBustBoundedPlane: request.options.underBustBoundedPlane,
      torsoBundle,
    });
    const response: MeasurementOpenReferenceBetaTorsoWorkerResponseV1 = {
      id: request.id,
      type: 'result',
      value,
      durationMs: performance.now() - startedAt,
    };
    // Listing one buffer twice throws DataCloneError, so each snapshot is added only when distinct.
    const transfer = [
      ...new Set(
        [value.positionsM, value.positionsBeforeHighHipM, value.positionsBeforeNeckM]
          .filter((positions): positions is Float32Array => positions != null)
          .map((positions) => positions.buffer as ArrayBuffer),
      ),
    ] as Transferable[];
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
