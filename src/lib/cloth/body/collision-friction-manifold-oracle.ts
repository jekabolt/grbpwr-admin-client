import type { Vec3M } from './contracts';

export const MIN_MANIFOLD_CONTACTS = 2;
export const MAX_MANIFOLD_CONTACTS = 4;
export const MAX_MANIFOLD_ITERATIONS = 64;

export interface ManifoldFrictionParticle {
  /** Position at the beginning of the substep, in metres. */
  readonly previousPositionM: Vec3M;
  /** Position after the normal collision pass, in metres. */
  readonly normalCorrectedPositionM: Vec3M;
  /** Inverse mass in kg^-1. Zero means pinned. */
  readonly inverseMassKgInv: number;
}

export interface ManifoldContact {
  readonly id: string;
  /** Outward half-space normal. It is normalized by the oracle. */
  readonly normal: Vec3M;
  /** Feasible positions satisfy dot(normalizedNormal, positionM) >= planeOffsetM. */
  readonly planeOffsetM: number;
  /** Normal correction applied for this contact during the normal pass, in metres. */
  readonly normalCorrectionMagnitudeM: number;
}

export interface ManifoldFrictionOptions {
  /** Dimensionless Coulomb coefficient. */
  readonly staticFriction: number;
  /** Dimensionless Coulomb coefficient; must not exceed staticFriction. */
  readonly dynamicFriction: number;
  readonly maximumIterations?: number;
  readonly positionToleranceM?: number;
  readonly correctionToleranceM?: number;
}

export type ManifoldContactMode = 'static' | 'dynamic';
export type ManifoldSolveStatus = 'converged' | 'blocked' | 'budget-exhausted' | 'pinned';

export interface ManifoldContactResult {
  readonly id: string;
  readonly mode: ManifoldContactMode;
  readonly normal: Vec3M;
  readonly frictionLimitM: number;
  readonly frictionMultiplierM: Vec3M;
  readonly frictionMultiplierMagnitudeM: number;
  readonly tangentResidualM: number;
}

export interface SingleWinnerDiagnostic {
  readonly winnerId: string;
  readonly positionM: Vec3M;
  readonly maxPenetrationM: number;
  readonly reintroducesPenetration: boolean;
}

export interface ManifoldFrictionResult {
  readonly status: ManifoldSolveStatus;
  readonly positionM: Vec3M;
  readonly iterations: number;
  readonly orderedContactIds: readonly string[];
  readonly contacts: readonly ManifoldContactResult[];
  readonly maxPenetrationM: number;
  readonly clippedUpdateCount: number;
  readonly singleWinner: SingleWinnerDiagnostic;
}

interface PreparedContact extends ManifoldContact {
  readonly normal: Vec3M;
  readonly mode: ManifoldContactMode;
  readonly frictionLimitM: number;
}

const NORMAL_EPSILON = 1e-12;
const DEFAULT_POSITION_TOLERANCE_M = 1e-9;
const DEFAULT_CORRECTION_TOLERANCE_M = 1e-10;
const DEFAULT_MAXIMUM_ITERATIONS = 24;

function finiteVector(value: Vec3M): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function dot(first: Vec3M, second: Vec3M): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function add(first: Vec3M, second: Vec3M): Vec3M {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function subtract(first: Vec3M, second: Vec3M): Vec3M {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function scale(vector: Vec3M, scalar: number): Vec3M {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function length(vector: Vec3M): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function tangent(displacementM: Vec3M, normal: Vec3M): Vec3M {
  return subtract(displacementM, scale(normal, dot(displacementM, normal)));
}

function clampMagnitude(vector: Vec3M, maximum: number): Vec3M {
  const magnitude = length(vector);
  return magnitude <= maximum || magnitude <= NORMAL_EPSILON
    ? vector
    : scale(vector, maximum / magnitude);
}

function maxPenetration(positionM: Vec3M, contacts: readonly PreparedContact[]): number {
  return contacts.reduce(
    (maximum, contact) =>
      Math.max(maximum, Math.max(0, contact.planeOffsetM - dot(contact.normal, positionM))),
    0,
  );
}

function validateOptions(options: ManifoldFrictionOptions): Required<ManifoldFrictionOptions> {
  if (!Number.isFinite(options.staticFriction) || options.staticFriction < 0) {
    throw new RangeError('staticFriction must be finite and non-negative.');
  }
  if (
    !Number.isFinite(options.dynamicFriction) ||
    options.dynamicFriction < 0 ||
    options.dynamicFriction > options.staticFriction
  ) {
    throw new RangeError('dynamicFriction must be finite and within [0, staticFriction].');
  }
  const maximumIterations = options.maximumIterations ?? DEFAULT_MAXIMUM_ITERATIONS;
  if (
    !Number.isSafeInteger(maximumIterations) ||
    maximumIterations < 1 ||
    maximumIterations > MAX_MANIFOLD_ITERATIONS
  ) {
    throw new RangeError(`maximumIterations must be within [1, ${MAX_MANIFOLD_ITERATIONS}].`);
  }
  const positionToleranceM = options.positionToleranceM ?? DEFAULT_POSITION_TOLERANCE_M;
  const correctionToleranceM = options.correctionToleranceM ?? DEFAULT_CORRECTION_TOLERANCE_M;
  if (!Number.isFinite(positionToleranceM) || positionToleranceM < 0) {
    throw new RangeError('positionToleranceM must be finite and non-negative.');
  }
  if (!Number.isFinite(correctionToleranceM) || correctionToleranceM <= 0) {
    throw new RangeError('correctionToleranceM must be finite and positive.');
  }
  return {
    ...options,
    maximumIterations,
    positionToleranceM,
    correctionToleranceM,
  };
}

function prepareContacts(
  particle: ManifoldFrictionParticle,
  contacts: readonly ManifoldContact[],
  options: Required<ManifoldFrictionOptions>,
): readonly PreparedContact[] {
  if (contacts.length < MIN_MANIFOLD_CONTACTS || contacts.length > MAX_MANIFOLD_CONTACTS) {
    throw new RangeError(
      `Manifold oracle requires ${MIN_MANIFOLD_CONTACTS}–${MAX_MANIFOLD_CONTACTS} contacts.`,
    );
  }
  const ids = new Set<string>();
  const displacement = subtract(particle.normalCorrectedPositionM, particle.previousPositionM);
  const prepared = contacts.map((contact) => {
    if (contact.id.trim().length === 0 || ids.has(contact.id)) {
      throw new RangeError('Contact ids must be non-empty and unique.');
    }
    ids.add(contact.id);
    if (!finiteVector(contact.normal)) throw new RangeError('Contact normals must be finite.');
    const normalLength = length(contact.normal);
    if (!Number.isFinite(normalLength) || normalLength <= NORMAL_EPSILON) {
      throw new RangeError(`Contact ${contact.id} has a degenerate normal.`);
    }
    if (!Number.isFinite(contact.planeOffsetM)) {
      throw new RangeError('Contact planeOffsetM must be finite.');
    }
    if (
      !Number.isFinite(contact.normalCorrectionMagnitudeM) ||
      contact.normalCorrectionMagnitudeM < 0
    ) {
      throw new RangeError('normalCorrectionMagnitudeM must be finite and non-negative.');
    }
    const normal = scale(contact.normal, 1 / normalLength);
    const planeOffsetM = contact.planeOffsetM / normalLength;
    const initialTangentM = length(tangent(displacement, normal));
    const staticLimitM = options.staticFriction * contact.normalCorrectionMagnitudeM;
    const mode: ManifoldContactMode = initialTangentM <= staticLimitM ? 'static' : 'dynamic';
    return {
      ...contact,
      normal,
      planeOffsetM,
      mode,
      frictionLimitM:
        (mode === 'static' ? options.staticFriction : options.dynamicFriction) *
        contact.normalCorrectionMagnitudeM,
    };
  });
  return prepared.sort(
    (first, second) =>
      second.normalCorrectionMagnitudeM - first.normalCorrectionMagnitudeM ||
      (first.id < second.id ? -1 : first.id > second.id ? 1 : 0),
  );
}

function singleWinnerDiagnostic(
  particle: ManifoldFrictionParticle,
  contacts: readonly PreparedContact[],
  toleranceM: number,
): SingleWinnerDiagnostic {
  const winner = contacts[0];
  const displacement = subtract(particle.normalCorrectedPositionM, particle.previousPositionM);
  const tangentM = tangent(displacement, winner.normal);
  const correctionM = scale(clampMagnitude(tangentM, winner.frictionLimitM), -1);
  const positionM = add(particle.normalCorrectedPositionM, correctionM);
  const penetrationM = maxPenetration(positionM, contacts);
  return {
    winnerId: winner.id,
    positionM,
    maxPenetrationM: penetrationM,
    reintroducesPenetration: penetrationM > toleranceM,
  };
}

/**
 * Deterministic bounded projected Gauss–Seidel approximation. Each contact owns a metre-valued
 * tangential multiplier inside its Coulomb disk. Updates are clipped against every contact
 * half-space, so friction cannot reintroduce body penetration beyond positionToleranceM.
 * This is an oracle for small fixtures, not a true coupled manifold or impulse solve.
 */
export function solveBodyFrictionManifoldOracle(
  particle: ManifoldFrictionParticle,
  contacts: readonly ManifoldContact[],
  rawOptions: ManifoldFrictionOptions,
): ManifoldFrictionResult {
  if (
    !finiteVector(particle.previousPositionM) ||
    !finiteVector(particle.normalCorrectedPositionM)
  ) {
    throw new RangeError('Particle positions must be finite.');
  }
  if (!Number.isFinite(particle.inverseMassKgInv) || particle.inverseMassKgInv < 0) {
    throw new RangeError('inverseMassKgInv must be finite and non-negative.');
  }
  const options = validateOptions(rawOptions);
  const ordered = prepareContacts(particle, contacts, options);
  const initialPenetrationM = maxPenetration(particle.normalCorrectedPositionM, ordered);
  if (initialPenetrationM > options.positionToleranceM) {
    throw new RangeError('normalCorrectedPositionM is outside the declared contact manifold.');
  }
  const winner = singleWinnerDiagnostic(particle, ordered, options.positionToleranceM);
  const multipliers = ordered.map(() => [0, 0, 0] as Vec3M);
  let positionM = [...particle.normalCorrectedPositionM] as Vec3M;
  let clippedUpdateCount = 0;
  let iterations = 0;
  let status: ManifoldSolveStatus = particle.inverseMassKgInv === 0 ? 'pinned' : 'budget-exhausted';

  if (particle.inverseMassKgInv > 0) {
    for (let iteration = 0; iteration < options.maximumIterations; iteration += 1) {
      iterations = iteration + 1;
      let maximumAppliedM = 0;
      let maximumRequestedM = 0;
      for (let contactIndex = 0; contactIndex < ordered.length; contactIndex += 1) {
        const contact = ordered[contactIndex];
        const currentMultiplier = multipliers[contactIndex];
        const displacement = subtract(positionM, particle.previousPositionM);
        const tangentM = tangent(displacement, contact.normal);
        const desiredMultiplier = clampMagnitude(
          subtract(currentMultiplier, tangentM),
          contact.frictionLimitM,
        );
        const requestedUpdate = subtract(desiredMultiplier, currentMultiplier);
        const requestedMagnitudeM = length(requestedUpdate);
        maximumRequestedM = Math.max(maximumRequestedM, requestedMagnitudeM);
        if (requestedMagnitudeM <= options.correctionToleranceM) continue;

        let feasibleScale = 1;
        for (const other of ordered) {
          const rate = dot(other.normal, requestedUpdate);
          if (rate >= 0) continue;
          const gapM = dot(other.normal, positionM) - other.planeOffsetM;
          feasibleScale = Math.min(
            feasibleScale,
            Math.max(0, (gapM + options.positionToleranceM) / -rate),
          );
        }
        if (feasibleScale < 1) clippedUpdateCount += 1;
        const appliedUpdate = scale(requestedUpdate, feasibleScale);
        positionM = add(positionM, appliedUpdate);
        multipliers[contactIndex] = add(currentMultiplier, appliedUpdate);
        maximumAppliedM = Math.max(maximumAppliedM, length(appliedUpdate));
      }
      if (maximumAppliedM <= options.correctionToleranceM) {
        status = maximumRequestedM <= options.correctionToleranceM ? 'converged' : 'blocked';
        break;
      }
    }
  }

  const contactResults = ordered.map((contact, index): ManifoldContactResult => {
    const multiplier = multipliers[index];
    return {
      id: contact.id,
      mode: contact.mode,
      normal: contact.normal,
      frictionLimitM: contact.frictionLimitM,
      frictionMultiplierM: multiplier,
      frictionMultiplierMagnitudeM: length(multiplier),
      tangentResidualM: length(
        tangent(subtract(positionM, particle.previousPositionM), contact.normal),
      ),
    };
  });
  return {
    status,
    positionM,
    iterations,
    orderedContactIds: ordered.map((contact) => contact.id),
    contacts: contactResults,
    maxPenetrationM: maxPenetration(positionM, ordered),
    clippedUpdateCount,
    singleWinner: winner,
  };
}
