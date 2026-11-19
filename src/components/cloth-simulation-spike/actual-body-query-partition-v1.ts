export type BodyQueryPoint = readonly [number, number, number];
export type BodyQueryInterval = readonly [number, number];
export type BodyQueryBox = readonly [BodyQueryInterval, BodyQueryInterval, BodyQueryInterval];
export type BodyQueryNode = Readonly<{
  bounds: BodyQueryBox;
  pointIndices: readonly number[];
  children: readonly BodyQueryNode[];
}>;

function denseArrayLength(array: readonly unknown[]): number {
  if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype)
    throw new TypeError('An ordinary array of body query data is required.');
  return Object.getOwnPropertyDescriptor(array, 'length')!.value;
}

function coordinate(array: readonly unknown[], index: number): unknown {
  return Object.getOwnPropertyDescriptor(array, index)?.value;
}

export function captureBodyQueryPointV1(
  point: BodyQueryPoint,
  maxCoordinate: number,
): BodyQueryPoint {
  if (denseArrayLength(point) !== 3)
    throw new RangeError('A three-coordinate body query is required.');
  const xyz = [coordinate(point, 0), coordinate(point, 1), coordinate(point, 2)];
  if (xyz.some((x) => typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > maxCoordinate))
    throw new RangeError('Expected finite body query coordinates.');
  return xyz as unknown as BodyQueryPoint;
}

export function captureBodyQueryPointsV1(
  input: readonly BodyQueryPoint[],
  maximumQueries: number,
  maxCoordinate: number,
): readonly BodyQueryPoint[] {
  const count = denseArrayLength(input);
  if (!Number.isSafeInteger(count) || count < 1 || count > maximumQueries)
    throw new RangeError('Body query count is outside bounds.');
  return Array.from({ length: count }, (_, i) =>
    captureBodyQueryPointV1(coordinate(input, i) as BodyQueryPoint, maxCoordinate),
  );
}

function queryNode(
  points: readonly BodyQueryPoint[],
  indices: number[],
  leafPointCount: number,
): BodyQueryNode {
  const boundsAt = (axis: 0 | 1 | 2): BodyQueryInterval => {
    const values = indices.map((i) => points[i][axis]);
    return [Math.min(...values), Math.max(...values)];
  };
  const bounds: BodyQueryBox = [boundsAt(0), boundsAt(1), boundsAt(2)];
  if (indices.length <= leafPointCount) return { bounds, pointIndices: indices, children: [] };
  const [x, y, z] = bounds.map(([lo, hi]) => hi - lo);
  const axis = x >= y && x >= z ? 0 : y >= z ? 1 : 2;
  indices.sort((a, b) => points[a][axis] - points[b][axis] || a - b);
  const middle = Math.floor(indices.length / 2);
  return {
    bounds,
    pointIndices: [],
    children: [
      queryNode(points, indices.slice(0, middle), leafPointCount),
      queryNode(points, indices.slice(middle), leafPointCount),
    ],
  };
}

/** Called with bounded finite coordinates and a positive leaf size. */
export function partitionBodyQueriesV1(
  points: readonly BodyQueryPoint[],
  leafSize: number,
): BodyQueryNode {
  return queryNode(points, Array.from(points.keys()), leafSize);
}
