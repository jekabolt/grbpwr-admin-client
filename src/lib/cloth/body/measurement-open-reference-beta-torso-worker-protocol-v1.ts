import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { UniformChestShoulderResearchKeyV1 } from './makehuman-uniform-chest-shoulder-modes-research-v1';
import type { MakeHumanOpenReferenceBasisKindV1 } from './measurement-open-reference-display-v1';
import type {
  MeasurementOpenReferenceHighHipDiagnosticV1,
  MeasurementOpenReferenceHighHipModeResultV1,
  MeasurementOpenReferenceHighHipStatusV1,
} from './measurement-open-reference-high-hip-proxy-v1';
import type {
  MeasurementOpenReferenceTorsoDepthDiagnosticV1,
  MeasurementOpenReferenceTorsoDepthKeyV1,
  MeasurementOpenReferenceTorsoDepthModeResultV1,
} from './measurement-open-reference-torso-depth-proxy-v1';

export interface MeasurementOpenReferenceBetaTorsoWorkerOptionsV1 {
  readonly basisKind: MakeHumanOpenReferenceBasisKindV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  /**
   * High-hip circumference target. Passed separately until the canonical key exists in
   * `CanonicalBodyMeasurementsMm`; omitted means the worker keeps its pre-high-hip behaviour.
   */
  readonly highHipCircumferenceMm?: number;
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
  readonly depthRepresentedMeasurements: readonly MeasurementOpenReferenceTorsoDepthKeyV1[];
  readonly depthLimitedMeasurements: readonly MeasurementOpenReferenceTorsoDepthKeyV1[];
  readonly depthModeResults: readonly MeasurementOpenReferenceTorsoDepthModeResultV1[];
  readonly depthDiagnostics: readonly MeasurementOpenReferenceTorsoDepthDiagnosticV1[];
  readonly highHipStatus: MeasurementOpenReferenceHighHipStatusV1;
  readonly highHipRepresented: boolean;
  readonly highHipLimited: boolean;
  readonly highHipStationOriginM?: readonly [number, number, number];
  readonly highHipModeResult?: MeasurementOpenReferenceHighHipModeResultV1;
  readonly highHipDiagnostics: readonly MeasurementOpenReferenceHighHipDiagnosticV1[];
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
