import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { UniformChestShoulderResearchKeyV1 } from './makehuman-uniform-chest-shoulder-modes-research-v1';
import type { MakeHumanOpenReferenceBasisKindV1 } from './measurement-open-reference-display-v1';

export interface MeasurementOpenReferenceBetaTorsoWorkerOptionsV1 {
  readonly basisKind: MakeHumanOpenReferenceBasisKindV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
}

export interface MeasurementOpenReferenceBetaTorsoWorkerResultV1 {
  readonly positionsM: Float32Array;
  readonly chestStationOriginM?: readonly [number, number, number];
  readonly underBustStationOriginM?: readonly [number, number, number];
  readonly ribcageRepresentedMeasurements: readonly 'underBustCircumferenceMm'[];
  readonly ribcageDiagnostics: readonly string[];
  readonly chestShoulderRepresentedMeasurements: readonly UniformChestShoulderResearchKeyV1[];
  readonly chestShoulderLimitedMeasurements: readonly UniformChestShoulderResearchKeyV1[];
  readonly chestShoulderDiagnostics: readonly string[];
}

export type MeasurementOpenReferenceBetaTorsoWorkerRequestV1 = Readonly<{
  id: number;
  type: 'solve';
  options: MeasurementOpenReferenceBetaTorsoWorkerOptionsV1;
}>;

export type MeasurementOpenReferenceBetaTorsoWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      value: MeasurementOpenReferenceBetaTorsoWorkerResultV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;
