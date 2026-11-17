import type { MakeHumanLegBodyPartIkControlsV1 } from './makehuman-leg-body-part-ik-v1';
import type { ModelOpenReferenceFullBodyPoseV4 } from './model-open-reference-full-body-pose-contract-v4';

export interface ModelOpenReferenceDirectPoseV9 extends ModelOpenReferenceFullBodyPoseV4 {
  readonly headPitchDeg: number;
  readonly headYawDeg: number;
  readonly headSideDeg: number;
  readonly shoulderProtractionDeg: number;
  readonly shoulderElevationDeg: number;
  readonly shoulderLevelDeg: number;
  readonly legMode: 'linked' | 'independent';
  readonly leftLeg: MakeHumanLegBodyPartIkControlsV1;
  readonly rightLeg: MakeHumanLegBodyPartIkControlsV1;
}
