import type { Vec3M } from './contracts';
import {
  decomposeAnalyticalBodyContact,
  type BodyFrictionCollider,
} from './collision-friction-oracle';

export interface InitialBodyPenetrationPreflightInput {
  /** Consecutive [x, y, z, inverseMass] values, in metres. */
  readonly restPositionsInvMass: Float32Array;
  readonly colliders: readonly BodyFrictionCollider[];
  readonly clothThicknessM: number;
}

export interface InitialBodyPenetrationPreflightResult {
  readonly particleCount: number;
  readonly colliderCount: number;
  readonly penetratedParticleCount: number;
  readonly attachedPenetratedParticleCount: number;
  readonly maximum?: {
    readonly particleIndex: number;
    readonly colliderId: string;
    readonly penetrationM: number;
    readonly inverseMass: number;
    readonly positionM: Vec3M;
  };
}

/**
 * Pure CPU rest-state gate. Inputs must already share one coordinate frame; this helper neither
 * transforms geometry nor mutates/package/uploads collision data.
 */
export function preflightInitialBodyPenetration(
  input: InitialBodyPenetrationPreflightInput,
): InitialBodyPenetrationPreflightResult {
  if (input.restPositionsInvMass.length % 4 !== 0) {
    throw new RangeError('restPositionsInvMass length must be a multiple of four.');
  }
  if (!Number.isFinite(input.clothThicknessM) || input.clothThicknessM < 0) {
    throw new RangeError('clothThicknessM must be finite and non-negative.');
  }
  const colliders = [...input.colliders].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (let index = 1; index < colliders.length; index += 1) {
    if (colliders[index - 1].id === colliders[index].id) {
      throw new Error('Duplicate body collider id ' + colliders[index].id + '.');
    }
  }

  const particleCount = input.restPositionsInvMass.length / 4;
  let penetratedParticleCount = 0;
  let attachedPenetratedParticleCount = 0;
  let maximum: InitialBodyPenetrationPreflightResult['maximum'];
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const offset = particleIndex * 4;
    const positionM: Vec3M = [
      input.restPositionsInvMass[offset],
      input.restPositionsInvMass[offset + 1],
      input.restPositionsInvMass[offset + 2],
    ];
    const inverseMass = input.restPositionsInvMass[offset + 3];
    if (!positionM.every(Number.isFinite) || !Number.isFinite(inverseMass) || inverseMass < 0) {
      throw new RangeError('Particle positions and inverse masses must be finite and valid.');
    }
    let particlePenetrates = false;
    for (const collider of colliders) {
      const contact = decomposeAnalyticalBodyContact(positionM, collider, input.clothThicknessM);
      if (contact.penetrationM <= 0) continue;
      particlePenetrates = true;
      if (maximum === undefined || contact.penetrationM > maximum.penetrationM) {
        maximum = {
          particleIndex,
          colliderId: collider.id,
          penetrationM: contact.penetrationM,
          inverseMass,
          positionM,
        };
      }
    }
    if (particlePenetrates) {
      penetratedParticleCount += 1;
      if (inverseMass === 0) attachedPenetratedParticleCount += 1;
    }
  }

  return {
    particleCount,
    colliderCount: colliders.length,
    penetratedParticleCount,
    attachedPenetratedParticleCount,
    ...(maximum === undefined ? {} : { maximum }),
  };
}
