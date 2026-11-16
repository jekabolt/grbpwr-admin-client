import type { MakeHumanCoreRigBasisKindV1 } from './makehuman-core-rig-pose-research-v1';
import type { MakeHumanArmSideSeamAssistResultV1 } from './makehuman-arm-side-seam-assist-v1';

export interface MakeHumanArmSideSeamAssistWorkerOptionsV1 {
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly wristBendDeg?: number;
  readonly minimumOuterHipClearanceRatio?: number;
  readonly maximumVerticalErrorRatio?: number;
}

export interface MakeHumanArmSideSeamAssistWorkerResultV1 {
  readonly left: MakeHumanArmSideSeamAssistResultV1;
  readonly right: MakeHumanArmSideSeamAssistResultV1;
}

export type MakeHumanArmSideSeamAssistWorkerRequestV1 = Readonly<{
  id: number;
  type: 'solve';
  options: MakeHumanArmSideSeamAssistWorkerOptionsV1;
}>;

export type MakeHumanArmSideSeamAssistWorkerResponseV1 =
  | Readonly<{
      id: number;
      type: 'result';
      value: MakeHumanArmSideSeamAssistWorkerResultV1;
      durationMs: number;
    }>
  | Readonly<{
      id: number;
      type: 'error';
      message: string;
      durationMs: number;
    }>;
