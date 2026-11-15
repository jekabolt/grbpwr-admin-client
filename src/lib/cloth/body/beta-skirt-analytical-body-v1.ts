import type {
  AxisAlignedBoundingBoxM,
  BodyArtifact,
  BodyLandmark,
  CapsuleCollider,
  CollisionLod,
  Vec3M,
} from './contracts';
import { assertValidBodyArtifact } from './validation';

export const BETA_SKIRT_ANALYTICAL_BODY_V1 = 'beta-skirt-analytical-body/v1' as const;
export const BETA_SKIRT_ANALYTICAL_BODY_ID_V1 = 'beta-skirt-analytical-body-v1' as const;
export const BETA_SKIRT_ANALYTICAL_BODY_REVISION_V1 =
  'beta-skirt-analytical-body-revision-v1' as const;
export const BETA_SKIRT_COLLISION_LOD_ID_V1 = 'beta-skirt-collision-lod-0' as const;
export const BETA_SKIRT_REFERENCE_WAIST_COLLIDER_ID_V1 = 'beta-skirt-waist-torso' as const;

const TWO_PI = Math.PI * 2;

/**
 * Project-owned dimensions for the isolated beta-skirt placement fixture. They are not a body-size
 * chart or a fit claim. The waist radius makes the exact 720 mm fixture circumference nominally
 * unstretched after the current 2 mm cloth thickness and 8 mm authored clearance are removed.
 */
export const BETA_SKIRT_ANALYTICAL_BODY_DIMENSIONS_V1 = Object.freeze({
  bodyHeightM: 1.65,
  waistAxialYM: 1,
  hemAxialYM: 0.4,
  waistRestCircumferenceM: 0.72,
  hemRestCircumferenceM: 0.96,
  authoredClothThicknessM: 0.002,
  authoredRadialClearanceM: 0.008,
  waistRadiusM: 0.72 / TWO_PI - 0.002 - 0.008,
  pelvisRadiusM: 0.1,
  pelvisBottomYM: 0.82,
  legAxisHalfSeparationM: 0.05,
  legRadiusM: 0.06,
  legBottomYM: 0.3,
} as const);

function capsule(id: string, aM: Vec3M, bM: Vec3M, radiusM: number): CapsuleCollider {
  return { id, kind: 'capsule', aM, bM, radiusM };
}

function collisionLod(): CollisionLod {
  const dimensions = BETA_SKIRT_ANALYTICAL_BODY_DIMENSIONS_V1;
  return {
    id: BETA_SKIRT_COLLISION_LOD_ID_V1,
    level: 0,
    maxSurfaceDeviationM: 0.01,
    capsules: [
      capsule(
        BETA_SKIRT_REFERENCE_WAIST_COLLIDER_ID_V1,
        [0, dimensions.waistAxialYM, 0],
        [0, 1.3, 0],
        dimensions.waistRadiusM,
      ),
      capsule(
        'beta-skirt-pelvis',
        [0, dimensions.pelvisBottomYM, 0],
        [0, dimensions.waistAxialYM, 0],
        dimensions.pelvisRadiusM,
      ),
      capsule(
        'beta-skirt-leg-left',
        [dimensions.legAxisHalfSeparationM, dimensions.legBottomYM, 0],
        [dimensions.legAxisHalfSeparationM, dimensions.pelvisBottomYM, 0],
        dimensions.legRadiusM,
      ),
      capsule(
        'beta-skirt-leg-right',
        [-dimensions.legAxisHalfSeparationM, dimensions.legBottomYM, 0],
        [-dimensions.legAxisHalfSeparationM, dimensions.pelvisBottomYM, 0],
        dimensions.legRadiusM,
      ),
    ],
    spheres: [],
  };
}

function landmarks(): readonly BodyLandmark[] {
  const dimensions = BETA_SKIRT_ANALYTICAL_BODY_DIMENSIONS_V1;
  return [
    { id: 'crown', positionM: [0, dimensions.bodyHeightM, 0] },
    { id: 'waist-center', positionM: [0, dimensions.waistAxialYM, 0] },
    {
      id: 'hip-left',
      positionM: [dimensions.legAxisHalfSeparationM, dimensions.pelvisBottomYM, 0],
    },
    {
      id: 'hip-right',
      positionM: [-dimensions.legAxisHalfSeparationM, dimensions.pelvisBottomYM, 0],
    },
    {
      id: 'ankle-left',
      positionM: [dimensions.legAxisHalfSeparationM, dimensions.legBottomYM, 0],
    },
    {
      id: 'ankle-right',
      positionM: [-dimensions.legAxisHalfSeparationM, dimensions.legBottomYM, 0],
    },
  ];
}

function boundingBox(
  lod: CollisionLod,
  bodyLandmarks: readonly BodyLandmark[],
): AxisAlignedBoundingBoxM {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const include = (point: Vec3M, radiusM = 0) => {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis] - radiusM);
      maximum[axis] = Math.max(maximum[axis], point[axis] + radiusM);
    }
  };
  for (const item of lod.capsules) {
    include(item.aM, item.radiusM);
    include(item.bM, item.radiusM);
  }
  for (const item of lod.spheres) include(item.centerM, item.radiusM);
  for (const landmark of bodyLandmarks) include(landmark.positionM);
  return {
    min: minimum as unknown as Vec3M,
    max: maximum as unknown as Vec3M,
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  Object.freeze(value);
  return value;
}

/** Returns a fresh, deeply owned analytical body used only by the beta-skirt fixture. */
export function createBetaSkirtAnalyticalBodyV1(): BodyArtifact {
  const lod = collisionLod();
  const bodyLandmarks = landmarks();
  const artifact: BodyArtifact = {
    id: BETA_SKIRT_ANALYTICAL_BODY_ID_V1,
    revision: BETA_SKIRT_ANALYTICAL_BODY_REVISION_V1,
    units: 'm',
    boundingBoxM: boundingBox(lod, bodyLandmarks),
    landmarks: {
      revision: 'beta-skirt-analytical-landmarks-v1',
      landmarks: bodyLandmarks,
    },
    pose: {
      kind: 'A',
      revision: 'beta-skirt-analytical-a-pose-v1',
      coordinateSystem: {
        handedness: 'right',
        up: '+Y',
        front: '+Z',
        subjectLeft: '+X',
        origin: 'ground-projection-between-ankles',
      },
      armDownAngleDeg: 35,
    },
    collisionLods: [lod],
    defaultCollisionLodId: BETA_SKIRT_COLLISION_LOD_ID_V1,
    provenance: {
      status: 'cleared',
      sources: [
        {
          id: 'beta-skirt-analytical-body-formula-v1',
          kind: 'generated',
          source:
            'src/lib/cloth/body/beta-skirt-analytical-body-v1.ts project-owned analytical fixture',
          licenseId: 'LicenseRef-GRBPWR-Project-Owned',
          commercialUse: 'cleared',
          redistribution: 'cleared',
        },
      ],
    },
  };
  assertValidBodyArtifact(artifact);
  return deepFreeze(artifact);
}
