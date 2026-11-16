import { describe, expect, it } from 'vitest';

import type {
  MakeHumanLocalJointVec3V3,
  MakeHumanLocalJointMatrix3V3,
  MakeHumanPosedLocalBoneOverlayV4,
} from './makehuman-local-joint-frame-research-v3';
import { evaluateMakeHumanLivePoseAdmissibilityV1 } from './makehuman-live-pose-admissibility-v1';

const IDENTITY: MakeHumanLocalJointMatrix3V3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const BASELINE_ANKLES = Object.freeze({ left: point(0.12, 0.1), right: point(-0.12, 0.1) });

function point(x: number, y: number, z = 0): MakeHumanLocalJointVec3V3 {
  return Object.freeze([x, y, z] as const);
}

function bone(
  name: string,
  headM: MakeHumanLocalJointVec3V3,
  tailM: MakeHumanLocalJointVec3V3,
  localToWorld: MakeHumanLocalJointMatrix3V3 = IDENTITY,
): MakeHumanPosedLocalBoneOverlayV4 {
  return Object.freeze({ bone: name, headM, tailM, localToWorld });
}

function skeleton(
  overrides: Readonly<
    Record<string, readonly [MakeHumanLocalJointVec3V3, MakeHumanLocalJointVec3V3]>
  > = {},
) {
  const definitions = {
    spine01: [point(0, 0.85), point(0, 1.05)],
    spine05: [point(0, 1.45), point(0, 1.7)],
    'upperarm01.L': [point(0.24, 1.6), point(0.42, 1.35)],
    'upperarm02.L': [point(0.33, 1.48), point(0.42, 1.35)],
    'lowerarm01.L': [point(0.42, 1.35), point(0.52, 1.08)],
    'wrist.L': [point(0.52, 1.08), point(0.54, 1)],
    'upperarm01.R': [point(-0.24, 1.6), point(-0.42, 1.35)],
    'upperarm02.R': [point(-0.33, 1.48), point(-0.42, 1.35)],
    'lowerarm01.R': [point(-0.42, 1.35), point(-0.52, 1.08)],
    'wrist.R': [point(-0.52, 1.08), point(-0.54, 1)],
    'upperleg01.L': [point(0.12, 0.88), point(0.12, 0.5)],
    'upperleg02.L': [point(0.12, 0.69), point(0.12, 0.5)],
    'lowerleg01.L': [point(0.12, 0.5), point(0.12, 0.1)],
    'foot.L': [point(0.12, 0.1), point(0.12, 0)],
    'upperleg01.R': [point(-0.12, 0.88), point(-0.12, 0.5)],
    'upperleg02.R': [point(-0.12, 0.69), point(-0.12, 0.5)],
    'lowerleg01.R': [point(-0.12, 0.5), point(-0.12, 0.1)],
    'foot.R': [point(-0.12, 0.1), point(-0.12, 0)],
  } satisfies Record<string, readonly [MakeHumanLocalJointVec3V3, MakeHumanLocalJointVec3V3]>;
  return Object.entries(definitions).map(([name, segment]) =>
    bone(name, ...(overrides[name] ?? segment)),
  );
}

describe('MakeHuman live pose admissibility v1', () => {
  it('admits a grounded non-overlapping full-body skeleton', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton(),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.ground).toMatchObject({ leftSupported: true, rightSupported: true });
    expect(result.claims.meshCollisionEvaluated).toBe(false);
  });

  it('blocks a hand/forearm entering the torso capsule', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'lowerarm01.L': [point(0.13, 1.35), point(0.02, 1.1)],
        'wrist.L': [point(0.02, 1.1), point(0, 1.02)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toContain('left-arm-overlap');
    expect(result.contacts.some(({ obstacleKind }) => obstacleKind === 'torso')).toBe(true);
  });

  it('blocks crossed forearms while leaving the torso envelope clear', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'lowerarm01.L': [point(0.42, 1.35, 0.3), point(0, 1.2, 0.3)],
        'wrist.L': [point(0, 1.2, 0.3), point(-0.18, 1.18, 0.3)],
        'lowerarm01.R': [point(-0.42, 1.35, 0.3), point(0, 1.2, 0.3)],
        'wrist.R': [point(0, 1.2, 0.3), point(0.18, 1.18, 0.3)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining(['left-arm-overlap', 'right-arm-overlap']),
    );
    expect(result.contacts.some(({ obstacleKind }) => obstacleKind === 'opposite-limb')).toBe(true);
  });

  it('blocks crossed lower legs without requiring an aerial or below-ground failure', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'lowerleg01.L': [point(0.16, 0.5, 0.25), point(-0.12, 0.1, 0.25)],
        'foot.L': [point(-0.12, 0.1, 0.25), point(-0.12, 0, 0.25)],
        'lowerleg01.R': [point(-0.16, 0.5, 0.25), point(0.12, 0.1, 0.25)],
        'foot.R': [point(0.12, 0.1, 0.25), point(0.12, 0, 0.25)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining(['left-leg-overlap', 'right-leg-overlap']),
    );
    expect(result.blockers).not.toContain('no-grounded-foot');
    expect(result.blockers).not.toContain('foot-below-ground');
    expect(result.contacts.some(({ obstacleKind }) => obstacleKind === 'opposite-limb')).toBe(true);
  });

  it.each([
    [
      'thigh',
      'left-cross-left-upper-leg',
      [point(0.42, 1.35), point(0.24, 0.92)],
      [point(0.24, 0.92), point(0.12, 0.68)],
    ],
    [
      'lower leg',
      'left-cross-left-lower-leg',
      [point(0.42, 1.35), point(0.12, 0.35)],
      [point(0.12, 0.35), point(0.12, 0.25)],
    ],
    [
      'foot',
      'left-cross-left-foot',
      [point(0.42, 1.35), point(0.2, 0.15)],
      [point(0.2, 0.15), point(0.12, 0.05)],
    ],
  ] as const)(
    'blocks a hand and forearm passing through the %s',
    (_label, obstacleId, lowerarm, wrist) => {
      const result = evaluateMakeHumanLivePoseAdmissibilityV1({
        bones: skeleton({
          'lowerarm01.L': lowerarm,
          'wrist.L': wrist,
        }),
        neutralBones: skeleton(),
        groundReferenceM: 0,
        baselineAnklesM: BASELINE_ANKLES,
      });

      expect(result.admissible).toBe(false);
      expect(result.blockers).toContain('left-arm-overlap');
      expect(result.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            obstacleId,
            obstacleKind: 'opposite-limb',
          }),
        ]),
      );
      expect(result.claims.meshCollisionEvaluated).toBe(false);
      expect(result.claims.clinicalAnatomicalRangeAuthority).toBe(false);
    },
  );

  it('blocks a lower leg and foot passing through an arm', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'lowerleg01.L': [point(0.12, 0.5), point(0.5, 1.09)],
        'foot.L': [point(0.5, 1.09), point(0.54, 1.02)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toContain('left-leg-overlap');
    expect(result.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obstacleId: 'left-cross-left-lower-arm',
          obstacleKind: 'opposite-limb',
        }),
      ]),
    );
  });

  it('admits arms at the sides with the hand close to, but outside, the thigh envelope', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'upperarm01.L': [point(0.24, 1.6), point(0.3, 1.32)],
        'upperarm02.L': [point(0.27, 1.46), point(0.3, 1.32)],
        'lowerarm01.L': [point(0.3, 1.32), point(0.29, 0.98)],
        'wrist.L': [point(0.29, 0.98), point(0.27, 0.88)],
        'upperarm01.R': [point(-0.24, 1.6), point(-0.3, 1.32)],
        'upperarm02.R': [point(-0.27, 1.46), point(-0.3, 1.32)],
        'lowerarm01.R': [point(-0.3, 1.32), point(-0.29, 0.98)],
        'wrist.R': [point(-0.29, 0.98), point(-0.27, 0.88)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.contacts).toEqual([]);
  });

  it.each([
    ['negative-depth', -0.13],
    ['positive-depth', 0.13],
  ] as const)(
    'blocks a hand entering the %s back/front flank envelope while the forearm stays outside',
    (_label, depthM) => {
      const result = evaluateMakeHumanLivePoseAdmissibilityV1({
        bones: skeleton({
          'lowerarm01.L': [point(0.42, 1.35, depthM), point(0.24, 1.18, depthM)],
          'wrist.L': [point(0.24, 1.18, depthM), point(0.08, 1.18, depthM)],
        }),
        neutralBones: skeleton(),
        groundReferenceM: 0,
        baselineAnklesM: BASELINE_ANKLES,
      });

      expect(result.admissible).toBe(false);
      expect(result.blockers).toContain('left-arm-overlap');
      expect(result.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ obstacleKind: 'torso', activeSegment: 'terminal' }),
        ]),
      );
      expect(result.contacts.some(({ activeSegment }) => activeSegment === 'lower')).toBe(false);
    },
  );

  it('admits one lifted foot while the opposite foot remains grounded', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'lowerleg01.L': [point(0.2, 0.55), point(0.28, 0.35)],
        'foot.L': [point(0.28, 0.35), point(0.32, 0.3)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(true);
    expect(result.ground).toMatchObject({ leftSupported: false, rightSupported: true });
  });

  it('rejects the unsupported aerial split shown by the direct-pose regression', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'upperleg01.L': [point(0.12, 0.88), point(0.38, 0.55)],
        'lowerleg01.L': [point(0.38, 0.55), point(0.62, 0.3)],
        'foot.L': [point(0.62, 0.3), point(0.7, 0.25)],
        'upperleg01.R': [point(-0.12, 0.88), point(-0.38, 0.55)],
        'lowerleg01.R': [point(-0.38, 0.55), point(-0.62, 0.3)],
        'foot.R': [point(-0.62, 0.3), point(-0.7, 0.25)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toContain('no-grounded-foot');
  });

  it('rejects a foot passing below the ground plane', () => {
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones: skeleton({
        'foot.L': [point(0.12, 0.04), point(0.12, -0.08)],
      }),
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.admissible).toBe(false);
    expect(result.blockers).toContain('foot-below-ground');
  });

  it('rejects a backward/off-plane elbow delta that capsule clearance alone cannot see', () => {
    const wrongPlane = Object.freeze([
      1,
      0,
      0,
      0,
      0.5,
      -Math.sqrt(0.75),
      0,
      Math.sqrt(0.75),
      0.5,
    ] as const);
    const bones = skeleton().map((candidate) =>
      candidate.bone === 'lowerarm01.L'
        ? bone(candidate.bone, candidate.headM, candidate.tailM, wrongPlane)
        : candidate,
    );
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones,
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.blockers).toContain('left-elbow-direction');
    const hinge = result.hinges.find(({ id }) => id === 'left-elbow')!;
    expect(hinge.signedBendDeg).toBeCloseTo(0, 10);
    expect(hinge.offPlaneDeg).toBeCloseTo(60, 10);
    expect(hinge.admissible).toBe(false);
  });

  it('rejects elbow rotation in the posterior direction past neutral', () => {
    const angle = Math.PI / 3;
    const posterior = Object.freeze([
      Math.cos(angle),
      -Math.sin(angle),
      0,
      Math.sin(angle),
      Math.cos(angle),
      0,
      0,
      0,
      1,
    ] as const);
    const bones = skeleton().map((candidate) =>
      candidate.bone === 'lowerarm01.L'
        ? bone(candidate.bone, candidate.headM, candidate.tailM, posterior)
        : candidate,
    );
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones,
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.blockers).toContain('left-elbow-direction');
    const hinge = result.hinges.find(({ id }) => id === 'left-elbow')!;
    expect(hinge.signedBendDeg).toBeCloseTo(-60, 10);
    expect(hinge.offPlaneDeg).toBeCloseTo(0, 10);
    expect(hinge.admissible).toBe(false);
  });

  it('admits semantic flex on negative local Z after removing a rotated parent frame', () => {
    const angle = Math.PI / 3;
    const flex = Object.freeze([
      Math.cos(angle),
      Math.sin(angle),
      0,
      -Math.sin(angle),
      Math.cos(angle),
      0,
      0,
      0,
      1,
    ] as const);
    const parent = Object.freeze([0, 0, 1, 0, 1, 0, -1, 0, 0] as const);
    const posedJoint = Object.freeze([
      parent[0] * flex[0] + parent[1] * flex[3] + parent[2] * flex[6],
      parent[0] * flex[1] + parent[1] * flex[4] + parent[2] * flex[7],
      parent[0] * flex[2] + parent[1] * flex[5] + parent[2] * flex[8],
      parent[3] * flex[0] + parent[4] * flex[3] + parent[5] * flex[6],
      parent[3] * flex[1] + parent[4] * flex[4] + parent[5] * flex[7],
      parent[3] * flex[2] + parent[4] * flex[5] + parent[5] * flex[8],
      parent[6] * flex[0] + parent[7] * flex[3] + parent[8] * flex[6],
      parent[6] * flex[1] + parent[7] * flex[4] + parent[8] * flex[7],
      parent[6] * flex[2] + parent[7] * flex[5] + parent[8] * flex[8],
    ] as const);
    const bones = skeleton().map((candidate) => {
      if (candidate.bone === 'upperarm02.L') {
        return bone(candidate.bone, candidate.headM, candidate.tailM, parent);
      }
      if (candidate.bone === 'lowerarm01.L') {
        return bone(candidate.bone, candidate.headM, candidate.tailM, posedJoint);
      }
      return candidate;
    });
    const result = evaluateMakeHumanLivePoseAdmissibilityV1({
      bones,
      neutralBones: skeleton(),
      groundReferenceM: 0,
      baselineAnklesM: BASELINE_ANKLES,
    });

    expect(result.blockers).not.toContain('left-elbow-direction');
    const hinge = result.hinges.find(({ id }) => id === 'left-elbow')!;
    expect(hinge.signedBendDeg).toBeCloseTo(60, 10);
    expect(hinge.offPlaneDeg).toBeCloseTo(0, 10);
    expect(hinge.admissible).toBe(true);
  });
});
