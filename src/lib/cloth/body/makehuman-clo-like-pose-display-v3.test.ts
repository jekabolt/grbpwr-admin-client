import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compileMakeHumanCloLikePoseDisplayV3 } from './makehuman-clo-like-pose-display-v3';
import {
  applyMakeHumanElbowBindNeutralizationV1,
  deriveMakeHumanElbowBindNeutralizationV1,
} from './makehuman-elbow-bind-neutralization-v1';
import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { poseMakeHumanCoreRigDisplayOverlayLocalResearchV4 } from './makehuman-local-joint-frame-research-v3';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';

const rigBundle = parseMakeHumanCoreRigBundleV1(
  readFileSync(
    resolve(
      process.cwd(),
      MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigAssetPath,
    ),
  ),
);

function pose(elbowBendDeg: number) {
  return {
    torsoFlexionDeg: 0,
    torsoSideBendDeg: 0,
    torsoTwistDeg: 0,
    symmetry: 'bilateral' as const,
    arm: { shoulderRaiseDeg: 0, shoulderForwardDeg: 0, elbowBendDeg, wristBendDeg: 0 },
  };
}

function physicalBend(
  bones: ReturnType<typeof poseMakeHumanCoreRigDisplayOverlayLocalResearchV4>['bones'],
  side: 'L' | 'R',
) {
  const byName = new Map(bones.map((bone) => [bone.bone, bone]));
  const shoulder = byName.get(`upperarm01.${side}`)!.headM;
  const elbow = byName.get(`lowerarm01.${side}`)!.headM;
  const wrist = byName.get(`wrist.${side}`)!.headM;
  const upper = shoulder.map((value, axis) => value - elbow[axis]);
  const lower = wrist.map((value, axis) => value - elbow[axis]);
  const cosine =
    upper.reduce((sum, value, axis) => sum + value * lower[axis], 0) /
    (Math.hypot(...upper) * Math.hypot(...lower));
  return 180 - (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

describe('MakeHuman authenticated elbow bind neutralization', () => {
  it.each(['base', 'neutral', 'male', 'female'] as const)(
    'maps semantic elbow bend to physical bend on the %s authenticated rig basis',
    (basisKind) => {
      const basis = rigBundle.bases.find(({ kind }) => kind === basisKind)!;
      const neutralization = deriveMakeHumanElbowBindNeutralizationV1({
        bundle: rigBundle,
        basisKind,
        heads: basis.headsSourceUnits,
        tails: basis.tailsSourceUnits,
        rollDirections: basis.rollDirections,
        rigSha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigSha256,
      });
      expect(neutralization.rigSha256).toBe(
        MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigSha256,
      );

      for (const semanticBend of [0, 30, 100] as const) {
        const rotations = applyMakeHumanElbowBindNeutralizationV1(
          compileMakeHumanCloLikePoseDisplayV3(pose(semanticBend)).rotations,
          neutralization,
        );
        const overlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
          bundle: rigBundle,
          basisKind,
          heads: basis.headsSourceUnits,
          tails: basis.tailsSourceUnits,
          rollDirections: basis.rollDirections,
          rotations,
        });
        for (const side of ['L', 'R'] as const) {
          expect(physicalBend(overlay.bones, side)).toBeCloseTo(semanticBend, 1);
        }
      }
    },
  );
});
