import type { UniformWaistHipModeV1 } from './makehuman-uniform-waist-hip-modes-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type {
  OpenReferenceLimbCoefficientEnvelopeV1,
  OpenReferenceLimbFinalClosureResultV1,
} from './measurement-open-reference-limb-final-closure-v1';
import type {
  OpenReferenceLimbCircumferenceKeyV1,
  OpenReferenceLimbCircumferenceModeV1,
} from './measurement-open-reference-limb-circumference-solver-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_WORKER_V1 =
  'measurement-open-reference-limb-final-closure-worker/v1' as const;

export interface MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1 {
  readonly uniformPositionsM: Float32Array;
  readonly waistHipPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoModes: readonly UniformWaistHipModeV1[];
  readonly measurementKeys: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly coefficientEnvelope: Readonly<
    Record<OpenReferenceLimbCircumferenceKeyV1, OpenReferenceLimbCoefficientEnvelopeV1>
  >;
  readonly binarySearchIterations: number;
}

export interface MeasurementOpenReferenceLimbFinalClosureWorkerResultV1 {
  readonly result: OpenReferenceLimbFinalClosureResultV1;
  readonly contentRevision: string;
}

export type MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1 = Readonly<{
  id: number;
  type: 'solve';
  options: MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1;
}>;

export type MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      value: MeasurementOpenReferenceLimbFinalClosureWorkerResultV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;
