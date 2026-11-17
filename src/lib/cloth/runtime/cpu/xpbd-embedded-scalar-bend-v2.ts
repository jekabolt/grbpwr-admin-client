/** Readable reference for the V2 bend step. Algebra is f64; successful XYZ/lambda writes are f32.
 * This is not a claim of bit-exact WGSL arithmetic or global cloth stability.
 */
export type BendVectorV2 = readonly [number, number, number];
export type BendParticleV2 = readonly [number, number, number, number];
export type BendQuadV2<T> = readonly [T, T, T, T];
export const XPBD_BEND_ALTITUDE_TRUST_DIVISOR_V2 = 8;
export const XPBD_BEND_EXACT_PROJECTED_AREA_FRACTION_FLOOR_V2 = 37 / 64;

const sub = (a: BendVectorV2, b: BendVectorV2): BendVectorV2 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: BendVectorV2, b: BendVectorV2) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: BendVectorV2, b: BendVectorV2): BendVectorV2 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a: BendVectorV2, s: number): BendVectorV2 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: BendVectorV2) => Math.sqrt(dot(a, a));
const xyz = (a: BendParticleV2): BendVectorV2 => [a[0], a[1], a[2]];
function finite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 1e30)
    throw new RangeError(`${label} must be finite and within the kernel domain.`);
  return value;
}
function normal(positions: BendQuadV2<BendVectorV2>, second: boolean): BendVectorV2 {
  const [a, b, c, d] = positions;
  return second ? cross(sub(b, d), sub(a, d)) : cross(sub(a, c), sub(b, c));
}

export function evaluateXpbdEmbeddedScalarBendGeometryV2(input: BendQuadV2<BendVectorV2>) {
  if (!Array.isArray(input) || input.length !== 4) throw new TypeError('Expected four positions.');
  for (const point of input) {
    if (!Array.isArray(point) || point.length !== 3) throw new TypeError('Expected XYZ.');
    point.forEach((value) => finite(value, 'position'));
  }
  const [a, b, c, d] = input;
  const edge = sub(b, a),
    edgeLength = length(edge);
  finite(edgeLength, 'bend edge length');
  if (!(edgeLength > 1e-12)) throw new RangeError('Bend edge is degenerate.');
  const firstA = sub(a, c),
    firstB = sub(b, c),
    secondA = sub(b, d),
    secondB = sub(a, d);
  const rawNormalA = normal(input, false),
    rawNormalB = normal(input, true);
  const normalLengthA = length(rawNormalA),
    normalLengthB = length(rawNormalB);
  const scaleA = length(firstA) * length(firstB),
    scaleB = length(secondA) * length(secondB);
  [normalLengthA, normalLengthB, scaleA, scaleB].forEach((value) =>
    finite(value, 'bend incident triangle scale'),
  );
  if (
    !(scaleA > 0 && scaleB > 0) ||
    normalLengthA <= 1e-10 * scaleA ||
    normalLengthB <= 1e-10 * scaleB
  )
    throw new RangeError('Bend incident triangle is degenerate.');
  const normalA = scale(rawNormalA, 1 / (normalLengthA * normalLengthA));
  const normalB = scale(rawNormalB, 1 / (normalLengthB * normalLengthB));
  const gradients: BendQuadV2<BendVectorV2> = [
    [0, 1, 2].map(
      (axis) =>
        -(
          (normalA[axis]! * dot(sub(c, b), edge)) / edgeLength +
          (normalB[axis]! * dot(sub(d, b), edge)) / edgeLength
        ),
    ) as unknown as BendVectorV2,
    [0, 1, 2].map(
      (axis) =>
        -(
          (normalA[axis]! * dot(sub(a, c), edge)) / edgeLength +
          (normalB[axis]! * dot(sub(a, d), edge)) / edgeLength
        ),
    ) as unknown as BendVectorV2,
    scale(normalA, -edgeLength),
    scale(normalB, -edgeLength),
  ];
  const unitA = scale(rawNormalA, 1 / normalLengthA),
    unitB = scale(rawNormalB, 1 / normalLengthB);
  const angleRad = Math.atan2(
    dot(cross(unitA, unitB), scale(edge, 1 / edgeLength)),
    Math.max(-1, Math.min(1, dot(unitA, unitB))),
  );
  const minimumAltitudeA = normalLengthA / Math.max(edgeLength, length(firstA), length(firstB));
  const minimumAltitudeB = normalLengthB / Math.max(edgeLength, length(secondA), length(secondB));
  const trustRadiusM =
    Math.min(minimumAltitudeA, minimumAltitudeB) / XPBD_BEND_ALTITUDE_TRUST_DIVISOR_V2;
  [angleRad, trustRadiusM, ...gradients.flat()].forEach((value) => finite(value, 'bend geometry'));
  if (!(trustRadiusM > 0)) throw new RangeError('Bend trust radius is degenerate.');
  return Object.freeze({
    angleRad,
    gradients,
    rawNormalA,
    rawNormalB,
    minimumAltitudeA,
    minimumAltitudeB,
    trustRadiusM,
  });
}

export type XpbdEmbeddedScalarBendOracleInputV2 = Readonly<{
  positions: BendQuadV2<BendParticleV2>;
  restAngleRad: number;
  previousLambdaKgM2: number;
  complianceInvNm: number;
  dtS: number;
}>;

/** No authority is inferred from this arithmetic oracle. Invalid states throw, matching a fatal
 * invalid-counter event in the GPU kernel. Supply f32 inputs when comparing GPU buffer semantics.
 */
export function solveXpbdEmbeddedScalarBendConstraintV2ForOracle(
  input: XpbdEmbeddedScalarBendOracleInputV2,
) {
  if (!Array.isArray(input.positions) || input.positions.length !== 4)
    throw new TypeError('Expected four particles.');
  for (const particle of input.positions) {
    if (!Array.isArray(particle) || particle.length !== 4)
      throw new TypeError('Expected XYZ and inverse mass.');
    particle.forEach((value) => finite(value, 'particle'));
    if (particle[3] < 0) throw new RangeError('Inverse mass must be non-negative.');
  }
  finite(input.restAngleRad, 'rest angle');
  finite(input.previousLambdaKgM2, 'lambda');
  if (finite(input.complianceInvNm, 'compliance') < 0 || finite(input.dtS, 'dt') <= 0)
    throw new RangeError('Expected non-negative compliance and positive dt.');
  const before = input.positions.map(xyz) as unknown as BendQuadV2<BendVectorV2>;
  const geometry = evaluateXpbdEmbeddedScalarBendGeometryV2(before);
  const residual = geometry.angleRad - input.restAngleRad;
  const constraintValue = Math.atan2(Math.sin(residual), Math.cos(residual));
  const alpha = input.complianceInvNm / (input.dtS * input.dtS);
  const denominator = geometry.gradients.reduce(
    (sum, gradient, index) => sum + input.positions[index]![3] * dot(gradient, gradient),
    alpha,
  );
  finite(alpha, 'alpha');
  finite(denominator, 'denominator');
  if (!(denominator > 1e-12)) throw new RangeError('Bend effective mass is invalid.');
  const rawDeltaLambdaKgM2 = finite(
    (-constraintValue - alpha * input.previousLambdaKgM2) / denominator,
    'raw delta lambda',
  );
  const rawCorrections = geometry.gradients.map((gradient, index) =>
    scale(gradient, input.positions[index]![3] * rawDeltaLambdaKgM2),
  );
  const rawMaximumCorrectionM = Math.max(...rawCorrections.map(length));
  finite(rawMaximumCorrectionM, 'raw correction');
  const limiterScale =
    rawMaximumCorrectionM > geometry.trustRadiusM
      ? geometry.trustRadiusM / rawMaximumCorrectionM
      : 1;
  const appliedDeltaLambdaKgM2 = rawDeltaLambdaKgM2 * limiterScale;
  const lambdaKgM2 = Math.fround(input.previousLambdaKgM2 + appliedDeltaLambdaKgM2);
  const positions = input.positions.map((particle, index): BendParticleV2 => {
    if (particle[3] === 0) return [particle[0], particle[1], particle[2], particle[3]];
    const delta = scale(rawCorrections[index]!, limiterScale);
    return [
      Math.fround(particle[0] + delta[0]),
      Math.fround(particle[1] + delta[1]),
      Math.fround(particle[2] + delta[2]),
      particle[3],
    ];
  }) as unknown as BendQuadV2<BendParticleV2>;
  [lambdaKgM2, ...positions.flat()].forEach((value) => finite(value, 'candidate'));
  const candidate = positions.map(xyz) as unknown as BendQuadV2<BendVectorV2>;
  const newA = normal(candidate, false),
    newB = normal(candidate, true);
  const projectedA = dot(geometry.rawNormalA, newA),
    projectedB = dot(geometry.rawNormalB, newB);
  [...newA, ...newB].forEach((value) => finite(value, 'candidate normal'));
  [projectedA, projectedB].forEach((value) => finite(value, 'candidate projected area'));
  if (!(projectedA > 0 && projectedB > 0))
    throw new RangeError('Rounded candidate lost an incident triangle orientation.');
  return Object.freeze({
    positions,
    lambdaKgM2,
    rawDeltaLambdaKgM2,
    appliedDeltaLambdaKgM2,
    limiterScale,
    limitedStep: limiterScale < 1,
    trustRadiusM: geometry.trustRadiusM,
    rawMaximumCorrectionM,
    maximumCorrectionM: Math.max(
      ...candidate.map((point, index) => length(sub(point, before[index]!))),
    ),
    orientedAreaRatios: [
      projectedA / dot(geometry.rawNormalA, geometry.rawNormalA),
      projectedB / dot(geometry.rawNormalB, geometry.rawNormalB),
    ] as const,
    constraintBeforeRad: constraintValue,
    geometryBefore: geometry,
    arithmetic: 'f64-algebra-f32-position-and-lambda-writes' as const,
    globalClothStabilityClaimed: false as const,
  });
}
