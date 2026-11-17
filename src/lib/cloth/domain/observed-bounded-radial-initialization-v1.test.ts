import { describe, expect, it } from 'vitest';
import { createTriangleRestFrame, type Vec3 } from '../runtime/cpu/triangle-strain-oracle';
import {
  assertObservedBoundedRadialInitializationPolicyV1,
  buildObservedBoundedRadialInitializationV1 as build,
  isObservedBoundedRadialInitializationPolicyV1 as matches,
  OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1 as POLICY,
  type ObservedBoundedRadialInitializationInputV1,
} from './observed-bounded-radial-initialization-v1';

const acceptance = {
  maxAbsEdgeStretchDelta: 0.01,
  maxAbsAreaScaleDelta: 0.02,
  minNormalizedOrientationDot: 0.999,
  maxAbsWarpGreenStrain: 0.01,
  maxAbsWeftGreenStrain: 0.01,
  maxAbsShear: 0.01,
};
const fullPolicy = {
  ...POLICY,
  authoredClearanceM: 0.008,
  clothThicknessM: 0.002,
  mapping: {
    kind: 'authored-annular-sector-conical' as const,
    id: 'canonical-medium-authored-annular-mapping',
    revision: 'canonical-medium-authored-annular-mapping-v1',
  },
  retention: {
    kind: 'waist-boundary-support' as const,
    id: 'canonical-medium-waist-boundary-support',
    revision: 'canonical-medium-waist-boundary-support-v1',
  },
};

/** Synthetic faceted cylinders exercise the actual section and strain kernels, not source admission. */
function cylinder(radius: number, top: number, bottom: number) {
  const n = 64;
  const positions = new Float32Array(n * 2 * 3);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n; i++) {
      positions[(row * n + i) * 3] = radius * Math.cos((i * 2 * Math.PI) / n);
      positions[(row * n + i) * 3 + 1] = row === 0 ? top : bottom;
      positions[(row * n + i) * 3 + 2] = radius * Math.sin((i * 2 * Math.PI) / n);
    }
  const triangles: number[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    triangles.push(i, next, i + n, next, next + n, i + n);
  }
  return { positions, triangles: Uint32Array.from(triangles) };
}
function restFrames(p: Float32Array, triangles: Uint32Array): ArrayBuffer {
  const buffer = new ArrayBuffer((triangles.length / 3) * 32);
  const view = new DataView(buffer);
  const point = (v: number): Vec3 => [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!];
  for (let t = 0; t < triangles.length / 3; t++) {
    const a = point(triangles[t * 3]!),
      b = point(triangles[t * 3 + 1]!),
      c = point(triangles[t * 3 + 2]!);
    const u = b.map((v, i) => v - a[i]!),
      v = c.map((v, i) => v - a[i]!);
    const length = Math.hypot(...u),
      x = u.reduce((s, value, i) => s + value * v[i]!, 0) / length;
    const y = Math.sqrt(Math.max(0, v.reduce((s, value) => s + value * value, 0) - x * x));
    const frame = createTriangleRestFrame([
      [0, 0],
      [length, 0],
      [x, y],
    ]);
    frame.inverseRestMatrixInvM.forEach((value, i) => view.setFloat32(t * 32 + i * 4, value, true));
    view.setFloat32(t * 32 + 16, frame.restAreaM2, true);
  }
  return buffer;
}
function fixture(bodyRadius = 0.141): ObservedBoundedRadialInitializationInputV1 {
  const garment = cylinder(0.15, 0, -0.2),
    body = cylinder(bodyRadius, 0.6, 0.2);
  return {
    localPositions3M: garment.positions,
    garmentTriangles: garment.triangles,
    bodyPositions3M: body.positions,
    bodyTriangles: body.triangles,
    translationM: [0, 0.5, 0],
    garmentWaistYM: 0.5,
    garmentHemYM: 0.3,
    triangleRestFrames: restFrames(garment.positions, garment.triangles),
    acceptance,
  };
}

describe('bounded world radial initialization (pure synthetic geometry; no admission)', () => {
  it('requires the exact reserved policy revision and fixed complete authored recipe', () => {
    expect(matches(POLICY)).toBe(true);
    expect(matches({ id: 'legacy-policy', revision: 'legacy-v1' })).toBe(false);
    expect(() => matches({ ...POLICY, revision: 'unknown-v2' })).toThrow('revision');
    expect(() => assertObservedBoundedRadialInitializationPolicyV1(fullPolicy)).not.toThrow();
    expect(() =>
      assertObservedBoundedRadialInitializationPolicyV1({
        ...fullPolicy,
        authoredClearanceM: 0.007,
      }),
    ).toThrow('exact authored');
    expect(() =>
      assertObservedBoundedRadialInitializationPolicyV1({ ...fullPolicy, clothThicknessM: 0.001 }),
    ).toThrow('exact authored');
    expect(() =>
      assertObservedBoundedRadialInitializationPolicyV1({
        ...fullPolicy,
        mapping: { ...fullPolicy.mapping, revision: 'other' },
      }),
    ).toThrow('exact authored');
    expect(() =>
      assertObservedBoundedRadialInitializationPolicyV1({
        ...fullPolicy,
        retention: { ...fullPolicy.retention, id: 'other' },
      }),
    ).toThrow('exact authored');
  });

  it('retains byte-exact rigid initialization when the actual section already clears', () => {
    const input = fixture(0.13),
      result = build(input);
    expect(result.report.passed).toBe(true);
    expect(result.report.radialScale).toBe(1);
    expect(result.report.applied).toBe(false);
    expect(result.positions3M).toEqual(
      Float32Array.from(input.localPositions3M, (v, i) =>
        Math.fround(v + input.translationM[i % 3]!),
      ),
    );
    expect(
      result.report.baselineSection.ok &&
        result.report.baselineSection.summary.initialClearanceQualified,
    ).toBe(true);
    expect(result.report.claims.runtimeAuthority).toBe(false);
    expect(result.report.claims.continuousClearanceProven).toBe(false);
  });

  it('runs real 33-section correction once and preserves all borrowed input/rest bytes', () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = build(input),
      repeat = build(input);
    expect(result.report.baselineSection.ok && result.report.baselineSection.status).toBe(
      'compatible-with-stretch-budget-only',
    );
    expect(result.report.passed).toBe(true);
    expect(result.report.radialScale).toBeGreaterThan(1);
    expect(result.report.radialScale).toBeLessThan(1.01);
    expect(
      result.report.candidateSection.ok && result.report.candidateSection.sections,
    ).toHaveLength(33);
    expect(
      result.report.candidateSection.ok &&
        result.report.candidateSection.summary.initialClearanceFailureCount,
    ).toBe(0);
    expect(repeat).toEqual(result);
    expect(input).toEqual(before);
    expect(new Uint8Array(input.triangleRestFrames)).toEqual(
      new Uint8Array(before.triangleRestFrames),
    );
    for (let i = 0; i < result.positions3M.length; i++) {
      const scale = i % 3 === 1 ? 1 : result.report.radialScale;
      expect(
        Object.is(
          result.positions3M[i],
          Math.fround(input.localPositions3M[i]! * scale + input.translationM[i % 3]!),
        ),
      ).toBe(true);
    }
    result.positions3M[0] = 999;
    expect(input.localPositions3M[0]).toBe(before.localPositions3M[0]);
  });

  it('returns a blocked baseline rather than clamping an over-budget requested scale', () => {
    const input = fixture(0.145),
      result = build(input);
    expect(result.report.requiredRadialScale).toBeGreaterThan(1.01);
    expect(result.report.radialScale).toBe(1);
    expect(result.report.passed).toBe(false);
    expect(result.report.blockers).toContain('radial-scale-over-budget');
    expect(result.report.blockers).toContain('candidate-section-clearance-not-met');
  });

  it('applies stricter authored material limits without increasing the fixed recipe caps', () => {
    const input = fixture();
    const stricter = build({
      ...input,
      acceptance: {
        ...acceptance,
        maxAbsEdgeStretchDelta: 0.0001,
        maxAbsWarpGreenStrain: 0.0001,
        maxAbsWeftGreenStrain: 0.0001,
      },
    });
    expect(stricter.report.passed).toBe(false);
    expect(stricter.report.blockers).toContain('material-edge-stretch-over-budget');
    expect(stricter.report.blockers.some((x) => x.endsWith('green-over-budget'))).toBe(true);
    const looser = build({
      ...input,
      acceptance: {
        ...acceptance,
        maxAbsEdgeStretchDelta: 1,
        maxAbsAreaScaleDelta: 1,
        maxAbsWarpGreenStrain: 1,
      },
    });
    expect(looser.report.materialLimits).toEqual(acceptance);
  });

  it('checks Green strain separately even when the radius increase remains below 1%', () => {
    const input = fixture(0.15 * Math.cos(Math.PI / 64) * 1.00998 - 0.01);
    const result = build(input);
    expect(result.report.radialScale).toBeGreaterThan(1.00995);
    expect(result.report.radialScale).toBeLessThanOrEqual(1.01);
    expect(result.report.passed).toBe(false);
    expect(result.report.blockers.some((x) => x.endsWith('green-over-budget'))).toBe(true);
  });

  it('derives a positive Float32 error allowance from coordinate magnitudes', () => {
    const input = fixture();
    const small = build(input);
    const movedBody = input.bodyPositions3M.slice();
    for (let i = 0; i < movedBody.length; i += 3) movedBody[i] += 10;
    const moved = build({ ...input, bodyPositions3M: movedBody, translationM: [10, 0.5, 0] });
    expect(small.report.float32SafetyMarginM).toBe(1e-6);
    expect(moved.report.float32SafetyMarginM).toBeGreaterThan(small.report.float32SafetyMarginM);
    expect(moved.report.passed).toBe(true);
    expect(
      moved.report.candidateSection.ok &&
        moved.report.candidateSection.summary.initialClearanceQualified,
    ).toBe(true);
  });

  it('fails closed on malformed, nonfinite, missing-rest or oversized inputs', () => {
    const input = fixture();
    const nan = input.localPositions3M.slice();
    nan[0] = NaN;
    expect(() => build({ ...input, localPositions3M: nan })).toThrow('nonfinite');
    expect(() => build({ ...input, localPositions3M: new Float32Array(2001 * 3) })).toThrow('cap');
    expect(() => build({ ...input, triangleRestFrames: new ArrayBuffer(0) })).toThrow('byte count');
    expect(() =>
      build({ ...input, triangleRestFrames: new ArrayBuffer(input.triangleRestFrames.byteLength) }),
    ).toThrow('rest frame');
    expect(() => build({ ...input, translationM: [0, Infinity, 0] })).toThrow('finite');
    expect(() => build({ ...input, garmentWaistYM: 0.4 })).toThrow('waist-origin');
    const invalid = input.garmentTriangles.slice();
    invalid[0] = 100000;
    expect(() => build({ ...input, garmentTriangles: invalid })).toThrow('out-of-range');
    expect(() => build({ ...input, acceptance: { ...acceptance, maxAbsShear: NaN } })).toThrow(
      'finite',
    );
    expect(() =>
      build({
        ...input,
        localPositions3M: new Float32Array(
          new SharedArrayBuffer(input.localPositions3M.byteLength),
        ),
      }),
    ).toThrow('unshared');
  });
});
