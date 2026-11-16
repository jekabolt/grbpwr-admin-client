import type { BodyPoseKind } from './contracts';
import type {
  MeasurementOpenReferenceKneeProxyPolicyV1,
  MeasurementOpenReferenceKneeProxyResultV1,
  MeasurementOpenReferenceKneeProxyStationV1,
} from './measurement-open-reference-knee-proxy-v1';

export interface MeasurementOpenReferenceKneeProxyWorkerOptionsV1 {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly pose: BodyPoseKind;
  readonly targetMm: number;
  readonly stations: readonly [
    MeasurementOpenReferenceKneeProxyStationV1,
    MeasurementOpenReferenceKneeProxyStationV1,
  ];
  readonly policy?: Partial<MeasurementOpenReferenceKneeProxyPolicyV1>;
}

export type MeasurementOpenReferenceKneeProxyWorkerRequestV1 = Readonly<{
  id: number;
  type: 'solve';
  options: MeasurementOpenReferenceKneeProxyWorkerOptionsV1;
}>;

export type MeasurementOpenReferenceKneeProxyWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      value: MeasurementOpenReferenceKneeProxyResultV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;
