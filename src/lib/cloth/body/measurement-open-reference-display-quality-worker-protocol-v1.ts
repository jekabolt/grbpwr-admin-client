import type {
  MeasurementOpenReferenceDisplayQualityGateResultV1,
  MeasurementOpenReferenceDisplayQualityPolicyV1,
} from './measurement-open-reference-display-quality-gate-v1';
import type { MeasurementSurfaceSelfIntersectionPolicyV1 } from './measurement-surface-self-intersection-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_WORKER_V1 =
  'measurement-open-reference-display-quality-worker/v1' as const;

export interface MeasurementOpenReferenceDisplayQualityWorkerOptionsV1 {
  readonly uniformPositionsM: Float32Array;
  readonly personalizedPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly policy?: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1>;
  readonly selfIntersectionPolicy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  readonly admittedBasisRevision?: string;
}

export type MeasurementOpenReferenceDisplayQualityWorkerRequestV1 = Readonly<{
  id: number;
  type: 'evaluate';
  options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1;
}>;

export type MeasurementOpenReferenceDisplayQualityWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      result: MeasurementOpenReferenceDisplayQualityGateResultV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;
