import type { BodyPoseKind } from './contracts';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { UniformChestShoulderResearchKeyV1 } from './makehuman-uniform-chest-shoulder-modes-research-v1';
import type { MakeHumanOpenReferenceBasisKindV1 } from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceFemaleTorsoBustSummaryV1 } from './measurement-open-reference-female-torso-stage-v1';
import type {
  MeasurementOpenReferenceHighHipDiagnosticV1,
  MeasurementOpenReferenceHighHipModeResultV1,
  MeasurementOpenReferenceHighHipStatusV1,
} from './measurement-open-reference-high-hip-proxy-v1';
import type {
  MeasurementOpenReferenceNeckDiagnosticV1,
  MeasurementOpenReferenceNeckRigHeadsV1,
  MeasurementOpenReferenceNeckStatusV1,
} from './measurement-open-reference-neck-proxy-v1';
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
   * High-hip circumference target (`measurements.highHipCircumferenceMm`, passed explicitly so the
   * fast path stays observable); omitted means the worker keeps its pre-high-hip behaviour.
   */
  readonly highHipCircumferenceMm?: number;
  /**
   * Mid-neck circumference target (`measurements.neckCircumferenceMm`). Runs after high hip and
   * needs `neckRigHeads` (core-rig rest heads, display space); omitted keeps the pre-neck path.
   */
  readonly neckCircumferenceMm?: number;
  readonly neckRigHeads?: MeasurementOpenReferenceNeckRigHeadsV1;
  /** Display pose of the source mesh; the neck proxy is A-pose only (defaults to 'A'). */
  readonly neckPose?: BodyPoseKind;
}

export interface MeasurementOpenReferenceBetaTorsoWorkerResultV1 {
  readonly positionsM: Float32Array;
  /**
   * Present only when high hip moved the mesh: the positions right before it, so the beta runtime
   * can drop high hip alone if the final global gate fails.
   */
  readonly positionsBeforeHighHipM?: Float32Array;
  /**
   * Present only when neck moved the mesh: the positions right before it (after high hip), so the
   * beta runtime can drop neck alone and keep each late stage's own delta separate.
   */
  readonly positionsBeforeNeckM?: Float32Array;
  readonly chestStationOriginM?: readonly [number, number, number];
  readonly underBustStationOriginM?: readonly [number, number, number];
  readonly ribcageRepresentedMeasurements: readonly 'underBustCircumferenceMm'[];
  /** Female bust proxy only: under bust reached its band bound or a cross-talk limit. */
  readonly ribcageLimitedMeasurements?: readonly 'underBustCircumferenceMm'[];
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
  readonly neckStatus: MeasurementOpenReferenceNeckStatusV1;
  readonly neckRepresented: boolean;
  readonly neckLimited: boolean;
  readonly neckBaselineCircumferenceMm?: number;
  readonly neckAchievedCircumferenceMm?: number;
  readonly neckDiagnostics: readonly MeasurementOpenReferenceNeckDiagnosticV1[];
  /** Female basis only: the joint under-bust/chest proxy summary (diagnostic, not a claim). */
  readonly femaleBust?: MeasurementOpenReferenceFemaleTorsoBustSummaryV1;
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
