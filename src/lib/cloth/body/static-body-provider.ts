import type {
  AxisAlignedBoundingBoxM,
  BodyArtifact,
  BodyInput,
  BodyLandmark,
  BodyPoseKind,
  BodyProvider,
  CapsuleCollider,
  CollisionLod,
  SphereCollider,
  Vec3M,
} from './contracts';
import { assertValidBodyArtifact } from './validation';

export interface StaticBodyDimensionsM {
  readonly height: number;
  readonly shoulderWidth: number;
  readonly hipHalfWidth: number;
  readonly torsoRadius: number;
  readonly pelvisRadius: number;
  readonly headRadius: number;
  readonly neckRadius: number;
  readonly upperArmRadius: number;
  readonly forearmRadius: number;
  readonly thighRadius: number;
  readonly calfRadius: number;
  readonly inseamLength: number;
  readonly upperArmLength: number;
  readonly forearmLength: number;
}

export const DEFAULT_STATIC_BODY_DIMENSIONS_M: StaticBodyDimensionsM = Object.freeze({
  height: 1.72,
  shoulderWidth: 0.42,
  hipHalfWidth: 0.095,
  torsoRadius: 0.17,
  pelvisRadius: 0.16,
  headRadius: 0.105,
  neckRadius: 0.06,
  upperArmRadius: 0.055,
  forearmRadius: 0.045,
  thighRadius: 0.09,
  calfRadius: 0.06,
  inseamLength: 0.82,
  upperArmLength: 0.29,
  forearmLength: 0.27,
});

const POSE_REVISION = 'static-pose-v1';
const LANDMARK_REVISION = 'static-landmarks-v1';
const PROVIDER_REVISION = 'static-analytical-v1';

function validateDimensions(dimensions: StaticBodyDimensionsM): void {
  for (const [name, value] of Object.entries(dimensions)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Static body dimension ${name} must be finite and positive.`);
    }
  }
  if (dimensions.headRadius * 2 >= dimensions.height) {
    throw new RangeError('Static body headRadius must be smaller than half the body height.');
  }
  if (dimensions.inseamLength >= dimensions.height * 0.62) {
    throw new RangeError('Static body inseamLength must be below 62% of body height.');
  }
}

function capsule(id: string, aM: Vec3M, bM: Vec3M, radiusM: number): CapsuleCollider {
  return { id, kind: 'capsule', aM, bM, radiusM };
}

function sphere(id: string, centerM: Vec3M, radiusM: number): SphereCollider {
  return { id, kind: 'sphere', centerM, radiusM };
}

function armPoints(
  side: 'left' | 'right',
  pose: BodyPoseKind,
  d: StaticBodyDimensionsM,
): { shoulder: Vec3M; elbow: Vec3M; wrist: Vec3M } {
  const sign = side === 'left' ? 1 : -1;
  const angle = pose === 'A' ? (35 * Math.PI) / 180 : 0;
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  const shoulder: Vec3M = [sign * (d.shoulderWidth / 2), d.height * 0.78, 0];
  const elbow: Vec3M = [
    shoulder[0] + sign * dx * d.upperArmLength,
    shoulder[1] + dy * d.upperArmLength,
    0,
  ];
  const wrist: Vec3M = [elbow[0] + sign * dx * d.forearmLength, elbow[1] + dy * d.forearmLength, 0];
  return { shoulder, elbow, wrist };
}

function createLods(pose: BodyPoseKind, d: StaticBodyDimensionsM): CollisionLod[] {
  const leftArm = armPoints('left', pose, d);
  const rightArm = armPoints('right', pose, d);
  const hipY = d.inseamLength;
  const kneeY = d.inseamLength * 0.52;
  const ankleY = d.calfRadius;
  const pelvisTop = d.height * 0.62;
  const chestTop = d.height * 0.79;
  const neckTop = d.height - d.headRadius * 2;
  const headCenterY = d.height - d.headRadius;

  return [
    {
      id: 'collision-lod-0',
      level: 0,
      maxSurfaceDeviationM: 0.12,
      capsules: [
        capsule('lod0-torso', [0, hipY, 0], [0, chestTop, 0], d.torsoRadius),
        capsule('lod0-arm-left', leftArm.shoulder, leftArm.wrist, d.upperArmRadius),
        capsule('lod0-arm-right', rightArm.shoulder, rightArm.wrist, d.upperArmRadius),
        capsule(
          'lod0-leg-left',
          [d.hipHalfWidth, ankleY, 0],
          [d.hipHalfWidth, hipY, 0],
          d.thighRadius,
        ),
        capsule(
          'lod0-leg-right',
          [-d.hipHalfWidth, ankleY, 0],
          [-d.hipHalfWidth, hipY, 0],
          d.thighRadius,
        ),
      ],
      spheres: [sphere('lod0-head', [0, headCenterY, 0], d.headRadius)],
    },
    {
      id: 'collision-lod-1',
      level: 1,
      maxSurfaceDeviationM: 0.06,
      capsules: [
        capsule('lod1-pelvis', [0, hipY, 0], [0, pelvisTop, 0], d.pelvisRadius),
        capsule('lod1-torso', [0, pelvisTop, 0], [0, chestTop, 0], d.torsoRadius),
        capsule('lod1-neck', [0, chestTop, 0], [0, neckTop, 0], d.neckRadius),
        capsule('lod1-upper-arm-left', leftArm.shoulder, leftArm.elbow, d.upperArmRadius),
        capsule('lod1-forearm-left', leftArm.elbow, leftArm.wrist, d.forearmRadius),
        capsule('lod1-upper-arm-right', rightArm.shoulder, rightArm.elbow, d.upperArmRadius),
        capsule('lod1-forearm-right', rightArm.elbow, rightArm.wrist, d.forearmRadius),
        capsule(
          'lod1-thigh-left',
          [d.hipHalfWidth, kneeY, 0],
          [d.hipHalfWidth, hipY, 0],
          d.thighRadius,
        ),
        capsule(
          'lod1-calf-left',
          [d.hipHalfWidth, ankleY, 0],
          [d.hipHalfWidth, kneeY, 0],
          d.calfRadius,
        ),
        capsule(
          'lod1-thigh-right',
          [-d.hipHalfWidth, kneeY, 0],
          [-d.hipHalfWidth, hipY, 0],
          d.thighRadius,
        ),
        capsule(
          'lod1-calf-right',
          [-d.hipHalfWidth, ankleY, 0],
          [-d.hipHalfWidth, kneeY, 0],
          d.calfRadius,
        ),
      ],
      spheres: [
        sphere('lod1-head', [0, headCenterY, 0], d.headRadius),
        sphere('lod1-hand-left', leftArm.wrist, d.forearmRadius),
        sphere('lod1-hand-right', rightArm.wrist, d.forearmRadius),
        sphere('lod1-foot-left', [d.hipHalfWidth, d.calfRadius, d.calfRadius], d.calfRadius),
        sphere('lod1-foot-right', [-d.hipHalfWidth, d.calfRadius, d.calfRadius], d.calfRadius),
      ],
    },
  ];
}

function createLandmarks(pose: BodyPoseKind, d: StaticBodyDimensionsM): BodyLandmark[] {
  const leftArm = armPoints('left', pose, d);
  const rightArm = armPoints('right', pose, d);
  return [
    { id: 'crown', positionM: [0, d.height, 0] },
    { id: 'neck-base', positionM: [0, d.height * 0.79, 0] },
    { id: 'shoulder-left', positionM: leftArm.shoulder },
    { id: 'shoulder-right', positionM: rightArm.shoulder },
    { id: 'wrist-left', positionM: leftArm.wrist },
    { id: 'wrist-right', positionM: rightArm.wrist },
    { id: 'chest-center', positionM: [0, d.height * 0.72, 0] },
    { id: 'waist-center', positionM: [0, d.height * 0.6, 0] },
    { id: 'hip-left', positionM: [d.hipHalfWidth, d.inseamLength, 0] },
    { id: 'hip-right', positionM: [-d.hipHalfWidth, d.inseamLength, 0] },
    { id: 'ankle-left', positionM: [d.hipHalfWidth, d.calfRadius, 0] },
    { id: 'ankle-right', positionM: [-d.hipHalfWidth, d.calfRadius, 0] },
  ];
}

function boundingBox(
  lods: readonly CollisionLod[],
  landmarks: readonly BodyLandmark[],
): AxisAlignedBoundingBoxM {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const include = (point: Vec3M, radius = 0) => {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis] - radius);
      max[axis] = Math.max(max[axis], point[axis] + radius);
    }
  };
  for (const lod of lods) {
    for (const item of lod.capsules) {
      include(item.aM, item.radiusM);
      include(item.bM, item.radiusM);
    }
    for (const item of lod.spheres) include(item.centerM, item.radiusM);
  }
  for (const landmark of landmarks) include(landmark.positionM);
  return { min: min as unknown as Vec3M, max: max as unknown as Vec3M };
}

export class StaticBodyProvider implements BodyProvider {
  readonly id = 'static-analytical-body';
  readonly revision = PROVIDER_REVISION;
  readonly dimensions: StaticBodyDimensionsM;
  readonly pose: BodyPoseKind;

  constructor(options: { dimensions?: StaticBodyDimensionsM; pose?: BodyPoseKind } = {}) {
    this.dimensions = Object.freeze({
      ...(options.dimensions ?? DEFAULT_STATIC_BODY_DIMENSIONS_M),
    });
    this.pose = options.pose ?? 'A';
    validateDimensions(this.dimensions);
    if (this.pose !== 'A' && this.pose !== 'T')
      throw new RangeError('Static body pose must be A or T.');
  }

  async reconstruct(input: BodyInput = {}): Promise<BodyArtifact> {
    if (input.measurementsMm && Object.keys(input.measurementsMm).length > 0) {
      throw new Error('StaticBodyProvider does not reconstruct measurement-driven bodies.');
    }
    if (input.requestedPose && input.requestedPose !== this.pose) {
      throw new Error(`StaticBodyProvider is fixed in ${this.pose} pose.`);
    }
    const lods = createLods(this.pose, this.dimensions);
    const landmarks = createLandmarks(this.pose, this.dimensions);
    const artifact: BodyArtifact = {
      id: 'static-analytical-body',
      revision: PROVIDER_REVISION,
      units: 'm',
      boundingBoxM: boundingBox(lods, landmarks),
      landmarks: { revision: LANDMARK_REVISION, landmarks },
      pose: {
        kind: this.pose,
        revision: POSE_REVISION,
        coordinateSystem: {
          handedness: 'right',
          up: '+Y',
          front: '+Z',
          subjectLeft: '+X',
          origin: 'ground-projection-between-ankles',
        },
        armDownAngleDeg: this.pose === 'A' ? 35 : 0,
      },
      collisionLods: lods,
      defaultCollisionLodId: 'collision-lod-1',
      provenance: {
        status: 'cleared',
        sources: [
          {
            id: 'static-body-formula',
            kind: 'generated',
            source: 'src/lib/cloth/body/static-body-provider.ts analytical constants',
            licenseId: 'LicenseRef-GRBPWR-Project-Owned',
            commercialUse: 'cleared',
            redistribution: 'cleared',
          },
        ],
      },
    };
    assertValidBodyArtifact(artifact);
    return artifact;
  }
}
