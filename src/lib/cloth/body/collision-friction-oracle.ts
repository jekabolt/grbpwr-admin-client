import type { CapsuleCollider, SphereCollider, Vec3M } from './contracts';

export type BodyFrictionCollider = CapsuleCollider | SphereCollider;

export interface PositionFrictionParticle {
  /** Position at the beginning of the substep, in metres. */
  readonly previousPositionM: Vec3M;
  /** Unconstrained/predicted position for this solve iteration, in metres. */
  readonly predictedPositionM: Vec3M;
  readonly inverseMass: number;
}

export interface PositionFrictionParameters {
  readonly clothThicknessM: number;
  /** Dimensionless Coulomb coefficient. */
  readonly staticFriction: number;
  /** Dimensionless Coulomb coefficient; must not exceed staticFriction. */
  readonly dynamicFriction: number;
}

export interface AnalyticalContactDecomposition {
  readonly closestPointM: Vec3M;
  readonly normal: Vec3M;
  readonly signedDistanceM: number;
  readonly penetrationM: number;
}

export type PositionFrictionMode = 'none' | 'pinned' | 'static' | 'dynamic';

export interface PositionFrictionResult extends AnalyticalContactDecomposition {
  readonly positionM: Vec3M;
  readonly normalCorrectionM: Vec3M;
  readonly tangentialDisplacementM: Vec3M;
  readonly frictionCorrectionM: Vec3M;
  readonly normalCorrectionMagnitudeM: number;
  readonly tangentialDisplacementMagnitudeM: number;
  readonly coulombLimitM: number;
  readonly mode: PositionFrictionMode;
}

export interface OrderedPositionFrictionResult {
  readonly positionM: Vec3M;
  readonly colliderIds: readonly string[];
  readonly contacts: readonly PositionFrictionResult[];
}

const AXIS_EPSILON_SQ = 1e-16;
const DISTANCE_EPSILON_SQ = 1e-16;
const ZERO: Vec3M = [0, 0, 0];

function finiteVec3(value: Vec3M): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function validate(
  particle: PositionFrictionParticle,
  collider: BodyFrictionCollider,
  parameters: PositionFrictionParameters,
): void {
  if (!finiteVec3(particle.previousPositionM) || !finiteVec3(particle.predictedPositionM)) {
    throw new RangeError('Particle positions must be finite.');
  }
  if (!Number.isFinite(particle.inverseMass) || particle.inverseMass < 0) {
    throw new RangeError('Particle inverseMass must be finite and non-negative.');
  }
  if (!Number.isFinite(parameters.clothThicknessM) || parameters.clothThicknessM < 0) {
    throw new RangeError('clothThicknessM must be finite and non-negative.');
  }
  if (!Number.isFinite(parameters.staticFriction) || parameters.staticFriction < 0) {
    throw new RangeError('staticFriction must be finite and non-negative.');
  }
  if (
    !Number.isFinite(parameters.dynamicFriction) ||
    parameters.dynamicFriction < 0 ||
    parameters.dynamicFriction > parameters.staticFriction
  ) {
    throw new RangeError('dynamicFriction must be finite and within [0, staticFriction].');
  }
  if (!Number.isFinite(collider.radiusM) || collider.radiusM <= 0) {
    throw new RangeError('Collider radius must be finite and positive.');
  }
  if (collider.kind === 'capsule') {
    if (!finiteVec3(collider.aM) || !finiteVec3(collider.bM)) {
      throw new RangeError('Capsule endpoints must be finite.');
    }
  } else if (collider.kind === 'sphere') {
    if (!finiteVec3(collider.centerM)) throw new RangeError('Sphere center must be finite.');
  } else {
    throw new RangeError('Collider kind must be capsule or sphere.');
  }
}

function deterministicPerpendicular(axisX: number, axisY: number, axisZ: number): Vec3M {
  const lengthSq = axisX * axisX + axisY * axisY + axisZ * axisZ;
  if (lengthSq <= AXIS_EPSILON_SQ) return [1, 0, 0];
  const inverseLength = 1 / Math.sqrt(lengthSq);
  const x = axisX * inverseLength;
  const y = axisY * inverseLength;
  const z = axisZ * inverseLength;
  const reference: Vec3M =
    Math.abs(x) <= Math.abs(y) && Math.abs(x) <= Math.abs(z)
      ? [1, 0, 0]
      : Math.abs(y) <= Math.abs(z)
        ? [0, 1, 0]
        : [0, 0, 1];
  const crossX = y * reference[2] - z * reference[1];
  const crossY = z * reference[0] - x * reference[2];
  const crossZ = x * reference[1] - y * reference[0];
  const inverseCrossLength = 1 / Math.hypot(crossX, crossY, crossZ);
  return [crossX * inverseCrossLength, crossY * inverseCrossLength, crossZ * inverseCrossLength];
}

function geometry(collider: BodyFrictionCollider): readonly [Vec3M, Vec3M, number] {
  return collider.kind === 'sphere'
    ? [collider.centerM, collider.centerM, collider.radiusM]
    : [collider.aM, collider.bM, collider.radiusM];
}

export function decomposeAnalyticalBodyContact(
  positionM: Vec3M,
  collider: BodyFrictionCollider,
  clothThicknessM: number,
): AnalyticalContactDecomposition {
  validate(
    { previousPositionM: positionM, predictedPositionM: positionM, inverseMass: 1 },
    collider,
    { clothThicknessM, staticFriction: 0, dynamicFriction: 0 },
  );
  const [a, b, radius] = geometry(collider);
  const axisX = b[0] - a[0];
  const axisY = b[1] - a[1];
  const axisZ = b[2] - a[2];
  const axisLengthSq = axisX * axisX + axisY * axisY + axisZ * axisZ;
  const fromAX = positionM[0] - a[0];
  const fromAY = positionM[1] - a[1];
  const fromAZ = positionM[2] - a[2];
  const unclampedT =
    axisLengthSq > AXIS_EPSILON_SQ
      ? (fromAX * axisX + fromAY * axisY + fromAZ * axisZ) / axisLengthSq
      : 0;
  const t = Math.max(0, Math.min(1, unclampedT));
  const closestPointM: Vec3M = [a[0] + axisX * t, a[1] + axisY * t, a[2] + axisZ * t];
  const deltaX = positionM[0] - closestPointM[0];
  const deltaY = positionM[1] - closestPointM[1];
  const deltaZ = positionM[2] - closestPointM[2];
  const distanceSq = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
  const distance = Math.sqrt(distanceSq);
  const normal: Vec3M =
    distanceSq > DISTANCE_EPSILON_SQ
      ? [deltaX / distance, deltaY / distance, deltaZ / distance]
      : deterministicPerpendicular(axisX, axisY, axisZ);
  const signedDistanceM = distance - (radius + clothThicknessM);
  return {
    closestPointM,
    normal,
    signedDistanceM,
    penetrationM: Math.max(0, -signedDistanceM),
  };
}

export function decomposeNormalAndTangent(
  displacementM: Vec3M,
  normal: Vec3M,
): {
  readonly normalM: Vec3M;
  readonly tangentM: Vec3M;
} {
  if (!finiteVec3(displacementM) || !finiteVec3(normal)) {
    throw new RangeError('Displacement and normal must be finite.');
  }
  const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
  if (normalLength <= Math.sqrt(DISTANCE_EPSILON_SQ)) {
    throw new RangeError('Contact normal must have non-zero length.');
  }
  const nx = normal[0] / normalLength;
  const ny = normal[1] / normalLength;
  const nz = normal[2] / normalLength;
  const projection = displacementM[0] * nx + displacementM[1] * ny + displacementM[2] * nz;
  const normalM: Vec3M = [nx * projection, ny * projection, nz * projection];
  return {
    normalM,
    tangentM: [
      displacementM[0] - normalM[0],
      displacementM[1] - normalM[1],
      displacementM[2] - normalM[2],
    ],
  };
}

/**
 * Position-level Coulomb reference. Metre-valued corrections operate over one solver substep;
 * coefficients are dimensionless. Dynamic friction clamps rather than cancels tangential motion.
 */
export function solvePositionLevelBodyFriction(
  particle: PositionFrictionParticle,
  collider: BodyFrictionCollider,
  parameters: PositionFrictionParameters,
): PositionFrictionResult {
  validate(particle, collider, parameters);
  const contact = decomposeAnalyticalBodyContact(
    particle.predictedPositionM,
    collider,
    parameters.clothThicknessM,
  );
  if (contact.penetrationM <= 0) {
    return {
      ...contact,
      positionM: [...particle.predictedPositionM],
      normalCorrectionM: ZERO,
      tangentialDisplacementM: ZERO,
      frictionCorrectionM: ZERO,
      normalCorrectionMagnitudeM: 0,
      tangentialDisplacementMagnitudeM: 0,
      coulombLimitM: 0,
      mode: 'none',
    };
  }

  const normalCorrectionM: Vec3M = [
    contact.normal[0] * contact.penetrationM,
    contact.normal[1] * contact.penetrationM,
    contact.normal[2] * contact.penetrationM,
  ];
  const normalPositionM: Vec3M = [
    particle.predictedPositionM[0] + normalCorrectionM[0],
    particle.predictedPositionM[1] + normalCorrectionM[1],
    particle.predictedPositionM[2] + normalCorrectionM[2],
  ];
  const displacementM: Vec3M = [
    normalPositionM[0] - particle.previousPositionM[0],
    normalPositionM[1] - particle.previousPositionM[1],
    normalPositionM[2] - particle.previousPositionM[2],
  ];
  const { tangentM } = decomposeNormalAndTangent(displacementM, contact.normal);
  const tangentLength = Math.hypot(tangentM[0], tangentM[1], tangentM[2]);
  const staticLimitM = parameters.staticFriction * contact.penetrationM;

  if (particle.inverseMass === 0) {
    return {
      ...contact,
      positionM: [...particle.predictedPositionM],
      normalCorrectionM: ZERO,
      tangentialDisplacementM: tangentM,
      frictionCorrectionM: ZERO,
      normalCorrectionMagnitudeM: 0,
      tangentialDisplacementMagnitudeM: tangentLength,
      coulombLimitM: 0,
      mode: 'pinned',
    };
  }

  const staticContact = tangentLength <= staticLimitM;
  const dynamicLimitM = parameters.dynamicFriction * contact.penetrationM;
  const frictionMagnitudeM = staticContact ? tangentLength : Math.min(tangentLength, dynamicLimitM);
  const frictionCorrectionM: Vec3M =
    tangentLength <= Math.sqrt(DISTANCE_EPSILON_SQ)
      ? ZERO
      : [
          (-tangentM[0] / tangentLength) * frictionMagnitudeM,
          (-tangentM[1] / tangentLength) * frictionMagnitudeM,
          (-tangentM[2] / tangentLength) * frictionMagnitudeM,
        ];
  return {
    ...contact,
    positionM: [
      normalPositionM[0] + frictionCorrectionM[0],
      normalPositionM[1] + frictionCorrectionM[1],
      normalPositionM[2] + frictionCorrectionM[2],
    ],
    normalCorrectionM,
    tangentialDisplacementM: tangentM,
    frictionCorrectionM,
    normalCorrectionMagnitudeM: contact.penetrationM,
    tangentialDisplacementMagnitudeM: tangentLength,
    coulombLimitM: staticContact ? staticLimitM : dynamicLimitM,
    mode: staticContact ? 'static' : 'dynamic',
  };
}

function compareStableIds(first: BodyFrictionCollider, second: BodyFrictionCollider): number {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

/** Applies contacts in stable-id order so input permutations cannot change the reference result. */
export function solveOrderedBodyFrictionContacts(
  particle: PositionFrictionParticle,
  colliders: readonly BodyFrictionCollider[],
  parameters: PositionFrictionParameters,
): OrderedPositionFrictionResult {
  const ordered = [...colliders].sort(compareStableIds);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].id === ordered[index].id) {
      throw new RangeError(`Duplicate body collider id ${ordered[index].id}.`);
    }
  }
  let positionM = [...particle.predictedPositionM] as unknown as Vec3M;
  const contacts: PositionFrictionResult[] = [];
  for (const collider of ordered) {
    const result = solvePositionLevelBodyFriction(
      { ...particle, predictedPositionM: positionM },
      collider,
      parameters,
    );
    positionM = result.positionM;
    contacts.push(result);
  }
  return { positionM, colliderIds: ordered.map((collider) => collider.id), contacts };
}
