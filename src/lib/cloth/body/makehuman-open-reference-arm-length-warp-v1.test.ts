import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_ARM_LENGTH_MODE_ANCHOR_DELTAS_SOURCE_UNITS_V1,
  MAKEHUMAN_OPEN_REFERENCE_ARM_ANCHORS_SOURCE_UNITS_V1,
  MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_PROVENANCE_V1,
  warpMakeHumanOpenReferenceArmLengthV1,
  type MakeHumanArmAnchorsV1,
  type MakeHumanArmLengthModesV1,
  type MakeHumanSparseArmLengthModeV1,
} from './makehuman-open-reference-arm-length-warp-v1';

const RING_RADIUS = 0.1;
const BASE_SEGMENT = 3.125;
const MODE_DELTA = 1.125;

interface Fixture {
  positions: Float32Array;
  indices: Uint16Array;
  anchors: MakeHumanArmAnchorsV1;
  modes: MakeHumanArmLengthModesV1;
  torso: Uint16Array;
  leftHand: readonly number[];
  rightHand: readonly number[];
}

function fixture(): Fixture {
  const positions: number[] = [0, 0, 0, 0.4, 0, 0, 0, 0.4, 0];
  const rings: Record<string, number[]> = {};
  const ring = (name: string, x: number) => {
    const start = positions.length / 3;
    positions.push(x, RING_RADIUS, 0, x, -RING_RADIUS, 0, x, 0, RING_RADIUS);
    rings[name] = [start, start + 1, start + 2];
  };
  for (const [name, x] of [
    ['leftShoulder', 0.7],
    ['leftElbow', 0.7 + BASE_SEGMENT],
    ['leftWrist', 0.7 + BASE_SEGMENT * 2],
    ['leftHand', 0.7 + BASE_SEGMENT * 2 + 0.5],
    ['rightShoulder', -0.7],
    ['rightElbow', -0.7 - BASE_SEGMENT],
    ['rightWrist', -0.7 - BASE_SEGMENT * 2],
    ['rightHand', -0.7 - BASE_SEGMENT * 2 - 0.5],
  ] as const) {
    ring(name, x);
  }

  const indices: number[] = [0, 1, 2];
  const connect = (first: string, second: string) => {
    const a = rings[first];
    const b = rings[second];
    for (let edge = 0; edge < 3; edge += 1) {
      const next = (edge + 1) % 3;
      indices.push(a[edge], b[edge], a[next], a[next], b[edge], b[next]);
    }
  };
  for (const side of ['left', 'right'] as const) {
    connect(`${side}Shoulder`, `${side}Elbow`);
    connect(`${side}Elbow`, `${side}Wrist`);
    connect(`${side}Wrist`, `${side}Hand`);
  }

  const anchors: MakeHumanArmAnchorsV1 = Object.freeze({
    left: Object.freeze({
      shoulder: [0.7, 0, 0] as const,
      elbow: [0.7 + BASE_SEGMENT, 0, 0] as const,
      wrist: [0.7 + BASE_SEGMENT * 2, 0, 0] as const,
    }),
    right: Object.freeze({
      shoulder: [-0.7, 0, 0] as const,
      elbow: [-0.7 - BASE_SEGMENT, 0, 0] as const,
      wrist: [-0.7 - BASE_SEGMENT * 2, 0, 0] as const,
    }),
  });

  const mode = (
    id: MakeHumanSparseArmLengthModeV1['id'],
    affected: readonly string[],
    leftDelta: number,
    joint: 'upper' | 'lower',
  ): MakeHumanSparseArmLengthModeV1 => {
    const vertices = affected.flatMap((name) => rings[name]).sort((a, b) => a - b);
    const deltas = new Float32Array(vertices.length * 3);
    vertices.forEach((vertex, offset) => {
      const isLeft = positions[vertex * 3] > 0;
      deltas[offset * 3] = isLeft ? leftDelta : -leftDelta;
    });
    const delta = (value: number): readonly [number, number, number] => [value, 0, 0];
    return Object.freeze({
      id,
      vertexIndices: Uint16Array.from(vertices),
      deltasSourceUnits: deltas,
      anchorDeltasSourceUnits: Object.freeze({
        left: Object.freeze({
          shoulder: delta(0),
          elbow: delta(joint === 'upper' ? leftDelta : 0),
          wrist: delta(leftDelta),
        }),
        right: Object.freeze({
          shoulder: delta(0),
          elbow: delta(joint === 'upper' ? -leftDelta : 0),
          wrist: delta(-leftDelta),
        }),
      }),
    });
  };

  const upperAffected = [
    'leftElbow',
    'leftWrist',
    'leftHand',
    'rightElbow',
    'rightWrist',
    'rightHand',
  ];
  const lowerAffected = ['leftWrist', 'leftHand', 'rightWrist', 'rightHand'];
  const modes = Object.freeze({
    upperDecr: mode('upperarm-length-decr', upperAffected, -MODE_DELTA, 'upper'),
    upperIncr: mode('upperarm-length-incr', upperAffected, MODE_DELTA, 'upper'),
    lowerDecr: mode('lowerarm-length-decr', lowerAffected, -MODE_DELTA, 'lower'),
    lowerIncr: mode('lowerarm-length-incr', lowerAffected, MODE_DELTA, 'lower'),
  });

  return {
    positions: Float32Array.from(positions),
    indices: Uint16Array.from(indices),
    anchors,
    modes,
    torso: Uint16Array.from([0, 1, 2]),
    leftHand: rings.leftHand,
    rightHand: rings.rightHand,
  };
}

function warp(source: Fixture, armLengthMm: number) {
  return warpMakeHumanOpenReferenceArmLengthV1({
    positionsSourceUnits: source.positions,
    triangleIndices: source.indices,
    anchorsSourceUnits: source.anchors,
    modes: source.modes,
    armLengthMm,
    metricScaleMPerSourceUnit: 0.1,
    protectedTorsoVertexIndices: source.torso,
  });
}

describe('MakeHuman open-reference arm-length warp v1', () => {
  it('pins exact CC0 sources and bilaterally symmetric derived anchors', () => {
    expect(MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_PROVENANCE_V1).toMatchObject({
      licenseId: 'CC0-1.0',
      skeleton: {
        byteSize: 117_790,
        sha256: '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24',
      },
      targets: {
        upperDecr: {
          sha256: 'abe56f2b05ed531af994f50549730183bbc00b868ddc96aceb296ab997fbea44',
        },
        lowerIncr: {
          sha256: '6a5c5d34fbc5051f75d6c3511911f7542da96b8ae9cdbcbccf346411a9bf1afb',
        },
      },
    });
    for (const anchors of Object.values(MAKEHUMAN_OPEN_REFERENCE_ARM_ANCHORS_SOURCE_UNITS_V1)) {
      for (const joint of ['shoulder', 'elbow', 'wrist'] as const) {
        expect(anchors.left[joint][0]).toBeCloseTo(-anchors.right[joint][0], 10);
        expect(anchors.left[joint][1]).toBeCloseTo(anchors.right[joint][1], 10);
        expect(anchors.left[joint][2]).toBeCloseTo(anchors.right[joint][2], 10);
      }
    }
    expect(MAKEHUMAN_ARM_LENGTH_MODE_ANCHOR_DELTAS_SOURCE_UNITS_V1.upperDecr.left).toEqual({
      shoulder: [0, 0, 0],
      elbow: [-0.343, 0.343, 0],
      wrist: [-0.343, 0.343, 0],
    });
  });

  it('moves both hands monotonically from 400 through 850 mm while preserving symmetry', () => {
    const source = fixture();
    const minimum = warp(source, 400);
    const baseline = warp(source, 625);
    const maximum = warp(source, 850);
    if (!minimum.ok || !baseline.ok || !maximum.ok) throw new Error('fixture warp failed');

    expect(minimum.achievedArmLengthMm).toBeCloseTo(400, 6);
    expect(baseline.achievedArmLengthMm).toBeCloseTo(625, 6);
    expect(maximum.achievedArmLengthMm).toBeCloseTo(850, 6);
    const handX = (positions: Float32Array, vertices: readonly number[]) =>
      vertices.reduce((sum, vertex) => sum + positions[vertex * 3], 0) / vertices.length;
    expect(handX(minimum.positionsSourceUnits, source.leftHand)).toBeLessThan(
      handX(baseline.positionsSourceUnits, source.leftHand),
    );
    expect(handX(maximum.positionsSourceUnits, source.leftHand)).toBeGreaterThan(
      handX(baseline.positionsSourceUnits, source.leftHand),
    );
    expect(handX(maximum.positionsSourceUnits, source.leftHand)).toBeCloseTo(
      -handX(maximum.positionsSourceUnits, source.rightHand),
      6,
    );
  });

  it('keeps protected torso vertices and triangle indices byte-identical', () => {
    const source = fixture();
    const beforePositions = source.positions.slice();
    const beforeIndices = source.indices.slice();
    const result = warp(source, 850);
    if (!result.ok) throw new Error(result.errors.join('; '));

    for (const vertex of source.torso) {
      expect(Array.from(result.positionsSourceUnits.slice(vertex * 3, vertex * 3 + 3))).toEqual(
        Array.from(beforePositions.slice(vertex * 3, vertex * 3 + 3)),
      );
    }
    expect(source.positions).toEqual(beforePositions);
    expect(source.indices).toEqual(beforeIndices);
    expect(result.maximumEdgeStretchRatio).toBeLessThanOrEqual(1.75);
  });

  it('moves every hand vertex rigidly with its wrist and returns only false authority claims', () => {
    const source = fixture();
    const result = warp(source, 850);
    if (!result.ok) throw new Error(result.errors.join('; '));
    const leftWristVertex = source.leftHand[0] - 3;
    const wristDelta =
      result.positionsSourceUnits[leftWristVertex * 3] - source.positions[leftWristVertex * 3];
    for (const vertex of source.leftHand) {
      expect(result.positionsSourceUnits[vertex * 3] - source.positions[vertex * 3]).toBeCloseTo(
        wristDelta,
        6,
      );
    }
    expect(result.claims).toEqual({
      surfacePathEquivalentClaimed: false,
      populationRepresentativenessClaimed: false,
      realBodyValidationClaimed: false,
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
      collisionCandidateEligible: false,
    });
  });

  it('is deterministic, finite and does not mutate caller arrays', () => {
    const source = fixture();
    const first = warp(source, 700);
    const second = warp(source, 700);
    if (!first.ok || !second.ok) throw new Error('fixture warp failed');

    expect(first.coefficients).toEqual(second.coefficients);
    expect(first.positionsSourceUnits).toEqual(second.positionsSourceUnits);
    expect([...first.positionsSourceUnits].every(Number.isFinite)).toBe(true);
    expect(first.positionsSourceUnits).not.toBe(source.positions);
  });

  it('fails closed when a mode touches a protected torso vertex', () => {
    const source = fixture();
    const forged = {
      ...source.modes.upperIncr,
      vertexIndices: Uint16Array.from([0, ...source.modes.upperIncr.vertexIndices]),
      deltasSourceUnits: Float32Array.from([1, 0, 0, ...source.modes.upperIncr.deltasSourceUnits]),
    };
    const result = warpMakeHumanOpenReferenceArmLengthV1({
      positionsSourceUnits: source.positions,
      triangleIndices: source.indices,
      anchorsSourceUnits: source.anchors,
      modes: { ...source.modes, upperIncr: forged },
      armLengthMm: 850,
      metricScaleMPerSourceUnit: 0.1,
      protectedTorsoVertexIndices: source.torso,
    });

    expect(result).toMatchObject({ ok: false, code: 'input-invalid' });
    if (!result.ok) expect(result.errors.join(' ')).toContain('protected torso vertex 0');
  });

  it('fails closed for target capacity and edge-stretch violations', () => {
    const source = fixture();
    const scaleMode = (mode: MakeHumanSparseArmLengthModeV1): MakeHumanSparseArmLengthModeV1 => {
      const scaleAnchor = (value: readonly [number, number, number]) =>
        value.map((axis) => axis * 0.1) as [number, number, number];
      return {
        ...mode,
        deltasSourceUnits: Float32Array.from(mode.deltasSourceUnits, (value) => value * 0.1),
        anchorDeltasSourceUnits: {
          left: {
            shoulder: scaleAnchor(mode.anchorDeltasSourceUnits.left.shoulder),
            elbow: scaleAnchor(mode.anchorDeltasSourceUnits.left.elbow),
            wrist: scaleAnchor(mode.anchorDeltasSourceUnits.left.wrist),
          },
          right: {
            shoulder: scaleAnchor(mode.anchorDeltasSourceUnits.right.shoulder),
            elbow: scaleAnchor(mode.anchorDeltasSourceUnits.right.elbow),
            wrist: scaleAnchor(mode.anchorDeltasSourceUnits.right.wrist),
          },
        },
      };
    };
    const limitedModes: MakeHumanArmLengthModesV1 = {
      upperDecr: scaleMode(source.modes.upperDecr),
      upperIncr: scaleMode(source.modes.upperIncr),
      lowerDecr: scaleMode(source.modes.lowerDecr),
      lowerIncr: scaleMode(source.modes.lowerIncr),
    };
    expect(
      warpMakeHumanOpenReferenceArmLengthV1({
        positionsSourceUnits: source.positions,
        triangleIndices: source.indices,
        anchorsSourceUnits: source.anchors,
        modes: limitedModes,
        armLengthMm: 850,
        metricScaleMPerSourceUnit: 0.1,
        protectedTorsoVertexIndices: source.torso,
      }),
    ).toMatchObject({ ok: false, code: 'target-out-of-bounds' });

    expect(
      warpMakeHumanOpenReferenceArmLengthV1({
        positionsSourceUnits: source.positions,
        triangleIndices: source.indices,
        anchorsSourceUnits: source.anchors,
        modes: source.modes,
        armLengthMm: 850,
        metricScaleMPerSourceUnit: 0.1,
        protectedTorsoVertexIndices: source.torso,
        maximumEdgeStretchRatio: 1.05,
      }),
    ).toMatchObject({ ok: false, code: 'edge-stretch-exceeded' });
  });
});
