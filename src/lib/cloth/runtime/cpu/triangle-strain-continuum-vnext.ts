import {
  createTriangleRestFrame,
  evaluateTriangleStrain,
  type TrianglePositions,
  type TriangleRestFrame,
  type TriangleStrainMode,
  type Vec2,
  type Vec3,
} from './triangle-strain-oracle';

export const TRIANGLE_STRAIN_CONTINUUM_VNEXT =
  'triangle-strain-continuum-sqrt-area/vnext-reference' as const;

/**
 * Smallest accepted XPBD scalar denominator, in kg^-1. The value is exactly representable as the
 * f32 produced by `Math.fround` and is mirrored verbatim by the standalone WGSL kernel.
 */
export const CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV = Math.fround(1e-12);

export type ContinuumComplianceMPerNVNext = {
  readonly warp: number;
  readonly weft: number;
  readonly shear: number;
};

export type ContinuumTriangleVNext = {
  readonly restFrame: TriangleRestFrame;
  readonly restAreaM2: number;
};

export type ContinuumTriangleEvaluationVNext = {
  readonly constraintM: { readonly warp: number; readonly weft: number; readonly shear: number };
  readonly energyJ: { readonly warp: number; readonly weft: number; readonly shear: number };
  readonly totalEnergyJ: number;
};

export type ContinuumXpbdCorrectionOptionsVNext = {
  readonly mode: TriangleStrainMode;
  readonly inverseMassesKgInv: readonly [number, number, number];
  readonly dtS: number;
  /** Area-integrated material compliance for Q=sqrt(restArea)*C, in m/N. */
  readonly complianceMPerN: number;
  /** Multiplier for the length-valued Q constraint, in kg*m. */
  readonly lambdaKgM: number;
};

export type ContinuumXpbdCorrectionVNext = {
  readonly positions: TrianglePositions;
  readonly correctionsM: TrianglePositions;
  readonly constraintBeforeM: number;
  readonly constraintAfterM: number;
  readonly deltaLambdaKgM: number;
  readonly lambdaKgM: number;
};

const MIN_REST_AREA_M2 = 1e-12;
const REST_AREA_RELATIVE_TOLERANCE = 1e-5;
const REST_AREA_MAX_ULPS = 8;

function positiveF32Ulp(value: number): number {
  const storage = new ArrayBuffer(4);
  const view = new DataView(storage);
  const rounded = Math.fround(value);
  view.setFloat32(0, rounded, true);
  view.setUint32(0, view.getUint32(0, true) + 1, true);
  return view.getFloat32(0, true) - rounded;
}

/** f32-aware inverse-Dm/rest-area consistency tolerance in m^2. */
export function continuumStrainRestAreaToleranceM2(
  restAreaM2: number,
  determinantAreaM2: number,
): number {
  const scaleM2 = Math.fround(Math.max(restAreaM2, determinantAreaM2));
  return REST_AREA_MAX_ULPS * positiveF32Ulp(scaleM2) + REST_AREA_RELATIVE_TOLERANCE * scaleM2;
}

function assertRestArea(restAreaM2: number): void {
  if (!Number.isFinite(restAreaM2) || restAreaM2 <= MIN_REST_AREA_M2) {
    throw new RangeError('Continuum triangle restAreaM2 must be finite and > 1e-12 m^2.');
  }
}

function assertTriangleRestFrame(triangle: ContinuumTriangleVNext): void {
  assertRestArea(triangle.restAreaM2);
  assertRestArea(triangle.restFrame.restAreaM2);
  const inverse = triangle.restFrame.inverseRestMatrixInvM;
  const determinantInvM2 = inverse[0] * inverse[3] - inverse[1] * inverse[2];
  const determinantAreaM2 = 0.5 / Math.abs(determinantInvM2);
  const toleranceM2 = continuumStrainRestAreaToleranceM2(triangle.restAreaM2, determinantAreaM2);
  if (
    !Number.isFinite(determinantAreaM2) ||
    Math.abs(triangle.restAreaM2 - triangle.restFrame.restAreaM2) > toleranceM2 ||
    Math.abs(triangle.restAreaM2 - determinantAreaM2) > toleranceM2
  ) {
    throw new RangeError('Continuum triangle rest area disagrees with its inverse rest frame.');
  }
}

function assertCompliance(compliance: ContinuumComplianceMPerNVNext): void {
  for (const [mode, value] of Object.entries(compliance)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Continuum ${mode} compliance must be finite and > 0 m/N.`);
    }
  }
}

function squaredLength(value: Vec3): number {
  return value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
}

function scale(value: Vec3, factor: number): Vec3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function addScaled(left: Vec3, leftScale: number, right: Vec3, rightScale: number): Vec3 {
  return [
    left[0] * leftScale + right[0] * rightScale,
    left[1] * leftScale + right[1] * rightScale,
    left[2] * leftScale + right[2] * rightScale,
  ];
}

function rawGradients(
  positionsM: TrianglePositions,
  triangle: ContinuumTriangleVNext,
  mode: TriangleStrainMode,
): readonly [Vec3, Vec3, Vec3] {
  const strain = evaluateTriangleStrain(positionsM, triangle.restFrame);
  const inverse = triangle.restFrame.inverseRestMatrixInvM;
  const warpCoefficients = [-(inverse[0] + inverse[2]), inverse[0], inverse[2]] as const;
  const weftCoefficients = [-(inverse[1] + inverse[3]), inverse[1], inverse[3]] as const;
  const [warp, weft] = strain.deformationGradient;
  return [0, 1, 2].map((index): Vec3 => {
    if (mode === 'warp') return scale(warp, warpCoefficients[index]);
    if (mode === 'weft') return scale(weft, weftCoefficients[index]);
    return addScaled(weft, warpCoefficients[index], warp, weftCoefficients[index]);
  }) as unknown as readonly [Vec3, Vec3, Vec3];
}

function rawConstraint(
  positionsM: TrianglePositions,
  triangle: ContinuumTriangleVNext,
  mode: TriangleStrainMode,
): number {
  return evaluateTriangleStrain(positionsM, triangle.restFrame)[mode];
}

/** Builds a rest frame for Q=sqrt(A)*C and rejects zero/near-zero continuum area. */
export function createContinuumTriangleVNext(
  restPositionsM: readonly [Vec2, Vec2, Vec2],
  warpAxis: Vec2,
): ContinuumTriangleVNext {
  const restFrame = createTriangleRestFrame(restPositionsM, warpAxis);
  assertRestArea(restFrame.restAreaM2);
  return { restFrame, restAreaM2: restFrame.restAreaM2 };
}

/** Evaluates area-integrated membrane energy E=A*C^2/(2*alphaMaterial). */
export function evaluateContinuumTriangleVNext(
  positionsM: TrianglePositions,
  triangle: ContinuumTriangleVNext,
  complianceMPerN: ContinuumComplianceMPerNVNext,
): ContinuumTriangleEvaluationVNext {
  assertTriangleRestFrame(triangle);
  assertCompliance(complianceMPerN);
  const strain = evaluateTriangleStrain(positionsM, triangle.restFrame);
  const sqrtAreaM = Math.sqrt(triangle.restAreaM2);
  const constraintM = {
    warp: sqrtAreaM * strain.warp,
    weft: sqrtAreaM * strain.weft,
    shear: sqrtAreaM * strain.shear,
  };
  const energyJ = {
    warp: (constraintM.warp * constraintM.warp) / (2 * complianceMPerN.warp),
    weft: (constraintM.weft * constraintM.weft) / (2 * complianceMPerN.weft),
    shear: (constraintM.shear * constraintM.shear) / (2 * complianceMPerN.shear),
  };
  return {
    constraintM,
    energyJ,
    totalEnergyJ: energyJ.warp + energyJ.weft + energyJ.shear,
  };
}

/**
 * One scalar XPBD correction for Q=sqrt(A)*C. Gradients are dimensionless, alphaTilde is kg^-1,
 * lambda is kg*m, and inverse masses are physical kg^-1 values.
 */
export function solveContinuumTriangleXpbdVNext(
  positionsM: TrianglePositions,
  triangle: ContinuumTriangleVNext,
  options: ContinuumXpbdCorrectionOptionsVNext,
): ContinuumXpbdCorrectionVNext {
  assertTriangleRestFrame(triangle);
  if (!Number.isFinite(options.dtS) || options.dtS <= 0) {
    throw new RangeError('dtS must be finite and > 0.');
  }
  if (!Number.isFinite(options.complianceMPerN) || options.complianceMPerN <= 0) {
    throw new RangeError('complianceMPerN must be finite and > 0 m/N.');
  }
  if (!Number.isFinite(options.lambdaKgM)) throw new RangeError('lambdaKgM must be finite.');
  if (
    !options.inverseMassesKgInv.every(
      (inverseMass) => Number.isFinite(inverseMass) && inverseMass >= 0,
    )
  ) {
    throw new RangeError('inverseMassesKgInv must contain finite non-negative kg^-1 values.');
  }

  const sqrtAreaM = Math.sqrt(triangle.restAreaM2);
  const constraintBeforeM = sqrtAreaM * rawConstraint(positionsM, triangle, options.mode);
  const gradients = rawGradients(positionsM, triangle, options.mode).map((gradient) =>
    scale(gradient, sqrtAreaM),
  ) as unknown as readonly [Vec3, Vec3, Vec3];
  const alphaTildeKgInv = options.complianceMPerN / (options.dtS * options.dtS);
  let denominatorKgInv = alphaTildeKgInv;
  for (let index = 0; index < 3; index += 1) {
    denominatorKgInv += options.inverseMassesKgInv[index] * squaredLength(gradients[index]);
  }
  if (
    !Number.isFinite(denominatorKgInv) ||
    denominatorKgInv <= CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV
  ) {
    throw new RangeError('Continuum strain correction has zero or invalid effective mass.');
  }

  const deltaLambdaKgM =
    (-constraintBeforeM - alphaTildeKgInv * options.lambdaKgM) / denominatorKgInv;
  const correctionsM = gradients.map((gradient, index) =>
    scale(gradient, options.inverseMassesKgInv[index] * deltaLambdaKgM),
  ) as unknown as TrianglePositions;
  const positions = positionsM.map(
    (position, index): Vec3 => [
      position[0] + correctionsM[index][0],
      position[1] + correctionsM[index][1],
      position[2] + correctionsM[index][2],
    ],
  ) as unknown as TrianglePositions;
  return {
    positions,
    correctionsM,
    constraintBeforeM,
    constraintAfterM: sqrtAreaM * rawConstraint(positions, triangle, options.mode),
    deltaLambdaKgM,
    lambdaKgM: options.lambdaKgM + deltaLambdaKgM,
  };
}

export type ContinuumMeshTriangleVNext = {
  readonly vertices: readonly [number, number, number];
  readonly triangle: ContinuumTriangleVNext;
};

/** Physical lumped area mass, independent of compliance and mesh resolution. */
export function lumpContinuumMassesKgVNext(
  particleCount: number,
  triangles: readonly ContinuumMeshTriangleVNext[],
  arealDensityKgM2: number,
): Float64Array {
  if (!Number.isSafeInteger(particleCount) || particleCount < 1) {
    throw new RangeError('particleCount must be a positive safe integer.');
  }
  if (!Number.isFinite(arealDensityKgM2) || arealDensityKgM2 <= 0) {
    throw new RangeError('arealDensityKgM2 must be finite and > 0.');
  }
  const massesKg = new Float64Array(particleCount);
  for (const { vertices, triangle } of triangles) {
    assertRestArea(triangle.restAreaM2);
    if (new Set(vertices).size !== 3 || vertices.some((vertex) => vertex >= particleCount)) {
      throw new RangeError('Continuum mesh triangle contains invalid particle indices.');
    }
    const shareKg = (triangle.restAreaM2 * arealDensityKgM2) / 3;
    vertices.forEach((vertex) => (massesKg[vertex] += shareKg));
  }
  if (massesKg.some((massKg) => !Number.isFinite(massKg) || massKg <= 0)) {
    throw new RangeError('Every continuum particle must receive positive physical mass.');
  }
  return massesKg;
}
