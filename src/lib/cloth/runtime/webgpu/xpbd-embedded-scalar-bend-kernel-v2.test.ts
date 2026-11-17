import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  evaluateXpbdEmbeddedScalarBendGeometryV2,
  solveXpbdEmbeddedScalarBendConstraintV2ForOracle,
  XPBD_BEND_EXACT_PROJECTED_AREA_FRACTION_FLOOR_V2,
  type BendParticleV2,
  type BendQuadV2,
  type BendVectorV2,
} from '../cpu/xpbd-embedded-scalar-bend-v2';
import {
  XPBD_EMBEDDED_SCALAR_BEND_ABI_V1,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1,
  XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1,
  createXpbdEmbeddedScalarBendColorScheduleV1,
  packXpbdEmbeddedScalarBendColorParamsV1,
  validateXpbdEmbeddedScalarBendBufferContractV1,
} from './xpbd-embedded-scalar-bend-kernel-v1';
import {
  XPBD_EMBEDDED_SCALAR_BEND_ABI_V2,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_OFFSETS_V2,
  XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2,
  XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
  XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2,
  createXpbdEmbeddedScalarBendColorScheduleV2,
  getXpbdEmbeddedScalarBendPipelineIdentityV2,
  hashXpbdEmbeddedScalarBendSourceV2,
  packXpbdEmbeddedScalarBendColorParamsV2,
  validateXpbdEmbeddedScalarBendBufferContractV2,
  xpbdEmbeddedScalarBendShaderDescriptorV2,
} from './xpbd-embedded-scalar-bend-kernel-v2';

// Exact recorded R4 CPU replay input immediately before color 0, constraint 27, quad
// [86,160,85,87]. This is arithmetic evidence, not a producer or runtime-authority fixture.
// Replay's source world XYZW SHA: 4835a93478f94efb0c2482c406629f5d1d1e443474a756e7e097721675dd0aba.
const witness: BendQuadV2<BendParticleV2> = [
  [0.13676200807094574, 1.1144696474075317, 0.0922921672463417, 0],
  [0.1396326869726181, 1.099010705947876, 0.09326992928981781, 10924.8837890625],
  [0.13982687890529633, 1.1144696474075317, 0.08142495900392532, 0],
  [0.13285396993160248, 1.1144696474075317, 0.10288538038730621, 0],
];
const parameters = {
  restAngleRad: 0,
  previousLambdaKgM2: 0,
  complianceInvNm: Math.fround(0.0006),
  dtS: Math.fround(1 / 120),
} as const;
const xyz = (p: BendParticleV2): BendVectorV2 => [p[0], p[1], p[2]];
const dot = (a: BendVectorV2, b: BendVectorV2) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: BendVectorV2, b: BendVectorV2): BendVectorV2 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const cross = (a: BendVectorV2, b: BendVectorV2): BendVectorV2 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: BendVectorV2) => Math.sqrt(dot(a, a));
const bytes = (values: readonly number[]) => new Uint8Array(new Float32Array(values).buffer);

describe('embedded scalar bend V2 CPU arithmetic and local geometric safeguard', () => {
  it('bounds the genuine three-pinned near-null witness and scales lambda with the displacement', () => {
    const before = bytes(witness.flat());
    const result = solveXpbdEmbeddedScalarBendConstraintV2ForOracle({
      positions: witness,
      ...parameters,
    });
    expect(result.constraintBeforeRad).toBeCloseTo(0.07707240057527788, 13);
    expect(result.rawMaximumCorrectionM).toBeCloseTo(0.08031510176728167, 13);
    expect(result.rawDeltaLambdaKgM2).toBeCloseTo(-7.667471504367638e-6, 16);
    expect(result.limitedStep).toBe(true);
    expect(result.limiterScale).toBeGreaterThan(0);
    expect(result.limiterScale).toBeLessThan(1);
    expect(result.appliedDeltaLambdaKgM2).toBe(result.rawDeltaLambdaKgM2 * result.limiterScale);
    expect(result.lambdaKgM2).toBe(Math.fround(result.appliedDeltaLambdaKgM2));
    // The mathematical radius applies before f32 writes; this term bounds rounding of XYZ.
    const writeRoundingBound =
      Math.sqrt(3) * Math.max(...witness.flatMap(xyz).map(Math.abs)) * 2 ** -24;
    expect(result.maximumCorrectionM).toBeLessThanOrEqual(result.trustRadiusM + writeRoundingBound);
    expect(result.orientedAreaRatios.every((ratio) => ratio > 37 / 64)).toBe(true);
    expect(bytes(result.positions.map((p) => p[3]))).toEqual(bytes(witness.map((p) => p[3])));
    for (const index of [0, 2, 3])
      expect(bytes(result.positions[index]!)).toEqual(bytes(witness[index]!));
    expect(bytes(witness.flat())).toEqual(before);
    expect(result.arithmetic).toBe('f64-algebra-f32-position-and-lambda-writes');
    expect(result.globalClothStabilityClaimed).toBe(false);
  });

  it('retains the signed-dihedral derivative verified by independent central differences', () => {
    const input = witness.map(xyz) as unknown as BendQuadV2<BendVectorV2>;
    const geometry = evaluateXpbdEmbeddedScalarBendGeometryV2(input);
    const epsilon = 1e-7;
    for (let vertex = 0; vertex < 4; vertex++)
      for (let axis = 0; axis < 3; axis++) {
        const plus = input.map((p) => [...p]) as [number[], number[], number[], number[]];
        const minus = input.map((p) => [...p]) as [number[], number[], number[], number[]];
        plus[vertex]![axis]! += epsilon;
        minus[vertex]![axis]! -= epsilon;
        const derivative =
          (evaluateXpbdEmbeddedScalarBendGeometryV2(plus as unknown as BendQuadV2<BendVectorV2>)
            .angleRad -
            evaluateXpbdEmbeddedScalarBendGeometryV2(minus as unknown as BendQuadV2<BendVectorV2>)
              .angleRad) /
          (2 * epsilon);
        expect(Math.abs(derivative - geometry.gradients[vertex]![axis]!)).toBeLessThan(2e-7);
      }
  });

  it('leaves a genuinely tiny unconstrained step equal to the unchanged unbounded XPBD equation', () => {
    const positions = witness.map((p) => [
      p[0],
      p[1],
      p[2],
      1,
    ]) as unknown as BendQuadV2<BendParticleV2>;
    const geometry = evaluateXpbdEmbeddedScalarBendGeometryV2(
      positions.map(xyz) as unknown as BendQuadV2<BendVectorV2>,
    );
    const restAngleRad = geometry.angleRad - 1e-7;
    const previousLambdaKgM2 = 1e-12;
    const result = solveXpbdEmbeddedScalarBendConstraintV2ForOracle({
      ...parameters,
      positions,
      restAngleRad,
      previousLambdaKgM2,
    });
    const alpha = parameters.complianceInvNm / parameters.dtS ** 2;
    const residual = Math.atan2(
      Math.sin(geometry.angleRad - restAngleRad),
      Math.cos(geometry.angleRad - restAngleRad),
    );
    const deltaLambda =
      (-residual - alpha * previousLambdaKgM2) /
      (alpha + geometry.gradients.reduce((sum, g) => sum + dot(g, g), 0));
    expect(result.limitedStep).toBe(false);
    expect(result.limiterScale).toBe(1);
    expect(result.lambdaKgM2).toBe(Math.fround(previousLambdaKgM2 + deltaLambda));
    const expected = positions.map((p, vertex) => [
      ...xyz(p).map((value, axis) =>
        Math.fround(value + deltaLambda * geometry.gradients[vertex]![axis]!),
      ),
      p[3],
    ]);
    expect(bytes(result.positions.flat())).toEqual(bytes(expected.flat()));
  });

  it('preserves pinned signed-zero bytes, keeps W, and retains the existing accumulated lambda', () => {
    const positions: BendQuadV2<BendParticleV2> = [
      [-0, 0, 0, -0],
      [1, 0, 0, 1],
      [0, 1, 0, 0],
      [0, -1, 0.01, 0],
    ];
    const result = solveXpbdEmbeddedScalarBendConstraintV2ForOracle({
      ...parameters,
      positions,
      previousLambdaKgM2: 0.0001,
    });
    expect(bytes(result.positions[0])).toEqual(bytes(positions[0]));
    expect(bytes(result.positions.map((p) => p[3]))).toEqual(bytes(positions.map((p) => p[3])));
    expect(result.lambdaKgM2).toBe(Math.fround(0.0001 + result.appliedDeltaLambdaKgM2));
  });

  it('checks the h/8 analytic area margin across aspect ratios and independent bounded displacements', () => {
    let state = 1327;
    const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (const height of [0.001, 0.1, 1, 10])
      for (let sample = 0; sample < 64; sample++) {
        const triangle: readonly BendVectorV2[] = [
          [-1, 0, 0],
          [1, 0, 0],
          [random() * 2 - 1, height, 0],
        ];
        const edges = [
          sub(triangle[1]!, triangle[0]!),
          sub(triangle[2]!, triangle[1]!),
          sub(triangle[0]!, triangle[2]!),
        ];
        const oldNormal = cross(sub(triangle[1]!, triangle[0]!), sub(triangle[2]!, triangle[0]!));
        const a2 = norm(oldNormal),
          perimeter = edges.reduce((sum, edge) => sum + norm(edge), 0),
          radius = a2 / Math.max(...edges.map(norm)) / 8;
        expect((radius * perimeter + 3 * radius ** 2) / a2).toBeLessThanOrEqual(27 / 64 + 1e-14);
        const moved = triangle.map((p): BendVectorV2 => {
          const direction: BendVectorV2 = [random() - 0.5, random() - 0.5, random() - 0.5];
          const amount = radius / norm(direction);
          return [
            p[0] + direction[0] * amount,
            p[1] + direction[1] * amount,
            p[2] + direction[2] * amount,
          ];
        });
        const candidateNormal = cross(sub(moved[1]!, moved[0]!), sub(moved[2]!, moved[0]!));
        expect(dot(oldNormal, candidateNormal) / dot(oldNormal, oldNormal)).toBeGreaterThanOrEqual(
          XPBD_BEND_EXACT_PROJECTED_AREA_FRACTION_FLOOR_V2 - 1e-12,
        );
      }
  });

  it('rejects degenerate geometry, invalid physical inputs, and f32 candidate collapse instead of committing', () => {
    const solve = (positions: BendQuadV2<BendParticleV2>, override = {}) =>
      solveXpbdEmbeddedScalarBendConstraintV2ForOracle({ positions, ...parameters, ...override });
    const degenerate: BendQuadV2<BendParticleV2> = [
      [0, 0, 0, 1],
      [1, 0, 0, 1],
      [2, 0, 0, 1],
      [0, 1, 0, 1],
    ];
    expect(() => solve(degenerate)).toThrow(/degenerate/);
    expect(() => solve(witness, { dtS: 0 })).toThrow();
    expect(() => solve(witness, { complianceInvNm: -1 })).toThrow();
    expect(() => solve(witness, { previousLambdaKgM2: NaN })).toThrow();
    const negativeMass = witness.map((p, index) => [
      p[0],
      p[1],
      p[2],
      index === 1 ? -1 : p[3],
    ]) as unknown as BendQuadV2<BendParticleV2>;
    expect(() => solve(negativeMass)).toThrow(/mass/);
    const pinned = witness.map((p) => [
      p[0],
      p[1],
      p[2],
      0,
    ]) as unknown as BendQuadV2<BendParticleV2>;
    expect(() => solve(pinned, { complianceInvNm: 0 })).toThrow(/effective mass/);
    // Deliberately non-f32 input demonstrates the oracle's final write guard, not GPU authority.
    const collapse: BendQuadV2<BendParticleV2> = [
      [1e8, 1e8, 0, 1],
      [1e8 + 1, 1e8, 0, 1],
      [1e8, 1e8 + 1, 0, 1],
      [1e8, 1e8 - 1, 0, 1],
    ];
    expect(() => solve(collapse)).toThrow(/Rounded candidate/);
    // All coordinates below are exactly f32. Finite f64 arithmetic must not widen the
    // shader's explicit abs(value)<1e30 domain for normals, scales or projected areas.
    const projectedAreaOverflow: BendQuadV2<BendParticleV2> = [
      [0, 0, 0, 1],
      [1e8, 0, 0, 1],
      [0, 1e8, 0, 1],
      [0, -1e8, 0, 1],
    ];
    expect(() => solve(projectedAreaOverflow)).toThrow(/candidate projected area/);
    const triangleScaleOverflow = projectedAreaOverflow.map((p) => [
      Math.fround(p[0] * 1e8),
      Math.fround(p[1] * 1e8),
      p[2],
      p[3],
    ]) as unknown as BendQuadV2<BendParticleV2>;
    expect(() => solve(triangleScaleOverflow)).toThrow(/incident triangle scale/);
  });
});

describe('V2 shader identity and unchanged six-binding/color ABI', () => {
  it('pins its distinct generated source and fails closed without SHA-256', async () => {
    const crypto = webcrypto as unknown as Crypto;
    expect(createHash('sha256').update(XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1).digest('hex')).toBe(
      XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1,
    );
    expect(XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2).toBe('xpbd-embedded-scalar-bend-kernel/v2');
    expect(await getXpbdEmbeddedScalarBendPipelineIdentityV2({ crypto })).toEqual({
      sha256: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
      entryPoint: XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2,
    });
    expect(
      await hashXpbdEmbeddedScalarBendSourceV2(XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2 + '\n', {
        crypto,
      }),
    ).not.toBe(XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2);
    await expect(getXpbdEmbeddedScalarBendPipelineIdentityV2({ crypto: null })).rejects.toThrow(
      /Web Crypto/,
    );
    expect(xpbdEmbeddedScalarBendShaderDescriptorV2().code).toBe(XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2);
    expect(XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2).not.toContain('solveXpbdEmbeddedScalarBendColorV1');
    expect(
      [...XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2.matchAll(/@binding\((\d)\)/g)].map((m) => Number(m[1])),
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('reuses exact V1 schedule and params and widens only the diagnostic resource to two words', () => {
    expect(createXpbdEmbeddedScalarBendColorScheduleV2).toBe(
      createXpbdEmbeddedScalarBendColorScheduleV1,
    );
    expect(packXpbdEmbeddedScalarBendColorParamsV2).toBe(packXpbdEmbeddedScalarBendColorParamsV1);
    const params = {
      constraintOffset: 7,
      constraintCount: 12,
      complianceInvNm: 0.0006,
      dtS: 1 / 120,
    };
    expect(new Uint8Array(packXpbdEmbeddedScalarBendColorParamsV2(params))).toEqual(
      new Uint8Array(packXpbdEmbeddedScalarBendColorParamsV1(params)),
    );
    for (const name of [
      'positionsMInvMassKg',
      'vertexQuads',
      'restAnglesRad',
      'lambdasKgM2',
      'colorParams',
    ] as const)
      expect(XPBD_EMBEDDED_SCALAR_BEND_ABI_V2.bindings[name]).toBe(
        XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.bindings[name],
      );
    expect(XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2).toBe(8);
    expect(XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_OFFSETS_V2).toEqual({
      invalidConstraintCount: 0,
      limitedStepCount: 4,
    });
    const resources = {
      positionsMInvMassKg: { size: 64, usage: 0x80 },
      vertexQuads: { size: 16, usage: 0x80 },
      restAnglesRad: { size: 4, usage: 0x80 },
      lambdasKgM2: { size: 4, usage: 0x80 },
      colorParams: { size: 16, usage: 0x48 },
      invalidConstraintCount: { size: 8, usage: 0x8c },
    };
    const counts = { particleCount: 4, constraintCount: 1 };
    expect(() => validateXpbdEmbeddedScalarBendBufferContractV2(resources, counts)).not.toThrow();
    expect(() => validateXpbdEmbeddedScalarBendBufferContractV1(resources, counts)).toThrow();
    for (const size of [0, 4, 12])
      expect(() =>
        validateXpbdEmbeddedScalarBendBufferContractV2(
          { ...resources, invalidConstraintCount: { size, usage: 0x8c } },
          counts,
        ),
      ).toThrow();
    expect(() =>
      validateXpbdEmbeddedScalarBendBufferContractV2(
        { ...resources, invalidConstraintCount: { size: 8, usage: 0x80 } },
        counts,
      ),
    ).toThrow();
    expect(() =>
      validateXpbdEmbeddedScalarBendBufferContractV2(
        { ...resources, positionsMInvMassKg: { size: 60, usage: 0x80 } },
        counts,
      ),
    ).toThrow();
  });

  it('places fatal rounded-candidate guards before writes and gives limited commits a separate saturating counter', () => {
    const source = XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2;
    const guard = source.indexOf('projectedAreaA<=0.0||projectedAreaB<=0.0');
    const limited = source.indexOf('if(limiterScale<1.0){recordLimitedStep();}');
    const commit = source.indexOf('lambdas[constraintIndex]=nextLambda');
    expect(guard).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(guard);
    expect(commit).toBeGreaterThan(limited);
    expect(source).toContain('oldValue==0xffffffffu');
    expect(source).not.toContain('ptr<storage');
    expect(source).toContain('rawDeltaLambda*limiterScale');
    expect(source).toContain('previousLambda+deltaLambda');
    expect(XPBD_EMBEDDED_SCALAR_BEND_ABI_V2.safeguard.protectsOtherIncidentTriangles).toBe(false);
    expect(XPBD_EMBEDDED_SCALAR_BEND_ABI_V2.safeguard.globalClothStabilityClaimed).toBe(false);
  });
});
