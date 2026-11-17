/**
 * Mirror-pair snap for meshes that are left/right symmetric by construction but carry tiny float
 * drift after shaping (HM08 bodies: a few midline vertices 0.05-0.11 mm off x = 0, rare 1e-10 m pair
 * mismatches). The topology mirror map needs exact float symmetry, so anchors are built on a copy
 * where every drifted pair is put back on its exact mirror. Pure function of the positions: same
 * input, same output, whatever was built before.
 *
 * Pairs that are already bit-exact stay untouched. Only the leftovers are paired, each with the
 * leftover nearest to its reflection, and only when that match is mutual, within `toleranceM`
 * and unambiguous; a mesh whose leftovers do not pair that way is refused, never guessed.
 */

export const MESH_MIRROR_PAIR_SNAP_TOLERANCE_M = 0.001;
/** The nearest leftover must be this many times closer than the next one. */
const UNAMBIGUOUS_RATIO = 2;
/** Drift touches a handful of vertices; a mesh with more leftovers is not "symmetric with drift". */
const MAXIMUM_LEFTOVER_VERTICES = 1024;

export type MeshMirrorPairSnapResultV1 =
  | Readonly<{
      ok: true;
      /** The input array itself when nothing drifted, else a snapped copy. */
      positionsM: Float32Array;
      snappedVertexCount: number;
      maxOffsetM: number;
    }>
  | Readonly<{ ok: false; reason: string }>;

function exactLookup(positionsM: Float32Array, vertexCount: number) {
  const bits = new Uint32Array(positionsM.buffer, positionsM.byteOffset, vertexCount * 3);
  const normal = (value: number) => (value === 0x80000000 ? 0 : value);
  let size = 1;
  while (size < vertexCount * 2) size *= 2;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const find = (x: number, y: number, z: number): number => {
    let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
    hash = Math.imul(hash ^ y, 0xc2b2ae35);
    hash = Math.imul(hash ^ z, 0x27d4eb2f);
    for (let slot = (hash ^ (hash >>> 15)) & mask; ; slot = (slot + 1) & mask) {
      const vertex = table[slot];
      if (vertex < 0) return -1 - slot;
      const offset = vertex * 3;
      if (
        normal(bits[offset]) === x &&
        normal(bits[offset + 1]) === y &&
        normal(bits[offset + 2]) === z
      ) {
        return vertex;
      }
    }
  };
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const found = find(normal(bits[offset]), normal(bits[offset + 1]), normal(bits[offset + 2]));
    // Duplicate coordinates: the first vertex keeps the slot; the topology refuses such meshes.
    if (found < 0) table[-1 - found] = vertex;
  }
  return (vertex: number): number => {
    const offset = vertex * 3;
    return find(
      normal((bits[offset] ^ 0x80000000) >>> 0),
      normal(bits[offset + 1]),
      normal(bits[offset + 2]),
    );
  };
}

export function snapMeshMirrorPairsV1(
  positionsM: Float32Array,
  toleranceM = MESH_MIRROR_PAIR_SNAP_TOLERANCE_M,
): MeshMirrorPairSnapResultV1 {
  if (positionsM.length % 3 !== 0) return { ok: false, reason: 'positions-incomplete' };
  const vertexCount = positionsM.length / 3;
  const reflected = exactLookup(positionsM, vertexCount);
  const leftovers: number[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const partner = reflected(vertex);
    // An exact partner must also see this vertex back; otherwise both are leftovers.
    if (partner < 0 || reflected(partner) !== vertex) leftovers.push(vertex);
  }
  if (leftovers.length === 0) {
    return { ok: true, positionsM, snappedVertexCount: 0, maxOffsetM: 0 };
  }
  if (leftovers.length > MAXIMUM_LEFTOVER_VERTICES) {
    return { ok: false, reason: `too-many-unpaired-vertices:${leftovers.length}` };
  }

  const nearest = new Map<number, number>();
  for (const vertex of leftovers) {
    const offset = vertex * 3;
    const rx = -positionsM[offset];
    const ry = positionsM[offset + 1];
    const rz = positionsM[offset + 2];
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let secondDistance = Number.POSITIVE_INFINITY;
    for (const candidate of leftovers) {
      const other = candidate * 3;
      const distance = Math.hypot(
        positionsM[other] - rx,
        positionsM[other + 1] - ry,
        positionsM[other + 2] - rz,
      );
      if (distance < bestDistance) {
        secondDistance = bestDistance;
        bestDistance = distance;
        best = candidate;
      } else if (distance < secondDistance) {
        secondDistance = distance;
      }
    }
    if (best < 0 || bestDistance > toleranceM) {
      return { ok: false, reason: `vertex-${vertex}-has-no-mirror-within-tolerance` };
    }
    if (secondDistance < bestDistance * UNAMBIGUOUS_RATIO) {
      return { ok: false, reason: `vertex-${vertex}-mirror-is-ambiguous` };
    }
    nearest.set(vertex, best);
  }

  const snapped = Float32Array.from(positionsM);
  let maxOffsetM = 0;
  for (const vertex of leftovers) {
    const partner = nearest.get(vertex) as number;
    if (nearest.get(partner) !== vertex) {
      return { ok: false, reason: `vertex-${vertex}-mirror-is-not-mutual` };
    }
    if (partner < vertex) continue;
    const a = vertex * 3;
    const b = partner * 3;
    // Float32 rounding is sign-symmetric, so x and -x stay exact mirrors after storage.
    const x = partner === vertex ? 0 : (positionsM[a] - positionsM[b]) / 2;
    const y = (positionsM[a + 1] + positionsM[b + 1]) / 2;
    const z = (positionsM[a + 2] + positionsM[b + 2]) / 2;
    snapped[a] = x;
    snapped[a + 1] = y;
    snapped[a + 2] = z;
    if (partner !== vertex) {
      snapped[b] = -x;
      snapped[b + 1] = y;
      snapped[b + 2] = z;
    }
    if (partner !== vertex && snapped[a] === 0) {
      return { ok: false, reason: `vertex-${vertex}-pair-collapses-onto-midline` };
    }
    for (const offset of partner === vertex ? [a] : [a, b]) {
      maxOffsetM = Math.max(
        maxOffsetM,
        Math.hypot(
          snapped[offset] - positionsM[offset],
          snapped[offset + 1] - positionsM[offset + 1],
          snapped[offset + 2] - positionsM[offset + 2],
        ),
      );
    }
  }
  return { ok: true, positionsM: snapped, snappedVertexCount: leftovers.length, maxOffsetM };
}
