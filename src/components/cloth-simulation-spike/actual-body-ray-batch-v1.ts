import {
  type BodyQueryBox as QueryBox,
  type BodyQueryInterval as Interval,
  type BodyQueryNode as QueryNode,
  type BodyQueryPoint as Vec,
  captureBodyQueryPointV1,
  captureBodyQueryPointsV1,
  partitionBodyQueriesV1,
} from './actual-body-query-partition-v1';
import {
  ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_LIMITS_V1 as bodyLimits,
  captureActualBodyTriangleGeometryV1,
} from './actual-body-triangle-nearest-index-v1';

type Ray = Readonly<{ direction: Vec; epsilon: number }>;
type TriangleRay = Readonly<{ a: Vec; e1: Vec; e2: Vec; h: Vec; inverse: number }>;

const maxQueries = 2_000;
const leafPointCount = 8;
const maxWork = 130_000_000;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function triangleRay(a: Vec, b: Vec, c: Vec, ray: Ray): TriangleRay | null {
  const e1 = subtract(b, a);
  const e2 = subtract(c, a);
  const h = cross(ray.direction, e2);
  const determinant = dot(e1, h);
  return Math.abs(determinant) <= ray.epsilon ? null : { a, e1, e2, h, inverse: 1 / determinant };
}

/** Match the V42 rounded evaluation order, including its near-edge ambiguous status. */
function testTriangle(q: Vec, d: TriangleRay, ray: Ray): 'miss' | 'hit' | 'ambiguous' {
  const s = subtract(q, d.a);
  const u = d.inverse * dot(s, d.h);
  const epsilon = ray.epsilon;
  if (u < -epsilon || u > 1 + epsilon) return 'miss';
  const crossQ = cross(s, d.e1);
  const v = d.inverse * dot(ray.direction, crossQ);
  if (v < -epsilon || u + v > 1 + epsilon) return 'miss';
  const t = d.inverse * dot(d.e2, crossQ);
  if (t <= epsilon) return 'miss';
  return u <= epsilon || v <= epsilon || 1 - u - v <= epsilon ? 'ambiguous' : 'hit';
}

function scale(a: Interval, k: number): Interval {
  return k >= 0 ? [a[0] * k, a[1] * k] : [a[1] * k, a[0] * k];
}

function minus(a: Interval, b: Interval): Interval {
  return [a[0] - b[1], a[1] - b[0]];
}

function intervalDot(a: QueryBox, b: Vec): Interval {
  const x = scale(a[0], b[0]);
  const y = scale(a[1], b[1]);
  const z = scale(a[2], b[2]);
  return [x[0] + y[0] + z[0], x[1] + y[1] + z[1]];
}

/** Enclose the machine values of V42's predicates over the entire query box. */
function mayIntersect(box: QueryBox, d: TriangleRay, ray: Ray): boolean {
  const relative = (axis: 0 | 1 | 2): Interval => [
    box[axis][0] - d.a[axis],
    box[axis][1] - d.a[axis],
  ];
  const s: QueryBox = [relative(0), relative(1), relative(2)];
  const u = scale(intervalDot(s, d.h), d.inverse);
  const epsilon = ray.epsilon;
  if (u[1] < -epsilon || u[0] > 1 + epsilon) return false;
  const crossQ: QueryBox = [
    minus(scale(s[1], d.e1[2]), scale(s[2], d.e1[1])),
    minus(scale(s[2], d.e1[0]), scale(s[0], d.e1[2])),
    minus(scale(s[0], d.e1[1]), scale(s[1], d.e1[0])),
  ];
  const v = scale(intervalDot(crossQ, ray.direction), d.inverse);
  if (v[1] < -epsilon || u[0] + v[0] > 1 + epsilon) return false;
  return scale(intervalDot(crossQ, d.e2), d.inverse)[1] > epsilon;
}

/** V42 ray parity for a batch, with interval rejection before the unchanged scalar predicates. */
export function queryActualBodyRayBatchV1(
  input: Readonly<{
    bodyPositionsM: Float32Array;
    bodyTriangles: Uint32Array;
    pointsM: readonly Vec[];
    direction: Vec;
    epsilonM: number;
    workBudget: number;
    triangleTestBudget?: number;
  }>,
) {
  const { epsilonM, workBudget, triangleTestBudget = workBudget } = input;
  const { positions: bodyPositionsM, triangles: bodyTriangles } =
    captureActualBodyTriangleGeometryV1(input.bodyPositionsM, input.bodyTriangles);
  const pointsM = captureBodyQueryPointsV1(
    input.pointsM,
    maxQueries,
    bodyLimits.maximumAbsoluteCoordinateM,
  );
  const direction = captureBodyQueryPointV1(input.direction, bodyLimits.maximumAbsoluteCoordinateM);
  const triangleCount = bodyTriangles.length / 3;
  if (
    Math.max(...direction.map(Math.abs)) < 1e-6 ||
    !Number.isFinite(epsilonM) ||
    epsilonM < 1e-8 ||
    epsilonM > 1 ||
    !Number.isSafeInteger(workBudget) ||
    workBudget < triangleCount ||
    workBudget > maxWork ||
    !Number.isSafeInteger(triangleTestBudget) ||
    triangleTestBudget < 0
  )
    throw new RangeError('Body ray batch is outside its supported coordinates or work budget.');

  const ray = { direction, epsilon: epsilonM };
  const root = partitionBodyQueriesV1(pointsM, leafPointCount);
  const states = new Uint8Array(pointsM.length);
  let intervalTests = 0,
    exactTests = 0;
  const charge = () => {
    if (triangleCount + intervalTests + exactTests > workBudget)
      throw new RangeError('Body ray batch work budget exhausted.');
  };
  const at = (i: number): Vec => {
    const offset = bodyTriangles[i] * 3;
    return [bodyPositionsM[offset], bodyPositionsM[offset + 1], bodyPositionsM[offset + 2]];
  };
  const visit = (node: QueryNode, d: TriangleRay) => {
    intervalTests++;
    charge();
    if (!mayIntersect(node.bounds, d, ray)) return;
    for (const child of node.children) visit(child, d);
    for (const i of node.pointIndices) {
      if (states[i] === 2) continue;
      if (exactTests >= triangleTestBudget)
        throw new RangeError('Body ray triangle-test budget exhausted.');
      exactTests++;
      charge();
      const result = testTriangle(pointsM[i], d, ray);
      if (result === 'ambiguous') states[i] = 2;
      else if (result === 'hit') states[i] ^= 1;
    }
  };
  for (let i = 0; i < bodyTriangles.length; i += 3) {
    const d = triangleRay(at(i), at(i + 1), at(i + 2), ray);
    if (d) visit(root, d);
  }
  return {
    parity: Array.from(states, (state) => (state === 2 ? null : state === 1)),
    trianglePreparations: triangleCount,
    intervalTests,
    exactTests,
  };
}
