import type { Vec2Mm } from '../domain/garment-assembly-ir';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import { seamSegmentIsCoveredByMeshV1 } from '../mesh/triangulation/seam-point-embedding-v1';
import type { SourceCutMassTransferMeshV1 } from '../mesh/triangulation/source-cut-mass-transfer-v1';

import type { CompiledBendConstraints } from './bend-constraints';

export type PressedCreaseV1 = Readonly<{
  pieceId: string;
  lineMm: readonly [Vec2Mm, Vec2Mm];
  movingPointMm: Vec2Mm;
  bendWidthMm: number;
}>;

type Vec3 = readonly [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function unit(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  if (!(length > 0 && Number.isFinite(length)))
    throw new RangeError('The prepared crease has a degenerate hinge.');
  return [v[0] / length, v[1] / length, v[2] / length];
}

function dihedral(positions: Float32Array, vertices: Uint32Array) {
  const point = (index: number): Vec3 => [
    positions[4 * index],
    positions[4 * index + 1],
    positions[4 * index + 2],
  ];
  const [a, b, c, d] = Array.from(vertices, point);
  const axis = unit(sub(b, a));
  const first = unit(cross(sub(a, c), sub(b, c)));
  const second = unit(cross(sub(b, d), sub(a, d)));
  return Math.atan2(dot(cross(first, second), axis), dot(first, second));
}

/** Read the rest angles of pressed material from an admitted folded pose, in GPU color order. */
export function compilePressedCreaseBendRestV1(
  mesh: ClothMeshIR,
  bend: CompiledBendConstraints,
  positions: Float32Array,
  coverage: Float64Array,
  cuts: ReadonlyMap<string, { cut: SourceCutMassTransferMeshV1 }>,
  creases: readonly PressedCreaseV1[],
) {
  const rest = bend.restAnglesRad.slice();
  const used = new Set<number>();
  for (const {
    pieceId,
    lineMm: [a, b],
    movingPointMm,
    bendWidthMm,
  } of creases) {
    const part = mesh.pieceRanges.find((entry) => entry.pieceId === pieceId);
    const cut = cuts.get(pieceId)?.cut;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (
      !part ||
      !cut ||
      ![...a, ...b, ...movingPointMm, bendWidthMm, length].every(Number.isFinite) ||
      length <= 0 ||
      bendWidthMm <= 0 ||
      !seamSegmentIsCoveredByMeshV1(cut.verticesMm, cut.triangles, a, b)
    )
      throw new RangeError('The pressed crease must be a bounded line on its original cut.');
    const tx = (b[0] - a[0]) / length;
    const ty = (b[1] - a[1]) / length;
    const normal = (x: number, y: number) => tx * (y - a[1]) - ty * (x - a[0]);
    const side = Math.sign(normal(...movingPointMm));
    if (side === 0) throw new RangeError('The pressed crease must select a side of the line.');
    const { vertexOffset, vertexCount } = part;
    const end = vertexOffset + vertexCount;
    let assigned = 0;
    for (let hinge = 0; hinge < rest.length; hinge++) {
      if (coverage[hinge] === 0) continue;
      const vertices = bend.vertexQuads.subarray(4 * hinge, 4 * hinge + 4);
      if (!vertices.every((vertex) => vertex >= vertexOffset && vertex < end)) continue;
      const axial: number[] = [];
      const across: number[] = [];
      for (const vertex of vertices) {
        const x = mesh.restPositions2Mm[2 * vertex];
        const y = mesh.restPositions2Mm[2 * vertex + 1];
        axial.push(tx * (x - a[0]) + ty * (y - a[1]));
        across.push(side * normal(x, y));
      }
      if (
        Math.max(...axial) <= 0 ||
        Math.min(...axial) >= length ||
        Math.max(...across) <= 0 ||
        Math.min(...across) >= bendWidthMm
      )
        continue;
      if (used.has(hinge)) throw new RangeError('Pressed crease hinge regions overlap.');
      used.add(hinge);
      const angle = dihedral(positions, vertices);
      // A flat hinge keeps the exact zero rest value irrespective of roundoff in the posed mesh.
      if (Math.abs(angle) <= 1e-5) continue;
      rest[hinge] = angle;
      assigned++;
    }
    if (assigned === 0) throw new RangeError('The pressed crease has no curved carrier hinge.');
  }
  return rest;
}

export type AuthoredPressHingeTargetV1 = Readonly<{
  pieceId: string;
  /** Piece-local indices from the constrained material triangulation. */
  edges: readonly (readonly [number, number])[];
  /** Target signed dihedral, zero for a flattened hinge. */
  angleRad: number;
}>;

/** Replace the rest angle only on the exact, material-covered authored hinges. */
export function compileAuthoredPressHingeRestV1(
  mesh: ClothMeshIR,
  bend: CompiledBendConstraints,
  coverage: Float64Array,
  baseRest: Float32Array,
  targets: readonly AuthoredPressHingeTargetV1[],
) {
  const rest = baseRest.slice();
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const indexByEdge = new Map<string, number>();
  for (let i = 0; i < bend.constraintCount; i++) {
    indexByEdge.set(edgeKey(bend.vertexQuads[4 * i], bend.vertexQuads[4 * i + 1]), i);
  }
  const assigned = new Set<number>();
  for (const { pieceId, edges, angleRad } of targets) {
    const range = mesh.pieceRanges.find((piece) => piece.pieceId === pieceId);
    if (!range || !edges.length || !Number.isFinite(angleRad) || Math.abs(angleRad) > Math.PI)
      throw new RangeError('A press target requires a known cut piece, hinge edges and angle.');
    const { vertexOffset, vertexCount } = range;
    for (const [a, b] of edges) {
      if (![a, b].every((v) => Number.isSafeInteger(v) && v >= 0 && v < vertexCount) || a === b)
        throw new RangeError('A press target references an invalid piece-local hinge.');
      const index = indexByEdge.get(edgeKey(vertexOffset + a, vertexOffset + b));
      if (
        index === undefined ||
        assigned.has(index) ||
        !(coverage[index] >= 1 - 1e-12) ||
        !bend.vertexQuads
          .subarray(4 * index, 4 * index + 4)
          .every((v) => v >= vertexOffset && v < vertexOffset + vertexCount)
      )
        throw new RangeError('A press target requires a unique fully covered interior hinge.');
      assigned.add(index);
      rest[index] = angleRad === 0 ? 0 : angleRad;
    }
  }
  return rest;
}
