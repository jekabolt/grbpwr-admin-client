import {
  type BodyQueryNode,
  type BodyQueryPoint,
  captureBodyQueryPointsV1,
  partitionBodyQueriesV1,
} from './actual-body-query-partition-v1';
import {
  ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_LIMITS_V1 as limits,
  captureActualBodyTriangleGeometryV1,
  createActualBodyTriangleNearestIndexV1,
} from './actual-body-triangle-nearest-index-v1';

const maxQueries = 2_000;
const leafSize = 128;
const maxWorkBudget = 130_000_000;

/** Reuse the conservative nearest search on small query domains instead of one broad domain. */
export function queryActualBodyNearestBatchV1(
  input: Readonly<{
    bodyPositionsM: Float32Array;
    bodyTriangles: Uint32Array;
    pointsM: readonly BodyQueryPoint[];
    triangleTestBudget: number;
    workBudget: number;
  }>,
) {
  const { triangleTestBudget, workBudget } = input;
  const { positions: bodyPositionsM, triangles: bodyTriangles } =
    captureActualBodyTriangleGeometryV1(input.bodyPositionsM, input.bodyTriangles);
  const pointsM = captureBodyQueryPointsV1(
    input.pointsM,
    maxQueries,
    limits.maximumAbsoluteCoordinateM,
  );
  const bodyTriangleCount = bodyTriangles.length / 3;
  if (
    !Number.isSafeInteger(triangleTestBudget) ||
    triangleTestBudget < 1 ||
    !Number.isSafeInteger(workBudget) ||
    workBudget < bodyTriangleCount ||
    workBudget > maxWorkBudget
  )
    throw new RangeError('Body nearest batch is outside its supported coordinates or work budget.');

  const root = partitionBodyQueriesV1(pointsM, leafSize);
  type Nearest = ReturnType<ReturnType<typeof createActualBodyTriangleNearestIndexV1>['nearest']>;
  const nearest: Nearest[] = new Array(pointsM.length);
  let trianglePreparations = 0,
    nodeVisits = 0,
    triangleTests = 0,
    partitions = 0;
  const remainingWork = () => workBudget - trianglePreparations - nodeVisits - triangleTests;
  const visit = (group: BodyQueryNode) => {
    if (group.children.length) {
      group.children.forEach(visit);
      return;
    }
    if (remainingWork() < bodyTriangleCount)
      throw new RangeError('Body nearest batch work budget exhausted before index construction.');
    trianglePreparations += bodyTriangleCount;
    partitions++;
    const [x, y, z] = group.bounds;
    const index = createActualBodyTriangleNearestIndexV1(
      bodyPositionsM,
      bodyTriangles,
      [x[0], y[0], z[0]],
      [x[1], y[1], z[1]],
    );
    for (const i of group.pointIndices) {
      // Reserve the entire node traversal allowance before spending this query's leaf budget.
      const nodeLimit = Math.min(remainingWork(), index.nodeCount);
      const leafLimit = Math.min(
        bodyTriangleCount,
        remainingWork() - nodeLimit,
        triangleTestBudget - triangleTests,
      );
      const result = index.nearest(pointsM[i], nodeLimit, leafLimit);
      nearest[i] = result;
      nodeVisits += result.nodeVisits;
      triangleTests += result.triangleTests;
    }
  };
  visit(root);
  return { nearest, partitions, trianglePreparations, nodeVisits, triangleTests };
}
