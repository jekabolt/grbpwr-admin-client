export type Vec2 = readonly [x: number, y: number];
export type Vec3 = readonly [x: number, y: number, z: number];
export type TrianglePositions = readonly [p0: Vec3, p1: Vec3, p2: Vec3];
export type TriangleStrainMode = 'warp' | 'weft' | 'shear';

export type TriangleRestFrame = {
  /** Row-major inverse(Dm): [m00, m01, m10, m11], in 1/m. */
  readonly inverseRestMatrixInvM: readonly [number, number, number, number];
  readonly restAreaM2: number;
  readonly warpDirectionRest: Vec2;
  readonly weftDirectionRest: Vec2;
};

export type TriangleStrain = {
  /** Columns of F = Ds * inverse(Dm). */
  readonly deformationGradient: readonly [warp: Vec3, weft: Vec3];
  /** Green-strain components: 0.5(Fu.Fu - 1), 0.5(Fv.Fv - 1), Fu.Fv. */
  readonly warp: number;
  readonly weft: number;
  readonly shear: number;
};

export type TriangleStrainCorrectionOptions = {
  readonly mode: TriangleStrainMode;
  readonly inverseMassesKgInv: readonly [number, number, number];
  readonly dtS: number;
  /** Compliance of this dimensionless strain constraint, in 1/(N*m). */
  readonly complianceInvNm: number;
  readonly lambda: number;
};

export type TriangleStrainCorrection = {
  readonly positions: TrianglePositions;
  readonly correctionsM: TrianglePositions;
  readonly constraintBefore: number;
  readonly constraintAfter: number;
  readonly deltaLambda: number;
  readonly lambda: number;
};

const DEFAULT_MIN_DOUBLE_AREA_M2 = 1e-12;

function assertFiniteVector(values: readonly number[], label: string): void {
  if (!values.every(Number.isFinite)) throw new RangeError(label + ' must contain finite values.');
}

function subtract3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scaledAdd3(first: Vec3, firstScale: number, second: Vec3, secondScale: number): Vec3 {
  return [
    first[0] * firstScale + second[0] * secondScale,
    first[1] * firstScale + second[1] * secondScale,
    first[2] * firstScale + second[2] * secondScale,
  ];
}

function dot3(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function squaredLength3(value: Vec3): number {
  return dot3(value, value);
}

export function createTriangleRestFrame(
  restPositionsM: readonly [p0: Vec2, p1: Vec2, p2: Vec2],
  warpDirectionRest: Vec2 = [1, 0],
  minDoubleAreaM2 = DEFAULT_MIN_DOUBLE_AREA_M2,
): TriangleRestFrame {
  restPositionsM.forEach((point, index) =>
    assertFiniteVector(point, 'restPositionsM[' + index + ']'),
  );
  assertFiniteVector(warpDirectionRest, 'warpDirectionRest');
  if (!Number.isFinite(minDoubleAreaM2) || minDoubleAreaM2 <= 0) {
    throw new RangeError('minDoubleAreaM2 must be finite and > 0.');
  }

  const warpLength = Math.hypot(warpDirectionRest[0], warpDirectionRest[1]);
  if (warpLength <= Number.EPSILON) throw new RangeError('warpDirectionRest must be non-zero.');
  const warp: Vec2 = [warpDirectionRest[0] / warpLength, warpDirectionRest[1] / warpLength];
  const weft: Vec2 = [-warp[1], warp[0]];
  const edge1: Vec2 = [
    restPositionsM[1][0] - restPositionsM[0][0],
    restPositionsM[1][1] - restPositionsM[0][1],
  ];
  const edge2: Vec2 = [
    restPositionsM[2][0] - restPositionsM[0][0],
    restPositionsM[2][1] - restPositionsM[0][1],
  ];
  const d00 = edge1[0] * warp[0] + edge1[1] * warp[1];
  const d01 = edge2[0] * warp[0] + edge2[1] * warp[1];
  const d10 = edge1[0] * weft[0] + edge1[1] * weft[1];
  const d11 = edge2[0] * weft[0] + edge2[1] * weft[1];
  const determinant = d00 * d11 - d01 * d10;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= minDoubleAreaM2) {
    throw new RangeError('Degenerate rest triangle: double area is below the accepted threshold.');
  }

  const inverseDeterminant = 1 / determinant;
  return {
    inverseRestMatrixInvM: [
      d11 * inverseDeterminant,
      -d01 * inverseDeterminant,
      -d10 * inverseDeterminant,
      d00 * inverseDeterminant,
    ],
    restAreaM2: Math.abs(determinant) * 0.5,
    warpDirectionRest: warp,
    weftDirectionRest: weft,
  };
}

export function evaluateTriangleStrain(
  positionsM: TrianglePositions,
  restFrame: TriangleRestFrame,
): TriangleStrain {
  positionsM.forEach((point, index) => assertFiniteVector(point, 'positionsM[' + index + ']'));
  const edge1 = subtract3(positionsM[1], positionsM[0]);
  const edge2 = subtract3(positionsM[2], positionsM[0]);
  const inverse = restFrame.inverseRestMatrixInvM;
  const warp = scaledAdd3(edge1, inverse[0], edge2, inverse[2]);
  const weft = scaledAdd3(edge1, inverse[1], edge2, inverse[3]);
  return {
    deformationGradient: [warp, weft],
    warp: 0.5 * (squaredLength3(warp) - 1),
    weft: 0.5 * (squaredLength3(weft) - 1),
    shear: dot3(warp, weft),
  };
}

function constraintForMode(strain: TriangleStrain, mode: TriangleStrainMode): number {
  return strain[mode];
}

function gradientsForMode(
  strain: TriangleStrain,
  inverse: TriangleRestFrame['inverseRestMatrixInvM'],
  mode: TriangleStrainMode,
): readonly [Vec3, Vec3, Vec3] {
  const warpCoefficients = [-(inverse[0] + inverse[2]), inverse[0], inverse[2]] as const;
  const weftCoefficients = [-(inverse[1] + inverse[3]), inverse[1], inverse[3]] as const;
  const [warp, weft] = strain.deformationGradient;
  return [0, 1, 2].map((index): Vec3 => {
    if (mode === 'warp') return scaledAdd3(warp, warpCoefficients[index], warp, 0);
    if (mode === 'weft') return scaledAdd3(weft, weftCoefficients[index], weft, 0);
    return scaledAdd3(weft, warpCoefficients[index], warp, weftCoefficients[index]);
  }) as unknown as readonly [Vec3, Vec3, Vec3];
}

/** Applies one scalar XPBD Gauss-Seidel correction and returns a new position tuple. */
export function solveTriangleStrainXpbdCorrection(
  positionsM: TrianglePositions,
  restFrame: TriangleRestFrame,
  options: TriangleStrainCorrectionOptions,
): TriangleStrainCorrection {
  if (!Number.isFinite(options.dtS) || options.dtS <= 0) {
    throw new RangeError('dtS must be finite and > 0.');
  }
  if (!Number.isFinite(options.complianceInvNm) || options.complianceInvNm < 0) {
    throw new RangeError('complianceInvNm must be finite and >= 0.');
  }
  if (!Number.isFinite(options.lambda)) throw new RangeError('lambda must be finite.');
  if (
    !options.inverseMassesKgInv.every(
      (inverseMass) => Number.isFinite(inverseMass) && inverseMass >= 0,
    )
  ) {
    throw new RangeError('inverseMassesKgInv must contain finite non-negative values.');
  }

  const strainBefore = evaluateTriangleStrain(positionsM, restFrame);
  const constraintBefore = constraintForMode(strainBefore, options.mode);
  const gradients = gradientsForMode(strainBefore, restFrame.inverseRestMatrixInvM, options.mode);
  const alphaTilde = options.complianceInvNm / (options.dtS * options.dtS);
  let denominator = alphaTilde;
  for (let index = 0; index < 3; index += 1) {
    denominator += options.inverseMassesKgInv[index] * squaredLength3(gradients[index]);
  }
  if (!Number.isFinite(denominator) || denominator <= Number.EPSILON) {
    throw new RangeError('Triangle strain correction has zero or invalid effective mass.');
  }

  const deltaLambda = (-constraintBefore - alphaTilde * options.lambda) / denominator;
  const corrections = gradients.map((gradient, index): Vec3 => {
    const scale = options.inverseMassesKgInv[index] * deltaLambda;
    return [gradient[0] * scale, gradient[1] * scale, gradient[2] * scale];
  }) as unknown as TrianglePositions;
  const positions = positionsM.map(
    (position, index): Vec3 => [
      position[0] + corrections[index][0],
      position[1] + corrections[index][1],
      position[2] + corrections[index][2],
    ],
  ) as unknown as TrianglePositions;
  return {
    positions,
    correctionsM: corrections,
    constraintBefore,
    constraintAfter: constraintForMode(evaluateTriangleStrain(positions, restFrame), options.mode),
    deltaLambda,
    lambda: options.lambda + deltaLambda,
  };
}
