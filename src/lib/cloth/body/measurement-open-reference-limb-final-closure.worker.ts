import {
  compileOpenReferenceLimbFinalClosureContextV1,
  solveOpenReferenceLimbFinalClosureV1,
} from './measurement-open-reference-limb-final-closure-v1';
import type {
  MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1,
} from './measurement-open-reference-limb-final-closure-worker-protocol-v1';

const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1>) => void)
    | null;
  postMessage: (
    response: MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1,
    transfer?: Transferable[],
  ) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const compiledContext = compileOpenReferenceLimbFinalClosureContextV1({
      waistHipPositionsM: request.options.waistHipPositionsM,
      triangleIndices: request.options.triangleIndices,
      limbModes: request.options.limbModes,
      torsoModes: request.options.torsoModes,
      measurementKeys: request.options.measurementKeys,
      coefficientEnvelope: request.options.coefficientEnvelope,
    });
    const result = solveOpenReferenceLimbFinalClosureV1({
      uniformPositionsM: request.options.uniformPositionsM,
      waistHipPositionsM: request.options.waistHipPositionsM,
      triangleIndices: request.options.triangleIndices,
      measurements: request.options.measurements,
      limbModes: request.options.limbModes,
      torsoModes: request.options.torsoModes,
      compiledContext,
      binarySearchIterations: request.options.binarySearchIterations,
    });
    scope.postMessage(
      {
        id: request.id,
        type: 'result',
        value: { result, contentRevision: compiledContext.contentRevision },
        durationMs: performance.now() - startedAt,
      },
      [result.positionsM.buffer],
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
