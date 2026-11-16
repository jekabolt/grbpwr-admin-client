/// <reference lib="webworker" />

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { loadMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveOpenReferenceChestShoulderResearchV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { loadMakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import { applyOpenReferenceUnderBustRibcageResearchV1 } from './measurement-open-reference-underbust-ribcage-research-v1';

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
    const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
      basis,
      measurements: request.options.measurements,
      bundle: torsoBundle,
    });
    const ribcage = applyOpenReferenceUnderBustRibcageResearchV1({
      sourcePositionsM: request.options.sourcePositionsM,
      triangleIndices: request.options.triangleIndices,
      measurements: request.options.measurements,
      stationOriginM: modes.underBustStationOriginM,
    });
    const chestShoulder = solveOpenReferenceChestShoulderResearchV1({
      sourcePositionsM: ribcage.positionsM,
      triangleIndices: request.options.triangleIndices,
      measurements: request.options.measurements,
      modes: modes.modes,
    });
    const chestStationOriginM = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
    )?.chestStationOriginM;
    if (!chestStationOriginM) throw new Error('Chest section station is missing.');
    const value = Object.freeze({
      positionsM: chestShoulder.positionsM,
      chestStationOriginM,
      underBustStationOriginM: modes.underBustStationOriginM,
      ribcageRepresentedMeasurements: ribcage.representedMeasurements,
      ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...ribcage.diagnostics]),
      chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
      chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
      chestShoulderDiagnostics: chestShoulder.diagnostics,
    });
    const response: MeasurementOpenReferenceBetaTorsoWorkerResponseV1 = {
      id: request.id,
      type: 'result',
      value,
      durationMs: performance.now() - startedAt,
    };
    context.postMessage(response, [value.positionsM.buffer]);
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
