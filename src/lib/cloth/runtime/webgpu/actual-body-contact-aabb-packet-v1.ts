import {
  buildActualBodyTriangleAabbTreeV1,
  captureActualBodyTriangleGeometryV1,
  type TriangleBoundsV1,
} from '../../body/actual-body-triangle-aabb-tree-v1';

export const ACTUAL_BODY_CONTACT_AABB_ABI_V1 = Object.freeze({
  version: 'actual-body-contact-aabb-packet/1',
  nodeStrideBytes: 32,
  triangleOrdinalBytes: 4,
  leafFlag: 0x8000_0000,
  maxNodes: 8191,
  maxLeafTriangles: 8,
  maxDepth: 13,
} as const);

type BodyAabbPacket = Readonly<{
  version: typeof ACTUAL_BODY_CONTACT_AABB_ABI_V1.version;
  bodyVertexCount: number;
  bodyTriangleCount: number;
  nodeCount: number;
  maximumDepth: number;
  nodeBytes: number;
  ordinalBytes: number;
}>;
type BodyAabbBuffers = {
  positions: Float32Array;
  triangles: Uint32Array;
  nodes: ArrayBuffer;
  ordinals: Uint32Array;
};
const packets = new WeakMap<BodyAabbPacket, BodyAabbBuffers>();

/** Owns the same native triangle ordinals and f32 coordinates used to build the node bounds. */
export function prepareActualBodyContactAabbPacketV1(
  inputPositionsM: Float32Array,
  inputTriangles: Uint32Array,
): BodyAabbPacket {
  const { positions, triangles } = captureActualBodyTriangleGeometryV1(
    inputPositionsM,
    inputTriangles,
  );
  const vertexCount = positions.length / 3;
  const triangleCount = triangles.length / 3;
  if (vertexCount < 4 || triangleCount < 4)
    throw new RangeError('Actual-body contact requires at least four vertices and triangles.');
  const entries = Array.from({ length: triangleCount }, (_, ordinal) => {
    const a = triangles[ordinal * 3] * 3;
    const b = triangles[ordinal * 3 + 1] * 3;
    const c = triangles[ordinal * 3 + 2] * 3;
    if (a === b || a === c || b === c)
      throw new RangeError('Body triangle repeats a vertex index.');
    const boundsFor = (axis: number): readonly [number, number] => [
      Math.min(positions[a + axis], positions[b + axis], positions[c + axis]),
      Math.max(positions[a + axis], positions[b + axis], positions[c + axis]),
    ];
    const centroidFor = (axis: number) =>
      (positions[a + axis] + positions[b + axis] + positions[c + axis]) / 3;
    const bounds: TriangleBoundsV1 = [boundsFor(0), boundsFor(1), boundsFor(2)];
    const centroid = [centroidFor(0), centroidFor(1), centroidFor(2)] as const;
    return { ordinal, bounds, centroid };
  });

  const abi = ACTUAL_BODY_CONTACT_AABB_ABI_V1;
  const { nodes, maximumDepth } = buildActualBodyTriangleAabbTreeV1(
    entries,
    abi.maxLeafTriangles,
    abi.maxNodes,
  );
  if (maximumDepth > abi.maxDepth) throw new RangeError('Body tree exceeds the shader depth.');

  const ordinalOrder = Uint32Array.from(entries, ({ ordinal }) => ordinal);
  const nodeBuffer = new ArrayBuffer(nodes.length * abi.nodeStrideBytes);
  const view = new DataView(nodeBuffer);
  nodes.forEach(({ bounds, left, right, start, count }, i) => {
    const offset = i * abi.nodeStrideBytes;
    for (const k of [0, 1, 2] as const) {
      view.setFloat32(offset + 4 * k, bounds[k][0], true);
      view.setFloat32(offset + 16 + 4 * k, bounds[k][1], true);
    }
    view.setUint32(offset + 12, count ? start : left, true);
    view.setUint32(offset + 28, count ? abi.leafFlag + count : right, true);
  });
  const packet = Object.freeze({
    version: abi.version,
    bodyVertexCount: vertexCount,
    bodyTriangleCount: triangleCount,
    nodeCount: nodes.length,
    maximumDepth,
    nodeBytes: nodeBuffer.byteLength,
    ordinalBytes: ordinalOrder.byteLength,
  });
  packets.set(packet, { positions, triangles, nodes: nodeBuffer, ordinals: ordinalOrder });
  return packet;
}

export function snapshotActualBodyContactAabbBuffersV1(packet: BodyAabbPacket): BodyAabbBuffers {
  const source = packets.get(packet);
  if (!source) throw new TypeError('A prepared actual-body contact tree is required.');
  return {
    positions: source.positions.slice(),
    triangles: source.triangles.slice(),
    nodes: source.nodes.slice(0),
    ordinals: source.ordinals.slice(),
  };
}
