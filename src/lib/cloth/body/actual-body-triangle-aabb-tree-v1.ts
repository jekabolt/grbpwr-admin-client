type Vec3 = readonly [number, number, number];
export type TriangleBoundsV1 = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

export const ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1 = Object.freeze({
  maximumBodyVertices: 20_000,
  maximumBodyTriangles: 30_000,
  maximumAbsoluteCoordinateM: 100,
});

const axes = [0, 1, 2] as const;
const geometryLimits = ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1;
const typedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype) as object;
const getBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const getLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')!.get!;
const getOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;

function checkedLength(
  value: Float32Array | Uint32Array,
  prototype: object,
  maximum: number,
): number {
  if (Object.getPrototypeOf(value) !== prototype)
    throw new TypeError('Expected an ordinary typed array.');
  const buffer = getBuffer.call(value) as ArrayBuffer;
  const length = getLength.call(value) as number;
  if (
    Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
    getOffset.call(value) !== 0 ||
    length * 4 !== bufferLength.call(buffer) ||
    length < 3 ||
    length % 3 !== 0 ||
    length > maximum * 3
  )
    throw new RangeError('Expected a complete bounded body buffer of triples.');
  return length;
}

export function captureActualBodyTriangleGeometryV1(
  inputPositionsM: Float32Array,
  inputTriangles: Uint32Array,
) {
  const positionLength = checkedLength(
    inputPositionsM,
    Float32Array.prototype,
    geometryLimits.maximumBodyVertices,
  );
  const indexLength = checkedLength(
    inputTriangles,
    Uint32Array.prototype,
    geometryLimits.maximumBodyTriangles,
  );
  const positions = new Float32Array(positionLength);
  const triangles = new Uint32Array(indexLength);
  positions.set(inputPositionsM);
  triangles.set(inputTriangles);
  if (
    positions.some(
      (value) =>
        !Number.isFinite(value) || Math.abs(value) > geometryLimits.maximumAbsoluteCoordinateM,
    ) ||
    triangles.some((i) => i >= positionLength / 3)
  )
    throw new RangeError('Invalid body vertex coordinate or triangle index.');
  return { positions, triangles };
}

type TriangleEntry = {
  ordinal: number;
  centroid: Vec3;
  bounds: TriangleBoundsV1;
};
type TriangleNode = {
  bounds: TriangleBoundsV1;
  left: number;
  right: number;
  start: number;
  count: number;
};

/** Reorders the owned entries by centroid and original ordinal. Parents precede their children. */
export function buildActualBodyTriangleAabbTreeV1(
  entries: TriangleEntry[],
  leafTriangleCount: number,
  maximumNodes: number,
) {
  if (
    !Number.isSafeInteger(leafTriangleCount) ||
    leafTriangleCount < 1 ||
    !Number.isSafeInteger(maximumNodes) ||
    maximumNodes < 1
  )
    throw new RangeError('Body tree requires positive integer limits.');
  const nodes: TriangleNode[] = [];
  let maximumDepth = 0;
  const build = (start: number, end: number, depth: number): number => {
    const first = entries[start];
    const lower = [first.bounds[0][0], first.bounds[1][0], first.bounds[2][0]];
    const upper = [first.bounds[0][1], first.bounds[1][1], first.bounds[2][1]];
    const minCentroid = [...first.centroid];
    const maxCentroid = [...first.centroid];
    for (let i = start + 1; i < end; i++) {
      const { bounds, centroid } = entries[i];
      for (const k of axes) {
        lower[k] = Math.min(lower[k], bounds[k][0]);
        upper[k] = Math.max(upper[k], bounds[k][1]);
        minCentroid[k] = Math.min(minCentroid[k], centroid[k]);
        maxCentroid[k] = Math.max(maxCentroid[k], centroid[k]);
      }
    }
    if (nodes.length >= maximumNodes) throw new RangeError('Body tree exceeds the node limit.');
    maximumDepth = Math.max(maximumDepth, depth);
    const id = nodes.length;
    const count = end - start;
    const node: TriangleNode = {
      bounds: [
        [lower[0], upper[0]],
        [lower[1], upper[1]],
        [lower[2], upper[2]],
      ],
      left: -1,
      right: -1,
      start,
      count,
    };
    nodes.push(node);
    if (count > leafTriangleCount) {
      const spans = maxCentroid.map((value, i) => value - minCentroid[i]);
      const axis = spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : spans[1] >= spans[2] ? 1 : 2;
      const ordered = entries
        .slice(start, end)
        .sort((a, b) => a.centroid[axis] - b.centroid[axis] || a.ordinal - b.ordinal);
      for (let i = 0; i < count; i++) entries[start + i] = ordered[i];
      const middle = start + Math.floor(count / 2);
      node.count = 0;
      node.left = build(start, middle, depth + 1);
      node.right = build(middle, end, depth + 1);
    }
    return id;
  };
  if (entries.length) build(0, entries.length, 1);
  return { nodes, maximumDepth };
}
