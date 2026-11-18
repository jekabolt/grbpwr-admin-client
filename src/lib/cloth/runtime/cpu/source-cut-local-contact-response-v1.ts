import type { prepareSourceCutContactMeshV1 } from './source-cut-contact-mesh-v1';

type Vec3 = readonly [number, number, number];
type ContactMesh = ReturnType<typeof prepareSourceCutContactMeshV1>;
type Corner = ReturnType<ContactMesh['triangleCornerSupports']>[number];
type Motion = {
  positionsMInvMass: Float32Array<ArrayBuffer>;
  previousPositionsMInvMass: Float32Array<ArrayBuffer>;
  velocities: Float32Array<ArrayBuffer>;
};

const axes = [0, 1, 2] as const;
export const MAXIMUM_LOCAL_CUT_WITNESSES_V1 = 8;
export const MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1 = 32;
const MINIMUM_LOCAL_GAP_M = 0.000025;

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function separationAxis(a: readonly Vec3[], b: readonly Vec3[]) {
  const edges = (face: readonly Vec3[]) =>
    face.map((v, index) => subtract(face[(index + 1) % 3], v));
  const left = edges(a);
  const right = edges(b);
  const leftNormal = cross(left[0], left[1]);
  const rightNormal = cross(right[0], right[1]);
  const directions = [
    leftNormal,
    rightNormal,
    ...left.flatMap((edge) => right.map((other) => cross(edge, other))),
    ...left.map((edge) => cross(leftNormal, edge)),
    ...right.map((edge) => cross(rightNormal, edge)),
  ];
  let bestGap = 0;
  let best: Vec3 | undefined;
  for (const direction of directions) {
    const length = Math.hypot(...direction);
    if (length < 1e-15) continue;
    const normal: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
    const da = a.map((value) => dot(normal, value));
    const db = b.map((value) => dot(normal, value));
    const forward = Math.min(...db) - Math.max(...da);
    const backward = Math.min(...da) - Math.max(...db);
    const gap = Math.max(forward, backward);
    if (gap > bestGap) {
      bestGap = gap;
      best = forward >= backward ? normal : [-normal[0], -normal[1], -normal[2]];
    }
  }
  return best;
}

/** Use the last accepted side of the cut and the exact contact corner stencils. */
export function separateSourceCutWitnessesV1(
  mesh: ContactMesh,
  acceptedPositions: Float32Array,
  proposal: Motion,
  witnesses: readonly (readonly [number, number])[],
): Motion | undefined {
  if (witnesses.length < 1 || witnesses.length > MAXIMUM_LOCAL_CUT_WITNESSES_V1) return undefined;
  const accepted = mesh.project(acceptedPositions).positionsM;
  const faces = witnesses.map(
    ([a, b]) => [mesh.triangleCornerSupports(a), mesh.triangleCornerSupports(b)] as const,
  );
  const point = ({ vertex }: Corner): Vec3 => [
    accepted[3 * vertex],
    accepted[3 * vertex + 1],
    accepted[3 * vertex + 2],
  ];
  const positions = proposal.positionsMInvMass.slice();
  const previous = proposal.previousPositionsMInvMass.slice();
  const constraints: {
    normal: Vec3;
    gradient: ReadonlyMap<number, number>;
    inverseMass: number;
  }[] = [];

  for (const [a, b] of faces) {
    const normal = separationAxis(a.map(point), b.map(point));
    if (!normal) return undefined;
    // Constrain every corner pair along the accepted axis. Both supports
    // can use the same carrier particle, so assemble one signed gradient.
    for (const left of a) {
      for (const right of b) {
        const gradient = new Map<number, number>();
        for (const axis of axes) {
          const x = left.particleOffsets[axis];
          const y = right.particleOffsets[axis];
          gradient.set(x, (gradient.get(x) ?? 0) - left.weights[axis]);
          gradient.set(y, (gradient.get(y) ?? 0) + right.weights[axis]);
        }
        let inverseMass = 0;
        for (const [offset, weight] of gradient)
          inverseMass += weight * weight * positions[offset + 3];
        if (inverseMass !== 0) constraints.push({ normal, gradient, inverseMass });
      }
    }
  }

  for (let sweep = 0; sweep < 8; sweep++) {
    let changed = false;
    for (const { normal, gradient, inverseMass } of constraints) {
      let gap = 0;
      for (const [offset, weight] of gradient)
        gap +=
          weight * dot(normal, [positions[offset], positions[offset + 1], positions[offset + 2]]);
      if (gap >= MINIMUM_LOCAL_GAP_M) continue;
      changed = true;
      const magnitude = (MINIMUM_LOCAL_GAP_M - gap) / inverseMass;
      for (const [offset, weight] of gradient) {
        const correction = magnitude * weight * positions[offset + 3];
        for (const axis of axes) {
          const increment = correction * normal[axis];
          positions[offset + axis] += increment;
          previous[offset + axis] += increment;
        }
      }
    }
    if (!changed) break;
  }
  return {
    positionsMInvMass: positions,
    previousPositionsMInvMass: previous,
    velocities: proposal.velocities,
  };
}

/** Hold the carriers supporting rejected faces at their last accepted positions. */
export function retreatSourceCutWitnessMotionV1(
  mesh: ContactMesh,
  acceptedPositions: Float32Array,
  proposal: Motion,
  witnesses: readonly (readonly [number, number])[],
  heldParticles: ReadonlySet<number>,
) {
  if (witnesses.length > MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1)
    throw new RangeError('Too many cut witnesses for local motion retreat.');
  const offsets = new Set(heldParticles);
  for (const faces of witnesses) {
    for (const face of faces) {
      for (const corner of mesh.triangleCornerSupports(face)) {
        for (const axis of axes) {
          if (corner.weights[axis] > 0) offsets.add(corner.particleOffsets[axis]);
        }
      }
    }
  }
  if (offsets.size === heldParticles.size) return undefined;
  const positions = proposal.positionsMInvMass.slice();
  const previous = proposal.previousPositionsMInvMass.slice();
  const velocities = proposal.velocities.slice();
  for (const offset of offsets) {
    for (const axis of axes) {
      const index = offset + axis;
      positions[index] = acceptedPositions[index];
      previous[index] = acceptedPositions[index];
      velocities[index] = 0;
    }
  }
  return {
    motion: { positionsMInvMass: positions, previousPositionsMInvMass: previous, velocities },
    heldParticles: offsets,
  };
}
